/* Tiralinee Gateway wake/retry — only for idempotent readiness and read calls.
 * Render Free can be asleep. Never retry authorization failures or invalid models.
 * No persistent tokens, browser storage, worker, or background polling.
 */
(function (root) {
  'use strict';
  const DEFAULT_BACKOFF_MS = Object.freeze([0,2500,4500,7500,11000,16000]);
  const TRANSIENT = new Set([408,425,500,502,503,504,521,522,524]);
  const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
  async function request(url, init, opts) {
    const config=opts||{};
    const backoff=config.backoffMs||DEFAULT_BACKOFF_MS;
    const timeoutMs=config.timeoutMs||35000;
    const call=config.fetcher||root.fetch.bind(root);
    const wait=config.pause||pause;
    const onAttempt=config.onAttempt||(()=>{});
    const onRetry=config.onRetry||(()=>{});
    let lastResponse=null,lastError=null;
    if(!Array.isArray(backoff)||backoff.length<1||backoff.length>12)
      throw Error('Retry Gateway configurato male.');
    for(let index=0;index<backoff.length;index++){
      if(index)await wait(backoff[index]);
      onAttempt(index+1,backoff.length);
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort('gateway_attempt_timeout'),timeoutMs);
      try{
        // "init" is reused without a request body: only GET readiness/model
        // and the explicitly idempotent synthetic lab registration are allowed.
        lastResponse=await call(url,{...init,signal:controller.signal});
        lastError=null;
        if(lastResponse.ok||!TRANSIENT.has(lastResponse.status))
          return lastResponse;
        if(index===backoff.length-1)return lastResponse;
        onRetry({attempt:index+1,total:backoff.length,status:lastResponse.status});
      }catch(error){
        lastError=error;
        if(index===backoff.length-1)break;
        onRetry({attempt:index+1,total:backoff.length,error:String(error?.message||error)});
      }finally{clearTimeout(timeout);}
    }
    throw Error('Gateway MCP non raggiungibile dopo '+backoff.length+
      ' tentativi. '+(lastError?.message||'Controllare la connessione.'));
  }
  root.TiralineeGatewayRetry=Object.freeze({request,DEFAULT_BACKOFF_MS});
})(window);
