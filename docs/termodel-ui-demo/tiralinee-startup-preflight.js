/* FastPharmaSOS / Tiralinee — startup checks of already existing services.
 * Only authenticated Gateway routes are probed. Never sends chat text, creates
 * SOS tickets, spends AI credit or calls arbitrary user-provided endpoints.
 */
(function(root){
 'use strict';
 const PROMPT_MS=60000,RETRY_MS=4500;
 const REQUIRED=['gateway','neon'];
 const IDs=['gateway','neon','sh','sos'];
 function stopped(){
   const error=new Error('Verifica servizi interrotta');
   error.name='AbortError';return error;
 }
 function sleep(ms,signal){
   return new Promise((resolve,reject)=>{
     if(signal.aborted){reject(stopped());return;}
     const done=()=>{clearTimeout(t);signal.removeEventListener('abort',cancel);resolve();};
     const cancel=()=>{clearTimeout(t);signal.removeEventListener('abort',cancel);reject(stopped());};
     const t=setTimeout(done,ms);
     signal.addEventListener('abort',cancel,{once:true});
   });
 }
 async function run({probe,container,signal,onStatus}){
   if(typeof probe!=='function'||!container)
     throw Error('Preavvio non configurato');
   const controller=new AbortController();
   const abort=()=>{controller.abort();if(choose)choose('aborted');};
   if(signal?.aborted)throw stopped();
   signal?.addEventListener('abort',abort,{once:true});
   let last=null,choice=null,choose=null,decision=null,timeout=null,ended=false;
   let renounced=false;
   const panel=document.createElement('div');
   panel.className='sh-message sh-assistant';
   const bubble=document.createElement('div');
   bubble.className='sh-bubble';
   const headline=document.createElement('div');
   headline.textContent='Verifico e riattivo i servizi della farmacia…';
   const list=document.createElement('div');
   list.style.whiteSpace='pre-line';
   list.style.marginTop='8px';
   const actions=document.createElement('div');
   actions.className='sos-guided-options';
   panel.appendChild(bubble);
   bubble.append(headline,list);
   container.append(panel,actions);
   container.scrollTop=container.scrollHeight;
   const display=services=>{
     const m=new Map(services.map(x=>[x.id,x]));
     list.textContent=IDs.map(id=>{
       const s=m.get(id);
       return (s?.status==='ready'?'✓ ':'… ')+
         (s?.label||id)+(s?.status==='ready'?' · pronto':' · attendo risposta');
     }).join('\n');
     if(typeof onStatus==='function')onStatus(services);
   };
   const prompt=()=>{
     if(ended||controller.signal.aborted||choice)return;
     headline.textContent='Il server sembra non rispondere. Vuoi continuare ad attendere?';
     actions.replaceChildren();
     const make=(label,cls,fn)=>{
       const button=document.createElement('button');
       button.type='button';button.className=cls;button.textContent=label;
       button.addEventListener('click',fn,{once:true});
       actions.append(button);
     };
     decision=new Promise(resolve=>{choose=resolve;});
     choice=true;
     make('Continua attesa','sos-guided-choice',()=>{
       if(ended||!choice)return;
       const accept=choose;
       choose=null;choice=null;actions.replaceChildren();
       headline.textContent='Continuo a verificare i servizi…';
       accept('continue');
       schedulePrompt();
     });
     make('Rinuncia','sos-guided-back',()=>{
       if(ended||!choice)return;
       const accept=choose;
       renounced=true;
       choose=null;choice=null;
       accept('renounce');
       // Abort the in-flight probe but retain the last verified status.
       controller.abort();
     });
   };
   const schedulePrompt=()=>{
     clearTimeout(timeout);
     timeout=setTimeout(prompt,PROMPT_MS);
   };
   schedulePrompt();
   try{
     while(!controller.signal.aborted){
       try{
         const response=await probe(controller.signal);
         if(!response||response.schemaVersion!==1 ||
            !Array.isArray(response.services) ||
            !IDs.every(id=>response.services.some(s=>s.id===id &&
             (s.status==='ready'||s.status==='waiting'))))
           throw Error('Risposta diagnostica del Gateway non valida');
         last=response.services;
         display(last);
         if(response.complete===true){
           return {kind:'ready',services:last};
         }
       }catch(error){
         if(controller.signal.aborted)throw error;
         if(/HTTP 401|HTTP 403|HTTP 410|HTTP 429/.test(String(error?.message||'')))
           throw error;
         // An unreachable Gateway is not a linguistic FAULT.
         last=last||IDs.map(id=>({id,label:id,status:'waiting'}));
         display(last);
       }
       if(choice && decision){
         const answer=await decision;
         if(answer==='renounce')break;
       }
       await sleep(RETRY_MS,controller.signal);
     }
     if(!controller.signal.aborted)throw stopped();
     const core=last && REQUIRED.every(id=>
       last.some(s=>s.id===id&&s.status==='ready'));
     return {kind:core?'degraded':'blocked',services:last||[]};
   }catch(error){
     if(renounced){
       const core=last&&REQUIRED.every(id=>last.some(s=>s.id===id&&s.status==='ready'));
       return {kind:core?'degraded':'blocked',services:last||[]};
     }
     throw error;
   }finally{
     ended=true;clearTimeout(timeout);
     signal?.removeEventListener('abort',abort);
     controller.abort();
     panel.remove();actions.remove();
   }
 }
 root.TiralineeStartupPreflight=Object.freeze({run});
})(window);
