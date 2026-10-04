// Termodel Web v0.22 — motore unico degli archivi.
// Ispirato al comportamento di UtiDb + AutoForm + FormArchivio desktop,
// ma senza dipendenze WPF. La Library resta sola lettura.

const PROJECT_START = '[TERMODEL-PROJECT-TEXT-V1]';
const PROJECT_END = '[END-TERMODEL-PROJECT-TEXT-V1]';
const DEFAULT_SCHEMA_URL = './definizionedati.json?v=0.41';
const EXPECTED_SCHEMA_SHA256 = '29E30DE64C7D45E4613F145AC485F573DB34F4328C6CE0BC7367EB92D83AAD0B';

const ARCHIVE_ORDER = [
  'Piani',
  'Pareti',
  'Confini',
  'NonClimatizzati',
  'Finestre',
  'Ponti',
  'PontiAutomatici',
  'PontiAutomaticiFinestre',
  'Zone',
  'Reti',
  'TipologiePannelli'
];

const PROTECTED_ROW_ARCHIVES = new Set(['Finestre', 'Pareti', 'Ponti', 'Zone']);

const archiveState = {
  schemaUrl: DEFAULT_SCHEMA_URL,
  schema: null,
  baseSchema: null,
  schemaPromise: null,
  project: null,
  currentArchive: 'Piani',
  currentIndex: 0,
  dirty: false,
  ui: null
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (_) {}
  }
  return JSON.parse(JSON.stringify(value));
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) return '';
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function loadSchema() {
  if (archiveState.schema) return archiveState.schema;
  if (archiveState.schemaPromise) return archiveState.schemaPromise;

  archiveState.schemaPromise = (async () => {
    const response = await fetch(archiveState.schemaUrl, { cache: 'no-store' });
    if (!response.ok)
      throw new Error(`Definizione archivi non disponibile (HTTP ${response.status}).`);

    const text = await response.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('definizionedati.json non contiene una radice valida.');

    const digest = await sha256Hex(text);
    if (digest && digest !== EXPECTED_SCHEMA_SHA256) {
      console.warn(
        'Termodel ArchivioWeb: impronta definizionedati.json diversa dal riferimento v0.22.',
        digest
      );
    }

    archiveState.baseSchema = deepClone(parsed);
    archiveState.schema = deepClone(parsed);
    return archiveState.schema;
  })().finally(() => {
    archiveState.schemaPromise = null;
  });

  return archiveState.schemaPromise;
}

function parseProjectSections(source) {
  const normalized = String(source ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized.toUpperCase().includes(PROJECT_START))
    throw new Error('Marcatore TERMODEL-PROJECT-TEXT-V1 non trovato.');
  if (!normalized.toUpperCase().includes(PROJECT_END))
    throw new Error('File progetto incompleto: manca END-TERMODEL-PROJECT-TEXT-V1.');

  const lines = normalized.split('\n');
  const sections = new Map();

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^---BEGIN:(.+)---\s*$/);
    if (!match) continue;

    const name = match[1].trim();
    const body = [];
    const expectedEnd = `---END:${name}---`;
    let closed = false;

    for (i = i + 1; i < lines.length; i++) {
      if (lines[i].trim() === expectedEnd) {
        closed = true;
        break;
      }
      body.push(lines[i]);
    }

    if (!closed)
      throw new Error(`Sezione progetto non chiusa: ${name}.`);

    sections.set(name, body.join('\n').replace(/\n+$/, ''));
  }

  if (!sections.size)
    throw new Error('Il progetto TERMODEL-PROJECT-TEXT-V1 non contiene sezioni.');

  return { source: normalized, sections };
}

