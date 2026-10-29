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
async function harness(search, catalogPayload, status = 200) {
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
  const placement={started:[],angles:[],listener:null};
  const win = {
    TiralineeArrediPlacement: {
      onChange(fn){placement.listener=fn;fn({ready:true,pending:null,selected:null,zoom:100,message:'Pianta pronta'});},
      start(item){placement.started.push(item);placement.listener?.({ready:true,pending:{...item,angle:0},selected:null,zoom:100,message:'Anteprima'});return true;},
      setAngle(angle){placement.angles.push(angle);return angle;},
      cancel(){},remove(){},resetZoom(){}
    },
    location: {search},
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
    assert.equal(slider.min,'0');assert.equal(slider.max,'359');
    slider.value='42';slider.events.input();
    assert.equal(h.placement.angles.at(-1),42,'slider angle must drive furniture rotation');
    assert.equal(rotation.children[0].children[0].textContent,'42°');
  }
  const failed = await harness('?istruzione=ARREDI', null, 503);
  const sidebar = failed.view.parentNode.children[1];
  const items = sidebar.children.find(c => c.className === 'arredi-items');
  const state = sidebar.children.find(c => c.className === 'arredi-status');
  assert.equal(items.children.length, 0, 'Network error does not create fake entries');
  assert.match(state.textContent, /HTTP 503/);
  console.log('PASS: inactive modes isolated; ARREDI profile renders right-side catalog; selection and 503 tested');
}
run().catch(e => {console.error(e);process.exitCode=1;});
