#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'mcp-dump-test.html'),'utf8');
const classicStart=html.indexOf('<script>',html.indexOf('tiralinee-guided-chat.js'));
const classicEnd=html.indexOf('</script>',classicStart);
assert.ok(classicStart>0&&classicEnd>classicStart,'script classico non trovato');
new Function(html.slice(classicStart+8,classicEnd));

for(const marker of [
  "HARNESS_VERSION = '1.20.2'",
  '/browser/lab/viewer/events/',
  '/browser/lab/viewer/reply/',
  "message.action==='focusRoom'",
  'renderFocusRoom(message)',
  'loaded3DRevision!==message.topologyRevision',
  "status='rendered'",
  'await ensureLabViewer()'
])assert.ok(html.includes(marker),'integrazione mancante: '+marker);
assert.ok(!html.includes('/browser/lab/viewer/events/?token='),
  'il bearer non deve comparire nella query string');

const focusStart=html.indexOf('function renderFocusRoom(message){');
const focusEnd=html.indexOf('// Funzione realizzata da Codex in autonomia',focusStart+20);
assert.ok(focusStart>0&&focusEnd>focusStart,'renderFocusRoom non trovata');
const focusSource=html.slice(focusStart,focusEnd);
let highlighted=0;
const state={textContent:''};
const context={
  loaded3DRevision:'revision-test',loaded3DImportId:'import-test',
  window:{__termodelHighlightRoom:payload=>{
    highlighted++;
    assert.equal(payload.roomId,'locale_6');
    assert.deepEqual(payload.wallSourceIds,['P3D-W0001','P3D-W0002']);
    return {wallCount:2,primitiveCount:4};
  }},
  document:{getElementById:()=>state},payload:{
    roomId:'locale_6',topologyRevision:'revision-test',
    wallSourceIds:['P3D-W0001','P3D-W0002']
  }
};
vm.createContext(context);
vm.runInContext(focusSource+'\nresult=renderFocusRoom(payload);',context);
assert.equal(highlighted,1);
assert.match(context.result,/locale_6 evidenziato/);
assert.match(state.textContent,/2 pareti, 4 primitive/);
assert.throws(()=>vm.runInContext(
  "renderFocusRoom({...payload,topologyRevision:'altra-revisione'})",context),
  /Revisione topologica diversa/);
assert.equal(highlighted,1,'una revisione errata non deve modificare la grafica');

console.log('TIRALINEE_GPT_VIEWER_SMOKE_OK syntax + revision gate + focusRoom render ACK');
