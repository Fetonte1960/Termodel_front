#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const folder=path.resolve(__dirname,'..');
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.events={};this.disabled=false;this.parent=null;
    this.scrollTop=0;this.scrollHeight=100;this.className='';this.textContent='';}
  appendChild(child){this.children.push(child);child.parent=this;return child;}
  addEventListener(name,callback){this.events[name]=callback;}
  setAttribute(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag?[child]:[]),...child.querySelectorAll(tag)]);}
  click(){if(this.events.click&&!this.disabled)this.events.click();}
}
const window={};const document={createElement:tag=>new Element(tag)};
vm.runInNewContext(fs.readFileSync(path.join(folder,'tiralinee-guided-chat.js'),'utf8'),{window,document});
assert.equal(typeof window.SosGuidedChat.create,'function');
const history=new Element('section');let queried=[],executed=[],rendered=[];
const tree={
 inizio:{node:{id:'inizio',message:'Come posso aiutarti?',canExecute:false},choices:[
   {id:'modello',label:'Modello 3D'},{id:'filtri',label:'Filtri'}
 ]},
 filtri:{node:{id:'filtri',message:'Scegli un filtro.',canExecute:false},choices:[
   {id:'filtri.nascondi',label:'Nascondi pareti'}
 ]},
 'filtri.nascondi':{node:{id:'filtri.nascondi',message:'Nascondo le pareti.',canExecute:true},
  choices:[]}
};
const config={
 container:history,available:()=>true,
 read:async id=>{queried.push(id);return tree[id];},
 execute:async id=>{executed.push(id);return{esito:'SUCCESS',destination:'LOCAL_VIEWER',
  command:{action:'filter',checkedState:false}};},
 act:async action=>{rendered.push(action);return{message:'Pareti nascoste',source:'Viewer'};},
 addMessage:(role,text)=>{const row=new Element('p');row.textContent=role+':'+text;history.appendChild(row);return row;}
};
const dialogue=window.SosGuidedChat.create(config);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 await dialogue.start();
 assert.deepEqual(queried,['inizio']);
 const findButton=text=>history.querySelectorAll('button').find(x=>x.textContent===text&&!x.disabled);
 assert.ok(findButton('Filtri'));
 findButton('Filtri').click();await flush();
 assert.deepEqual(queried,['inizio','filtri']);
 assert.ok(findButton('Nascondi pareti'));
 findButton('Nascondi pareti').click();await flush();
 assert.deepEqual(executed,['filtri.nascondi']);
 assert.equal(rendered[0].command.action,'filter');
 assert.ok(history.children.some(c=>c.textContent==='assistant: Pareti nascoste'));
 assert.ok(findButton('Torna alle domande iniziali'));
 findButton('Torna alle domande iniziali').click();await flush();
 assert.deepEqual(queried,['inizio','filtri','filtri.nascondi','inizio']);
 dialogue.stop();
 assert.equal(history.querySelectorAll('button').length,0);
 console.log('SOS_NEON_CHAT_UI_SMOKE_OK root -> filter -> action -> back -> stop');
})().catch(error=>{console.error(error);process.exitCode=1;});