function normalizeArchiveRecords(parsed, archiveName) {
  if (Array.isArray(parsed))
    return parsed.map(record => (
      record && typeof record === 'object' && !Array.isArray(record)
        ? { ...record }
        : {}
    ));

  if (!parsed || typeof parsed !== 'object')
    throw new Error(`Archivio JSON ${archiveName} non valido.`);

  const candidateKeys = [
    'records', 'Records',
    'items', 'Items',
    'data', 'Data',
    'dataCollection', 'DataCollection',
    'rows', 'Rows'
  ];

  for (const key of candidateKeys) {
    if (Array.isArray(parsed[key]))
      return parsed[key].map(record => ({ ...(record ?? {}) }));
  }

  // Ultima tolleranza: un oggetto singolo viene considerato una riga.
  return [{ ...parsed }];
}

function parseManifest(sections) {
  const raw = sections.get('manifest.json');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new Error(`manifest.json non valido: ${error.message}`);
  }
}

function findProjectName(manifest) {
  return (
    manifest?.progetto?.nome ??
    manifest?.project?.name ??
    manifest?.projectName ??
    manifest?.nome ??
    manifest?.name ??
    'Progetto Termodel'
  );
}

function findDefinitionHash(manifest) {
  const candidates = [
    manifest?.definizioneDatiSha256,
    manifest?.definitionSha256,
    manifest?.schemaSha256,
    manifest?.definition?.sha256,
    manifest?.definizione?.sha256
  ];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim().toUpperCase() ?? '';
}

export function isTermodelProjectText(text) {
  return String(text ?? '').toUpperCase().includes(PROJECT_START);
}

export async function loadTermodelProjectText(text) {
  await loadSchema();

  const parsed = parseProjectSections(text);
  const manifest = parseManifest(parsed.sections);

  // Ogni progetto riparte dallo schema storico e può estenderlo con metadata
  // tecnici portati dal progetto stesso, senza modificare definizionedati.json.
  archiveState.schema = deepClone(archiveState.baseSchema ?? archiveState.schema ?? {});
  const extendedSchemaText =
    parsed.sections.get('definition/reti-pannelli-definizionedati.json') ??
    parsed.sections.get('definition/pannelli-tubazioni-definizionedati.json');
  if (extendedSchemaText) {
    try {
      const extendedSchema = JSON.parse(extendedSchemaText);
      if (!extendedSchema || typeof extendedSchema !== 'object' || Array.isArray(extendedSchema))
        throw new Error('la radice non è un oggetto');

      Object.assign(archiveState.schema, extendedSchema);
    } catch (error) {
      throw new Error(
        'Definizione estesa Reti/Pannelli non valida: ' +
        error.message
      );
    }
  }

  const archives = {};
  const archiveSectionNames = {};

  for (const [sectionName, sectionText] of parsed.sections.entries()) {
    const match = sectionName.match(/^archives\/json\/(.+)\.json$/i);
    if (!match) continue;

    const archiveName = match[1];
    let json;
    try {
      json = JSON.parse(sectionText);
    } catch (error) {
      throw new Error(`${sectionName} non è JSON valido: ${error.message}`);
    }

    archives[archiveName] = normalizeArchiveRecords(json, archiveName);
    archiveSectionNames[archiveName] = sectionName;
  }

  if (!Object.keys(archives).length)
    throw new Error('Il file progetto non contiene archivi JSON.');

  const definitionHash = findDefinitionHash(manifest);
  if (definitionHash && definitionHash !== EXPECTED_SCHEMA_SHA256) {
    throw new Error(
      `La definizione dati del progetto (${definitionHash}) non coincide con quella del frontend (${EXPECTED_SCHEMA_SHA256}).`
    );
  }

  archiveState.project = {
    source: parsed.source,
    sections: parsed.sections,
    manifest,
    archives,
    archiveSectionNames,
    projectName: findProjectName(manifest)
  };
  archiveState.currentArchive = archives.Piani ? 'Piani' : Object.keys(archives)[0];
  archiveState.currentIndex = 0;
  archiveState.dirty = false;

  if (archiveState.ui?.modal?.classList.contains('visible'))
    renderArchive();

  return {
    manifest,
    projectName: archiveState.project.projectName,
    archives,
    geometrySvg: parsed.sections.get('geometry/project.svg') ?? ''
  };
}

function archiveSchema(name) {
  return archiveState.schema?.[name] ?? {};
}

