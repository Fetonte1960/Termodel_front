/* FastPharmaSOS guided dialogue in the SAME chat as SH free text.
 * Node questions, answers, options and allowed intent IDs are loaded LIVE
 * from Neon through the single authenticated MCP Gateway.
 * No compiled/static tree is used for production dialogue steps.
 */
(function(root){
  'use strict';
  function create(config){
    const {container,read,execute,act,addMessage,available,onNoAction,onNavigate,onRequestAssistance,onReviewRequests,onRoomSelected,onOpeningSelected}=config;
    const route=[];
    const mainTree='farmacia_test_v1', infoTree='farmacia_info_v1';
    let currentTree=mainTree;
    let busy=false,currentButtons=null,active=true,pendingFallback=false;
    function button(label,click,cls){
      const el=document.createElement('button');
      el.type='button';
      el.className=cls||'sos-guided-choice';
      el.textContent=String(label);
      el.addEventListener('click',click);
      return el;
    }
    function showOptions(choices,nodeId,nodeAllowsIntake=true){
      if(currentButtons)currentButtons.remove();
      const choicesRow=document.createElement('div');
      choicesRow.className='sos-guided-options';
      choicesRow.setAttribute('role','group');
      choicesRow.setAttribute('aria-label','Risposte guidate SOS');
      for(const child of choices){
        if(typeof child?.id!=='string'||typeof child?.label!=='string')continue;
        const choice=button(child.label,()=>{void open(child.id,child.label);});
        choicesRow.appendChild(choice);
      }
      // Permanent navigation action, available from the initial menu and
      // EVERY descendant. Do not replace the tree: the user can keep answering.
      if(currentTree===mainTree && typeof onReviewRequests==='function'){
        const review=button('Esaminare richieste di assistenza in corso',async()=>{
          if(busy||!active||review.disabled)return;
          review.disabled=true;
          try{await onReviewRequests();}
          finally{if(active)review.disabled=false;}
        },'sos-guided-review');
        choicesRow.appendChild(review);
      }
      // The root is already the initial menu: no nonsensical "back" button.
      // After at least one CONFIRMED response, always offer intake, including
      // on nonterminal nodes with further choices. Never register on navigation.
      if(currentTree===mainTree && route.some(step=>step.answer) && nodeAllowsIntake && typeof onRequestAssistance==='function'){
        const request=button('Attiva una richiesta di assistenza con i dati raccolti',async()=>{
          if(busy||!active)return;
          request.disabled=true;
          try{
            await onRequestAssistance({
              treeId:'farmacia_test_v1',
              categoryNodeId:route.find(step=>step.answer)?.id,
              steps:route.filter(step=>step.answer).map(step=>({
                id:step.id,answer:step.answer,question:step.question
              }))
            });
          }finally{if(active)request.disabled=false;}
        },'sos-guided-request');
        choicesRow.appendChild(request);
      }
      if(currentTree===infoTree){
        // Always the LAST choice, including at the information root and result pages.
        choicesRow.appendChild(button('Torna al menu principale',()=>{
          currentTree=mainTree;
          void open('inizio','Torna al menu principale');
        },'sos-guided-back'));
      }else if(nodeId!=='inizio'){
        const back=button('Torna al menu iniziale',()=>{
          void open('inizio','Torna al menu iniziale');
        },'sos-guided-back');
        back.title='Torna al menu iniziale, aggiornandolo da Neon';
        choicesRow.appendChild(back);
      }
      container.appendChild(choicesRow);
      currentButtons=choicesRow;
      container.scrollTop=container.scrollHeight;
    }
    async function open(id,label='',first=false){
      if(!active||busy||!available())return;
      busy=true;
      if(currentButtons){
        for(const el of currentButtons.querySelectorAll('button'))el.disabled=true;
      }
      if(!first){
        if(typeof onNavigate==='function')onNavigate();
        addMessage('user',label,'Percorso guidato SOS');
      }
      const pending=addMessage('assistant','Consulto il percorso guidato…');
      try{
        const data=await read(id,currentTree);
        if(!data||typeof data.node?.id!=='string'||
           data.treeId!==currentTree || !Array.isArray(data.choices))
          throw Error('Risposta del dialogatore non valida');
        pending.remove();
        const body=String(data.node.message||'').trim();
        // The route contains only replies explicitly selected by the user.
        // Reset the old branch when returning to the root; never fabricate data.
        if(data.node.id==='inizio'){
          route.length=0;
          route.push({id:'inizio',question:body||data.node.label||'',answer:null});
        }else{
          const question=route[route.length-1]?.nextQuestion||route[route.length-1]?.question||'Quale problema hai?';
          const previousIndex=route.findIndex(x=>x.id===data.node.id);
          if(previousIndex>=0)route.splice(previousIndex);
          route.push({id:data.node.id,question,answer:label||data.node.label});
          // The message displayed at this branch can become the next question.
          // It is NOT a confirmed user answer.
          route[route.length-1].nextQuestion=body;
        }
        if(body)addMessage('assistant',body,'Percorso guidato · Neon');
        if(data.node.roomSelection===true && typeof onRoomSelected==='function'){
          try{
            const result=await onRoomSelected(data.node);
            if(result?.message)addMessage('assistant',result.message,
              'Localizzazione nel modello 3D');
          }catch(error){
            addMessage('assistant','Locale registrato nel percorso guidato, ma non evidenziato nel 3D: '+
              String(error?.message||error),'Visualizzazione 3D');
          }
        }
        let displayChoices=data.choices;
        let allowIntake=data.node.canRequestAssistance!==false;
        if(data.node.openingSelection && typeof onOpeningSelected==='function'){
          try{const result=await onOpeningSelected(data.node);
            if(result?.message)addMessage('assistant',result.message,'Infisso evidenziato');}
          catch(error){
            addMessage('assistant','Evidenziazione non verificata: '+String(error?.message||error),
              'Verifica grafica');
            displayChoices=data.choices.filter(x=>!x.id.startsWith('sos.fin.yes.'));
            allowIntake=false;
          }
        }
        if(data.node.canExecute){
          const response=await execute(data.node.id,currentTree);
          const result=await act(response);
          addMessage('assistant',result.message||'Operazione completata.',
            result.source||'Tiralinee / SOS');
        }
        const terminal=!data.node.canExecute&&displayChoices.length===0&&data.node.id!=='inizio' && data.node.roomSelection!==true && data.node.openingSelection!==true;
        if(currentTree===mainTree && terminal&&typeof onNoAction==='function'){
          // Offer an expert, but do not open an external chat or issue a ticket.
          // Only confirmed path choices are forwarded, not provisional notes.
          onNoAction({
            treeId:String(data.treeId||'').slice(0,60),
            currentNodeId:data.node.id,
            steps:route.filter(x=>x.answer).map(x=>({
              question:String(x.question||'').slice(0,250),
              answer:String(x.answer||'').slice(0,250)
            })),
            unresolved:true,
            actionExecuted:false
          });
        }
        showOptions(displayChoices,data.node.id,allowIntake);
      }catch(error){
        pending.remove();
        addMessage('assistant','Il percorso guidato non è disponibile: '+
          String(error?.message||error)+'. Puoi comunque scrivere la tua richiesta.',
          'Dialogatore SOS');
        if(currentButtons){
          for(const el of currentButtons.querySelectorAll('button'))el.disabled=false;
        }
      }finally{
        busy=false;
        if(pendingFallback&&active){
          pendingFallback=false;
          currentTree=infoTree;
          void open('inizio','',true);
        }
      }
    }
    return Object.freeze({
      start:()=>{currentTree=mainTree;return open('inizio','',true);},
      startFallback:()=>{
        if(!active)return Promise.resolve(false);
        if(busy){pendingFallback=true;return Promise.resolve(true);}
        currentTree=infoTree;
        return open('inizio','',true);
      },
      stop:()=>{active=false;if(currentButtons)currentButtons.remove();}
    });
  }
  root.SosGuidedChat=Object.freeze({create});
})(window);
