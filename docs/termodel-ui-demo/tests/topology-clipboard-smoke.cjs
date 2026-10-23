// Test comportamentale della vera funzione di copia nel frontend e del vero
// parser del progetto. Il timestamp generato a ogni build NON è una modifica.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const helperStart = app.indexOf('function termodelTopologyComparableProjectText(projectText) {');
const end = app.indexOf('\nasync function readTermodelServiceError(response)', helperStart);
assert.ok(helperStart > 0 && end > helperStart, 'Funzioni reali del frontend non reperibili.');
assert.match(html, /id="helpCopyTopologyClipboard" disabled>Copia negli appunti il modello topologico per AI/);
assert.match(app, /helpCopyTopologyClipboard\?\.addEventListener\('click'/);
assert.match(app, /lastCalculatedTopologyProjectText = completeProjectText;/);
assert.match(app, /lastCalculatedTopologyProjectText = '';/);

const source = app.slice(helperStart, end);
const projectId = '123e4567-e89b-42d3-a456-426614174000';
const topologyJson = JSON.stringify({
  format: 'TermodelTopologyAI', version: 3, source: 'Polig3D',
  rooms: [{ id: 'R001' }], walls: [{ id: 'W001' }],
  doors: [{ id: 'P001' }], links: [], access: [], warnings: []
}, null, 2);

// Equivalent to real project section grammar with different volatile stamps.
function projectText({ stamp = '2026-10-23T06:30:00.000Z',
                       geometry = '<svg><path id="W001"/></svg>',
                       name = 'Esempio 2' } = {}) {
  return [
    '[TERMODEL-PROJECT-TEXT-V1]',
    '---BEGIN:manifest.json---',
    JSON.stringify({ projectId, projectName: name, generatedAtUtc: stamp }, null, 2),
    '---END:manifest.json---',
    '---BEGIN:geometry/project.svg---',
    geometry,
    '---END:geometry/project.svg---',
    '[END-TERMODEL-PROJECT-TEXT-V1]'
  ].join('\n');
}

async function fixture(overrides = {}) {
  const projectTextModule = fs.readFileSync(path.join(root, 'termodel-project-text.js'), 'utf8');
  const parsed = await import('data:text/javascript;base64,' + Buffer.from(projectTextModule).toString('base64'));
  const initial = projectText();
  const nextBuild = projectText({ stamp: '2026-10-23T06:31:00.000Z' });
  let copied = [];
  let message = '';
  const record = {
    path: 'artifacts/topologia-ai.json',
    href: '/api/projects/' + projectId + '/generated-files/artifacts/topologia-ai.json',
    stale: false
  };
  const catalog = { projectId, artifactsStale: false, files: [record] };
  const ctx = {
    structuredProjectActive: true,
    currentProjectText: initial,
    currentProjectId: projectId,
    currentServiceManifest: { projectId },
    lastCalculatedTopologyProjectText: initial,
    loading: false,
    cadIsDirty: () => false,
    buildCurrentProjectText: async () => {
      ctx.currentProjectText = nextBuild;
      return nextBuild;
    },
    getTermodelProjectSection: parsed.getTermodelProjectSection,
    replaceTermodelProjectSection: parsed.replaceTermodelProjectSection,
    termodelGeneratedFilesCatalog: async () => catalog,
    termodelGeneratedFileText: async () => ({ text: topologyJson, stale: false }),
    copyTextToClipboard: async value => { copied.push(value); return true; },
    setMainAiStatus: value => { message = value; }
  };
  Object.assign(ctx, overrides);
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {
    run: () => vm.runInContext('copyCurrentTopologyToClipboard()', ctx),
    copied: () => copied,
    message: () => message,
    ctx, catalog
  };
}
async function rejects(label, setup, messageRegex) {
  const x = await fixture(setup);
  await assert.rejects(x.run(), messageRegex, label);
  assert.equal(x.copied().length, 0, label + ': nessuna copia in caso di errore');
}

(async () => {
  // Regressione V2.08: due invocazioni di buildTermodelProjectText
  // differiscono soltanto per generatedAtUtc. Ora la copia deve riuscire.
  const ok = await fixture();
  assert.equal(await ok.run(), topologyJson);
  assert.deepEqual(ok.copied(), [topologyJson]);
  assert.match(ok.message(), /Topologia V3 copiata/);

  await rejects('Progetto non aperto', { structuredProjectActive: false }, /Apri prima/);
  await rejects('Calcolo non disponibile', { currentServiceManifest: null }, /Aggiorna Modello/);
  await rejects('Modifica reale della geometria', {
    buildCurrentProjectText: async () => projectText({
      stamp: '2026-10-23T06:31:00.000Z',
      geometry: '<svg><path id="W999"/></svg>'
    })
  }, /modificato dopo il calcolo/);
  await rejects('Modifica reale dei metadati del progetto', {
    buildCurrentProjectText: async () => projectText({
      stamp: '2026-10-23T06:31:00.000Z', name: 'Altro progetto'
    })
  }, /modificato dopo il calcolo/);
  await rejects('CAD non confermato', { cadIsDirty: () => true }, /non confermate/);
  await rejects('Calcolo in corso', { loading: true }, /ancora in corso/);
  await rejects('Catalogo altro progetto', {
    termodelGeneratedFilesCatalog: async () => ({
      projectId: 'altro', artifactsStale: false, files: []
    })
  }, /progetto diverso/);
  await rejects('Catalogo stale', {
    termodelGeneratedFilesCatalog: async () => ({
      projectId, artifactsStale: true, files: []
    })
  }, /obsoleti/);
  await rejects('Artifact stale HTTP', {
    termodelGeneratedFileText: async () => ({ text: topologyJson, stale: true })
  }, /invalidato/);
  await rejects('V2 non accettata', {
    termodelGeneratedFileText: async () => ({
      text: topologyJson.replace('"version": 3', '"version": 2'), stale: false
    })
  }, /V3 atteso/);
  await rejects('JSON non valido', {
    termodelGeneratedFileText: async () => ({ text: '{invalid}', stale: false })
  }, /JSON valido/);
  await rejects('Clipboard bloccata', {
    copyTextToClipboard: async () => false
  }, /browser non ha consentito/);
  const swapped = await fixture();
  swapped.ctx.termodelGeneratedFileText = async () => {
    swapped.ctx.currentProjectId = 'un-altro';
    return { text: topologyJson, stale: false };
  };
  await assert.rejects(swapped.run(), /cambiato durante la copia/);
  assert.equal(swapped.copied().length, 0);
  console.log('TOPOLOGY_CLIPBOARD_V209_TIMESTAMP_REGRESSION_OK');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
