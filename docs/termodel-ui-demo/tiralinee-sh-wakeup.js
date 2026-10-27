/* Tiralinee SH cold-start guard.
 * Interpreting a phrase is read-only. Retry only explicitly reported SH
 * unavailability; never retry executed Gateway actions, authorization errors
 * or SOS assistance requests. Never label an outage as linguistic FAULT.
 */
(function(root){
  'use strict';
  const WAIT_MS=60000;
  const RETRY_MS=4000;
  function transient(data){
    return data?.esito==='ERROR' &&
      (data.error==='sh_unavailable' || data.error==='sh_timeout');
  }
  function aborted(){
    const e=new Error('Attesa interrotta');
    e.name='AbortError';return e;
  }
  function sleep(ms,signal){
    return new Promise((resolve,reject)=>{
      if(signal.aborted){reject(aborted());return;}
      let timer;
      const stop=()=>{
        clearTimeout(timer);
        signal.removeEventListener('abort',stop);
        reject(aborted());
      };
      timer=setTimeout(()=>{
        signal.removeEventListener('abort',stop);
        resolve();
      },ms);
      signal.addEventListener('abort',stop,{once:true});
    });
  }
  async function wait({request,container,addMessage,signal}){
    if(typeof request!=='function'||!container||
       typeof addMessage!=='function')throw Error('Controllo SH non configurato');
    const controller=new AbortController();
    let choicePromise=null,choose=null,buttons=null,prompt=null;
    let timer=null,stopped=false,renounced=false;
    const removePrompt=()=>{
      if(buttons){buttons.remove();buttons=null;}
      if(prompt){prompt.remove();prompt=null;}
    };
    const cancel=()=>controller.abort();
    if(signal?.aborted)throw aborted();
    signal?.addEventListener('abort',cancel,{once:true});
    function schedulePrompt(){
      clearTimeout(timer);
      timer=setTimeout(()=>{
        if(stopped||controller.signal.aborted||choicePromise)return;
        prompt=addMessage('assistant',
          'Il server sembra non rispondere. Vuoi continuare ad attendere?',
          'SH · risveglio');
        buttons=document.createElement('div');
        buttons.className='sos-guided-options';
        buttons.setAttribute('role','group');
        buttons.setAttribute('aria-label','Attesa del server SH');
        const continuing=document.createElement('button');
        continuing.type='button';
        continuing.className='sos-guided-choice';
        continuing.textContent='Continua attesa';
        const givingUp=document.createElement('button');
        givingUp.type='button';
        givingUp.className='sos-guided-back';
        givingUp.textContent='Rinuncia';
        choicePromise=new Promise(resolve=>{choose=resolve;});
        continuing.addEventListener('click',()=>{
          if(stopped||!choicePromise)return;
          const decision=choose;
          removePrompt();
          choicePromise=null;choose=null;
          decision('continue');
          schedulePrompt(); // Another minute only if still unresponsive.
        },{once:true});
        givingUp.addEventListener('click',()=>{
          if(stopped||!choicePromise)return;
          renounced=true;
          const decision=choose;
          removePrompt();
          choicePromise=null;choose=null;
          decision('fallback');
          controller.abort(); // Cancels current read-only SH interpretation.
        },{once:true});
        buttons.append(continuing,givingUp);
        container.appendChild(buttons);
        container.scrollTop=container.scrollHeight;
      },WAIT_MS);
    }
    schedulePrompt();
    try{
      while(!controller.signal.aborted){
        const response=await request(controller.signal);
        if(renounced)return {kind:'fallback',reason:'user_renounced'};
        if(!transient(response))return {kind:'result',data:response};
        // A 503 is a possible cold start, NOT a FAULT. After one minute
        // the user decides whether more retries are acceptable.
        if(choicePromise)await choicePromise;
        if(renounced)return {kind:'fallback',reason:'user_renounced'};
        await sleep(RETRY_MS,controller.signal);
      }
      throw aborted();
    }catch(error){
      if(renounced)return {kind:'fallback',reason:'user_renounced'};
      throw error;
    }finally{
      stopped=true;
      clearTimeout(timer);
      removePrompt();
      signal?.removeEventListener('abort',cancel);
      if(!controller.signal.aborted)controller.abort();
    }
  }
  root.TiralineeShWakeup=Object.freeze({wait});
})(window);
