#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function loadScript(file,extra={}){
  const window={...extra};
  const context={window,AbortController,setTimeout,clearTimeout,
    ...(extra.context||{})};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return window;
}
const expert=loadScript('tiralinee-expert-handoff.js').TiralineeExpertHandoff;
assert.equal(expert.QUESTION,
 'Non riesco ad intepretare la tua richiesta, vuoi che passi la conversazione ad un modello ai esperto ?');
assert.equal(expert.isUnrecognized({esito:'FAULT'}),true);
assert.equal(expert.isUnrecognized({esito:'FAULT',reason:'sos_session_required'}),false);
assert.equal(expert.isUnrecognized({esito:'ERROR',error:'sh_unavailable'}),false);
assert.equal(expert.isUnrecognized({esito:'SUCCESS'}),false);
const standalone=expert.buildPrompt({paired:false,
 lastRequest:'Nascondi il quadro elettrico',history:[
   {role:'user',text:'Nascondi il quadro elettrico'},
   {role:'assistant',text:'Risposta non riconosciuta'}
 ]});
assert.ok(standalone.includes('https://www.termodel.it/ai/'));
assert.ok(standalone.includes('SOS-TEST-001'));
assert.ok(standalone.includes('Non è stata aperta una sessione assistenza SOS'));
assert.ok(standalone.includes('Nascondi il quadro elettrico'));
assert.ok(!standalone.includes('sessione MCP browser:'));
const shell='FastPharma SOS - sessione MCP browser: 0123456789abcdef\nNuova assistenza';
const paired=expert.buildPrompt({paired:true,shellBootstrap:shell,
 lastRequest:'visualizza interruttore',history:[{role:'user',text:'visualizza interruttore'}]});
assert.ok(paired.startsWith(shell));
assert.ok(paired.includes('Nuova assistenza'));
assert.ok(paired.includes('visualizza interruttore'));
const tooLong=expert.buildPrompt({paired:true,shellBootstrap:'x'.repeat(8000),
 lastRequest:'prova'});
assert.ok(!tooLong.includes('x'.repeat(8000)));
const guided=expert.buildPrompt({paired:true,shellBootstrap:shell,
 guided:{unresolved:true,actionExecuted:false,steps:[
  {question:'Che tipo di disservizio hai?',answer:'Nella rete idrica'}
 ]},lastRequest:'Nella rete idrica'});
assert.ok(guided.startsWith(shell));
assert.ok(guided.includes('Che tipo di disservizio hai?'));
assert.ok(guided.includes('Nella rete idrica'));
assert.ok(guided.includes('NON ripetere le domande già poste'));
assert.ok(guided.includes('Non dichiarare una richiesta di intervento aperta'));
assert.ok(!guided.includes('perché il motore SH non ha interpretato la richiesta'));
const unknown=expert.buildPrompt({paired:false,guided:{
 unresolved:true,steps:[{question:'Che tipo di disservizio hai?',answer:'Rete elettrica'}]
}});
assert.ok(unknown.includes('Rete elettrica'));
assert.ok(unknown.includes('Non è stata aperta una sessione assistenza SOS'));
const html=fs.readFileSync(path.join(root,'mcp-dump-test.html'),'utf8');
assert.ok(html.includes("HARNESS_VERSION = '1.16.1'"));
assert.ok(html.includes('offerExpertChat(input)'));
assert.ok(html.includes("expertChatLaunched=true"));
assert.ok(html.includes("chatPane.hidden=true"));
assert.ok(html.includes("tab.opener=null"));
assert.ok(html.includes("window.open('https://chatgpt.com/?q='"));
assert.ok(html.includes("window.TiralineeExpertHandoff?.isUnrecognized(interpreted)"));
assert.ok(html.includes('trustedSosExpertBootstrap=data.expertBootstrap'));
console.log('EXPERT_HANDOFF_SMOKE_OK cases=11');
(async()=>{
 const retry=loadScript('tiralinee-gateway-retry.js').TiralineeGatewayRetry;
 let index=0,observed=[],sleeps=[];
 const response=await retry.request('https://example.test/health',
   {method:'GET'},{
     backoffMs:[0,0,0],timeoutMs:100,
     fetcher:async()=>{index++;return {ok:index===3,status:index===3?200:503};},
     pause:async ms=>sleeps.push(ms),
     onAttempt:(a,n)=>observed.push(a+'/'+n)
   });
 assert.equal(response.status,200);assert.equal(index,3);
 assert.equal(sleeps.length,2);assert.equal(observed.join(','),'1/3,2/3,3/3');
 let forbidden=0;
 const auth=await retry.request('https://example.test/model',
   {method:'GET'},{
     backoffMs:[0,0,0],timeoutMs:100,
     fetcher:async()=>{forbidden++;return {ok:false,status:401};},
     pause:async()=>{}
   });
 assert.equal(auth.status,401);assert.equal(forbidden,1);
 let missing=0;
 const notFound=await retry.request('https://example.test/model',
   {method:'GET'},{
     backoffMs:[0,0,0],timeoutMs:100,
     fetcher:async()=>{missing++;return {ok:false,status:404};},
     pause:async()=>{}
   });
 assert.equal(notFound.status,404);assert.equal(missing,1);
 console.log('GATEWAY_WAKE_RETRY_SMOKE_OK cases=3');
})().catch(e=>{console.error(e);process.exitCode=1;});