function archiveRecords(name) {
  return archiveState.project?.archives?.[name] ?? [];
}

function resolveCombo(meta) {
  const combo = meta?.Combo;
  if (!Array.isArray(combo) || !combo.length) return null;

  if (combo[0] !== 'auto_combo')
    return combo.map(value => String(value ?? ''));

  const sourceArchive = combo[1];
  const sourceField = combo[2];
  const firstItem = combo.length >= 4 ? String(combo[3] ?? '') : '';
  const values = [];

  if (firstItem) values.push(firstItem);

  for (const record of archiveRecords(sourceArchive)) {
    const value = record?.[sourceField];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text && !values.includes(text)) values.push(text);
  }

  return values;
}

function createInitializedRecord(archiveName) {
  const schema = archiveSchema(archiveName);
  const record = {};

  for (const [field, meta] of Object.entries(schema)) {
    if (Object.prototype.hasOwnProperty.call(meta, 'Ini')) {
      record[field] = meta.Ini;
      continue;
    }

    if (Array.isArray(meta.Combo) && meta.Combo[0] === 'auto_combo' && meta.Combo.length >= 4) {
      record[field] = meta.Combo[3];
      continue;
    }

    record[field] = null;
  }

  return record;
}

function applyCorrelations(archiveName, record) {
  const schema = archiveSchema(archiveName);
  if (!record) return;

  for (const [field, meta] of Object.entries(schema)) {
    const corr = meta?.Correlato;
    if (!Array.isArray(corr) || corr.length < 4) continue;

    const [sourceArchive, localKeyField, sourceKeyField, sourceValueField] = corr;
    const keyValue = record[localKeyField];

    if (keyValue === null || keyValue === undefined || String(keyValue).trim() === '' || String(keyValue) === '-Seleziona-') {
      record[field] = '';
      continue;
    }

    const found = archiveRecords(sourceArchive).find(row =>
      row && String(row[sourceKeyField] ?? '') === String(keyValue)
    );

    if (found && Object.prototype.hasOwnProperty.call(found, sourceValueField))
      record[field] = found[sourceValueField];
  }
}

function formatGridValue(value, meta) {
  if (value === null || value === undefined) return '';

  const decimals = Number(meta?.NumeroDecimali);
  if (Number.isInteger(decimals) && decimals >= 0) {
    const numeric = Number(String(value).replace(',', '.'));
    if (Number.isFinite(numeric))
      return numeric.toFixed(decimals);
  }

  return String(value);
}

function visibleGridFields(archiveName) {
  const schema = archiveSchema(archiveName);
  const fields = Object.entries(schema)
    .filter(([, meta]) => Array.isArray(meta?.Grid) && meta.Grid.includes('Archivio'))
    .map(([field]) => field);

  if (fields.length) return fields;

  // Se uno schema non dichiara colonne Archivio, mostra almeno i campi descritti.
  return Object.entries(schema)
    .filter(([, meta]) => String(meta?.Descr ?? '').trim())
    .slice(0, 4)
    .map(([field]) => field);
}

function visibleFormFields(archiveName) {
  // AutoForm desktop genera i controlli per i campi con Descr valorizzata.
  return Object.entries(archiveSchema(archiveName))
    .filter(([, meta]) => String(meta?.Descr ?? '').trim());
}

