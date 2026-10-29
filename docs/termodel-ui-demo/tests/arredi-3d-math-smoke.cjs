/* M7 strict layout-to-3D metric transform and profile-isolated wiring smoke. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const math=require('../arredi-3d-math.js');
const item={id:'AR-7',catalogId:'844c8e8b-ef8d-431b-bfae-b1584e117a2a',
  x:350,y:420,angle:90,widthCm:180,depthCm:90};
const a=math.sceneItem(item);
assert.deepEqual(a.position,{x:3.5,y:0,z:-4.2});
assert.equal(a.widthM,1.8);assert.equal(a.depthM,.9);
assert.equal(a.rotationY,Math.PI/2);
assert.equal(math.sceneItem({...item,angle:450}).rotationY,Math.PI/2);
assert.throws(()=>math.sceneItem({...item,widthCm:-1}),/non valido/);
assert.throws(()=>math.sceneItem({...item,x:NaN}),/non valido/);
assert.ok(math.validContext({floorName:'Unico',
  importId:'396c0403-60bc-418f-8949-74346ddf74e7',projectRevision:'rev'},
  {floor:'Unico',ready:true}));
assert.equal(math.validContext({floorName:'Wrong',
  importId:'396c0403-60bc-418f-8949-74346ddf74e7',projectRevision:'rev'},
  {floor:'Unico',ready:true}),false);
assert.equal(math.allowedAsset('https://www.termodel.it/termodel-ui-demo/arredi-assets/demo-tavolo.glb'),true);
for(const url of ['https://evil.invalid/demo.glb',
  'http://www.termodel.it/termodel-ui-demo/arredi-assets/demo.glb',
  'https://www.termodel.it/termodel-ui-demo/demo.glb',
  'https://www.termodel.it/termodel-ui-demo/arredi-assets/demo.glb?token=x']){
  assert.equal(math.allowedAsset(url),false,url);
}
const html=fs.readFileSync(path.join(__dirname,'..','mcp-dump-test.html'),'utf8');
assert.match(html,/selected\?\.id==='ARREDI'[\s\S]*?import\('\.\/arredi-3d-viewer\.js/);
assert.match(html,/isBuildingReady:\(\)=>labFixtureLoaded/);
const scene=fs.readFileSync(path.join(__dirname,'..','arredi-3d-viewer.js'),'utf8');
assert.match(scene,/update\.textContent='Aggiorna'/);
assert.match(scene,/Math\.max\(\.015,target\*\.08\)/);
assert.match(scene,/crypto\.subtle\.digest\('SHA-256',buffer\)/);
assert.match(scene,/const state=placement\?\.getState\?\.\(\)/);
assert.match(scene,/buildingRoot\.add\(layer\)/);
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','arredi-assets','demo-models.json')));
assert.equal(manifest.models.length,3);
for(const e of manifest.models){
 assert.equal(math.allowedAsset(e.url),true);
 assert.match(e.sha256,/^[a-f0-9]{64}$/);
 assert.ok(e.widthCm>0 && e.depthCm>0 && e.heightCm>0);
}
console.log('ARREDI_3D_M7_OK: metric mapping, rotation, URL guard, 3D update, static demo GLB manifest');
