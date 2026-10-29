/* Tests for Arredi-only 2D sidebar without browser dependencies. */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '..', 'arredi-2d-catalog.js'), 'utf8');

function node(tag = 'div') {
  const el = {
    tagName: tag, children: [], parentNode: null, attributes: {}, events: {},
    textContent: '', className: '', disabled: false, style: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, fn) { this.events[name] = fn; },
    appendChild(child) {
      if (child.parentNode) {
        const a = child.parentNode.children;
        a.splice(a.indexOf(child), 1);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...children) { children.forEach(c => this.appendChild(c)); },
    replaceChildren(...children) {
      for (const previous of this.children) previous.parentNode = null;
      this.children = [];
      this.append(...children);
    },
    insertBefore(child, before) {
      const index = this.children.indexOf(before);
      assert(index >= 0, 'insertBefore requires an existing child');
      if (child.parentNode) {
        const a = child.parentNode.children;
        a.splice(a.indexOf(child), 1);
      }
      child.parentNode = this;
      this.children.splice(index, 0, child);
    }
  };
  return el;
}
async function harness(search, catalogPayload, status = 200, documentIo = null) {
  const tab = node('div');
  const view = node('div');
  tab.appendChild(view);
  const nodes = {'tab-2d': tab, view2d: view};
  const addedClasses = [];
  const doc = {
    head: node('head'),
    body: {classList: {add(x) {addedClasses.push(x);}}},
    getElementById(id) {return nodes[id] || null;},
    createElement(name) {return node(name);}
  };
  let fetches = 0;
  const placement={started:[],angles:[],listener:null,restored:null,
    current:{ready:true,pending:null,selected:null,zoom:100,
      planKey:documentIo?'demo-plan':null,floor:'Unico',editRevision:0,
      items:[]}};
  const win = {
    TiralineeArrediPlacement: {
      onChange(fn){placement.listener=fn;fn({...placement.current,message:'Pianta pronta'});},
      getState(){return placement.current;},
      restoreLayout(layout){
        placement.restored=layout;
        placement.current.items=layout.items;
        placement.current.editRevision++;
        placement.listener?.({...placement.current,message:'Ripristinato'});
        return layout.items.length;
      },
      exportLayout(context){return {
        format:'TERMODEL-ARREDI-LAYOUT-V1',
        version:1,units:'cm',...context,items:placement.current.items};},
      start(item){placement.started.push(item);placement.listener?.({ready:true,pending:{...item,angle:0},selected:null,zoom:100,message:'Anteprima'});return true;},
      setAngle(angle){placement.angles.push(angle);return angle;},
      cancel(){},remove(){},resetZoom(){}
    },
    location: {search},
    TiralineeArrediDocumentIo:documentIo,
    TiralineeMcpInstructionBootstrap: {
      resolve(input) {
        const profile = input.toUpperCase().replace(/-ISTRUZIONI\.MD$/, '');
        return /^[A-Z][A-Z0-9_-]{0,39}$/.test(profile)
          ? {id: profile, document: profile + '-ISTRUZIONI.md'} : null;
      }
    }
  };
  const ctx = {window: win, document: doc, URLSearchParams, AbortController, console,
    fetch: async url => {
      fetches++;
      assert.equal(url, 'https://termodel-mcp-gateway.onrender.com/api/arredi/v1/catalog');
      return {ok: status === 200, status, json: async () => catalogPayload};
    }};
  vm.runInNewContext(script, ctx, {filename: 'arredi-2d-catalog.js'});
  await new Promise(resolve => setImmediate(resolve));
  return {view, doc, win, placement, addedClasses, get fetches() {return fetches;}};
}
async function run() {
  for (const inactive of ['', '?istruzione=SOS', '?istruzione=IMPIANTI', '?istruzione=', '?chat=claude']) {
    const h = await harness(inactive, {items: []});
    assert.equal(h.fetches, 0, 'Arredi catalog must never fetch for ' + inactive);
    assert.equal(h.doc.head.children.length, 0, 'CSS must not load for ' + inactive);
    assert.equal(h.addedClasses.length, 0, 'Class must not be toggled for ' + inactive);
    assert.equal(h.view.parentNode.tagName, 'div', 'View remains in legacy tab');
    assert.equal(h.win.TiralineeArrediCatalog, undefined, 'No Arredi surface outside profile');
  }
  const catalog = {schema:'TERMODEL-ARREDI-CATALOG-V1', items:[
    {id:'1',code:'DEMO-TAV',name:'DEMO Tavolo',description:'Demo',category:'Tavoli',widthCm:180,depthCm:90}
  ]};
  for (const active of ['?istruzione=ARREDI', '?istruzione=arredi', '?chat=claude&istruzione=ARREDI-ISTRUZIONI.md']) {
    const h = await harness(active, catalog);
    assert.equal(h.fetches, 1);
    assert.deepEqual(h.addedClasses, ['arredi-profile-active']);
    assert.equal(h.view.parentNode.id, 'arredi-2d-workspace');
    const sidebar = h.view.parentNode.children[1];
    assert.equal(sidebar.id, 'arredi-2d-sidebar');
    const list = sidebar.children.find(c => c.className === 'arredi-items');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0].children[0].textContent, 'DEMO Tavolo');
    assert.equal(list.children[0].children[1].textContent, '180 × 90 cm');
    list.children[0].events.click();
    assert.equal(h.win.TiralineeArrediCatalog.getSelected().id, '1');
    assert.equal(h.placement.started.length,1,'catalog item must start a metric preview');
    assert.equal(h.placement.started[0].widthCm,180);
    assert.equal(h.placement.started[0].depthCm,90);
    const rotation=sidebar.children.find(c=>c.className==='arredi-rotation');
    assert.ok(rotation,'right sidebar must have an angle slider');
    const slider=rotation.children.find(c=>c.tagName==='input');
    assert.equal(slider.type,'range');
    assert.equal(slider.min,'0');assert.equal(slider.max,'359.99');assert.equal(slider.step,'0.01');
    slider.value='42';slider.events.input();
    assert.equal(h.placement.angles.at(-1),42,'slider angle must drive furniture rotation');
    assert.equal(rotation.children[0].children[0].textContent,'42°');
  }
  // M6: auto-restore only on matching plan, explicit Save uses the
  // version from GET. The test farm document is never written on load.
  const layout={format:'TERMODEL-ARREDI-LAYOUT-V1',version:1,units:'cm',
    importId:'demo-import',projectRevision:'rev',floorName:'Unico',
    items:[{id:'AR-1',catalogId:'1',name:'DEMO Tavolo',description:'',
      widthCm:180,depthCm:90,x:250,y:250,angle:30}]};
  const requests={reads:0,writes:[]};
  const documentIo={
    context:()=>({importId:'demo-import',projectRevision:'rev',floorName:'Unico'}),
    async load(){requests.reads++;return {layout,version:'version-1'};},
    async save(data,version){requests.writes.push({data,version});return {
      version:'version-2',importId:'demo-import',projectRevision:'rev',
      itemCount:data.items.length};}
  };
  const withDocument=await harness('?istruzione=ARREDI',catalog,200,documentIo);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.reads,1,'must read the current pharmacy JSON on opening');
  assert.equal(withDocument.placement.restored.items.length,1,'layout is restored');
  assert.equal(requests.writes.length,0,'opening must NEVER overwrite the document');
  const documentSidebar=withDocument.view.parentNode.children[1];
  const saveButton=documentSidebar.children.flatMap(x=>x.children)
    .find(x=>x.textContent==='Salva');
  assert.ok(saveButton,'Save button is present in right toolbar');
  assert.equal(saveButton.disabled,false,'Save enabled after successful read');
  await saveButton.events.click();
  assert.equal(requests.writes.length,1);
  assert.equal(requests.writes[0].version,'version-1');
  assert.equal(requests.writes[0].data.floorName,'Unico');
  const savedStatus=documentSidebar.children.find(x=>x.id==='arredi-save-status');
  assert.match(savedStatus.textContent,/Salvati 1 arredi/);
  // If the read fails, do not let a blind POST destroy server data.
  const failRead={context:documentIo.context,
    async load(){throw Error('DB offline');},async save(){throw Error('MUST NOT WRITE');}};
  const unavailable=await harness('?istruzione=ARREDI',catalog,200,failRead);
  await new Promise(resolve=>setImmediate(resolve));
  const unavailableSidebar=unavailable.view.parentNode.children[1];
  const blocked=unavailableSidebar.children.flatMap(x=>x.children)
    .find(x=>x.textContent==='Salva');
  assert.equal(blocked.disabled,true,'save must remain blocked after read failure');

  const failed = await harness('?istruzione=ARREDI', null, 503);
  const sidebar = failed.view.parentNode.children[1];
  const items = sidebar.children.find(c => c.className === 'arredi-items');
  const state = sidebar.children.find(c => c.className === 'arredi-status');
  assert.equal(items.children.length, 0, 'Network error does not create fake entries');
  assert.match(state.textContent, /HTTP 503/);
  console.log('PASS: inactive modes isolated; ARREDI profile renders right-side catalog; selection and 503 tested');
}
run().catch(e => {console.error(e);process.exitCode=1;});
