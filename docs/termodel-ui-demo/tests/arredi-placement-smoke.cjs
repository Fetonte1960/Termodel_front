/* Browser-free geometric smoke test for Arredi metric placement and wheel zoom. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','arredi-2d-placement.js'),'utf8');
const osnap=require('../arredi-2d-osnap.js');
function harness(search,svgFormat='TERMODEL-CLEAN-FLOOR-SVG-V1',unit='cm'){
  const nodes=[];
  class Element {
    constructor(tag){
      this.tagName=tag;this.localName=tag;this.children=[];this.parentNode=null;
      this.attributes={};this.events={};this.style={};this.textContent='';
      this.id='';this.src='';this.pointerCaptured=false;
      nodes.push(this);
    }
    get isConnected(){return this===view || Boolean(this.parentNode?.isConnected);}
    append(...items){for(const n of items){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);n.parentNode=this;this.children.push(n);}}
    appendChild(item){this.append(item);return item;}
    remove(){if(this.parentNode){const a=this.parentNode.children;
      a.splice(a.indexOf(this),1);this.parentNode=null;}}
    replaceChildren(...items){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...items);}
    setAttribute(k,v){this.attributes[k]=String(v);}
    getAttribute(k){return this.attributes[k]??null;}
    addEventListener(k,fn){this.events[k]=fn;}
    setPointerCapture(){this.pointerCaptured=true;}
    releasePointerCapture(){this.pointerCaptured=false;}
    querySelector(tag){
      for(const n of this.children){if(n.tagName===tag)return n;const found=n.querySelector(tag);if(found)return found;}return null;
    }
    contains(other){return other===this || this.children.some(n=>n.contains(other));}
    closest(selector){if(selector==='[data-placement-id]'){
      let n=this;while(n){if(n.getAttribute?.('data-placement-id'))return n;n=n.parentNode;}
    }return null;}
    createSVGPoint(){return {x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}};}
    getScreenCTM(){return {inverse(){return {};}};}
    getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}
  }
  const view=new Element('div');view.id='view2d';
  const img=new Element('img');img.src='blob:termold-clean-floor';
  view.append(img);
  let fetchCount=0,observer=null;
  const context={
    window:{location:{search},TiralineeArrediOsnap:osnap,
      TiralineeMcpInstructionBootstrap:{resolve(s){return {id:String(s).toUpperCase()};}}},

    URLSearchParams,
    document:{getElementById(id){return id==='view2d'?view:null;},
      createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),
      addEventListener(){}},
    MutationObserver:class {constructor(fn){observer=fn;}observe(){}},
    DOMParser:class {parseFromString(){
      const attrs={'data-termodel-format':svgFormat,'data-termodel-units':unit,
        'data-termodel-floor-name':'Unico',viewBox:'43.1 48.1 1889.994 1588.742'};
      return {documentElement:{localName:'svg',getAttribute:x=>attrs[x]??null,
        querySelectorAll:q=>q==='polyline.clean-boundary'?[{
          getAttribute:k=>k==='points'?'100,100 700,100 700,500':null}]:[]},
        querySelector(){return null;}};
    }},
    fetch:async url=>{
      assert.equal(url,'blob:termold-clean-floor');
      fetchCount++;
      return {ok:true,text:async()=>'<svg/>'};
    },
    console
  };
  vm.runInNewContext(source,context,{filename:'arredi-2d-placement.js'});
  return {window:context.window,view,get fetchCount(){return fetchCount;},get observer(){return observer;}};
}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
  for(const p of ['', '?istruzione=SOS','?istruzione=IMPIANTI']){
    const h=harness(p);await flush();
    assert.equal(h.window.TiralineeArrediPlacement,undefined);
    assert.equal(h.fetchCount,0);
  }
  const h=harness('?istruzione=ARREDI');await flush();
  const api=h.window.TiralineeArrediPlacement;
  assert.ok(api,'ARREDI should register the placement API');
  assert.equal(api.getState().ready,true,'Termodel SVG units cm must enable placement');
  assert.equal(api.getState().unit,'cm');
  assert.equal(api.getState().floor,'Unico');
  assert.equal(api.getState().wallCount,2,'2 wall segments parsed from 3 SVG polyline points');
  const item={id:'catalog-test',name:'DEMO Tavolo',description:'',widthCm:180,depthCm:90};
  assert.equal(api.start(item),true);
  assert.equal(api.getState().pending.widthCm,180);
  assert.equal(api.getState().pending.depthCm,90);
  const overlay=h.view.querySelector('svg');
  assert.ok(overlay,'overlay must be a separate SVG');
  assert.equal(overlay.getAttribute('viewBox'),'43.1 48.1 1889.994 1588.742');
  overlay.events.pointermove({clientX:300,clientY:320});
  assert.equal(api.getState().pending.x,300);
  assert.equal(api.getState().pending.y,320);
  api.setAngle(75);
  assert.equal(api.getState().pending.angle,75);
  let wheelPrevented=false;
  h.view.events.wheel({deltaY:-80,clientX:320,clientY:270,
    preventDefault(){wheelPrevented=true;}});
  assert.ok(wheelPrevented,'wheel zoom must consume browser wheel');
  assert.ok(api.getState().zoom>1,'mouse wheel must zoom in');
  assert.equal(api.getState().angle,75,'wheel must never change rotation');
  overlay.events.click({button:0,clientX:300,clientY:320});
  const placed=api.getState();
  assert.equal(placed.items.length,1);
  assert.equal(placed.pending,null);
  assert.equal(placed.items[0].angle,75);
  assert.equal(placed.items[0].widthCm,180);
  assert.equal(placed.items[0].depthCm,90);
  assert.equal(placed.items[0].x,300);
  assert.equal(placed.items[0].y,320);
  api.setAngle(135);
  assert.equal(api.getState().items[0].angle,135,'sidebar should rotate a selected placed item');
  const shape=h.view.querySelector('svg').children[0];
  overlay.events.pointerdown({button:0,clientX:300,clientY:320,
    target:shape,pointerId:1,stopPropagation(){},preventDefault(){}});
  overlay.events.pointermove({clientX:370,clientY:380});
  overlay.events.pointerup({pointerId:1});
  assert.equal(api.getState().items[0].x,370,'drag should move real cm coordinates');
  assert.equal(api.getState().items[0].y,380);
  assert.equal(api.getState().items[0].angle,135,'drag preserves angle');
  api.resetZoom();assert.equal(api.getState().zoom,1);
  assert.equal(api.remove(),true);assert.equal(api.getState().items.length,0);
  assert.equal(api.start(item),true);api.cancel();
  assert.equal(api.getState().pending,null);
  // OSNAP is available ONLY in placement mode via right-click. It does not
  // commit on wall selection; it fixes the original nearest furniture side.
  assert.equal(api.start(item),true);
  api.setAngle(75);
  overlay.events.pointermove({clientX:300,clientY:320});
  let contextPrevented=false;
  h.view.events.contextmenu({clientX:320,clientY:310,
    preventDefault(){contextPrevented=true;}});
  assert.ok(contextPrevented);
  const menu=h.view.children.find(n=>n.id==='arredi-osnap-menu');
  assert.ok(menu,'context menu must open on right click during placement');
  assert.equal(menu.children[0].textContent,'OSNAP');
  assert.equal(menu.children[1].textContent,'Allinea con parete');
  menu.children[1].events.click();
  assert.equal(api.getState().snapMode,'pick-wall');
  overlay.events.pointermove({clientX:390,clientY:105});
  assert.ok(overlay.children.some(n=>n.getAttribute('data-arredi-osnap-target')==='wall'));
  overlay.events.click({button:0,clientX:390,clientY:105});
  assert.equal(api.getState().snapMode,'aligned');
  const snapped=api.getState().pending;
  assert.notEqual(snapped.angle,75,'whole furniture must turn to selected wall');
  assert.equal(api.getState().items.length,0,'wall click must not commit furniture');
  overlay.events.pointermove({clientX:550,clientY:500});
  assert.equal(api.getState().pending.x,snapped.x,'snap remains fixed during preview');
  assert.equal(api.getState().pending.y,snapped.y);
  overlay.events.click({button:0,clientX:550,clientY:500});
  assert.equal(api.getState().items.length,1,'second click confirms');
  assert.equal(api.getState().items[0].x,snapped.x,
    'confirm must NOT override wall-aligned x with click x');
  assert.equal(api.getState().items[0].y,snapped.y);
  assert.equal(api.getState().items[0].angle,snapped.angle);
  assert.equal(api.getState().snapMode,'');
  // Outside insertion the default context menu remains available.
  let preventedOutside=false;
  h.view.events.contextmenu({clientX:300,clientY:300,
    preventDefault(){preventedOutside=true;}});
  assert.equal(preventedOutside,false,'OSNAP menu only while placing');
  // Two-wall OSNAP: first click fixes angle, second fixes the position
  // along the first wall, third confirms. The right-context menu exposes both.
  const dual=harness('?istruzione=ARREDI');await flush();
  const dualApi=dual.window.TiralineeArrediPlacement;
  const dualOverlay=dual.view.querySelector('svg');
  dualApi.start(item);dualApi.setAngle(30);
  dualOverlay.events.pointermove({clientX:500,clientY:330});
  dual.view.events.contextmenu({clientX:500,clientY:330,preventDefault(){}});
  const dualMenu=dual.view.children.find(x=>x.id==='arredi-osnap-menu');
  assert.equal(dualMenu.children[2].textContent,'Allinea due pareti');
  dualMenu.children[2].events.click();
  assert.equal(dualApi.getState().snapMode,'pick-first-wall');
  dualOverlay.events.click({button:0,clientX:390,clientY:105});
  assert.equal(dualApi.getState().snapMode,'pick-second-wall');
  const firstAngle=dualApi.getState().angle;
  assert.ok(dualOverlay.children.some(n=>n.getAttribute('data-arredi-osnap-target')==='first-wall'));
  dualOverlay.events.click({button:0,clientX:390,clientY:105});
  assert.equal(dualApi.getState().snapMode,'pick-second-wall','same wall cannot be selected twice');
  dualOverlay.events.click({button:0,clientX:695,clientY:260});
  assert.equal(dualApi.getState().snapMode,'aligned');
  const both=dualApi.getState();
  assert.equal(both.angle,firstAngle,'first wall fixes rotation');
  assert.equal(both.items.length,0,'wall selection does not commit a furniture item');
  assert.ok(both.snapInfo && both.snapInfo.firstSideIndex!==both.snapInfo.secondSideIndex);
  assert.ok(both.snapInfo.firstGapCm<.05);
  assert.ok(both.snapInfo.secondGapCm<.05,'corner should be in contact with both walls');
  dualOverlay.events.click({button:0,clientX:550,clientY:460});
  assert.equal(dualApi.getState().items.length,1);
  assert.equal(dualApi.getState().items[0].x,both.pending.x);
  assert.equal(dualApi.getState().items[0].y,both.pending.y);
  assert.equal(dualApi.getState().items[0].angle,firstAngle);

  const invalid=harness('?istruzione=ARREDI','OTHER-FORMAT');
  await flush();assert.equal(invalid.window.TiralineeArrediPlacement.getState().ready,false,
    'unknown SVG must not be used as a metric plan');
  const wrongUnit=harness('?istruzione=ARREDI','TERMODEL-CLEAN-FLOOR-SVG-V1','px');
  await flush();assert.equal(wrongUnit.window.TiralineeArrediPlacement.getState().ready,false,
    'pixels are not allowed as metric coordinates');
  console.log('ARREDI_PLACEMENT_SMOKE_OK: cm/viewBox, preview, click commit, slider angle, wheel zoom, drag, OSNAP one/two walls and primary angle, SOS guard, invalid SVG');
})().catch(err=>{console.error(err);process.exitCode=1;});
