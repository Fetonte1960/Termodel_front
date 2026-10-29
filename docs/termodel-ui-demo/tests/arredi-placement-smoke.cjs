/* Browser-free geometric smoke test for Arredi metric placement and wheel zoom. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','arredi-2d-placement.js'),'utf8');
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
    window:{location:{search},TiralineeMcpInstructionBootstrap:{resolve(s){return {id:String(s).toUpperCase()};}}},
    URLSearchParams,
    document:{getElementById(id){return id==='view2d'?view:null;},
      createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),
      addEventListener(){}},
    MutationObserver:class {constructor(fn){observer=fn;}observe(){}},
    DOMParser:class {parseFromString(){
      const attrs={'data-termodel-format':svgFormat,'data-termodel-units':unit,
        'data-termodel-floor-name':'Unico',viewBox:'43.1 48.1 1889.994 1588.742'};
      return {documentElement:{localName:'svg',getAttribute:x=>attrs[x]??null},
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
  const invalid=harness('?istruzione=ARREDI','OTHER-FORMAT');
  await flush();assert.equal(invalid.window.TiralineeArrediPlacement.getState().ready,false,
    'unknown SVG must not be used as a metric plan');
  const wrongUnit=harness('?istruzione=ARREDI','TERMODEL-CLEAN-FLOOR-SVG-V1','px');
  await flush();assert.equal(wrongUnit.window.TiralineeArrediPlacement.getState().ready,false,
    'pixels are not allowed as metric coordinates');
  console.log('ARREDI_PLACEMENT_SMOKE_OK: cm/viewBox, preview, click commit, slider angle, wheel zoom, drag, SOS guard, invalid SVG');
})().catch(err=>{console.error(err);process.exitCode=1;});
