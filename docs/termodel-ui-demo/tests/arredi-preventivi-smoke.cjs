/* Pure M8/M9 contract smoke; no DB credentials or live app required. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const bill=require('../arredi-distinta.js');
const attach=require('../arredi-attachment.js');
globalThis.TiralineeArrediDistinta=bill;
const projectRevision='ec5cc32aa395efc3c84b5852f46f823296629d256d9943789168656eb1dc5320';
const importId='396c0403-60bc-418f-8949-74346ddf74e7';
const savedVersion='f48d15866cc34d01b59b6cb57e2bad9f';
const table='844c8e8b-ef8d-431b-bfae-b1584e117a2a';
const armadio='5297b4bf-7244-4dfa-a0e8-daafd74537ad';
const catalog=[
  {id:table,code:'DEMO-TAV-180',name:'Tavolo DEMO'},
  {id:armadio,code:'DEMO-ARM-120',name:'Armadio DEMO'}
];
const item=(id,catalogId)=>({id,catalogId,name:'Arredo DEMO',description:'',
  x:200,y:300,angle:0,widthCm:120,depthCm:60});
const layout={
 format:'TERMODEL-ARREDI-LAYOUT-V1',version:1,units:'cm',
 importId,projectRevision,floorName:'Unico',
 items:[item('AR-1',table),item('AR-2',table),item('AR-3',armadio)]
};
const lot=bill.normalize(layout,catalog,{layoutRevision:savedVersion});
assert.equal(lot.state,'NON_DEPOSITATO');
assert.equal(lot.sourceSystem,'MCP_Arredi');
assert.equal(lot.lines.length,3);
assert.deepEqual(lot.lines.map(x=>x.quantity),[1,1,1]);
assert.deepEqual(lot.lines.map(x=>x.unit),['cad','cad','cad']);
assert.equal(new Set(lot.lines.map(x=>x.sourceLineId)).size,3);
assert.equal(lot.lines.filter(x=>x.workCode==='ARREDI:DEMO-TAV-180').length,2);
assert.equal(lot.lines.filter(x=>x.workCode==='ARREDI:DEMO-ARM-120').length,1);
assert.equal(lot.summary.length,2);
assert.deepEqual(lot.summary.map(x=>x.quantity),[1,2]);
assert.equal(lot.lines.reduce((s,x)=>s+x.quantity,0),3,'summary is NOT extra lines');
assert.equal(bill.normalize(layout,catalog,{layoutRevision:savedVersion}).sourceRevision,lot.sourceRevision,'idempotent identity');
assert.notEqual(bill.normalize(layout,catalog,{layoutRevision:'00000000000000000000000000000000'}).sourceRevision,lot.sourceRevision);
assert.throws(()=>bill.normalize({...layout,items:[layout.items[0],layout.items[0]]},
  catalog,{layoutRevision:savedVersion}),/duplicato/);
assert.throws(()=>bill.normalize({...layout,items:[item('AR-1','unknown')]},
  catalog,{layoutRevision:savedVersion}),/Articolo non disponibile/);
assert.equal(bill.sameConfirmedItems(layout,structuredClone(layout)),true);
const changed=structuredClone(layout);changed.items[0].x+=20;
assert.equal(bill.sameConfirmedItems(layout,changed),false);
const scene={count:3,busy:false,lastUpdated:7,planKey:'test-plan',
  importId,projectRevision};
const now={ready:true,editRevision:7,planKey:'test-plan'};
const context={importId,projectRevision,floorName:'Unico'};
const saved={layout,version:savedVersion};
assert.equal(attach.matching({scene,now,context,saved,local:structuredClone(layout)}),true);
assert.equal(attach.matching({scene,now:{...now,editRevision:8},context,saved,local:layout}),false);
assert.equal(attach.matching({scene,now,context,saved,local:changed}),false);
assert.equal(attach.matching({scene,now,context:{...context,importId:'changed'},saved,local:layout}),false);
const manifest=attach.draft({context,layoutRevision:savedVersion,
  renderEditRevision:7,caption:'Farmacia demo 3D',pixelWidth:1200,
  pixelHeight:900,byteLength:100_000,sha256:'a'.repeat(64)});
assert.equal(manifest.kind,'RENDER_3D_ARREDI');
assert.equal(manifest.sourceImportId,lot.sourceImportId);
assert.equal(manifest.layoutRevision,lot.layoutRevision);
assert.equal(manifest.state,'NON_DEPOSITATO');
assert.equal(manifest.artifactId,null,'artifact ID is always server generated');
assert.throws(()=>attach.draft({context,layoutRevision:savedVersion,
  caption:'',pixelWidth:2000,pixelHeight:2000,byteLength:50,
  sha256:'a'.repeat(64)}),/non validi/);
const html=fs.readFileSync(path.join(__dirname,'..','mcp-dump-test.html'),'utf8');
const viewer=fs.readFileSync(path.join(__dirname,'..','arredi-3d-viewer.js'),'utf8');
assert.match(html,/renderer\.readRenderTargetPixels\(target,0,0,w,h,buffer\)/);
assert.match(html,/arredi-distinta-ui\.js/);
assert.match(viewer,/Allega 3D al preventivo/);
assert.match(viewer,/Non depositato nel dossier/);
assert.match(viewer,/NON DEPOSITATO/);
assert.match(viewer,/lastUpdated/);
console.log('M8_M9_CONTRACT_OK: 2+1 confirmed items, 3 atomic lines, no duplicate summary, saved/edit guards, PNG and local-only manifest');