function ensureStyles() {
  if (document.getElementById('archiveWebStyles')) return;
  const style = document.createElement('style');
  style.id = 'archiveWebStyles';
  style.textContent = `
    .archive-web-modal {
      position: fixed;
      inset: 0;
      z-index: 1350;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: rgba(0,0,0,.45);
      font-family: "Segoe UI", Arial, sans-serif;
      color: #111;
    }
    .archive-web-modal.visible { display:flex; }
    .archive-web-window {
      width: min(1220px, 97vw);
      height: min(780px, 94vh);
      min-height: 560px;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      background: #e7e7e7;
      border: 1px solid #666;
      box-shadow: 0 16px 44px rgba(0,0,0,.38);
    }
    .archive-web-head {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:9px 12px;
      background:#26384a;
      color:#fff;
    }
    .archive-web-head h2 { margin:0; font-size:17px; }
    .archive-web-subtitle { margin-top:2px; font-size:11px; color:#dbe6ef; }
    .archive-web-close {
      width:30px; height:28px;
      border:1px solid #8d9aa5;
      background:#f5f5f5;
      font-size:20px;
      line-height:20px;
      cursor:pointer;
    }
    .archive-web-tabs {
      display:flex;
      flex-wrap:wrap;
      gap:4px;
      padding:7px 8px;
      border-bottom:1px solid #aaa;
      background:#efefef;
    }
    .archive-web-tabs button {
      border:1px solid #999;
      background:linear-gradient(#fff,#e3e3e3);
      padding:5px 9px;
      cursor:pointer;
    }
    .archive-web-tabs button.active {
      background:#dcecff;
      border-color:#6288a8;
      font-weight:700;
    }
    .archive-web-tabs button:disabled { opacity:.45; cursor:default; }
    .archive-web-body {
      min-height:0;
      display:grid;
      grid-template-columns:minmax(380px, 1.15fr) minmax(330px, .85fr);
      gap:8px;
      padding:8px;
    }
    .archive-web-grid-wrap,
    .archive-web-form-wrap {
      min-height:0;
      background:#fff;
      border:1px solid #aaa;
      overflow:auto;
    }
    .archive-web-table {
      width:100%;
      border-collapse:collapse;
      table-layout:auto;
      font-size:12px;
    }
    .archive-web-table th {
      position:sticky;
      top:0;
      z-index:1;
      background:#e6e6e6;
      border:1px solid #bbb;
      padding:6px 7px;
      text-align:left;
      white-space:nowrap;
    }
    .archive-web-table td {
      border:1px solid #d0d0d0;
      padding:5px 7px;
      max-width:360px;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      cursor:default;
    }
    .archive-web-table tr.selected td { background:#dcecff; }
    .archive-web-table tbody tr:hover td { background:#eef6ff; }
    .archive-web-form {
      display:grid;
      grid-template-columns:minmax(150px, 220px) minmax(170px, 1fr);
      gap:8px 10px;
      padding:12px;
      align-items:center;
    }
    .archive-web-form label {
      font-size:12px;
      color:#27343f;
    }
    .archive-web-form input,
    .archive-web-form select {
      width:100%;
      min-width:0;
      border:1px solid #999;
      background:#fff;
      padding:5px 6px;
      font:inherit;
    }
    .archive-web-form input[readonly],
    .archive-web-form select:disabled {
      background:#eee;
      color:#555;
    }
    .archive-web-empty {
      padding:28px;
      text-align:center;
      color:#5a6670;
      line-height:1.5;
    }
    .archive-web-foot {
      display:flex;
      align-items:center;
      gap:6px;
      padding:8px;
      border-top:1px solid #aaa;
      background:#e8e8e8;
    }
    .archive-web-foot button {
      border:1px solid #888;
      background:linear-gradient(#fff,#e5e5e5);
      padding:6px 10px;
      cursor:pointer;
    }
    .archive-web-foot button:disabled { opacity:.45; cursor:default; }
    .archive-web-spacer { flex:1; }
    .archive-web-status {
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
      color:#45535f;
      max-width:42%;
    }
    @media (max-width: 820px) {
      .archive-web-window { height:96vh; }
      .archive-web-body {
        grid-template-columns:1fr;
        grid-template-rows:minmax(220px, 1fr) minmax(250px, 1fr);
      }
      .archive-web-form {
        grid-template-columns:minmax(120px, 180px) minmax(150px, 1fr);
      }
      .archive-web-status { max-width:28%; }
    }

    @media (max-width: 600px) {
      .archive-web-modal {
        padding:0;
        align-items:stretch;
        justify-content:stretch;
      }
      .archive-web-window {
        width:100vw;
        height:100dvh;
        min-height:0;
        border:0;
        box-shadow:none;
        grid-template-rows:auto auto minmax(0,1fr) auto;
      }
      .archive-web-head {
        min-height:50px;
        padding:7px 9px 7px 12px;
      }
      .archive-web-head h2 { font-size:16px; }
      .archive-web-subtitle {
        max-width:72vw;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .archive-web-close {
        width:42px;
        height:42px;
        flex:0 0 auto;
      }
      .archive-web-tabs {
        flex-wrap:nowrap;
        overflow-x:auto;
        overflow-y:hidden;
        gap:5px;
        padding:5px;
        -webkit-overflow-scrolling:touch;
      }
      .archive-web-tabs button {
        flex:0 0 auto;
        min-height:40px;
        padding:6px 11px;
        font-size:13px;
      }
      .archive-web-body {
        min-height:0;
        grid-template-columns:1fr;
        grid-template-rows:minmax(150px,42%) minmax(0,58%);
        gap:4px;
        padding:4px;
      }
      .archive-web-table {
        font-size:13px;
      }
      .archive-web-table th,
      .archive-web-table td {
        min-height:40px;
        padding:9px 8px;
      }
      .archive-web-form {
        grid-template-columns:1fr;
        gap:3px;
        padding:9px;
        align-items:stretch;
      }
      .archive-web-form label {
        margin-top:6px;
        font-size:12px;
        font-weight:600;
      }
      .archive-web-form input,
      .archive-web-form select {
        min-height:42px;
        padding:7px 8px;
        font-size:14px;
      }
      .archive-web-foot {
        min-height:52px;
        gap:5px;
        padding:5px;
        overflow-x:auto;
        overflow-y:hidden;
        -webkit-overflow-scrolling:touch;
      }
      .archive-web-foot button {
        flex:0 0 auto;
        min-height:40px;
        padding:6px 10px;
        font-size:13px;
      }
      .archive-web-spacer { display:none; }
      .archive-web-status { display:none; }
    }
  `;
  document.head.appendChild(style);
}

