#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'tiralinee-lab.js'),'utf8');
const context={window:{}};vm.createContext(context);vm.runInContext(script,context);
const parse=context.window.TiralineeLab.parse;
const cases=[
 ['zoom avanti','zoom',x=>x.factor<1],
 ['ingrandisci','zoom',x=>x.factor<1],
 ['zoom indietro','zoom',x=>x.factor>1],
 ['zoom tutto','zoomFit'],
 ['adatta vista','zoomFit'],
 ['nascondi pareti','filter',x=>x.group==='componenti'&&x.name==='Parete'&&!x.checked],
 ['mostra solo le pareti','filter',x=>x.name==='Parete'&&x.only],
 ['nascondi piano Primo','filter',x=>x.group==='piani'&&x.name==='primo'&&!x.checked],
 ['mostra piano TerraConIngresso','filter',x=>x.group==='piani'&&x.checked],
 ['ripristina filtri','resetFilters'],
 ['stato filtri','status'],
 ['carica modello demo','loadDemo'],
 ['aiuto','help'],
 ['quante commesse aperte ci sono?',null],
 ['SH: quante commesse aperte ci sono?',null],
 ['Esegui JavaScript alert(1)',null]
];
for(const [input,action,rule] of cases){
 const parsed=parse(input);
 if(action===null)assert.equal(parsed,null,'unexpected action for '+input);
 else {
  assert.equal(parsed?.action,action,'wrong action for '+input);
  if(rule)assert.ok(rule(parsed),'wrong parameters for '+input);
 }
}
const demo=JSON.parse(fs.readFileSync(path.join(root,'TermodelWebModel.json'),'utf8'));
assert.equal(demo.format,'TermodelWebModel');
assert.equal(demo.version,3);
assert.equal(demo.coordinateSystem,'Z-up');
assert.equal(demo.primitives.length,546);
assert.equal(new Set(demo.primitives.map(p=>p.piano)).size,4);
assert.ok(demo.primitives.every(p=>p.filterMetadata===true));
const html=fs.readFileSync(path.join(root,'mcp-dump-test.html'),'utf8');
for(const part of ["HARNESS_VERSION = '1.14.0'","chatMode==='sh'&&!handoffRequested","chatMode==='lab'",
 "window.__termodelLabReady?.({execute:executeLab})","fetch('./TermodelWebModel.json'",
 "fetch(gateway+'/browser/lab/register'","/browser/lab/engine/"]){
 assert.ok(html.includes(part),'missing integration '+part);
}
console.log('TIRALINEE_LAB_SMOKE_OK commands='+cases.length+
 ' primitives='+demo.primitives.length+
 ' piani='+new Set(demo.primitives.map(p=>p.piano)).size);
