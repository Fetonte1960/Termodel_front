/* MCP_Arredi catalog sidebar MVP 0.1 — 2026-10-28
 * Activates ONLY with explicit istruzione=ARREDI.
 * Uses the shared MCP Gateway REST catalog endpoint. No credentials in browser.
 * No geometry mutations: rectangle placement is a later, metric/SVG-calibrated phase.
 */
(function () {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  if (!params.has('istruzione')) return;
  const raw = params.get('istruzione') || '';
  const bootstrap = window.TiralineeMcpInstructionBootstrap;
  const profile = bootstrap && typeof bootstrap.resolve === 'function'
    ? bootstrap.resolve(raw) : null;
  if (!profile || profile.id !== 'ARREDI') return;

  const tab = document.getElementById('tab-2d');
  const view = document.getElementById('view2d');
  if (!tab || !view) return;
  const BASE_URL = 'https://termodel-mcp-gateway.onrender.com/api/arredi/v1/catalog';
  const state = {items: [], selectedId: null, loading: false, controller: null};
  document.body.classList.add('arredi-profile-active');

  const style = document.createElement('style');
  style.textContent = `
    body.arredi-profile-active #tab-2d {overflow:hidden}
    #arredi-2d-workspace {display:flex;flex:1;min-width:0;min-height:0;gap:0}
    #arredi-2d-workspace #view2d {flex:1;min-width:0}
    #arredi-2d-sidebar {flex:0 0 240px;width:240px;box-sizing:border-box;
      overflow-y:auto;background:#fff;border:1px solid #b8c6d5;border-left:0;
      padding:12px;display:flex;flex-direction:column;gap:10px;
      font:13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:#233248}
    #arredi-2d-sidebar h2 {margin:0;font-size:16px;font-weight:700}
    #arredi-2d-sidebar p {margin:0}
    #arredi-2d-sidebar .arredi-help {font-size:11px;color:#5c6d82}
    #arredi-2d-sidebar .arredi-actions {display:flex;gap:6px;align-items:center}
    #arredi-2d-sidebar button {cursor:pointer;padding:7px 9px;
      background:#eaf1f9;color:#214b73;border:1px solid #a5b9ce;border-radius:6px;
      font:inherit}
    #arredi-2d-sidebar button:focus-visible {outline:2px solid #1260a2;outline-offset:2px}
    #arredi-2d-sidebar button:disabled {cursor:not-allowed;opacity:.6}
    #arredi-2d-sidebar .arredi-items {display:flex;flex-direction:column;gap:6px}
    #arredi-2d-sidebar .arredi-item {display:block;width:100%;text-align:left;background:#f4f7fb}
    #arredi-2d-sidebar .arredi-item[aria-pressed="true"] {background:#c9e5fa;border-color:#21719b}
    #arredi-2d-sidebar .arredi-item strong {display:block}
    #arredi-2d-sidebar .arredi-item small {display:block;color:#415771}
    #arredi-2d-sidebar .arredi-status {padding:7px;border-radius:4px;background:#eef1f5;
      color:#48556a;overflow-wrap:anywhere}
    #arredi-2d-sidebar .arredi-details {border-top:1px solid #dae3ed;padding-top:8px}
    @media(max-width:680px) {
      #arredi-2d-workspace {flex-direction:column}
      #arredi-2d-workspace #view2d {min-height:180px}
      #arredi-2d-sidebar {width:auto;flex:0 0 auto;max-height:40vh;border-left:1px solid #b8c6d5}
    }
  `;
  document.head.appendChild(style);

  const workspace = document.createElement('div');
  workspace.id = 'arredi-2d-workspace';
  view.parentNode.insertBefore(workspace, view);
  workspace.appendChild(view);
  const sidebar = document.createElement('aside');
  sidebar.id = 'arredi-2d-sidebar';
  sidebar.setAttribute('aria-label', 'Catalogo arredi');
  workspace.appendChild(sidebar);
  const heading = document.createElement('h2');
  heading.textContent = 'Arredi';
  sidebar.appendChild(heading);
  const hint = document.createElement('p');
  hint.className = 'arredi-help';
  hint.textContent = 'Catalogo del database · profilo ARREDI';
  sidebar.appendChild(hint);
  const actions = document.createElement('div');
  actions.className = 'arredi-actions';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = 'Aggiorna catalogo';
  actions.appendChild(refresh);
  sidebar.appendChild(actions);
  const status = document.createElement('p');
  status.className = 'arredi-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  sidebar.appendChild(status);
  const list = document.createElement('div');
  list.className = 'arredi-items';
  list.setAttribute('aria-label', 'Voci catalogo');
  sidebar.appendChild(list);
  const details = document.createElement('div');
  details.className = 'arredi-details';
  details.setAttribute('aria-live', 'polite');
  sidebar.appendChild(details);
  function showStatus(message) { status.textContent = message; }
  function safeNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
  function isItem(item) {
    return item && typeof item.id === 'string' && item.id.length > 0 &&
      typeof item.name === 'string' && item.name.length > 0 &&
      safeNumber(item.widthCm) && safeNumber(item.depthCm);
  }
  function dimensions(item) {
    return item.widthCm + ' × ' + item.depthCm + ' cm';
  }
  function showDetails(item) {
    details.replaceChildren();
    if (!item) return;
    const name = document.createElement('strong');
    name.textContent = item.name;
    const desc = document.createElement('p');
    desc.textContent = item.description || 'Nessuna descrizione';
    const size = document.createElement('p');
    size.textContent = 'Ingombro: ' + dimensions(item);
    const note = document.createElement('p');
    note.className = 'arredi-help';
    note.textContent = 'Selezione catalogo pronta. Il posizionamento metrico nella pianta è una fase successiva.';
    details.append(name, desc, size, note);
  }
  function render() {
    list.replaceChildren();
    for (const item of state.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'arredi-item';
      button.setAttribute('aria-pressed', item.id === state.selectedId ? 'true' : 'false');
      const name = document.createElement('strong');
      name.textContent = item.name;
      const size = document.createElement('small');
      size.textContent = dimensions(item);
      button.append(name, size);
      button.addEventListener('click', () => {
        state.selectedId = item.id;
        showDetails(item);
        render();
      });
      list.appendChild(button);
    }
  }
  async function load() {
    if (state.loading) return;
    state.loading = true;
    refresh.disabled = true;
    state.controller = new AbortController();
    showStatus('Caricamento catalogo dal database…');
    try {
      const response = await fetch(BASE_URL, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: {Accept: 'application/json'},
        signal: state.controller.signal
      });
      if (!response.ok) throw new Error('Catalogo non disponibile (HTTP ' + response.status + ')');
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.items) || !payload.items.every(isItem))
        throw new Error('Formato catalogo non valido');
      state.items = payload.items;
      if (!state.items.some(x => x.id === state.selectedId)) state.selectedId = null;
      render();
      showDetails(state.items.find(x => x.id === state.selectedId));
      showStatus(state.items.length ? state.items.length + ' voci dal database' :
        'Catalogo vuoto: inserire le prime voci tramite amministrazione');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      state.items = [];
      state.selectedId = null;
      render();
      showDetails(null);
      showStatus(String(error && error.message || error) +
        '. Verificare la pubblicazione API/catalogo. Nessun dato dimostrativo sostituito al DB.');
    } finally {
      state.loading = false;
      refresh.disabled = false;
      state.controller = null;
    }
  }
  refresh.addEventListener('click', load);
  showStatus('Catalogo Arredi da collegare al servizio.');
  load();
  // Diagnostic surface for integration tests only; never authorizes drawing or writes.
  window.TiralineeArrediCatalog = Object.freeze({
    getProfile: () => profile.id,
    getSelected: () => state.items.find(x => x.id === state.selectedId) || null
  });
})();