function createUi() {
  if (archiveState.ui) return archiveState.ui;

  ensureStyles();
  const modal = document.createElement('div');
  modal.id = 'archiveWebModal';
  modal.className = 'archive-web-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="archive-web-window" role="dialog" aria-modal="true" aria-labelledby="archiveWebTitle">
      <header class="archive-web-head">
        <div>
          <h2 id="archiveWebTitle">Archivi Termodel</h2>
          <div id="archiveWebSubtitle" class="archive-web-subtitle"></div>
        </div>
        <button id="archiveWebClose" class="archive-web-close" type="button" aria-label="Chiudi">×</button>
      </header>
      <nav id="archiveWebTabs" class="archive-web-tabs" aria-label="Archivi Termodel"></nav>
      <div class="archive-web-body">
        <section id="archiveWebGridWrap" class="archive-web-grid-wrap"></section>
        <section id="archiveWebFormWrap" class="archive-web-form-wrap"></section>
      </div>
      <footer class="archive-web-foot">
        <button id="archiveWebAdd" type="button">Aggiungi riga</button>
        <button id="archiveWebInsert" type="button">Inserisci prima</button>
        <button id="archiveWebDelete" type="button">Cancella riga</button>
        <span class="archive-web-spacer"></span>
        <span id="archiveWebStatus" class="archive-web-status"></span>
        <button id="archiveWebApply" type="button">Applica</button>
        <button id="archiveWebCloseBottom" type="button">Vai al modello</button>
      </footer>
    </section>
  `;
  document.body.appendChild(modal);

  const ui = {
    modal,
    title: modal.querySelector('#archiveWebTitle'),
    subtitle: modal.querySelector('#archiveWebSubtitle'),
    tabs: modal.querySelector('#archiveWebTabs'),
    gridWrap: modal.querySelector('#archiveWebGridWrap'),
    formWrap: modal.querySelector('#archiveWebFormWrap'),
    add: modal.querySelector('#archiveWebAdd'),
    insert: modal.querySelector('#archiveWebInsert'),
    delete: modal.querySelector('#archiveWebDelete'),
    apply: modal.querySelector('#archiveWebApply'),
    status: modal.querySelector('#archiveWebStatus'),
    close: modal.querySelector('#archiveWebClose'),
    closeBottom: modal.querySelector('#archiveWebCloseBottom')
  };

  const close = () => closeArchivioWeb();
  ui.close.addEventListener('click', close);
  ui.closeBottom.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) close();
  });

  ui.add.addEventListener('click', () => addRecord(false));
  ui.insert.addEventListener('click', () => addRecord(true));
  ui.delete.addEventListener('click', deleteRecord);
  ui.apply.addEventListener('click', () => {
    commitFormToRecord();
    archiveState.dirty = true;
    setStatus('✓ Modifiche applicate al progetto Web in memoria.');
    renderArchive();
    window.dispatchEvent(new CustomEvent('termodel:archives-updated'));
  });

  archiveState.ui = ui;
  return ui;
}

function setStatus(text) {
  if (archiveState.ui) archiveState.ui.status.textContent = text ?? '';
}

function renderTabs() {
  const ui = createUi();
  ui.tabs.replaceChildren();

  for (const name of ARCHIVE_ORDER) {
    if (!archiveState.schema?.[name]) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.classList.toggle('active', name === archiveState.currentArchive);
    button.disabled = !archiveState.project?.archives?.[name];
    button.addEventListener('click', () => {
      commitFormToRecord();
      archiveState.currentArchive = name;
      archiveState.currentIndex = 0;
      renderArchive();
    });
    ui.tabs.appendChild(button);
  }
}

function renderNoProject() {
  const ui = createUi();
  ui.title.textContent = 'Archivi Termodel';
  ui.subtitle.textContent = 'Nessun progetto completo TERMODEL-PROJECT-TEXT-V1 caricato';
  ui.tabs.replaceChildren();
  ui.gridWrap.innerHTML = `
    <div class="archive-web-empty">
      Prima crea o importa un progetto Termodel completo.<br>
      Gli archivi vengono letti dalle sezioni <code>archives/json/*.json</code> del file progetto.
    </div>
  `;
  ui.formWrap.innerHTML = `
    <div class="archive-web-empty">
      La form viene generata automaticamente da <code>definizionedati.json</code>.
    </div>
  `;
  ui.add.disabled = true;
  ui.insert.disabled = true;
  ui.delete.disabled = true;
  ui.apply.disabled = true;
  setStatus('ArchivioWeb pronto; manca il progetto completo.');
}

function renderGrid() {
  const ui = createUi();
  const name = archiveState.currentArchive;
  const records = archiveRecords(name);
  const schema = archiveSchema(name);
  const fields = visibleGridFields(name);

  if (!records.length) {
    ui.gridWrap.innerHTML = '<div class="archive-web-empty">Archivio vuoto.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'archive-web-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');

  for (const field of fields) {
    const th = document.createElement('th');
    th.textContent = schema[field]?.Descr || field;
    headRow.appendChild(th);
  }

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  records.forEach((record, index) => {
    const row = document.createElement('tr');
    row.classList.toggle('selected', index === archiveState.currentIndex);

    for (const field of fields) {
      const td = document.createElement('td');
      td.textContent = formatGridValue(record[field], schema[field]);
      row.appendChild(td);
    }

    row.addEventListener('click', () => {
      commitFormToRecord();
      archiveState.currentIndex = index;
      renderArchive();
    });

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  ui.gridWrap.replaceChildren(table);
}

function buildInput(field, meta, value) {
  const comboValues = resolveCombo(meta);
  let input;

  if (comboValues) {
    input = document.createElement('select');

    if (!comboValues.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '';
      input.appendChild(option);
    }

    for (const item of comboValues) {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      input.appendChild(option);
    }

    const current = value === null || value === undefined ? '' : String(value);
    if (current && !comboValues.includes(current)) {
      const option = document.createElement('option');
      option.value = current;
      option.textContent = current;
      option.dataset.outOfSchema = 'true';
      input.appendChild(option);
    }

    input.value = current;
    input.disabled = meta?.ReadOnly === true;
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = value === null || value === undefined ? '' : String(value);
    input.readOnly = meta?.ReadOnly === true;

    if (meta?.NumeroCifre !== undefined || meta?.NumeroDecimali !== undefined)
      input.inputMode = 'decimal';
  }

  input.dataset.archiveField = field;
  input.title = field;
  input.addEventListener('change', () => {
    commitFormToRecord();
    archiveState.dirty = true;
    renderGrid();
    refreshCorrelatedFields();
    setStatus('Modifiche non ancora salvate nel progetto unico.');
  });

  return input;
}

function renderForm() {
  const ui = createUi();
  const name = archiveState.currentArchive;
  const records = archiveRecords(name);
  const record = records[archiveState.currentIndex];

  if (!record) {
    ui.formWrap.innerHTML = '<div class="archive-web-empty">Nessuna riga selezionata.</div>';
    return;
  }

  applyCorrelations(name, record);

  const form = document.createElement('div');
  form.className = 'archive-web-form';

  for (const [field, meta] of visibleFormFields(name)) {
    const label = document.createElement('label');
    label.htmlFor = `archiveField_${field}`;
    label.textContent = meta.Descr || field;
    label.title = field;

    const input = buildInput(field, meta, record[field]);
    input.id = `archiveField_${field}`;

    form.append(label, input);
  }

  if (!form.children.length) {
    ui.formWrap.innerHTML = '<div class="archive-web-empty">Nessun campo descrittivo previsto dallo schema per questa form.</div>';
    return;
  }

  ui.formWrap.replaceChildren(form);
}

function commitFormToRecord() {
  const ui = archiveState.ui;
  const project = archiveState.project;
  if (!ui || !project) return;

  const name = archiveState.currentArchive;
  const records = archiveRecords(name);
  const record = records[archiveState.currentIndex];
  if (!record) return;

  ui.formWrap.querySelectorAll('[data-archive-field]').forEach(input => {
    const field = input.dataset.archiveField;
    if (!field) return;
    record[field] = input.value === '' ? '' : input.value;
  });

  applyCorrelations(name, record);
}

function refreshCorrelatedFields() {
  const ui = archiveState.ui;
  if (!ui || !archiveState.project) return;

  const name = archiveState.currentArchive;
  const record = archiveRecords(name)[archiveState.currentIndex];
  if (!record) return;

  applyCorrelations(name, record);
  const schema = archiveSchema(name);

  for (const [field, meta] of Object.entries(schema)) {
    if (!Array.isArray(meta?.Correlato)) continue;
    const input = ui.formWrap.querySelector(`[data-archive-field="${CSS.escape(field)}"]`);
    if (input) input.value = record[field] ?? '';
  }
}

function addRecord(insertBefore) {
  const name = archiveState.currentArchive;
  if (!archiveState.project || PROTECTED_ROW_ARCHIVES.has(name)) return;

  commitFormToRecord();
  const records = archiveRecords(name);
  const record = createInitializedRecord(name);

  if (insertBefore && records.length) {
    const index = Math.max(0, Math.min(archiveState.currentIndex, records.length - 1));
    records.splice(index, 0, record);
    archiveState.currentIndex = index;
  } else {
    records.push(record);
    archiveState.currentIndex = records.length - 1;
  }

  archiveState.dirty = true;
  setStatus('Nuova riga inizializzata da definizionedati.json.');
  renderArchive();
}

function deleteRecord() {
  const name = archiveState.currentArchive;
  if (!archiveState.project || PROTECTED_ROW_ARCHIVES.has(name)) return;

  const records = archiveRecords(name);
  if (!records.length) return;

  records.splice(archiveState.currentIndex, 1);
  archiveState.currentIndex = Math.max(0, Math.min(archiveState.currentIndex, records.length - 1));
  archiveState.dirty = true;
  setStatus('Riga eliminata dal progetto Web in memoria.');
  renderArchive();
}

function renderArchive() {
  const ui = createUi();

  if (!archiveState.project) {
    renderNoProject();
    return;
  }

  if (!archiveState.project.archives[archiveState.currentArchive]) {
    const fallback = ARCHIVE_ORDER.find(name => archiveState.project.archives[name])
      || Object.keys(archiveState.project.archives)[0];
    archiveState.currentArchive = fallback;
    archiveState.currentIndex = 0;
  }

  const name = archiveState.currentArchive;
  const records = archiveRecords(name);
  if (archiveState.currentIndex >= records.length)
    archiveState.currentIndex = Math.max(0, records.length - 1);

  ui.title.textContent = `Gestione archivio "${name}"`;
  ui.subtitle.textContent = `${archiveState.project.projectName} · ${records.length} record`;

  renderTabs();
  renderGrid();
  renderForm();

  const protectedRows = PROTECTED_ROW_ARCHIVES.has(name);
  ui.add.disabled = protectedRows;
  ui.insert.disabled = protectedRows || !records.length;
  ui.delete.disabled = protectedRows || !records.length;
  ui.apply.disabled = !records.length;

  if (protectedRows)
    setStatus('Modifica record attiva; aggiunta/cancellazione protette come nel desktop.');
  else if (!archiveState.dirty)
    setStatus('Archivio compilato dal file progetto.');
}

export async function openArchivioWeb(name = 'Piani') {
  await loadSchema();
  const ui = createUi();

  if (name && !archiveState.schema?.[name])
    throw new Error(`Archivio '${name}' non definito nel progetto corrente.`);

  if (name && archiveState.project && !archiveState.project.archives?.[name])
    throw new Error(`Archivio '${name}' non presente nel progetto corrente.`);

  if (name) {
    commitFormToRecord();
    archiveState.currentArchive = name;
    archiveState.currentIndex = 0;
  }

  renderArchive();
  ui.modal.classList.add('visible');
  ui.modal.setAttribute('aria-hidden', 'false');
}

export function closeArchivioWeb() {
  const ui = archiveState.ui;
  if (!ui) return;
  commitFormToRecord();
  ui.modal.classList.remove('visible');
  ui.modal.setAttribute('aria-hidden', 'true');
  window.dispatchEvent(new CustomEvent('termodel:archives-updated'));
}

export async function initArchivioWeb(options = {}) {
  if (options.schemaUrl) archiveState.schemaUrl = options.schemaUrl;
  await loadSchema();
  createUi();
  return {
    schema: archiveState.schema,
    hasProject: Boolean(archiveState.project)
  };
}

export function getArchivioWebState() {
  return {
    hasProject: Boolean(archiveState.project),
    projectName: archiveState.project?.projectName ?? '',
    currentArchive: archiveState.currentArchive,
    dirty: archiveState.dirty,
    archives: archiveState.project ? Object.keys(archiveState.project.archives) : []
  };
}

export function getArchivioWebRecords(name) {
  commitFormToRecord();
  return archiveRecords(name).map(record => ({ ...record }));
}

export function addArchivioWebRecord(name, overrides = {}) {
  commitFormToRecord();

  if (!archiveState.project)
    throw new Error('Nessun progetto Termodel completo caricato.');
  if (!archiveState.schema?.[name])
    throw new Error('Archivio non definito: ' + name);

  const records = archiveRecords(name);
  const record = createInitializedRecord(name);

  for (const [field, value] of Object.entries(overrides || {})) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    record[field] = value;
  }

  applyCorrelations(name, record);
  records.push(record);
  archiveState.dirty = true;

  if (archiveState.ui?.modal?.classList.contains('visible') &&
      archiveState.currentArchive === name) {
    archiveState.currentIndex = records.length - 1;
    renderArchive();
  }

  window.dispatchEvent(new CustomEvent('termodel:archives-updated'));
  return { ...record };
}

export function markArchivioWebSaved() {
  commitFormToRecord();
  archiveState.dirty = false;
  if (archiveState.ui?.modal?.classList.contains('visible')) {
    setStatus('✓ Archivio consolidato nel progetto unico.');
  }
}

export function getArchivioWebSchema(name) {
  const schema = archiveState.schema?.[name];
  return schema ? deepClone(schema) : {};
}
