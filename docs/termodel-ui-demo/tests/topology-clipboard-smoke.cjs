// Isolated behavioral smoke of the real function defined in app.js.
// No external Service or browser required; tests never recalculate topology.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const begin = app.indexOf('async function copyCurrentTopologyToClipboard() {');
const end = app.indexOf('\nasync function readTermodelServiceError(response)', begin);
assert.ok(begin > 0 && end > begin, 'Funzione reale non reperibile.');
assert.match(html, /id="helpCopyTopologyClipboard" disabled>Copia negli appunti il modello topologico per AI/);
assert.match(app, /helpCopyTopologyClipboard\?\.addEventListener\('click'/);
assert.match(app, /lastCalculatedTopologyProjectText = completeProjectText;/);
assert.match(app, /lastCalculatedTopologyProjectText = '';/);

const source = app.slice(begin, end);
const projectId = '123e4567-e89b-42d3-a456-426614174000';
const response = JSON.stringify({
  format: 'TermodelTopologyAI', version: 3, source: 'Polig3D',
  rooms: [{ id: 'R001' }], walls: [{ id: 'W001' }],
  doors: [{ id: 'P001' }], links: [], access: [], warnings: []
}, null, 2);

function fixture(overrides = {}) {
  let copies = [];
  let status = '';
  const record = {
    path: 'artifacts/topologia-ai.json',
    href: '/api/projects/' + projectId + '/generated-files/artifacts/topologia-ai.json',
    stale: false
  };
  const catalog = {
    projectId,
    artifactsStale: false,
    files: [record]
  };
  const ctx = {
    structuredProjectActive: true,
    currentProjectText: 'project-current',
    currentProjectId: projectId,
    currentServiceManifest: { projectId },
    lastCalculatedTopologyProjectText: 'project-current',
    loading: false,
    cadIsDirty: () => false,
    buildCurrentProjectText: async () => ctx.currentProjectText,
    termodelGeneratedFilesCatalog: async () => catalog,
    termodelGeneratedFileText: async () => ({ text: response, stale: false }),
    copyTextToClipboard: async (value) => { copies.push(value); return true; },
    setMainAiStatus: value => { status = value; }
  };
  Object.assign(ctx, overrides);
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {
    run: () => vm.runInContext('copyCurrentTopologyToClipboard()', ctx),
    copies: () => copies,
    status: () => status,
    ctx, catalog, record
  };
}

async function shouldReject(label, test, expression) {
  const x = test();
  await assert.rejects(x.run(), expression, label);
  assert.equal(x.copies().length, 0, label + ': nessuna copia in caso di errore');
}
(async () => {
  const ok = fixture();
  const result = await ok.run();
  assert.equal(result, response);
  assert.deepEqual(ok.copies(), [response], 'Il JSON originale va copiato senza modifiche');
  assert.match(ok.status(), /Topologia V3 copiata/);

  await shouldReject('Progetto mancante', () => fixture({ structuredProjectActive: false }), /Apri prima/);
  await shouldReject('Calcolo assente', () => fixture({ currentServiceManifest: null }), /Aggiorna Modello/);
  await shouldReject('Documento modificato', () => fixture({
    buildCurrentProjectText: async () => 'modified'
  }), /modificato dopo il calcolo/);
  await shouldReject('CAD dirty', () => fixture({ cadIsDirty: () => true }), /non confermate/);
  await shouldReject('Calcolo in corso', () => fixture({ loading: true }), /ancora in corso/);
  await shouldReject('Catalogo altro progetto', () => fixture({
    termodelGeneratedFilesCatalog: async () => ({
      projectId: 'progetto-estraneo', artifactsStale: false,
      files: [{
        path: 'artifacts/topologia-ai.json',
        href: '/api/projects/' + projectId + '/generated-files/artifacts/topologia-ai.json'
      }]
    })
  }), /progetto diverso/);
  await shouldReject('Catalogo stale', () => fixture({
    termodelGeneratedFilesCatalog: async () => ({
      projectId, artifactsStale: true, files: []
    })
  }), /obsoleti/);
  await shouldReject('Artefatto stale header', () => fixture({
    termodelGeneratedFileText: async () => ({ text: response, stale: true })
  }), /invalidato/);
  await shouldReject('Artefatto V2', () => fixture({
    termodelGeneratedFileText: async () => ({
      text: response.replace('"version": 3', '"version": 2'), stale: false
    })
  }), /V3 atteso/);
  await shouldReject('Corrotto', () => fixture({
    termodelGeneratedFileText: async () => ({ text: '{invalid}', stale: false })
  }), /JSON valido/);
  await shouldReject('Copia vietata', () => fixture({
    copyTextToClipboard: async () => false
  }), /browser non ha consentito/);

  const swapped = fixture({
    termodelGeneratedFileText: async () => {
      swapped.ctx.currentProjectId = 'another';
      return { text: response, stale: false };
    }
  });
  await assert.rejects(swapped.run(), /cambiato durante la copia/);
  assert.equal(swapped.copies().length, 0);
  process.stdout.write('TOPOLOGY_CLIPBOARD_V3_SMOKE_OK\n');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
