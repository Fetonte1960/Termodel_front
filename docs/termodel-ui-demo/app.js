import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generaPiantaDaSvg } from './genera-pianta.js?v=0.71';
import {
  parseDxfPlotSource,
  getDxfLayerSummary,
  estimateDxfConversion,
  dxfUnitFromInsUnits,
  dxfUnitScaleToCm
} from './dxf-plotter.js?v=0.71';
import { generaDxfDaPianta, DXF_EXPORT_INFO } from './export-dxf.js';
import {
  initArchivioWeb,
  isTermodelProjectText,
  loadTermodelProjectText,
  openArchivioWeb,
  getArchivioWebRecords,
  addArchivioWebRecord,
  getArchivioWebSchema,
  getArchivioWebState,
  markArchivioWebSaved
} from './archivio-web.js?v=0.82';
import {
  isTermodelProjectText as isCompleteTermodelProjectText,
  buildTermodelProjectText,
  buildTermodelServerPayload,
  consolidateTermodelBackgrounds,
  hydrateTermodelBackgrounds,
  getTermodelProjectSection,
  replaceTermodelProjectSection
} from './termodel-project-text.js?v=0.75';

const MODEL_URL = './TermodelWebModel.json';
const PROJECT_BROWSER_EXAMPLES_URL = './examples/catalog.json';
const TERMODEL_SERVICE_CLOUD_BASE_URL = 'https://termodel.onrender.com';
const TERMODEL_SERVICE_LOCAL_BASE_URL = 'http://localhost:5080';
const TERMODEL_SERVICE_BASE_URL = String(
  globalThis.TERMODEL_SERVICE_BASE_URL || TERMODEL_SERVICE_CLOUD_BASE_URL
).replace(/\/+$/, '');
const TERMODEL_SERVICE_READY_TTL_MS = 60 * 1000;
const TERMODEL_SERVICE_WAKE_TIMEOUT_MS = 90 * 1000;
const EMPTY_PROJECT_MODULE_URL = './progetto-vuoto.js?v=0.70';
const PDFJS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.mjs';
const PDF_PREVIEW_MAX_DIMENSION = 900;
const PDF_RASTER_MAX_DIMENSION = 3000;
let pdfJsModulePromise = null;

const appRoot = document.getElementById('app');
const appTitleText = document.getElementById('appTitleText');
const renderOriginBadge = document.getElementById('renderOriginBadge');
const openProjectButton = document.getElementById('openProjectButton');
const openExampleButton = document.getElementById('openExampleButton');
const openProjectFileInput = document.getElementById('openProjectFileInput');
const saveProjectButton = document.getElementById('saveProjectButton');
const saveProjectAsButton = document.getElementById('saveProjectAsButton');
const helpOpenWebHelp = document.getElementById('helpOpenWebHelp');
const helpExplorationMode = document.getElementById('helpExplorationMode');
const helpLocalService = document.getElementById('helpLocalService');
const helpCopyProjectClipboard = document.getElementById('helpCopyProjectClipboard');
const helpCopyLogClipboard = document.getElementById('helpCopyLogClipboard');
const helpSpiralEngine = document.getElementById('helpSpiralEngine');
const helpSpiralClosure = document.getElementById('helpSpiralClosure');
const TERMODEL_LOG_CATEGORIES = [
  'Sempre',
  'colmi',
  'spezza',
  'Error',
  'Svg',
  'RedrawHelix',
  'GeneraModello',
  'Performance',
  'PontiAutomatici',
  'SpiraliDiego'
];
const APP_VERSION = String(
  globalThis.TERMODEL_FRONTEND_BOOT_VERSION ||
  new URL(import.meta.url).searchParams.get('v') ||
  'dev'
).trim();
function buildTermodelCaption(area) {
  const normalizedArea = String(area || '').trim();
  return `Termodel V:${APP_VERSION}${normalizedArea ? ` — ${normalizedArea}` : ''}`;
}
const APP_MAIN_TITLE = buildTermodelCaption('Web');
const APP_CAD_TITLE = buildTermodelCaption('CAD 2D');
const TERMODEL_FRONTEND_VERSION_URL = './frontend-version.txt';

document.title = APP_MAIN_TITLE;
if (appTitleText)
  appTitleText.textContent = APP_MAIN_TITLE;
let termodelFrontendVersionCheckPromise = null;

async function ensureLatestTermodelFrontend() {
  if (termodelFrontendVersionCheckPromise)
    return termodelFrontendVersionCheckPromise;

  termodelFrontendVersionCheckPromise = (async () => {
    try {
      const response = await fetch(
        TERMODEL_FRONTEND_VERSION_URL + '?t=' + Date.now(),
        { cache: 'no-store' }
      );
      if (!response.ok) return true;

      const deployedVersion = String(await response.text()).trim();
      if (!deployedVersion || deployedVersion === APP_VERSION) return true;

      // Forza un nuovo documento HTML oltre al nuovo app.js: serve anche per
      // i tab lasciati aperti durante un deploy GitHub Pages.
      const target = new URL(window.location.href);
      target.searchParams.set('v', deployedVersion);
      target.searchParams.set('_reload', Date.now().toString());
      window.location.replace(target.href);
      return false;
    } catch (error) {
      console.warn('Controllo versione frontend non disponibile.', error);
      return true;
    } finally {
      termodelFrontendVersionCheckPromise = null;
    }
  })();

  return termodelFrontendVersionCheckPromise;
}

const TERMODEL_ANDROID_DEVICE = /Android/i.test(navigator.userAgent || '');
const TERMODEL_DESKTOP_VIEWPORT_WIDTH = 1100;
let termodelForceDesktopLayout = false;

if (TERMODEL_ANDROID_DEVICE)
  document.documentElement.classList.add('termodel-android');

// Controllo immediato e al ritorno sul tab: evita di continuare a usare una
// versione del frontend già sostituita su GitHub Pages.
ensureLatestTermodelFrontend();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) ensureLatestTermodelFrontend();
});

function clearAndroidViewportOverrides() {
  document.documentElement.style.removeProperty('height');
  document.body.style.removeProperty('height');
  appRoot?.style.removeProperty('height');
  appRoot?.style.removeProperty('min-height');
  appRoot?.style.removeProperty('grid-template-rows');
}

function enableTermodelFullDesktopLayout() {
  if (!TERMODEL_ANDROID_DEVICE) return;

  termodelForceDesktopLayout = true;
  document.documentElement.classList.remove('termodel-android');
  document.documentElement.classList.add('termodel-force-desktop');

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  viewportMeta?.setAttribute('content', `width=${TERMODEL_DESKTOP_VIEWPORT_WIDTH}`);

  clearAndroidViewportOverrides();

  requestAnimationFrame(() => {
    if (typeof resize === 'function') resize();
  });
}

function syncAndroidViewportLayout() {
  if (!TERMODEL_ANDROID_DEVICE || !appRoot) return;
  if (termodelForceDesktopLayout) {
    clearAndroidViewportOverrides();
    return;
  }

  const viewport = window.visualViewport;
  const width = Math.max(
    1,
    Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 1)
  );
  const height = Math.max(
    1,
    Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1)
  );

  // Su alcuni Chrome/Android datati 100%, 100vh e 100dvh non seguono
  // correttamente la viewport visibile. Qui imponiamo la misura reale.
  document.documentElement.style.height = height + 'px';
  document.body.style.height = height + 'px';
  appRoot.style.height = height + 'px';
  appRoot.style.minHeight = height + 'px';

  // Android v0.84: la home è una viewport 3D immersiva. Le barre
  // desktop vengono nascoste via CSS; anche in landscape il viewer occupa
  // l'unica riga disponibile. Il CAD mantiene la propria UI dedicata.
  appRoot.style.gridTemplateRows = 'minmax(0, 1fr)';

  requestAnimationFrame(() => {
    if (typeof resize === 'function') resize();
  });
}

if (TERMODEL_ANDROID_DEVICE) {
  syncAndroidViewportLayout();
  window.addEventListener('resize', syncAndroidViewportLayout);
  window.addEventListener('orientationchange', syncAndroidViewportLayout);
  window.visualViewport?.addEventListener?.('resize', syncAndroidViewportLayout);
}

function completeTermodelMobileBoot() {
  if (!TERMODEL_ANDROID_DEVICE) return;

  if (globalThis.__termodelMobileBootFailsafe) {
    clearTimeout(globalThis.__termodelMobileBootFailsafe);
    globalThis.__termodelMobileBootFailsafe = null;
  }

  requestAnimationFrame(() => {
    syncAndroidViewportLayout();
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('termodel-mobile-boot');
    });
  });
}

const viewer = document.getElementById('viewer');
const modelPage = document.getElementById('modelPage');
const cadPage = document.getElementById('cadPage');
const cadCanvas = document.getElementById('cadCanvas');
const cadContextMenu = document.getElementById('cadContextMenu');
const cadRepeatLastCommand = document.getElementById('cadRepeatLastCommand');
const cadExtendTrim = document.getElementById('cadExtendTrim');
const cadCloseSequence = document.getElementById('cadCloseSequence');
const cadCloseOrthogonalSequence = document.getElementById('cadCloseOrthogonalSequence');
const cadStopSequence = document.getElementById('cadStopSequence');
const cadAddBackground = document.getElementById('cadAddBackground');
const cadBackgroundFile = document.getElementById('cadBackgroundFile');
const cadLoadGeneratedExecutive = document.getElementById('cadLoadGeneratedExecutive');
const cadShowGeneratedExecutive = document.getElementById('cadShowGeneratedExecutive');
const cadExecutiveProvenance = document.getElementById('cadExecutiveProvenance');
const cadShowBackground = document.getElementById('cadShowBackground');
const cadShowInput = document.getElementById('cadShowInput');
const pdfImportModal = document.getElementById('pdfImportModal');
const pdfImportFileName = document.getElementById('pdfImportFileName');
const pdfImportInfo = document.getElementById('pdfImportInfo');
const pdfPreviewCanvas = document.getElementById('pdfPreviewCanvas');
const pdfPageNumber = document.getElementById('pdfPageNumber');
const pdfPageCount = document.getElementById('pdfPageCount');
const pdfPrevPage = document.getElementById('pdfPrevPage');
const pdfNextPage = document.getElementById('pdfNextPage');
const pdfImportClose = document.getElementById('pdfImportClose');
const pdfImportCancel = document.getElementById('pdfImportCancel');
const pdfImportRasterize = document.getElementById('pdfImportRasterize');
const dxfImportModal = document.getElementById('dxfImportModal');
const dxfImportFileName = document.getElementById('dxfImportFileName');
const dxfImportInfo = document.getElementById('dxfImportInfo');
const dxfLayerList = document.getElementById('dxfLayerList');
const dxfSelectAll = document.getElementById('dxfSelectAll');
const dxfSelectNone = document.getElementById('dxfSelectNone');
const dxfDrawingUnit = document.getElementById('dxfDrawingUnit');
const dxfModeLines = document.getElementById('dxfModeLines');
const dxfModeCurves = document.getElementById('dxfModeCurves');
const dxfConvertText = document.getElementById('dxfConvertText');
const dxfExplodeBlocks = document.getElementById('dxfExplodeBlocks');
const dxfImportSummary = document.getElementById('dxfImportSummary');
const dxfImportClose = document.getElementById('dxfImportClose');
const dxfImportCancel = document.getElementById('dxfImportCancel');
const dxfImportConvert = document.getElementById('dxfImportConvert');
const cadReturnModel = document.getElementById('cadReturnModel');
const cadExportArchitectural = document.getElementById('cadExportArchitectural');
const cadSnapNear = document.getElementById('cadSnapNear');
const cadSnapEndpoint = document.getElementById('cadSnapEndpoint');
const cadSnapBackground = document.getElementById('cadSnapBackground');
const cadOrtho = document.getElementById('cadOrtho');
const cadUndo = document.getElementById('cadUndo');
const cadRedo = document.getElementById('cadRedo');
const cadDelete = document.getElementById('cadDelete');
const cadRegenerate = document.getElementById('cadRegenerate');
const cadNewLine = document.getElementById('cadNewLine');
const cadInsertAlign = document.getElementById('cadInsertAlign');
const cadInsertOpening = document.getElementById('cadInsertOpening');
const cadInsertOpeningTwoPoint = document.getElementById('cadInsertOpeningTwoPoint');
const cadInsertBridge = document.getElementById('cadInsertBridge');
const cadInsertRoom = document.getElementById('cadInsertRoom');
const cadInsertRidge = document.getElementById('cadInsertRidge');
const cadNewLineType = document.getElementById('cadNewLineType');
const cadEntitySeparator = document.getElementById('cadEntitySeparator');
const cadEditStatus = document.getElementById('cadEditStatus');
const cadServiceGeometryErrorBanner = document.getElementById('cadServiceGeometryErrorBanner');
const cadPropertiesHead = document.getElementById('cadPropertiesHead');
const cadPropertiesEmpty = document.getElementById('cadPropertiesEmpty');
const cadPropertiesBody = document.getElementById('cadPropertiesBody');
const cadModeSelect = document.getElementById('cadModeSelect');
const cadNetworkLabel = document.getElementById('cadNetworkLabel');
const cadNetworkSelect = document.getElementById('cadNetworkSelect');
const cadPropPiano = document.getElementById('cadPropPiano');
const cadPropTipoParete = document.getElementById('cadPropTipoParete');
const cadPropConfineParete = document.getElementById('cadPropConfineParete');
const cadPropTipoLinea = document.getElementById('cadPropTipoLinea');
const cadPropColore = document.getElementById('cadPropColore');
const cadPropColorSwatch = document.getElementById('cadPropColorSwatch');
const cadPropStart = document.getElementById('cadPropStart');
const cadPropEnd = document.getElementById('cadPropEnd');
const cadPropLength = document.getElementById('cadPropLength');
const cadPropConfirm = document.getElementById('cadPropConfirm');
const cadWallPropertiesSection = document.getElementById('cadWallPropertiesSection');
const cadWallGeometrySection = document.getElementById('cadWallGeometrySection');
const cadBackgroundCalibrationSection = document.getElementById('cadBackgroundCalibrationSection');
const cadCalibrationReference = document.getElementById('cadCalibrationReference');
const cadCalibrationRealMeters = document.getElementById('cadCalibrationRealMeters');
const cadCalibrateBackground = document.getElementById('cadCalibrateBackground');
const cadCalibrationNote = document.getElementById('cadCalibrationNote');
const cadSymbolPropertiesSection = document.getElementById('cadSymbolPropertiesSection');
const cadSymbolSectionTitle = document.getElementById('cadSymbolSectionTitle');
const cadSymbolPosition = document.getElementById('cadSymbolPosition');
const cadSymbolFields = document.getElementById('cadSymbolFields');
const cadSymbolApply = document.getElementById('cadSymbolApply');
const cadOpenPianiArchive = document.getElementById('cadOpenPianiArchive');
const cadAddRoofPlane = document.getElementById('cadAddRoofPlane');
const cadMobilePropertiesToggle = document.getElementById('cadMobilePropertiesToggle');
const cadOpenParetiArchive = document.getElementById('cadOpenParetiArchive');
const cadOpenConfiniArchive = document.getElementById('cadOpenConfiniArchive');
const cadNorthPropertiesSection = document.getElementById('cadNorthPropertiesSection');
const cadNorthClose = document.getElementById('cadNorthClose');
const cadNorthDefined = document.getElementById('cadNorthDefined');
const cadNorthRange = document.getElementById('cadNorthRange');
const cadNorthAngle = document.getElementById('cadNorthAngle');
const cadNorthNeedle = document.getElementById('cadNorthNeedle');
const cadNorthUnknown = document.getElementById('cadNorthUnknown');
const status = document.querySelector('.viewport-status');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd3d3d3);

const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = false;
viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;

scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(15, 25, 18);
scene.add(sun);

const modelGroup = new THREE.Group();
const edgeGroup = new THREE.Group();
const north3DGroup = new THREE.Group();
scene.add(modelGroup);
scene.add(edgeGroup);
scene.add(north3DGroup);

let floor = null;
let homeView = null;
let loading = false;
let lastModelData = null;
let currentModelLabel = 'PROGETTO ORIGINALE';
let currentModelMode = 'project';
let structuredProjectActive = false;
let emptyProjectTextPromise = null;
let currentProjectText = '';
let currentProjectFileName = '';
let currentProjectId = '';
let currentServiceManifest = null;
let currentCalculationSpiralEngine = '';
let lastTermodelLogText = '';
let lastTermodelLogProjectId = '';
let termodelServiceReadyAt = 0;
let termodelServiceCapabilities = null;
let termodelServiceRuntimeLabel = '';
let termodelServiceRuntimeCommit = '';
let termodelServiceRuntimeEngine = '';
let termodelServiceProgressHideTimer = null;
let projectBrowserExamples = [];
let projectBrowserExamplesPromise = null;
let activeProjectBrowserExampleId = '';
let initialModelExplorationLocked = true;
let projectExploreDialogResolver = null;
let androidExampleProgressHideTimer = null;
let lastAiPreviewData = null;
let lastCleanPlanSvg = '';
let lastGeneratedPlan = null;
let northOrientationDeg = null;

// Edita nel CAD v0.10: editor SVG semantico E/W con costruzione, snap
// e pannello proprietà ispirato a Grid_DatiCad/Grid_pareti del desktop.
// La geometria architettonica continua ad essere rigenerata dal motore GeneraPianta.
let cadWorkingDoc = null;
let cadCommittedSvg = '';
let cadSelectedLineId = '';
let cadExtendTrimSourceId = '';
let cadSelectedSymbolId = '';
let cadUndoStack = [];
let cadRedoStack = [];
let cadDragState = null;
let cadViewportBase = null;
let cadViewport = null;
let cadPanState = null;
let cadTouchPointers = new Map();
let cadTouchGesture = null;
let cadCalibrationLineId = '';
let cadToolMode = 'select';
let cadNewLineState = null;
let cadSymbolInsertType = '';
let cadWindowTwoPointState = null;
let cadLastRepeatableCommand = '';
let cadToolbarState = {
  modalita: 'edificio',
  rete: '',
  piano: '',
  tipoParete: '',
  confineParete: ''
};
let cadCleanPlanByPlane = new Map();
let cadGeneratedPlanByPlane = new Map();
// Overlay runtime letto dagli artifact Service. Non entra in cadWorkingDoc e
// quindi non modifica TERMODEL-PROJECT-TEXT-V1 né lo stack Undo/Redo.
let cadGeneratedExecutiveOverlay = null;
// Diagnostica geometrica restituita dal Service: runtime puro, non entra
// nello SVG del progetto e non rende il CAD dirty.
let cadServiceGeometryErrorState = null;
const CAD_SNAP_DISTANCE = 12;
const CAD_JOIN_EPSILON = 0.05;
const CAD_CALIBRATION_ORTHO_EPSILON = 0.05;
const CAD_BACKGROUND_MIDPOINT_MIN_CM = 5;
const CAD_BACKGROUND_MIDPOINT_MAX_CM = 20;

const COMPONENTI = [
  ['Parete', true],
  ['Pavimento', true],
  ['Soffitto', true],
  ['Finestra', true],
  ['Ponte', true],
  ['Falda', true],
  ['Mansardato', true],
  ['Pannelli', false]
];

const CONFINI = [
  ['Esterno', true],
  ['Terreno', true],
  ['AmbienteNonClimatizzato', true],
  ['AmbienteClimatizzato', true],
  ['StessaZona', true]
];

const SEPARAZIONE = [
  ['Separatori', true],
  ['NonSeparatori', true],
  ['Fittizie', false]
];

const COMMAND_HELP = {
  'Benvenuto': {
    title: 'Termodel — modalità esplorazione',
    body: `
      <p><strong>Esplora liberamente:</strong> questa pagina riproduce l'interfaccia di Termodel e visualizza un vero modello generato dal programma.</p>
      <p>Termodel parte da un disegno schematico CAD, ricostruisce il modello termico 3D, rileva automaticamente molti confini tra ambienti, gestisce locali mansardati e genera ponti termici; il risultato può essere esportato nel formato XML Nazionale.</p>
      <p class="command-help-note">Nella WebApp i comandi non modificano il tuo computer e non avviano AutoCAD: cliccandoli scopri cosa fanno nel programma reale.</p>
    `
  },
  'File': {
    title: 'Menu File',
    body: '<p>Raccoglie le operazioni sul progetto: creazione, apertura, trasferimento ZIP, importazione/esportazione XML e uscita verso formati BIM.</p>'
  },
  'Nuovo': {
    title: 'File → Nuovo',
    body: '<p>Crea un nuovo progetto Termodel scegliendo cartella, nome e dati/modelli di partenza. Nel normale flusso, dopo la creazione si prepara o si disegna il DXF del progetto e poi si genera il modello.</p>'
  },
  'Apri...': {
    title: 'File → Apri',
    body: '<p>Apre dal computer un file <code>TERMODEL-PROJECT-TEXT-V1</code> e lo rende progetto corrente. Non richiede il WebService.</p>'
  },
  'Apri esempio...': {
    title: 'File → Apri esempio',
    body: '<p>Mostra gli esempi Termodel consolidati nel catalogo pubblico e apre quello selezionato usando lo stesso loader del ProjectBrowser.</p>'
  },
  'Carica progetto ZIP': {
    title: 'File → Carica progetto ZIP',
    body: '<p>Importa un progetto Termodel impacchettato in ZIP, lo estrae, lo imposta come progetto corrente e lo aggiorna. È utile per trasferire un progetto completo tra computer o utenti.</p>'
  },
  'Salva': {
    title: 'File → Salva',
    body: '<p>Ricostruisce il progetto corrente e scarica localmente il file unico <code>TERMODEL-PROJECT-TEXT-V1</code>. Il progetto non viene salvato su Render.</p>'
  },
  'Salva progetto ZIP': {
    title: 'File → Salva progetto ZIP',
    body: '<p>Raccoglie la cartella del progetto corrente in un archivio ZIP, utile per backup, trasferimento o assistenza.</p>'
  },
  'Salva con nome': {
    title: 'File → Salva con nome',
    body: '<p>Chiede un nuovo nome file e scarica localmente il progetto corrente. Il WebService non viene usato per il salvataggio.</p>'
  },
  'Importa XML nazionale': {
    title: 'File → Importa XML nazionale',
    body: '<p>Seleziona un XML Nazionale, lo copia come <code>xml/input.xml</code> del progetto e aggiorna i dati Termodel a partire dal file importato.</p>'
  },
  'Esporta XML nazionale': {
    title: 'File → Esporta XML nazionale',
    body: '<p>Produce il file XML Nazionale completo del modello termico. Il file può poi essere importato nei programmi di calcolo energetico compatibili con questo standard.</p>'
  },
  'Esporta BIM (ifc)': {
    title: 'File → Esporta BIM (IFC)',
    body: '<p>Esporta il modello in formato IFC per l\'interscambio BIM e l\'uso del modello geometrico in altri strumenti compatibili.</p>'
  },
  'Modifica': {
    title: 'Menu Modifica',
    body: '<p>Da qui si raggiungono il disegno CAD del progetto e gli archivi tecnici che descrivono pareti, finestre, ponti termici, confini, zone e dati climatici.</p>'
  },
  'Visualizza/Edita disegni di input nel CAD': {
    title: 'Visualizza / Edita disegni di input nel CAD',
    body: '<p>Apre il disegno del progetto in AutoCAD/AutoCAD LT. Termodel rimane aperto: dopo le modifiche si salva il DXF dal CAD e si torna in Termodel con <strong>Aggiorna Modello</strong>.</p>'
  },
  'Archivio dati climatici': {
    title: 'Archivio dati climatici',
    body: '<p>Apre l\'archivio dedicato ai dati climatici utilizzati dal progetto. La pagina “Info Termodel GPT” non descrive i singoli campi di questo archivio.</p>'
  },
  'Archivio Pareti': {
    title: 'Archivio Pareti',
    body: '<p>Gestisce le tipologie di parete e i relativi dati alfanumerici usati nel modello e nell\'XML.</p>'
  },
  'Archivio Finestre': {
    title: 'Archivio Finestre',
    body: '<p>Gestisce le tipologie di finestra associate ai blocchi FIN inseriti sulle pareti del disegno CAD.</p>'
  },
  'Archivio Ponti termici': {
    title: 'Archivio Ponti termici',
    body: '<p>Gestisce i dati dei ponti termici. Termodel può inoltre generarne automaticamente lungo spigoli orizzontali, verticali e contorni delle finestre.</p>'
  },
  'Archivio Confini': {
    title: 'Archivio Confini',
    body: '<p>Gestisce i tipi di confine. Termodel è in grado di rilevare automaticamente confini verticali tra ambienti e orizzontali tra piani.</p>'
  },
  'Archivio Zone': {
    title: 'Archivio Zone',
    body: '<p>Gestisce le zone termiche a cui appartengono i locali del modello.</p>'
  },
  'Visualizza': {
    title: 'Menu Visualizza',
    body: '<p>Permette di passare tra modello, archivi e modalità Plugin CAD, oltre alle opzioni di tutor e generazione automatica.</p>'
  },
  'Modello': {
    title: 'Visualizza → Modello',
    body: '<p>Mostra il modello 3D prodotto da Termodel. La generazione comprende analisi DXF, poligonizzazione, estrusione, allineamento dei piani, orientamento, finestre, ponti termici e analisi dei confini.</p>'
  },
  'Archivi': {
    title: 'Visualizza → Archivi',
    body: '<p>Mostra gli archivi alfanumerici del progetto. Qui si configurano e si salvano le proprietà tecniche usate per completare il modello e l\'XML.</p>'
  },
  'Plugin Autocad': {
    title: 'Visualizza → Plugin AutoCAD',
    body: '<p>Riduce Termodel a una finestra compatta, sempre in primo piano, da affiancare al CAD. Serve per impostare e confermare i parametri prima di inserire Pareti, Finestre, Locali, Ponti termici e altri blocchi tramite la toolbar.</p>'
  },
  'Visualizza tutor': {
    title: 'Visualizza tutor',
    body: '<p>Apre l\'area di supporto/tutor. Le istruzioni ufficiali rimandano anche al canale YouTube di Termodel per guide operative e progetti commentati.</p>'
  },
  'Genera il modello all\'avvio': {
    title: 'Genera il modello all’avvio',
    body: '<p>Abilita la rigenerazione automatica del modello quando viene aperto o aggiornato il progetto.</p>'
  },
  'Calcoli': {
    title: 'Menu Calcoli',
    body: '<p>Raccoglie le funzioni collegate ai risultati di calcolo. La documentazione AI pubblica è concentrata soprattutto sul flusso CAD → modello → XML.</p>'
  },
  'Visualizza risultati dell\'ultimo calcolo': {
    title: 'Risultati dell’ultimo calcolo',
    body: '<p>Richiama i risultati disponibili dell\'ultima elaborazione. Nella WebApp la sezione è illustrativa e non esegue il motore di calcolo desktop.</p>'
  },
  'Gestione Piani': {
    title: 'Gestione Piani',
    body: '<p>Configura i piani del progetto: ogni piano è associato a un layer CAD e può avere quota, altezza e proprietà specifiche. I blocchi ALLINEA permettono di ricostruire correttamente la posizione dei piani nello spazio.</p>'
  },
  'Crea piano da raster con AI': {
    title: 'Crea piano da raster con AI',
    body: '<p>Comando attivo nella WebApp: selezioni una pianta, copi le istruzioni Termodel, apri il tuo ChatGPT e alleghi la stessa immagine. Al ritorno puoi incollare il blocco <code>TERMODEL-SVG-TEXT-V1</code>: la WebApp lo decodifica, valida lo SVG, genera un <strong>TermodelWebModel JSON 3D provvisorio</strong> e lo visualizza nel viewer.</p>'
  },
  'Edita nel Cad': {
    title: 'Edita nel CAD — viewer Web',
    body: '<p>Nella WebApp Web apre il confronto 2D: la <strong>pianta pulita</strong> prodotta da GeneraPianta/JSTS viene mostrata in grigio e il <strong>DisegnoInput.svg</strong> viene sovrapposto con linee colorate e più spesse. Il pulsante <strong>Esporta pianta CAD (.DXF)</strong> scarica la geometria ripulita in DXF AutoCAD 2013, in millimetri.</p>'
  },
  'CAD ProjectBrowser': {
    title: 'MyHome3D — CAD 2D',
    body: `
      <p>Stai esplorando la rappresentazione 2D del progetto. Sul dispositivo touch usa <strong>un dito per spostare la tavola</strong> e <strong>due dita per zoomare</strong>.</p>
      <p><strong>Home</strong> torna al modello 3D. <strong>Esplora</strong> apre i controlli del piano e delle rappresentazioni grafiche disponibili.</p>
      <p class="command-help-note">Il CAD del ProjectBrowser è pensato per consultare il progetto in modo semplice e leggibile, senza mostrare la toolbar completa di progettazione desktop.</p>
    `
  },
  'CAD Esplora': {
    title: 'CAD 2D — Esplora',
    body: `
      <p>Il pannello <strong>Esplora</strong> raccoglie i controlli essenziali della tavola 2D.</p>
      <ol>
        <li><strong>Piano</strong>: cambia il piano del progetto visualizzato.</li>
        <li><strong>Sfondo</strong>: mostra o nasconde lo sfondo associato al piano.</li>
        <li><strong>Unifilare input</strong>: mostra o nasconde il disegno tecnico di input.</li>
        <li><strong>Default Mobile degli esempi</strong>: Sfondo OFF, Esecutivo pannelli ON, Unifilare input OFF.</li>
        <li><strong>Filtri</strong>: apre i filtri grafici del modello 3D; le modifiche diventano effettive solo con <strong>Applica</strong>.</li>
      </ol>
      <p>Le scelte agiscono sugli stessi dati e controlli usati dal CAD completo.</p>
    `
  },
  'CAD Piano': {
    title: 'CAD 2D — Piano',
    body: '<p>Il selettore <strong>Piano</strong> cambia realmente il piano corrente del progetto e rifiltra la geometria 2D visualizzata. La sorgente è l\'archivio <strong>Piani</strong> del progetto Termodel.</p>'
  },
  'CAD Sfondo': {
    title: 'CAD 2D — Sfondo',
    body: '<p><strong>Sfondo</strong> mostra o nasconde l\'eventuale riferimento grafico locale del piano corrente. È un aiuto alla lettura e non sostituisce la geometria tecnica del progetto.</p>'
  },
  'CAD Unifilare input': {
    title: 'CAD 2D — Unifilare input',
    body: '<p><strong>Unifilare input</strong> mostra o nasconde la geometria SVG tecnica del piano corrente, cioè il disegno di input da cui Termodel ricava la rappresentazione del progetto.</p>'
  },
  'Aggiorna Modello': {
    title: 'Aggiorna Modello',
    body: `
      <p>È il cuore del flusso Termodel. Dopo aver salvato il DXF, il programma:</p>
      <ol>
        <li>analizza il disegno e poligonizza i locali;</li>
        <li>estrude pareti, pavimenti, soffitti e locali mansardati;</li>
        <li>allinea e orienta i piani;</li>
        <li>genera finestre e ponti termici, compresi quelli automatici;</li>
        <li>analizza i confini tra volumi;</li>
        <li>prepara l\'output XML.</li>
      </ol>
      <p class="command-help-note">Nella WebApp il pulsante ricarica il modello Web già esportato, così puoi vedere il risultato senza installare Termodel.</p>
    `
  },
  'Mostra Filtri Grafici': {
    title: 'Mostra Filtri Grafici',
    body: '<p>Mostra o nasconde il pannello di filtraggio del modello. Puoi isolare piani, componenti, confini e separazione tra vani direttamente nel viewer 3D.</p>'
  },
  'Informazioni sul modello': {
    title: 'Informazioni sul modello',
    body: '<p>Raccoglie le informazioni generali sul progetto e sul modello caricato. Nella WebApp mostra anche il numero di primitive 3D lette dal JSON Termodel.</p>'
  }
};


COMMAND_HELP['Aggiorna Modello'] = {
  title: 'Aggiorna Modello',
  body: `
    <p>Invia lo stato tecnico corrente del progetto al Termodel Service, esegue il calcolo completo e visualizza l'artifact <strong>model3d</strong> restituito dal server.</p>
    <p>Prima dell'invio, se pareti o finestre importate dall'AI risultano ancora <strong>Da associare</strong>, apre la form di associazione agli archivi Pareti/Finestre e sospende il calcolo finché i collegamenti non sono completati.</p>
    <p>Le categorie selezionate nel menu <strong>Help → Log Aggiorna Modello</strong> controllano il log della singola elaborazione.</p>
    <p>Su PC, <strong>Help → Termodel Service → Usa localhost:5080</strong> permette di inviare le stesse richieste al WebService avviato da Visual Studio; a ogni apertura il default resta il Service Cloud.</p>
  `
};

COMMAND_HELP['Help Termodel Web'] = {
  title: 'Help Termodel Web',
  body: `
    <p>Apre il pannello Help generale della versione Web PC.</p>
    <p>Da qui puoi leggere una panoramica e istruire la tua AI usando la pagina dedicata a Termodel Web, separata dalle istruzioni della vecchia versione Desktop.</p>
  `
};

COMMAND_HELP['Copia progetto negli appunti'] = {
  title: 'Copia progetto negli appunti',
  body: `
    <p>Copia negli appunti il progetto corrente completo nel formato canonico <strong>TERMODEL-PROJECT-TEXT-V1</strong>.</p>
    <p>Serve per incollare direttamente il progetto in una chat AI o in un test controllato, senza passare da Render e senza pubblicare snapshot.</p>
  `
};

let explorationModeEnabled = false;
let commandHelpPanel = null;

function resetDesktopExplorationModeDefault() {
  explorationModeEnabled = false;
  if (helpExplorationMode) {
    helpExplorationMode.defaultChecked = false;
    helpExplorationMode.checked = false;
  }
  hideCommandHelp();
}

function installCommandHelpStyles() {
  if (document.getElementById('commandHelpStyles')) return;
  const style = document.createElement('style');
  style.id = 'commandHelpStyles';
  style.textContent = `
    .command-help-panel {
      position: absolute;
      left: 18px;
      top: 42px;
      width: min(420px, calc(100% - 285px));
      max-height: calc(100% - 70px);
      overflow: auto;
      z-index: 2100;
      background: rgba(250,250,250,.97);
      border: 1px solid #888;
      box-shadow: 3px 4px 14px rgba(0,0,0,.24);
      color: #111;
    }
    .command-help-panel[hidden] { display: none; }
    .command-help-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 9px;
      background: #e7e7e7;
      border-bottom: 1px solid #aaa;
    }
    .command-help-head strong { font-size: 13px; }
    .command-help-close {
      border: 1px solid #999;
      background: #f7f7f7;
      width: 23px;
      height: 22px;
      line-height: 18px;
      padding: 0;
      cursor: pointer;
    }
    .command-help-body {
      padding: 10px 12px 8px;
      font-size: 12px;
      line-height: 1.42;
    }
    .command-help-body p { margin: 0 0 8px; }
    .command-help-body ol { margin: 5px 0 9px 20px; padding: 0; }
    .command-help-note {
      background: #fff8cf;
      border: 1px solid #d7c46b;
      padding: 6px 7px;
    }
    .command-help-links {
      padding: 7px 12px 9px;
      border-top: 1px solid #ccc;
      background: #f4f4f4;
      font-size: 11px;
    }
    .command-help-links a { margin-right: 12px; }
  `;
  document.head.appendChild(style);
}

function createCommandHelpPanel() {
  installCommandHelpStyles();
  const panel = document.createElement('section');
  panel.id = 'commandHelpPanel';
  panel.className = 'command-help-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="command-help-head">
      <strong id="commandHelpTitle">Termodel</strong>
      <button class="command-help-close" id="commandHelpClose" type="button" aria-label="Chiudi">×</button>
    </div>
    <div class="command-help-body" id="commandHelpBody"></div>
    <div class="command-help-links">
      <a href="../infotermodelGPT.html" target="_blank" rel="noopener">Info Termodel GPT</a>
      <a href="https://www.youtube.com/@Termodel" target="_blank" rel="noopener">Video tutorial</a>
    </div>
  `;
  document.querySelector('.workspace').appendChild(panel);
  panel.querySelector('#commandHelpClose')?.addEventListener('click', () => {
    panel.hidden = true;
  });
  return panel;
}

function hideCommandHelp() {
  if (commandHelpPanel) commandHelpPanel.hidden = true;
}

function buildGenericCommandHelpInfo(element, key = '') {
  const label = String(
    key ||
    element?.getAttribute?.('aria-label') ||
    element?.getAttribute?.('title') ||
    element?.dataset?.action ||
    element?.dataset?.archive ||
    element?.textContent ||
    element?.id ||
    'Funzione Termodel'
  ).replace(/\s+/g, ' ').trim();

  const safeLabel = label || 'Funzione Termodel';
  const tag = element?.tagName?.toLowerCase() || '';
  const type = String(element?.getAttribute?.('type') || '').toLowerCase();

  if (element?.dataset?.archive) {
    return {
      title: safeLabel,
      body:
        '<p>Apre l’archivio <strong>' + safeLabel + '</strong> del progetto corrente.</p>' +
        '<p>Gli archivi contengono i dati tecnici usati da Termodel. L’azione continua normalmente anche con la Modalità esplorazione attiva.</p>'
    };
  }

  if (tag === 'select') {
    return {
      title: safeLabel,
      body:
        '<p>Seleziona il valore della funzione <strong>' + safeLabel + '</strong>.</p>' +
        '<p>La Modalità esplorazione mostra questa spiegazione ma non modifica il comportamento del comando.</p>'
    };
  }

  if (type === 'checkbox' || type === 'radio' || tag === 'label') {
    return {
      title: safeLabel,
      body:
        '<p>Attiva, disattiva o seleziona l’opzione <strong>' + safeLabel + '</strong>.</p>' +
        '<p>La selezione viene applicata normalmente: la Modalità esplorazione aggiunge soltanto l’informazione contestuale.</p>'
    };
  }

  if (element?.classList?.contains('tab')) {
    return {
      title: safeLabel,
      body:
        '<p>Mostra la sezione <strong>' + safeLabel + '</strong> dell’interfaccia Termodel.</p>' +
        '<p>Il cambio di sezione avviene normalmente mentre questa spiegazione resta disponibile.</p>'
    };
  }

  if (element?.closest?.('.cad-toolbar, .cad-tool-menu, .cad-tool-dropdown') ||
      String(element?.id || '').startsWith('cad')) {
    return {
      title: safeLabel,
      body:
        '<p>Esegue il comando <strong>' + safeLabel + '</strong> nel CAD 2D Web di Termodel.</p>' +
        '<p>La Modalità esplorazione non blocca il comando: serve a spiegare la funzione selezionata mentre continui a lavorare.</p>'
    };
  }

  return {
    title: safeLabel,
    body:
      '<p>Hai selezionato la funzione <strong>' + safeLabel + '</strong>.</p>' +
      '<p>La Modalità esplorazione lascia eseguire normalmente il comando e mostra qui la spiegazione disponibile per la funzione cliccata.</p>'
  };
}

function showCommandHelp(key, element = null) {
  if (!explorationModeEnabled) return;

  const normalizedKey = String(key || '').trim();
  const info =
    COMMAND_HELP[normalizedKey] ||
    buildGenericCommandHelpInfo(element, normalizedKey);

  if (!commandHelpPanel) commandHelpPanel = createCommandHelpPanel();
  commandHelpPanel.querySelector('#commandHelpTitle').textContent = info.title;
  commandHelpPanel.querySelector('#commandHelpBody').innerHTML = info.body;
  commandHelpPanel.hidden = false;
}

function helpKeyFromElement(element) {
  if (!element) return '';

  const direct =
    element.dataset?.helpKey ||
    element.dataset?.action ||
    element.getAttribute?.('aria-label') ||
    element.getAttribute?.('title') ||
    '';

  if (direct) return String(direct).trim();

  if (element.dataset?.archive)
    return 'Archivio ' + String(element.dataset.archive).trim();

  const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
  return text || String(element.id || '').trim();
}

function desktopExplorationControlFromTarget(target) {
  if (!(target instanceof Element))
    return null;

  if (target.closest('#commandHelpPanel'))
    return null;

  const control = target.closest(
    'button, input:not([type="hidden"]), select, summary, label, .tab'
  );

  if (!control || !appRoot?.contains(control))
    return null;

  if (control === helpExplorationMode ||
      control.closest('#helpMenu')?.querySelector('#helpExplorationMode') === control)
    return null;

  return control;
}

function handleDesktopExplorationHelp(event) {
  if (!explorationModeEnabled || TERMODEL_ANDROID_DEVICE)
    return;

  const control = desktopExplorationControlFromTarget(event.target);
  if (!control)
    return;

  // Non intercetta né blocca il comando: informa soltanto.
  const key = helpKeyFromElement(control);
  showCommandHelp(key, control);
}

function selectedTermodelLogCategories() {
  return TERMODEL_LOG_CATEGORIES.filter(category => {
    const checkbox = document.querySelector('[data-log-category="' + category + '"]');
    return checkbox?.checked === true;
  });
}

function selectedTermodelSpiralEngine() {
  return String(helpSpiralEngine?.value || '').trim();
}

function selectedTermodelSpiralClosure() {
  return helpSpiralClosure?.checked !== false;
}

function buildTermodelCalculationPath() {
  const categories = selectedTermodelLogCategories();
  const query = new URLSearchParams();
  if (!categories.length) {
    query.set('logEnabled', 'false');
  } else {
    query.set('logEnabled', 'true');
    query.set('logCategories', categories.join(','));
  }

  const spiralEngine = selectedTermodelSpiralEngine();
  if (spiralEngine)
    query.set('spiralEngine', spiralEngine);

  if (spiralEngine === 'Vittorio_revisionato')
    query.set('spiralClosure', selectedTermodelSpiralClosure() ? 'true' : 'false');

  return '/api/calculations?' + query.toString();
}

function syncCopyTermodelLogAvailability() {
  if (!helpCopyLogClipboard) return;
  helpCopyLogClipboard.disabled =
    !lastTermodelLogText ||
    !currentProjectId ||
    lastTermodelLogProjectId !== currentProjectId;
}

function clearCurrentTermodelLogCache() {
  lastTermodelLogText = '';
  lastTermodelLogProjectId = '';
  syncCopyTermodelLogAvailability();
}

async function refreshCurrentTermodelLog(projectId) {
  clearCurrentTermodelLogCache();

  if (!projectId || selectedTermodelLogCategories().length === 0)
    return '';

  const response = await fetchTermodelService(
    '/api/projects/' + encodeURIComponent(projectId) + '/logs/termodel',
    { cache: 'no-store' }
  );
  if (!response.ok)
    return '';

  const text = await response.text();
  if (!text.trim())
    return '';

  lastTermodelLogText = text;
  lastTermodelLogProjectId = String(projectId);
  syncCopyTermodelLogAvailability();
  return text;
}

async function copyCurrentTermodelLogToClipboard() {
  syncCopyTermodelLogAvailability();
  if (!lastTermodelLogText || lastTermodelLogProjectId !== currentProjectId)
    throw new Error('Nessun log aggiornato disponibile per il progetto corrente.');

  const copied = await copyTextToClipboard(lastTermodelLogText, 'il log Termodel');
  if (!copied)
    throw new Error('Il browser non ha consentito la copia del log negli appunti.');

  setMainAiStatus('✓ Log Termodel copiato negli appunti.');
  return lastTermodelLogText;
}

function projectBrowserResourceUrl(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  return new URL(value, window.location.href).href;
}

async function loadProjectBrowserExamples() {
  if (projectBrowserExamplesPromise)
    return projectBrowserExamplesPromise;

  projectBrowserExamplesPromise = fetch(
    PROJECT_BROWSER_EXAMPLES_URL + '?t=' + Date.now(),
    { cache: 'no-store' }
  )
    .then(async response => {
      if (!response.ok)
        throw new Error('Catalogo esempi HTTP ' + response.status);

      const catalog = await response.json();
      if (catalog?.format !== 'TERMODEL-PROJECT-BROWSER-CATALOG-V1' ||
          !Array.isArray(catalog.examples))
        throw new Error('Catalogo esempi ProjectBrowser non valido.');

      projectBrowserExamples = catalog.examples
        .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
        .map(item => ({
          id: String(item.id).trim(),
          name: String(item.name).trim(),
          description: String(item.description || '').trim(),
          model3d: String(item.model3d || '').trim(),
          project: String(item.project || '').trim(),
          geometry: String(item.geometry || '').trim(),
          executive: item.executive === true,
          executiveSvg: String(item.executiveSvg || '').trim(),
          executiveProvenance:
            item.executiveProvenance && typeof item.executiveProvenance === 'object'
              ? { ...item.executiveProvenance }
              : null,
          background:
            item.background && typeof item.background === 'object'
              ? {
                  url: String(item.background.url || '').trim(),
                  id: String(item.background.id || 'BG001').trim(),
                  plane: String(item.background.plane || '').trim(),
                  layer: String(item.background.layer || '').trim(),
                  fileName: String(item.background.fileName || '').trim(),
                  kind: String(item.background.kind || 'raster').trim(),
                  mimeType: String(item.background.mimeType || 'image/jpeg').trim(),
                  x: Number(item.background.x),
                  y: Number(item.background.y),
                  width: Number(item.background.width),
                  height: Number(item.background.height),
                  opacity: Number(item.background.opacity),
                  preserveAspectRatio: String(item.background.preserveAspectRatio || 'xMidYMid meet').trim(),
                  coverageReference: item.background.coverageReference === true,
                  grayscale: item.background.grayscale === true
                }
              : null,
          default: item.default === true
        }))
        .filter(item =>
          item.id &&
          item.name &&
          (item.model3d || item.project || item.geometry)
        );

      return projectBrowserExamples;
    })
    .catch(error => {
      projectBrowserExamplesPromise = null;
      projectBrowserExamples = [];
      throw error;
    });

  return projectBrowserExamplesPromise;
}

function syncInitialModelDesktopGateControls() {
  if (TERMODEL_ANDROID_DEVICE || !appRoot) return;

  if (initialModelExplorationLocked) {
    appRoot.querySelectorAll('button:disabled').forEach(button => {
      if (!button.dataset.initialGateWasDisabled)
        button.dataset.initialGateWasDisabled = 'true';
      button.disabled = false;
    });
    return;
  }

  appRoot.querySelectorAll('button').forEach(button => {
    if (button.dataset.initialGateWasDisabled !== 'true') return;
    button.disabled = true;
    delete button.dataset.initialGateWasDisabled;
  });
}

function setInitialModelExplorationLocked(locked) {
  initialModelExplorationLocked = Boolean(locked);

  if (modelPage)
    modelPage.dataset.explorable = initialModelExplorationLocked ? 'false' : 'true';

  const toggle = document.getElementById('androidExploreToggle');
  if (toggle) {
    toggle.title = initialModelExplorationLocked
      ? 'Seleziona un esempio oppure importa dagli appunti un progetto realizzato con AI.'
      : 'Esplora disegno di input ed esecutivo pannelli oppure importa un progetto AI.';
  }

  syncInitialModelDesktopGateControls();
}

function closeProjectExploreDialog(result = null) {
  if (projectExploreModal) {
    projectExploreModal.classList.remove('visible');
    projectExploreModal.setAttribute('aria-hidden', 'true');
  }
  if (projectExploreDialogResolver) {
    const resolve = projectExploreDialogResolver;
    projectExploreDialogResolver = null;
    resolve(result);
  }
}

async function openProjectExploreDialog() {
  const examples = await loadProjectBrowserExamples();
  if (!examples.length) {
    window.alert('Nessun esempio consolidato disponibile.');
    return null;
  }

  if (!projectExploreModal || !projectExploreExamples)
    throw new Error('Form selezione esempi non disponibile.');

  if (projectExploreDialogResolver)
    closeProjectExploreDialog(null);

  projectExploreExamples.replaceChildren();
  if (projectExploreStatus)
    projectExploreStatus.textContent = '';

  examples.forEach(example => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-explore-example';
    button.dataset.exampleId = example.id;

    const title = document.createElement('strong');
    title.textContent = example.name;
    button.appendChild(title);

    if (example.description) {
      const description = document.createElement('small');
      description.textContent = example.description;
      button.appendChild(description);
    }

    button.addEventListener('click', async () => {
      projectExploreExamples.querySelectorAll('button').forEach(item => {
        item.disabled = true;
      });
      if (projectExploreStatus)
        projectExploreStatus.textContent = 'Caricamento ' + example.name + '…';

      try {
        await loadProjectBrowserExample(example.id, null);
        setMainAiStatus('✓ Esempio aperto: ' + example.name);
        closeProjectExploreDialog(example);
      } catch (error) {
        console.error('Caricamento esempio ProjectBrowser non riuscito:', error);
        if (projectExploreStatus)
          projectExploreStatus.textContent = 'Errore esempio: ' + (error?.message || error);
        projectExploreExamples.querySelectorAll('button').forEach(item => {
          item.disabled = false;
        });
      }
    });

    projectExploreExamples.appendChild(button);
  });

  projectExploreModal.classList.add('visible');
  projectExploreModal.setAttribute('aria-hidden', 'false');
  projectExploreExamples.querySelector('button')?.focus();

  return await new Promise(resolve => {
    projectExploreDialogResolver = resolve;
  });
}

async function openProjectBrowserExampleFromMenu() {
  return await openProjectExploreDialog();
}

function currentProjectBrowserExample() {
  return projectBrowserExamples.find(
    item => item.id === activeProjectBrowserExampleId
  ) || null;
}

function cadShortCommit(value) {
  const commit = String(value || '').trim();
  return commit ? commit.slice(0, 8) : 'n/d';
}

function cadSpiralEngineLabel(value) {
  const engine = String(value || '').trim();
  if (!engine) return 'n/d';
  return engine.toUpperCase() === 'GPT' ? 'GPT / SpiraliGPT' : engine;
}

function cadUpdateExecutiveProvenance() {
  if (!cadExecutiveProvenance) return;

  const overlay = cadGeneratedExecutiveOverlay;
  const visible =
    Boolean(overlay) &&
    cadShowGeneratedExecutive?.checked !== false;

  if (!visible) {
    cadExecutiveProvenance.hidden = true;
    cadExecutiveProvenance.textContent = '';
    cadExecutiveProvenance.classList.remove('consolidated', 'runtime');
    cadExecutiveProvenance.removeAttribute('title');
    return;
  }

  const provenance = overlay.provenance || {};
  const consolidated = overlay.sourceType === 'example-static';
  const generator = String(provenance.generator || 'Termodel Service').trim();
  const engine = cadSpiralEngineLabel(
    provenance.spiralEngine || termodelServiceRuntimeEngine
  );
  const serviceCommit =
    provenance.serviceCommit || termodelServiceRuntimeCommit || '';
  const projectId = String(overlay.projectId || '').trim();
  const stale = Boolean(overlay.stale);

  const head = document.createElement('strong');
  head.textContent = consolidated
    ? 'ESECUTIVO PANNELLI · CONSOLIDATO NELL’ESEMPIO'
    : 'ESECUTIVO PANNELLI · CALCOLO CORRENTE · NON CONSOLIDATO';

  const generated = document.createElement('span');
  generated.textContent =
    'Generato da: ' + generator +
    ' · motore ' + engine +
    ' · Service ' + cadShortCommit(serviceCommit);

  const detail = document.createElement('span');
  if (consolidated) {
    const consolidatedCommit = cadShortCommit(provenance.consolidatedCommit);
    const date = String(provenance.generatedDate || '').trim();
    detail.textContent =
      'Consolidato: commit ' + consolidatedCommit +
      (date ? ' · ' + date : '');
  } else {
    detail.textContent =
      'projectId ' + (projectId ? projectId.slice(0, 12) : 'n/d') +
      (stale ? ' · ATTENZIONE: artifact non aggiornato' : ' · artifact ultimo calcolo');
  }

  cadExecutiveProvenance.replaceChildren(head, generated, detail);
  cadExecutiveProvenance.hidden = false;
  cadExecutiveProvenance.classList.toggle('consolidated', consolidated);
  cadExecutiveProvenance.classList.toggle('runtime', !consolidated);

  const fullDetails = [
    consolidated ? 'Stato: consolidato nell’esempio' : 'Stato: calcolo corrente non consolidato',
    'Generatore: ' + generator,
    'Motore: ' + engine,
    'Service commit: ' + (serviceCommit || 'n/d')
  ];
  if (consolidated) {
    fullDetails.push(
      'Commit consolidamento: ' + (provenance.consolidatedCommit || 'n/d'),
      'Workflow: ' + (provenance.workflowRun || 'n/d'),
      'Data: ' + (provenance.generatedDate || 'n/d')
    );
  } else {
    fullDetails.push('ProjectId: ' + (projectId || 'n/d'));
    if (stale) fullDetails.push('Artifact: non aggiornato');
  }
  cadExecutiveProvenance.title = fullDetails.join('\n');
}

// Default CAD degli esempi distinto esplicitamente fra Mobile e Desktop.
function applyProjectBrowserCadInitialSetup() {
  const executiveAvailable = cadGeneratedExecutiveAvailable();

  if (cadShowGeneratedExecutive)
    cadShowGeneratedExecutive.disabled = !executiveAvailable;

  if (TERMODEL_ANDROID_DEVICE) {
    // Default richiesto per MyHome3D/Mobile quando si carica un esempio:
    // mostra subito l'esecutivo consolidato, senza sfondo e senza unifilare.
    if (cadShowGeneratedExecutive)
      cadShowGeneratedExecutive.checked = executiveAvailable;
    if (cadShowInput)
      cadShowInput.checked = false;
    if (cadShowBackground)
      cadShowBackground.checked = false;
  } else {
    // Il default Mobile non deve propagarsi alla versione desktop.
    if (cadShowGeneratedExecutive)
      cadShowGeneratedExecutive.checked = false;
    if (cadShowInput)
      cadShowInput.checked = true;
    if (cadShowBackground)
      cadShowBackground.checked = true;
  }

  applyCadLayerVisibility();
  cadUpdateControls();
  refreshAndroidCadExploreControls();
}

function syncAndroidExampleCadAvailability(singleLineButton = null) {
  const current = currentProjectBrowserExample();
  const exampleHasCad = Boolean(current?.project || current?.geometry);
  const projectHasCad =
    structuredProjectActive &&
    Boolean(cadWorkingDoc || validatedSvg);
  const hasCad = exampleHasCad || projectHasCad;
  const hasExecutive =
    (exampleHasCad && current?.executive === true) ||
    cadGeneratedExecutiveAvailable();

  const singleLine =
    singleLineButton ||
    document.getElementById('androidExploreSingleLine');

  if (singleLine) {
    singleLine.disabled = !hasCad;
    singleLine.title = hasCad
      ? ''
      : (current
          ? 'Questo esempio dispone per ora soltanto del modello 3D.'
          : (structuredProjectActive
              ? 'Il progetto corrente non contiene un disegno unifilare disponibile.'
              : 'Seleziona un esempio oppure importa un progetto realizzato con AI.'));
  }

  const executiveButton = document.getElementById('androidExploreExecutive');
  if (executiveButton) {
    executiveButton.disabled = !hasExecutive;
    executiveButton.title = hasExecutive
      ? (current?.executiveSvg
          ? 'Mostra l\'esecutivo pannelli consolidato locale, senza interrogare il Service.'
          : 'Mostra l\'esecutivo pannelli disponibile nel CAD2D.')
      : (current
          ? 'Questo esempio non dispone di un esecutivo pannelli.'
          : 'Il progetto corrente non dispone ancora di un esecutivo pannelli.');
  }

  refreshAndroidCadExploreControls();
}

async function loadProjectBrowserStaticExecutive(example, options = {}) {
  const silent = options.silent === true;
  if (!example?.executiveSvg) return false;

  try {
    const response = await fetch(
      projectBrowserResourceUrl(example.executiveSvg) + '?t=' + Date.now(),
      { cache: 'no-store' }
    );
    if (!response.ok)
      throw new Error('Esecutivo esempio HTTP ' + response.status);

    const svgText = await response.text();
    const parsed = cadParseGeneratedExecutiveSvg(svgText);

    cadGeneratedExecutiveOverlay = {
      projectId: currentProjectId || '',
      exampleId: example.id,
      sourceType: 'example-static',
      provenance: example.executiveProvenance || null,
      svgText: parsed.svgText,
      sourcePath: example.executiveSvg,
      stale: false,
      primitiveCount: parsed.primitiveCount
    };

    if (cadShowGeneratedExecutive)
      cadShowGeneratedExecutive.disabled = false;

    renderCadComparison();
    cadUpdateControls();

    if (!silent) {
      cadSetStatus(
        '✓ Esecutivo pannelli consolidato locale · ' +
        parsed.primitiveCount + ' primitive · nessuna richiesta al Service'
      );
    }
    return true;
  } catch (error) {
    console.error(error);
    cadGeneratedExecutiveOverlay = null;
    if (cadShowGeneratedExecutive) {
      cadShowGeneratedExecutive.checked = false;
      cadShowGeneratedExecutive.disabled = true;
    }
    renderCadComparison();
    cadUpdateControls();
    if (!silent)
      cadSetStatus('Esecutivo pannelli locale non disponibile: ' + (error?.message || error), 'error');
    return false;
  }
}

async function ensureProjectBrowserExecutive() {
  const current = currentProjectBrowserExample();
  if (!current?.executive) return false;
  if (cadGeneratedExecutiveAvailable()) return true;

  if (current.executiveSvg)
    return loadProjectBrowserStaticExecutive(current);

  // Compatibilità con eventuali esempi futuri non ancora consolidati.
  status.textContent = 'Genero l\'esecutivo pannelli dell\'esempio ' + current.name + '…';
  await loadCalculatedModelFromService();
  return cadGeneratedExecutiveAvailable();
}

function openProjectBrowserSingleLine() {
  if (cadShowGeneratedExecutive)
    cadShowGeneratedExecutive.checked = false;
  if (cadShowInput)
    cadShowInput.checked = true;
  if (cadShowBackground)
    cadShowBackground.checked = false;

  activateCadPage();
  applyCadLayerVisibility();
  refreshAndroidCadExploreControls();
}

async function openProjectBrowserExecutive() {
  if (!await ensureProjectBrowserExecutive()) {
    status.textContent = 'Esecutivo pannelli non disponibile per l\'esempio corrente.';
    return false;
  }

  if (cadShowGeneratedExecutive) {
    cadShowGeneratedExecutive.disabled = false;
    cadShowGeneratedExecutive.checked = true;
  }
  if (cadShowInput)
    cadShowInput.checked = false;
  if (cadShowBackground)
    cadShowBackground.checked = false;

  activateCadPage();
  renderCadComparison();
  applyCadLayerVisibility();
  refreshAndroidCadExploreControls();
  return true;
}

async function populateAndroidExploreExamples(select, singleLineButton) {
  if (!select) return;

  select.disabled = true;
  select.replaceChildren();

  const loadingOption = document.createElement('option');
  loadingOption.value = '';
  loadingOption.textContent = 'Caricamento esempi...';
  select.appendChild(loadingOption);

  try {
    const examples = await loadProjectBrowserExamples();

    select.replaceChildren();
    if (!examples.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Nessun esempio disponibile';
      select.appendChild(empty);
      select.disabled = true;
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Scegli esempio…';
    select.appendChild(placeholder);

    examples.forEach(example => {
      const option = document.createElement('option');
      option.value = example.id;
      option.textContent = example.name;
      select.appendChild(option);
    });

    if (!examples.some(example => example.id === activeProjectBrowserExampleId))
      activeProjectBrowserExampleId = '';

    select.value = activeProjectBrowserExampleId || '';
    select.disabled = false;
    syncAndroidExampleCadAvailability(singleLineButton);
  } catch (error) {
    console.error('Catalogo esempi ProjectBrowser non disponibile:', error);
    select.replaceChildren();
    const failed = document.createElement('option');
    failed.value = '';
    failed.textContent = 'Esempi non disponibili';
    select.appendChild(failed);
    select.disabled = true;
  }
}

async function projectBrowserFetchDataUrl(path) {
  const url = projectBrowserResourceUrl(path);
  if (!url) throw new Error('Risorsa sfondo esempio non definita.');

  const response = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!response.ok)
    throw new Error('Sfondo esempio HTTP ' + response.status);

  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossibile leggere lo sfondo dell’esempio.'));
    reader.readAsDataURL(blob);
  });
}

async function attachProjectBrowserBackground(svgText, background) {
  if (!background?.url) return String(svgText || '');

  const dataUrl = await projectBrowserFetchDataUrl(background.url);
  if (!/^data:image\//i.test(dataUrl))
    throw new Error('Lo sfondo dell’esempio non è un’immagine valida.');

  const doc = new DOMParser().parseFromString(String(svgText || ''), 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('Geometria esempio non valida durante l’associazione dello sfondo.');

  const root = doc.documentElement;
  let group = Array.from(root.children).find(
    element => element.localName === 'g' && element.id === 'termodel-backgrounds'
  );

  if (!group) {
    group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', 'termodel-backgrounds');
    group.setAttribute('data-termodel-accessorio', 'SFONDI');
    root.insertBefore(group, root.firstChild);
  }

  Array.from(group.children)
    .filter(element =>
      element.localName === 'image' &&
      cadText(element.getAttribute('data-termodel-piano')) === background.plane
    )
    .forEach(element => element.remove());

  const image = doc.createElementNS(SVG_NS, 'image');
  image.setAttribute('data-termodel-sfondo', '1');
  image.setAttribute('data-termodel-background-id', background.id || 'BG001');
  image.setAttribute('data-termodel-piano', background.plane || 'Unico');
  image.setAttribute('data-termodel-layer', background.layer || background.plane || 'Unico');
  image.setAttribute('data-termodel-sfondo-tipo', background.kind || 'raster');
  image.setAttribute('data-termodel-nome-file', background.fileName || 'sfondo.jpg');

  const numeric = (name, value) => {
    if (Number.isFinite(value)) image.setAttribute(name, String(value));
  };
  numeric('x', background.x);
  numeric('y', background.y);
  numeric('width', background.width);
  numeric('height', background.height);
  numeric('opacity', Number.isFinite(background.opacity) ? background.opacity : 0.72);

  image.setAttribute(
    'preserveAspectRatio',
    background.preserveAspectRatio || 'xMidYMid meet'
  );
  if (background.coverageReference)
    image.setAttribute('data-termodel-copertura-riferimento', '1');
  if (background.grayscale) {
    const opacity = Number.isFinite(background.opacity) ? background.opacity : 0.72;
    image.setAttribute('style', 'filter:grayscale(1);opacity:' + opacity);
  }
  image.setAttribute('href', dataUrl);
  group.appendChild(image);

  return new XMLSerializer().serializeToString(root);
}

function ensureAndroidExampleProgress() {
  if (!TERMODEL_ANDROID_DEVICE || !modelPage)
    return null;

  let panel = document.getElementById('androidExampleProgress');
  if (panel) return panel;

  panel = document.createElement('div');
  panel.id = 'androidExampleProgress';
  panel.className = 'android-example-progress';
  panel.hidden = true;
  panel.innerHTML = `
    <div id="androidExampleProgressText" class="android-example-progress-text"></div>
    <div class="android-example-progress-track" aria-hidden="true">
      <div id="androidExampleProgressFill" class="android-example-progress-fill"></div>
    </div>
  `;
  modelPage.appendChild(panel);
  return panel;
}

function setAndroidExampleProgress(text, percent) {
  const panel = ensureAndroidExampleProgress();
  if (!panel) return;

  if (androidExampleProgressHideTimer) {
    clearTimeout(androidExampleProgressHideTimer);
    androidExampleProgressHideTimer = null;
  }

  const label = panel.querySelector('#androidExampleProgressText');
  const fill = panel.querySelector('#androidExampleProgressFill');
  if (label) label.textContent = String(text || '');
  if (fill) fill.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + '%';
  panel.hidden = false;
}

function hideAndroidExampleProgress(delay = 320) {
  const panel = document.getElementById('androidExampleProgress');
  if (!panel) return;

  if (androidExampleProgressHideTimer)
    clearTimeout(androidExampleProgressHideTimer);

  androidExampleProgressHideTimer = setTimeout(() => {
    panel.hidden = true;
    const label = panel.querySelector('#androidExampleProgressText');
    const fill = panel.querySelector('#androidExampleProgressFill');
    if (label) label.textContent = '';
    if (fill) fill.style.width = '0%';
    androidExampleProgressHideTimer = null;
  }, Math.max(0, delay));
}

async function loadProjectBrowserExample(exampleId, singleLineButton) {
  const id = String(exampleId || '').trim();
  if (!id) return;
  if (loading)
    throw new Error('Viewer ancora in caricamento: riprova tra un istante.');

  const examples = await loadProjectBrowserExamples();
  const example = examples.find(item => item.id === id);
  if (!example)
    throw new Error('Esempio ProjectBrowser non trovato: ' + id);

  loading = true;
  cadGeneratedExecutiveOverlay = null;
  if (cadShowGeneratedExecutive) {
    cadShowGeneratedExecutive.checked = false;
    cadShowGeneratedExecutive.disabled = true;
  }
  status.textContent = 'Caricamento esempio: ' + example.name + '...';
  setAndroidExampleProgress('Sto preparando ' + example.name + '…', 8);

  let completed = false;
  try {
    let renderedByLocalGeometry = false;

    if (example.project) {
      setAndroidExampleProgress('Sto caricando il progetto ' + example.name + '…', 24);
      const projectResponse = await fetch(
        projectBrowserResourceUrl(example.project) + '?t=' + Date.now(),
        { cache: 'no-store' }
      );
      if (!projectResponse.ok)
        throw new Error('Progetto esempio HTTP ' + projectResponse.status);

      const projectText = await projectResponse.text();
      setAndroidExampleProgress('Sto preparando CAD e archivi…', 52);
      await loadProjectTextIntoFrontend(projectText, {
        fileName: example.id + '.termodel.txt',
        buildPreview: !example.model3d
      });
      renderedByLocalGeometry = !example.model3d;
    } else if (example.geometry) {
      setAndroidExampleProgress('Sto caricando l’unifilare di ' + example.name + '…', 24);
      const geometryResponse = await fetch(
        projectBrowserResourceUrl(example.geometry) + '?t=' + Date.now(),
        { cache: 'no-store' }
      );
      if (!geometryResponse.ok)
        throw new Error('Geometria esempio HTTP ' + geometryResponse.status);

      let svgText = await geometryResponse.text();

      if (example.background?.url) {
        setAndroidExampleProgress('Sto caricando lo sfondo del piano…', 38);
        svgText = await attachProjectBrowserBackground(svgText, example.background);
      }

      setAndroidExampleProgress('Sto preparando il progetto esplorabile…', 50);
      await createStructuredProjectFromSvg(svgText);
      currentProjectFileName = example.name + '.termodel.txt';

      if (cadShowBackground)
        cadShowBackground.checked = false;

      setAndroidExampleProgress('Sto generando il 3D dall’unifilare…', 70);
      if (!processSvgText(svgText))
        throw new Error('Impossibile generare l’anteprima 3D dell’esempio.');

      renderedByLocalGeometry = true;
    } else {
      setStructuredProjectState(false);
    }

    if (example.model3d) {
      setAndroidExampleProgress('Sto caricando il modello 3D…', 66);
      const modelResponse = await fetch(
        projectBrowserResourceUrl(example.model3d) + '?t=' + Date.now(),
        { cache: 'no-store' }
      );
      if (!modelResponse.ok)
        throw new Error('Modello esempio HTTP ' + modelResponse.status);

      const data = await modelResponse.json();
      setAndroidExampleProgress('Sto aggiornando la vista 3D…', 84);

      northOrientationDeg = null;
      cadUpdateNorthControls();
      renderModelData(data, {
        mode: 'project',
        label: 'ESEMPIO · ' + example.name,
        renderOrigin: 'local'
      });

      status.textContent =
        'ESEMPIO · ' + example.name + ' · ' +
        (data.primitiveCount ?? data.primitives.length) + ' primitive';
    } else if (renderedByLocalGeometry) {
      status.textContent = 'ESEMPIO · ' + example.name + ' · anteprima locale caricata';
    } else {
      throw new Error('L’esempio non contiene una vista caricabile.');
    }

    setAndroidExampleProgress('Sto completando la visualizzazione…', 94);

    activeProjectBrowserExampleId = example.id;

    if (example.executiveSvg) {
      setAndroidExampleProgress('Sto caricando l’esecutivo consolidato…', 97);
      const executiveLoaded = await loadProjectBrowserStaticExecutive(example, { silent: true });
      if (!executiveLoaded)
        throw new Error('Esecutivo pannelli consolidato non disponibile per ' + example.name + '.');
    }

    setInitialModelExplorationLocked(false);
    applyProjectBrowserCadInitialSetup();
    syncAndroidExampleCadAvailability(singleLineButton);
    activateModelPage();
    resetView();
    requestAnimationFrame(resize);

    setAndroidExampleProgress(example.name + ' pronto', 100);
    completed = true;
  } catch (error) {
    setAndroidExampleProgress('Errore: ' + (error?.message || error), 100);
    hideAndroidExampleProgress(1800);
    throw error;
  } finally {
    loading = false;
    if (completed)
      hideAndroidExampleProgress(420);
  }
}

function installAndroidExploreStyles() {
  if (!TERMODEL_ANDROID_DEVICE || document.getElementById('androidExploreStyles'))
    return;

  const style = document.createElement('style');
  style.id = 'androidExploreStyles';
  style.textContent = `
    .android-explore-box {
      position: absolute;
      right: 8px;
      bottom: 8px;
      z-index: 32;
      display: flex;
      align-items: flex-end;
      gap: 5px;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .android-explore-main,
    .android-explore-action,
    .android-project-plane {
      min-height: 38px;
      border: 1px solid #7f8790;
      border-radius: 5px;
      background: rgba(250,250,250,.94);
      color: #111;
      box-shadow: 0 2px 8px rgba(0,0,0,.24);
      font-size: 13px;
      font-weight: 700;
      touch-action: manipulation;
    }
    .android-explore-main {
      padding: 0 12px;
    }
    .android-desktop-toggle {
      width: 38px;
      min-width: 38px;
      padding: 0;
      display: grid;
      place-items: center;
    }
    .android-desktop-toggle svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }
    .android-project-plane {
      height: 38px;
      width: 100%;
      min-width: 130px;
      max-width: none;
      padding: 0 28px 0 9px;
      background: rgba(250,250,250,.96);
      font-weight: 600;
    }
    .android-explore-menu {
      min-width: 230px;
    }
    .android-explore-field {
      display: grid;
      gap: 4px;
      padding: 4px;
      font-size: 12px;
      font-weight: 700;
      color: #39434d;
    }
    .android-explore-check {
      min-height: 40px;
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 6px 8px;
      border: 1px solid #c5cbd0;
      border-radius: 4px;
      background: #fff;
      color: #111;
      font-size: 13px;
      font-weight: 600;
    }
    .android-explore-check input {
      width: 18px;
      height: 18px;
      margin: 0;
    }
    .android-explore-main.active {
      background: #dff1ff;
      border-color: #4d82a8;
    }
    .android-explore-menu {
      position: absolute;
      right: 0;
      bottom: 44px;
      min-width: 190px;
      display: grid;
      gap: 5px;
      padding: 6px;
      border: 1px solid #7f8790;
      border-radius: 5px;
      background: rgba(244,244,244,.98);
      box-shadow: 0 4px 14px rgba(0,0,0,.28);
    }
    .android-explore-menu[hidden] {
      display: none;
    }
    .android-explore-action {
      width: 100%;
      padding: 7px 10px;
      text-align: left;
      background: linear-gradient(#fff,#e7e7e7);
      font-weight: 600;
    }
    .android-ai-flow-group {
      display: grid;
      grid-template-columns: 1fr 42px;
      gap: 5px;
      padding: 6px;
      border: 1px solid #9aa5ae;
      border-radius: 6px;
      background: #eef5f9;
    }
    .android-ai-flow-group .android-ai-flow-open,
    .android-ai-flow-group .android-ai-flow-copy,
    .android-ai-flow-group .android-ai-flow-import {
      grid-column: 1 / -1;
    }
    .android-ai-flow-title {
      align-self: center;
      padding-left: 2px;
      color: #35424c;
      font-size: 12px;
      font-weight: 800;
    }
    .android-ai-flow-help {
      min-height: 34px;
      border: 1px solid #7f8790;
      border-radius: 5px;
      background: linear-gradient(#fff,#e7e7e7);
      color: #111;
      font-size: 16px;
      font-weight: 800;
    }
    .android-ai-flow-feedback {
      grid-column: 1 / -1;
      min-height: 0;
      color: #31556f;
      font-size: 11px;
      line-height: 1.25;
    }
    .android-ai-flow-feedback:empty {
      display: none;
    }
    .android-example-progress {
      position: absolute;
      left: 50%;
      bottom: 58px;
      z-index: 34;
      width: min(78vw, 390px);
      transform: translateX(-50%);
      padding: 8px 10px;
      border: 1px solid #7f8790;
      border-radius: 7px;
      background: rgba(250,250,250,.96);
      box-shadow: 0 3px 12px rgba(0,0,0,.28);
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .android-example-progress[hidden] {
      display: none;
    }
    .android-example-progress-text {
      margin-bottom: 6px;
      color: #20262c;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
    }
    .android-example-progress-track {
      width: 100%;
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: #d7dce1;
    }
    .android-example-progress-fill {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: #3d7fb1;
      transition: width .16s ease;
    }

    .android-filter-modal {
      position: fixed;
      inset: 0;
      z-index: 220;
      display: grid;
      place-items: center;
      padding: 12px;
      background: rgba(0,0,0,.34);
    }
    .android-filter-modal[hidden] {
      display: none;
    }
    .android-filter-dialog {
      width: min(520px, calc(100vw - 24px));
      max-height: calc(100dvh - 24px);
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
      border: 1px solid #6f7881;
      border-radius: 8px;
      background: #f5f6f7;
      box-shadow: 0 10px 34px rgba(0,0,0,.38);
      font-family: "Segoe UI", Arial, sans-serif;
      color: #20262c;
    }
    .android-filter-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 44px;
      padding: 8px 10px;
      border-bottom: 1px solid #c3c8cd;
      background: linear-gradient(#fff,#e7eaed);
    }
    .android-filter-head strong {
      font-size: 15px;
    }
    .android-filter-close {
      width: 36px;
      height: 36px;
      padding: 0;
      font-size: 22px;
      line-height: 1;
    }
    .android-filter-body {
      min-height: 0;
      overflow: auto;
      padding: 10px;
      -webkit-overflow-scrolling: touch;
    }
    .android-filter-note {
      margin: 0 0 9px;
      color: #56616c;
      font-size: 12px;
      line-height: 1.35;
    }
    .android-filter-sections {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .android-filter-section {
      min-width: 0;
      padding: 8px;
      border: 1px solid #c5cbd0;
      border-radius: 6px;
      background: #fff;
    }
    .android-filter-section h3 {
      margin: 0 0 6px;
      font-size: 13px;
      color: #39434d;
    }
    .android-filter-items {
      display: grid;
      gap: 4px;
    }
    .android-filter-row {
      min-height: 36px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 7px;
      border: 1px solid #e0e3e6;
      border-radius: 4px;
      background: #fafafa;
      font-size: 13px;
    }
    .android-filter-row input {
      width: 19px;
      height: 19px;
      margin: 0;
      flex: 0 0 auto;
    }
    .android-filter-empty {
      padding: 5px 7px;
      color: #78828b;
      font-size: 12px;
    }
    .android-filter-foot {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 8px 10px;
      border-top: 1px solid #c3c8cd;
      background: #eef0f2;
    }
    .android-filter-foot button {
      min-width: 92px;
      min-height: 40px;
      padding: 7px 14px;
      font-weight: 700;
    }
    .android-filter-apply {
      background: linear-gradient(#e8f7ff,#bcdff2);
      border-color: #4d82a8;
    }

    .android-help-modal {
      position: fixed;
      inset: 0;
      z-index: 66;
      display: grid;
      place-items: center;
      padding: 12px;
      background: rgba(0,0,0,.42);
    }
    .android-help-modal[hidden] { display: none; }
    .android-help-dialog {
      width: min(560px, calc(100vw - 24px));
      max-height: calc(100dvh - 24px);
      display: grid;
      grid-template-rows: auto auto auto minmax(0,1fr);
      overflow: hidden;
      border: 1px solid #6f7880;
      border-radius: 8px;
      background: #f7f8f9;
      box-shadow: 0 12px 32px rgba(0,0,0,.34);
      color: #20262c;
    }
    .android-help-head {
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 7px 9px 7px 12px;
      border-bottom: 1px solid #c3c8cd;
      background: #e6e9ec;
    }
    .android-help-head strong { font-size: 15px; }
    .android-help-close {
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid #8a9299;
      border-radius: 5px;
      background: #fff;
      font-size: 23px;
      line-height: 1;
    }
    .android-help-ai {
      min-height: 46px;
      margin: 10px 10px 3px;
      padding: 8px 12px;
      border: 1px solid #477da2;
      border-radius: 6px;
      background: linear-gradient(#eef9ff,#cce7f7);
      color: #173d57;
      font-size: 14px;
      font-weight: 800;
      touch-action: manipulation;
    }
    .android-help-feedback {
      min-height: 22px;
      margin: 0 12px 3px;
      color: #396143;
      font-size: 12px;
      line-height: 1.35;
    }
    .android-help-body {
      min-height: 0;
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      padding: 8px 12px 14px;
      font-size: 13px;
      line-height: 1.48;
      background: #fff;
    }
    .android-help-body p { margin: 0 0 10px; }
    .android-help-body ol { margin: 6px 0 10px 20px; padding: 0; }
    .android-help-body li { margin: 5px 0; }
    .android-help-context {
      display: inline-block;
      margin-bottom: 9px;
      padding: 3px 7px;
      border: 1px solid #c6ccd2;
      border-radius: 999px;
      background: #f0f3f5;
      color: #56616b;
      font-size: 11px;
      font-weight: 700;
    }

    @media (orientation: landscape) and (max-height: 520px) {
      .android-filter-modal {
        padding: 8px;
      }
      .android-filter-dialog {
        width: min(720px, calc(100vw - 16px));
        max-height: calc(100dvh - 16px);
      }
      .android-filter-head {
        min-height: 38px;
        padding: 5px 8px;
      }
      .android-filter-close {
        width: 32px;
        height: 32px;
      }
      .android-filter-body {
        padding: 7px 8px;
      }
      .android-filter-note {
        margin-bottom: 6px;
      }
      .android-filter-sections {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }
      .android-filter-section {
        padding: 6px;
      }
      .android-filter-row {
        min-height: 32px;
        padding: 3px 6px;
      }
      .android-filter-foot {
        padding: 5px 8px;
      }
      .android-filter-foot button {
        min-height: 36px;
      }
      .android-help-dialog {
        width: min(760px, calc(100vw - 16px));
        max-height: calc(100dvh - 16px);
      }
      .android-help-head {
        min-height: 38px;
        padding: 4px 7px 4px 10px;
      }
      .android-help-close {
        width: 32px;
        height: 32px;
      }
      .android-help-ai {
        min-height: 38px;
        margin: 6px 8px 2px;
        padding: 5px 10px;
      }
      .android-help-feedback {
        min-height: 18px;
        margin: 0 10px 2px;
      }
      .android-help-body {
        padding: 6px 10px 9px;
        line-height: 1.35;
      }
    }
  `;
  document.head.appendChild(style);
}

let androidAiFlowHelpModal = null;

function createAndroidAiFlowHelpDialog() {
  if (!TERMODEL_ANDROID_DEVICE)
    return null;

  if (androidAiFlowHelpModal)
    return androidAiFlowHelpModal;

  const modal = document.createElement('div');
  modal.id = 'androidAiFlowHelpModal';
  modal.className = 'android-help-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="android-help-dialog" role="dialog" aria-modal="true"
      aria-labelledby="androidAiFlowHelpTitle">
      <header class="android-help-head">
        <strong id="androidAiFlowHelpTitle">Usare l'AI con Termodel</strong>
        <button type="button" class="android-help-close" aria-label="Chiudi Help AI">×</button>
      </header>
      <div class="android-help-body">
        <p>Nel gruppo <strong>AI</strong> puoi aprire direttamente ChatGPT già programmato per Termodel oppure usare la copia manuale.</p>
        <ol>
          <li>Premi <strong>Apri GPT con programmazione AI</strong> per aprire ChatGPT con lo stesso bootstrap usato dalla versione PC.</li>
          <li>In alternativa usa <strong>Copia istruzione AI negli appunti</strong> per ChatGPT, Gemini, DeepSeek o un altro assistente.</li>
          <li>Descrivi il progetto oppure allega la pianta/PDF che vuoi elaborare.</li>
          <li>Quando l'AI restituisce <strong>Apri il progetto in Termodel</strong>, tocca direttamente quel link.</li>
          <li>In alternativa copia negli appunti <strong>l'intero payload</strong>, torna in MyHome3D e premi <strong>Importa progetto realizzato con AI dagli appunti</strong>.</li>
        </ol>
        <p><strong>Formato:</strong> per una nuova geometria l'AI deve restituire <code>TERMODEL-SVG-TEXT-V1</code>. Un progetto Termodel completo corrente può usare <code>TERMODEL-PROJECT-TEXT-V1</code>. Dalla versione 1.48 gli stessi dati possono arrivare anche tramite Link AI V1.</p>
        <p><strong>Non incollare XML generico o XML Nazionale</strong> in Importa da AI: appartengono a flussi diversi.</p>
        <p>L'istruzione copiata è volutamente breve: rimanda sempre alle istruzioni aggiornate pubblicate su <code>https://www.termodel.it/ai/</code>.</p>
      </div>
    </section>
  `;

  document.body.appendChild(modal);
  modal.querySelector('.android-help-close')?.addEventListener('click', closeAndroidAiFlowHelpDialog);
  modal.addEventListener('click', event => {
    if (event.target === modal)
      closeAndroidAiFlowHelpDialog();
  });

  androidAiFlowHelpModal = modal;
  return modal;
}

function openAndroidAiFlowHelpDialog() {
  const modal = createAndroidAiFlowHelpDialog();
  if (!modal)
    return;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('.android-help-close')?.focus();
}

function closeAndroidAiFlowHelpDialog() {
  if (!androidAiFlowHelpModal)
    return;

  androidAiFlowHelpModal.hidden = true;
  androidAiFlowHelpModal.setAttribute('aria-hidden', 'true');
}

function createAndroidExploreBox() {
  if (!TERMODEL_ANDROID_DEVICE || !modelPage)
    return null;

  const existing = document.getElementById('androidExploreBox');
  if (existing) return existing;

  installAndroidExploreStyles();

  const box = document.createElement('div');
  box.id = 'androidExploreBox';
  box.className = 'android-explore-box';
  box.innerHTML = `
    <button id="androidExploreToggle" class="android-explore-main" type="button"
      aria-expanded="false">Esplora</button>
    <button id="androidHomeFilters" class="android-explore-main" type="button"
      aria-label="Apri filtri grafici">Filtri</button>
    <button id="androidHelp3d" class="android-explore-main" type="button"
      aria-label="Apri Help MyHome3D">Help</button>
    <button id="androidFullDesktop" class="android-explore-main android-desktop-toggle" type="button"
      aria-label="Apri la versione completa desktop" title="Versione completa desktop">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.5"></rect>
        <path d="M9 20h6M12 16v4"></path>
      </svg>
    </button>
    <div id="androidExploreMenu" class="android-explore-menu" hidden>
      <div class="android-ai-flow-group" aria-label="Flusso AI Termodel">
        <div class="android-ai-flow-title">AI</div>
        <button id="androidExploreAiHelp" class="android-ai-flow-help" type="button"
          aria-label="Spiega come usare l'AI con Termodel" title="Help flusso AI">?</button>
        <button id="androidExploreOpenAi" class="android-explore-action android-ai-flow-open" type="button"
          title="Apre ChatGPT con la programmazione AI ufficiale di Termodel">
          Apri GPT con programmazione AI
        </button>
        <button id="androidExploreCopyAi" class="android-explore-action android-ai-flow-copy" type="button"
          title="Copia negli appunti l'istruzione AI ufficiale di Termodel">
          Copia istruzione AI negli appunti
        </button>
        <button id="androidExploreImportAi" class="android-explore-action android-ai-flow-import" type="button"
          title="Legge dagli appunti un progetto TERMODEL-PROJECT-TEXT-V1 o una pianta TERMODEL-SVG-TEXT-V1 restituita dall'AI">
          Importa progetto realizzato con AI dagli appunti
        </button>
        <div id="androidExploreAiFeedback" class="android-ai-flow-feedback" aria-live="polite"></div>
      </div>
      <label class="android-explore-field">
        <span>Esempio</span>
        <select id="androidExploreExample" class="android-project-plane"
          aria-label="Esempio Termodel" title="Esempio Termodel"></select>
      </label>
      <button id="androidExploreSingleLine" class="android-explore-action" type="button">
        Disegno unifilare
      </button>
      <button id="androidExploreExecutive" class="android-explore-action" type="button">
        Disegno esecutivo
      </button>
    </div>
  `;

  modelPage.appendChild(box);

  const toggle = box.querySelector('#androidExploreToggle');
  const filters = box.querySelector('#androidHomeFilters');
  const help = box.querySelector('#androidHelp3d');
  const desktopToggle = box.querySelector('#androidFullDesktop');
  const menu = box.querySelector('#androidExploreMenu');
  const openAi = box.querySelector('#androidExploreOpenAi');
  const copyAiInstruction = box.querySelector('#androidExploreCopyAi');
  const importAiClipboard = box.querySelector('#androidExploreImportAi');
  const aiFlowHelp = box.querySelector('#androidExploreAiHelp');
  const aiFlowFeedback = box.querySelector('#androidExploreAiFeedback');
  const exampleSelect = box.querySelector('#androidExploreExample');
  const singleLine = box.querySelector('#androidExploreSingleLine');
  const executive = box.querySelector('#androidExploreExecutive');

  const setOpen = (open) => {
    const next = Boolean(open);
    menu.hidden = !next;
    toggle.classList.toggle('active', next);
    toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  };

  toggle.addEventListener('click', async event => {
    event.stopPropagation();

    // Anche sul modello iniziale il menu deve restare raggiungibile:
    // da qui l'utente può scegliere un esempio oppure importare dagli appunti
    // il progetto restituito dall'AI.
    if (initialModelExplorationLocked && exampleSelect.disabled)
      await populateAndroidExploreExamples(exampleSelect, singleLine);

    setOpen(menu.hidden);
  });

  openAi.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);

    const target = buildChatGptTermodelUrl();
    const opened = window.open(target, '_blank');
    if (!opened) {
      window.alert('Il browser ha bloccato l’apertura di ChatGPT. Consenti l’apertura oppure usa Copia istruzione AI negli appunti.');
      return;
    }

    try { opened.opener = null; } catch (_) {}
    setMainAiStatus('✓ ChatGPT aperto con la programmazione Termodel');
  });

  copyAiInstruction.addEventListener('click', async event => {
    event.stopPropagation();
    const copied = await copyTermodelAiBootstrap({ openDialog: false });
    if (aiFlowFeedback) {
      aiFlowFeedback.textContent = copied
        ? '✓ Istruzione AI copiata. Ora apri la tua AI e incollala.'
        : '⚠ Copia non riuscita. Verifica i permessi degli appunti.';
    }
  });

  aiFlowHelp.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    openAndroidAiFlowHelpDialog();
  });

  importAiClipboard.addEventListener('click', async event => {
    event.stopPropagation();
    setOpen(false);
    await importAiFromMainForm(event);
  });

  help.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    openAndroidHelpDialog('3D');
  });

  desktopToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(false);
    enableTermodelFullDesktopLayout();
  });

  exampleSelect.addEventListener('click', event => {
    event.stopPropagation();
  });

  exampleSelect.addEventListener('change', async event => {
    event.stopPropagation();
    const requested = String(exampleSelect.value || '').trim();
    if (!requested) return;

    try {
      await loadProjectBrowserExample(requested, singleLine);
      exampleSelect.value = activeProjectBrowserExampleId;
      setOpen(false);
    } catch (error) {
      console.error('Caricamento esempio ProjectBrowser non riuscito:', error);
      status.textContent = 'Errore esempio: ' + error.message;
    }
  });

  singleLine.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    openProjectBrowserSingleLine();
  });

  executive.addEventListener('click', async event => {
    event.stopPropagation();
    setOpen(false);
    executive.disabled = true;
    try {
      await openProjectBrowserExecutive();
    } catch (error) {
      console.error('Esecutivo esempio non disponibile:', error);
      status.textContent = 'Errore esecutivo esempio: ' + (error?.message || error);
    } finally {
      syncAndroidExampleCadAvailability(singleLine);
    }
  });

  filters.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    openAndroidFilterDialog();
  });

  document.addEventListener('click', (event) => {
    if (!box.contains(event.target))
      setOpen(false);
  });

  void populateAndroidExploreExamples(exampleSelect, singleLine);
  return box;
}

let androidFilterModal = null;

const ANDROID_FILTER_GROUPS = [
  ['piani', 'Piani'],
  ['componenti', 'Componenti'],
  ['confini', 'Confini'],
  ['separazione', 'Separazione tra vani']
];

function createAndroidFilterDialog() {
  if (!TERMODEL_ANDROID_DEVICE)
    return null;

  if (androidFilterModal)
    return androidFilterModal;

  const modal = document.createElement('div');
  modal.id = 'androidFilterModal';
  modal.className = 'android-filter-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="android-filter-dialog" role="dialog" aria-modal="true"
      aria-labelledby="androidFilterTitle">
      <header class="android-filter-head">
        <strong id="androidFilterTitle">Filtri grafici</strong>
        <button type="button" class="android-filter-close" aria-label="Chiudi filtri">×</button>
      </header>
      <div class="android-filter-body">
        <p class="android-filter-note">Seleziona i filtri e premi Applica per aggiornare il modello 3D.</p>
        <div class="android-filter-sections"></div>
      </div>
      <footer class="android-filter-foot">
        <button type="button" class="android-filter-cancel">Annulla</button>
        <button type="button" class="android-filter-apply">Applica</button>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);

  const close = () => closeAndroidFilterDialog();
  modal.querySelector('.android-filter-close')?.addEventListener('click', close);
  modal.querySelector('.android-filter-cancel')?.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal)
      close();
  });

  modal.querySelector('.android-filter-apply')?.addEventListener('click', () => {
    let applied = 0;

    modal.querySelectorAll('input[data-mobile-filter-group]').forEach(input => {
      const group = input.dataset.mobileFilterGroup || '';
      const name = input.dataset.mobileFilterName || '';
      if (!group || !name)
        return;

      setFilterState(group, name, input.checked, true);
      applied += 1;
    });

    applyFilters();

    // Rilegge subito lo stato consolidato: alla successiva apertura la
    // finestra Mobile riparte esattamente dalle scelte applicate.
    if (applied > 0)
      rebuildAndroidFilterDialog();

    closeAndroidFilterDialog();
  });

  androidFilterModal = modal;
  return modal;
}

function rebuildAndroidFilterDialog() {
  const modal = createAndroidFilterDialog();
  const sections = modal?.querySelector('.android-filter-sections');
  if (!modal || !sections)
    return;

  sections.replaceChildren();

  const allFilters = Array.from(
    filterPanel.querySelectorAll('input[data-filter-group][data-filter-name]')
  );

  ANDROID_FILTER_GROUPS.forEach(([group, title]) => {
    const section = document.createElement('section');
    section.className = 'android-filter-section';

    const heading = document.createElement('h3');
    heading.textContent = title;
    section.appendChild(heading);

    const items = document.createElement('div');
    items.className = 'android-filter-items';

    const groupFilters = allFilters.filter(input =>
      input.dataset.filterGroup === group
    );

    if (!groupFilters.length) {
      const empty = document.createElement('div');
      empty.className = 'android-filter-empty';
      empty.textContent = '—';
      items.appendChild(empty);
    } else {
      groupFilters.forEach(source => {
        const row = document.createElement('label');
        row.className = 'android-filter-row';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = getFilterState(group, source.dataset.filterName || '', source.checked);
        input.dataset.mobileFilterGroup = group;
        input.dataset.mobileFilterName = source.dataset.filterName || '';

        const text = document.createElement('span');
        text.textContent = source.dataset.filterName || '';

        row.appendChild(input);
        row.appendChild(text);
        items.appendChild(row);
      });
    }

    section.appendChild(items);
    sections.appendChild(section);
  });
}

function openAndroidFilterDialog() {
  const modal = createAndroidFilterDialog();
  if (!modal)
    return;

  rebuildAndroidFilterDialog();
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('input')?.focus();
}

function closeAndroidFilterDialog() {
  if (!androidFilterModal)
    return;

  androidFilterModal.hidden = true;
  androidFilterModal.setAttribute('aria-hidden', 'true');
}

let androidHelpModal = null;
let androidHelpContext = '3D';

let myHome3dAiInstructionPromise = null;

async function loadMyHome3dAiInstruction() {
  if (myHome3dAiInstructionPromise)
    return myHome3dAiInstructionPromise;

  myHome3dAiInstructionPromise = fetch(
    MYHOME3D_AI_INSTRUCTION_URL,
    { cache: 'no-store' }
  )
    .then(async response => {
      if (!response.ok)
        throw new Error('Istruzione MyHome3D HTTP ' + response.status);
      const text = await response.text();
      if (!text.trim() || !text.includes('# MYHOME3D MOBILE'))
        throw new Error('Istruzione MyHome3D non valida.');
      return text;
    })
    .catch(error => {
      myHome3dAiInstructionPromise = null;
      throw error;
    });

  return myHome3dAiInstructionPromise;
}

function createAndroidHelpDialog() {
  if (!TERMODEL_ANDROID_DEVICE)
    return null;

  if (androidHelpModal)
    return androidHelpModal;

  const modal = document.createElement('div');
  modal.id = 'androidHelpModal';
  modal.className = 'android-help-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="android-help-dialog" role="dialog" aria-modal="true"
      aria-labelledby="androidHelpTitle">
      <header class="android-help-head">
        <strong id="androidHelpTitle">MyHome3D — Help</strong>
        <button type="button" class="android-help-close" aria-label="Chiudi Help">×</button>
      </header>
      <button id="androidHelpAskAi" class="android-help-ai" type="button">
        Chiedi informazioni ad AI
      </button>
      <div id="androidHelpFeedback" class="android-help-feedback" aria-live="polite"></div>
      <div class="android-help-body">
        <span id="androidHelpContext" class="android-help-context">Vista 3D</span>
        <p><strong>MyHome3D</strong> è la versione Mobile di Termodel: ti permette di costruire ed esplorare il modello della tua casa, compresi gli impianti.</p>
        <p>Il modello è pensato per essere riutilizzato quando dialoghi con aziende di costruzione e installazione/impiantistica, così puoi chiedere preventivi senza riprogettare ciò che hai già definito.</p>
        <p>Se vuoi capire meglio una funzione, usa il pulsante <strong>Chiedi informazioni ad AI</strong> qui sopra.</p>
        <ol>
          <li>MyHome3D carica dal sito Termodel l’istruzione AI informativa ufficiale della versione Mobile e la copia negli appunti.</li>
          <li>Apri ChatGPT o il tuo assistente AI e incolla il testo.</li>
          <li>Dopo la conferma dell’AI, chiedi ciò che vuoi sapere su MyHome3D o Termodel.</li>
          <li>L’istruzione serve solo a fornire informazioni su MyHome3D e Termodel: non avvia la generazione di un progetto.</li>
        </ol>
        <p>Puoi chiudere questo Help e continuare a lavorare: la copia negli appunti non modifica il progetto.</p>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelector('.android-help-close')?.addEventListener('click', closeAndroidHelpDialog);
  modal.addEventListener('click', event => {
    if (event.target === modal)
      closeAndroidHelpDialog();
  });
  modal.querySelector('#androidHelpAskAi')?.addEventListener('click', async event => {
    event.stopPropagation();
    const button = event.currentTarget;
    const feedback = modal.querySelector('#androidHelpFeedback');
    button.disabled = true;
    if (feedback)
      feedback.textContent = 'Caricamento istruzione AI MyHome3D dal sito Termodel…';

    try {
      const instruction = await loadMyHome3dAiInstruction();
      const copied = await copyTextToClipboard(instruction, 'le istruzioni AI MyHome3D');
      if (feedback) {
        feedback.textContent = copied
          ? '✓ Istruzione informativa MyHome3D copiata. Ora apri ChatGPT o la tua AI e incolla il testo.'
          : '⚠ Copia non riuscita. Verifica i permessi degli appunti del browser e riprova.';
      }
    } catch (error) {
      console.error('Istruzione AI MyHome3D non disponibile:', error);
      if (feedback)
        feedback.textContent = '⚠ Istruzione AI MyHome3D non disponibile dal sito Termodel. Riprova quando la connessione è attiva.';
    } finally {
      button.disabled = false;
    }
  });

  androidHelpModal = modal;
  return modal;
}

function openAndroidHelpDialog(context = '3D') {
  const modal = createAndroidHelpDialog();
  if (!modal)
    return;

  androidHelpContext = context === '2D' ? '2D' : '3D';
  const contextLabel = modal.querySelector('#androidHelpContext');
  const feedback = modal.querySelector('#androidHelpFeedback');
  if (contextLabel)
    contextLabel.textContent = androidHelpContext === '2D' ? 'Vista CAD 2D' : 'Vista modello 3D';
  if (feedback)
    feedback.textContent = '';

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('#androidHelpAskAi')?.focus();
}

function closeAndroidHelpDialog() {
  if (!androidHelpModal)
    return;

  androidHelpModal.hidden = true;
  androidHelpModal.setAttribute('aria-hidden', 'true');
}

let androidCadPlaneSelect = null;
let androidCadShowBackground = null;
let androidCadShowExecutive = null;
let androidCadShowInput = null;

function refreshAndroidCadExploreControls() {
  if (!TERMODEL_ANDROID_DEVICE || !androidCadPlaneSelect) return;

  const planes = [];
  cadArchiveRecords('Piani')
    .map(record => cadText(record?.Nome))
    .filter(Boolean)
    .forEach(name => {
      if (!planes.includes(name)) planes.push(name);
    });

  const current = cadCurrentPlane();
  if (current && !planes.includes(current)) planes.push(current);

  androidCadPlaneSelect.replaceChildren();
  planes.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    androidCadPlaneSelect.appendChild(option);
  });

  androidCadPlaneSelect.disabled = planes.length === 0;
  if (current) androidCadPlaneSelect.value = current;
  else if (planes.length) androidCadPlaneSelect.value = planes[0];

  if (androidCadShowBackground && cadShowBackground) {
    androidCadShowBackground.checked = cadShowBackground.checked;
    androidCadShowBackground.disabled = cadShowBackground.disabled;
  }
  if (androidCadShowExecutive && cadShowGeneratedExecutive) {
    const canGenerateExecutive = currentProjectBrowserExample()?.executive === true;
    androidCadShowExecutive.checked =
      cadGeneratedExecutiveAvailable() && cadShowGeneratedExecutive.checked;
    androidCadShowExecutive.disabled =
      !cadGeneratedExecutiveAvailable() && !canGenerateExecutive;
  }
  if (androidCadShowInput && cadShowInput) {
    androidCadShowInput.checked = cadShowInput.checked;
    androidCadShowInput.disabled = !cadWorkingDoc;
  }
}

function createAndroidCadBrowserBox() {
  if (!TERMODEL_ANDROID_DEVICE || !cadPage)
    return null;

  const existing = document.getElementById('androidCadBrowserBox');
  if (existing) {
    androidCadPlaneSelect = existing.querySelector('#androidCadPlane');
    androidCadShowBackground = existing.querySelector('#androidCadShowBackground');
    androidCadShowExecutive = existing.querySelector('#androidCadShowExecutive');
    androidCadShowInput = existing.querySelector('#androidCadShowInput');
    refreshAndroidCadExploreControls();
    return existing;
  }

  installAndroidExploreStyles();

  const box = document.createElement('div');
  box.id = 'androidCadBrowserBox';
  box.className = 'android-explore-box android-cad-browser-box';
  box.innerHTML = `
    <button id="androidCadHome" class="android-explore-main" type="button"
      aria-label="Torna al modello 3D">Home</button>
    <button id="androidCadExploreToggle" class="android-explore-main" type="button"
      aria-expanded="false">Esplora</button>
    <button id="androidCadHelp" class="android-explore-main" type="button"
      aria-label="Apri Help MyHome3D">Help</button>
    <div id="androidCadExploreMenu" class="android-explore-menu" hidden>
      <label class="android-explore-field">
        <span>Piano</span>
        <select id="androidCadPlane" class="android-project-plane"
          aria-label="Piano visualizzato" title="Piano visualizzato"></select>
      </label>
      <label class="android-explore-check">
        <input id="androidCadShowBackground" type="checkbox" />
        <span>Sfondo</span>
      </label>
      <label class="android-explore-check">
        <input id="androidCadShowExecutive" type="checkbox" />
        <span>Esecutivo pannelli</span>
      </label>
      <label class="android-explore-check">
        <input id="androidCadShowInput" type="checkbox" />
        <span>Unifilare input</span>
      </label>
    </div>
  `;

  cadPage.appendChild(box);

  const home = box.querySelector('#androidCadHome');
  const explore = box.querySelector('#androidCadExploreToggle');
  const help = box.querySelector('#androidCadHelp');
  const menu = box.querySelector('#androidCadExploreMenu');
  androidCadPlaneSelect = box.querySelector('#androidCadPlane');
  androidCadShowBackground = box.querySelector('#androidCadShowBackground');
  androidCadShowExecutive = box.querySelector('#androidCadShowExecutive');
  androidCadShowInput = box.querySelector('#androidCadShowInput');

  const setOpen = open => {
    const next = Boolean(open);
    menu.hidden = !next;
    explore.classList.toggle('active', next);
    explore.setAttribute('aria-expanded', next ? 'true' : 'false');
  };

  home.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    cadReturnToModel();
  });

  explore.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(menu.hidden);
  });

  help.addEventListener('click', event => {
    event.stopPropagation();
    setOpen(false);
    openAndroidHelpDialog('2D');
  });

  androidCadPlaneSelect.addEventListener('change', event => {
    event.stopPropagation();
    const requested = cadText(androidCadPlaneSelect.value);
    if (!requested || !cadPropPiano) return;
    cadPropPiano.value = requested;
    cadCurrentPlaneChanged();
    refreshAndroidCadExploreControls();
  });

  androidCadShowBackground.addEventListener('change', event => {
    event.stopPropagation();
    if (!cadShowBackground) return;
    cadShowBackground.checked = androidCadShowBackground.checked;
    cadShowBackground.dispatchEvent(new Event('change', { bubbles: true }));
    refreshAndroidCadExploreControls();
  });

  androidCadShowExecutive.addEventListener('change', async event => {
    event.stopPropagation();
    if (!cadShowGeneratedExecutive) return;

    if (androidCadShowExecutive.checked && !cadGeneratedExecutiveAvailable()) {
      androidCadShowExecutive.disabled = true;
      const available = await ensureProjectBrowserExecutive();
      if (!available) {
        androidCadShowExecutive.checked = false;
        refreshAndroidCadExploreControls();
        return;
      }
    }

    cadShowGeneratedExecutive.disabled = !cadGeneratedExecutiveAvailable();
    cadShowGeneratedExecutive.checked =
      androidCadShowExecutive.checked && cadGeneratedExecutiveAvailable();
    cadShowGeneratedExecutive.dispatchEvent(new Event('change', { bubbles: true }));
    refreshAndroidCadExploreControls();
  });

  androidCadShowInput.addEventListener('change', event => {
    event.stopPropagation();
    if (!cadShowInput) return;
    cadShowInput.checked = androidCadShowInput.checked;
    cadShowInput.dispatchEvent(new Event('change', { bubbles: true }));
    refreshAndroidCadExploreControls();
  });

  document.addEventListener('click', event => {
    if (!box.contains(event.target))
      setOpen(false);
  });

  refreshAndroidCadExploreControls();
  return box;
}

function installFilterStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .web-filter-panel {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 228px;
      background: #f2f2f2;
      border-left: 1px solid #aaa;
      padding: 7px 8px;
      overflow: auto;
      z-index: 8;
      display: none;
      color: #111;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 12px;
    }
    .web-filter-panel.visible { display: block; }
    .web-filter-tree {
      min-height: 100%;
      border: 1px solid #999;
      background: #fafafa;
      padding: 4px 5px 7px;
    }
    .web-filter-tree details { margin: 0; }
    .web-filter-tree summary {
      cursor: default;
      user-select: none;
      padding: 2px 0;
      list-style-position: outside;
    }
    .web-filter-items { padding-left: 23px; }
    .web-filter-row {
      display: flex;
      align-items: center;
      min-height: 18px;
      white-space: nowrap;
    }
    .web-filter-row input { margin: 0 4px 0 0; }
    .web-filter-note {
      margin: 7px 3px 1px;
      padding-top: 6px;
      border-top: 1px solid #ccc;
      color: #666;
      font-size: 11px;
      line-height: 1.25;
    }
    .web-filter-mobile-head { display: none; }

    @media (max-width: 820px) {
      .web-filter-panel {
        width: min(86vw, 320px);
        left: auto;
        right: 0;
        top: 0;
        bottom: 0;
        padding: 7px 8px 10px;
        border-left: 1px solid #7f8992;
        box-shadow: -7px 0 22px rgba(0,0,0,.28);
        z-index: 40;
      }
      .web-filter-mobile-head {
        position: sticky;
        top: -7px;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 46px;
        margin: -7px -8px 7px;
        padding: 5px 8px 5px 12px;
        border-bottom: 1px solid #aaa;
        background: #e5e5e5;
        font-size: 14px;
      }
      .web-filter-mobile-close {
        width: 40px;
        height: 40px;
        border: 1px solid #888;
        background: linear-gradient(#fff,#dedede);
        color: #111;
        font-size: 24px;
        line-height: 1;
      }
      .web-filter-tree {
        min-height: 0;
        padding: 6px 7px 10px;
      }
      .web-filter-tree summary {
        min-height: 34px;
        display: flex;
        align-items: center;
        font-size: 14px;
      }
      .web-filter-items {
        padding-left: 18px;
      }
      .web-filter-row {
        min-height: 36px;
        font-size: 14px;
      }
      .web-filter-row input {
        width: 19px;
        height: 19px;
        margin-right: 8px;
      }
      .web-filter-note {
        font-size: 12px;
      }
    }
  `;
  document.head.appendChild(style);
}

const filterState = new Map();

function filterStateKey(group, name) {
  return String(group || '') + '::' + String(name || '');
}

function setFilterState(group, name, checked, syncDom = true) {
  const key = filterStateKey(group, name);
  const value = Boolean(checked);
  filterState.set(key, value);

  if (syncDom) {
    document.querySelectorAll('input[data-filter-group][data-filter-name]').forEach(input => {
      if (input.dataset.filterGroup === group && input.dataset.filterName === name)
        input.checked = value;
    });
  }

  return value;
}

function getFilterState(group, name, fallback = true) {
  const key = filterStateKey(group, name);
  if (filterState.has(key))
    return filterState.get(key);

  const input = Array.from(
    document.querySelectorAll('input[data-filter-group][data-filter-name]')
  ).find(candidate =>
    candidate.dataset.filterGroup === group &&
    candidate.dataset.filterName === name
  );

  const value = input ? input.checked : Boolean(fallback);
  filterState.set(key, value);
  return value;
}

function createFilterPanel() {
  installFilterStyles();

  const panel = document.createElement('aside');
  panel.id = 'webFilterPanel';
  panel.className = 'web-filter-panel';
  panel.innerHTML = `
    <div class="web-filter-mobile-head">
      <strong>Filtri grafici</strong>
      <button type="button" class="web-filter-mobile-close" aria-label="Chiudi filtri">×</button>
    </div>
    <div class="web-filter-tree">
      <details open>
        <summary>Piani</summary>
        <div class="web-filter-items" data-filter-container="piani"></div>
      </details>
      <details open>
        <summary>Componenti</summary>
        <div class="web-filter-items" data-filter-container="componenti"></div>
      </details>
      <details open>
        <summary>Confini</summary>
        <div class="web-filter-items" data-filter-container="confini"></div>
      </details>
      <details open>
        <summary>Separazione tra vani</summary>
        <div class="web-filter-items" data-filter-container="separazione"></div>
      </details>
      <div class="web-filter-note" id="webFilterNote"></div>
    </div>
  `;
  modelPage.appendChild(panel);

  COMPONENTI.forEach(([name, checked]) => addFilterCheckbox('componenti', name, checked));
  CONFINI.forEach(([name, checked]) => addFilterCheckbox('confini', name, checked));
  SEPARAZIONE.forEach(([name, checked]) => addFilterCheckbox('separazione', name, checked));

  return panel;
}

function addFilterCheckbox(group, name, checked) {
  const container = document.querySelector(`[data-filter-container="${group}"]`);
  if (!container) return null;

  const row = document.createElement('label');
  row.className = 'web-filter-row';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.filterGroup = group;
  input.dataset.filterName = name;
  input.checked = getFilterState(group, name, checked);
  setFilterState(group, name, input.checked, false);
  input.addEventListener('change', () => {
    setFilterState(group, name, input.checked, false);
    applyFilters();
  });

  const text = document.createElement('span');
  text.textContent = name;

  row.appendChild(input);
  row.appendChild(text);
  container.appendChild(row);
  return input;
}

const filterPanel = createFilterPanel();

function rebuildPianoFilters(primitives) {
  const container = document.querySelector('[data-filter-container="piani"]');
  if (!container) return;

  const previous = new Map();
  container.querySelectorAll('input[data-filter-name]').forEach((input) => {
    previous.set(input.dataset.filterName, input.checked);
  });

  container.innerHTML = '';

  const piani = [...new Set(
    primitives
      .filter((p) => p.filterMetadata && typeof p.piano === 'string' && p.piano.trim())
      .map((p) => p.piano.trim())
  )];

  if (piani.length === 0) {
    const row = document.createElement('div');
    row.className = 'web-filter-row';
    row.textContent = '—';
    container.appendChild(row);
    return;
  }

  piani.forEach((piano) => {
    addFilterCheckbox('piani', piano, previous.has(piano) ? previous.get(piano) : true);
  });
}

function isChecked(group, name, fallback = true) {
  return getFilterState(group, name, fallback);
}

// "Pannelli" non è un normale componente ma una modalità speciale:
// quando resta selezionata mostra soltanto Pannelli + Ponti. Un nuovo
// Aggiorna Modello deve partire dal modello edilizio completo, altrimenti
// una selezione precedente può far sembrare che il Service abbia restituito
// soltanto lo scheletro verde dei ponti termici.
function resetPannelliOnlyModeForServiceModel() {
  setFilterState('componenti', 'Pannelli', false);
}

function primitiveFilterData(primitive) {
  return {
    filterMetadata: primitive.filterMetadata === true,
    piano: primitive.piano || '',
    confine: primitive.confine || '',
    separatore: primitive.separatore === true,
    stessaZona: primitive.stessaZona === true,
    fittizia: primitive.fittizia === true,
    falda: primitive.falda === true,
    tipo: primitive.tipo || ''
  };
}

function passesFilters(meta) {
  // Componenti funziona anche con i vecchi JSON v2, perche' "tipo" esisteva gia'.
  const pannelliMode = isChecked('componenti', 'Pannelli', false);
  if (pannelliMode && meta.tipo !== 'Ponte' && meta.tipo !== 'Pannelli')
    return false;

  if (meta.tipo && meta.tipo !== 'Pannelli' && !isChecked('componenti', meta.tipo, true))
    return false;

  if (!meta.filterMetadata)
    return true;

  // Stesso ordine logico usato dal Redraw desktop di Polig3D.
  if (meta.piano && !isChecked('piani', meta.piano, true))
    return false;

  if (meta.stessaZona && !isChecked('confini', 'StessaZona', true))
    return false;

  // Falde e separatori bypassano il filtro Confine nel desktop.
  if (!meta.falda && !meta.separatore) {
    if (meta.tipo === 'Mansardato') {
      if (!isChecked('confini', 'Esterno', true))
        return false;
    } else if (meta.confine && !isChecked('confini', meta.confine, true)) {
      return false;
    }
  }

  // I ponti bypassano il filtro Separatore/NonSeparatore nel desktop.
  if (meta.tipo !== 'Ponte') {
    if (meta.separatore) {
      if (!isChecked('separazione', 'Separatori', true))
        return false;
    } else if (!isChecked('separazione', 'NonSeparatori', true)) {
      return false;
    }
  }

  if (meta.separatore && meta.fittizia && !isChecked('separazione', 'Fittizie', false))
    return false;

  return true;
}

function applyFilters() {
  let visible = 0;
  let total = 0;

  modelGroup.children.forEach((obj) => {
    const meta = obj.userData.filter || {};
    obj.visible = passesFilters(meta);
    total += 1;
    if (obj.visible) visible += 1;
  });

  edgeGroup.children.forEach((obj) => {
    const meta = obj.userData.filter || {};
    obj.visible = passesFilters(meta);
  });

  if (!loading && lastModelData) {
    const count = lastModelData.primitiveCount ?? lastModelData.primitives.length;
    status.textContent = `${currentModelLabel} · ${count} primitive · visibili ${visible}/${total}`;
  }
}

function updateFilterNote(data) {
  const note = document.getElementById('webFilterNote');
  if (!note) return;

  const hasMetadata = data.primitives.some((p) => p.filterMetadata === true);
  if (hasMetadata) {
    note.textContent = 'Filtri Web applicati localmente alle primitive già caricate.';
  } else {
    note.textContent = 'JSON precedente: Componenti attivo; Piani, Confini e Separazione richiedono un nuovo JSON v3.';
  }
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => material.dispose());
    }
  });
  root.clear();
}

function disposeNorth3DMarker() {
  north3DGroup.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
  north3DGroup.clear();
}

function updateNorth3DMarker() {
  disposeNorth3DMarker();

  // Nel viewer 3D il Nord è volutamente minimale:
  // se non è definito non viene mostrato nulla; se è definito compare solo la freccia.
  if (northOrientationDeg === null) return;

  const box = new THREE.Box3().setFromObject(modelGroup);
  if (box.isEmpty()) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const modelSize = Math.max(size.x, size.z, 1);
  const markerLength = Math.max(modelSize * 0.18, 1.2);
  const origin = new THREE.Vector3(
    box.max.x + modelSize * 0.05,
    box.min.y + 0.06,
    box.max.z + modelSize * 0.05
  );

  // 0° = alto della pianta. SVG Y cresce verso il basso; nel 3D tale verso
  // corrisponde a +Z. Gli angoli positivi sono orari: 90° -> +X.
  const radians = THREE.MathUtils.degToRad(northOrientationDeg);
  const direction = new THREE.Vector3(
    Math.sin(radians),
    0,
    Math.cos(radians)
  ).normalize();

  const arrow = new THREE.ArrowHelper(
    direction,
    origin,
    markerLength,
    0xc62828,
    markerLength * 0.28,
    markerLength * 0.16
  );
  north3DGroup.add(arrow);
}

function fromTermodelPoint(vertex) {
  // Termodel/Helix usa Z-up. Three.js usa Y-up.
  return [vertex[0], vertex[2], -vertex[1]];
}

function createMeshPrimitive(primitive) {
  if (!Array.isArray(primitive.vertices) || primitive.vertices.length === 0) return;

  const positions = [];
  primitive.vertices.forEach((vertex) => positions.push(...fromTermodelPoint(vertex)));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  if (Array.isArray(primitive.indices) && primitive.indices.length >= 3)
    geometry.setIndex(primitive.indices);

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const opacity = Number.isFinite(primitive.opacity) ? primitive.opacity : 1;
  const material = new THREE.MeshStandardMaterial({
    color: primitive.color || '#A0522D',
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: opacity < 1,
    opacity
  });

  const filter = primitiveFilterData(primitive);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = {
    numero: primitive.numero,
    id: primitive.id || '',
    tipo: primitive.tipo || '',
    descrizione: primitive.descrizione || '',
    parte: primitive.parte || '',
    filter
  };
  modelGroup.add(mesh);

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 20);
  const edges = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: 0x00e58a })
  );
  edges.userData = { filter };
  edgeGroup.add(edges);
}

function createLinePrimitive(primitive) {
  if (!Array.isArray(primitive.vertices) || primitive.vertices.length < 2) return;

  const positions = [];
  primitive.vertices.forEach((vertex) => positions.push(...fromTermodelPoint(vertex)));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  if (Array.isArray(primitive.indices) && primitive.indices.length >= 2)
    geometry.setIndex(primitive.indices);

  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: primitive.color || '#00e58a' })
  );
  line.userData = { filter: primitiveFilterData(primitive) };
  modelGroup.add(line);
}

function updateFloor(box) {
  if (floor) {
    scene.remove(floor);
    floor.geometry.dispose();
    floor.material.dispose();
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  const floorSize = Math.max(size.x, size.z, 10) * 2.2;

  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ color: 0xd3d3d3, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = box.min.y - 0.03;
  scene.add(floor);
}

function fitView() {
  const box = new THREE.Box3().setFromObject(modelGroup);
  if (box.isEmpty()) return;

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxSize = Math.max(size.x, size.y, size.z, 1);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (maxSize / (2 * Math.tan(fov / 2))) * 1.35;
  const direction = new THREE.Vector3(1.2, 0.82, 1.25).normalize();
  const position = center.clone().add(direction.multiplyScalar(distance));

  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(1000, distance * 50);
  camera.position.copy(position);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = Math.max(maxSize * 0.04, 0.3);
  controls.maxDistance = Math.max(maxSize * 12, 30);
  controls.update();

  homeView = { position: position.clone(), target: center.clone() };
  updateFloor(box);
}

function resetView() {
  if (!homeView) return;
  camera.position.copy(homeView.position);
  controls.target.copy(homeView.target);
  controls.update();
}

function setStructuredProjectState(enabled) {
  structuredProjectActive = Boolean(enabled);
  if (structuredProjectActive)
    setInitialModelExplorationLocked(false);
  const needsProject = !structuredProjectActive;
  const inviteTitle = 'Crea o importa il tuo progetto Termodel per usare questa funzione.';

  document.querySelectorAll('[data-archive]').forEach(button => {
    button.disabled = false;
    button.title = needsProject ? inviteTitle : '';
    button.setAttribute('aria-disabled', needsProject ? 'true' : 'false');
  });

  const cadButton = document.querySelector('[data-action="Edita nel Cad"]');
  if (cadButton) {
    cadButton.disabled = false;
    cadButton.title = needsProject ? inviteTitle : '';
    cadButton.setAttribute('aria-disabled', needsProject ? 'true' : 'false');
  }

  if (saveProjectButton) saveProjectButton.disabled = needsProject;
  if (saveProjectAsButton) saveProjectAsButton.disabled = needsProject;
  if (helpCopyProjectClipboard) {
    helpCopyProjectClipboard.disabled = needsProject;
    helpCopyProjectClipboard.title = needsProject ? inviteTitle : 'Copia il TERMODEL-PROJECT-TEXT-V1 corrente negli appunti.';
  }

  if (needsProject && initialModelExplorationLocked)
    syncInitialModelDesktopGateControls();
}

const TERMODEL_PENDING_ASSOCIATION_VALUE = 'Da associare';
let termodelAssociationDialog = null;
let termodelAssociationDialogResolver = null;
let termodelAssociationDialogPromise = null;
let termodelAssociationItemsByKey = new Map();

function termodelAssociationIsPending(value) {
  return cadText(value).toLocaleLowerCase('it-IT') ===
    TERMODEL_PENDING_ASSOCIATION_VALUE.toLocaleLowerCase('it-IT');
}

function termodelTechnicalCadElements(localName) {
  const root = cadWorkingDoc?.documentElement;
  if (!root) return [];

  const groups = Array.from(root.children || [])
    .filter(element => element.localName === 'g');
  const canonicalGroups = groups.filter(group =>
    cadText(group.getAttribute('data-termodel-floor-id'))
  );
  const technicalGroups = canonicalGroups.length
    ? canonicalGroups
    : groups.filter(group =>
        ['calpestabile', 'copertura'].includes(cadText(group.id).toLowerCase())
      );

  return technicalGroups.flatMap(group =>
    Array.from(group.children || [])
      .filter(element => element.localName === localName)
  );
}

function termodelParseServiceProblem(body) {
  if (!body) return null;
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function termodelIsGeometryProblem(problem, statusCode) {
  if (Number(statusCode) !== 422 || !problem || typeof problem !== 'object')
    return false;

  const errors = Array.isArray(problem.errors) ? problem.errors : [];
  return problem.title === 'Errori geometrici nel disegno di input' ||
    errors.some(error => cadText(error?.code) === 'DXF_GRAPHIC_ERROR');
}

function cadServiceGeometryPointCm(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x * 100, y * 100];
}

function cadServiceGeometryPointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length2 = dx * dx + dy * dy;
  if (length2 <= 1e-12)
    return Math.hypot(point[0] - start[0], point[1] - start[1]);

  const t = Math.max(0, Math.min(
    1,
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2
  ));
  const px = start[0] + t * dx;
  const py = start[1] + t * dy;
  return Math.hypot(point[0] - px, point[1] - py);
}

function cadMatchServiceGeometrySourceLine(startCm, endCm) {
  if (!startCm || !endCm) return null;

  const toleranceCm = 0.75;
  let best = null;

  termodelTechnicalCadElements('line').forEach(line => {
    const start = cadLinePoint(line, 1);
    const end = cadLinePoint(line, 2);
    const d1 = cadServiceGeometryPointSegmentDistance(startCm, start, end);
    const d2 = cadServiceGeometryPointSegmentDistance(endCm, start, end);
    if (d1 > toleranceCm || d2 > toleranceCm) return;

    const sourceLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const errorLength = Math.hypot(endCm[0] - startCm[0], endCm[1] - startCm[1]);
    const score = d1 + d2 + Math.max(0, sourceLength - errorLength) * 0.0001;

    if (!best || score < best.score)
      best = { line, score };
  });

  return best?.line || null;
}

function cadServiceGeometryLayerFromContext(context) {
  const match = /(?:^|\s)Layer:\s*([^\r\n]+?)\s*$/i.exec(String(context || ''));
  return match ? cadText(match[1]) : '';
}

function cadServiceGeometryProblemState(problem) {
  const segments = [];
  const errors = Array.isArray(problem?.errors) ? problem.errors : [];

  errors.forEach((error, errorIndex) => {
    const lines = Array.isArray(error?.lines) ? error.lines : [];
    lines.forEach((line, lineIndex) => {
      const startCm = cadServiceGeometryPointCm(line?.start);
      const endCm = cadServiceGeometryPointCm(line?.end);
      if (!startCm || !endCm) return;

      const source = cadMatchServiceGeometrySourceLine(startCm, endCm);
      segments.push({
        errorIndex,
        lineIndex,
        sourceId: cadText(source?.id),
        plane: cadEntityPlane(source),
        startCm,
        endCm,
        startM: [Number(line.start.x), Number(line.start.y)],
        endM: [Number(line.end.x), Number(line.end.y)],
        message: cadText(error?.message) || cadText(problem?.detail),
        context: cadText(error?.context),
        userData: cadText(line?.userData)
      });
    });
  });

  let plane = cadText(segments.find(segment => segment.plane)?.plane);
  if (!plane) {
    const knownPlanes = cadArchiveRecords('Piani')
      .map(record => cadText(record?.Nome))
      .filter(Boolean);
    for (const error of errors) {
      const layer = cadServiceGeometryLayerFromContext(error?.context);
      const match = knownPlanes.find(name =>
        name.localeCompare(layer, 'it', { sensitivity: 'base' }) === 0
      );
      if (match) {
        plane = match;
        break;
      }
    }
  }

  return { problem, segments, plane };
}

function cadFormatServiceGeometryError(state) {
  const problem = state?.problem || {};
  const errors = Array.isArray(problem.errors) ? problem.errors : [];
  // Il payload strutturato conserva piano, linee e coordinate per la grafica.
  // Nell'avviso utente mostriamo soltanto la descrizione dell'anomalia.
  const raw = cadText(errors.find(error => cadText(error?.message))?.message) ||
    cadText(state?.segments?.[0]?.message) ||
    cadText(problem.detail);
  const essential = raw
    .replace(/\\b(?:errore geometrico (?:nel )?)?disegno di input\\b\\s*[:.\\-–]?/gi, '')
    .replace(/\\s*[·|]\\s*(?:piano|layer)\\s*[:=]?\\s*[^·|;\\r\\n]+/gi, '')
    .replace(/\\s*[·|]\\s*\\d+\\s+linee?\\b/gi, '')
    .replace(/\\s*[·|]\\s*\\([^)]*\\)\\s*(?:→|->)\\s*\\([^)]*\\)/g, '')
    .replace(/^[\\s:;,.·–-]+|[\\s:;,.·–-]+$/g, '')
    .trim();
  return essential || 'Errore geometrico';
}

function cadRefreshServiceGeometryErrorBanner() {
  if (!cadServiceGeometryErrorBanner) return;
  const state = cadServiceGeometryErrorState;
  cadServiceGeometryErrorBanner.hidden = !state;
  cadServiceGeometryErrorBanner.textContent = state
    ? cadFormatServiceGeometryError(state)
    : '';
}

function cadSetServiceGeometryProblem(problem) {
  if (!cadWorkingDoc && validatedSvg) {
    try {
      cadSetWorkingSvg(validatedSvg);
    } catch (error) {
      console.warn('Impossibile preparare il CAD per la diagnostica geometrica.', error);
    }
  }

  cadServiceGeometryErrorState = cadServiceGeometryProblemState(problem);
  cadRefreshServiceGeometryErrorBanner();

  if (cadServiceGeometryErrorState.plane)
    cadToolbarState.piano = cadServiceGeometryErrorState.plane;

  if (cadShowInput)
    cadShowInput.checked = true;

  activateCadPage();
  cadRefreshToolbarControls();
  renderCadComparison();
  cadSetStatus(cadFormatServiceGeometryError(cadServiceGeometryErrorState), 'error');
}

function cadClearServiceGeometryProblem() {
  if (!cadServiceGeometryErrorState) return;
  cadServiceGeometryErrorState = null;
  cadRefreshServiceGeometryErrorBanner();
  if (cadPage?.classList.contains('active'))
    renderCadComparison();
}

function cadFindServiceGeometrySourceById(segment) {
  if (!segment?.sourceId) return null;
  return termodelTechnicalCadElements('line').find(line =>
    cadText(line.id) === segment.sourceId &&
    (!segment.plane || cadEntityPlane(line) === segment.plane)
  ) || null;
}

function cadRenderServiceGeometryErrors(svg) {
  if (!svg) return;
  svg.querySelector('#cadServiceGeometryErrorLayer')?.remove();
  if (!cadServiceGeometryErrorState?.segments?.length) return;

  const currentPlane = cadCurrentPlane();
  const layer = svgNode('g', {
    id: 'cadServiceGeometryErrorLayer',
    'pointer-events': 'none',
    'aria-label': 'Errori geometrici rilevati dal Termodel Service'
  });
  const renderedSources = new Set();

  cadServiceGeometryErrorState.segments.forEach(segment => {
    if (segment.plane && currentPlane && segment.plane !== currentPlane)
      return;

    const source = cadFindServiceGeometrySourceById(segment);
    const sourceKey = source
      ? (cadEntityPlane(source) + '|' + cadText(source.id))
      : '';

    if (sourceKey && renderedSources.has(sourceKey))
      return;
    if (sourceKey)
      renderedSources.add(sourceKey);

    const start = source ? cadLinePoint(source, 1) : segment.startCm;
    const end = source ? cadLinePoint(source, 2) : segment.endCm;

    layer.appendChild(svgNode('line', {
      x1: start[0],
      y1: start[1],
      x2: end[0],
      y2: end[1],
      stroke: '#c00000',
      'stroke-width': 6.2,
      'stroke-dasharray': '14 8',
      'stroke-linecap': 'round',
      opacity: 1,
      'vector-effect': 'non-scaling-stroke'
    }));
  });

  if (layer.childNodes.length) {
    const anchor =
      svg.querySelector('#cadHandlesLayer') ||
      svg.querySelector('#cadNorthOverlay');
    if (anchor)
      svg.insertBefore(layer, anchor);
    else
      svg.appendChild(layer);
  }
}

function termodelPendingAssociationItems() {
  if (!cadWorkingDoc) return [];

  const items = [];

  termodelTechnicalCadElements('line').forEach((line, index) => {
    const id = cadText(line.id);
    const isWall = /^[EW]\d+/i.test(id) ||
      line.hasAttribute('data-termodel-tipo-parete');
    if (!isWall) return;

    const tipoParete = cadText(line.getAttribute('data-termodel-tipo-parete'));
    if (!termodelAssociationIsPending(tipoParete)) return;

    const piano = cadText(line.getAttribute('data-termodel-piano')) || 'Unico';
    const descrizione =
      cadText(line.getAttribute('data-termodel-descrizione')) ||
      ('Parete ' + (id || (index + 1)));

    items.push({
      key: 'wall:' + piano + ':' + (id || index),
      kind: 'wall',
      archiveName: 'Pareti',
      associationLabel: 'Tipo parete',
      id: id || ('Parete ' + (index + 1)),
      piano,
      descrizione,
      element: line
    });
  });

  termodelTechnicalCadElements('text').forEach((symbol, index) => {
    if (cadSymbolBlockType(symbol) !== 'FIN') return;

    const id = cadText(symbol.id) || ('Finestra ' + (index + 1));
    const piano = cadText(symbol.getAttribute('data-termodel-piano')) || 'Unico';
    const semantic = cadText(symbol.getAttribute('data-termodel-descrizione'));
    const porta = cadSymbolAttribute(symbol, 'PORTA');
    const tipo = cadSymbolAttribute(symbol, 'TIPO');
    const larghezza = cadSymbolAttribute(symbol, 'LARGHEZZA');
    const altezza = cadSymbolAttribute(symbol, 'ALTEZZA');
    const fallback = [
      larghezza ? ('L ' + larghezza + ' cm') : '',
      altezza ? ('H ' + altezza + ' cm') : ''
    ].filter(Boolean).join(' · ');
    const descrizione = semantic || fallback || id;

    if (termodelAssociationIsPending(tipo)) {
      items.push({
        key: 'window-type:' + piano + ':' + id,
        kind: 'window-type',
        archiveName: 'Finestre',
        associationLabel: 'Tipo finestra',
        id,
        piano,
        descrizione,
        element: symbol
      });
    }

    if (termodelAssociationIsPending(porta)) {
      items.push({
        key: 'window-porta:' + piano + ':' + id,
        kind: 'window-porta',
        archiveName: 'Pareti',
        associationLabel: 'Porta/sup. opaca',
        id,
        piano,
        descrizione,
        element: symbol
      });
    }
  });

  return items;
}

function termodelAssociationArchiveValues(kind) {
  const archiveName =
    kind === 'window-type'
      ? 'Finestre'
      : 'Pareti';
  const values = cadArchiveRecords(archiveName)
    .map(record => cadText(record?.DescBreve))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  return kind === 'window-porta'
    ? ['Struttura trasparente', ...values.filter(value => value !== 'Struttura trasparente')]
    : values;
}

function ensureTermodelAssociationDialog() {
  if (termodelAssociationDialog) return termodelAssociationDialog;

  if (!document.getElementById('termodelAssociationStyles')) {
    const style = document.createElement('style');
    style.id = 'termodelAssociationStyles';
    style.textContent = `
      .termodel-association-modal[hidden] { display: none !important; }
      .termodel-association-modal {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: grid;
        place-items: center;
        padding: 18px;
        background: rgba(0,0,0,.46);
      }
      .termodel-association-dialog {
        width: min(900px, calc(100vw - 24px));
        max-height: calc(100vh - 24px);
        overflow: auto;
        background: #fff;
        color: #1d232a;
        border: 1px solid #747d87;
        border-radius: 8px;
        box-shadow: 0 14px 40px rgba(0,0,0,.28);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      .termodel-association-head,
      .termodel-association-foot {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        background: #eef1f4;
      }
      .termodel-association-head {
        justify-content: space-between;
        border-bottom: 1px solid #c6ccd2;
      }
      .termodel-association-head strong { font-size: 18px; }
      .termodel-association-close {
        min-width: 42px;
        min-height: 38px;
        font-size: 20px;
      }
      .termodel-association-body { padding: 14px; }
      .termodel-association-note {
        margin: 0 0 12px;
        line-height: 1.35;
      }
      .termodel-association-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 14px;
      }
      .termodel-association-column {
        display: grid;
        gap: 6px;
        min-width: 0;
      }
      .termodel-association-column label { font-weight: 700; }
      .termodel-association-column select {
        width: 100%;
        min-height: 250px;
        font: inherit;
      }
      .termodel-association-details {
        min-height: 48px;
        padding: 8px;
        border: 1px solid #d0d5da;
        border-radius: 5px;
        background: #fafbfc;
        overflow-wrap: anywhere;
      }
      .termodel-association-foot {
        justify-content: flex-end;
        border-top: 1px solid #c6ccd2;
      }
      .termodel-association-foot button {
        min-height: 40px;
        padding: 0 16px;
        font-weight: 700;
      }
      .termodel-association-apply,
      .termodel-association-apply-all {
        background: #1769aa;
        color: #fff;
        border: 1px solid #0e578f;
        border-radius: 5px;
      }
      .termodel-association-apply-all {
        background: #4f5963;
        border-color: #3e464e;
      }
      .termodel-association-apply:disabled,
      .termodel-association-apply-all:disabled {
        opacity: .45;
      }
      @media (max-width: 700px) {
        .termodel-association-modal { padding: 6px; }
        .termodel-association-dialog {
          width: calc(100vw - 12px);
          max-height: calc(100vh - 12px);
        }
        .termodel-association-grid { grid-template-columns: 1fr; }
        .termodel-association-column select { min-height: 155px; }
        .termodel-association-foot { flex-wrap: wrap; }
      }
    `;
    document.head.appendChild(style);
  }

  const modal = document.createElement('div');
  modal.id = 'termodelAssociationModal';
  modal.className = 'termodel-association-modal';
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="termodel-association-dialog" role="dialog" aria-modal="true"
      aria-labelledby="termodelAssociationTitle">
      <header class="termodel-association-head">
        <strong id="termodelAssociationTitle">Associa elementi importati da AI</strong>
        <button class="termodel-association-close" type="button" aria-label="Annulla Aggiorna Modello">×</button>
      </header>
      <div class="termodel-association-body">
        <p class="termodel-association-note">
          Seleziona uno o più elementi a sinistra e una voce archivio a destra.
          Associa applica la voce ai selezionati; Associa tutti la applica a tutti gli elementi visibili,
          selezionati o no. Dopo l'associazione gli elementi scompaiono dall'elenco di sinistra.
        </p>
        <div class="termodel-association-grid">
          <div class="termodel-association-column">
            <label for="termodelAssociationPending">Da associare</label>
            <select id="termodelAssociationPending" size="10" multiple></select>
            <div id="termodelAssociationPendingDetails" class="termodel-association-details"></div>
          </div>
          <div class="termodel-association-column">
            <label id="termodelAssociationArchiveLabel" for="termodelAssociationArchive">Archivio</label>
            <select id="termodelAssociationArchive" size="10"></select>
            <div id="termodelAssociationArchiveDetails" class="termodel-association-details"></div>
          </div>
        </div>
      </div>
      <footer class="termodel-association-foot">
        <button class="termodel-association-cancel" type="button">Annulla Aggiorna Modello</button>
        <button class="termodel-association-apply-all" type="button" disabled>Associa tutti</button>
        <button class="termodel-association-apply" type="button" disabled>Associa</button>
      </footer>
    </section>
  `;

  document.body.appendChild(modal);
  termodelAssociationDialog = modal;

  const pendingSelect = modal.querySelector('#termodelAssociationPending');
  const archiveSelect = modal.querySelector('#termodelAssociationArchive');
  const applyButton = modal.querySelector('.termodel-association-apply');
  const applyAllButton = modal.querySelector('.termodel-association-apply-all');
  const closeButton = modal.querySelector('.termodel-association-close');
  const cancelButton = modal.querySelector('.termodel-association-cancel');

  const selectedPendingItems = () =>
    Array.from(pendingSelect.selectedOptions || [])
      .map(option => termodelAssociationItemsByKey.get(cadText(option.value)))
      .filter(Boolean);

  const visiblePendingItems = () =>
    Array.from(pendingSelect.options || [])
      .map(option => termodelAssociationItemsByKey.get(cadText(option.value)))
      .filter(Boolean);

  const syncSelectionDetails = () => {
    const selected = selectedPendingItems();
    const visible = visiblePendingItems();
    const details = modal.querySelector('#termodelAssociationPendingDetails');
    if (!details) return;

    if (!selected.length) {
      details.textContent =
        visible.length + ' elemento/i visibili · seleziona uno o più elementi.';
    } else if (selected.length === 1) {
      details.textContent =
        selected[0].descrizione +
        ' · ' + selected.length + ' selezionato · ' +
        visible.length + ' elemento/i visibili';
    } else {
      details.textContent =
        selected.length + ' elementi selezionati · ' +
        visible.length + ' elemento/i visibili';
    }
  };

  const syncApplyButtons = () => {
    const archiveValue = cadText(archiveSelect.value);
    applyButton.disabled = !(selectedPendingItems().length && archiveValue);
    applyAllButton.disabled = !(visiblePendingItems().length && archiveValue);
  };

  pendingSelect.addEventListener('change', () => {
    syncSelectionDetails();
    syncApplyButtons();
  });

  archiveSelect.addEventListener('change', () => {
    const selected = cadText(archiveSelect.value);
    modal.querySelector('#termodelAssociationArchiveDetails').textContent =
      selected ? ('Voce selezionata: ' + selected) : 'Seleziona una voce dell\'archivio.';
    syncApplyButtons();
  });

  const cancel = () => finishTermodelAssociationDialog(false);
  closeButton.addEventListener('click', cancel);
  cancelButton.addEventListener('click', cancel);
  modal.addEventListener('click', event => {
    if (event.target === modal) cancel();
  });

  const associateItems = (items, archiveValue) => {
    const targets = Array.from(items || []).filter(Boolean);
    if (!targets.length || !archiveValue) return false;

    const before = cadSerializeWorkingSvg();

    targets.forEach(item => {
      if (item.kind === 'wall') {
        const wallState = cadStateFromLine(item.element);
        wallState.tipoParete = archiveValue;
        cadApplySemanticAttributes(item.element, wallState);
      } else if (item.kind === 'window-porta') {
        cadSetSymbolAttribute(item.element, 'PORTA', archiveValue);
      } else {
        cadSetSymbolAttribute(item.element, 'TIPO', archiveValue);
      }
    });

    const after = cadSerializeWorkingSvg();
    if (after === before) return false;

    cadUndoStack.push(before);
    cadRedoStack = [];
    validatedSvg = after;
    if (rasterSvgText) rasterSvgText.value = after;
    renderCadComparison();
    cadUpdatePropertiesPanel();
    cadUpdateControls();
    cadSetStatus(
      targets.length + ' elemento/i associati a ' + archiveValue,
      'dirty'
    );
    return true;
  };

  applyButton.addEventListener('click', () => {
    const archiveValue = cadText(archiveSelect.value);
    if (!associateItems(selectedPendingItems(), archiveValue)) return;
    renderTermodelAssociationDialog();
  });

  applyAllButton.addEventListener('click', () => {
    const archiveValue = cadText(archiveSelect.value);
    if (!associateItems(visiblePendingItems(), archiveValue)) return;
    renderTermodelAssociationDialog();
  });

  return modal;
}

function renderTermodelAssociationDialog(preferredKey = '') {
  const modal = ensureTermodelAssociationDialog();
  const pendingSelect = modal.querySelector('#termodelAssociationPending');
  const archiveSelect = modal.querySelector('#termodelAssociationArchive');
  const pendingDetails = modal.querySelector('#termodelAssociationPendingDetails');
  const archiveDetails = modal.querySelector('#termodelAssociationArchiveDetails');
  const archiveLabel = modal.querySelector('#termodelAssociationArchiveLabel');
  const applyButton = modal.querySelector('.termodel-association-apply');

  const items = termodelPendingAssociationItems();
  termodelAssociationItemsByKey = new Map(items.map(item => [item.key, item]));

  if (!items.length) {
    finishTermodelAssociationDialog(true);
    return;
  }

  const previousKey =
    preferredKey ||
    cadText(pendingSelect.value);
  const selectedItem =
    items.find(item => item.key === previousKey) ||
    items[0];
  const selectedKind = selectedItem.kind;
  const visibleItems = items.filter(item => item.kind === selectedKind);
  const selectedKey = visibleItems.some(item => item.key === previousKey)
    ? previousKey
    : visibleItems[0].key;

  pendingSelect.replaceChildren();
  visibleItems.forEach(item => {
    const option = document.createElement('option');
    option.value = item.key;
    const entityLabel = item.kind === 'wall' ? 'Parete ' : 'Finestra ';
    const relationLabel = item.associationLabel ? (' · ' + item.associationLabel) : '';
    option.textContent =
      entityLabel + item.id + relationLabel + ' · Piano ' + item.piano;
    pendingSelect.appendChild(option);
  });

  Array.from(pendingSelect.options).forEach(option => {
    option.selected = option.value === selectedKey;
  });

  const archiveName = selectedItem.archiveName || (selectedKind === 'window-type' ? 'Finestre' : 'Pareti');
  archiveLabel.textContent =
    selectedKind === 'window-porta'
      ? 'Archivio ' + archiveName + ' / Struttura trasparente'
      : 'Archivio ' + archiveName;

  archiveSelect.replaceChildren();
  termodelAssociationArchiveValues(selectedKind).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    archiveSelect.appendChild(option);
  });

  const selectedCount = pendingSelect.selectedOptions.length;
  pendingDetails.textContent =
    selectedCount + ' selezionato/i · ' +
    visibleItems.length + ' elemento/i · ' +
    (selectedItem.associationLabel || archiveName) +
    ' · ' + items.length + ' pendente/i totali';

  const applyAllButton = modal.querySelector('.termodel-association-apply-all');
  if (!archiveSelect.options.length) {
    archiveDetails.textContent = 'Archivio ' + archiveName + ' privo di voci associabili.';
    applyButton.disabled = true;
    applyAllButton.disabled = true;
  } else {
    archiveSelect.selectedIndex = 0;
    archiveDetails.textContent = 'Voce selezionata: ' + archiveSelect.value;
    applyButton.disabled = selectedCount === 0;
    applyAllButton.disabled = visibleItems.length === 0;
  }
}

function termodelPendingAssociationsInServerPayload(projectText) {
  const geometrySvg = getTermodelProjectSection(projectText, 'geometry/project.svg');
  if (!geometrySvg) return ['geometry/project.svg mancante'];

  const doc = new DOMParser().parseFromString(geometrySvg, 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    return ['geometry/project.svg non valido'];

  const root = doc.documentElement;
  const groups = Array.from(root?.children || [])
    .filter(element => element.localName === 'g');
  const pending = [];

  groups.forEach(group => {
    Array.from(group.children || []).forEach(element => {
      if (element.localName === 'line') {
        const id = cadText(element.id) || '(senza id)';
        const tipoParete = cadText(element.getAttribute('data-termodel-tipo-parete'));
        if (termodelAssociationIsPending(tipoParete))
          pending.push('Parete ' + id + ' · tipo parete');
        return;
      }

      if (element.localName !== 'text' || cadSymbolBlockType(element) !== 'FIN')
        return;

      const id = cadText(element.id) || '(senza id)';
      if (termodelAssociationIsPending(cadSymbolAttribute(element, 'TIPO')))
        pending.push('Finestra ' + id + ' · TIPO');
      if (termodelAssociationIsPending(cadSymbolAttribute(element, 'PORTA')))
        pending.push('Finestra ' + id + ' · PORTA');
    });
  });

  return pending;
}

function assertNoPendingAssociationsInServerPayload(projectText) {
  const pending = termodelPendingAssociationsInServerPayload(projectText);
  if (!pending.length) return;

  throw new Error(
    'Preflight associazioni: il payload contiene ancora ' +
    pending.length + ' elemento/i "Da associare": ' +
    pending.slice(0, 6).join('; ') +
    (pending.length > 6 ? '; …' : '')
  );
}

function finishTermodelAssociationDialog(result) {
  if (!termodelAssociationDialog) return;
  termodelAssociationDialog.hidden = true;
  termodelAssociationDialog.setAttribute('aria-hidden', 'true');

  if (termodelAssociationDialogResolver) {
    const resolve = termodelAssociationDialogResolver;
    termodelAssociationDialogResolver = null;
    resolve(Boolean(result));
  }
}

async function ensureTermodelPendingAssociationsResolved() {
  const pending = termodelPendingAssociationItems();
  if (!pending.length) return true;

  if (termodelAssociationDialogPromise)
    return await termodelAssociationDialogPromise;

  const modal = ensureTermodelAssociationDialog();
  termodelAssociationDialogPromise = new Promise(resolve => {
    termodelAssociationDialogResolver = resolve;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    renderTermodelAssociationDialog(pending[0]?.key || '');
  });

  try {
    return await termodelAssociationDialogPromise;
  } finally {
    termodelAssociationDialogPromise = null;
  }
}

async function loadEmptyProjectText() {
  if (!emptyProjectTextPromise) {
    emptyProjectTextPromise = import(EMPTY_PROJECT_MODULE_URL)
      .then((module) => {
        const text = String(module.TERMODEL_EMPTY_PROJECT_TEXT || '');
        if (!isCompleteTermodelProjectText(text))
          throw new Error('Il template JavaScript del progetto vuoto non è TERMODEL-PROJECT-TEXT-V1.');
        return text;
      })
      .catch((error) => {
        emptyProjectTextPromise = null;
        throw error;
      });
  }

  return emptyProjectTextPromise;
}

async function createStructuredProjectFromSvg(svgText) {
  // v0.59: progetto base locale + sfondi consolidati come asset del progetto.
  const emptyProjectText = await loadEmptyProjectText();
  const projectSvgText = ensureNorthSymbolInSvgText(svgText);
  const consolidated = consolidateTermodelBackgrounds(projectSvgText);
  const structuredProjectText = await buildTermodelProjectText(
    emptyProjectText,
    {
      geometrySvg: consolidated.geometrySvg,
      backgrounds: consolidated.backgrounds
    }
  );

  const project = await loadTermodelProjectText(structuredProjectText);
  currentProjectText = structuredProjectText;
  currentProjectFileName = '';
  syncCurrentProjectIdFromText(currentProjectText);
  currentServiceManifest = null;
  currentCalculationSpiralEngine = '';
  cadGeneratedExecutiveOverlay = null;
  setStructuredProjectState(true);
  return project;
}

function projectFileNameFromName(projectName) {
  const safe = String(projectName || 'Progetto Termodel')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ');
  return (safe || 'Progetto Termodel') + '.termodel.txt';
}

async function loadProjectTextIntoFrontend(text, options = {}) {
  if (!isCompleteTermodelProjectText(text))
    throw new Error('Il file selezionato non è un progetto TERMODEL-PROJECT-TEXT-V1.');

  const project = await loadTermodelProjectText(text);
  currentProjectText = String(text);
  currentProjectFileName = options.fileName || currentProjectFileName || projectFileNameFromName(project.projectName);
  syncCurrentProjectIdFromText(currentProjectText);
  currentServiceManifest = null;
  currentCalculationSpiralEngine = '';
  cadGeneratedExecutiveOverlay = null;

  if (project.geometrySvg) {
    const hydratedGeometrySvg = hydrateTermodelBackgrounds(text, project.geometrySvg);
    const previewLoaded = options.buildPreview === false
      ? false
      : processSvgText(hydratedGeometrySvg);

    if (!previewLoaded) {
      cadSetWorkingSvg(hydratedGeometrySvg);
      validatedSvg = cadSerializeWorkingSvg();
      if (rasterSvgText) rasterSvgText.value = validatedSvg;
    }
  }

  setStructuredProjectState(true);
  return project;
}

async function buildCurrentProjectText() {
  if (!structuredProjectActive || !currentProjectText)
    throw new Error('Nessun progetto strutturato aperto.');

  const state = getArchivioWebState();
  const archives = {};
  for (const name of state.archives)
    archives[name] = getArchivioWebRecords(name);

  const localGeometrySvg = cadWorkingDoc
    ? cadSerializeWorkingSvg()
    : (validatedSvg || undefined);

  const consolidated = localGeometrySvg
    ? consolidateTermodelBackgrounds(localGeometrySvg)
    : null;

  const result = await buildTermodelProjectText(currentProjectText, {
    geometrySvg: consolidated ? consolidated.geometrySvg : undefined,
    archives,
    backgrounds: consolidated ? consolidated.backgrounds : undefined
  });

  currentProjectText = result;
  if (localGeometrySvg) {
    // Il CAD continua a lavorare con lo sfondo reidratato/Data URL.
    // Solo il file progetto persistito usa il riferimento all'asset separato.
    validatedSvg = localGeometrySvg;
    if (rasterSvgText) rasterSvgText.value = localGeometrySvg;
  }
  return result;
}


function downloadProjectText(text, fileName) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/plain;charset=utf-8' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'Progetto Termodel.termodel.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveCurrentProject(saveAs = false) {
  const text = await buildCurrentProjectText();
  const state = getArchivioWebState();
  let fileName =
    currentProjectFileName || projectFileNameFromName(state.projectName);

  if (saveAs) {
    const requested = window.prompt('Nome file progetto:', fileName);
    if (requested === null) return;
    fileName = String(requested).trim() || fileName;
    if (!/\.txt$/i.test(fileName)) fileName += '.termodel.txt';
  }

  currentProjectFileName = fileName;
  downloadProjectText(text, fileName);
  markArchivioWebSaved();
  setMainAiStatus('✓ Progetto salvato localmente: ' + fileName);
}

async function openProjectFile(file) {
  const text = await file.text();
  const project = await loadProjectTextIntoFrontend(text, {
    fileName: file.name,
    buildPreview: true
  });

  setMainAiStatus(
    '✓ Progetto aperto dal file locale: ' +
    project.projectName +
    ' · archivi e CAD attivi'
  );
  activateModelPage();
  requestAnimationFrame(resize);
  return project;
}

function setRenderOriginBadge(origin, projectId = '') {
  if (!renderOriginBadge) return;

  const isService = origin === 'service';
  renderOriginBadge.classList.toggle('service', isService);
  renderOriginBadge.classList.toggle('local', !isService);

  if (isService) {
    const id = String(projectId || '').trim();
    const shortId = id ? id.slice(0, 12) : '';
    renderOriginBadge.textContent =
      'RENDERING ELABORATO DA TERMODEL SERVICE' +
      (shortId ? ' · projectId ' + shortId : '');
    renderOriginBadge.title = id
      ? 'Artifact model3d corrente del progetto ' + id
      : 'Artifact model3d elaborato da Termodel Service';
  } else {
    renderOriginBadge.textContent = 'ANTEPRIMA LOCALE · nessuna elaborazione server';
    renderOriginBadge.title = 'Rendering prodotto localmente dal browser, senza elaborazione Termodel Service.';
  }
}

function renderModelData(data, options = {}) {
  if (data.format !== 'TermodelWebModel' || !Array.isArray(data.primitives))
    throw new Error('Formato TermodelWebModel non valido');

  currentModelMode = options.mode || 'project';
  currentModelLabel = options.label || 'Termodel Web Model';
  lastModelData = data;
  setRenderOriginBadge(options.renderOrigin || 'local', options.projectId || '');

  disposeObject(modelGroup);
  disposeObject(edgeGroup);
  rebuildPianoFilters(data.primitives);
  updateFilterNote(data);

  data.primitives.forEach((primitive) => {
    if (primitive.kind === 'mesh')
      createMeshPrimitive(primitive);
    else if (primitive.kind === 'lineSegments')
      createLinePrimitive(primitive);
  });

  fitView();
  updateNorth3DMarker();
  edgeGroup.visible = true;
  applyFilters();

  const objectInfo = document.querySelector('#infoPage .classic-row:nth-child(3) strong');
  if (objectInfo) {
    if (currentModelMode === 'ai') {
      const h = data.previewAssumptions?.wallHeightMeters;
      const t = data.previewAssumptions?.wallThicknessMeters;
      const counts = data.previewCounts;
      objectInfo.textContent =
        `${data.primitiveCount ?? data.primitives.length} primitive da SVG AI · anteprima provvisoria` +
        (counts ? ` · ${counts.walls} pareti · ${counts.floors} pavimenti · ${counts.ceilings} soffitti` : '') +
        (Number.isFinite(h) && Number.isFinite(t) ? ` · h ${h.toFixed(2)} m · sp. pareti ${t.toFixed(2)} m` : '');
    } else {
      objectInfo.textContent = `${data.primitiveCount ?? data.primitives.length} primitive dal JSON Termodel`;
    }
  }
}

async function loadModel() {
  if (loading) return;
  loading = true;
  status.textContent = 'Caricamento TermodelWebModel.json...';

  try {
    const response = await fetch(`${MODEL_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    northOrientationDeg = null;
    cadUpdateNorthControls();
    renderModelData(data, {
      mode: 'project',
      label: 'PROGETTO ORIGINALE',
      renderOrigin: 'local'
    });
    activeProjectBrowserExampleId = '';
    setStructuredProjectState(false);
    setInitialModelExplorationLocked(true);
  } catch (error) {
    console.error(error);
    status.textContent = `Errore caricamento modello: ${error.message}`;
  } finally {
    loading = false;
    cadUpdateControls();
    if (initialModelExplorationLocked)
      syncInitialModelDesktopGateControls();
  }
}

function termodelServiceUsesLocalhost() {
  return helpLocalService?.checked === true;
}

function currentTermodelServiceBaseUrl() {
  return termodelServiceUsesLocalhost()
    ? TERMODEL_SERVICE_LOCAL_BASE_URL
    : TERMODEL_SERVICE_BASE_URL;
}

function currentTermodelServiceTargetLabel() {
  return termodelServiceUsesLocalhost()
    ? 'Locale · ' + TERMODEL_SERVICE_LOCAL_BASE_URL + ' · debug Visual Studio'
    : 'Cloud · ' + TERMODEL_SERVICE_BASE_URL;
}

function resetTermodelServiceConnectionCache() {
  termodelServiceReadyAt = 0;
  termodelServiceCapabilities = null;
  termodelServiceRuntimeLabel = '';
  termodelServiceRuntimeCommit = '';
  termodelServiceRuntimeEngine = '';
}

function resetDesktopTermodelServiceDefault() {
  if (helpLocalService) {
    helpLocalService.defaultChecked = false;
    helpLocalService.checked = false;
  }
  resetTermodelServiceConnectionCache();
}

function termodelServiceUrl(path) {
  const value = String(path || '');
  if (/^https?:\/\//i.test(value)) return value;
  const baseUrl = currentTermodelServiceBaseUrl();
  return baseUrl + (value.startsWith('/') ? value : '/' + value);
}

const TERMODEL_SERVICE_WAIT_STATUS = 'In Attesa di una risposta del server';
let termodelServicePendingRequests = 0;
let termodelServicePreviousViewportStatus = '';
let termodelServicePreviousCadStatus = null;

function beginTermodelServiceRequest() {
  if (termodelServicePendingRequests === 0) {
    termodelServicePreviousViewportStatus = status ? status.textContent : '';
    termodelServicePreviousCadStatus = cadEditStatus
      ? {
          text: cadEditStatus.textContent || '',
          kind: cadEditStatus.classList.contains('error')
            ? 'error'
            : (cadEditStatus.classList.contains('dirty') ? 'dirty' : '')
        }
      : null;

    if (status) status.textContent = TERMODEL_SERVICE_WAIT_STATUS;
    cadSetStatus(TERMODEL_SERVICE_WAIT_STATUS);
  }

  termodelServicePendingRequests += 1;
}

function endTermodelServiceRequest() {
  termodelServicePendingRequests = Math.max(0, termodelServicePendingRequests - 1);
  if (termodelServicePendingRequests !== 0) return;

  if (status && status.textContent === TERMODEL_SERVICE_WAIT_STATUS)
    status.textContent = termodelServicePreviousViewportStatus || '';

  if (cadEditStatus && cadEditStatus.textContent === TERMODEL_SERVICE_WAIT_STATUS) {
    cadSetStatus(
      termodelServicePreviousCadStatus?.text || '',
      termodelServicePreviousCadStatus?.kind || ''
    );
  }

  termodelServicePreviousViewportStatus = '';
  termodelServicePreviousCadStatus = null;
}

async function fetchTermodelService(path, options = {}) {
  beginTermodelServiceRequest();
  try {
    return await fetch(termodelServiceUrl(path), options);
  } finally {
    endTermodelServiceRequest();
  }
}

async function termodelGeneratedFilesCatalog(projectId) {
  const id = String(projectId || '').trim();
  if (!id) throw new Error('ProjectId non disponibile.');

  const response = await fetchTermodelService(
    '/api/projects/' + encodeURIComponent(id) + '/generated-files',
    { cache: 'no-store' }
  );

  if (!response.ok) {
    const detail = await readTermodelServiceError(response);
    throw new Error('File generati: ' + detail);
  }

  const data = await response.json();
  if (data?.contractVersion !== 'TERMODEL-GENERATED-FILES-V1')
    throw new Error('Contratto file generati non riconosciuto.');
  if (!Array.isArray(data.files))
    throw new Error('Catalogo file generati non valido.');

  return data;
}

async function termodelGeneratedFileText(fileRecord) {
  const href = String(fileRecord?.href || '').trim();
  if (!href) throw new Error('Href file generato mancante.');

  const response = await fetchTermodelService(href, {
    cache: 'no-store'
  });
  if (!response.ok) {
    const detail = await readTermodelServiceError(response);
    throw new Error('File generato: ' + detail);
  }

  return {
    text: await response.text(),
    stale: String(response.headers.get('X-Termodel-Artifact-Stale') || '').toLowerCase() === 'true'
  };
}

function ensureTermodelServiceProgress() {
  let panel = document.getElementById('termodelServiceProgress');
  if (panel) return panel;

  if (!document.getElementById('termodelServiceProgressStyles')) {
    const style = document.createElement('style');
    style.id = 'termodelServiceProgressStyles';
    style.textContent = `
      .termodel-service-progress {
        position: fixed;
        left: 50%;
        bottom: 58px;
        z-index: 90;
        width: min(84vw, 430px);
        transform: translateX(-50%);
        padding: 9px 11px;
        border: 1px solid #7f8790;
        border-radius: 7px;
        background: rgba(250,250,250,.97);
        box-shadow: 0 3px 14px rgba(0,0,0,.30);
        font-family: "Segoe UI", Arial, sans-serif;
        pointer-events: none;
      }
      .termodel-service-progress[hidden] { display: none; }
      .termodel-service-progress-text {
        margin-bottom: 6px;
        color: #20262c;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }
      .termodel-service-progress-track {
        height: 7px;
        overflow: hidden;
        border-radius: 999px;
        background: #d7dce1;
      }
      .termodel-service-progress-fill {
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: #3d7fb1;
        transition: width .2s ease;
      }
    `;
    document.head.appendChild(style);
  }

  panel = document.createElement('div');
  panel.id = 'termodelServiceProgress';
  panel.className = 'termodel-service-progress';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="termodel-service-progress-text"></div>
    <div class="termodel-service-progress-track" aria-hidden="true">
      <div class="termodel-service-progress-fill"></div>
    </div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function setTermodelServiceProgress(text, percent) {
  const panel = ensureTermodelServiceProgress();

  if (termodelServiceProgressHideTimer) {
    clearTimeout(termodelServiceProgressHideTimer);
    termodelServiceProgressHideTimer = null;
  }

  const label = panel.querySelector('.termodel-service-progress-text');
  const fill = panel.querySelector('.termodel-service-progress-fill');

  if (label) label.textContent = String(text || '');
  if (fill)
    fill.style.width = Math.max(0, Math.min(100, Number(percent) || 0)) + '%';

  panel.hidden = false;
}

function hideTermodelServiceProgress(delay = 420) {
  const panel = document.getElementById('termodelServiceProgress');
  if (!panel) return;

  if (termodelServiceProgressHideTimer)
    clearTimeout(termodelServiceProgressHideTimer);

  termodelServiceProgressHideTimer = setTimeout(() => {
    panel.hidden = true;
    const fill = panel.querySelector('.termodel-service-progress-fill');
    if (fill) fill.style.width = '0%';
    termodelServiceProgressHideTimer = null;
  }, Math.max(0, delay));
}

async function fetchTermodelServiceWithTimeout(
  path,
  options = {},
  timeoutMs = TERMODEL_SERVICE_WAKE_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchTermodelService(path, {
      ...options,
      signal: controller.signal,
      cache: options.cache || 'no-store'
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Termodel Service non ha risposto entro ' +
        Math.round(timeoutMs / 1000) +
        ' secondi.'
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureTermodelServiceReady(force = false) {
  const now = Date.now();
  if (!force &&
      termodelServiceCapabilities &&
      now - termodelServiceReadyAt < TERMODEL_SERVICE_READY_TTL_MS) {
    return termodelServiceCapabilities;
  }

  const localService = termodelServiceUsesLocalhost();
  setTermodelServiceProgress(
    localService
      ? 'Contatto Termodel Service locale…'
      : 'Contatto Termodel Service Cloud…',
    8
  );
  status.textContent =
    'Connessione al Termodel Service ' +
    (localService ? 'locale…' : 'Cloud…');

  let progress = 12;
  const wakeTimer = setInterval(() => {
    progress = Math.min(58, progress + 3);
    setTermodelServiceProgress(
      localService
        ? 'Attendo localhost:5080… avvia Termodel.WebService da Visual Studio'
        : 'Sto avviando Termodel Service… il piano Render Free può richiedere circa 50 secondi',
      progress
    );
  }, 3000);

  try {
    const healthResponse = await fetchTermodelServiceWithTimeout(
      '/health',
      { method: 'GET' },
      TERMODEL_SERVICE_WAKE_TIMEOUT_MS
    );

    if (!healthResponse.ok)
      throw new Error('Health Service: HTTP ' + healthResponse.status);

    const health = await healthResponse.json();
    if (String(health?.status || '').toLowerCase() !== 'ok')
      throw new Error('Health Service non valido.');

    const serviceCommitFull = String(
      health?.serviceCommit || health?.serviceCommitShort || ''
    ).trim();
    const serviceCommit = String(
      health?.serviceCommitShort || serviceCommitFull || ''
    ).trim();
    const spiralEngine = String(health?.spiralEngine || '').trim();
    termodelServiceRuntimeCommit = serviceCommitFull || serviceCommit;
    termodelServiceRuntimeEngine = spiralEngine;
    termodelServiceRuntimeLabel =
      'Server ' +
      (serviceCommit ? serviceCommit.slice(0, 8) : 'locale') +
      ' · ' +
      (spiralEngine || 'n/d');

    clearInterval(wakeTimer);
    setTermodelServiceProgress('Service attivo · verifico le capacità…', 72);

    const capabilitiesResponse = await fetchTermodelServiceWithTimeout(
      '/api/model/capabilities',
      { method: 'GET' },
      30000
    );

    if (!capabilitiesResponse.ok)
      throw new Error('Capabilities Service: HTTP ' + capabilitiesResponse.status);

    termodelServiceCapabilities = await capabilitiesResponse.json();
    termodelServiceReadyAt = Date.now();

    setTermodelServiceProgress(termodelServiceRuntimeLabel, 100);
    status.textContent = termodelServiceRuntimeLabel;
    hideTermodelServiceProgress(520);

    return termodelServiceCapabilities;
  } catch (error) {
    clearInterval(wakeTimer);
    termodelServiceReadyAt = 0;
    termodelServiceCapabilities = null;
    termodelServiceRuntimeLabel = '';
    termodelServiceRuntimeCommit = '';
    termodelServiceRuntimeEngine = '';
    setTermodelServiceProgress(
      'Service non disponibile: ' + (error?.message || error),
      100
    );
    hideTermodelServiceProgress(2600);
    throw error;
  }
}

function readProjectManifest(projectText) {
  const raw = getTermodelProjectSection(projectText, 'manifest.json');
  if (!raw) throw new Error('Il progetto non contiene manifest.json.');
  const manifest = JSON.parse(raw);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('manifest.json non valido.');
  return manifest;
}

function setProjectManifestIdentity(projectText, projectId, projectName = undefined) {
  const manifest = readProjectManifest(projectText);
  manifest.projectId = String(projectId || '').trim();
  if (projectName !== undefined)
    manifest.projectName = String(projectName || '').trim();
  return replaceTermodelProjectSection(
    projectText,
    'manifest.json',
    JSON.stringify(manifest, null, 2)
  );
}


function createLocalProjectId() {
  if (globalThis.crypto?.randomUUID)
    return globalThis.crypto.randomUUID();

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === 'x' ? value : ((value & 0x3) | 0x8);
    return nibble.toString(16);
  });
}

function syncCurrentProjectIdFromText(projectText) {
  try {
    const manifest = readProjectManifest(projectText);
    currentProjectId = String(manifest.projectId || '').trim();
  } catch (_) {
    currentProjectId = '';
  }
  syncCopyTermodelLogAvailability();
  return currentProjectId;
}

function ensureCurrentProjectId() {
  if (!structuredProjectActive || !currentProjectText)
    throw new Error('Nessun progetto strutturato aperto.');

  const manifest = readProjectManifest(currentProjectText);
  let projectId = String(manifest.projectId || '').trim();

  if (!projectId) {
    projectId = createLocalProjectId();
    currentProjectText = setProjectManifestIdentity(
      currentProjectText,
      projectId
    );
  }

  currentProjectId = projectId;
  syncCopyTermodelLogAvailability();
  return projectId;
}

let lastTermodelServerExchange = '';

function buildTermodelServerExchangeReport(exchange = {}) {
  const lines = [
    '[TERMODEL-SERVICE-EXCHANGE-V1]',
    'generatedAtUtc=' + new Date().toISOString(),
    'serviceBaseUrl=' + currentTermodelServiceBaseUrl()
  ];

  if (exchange.postStatus !== undefined && exchange.postStatus !== null) {
    lines.push(
      '',
      'POST ' + (exchange.postUrl || '/api/calculations'),
      'HTTP ' + exchange.postStatus,
      '---BEGIN:POST_RESPONSE---',
      String(exchange.postBody || ''),
      '---END:POST_RESPONSE---'
    );
  }

  if (exchange.modelUrl) {
    lines.push(
      '',
      'GET ' + exchange.modelUrl,
      exchange.modelStatus !== undefined && exchange.modelStatus !== null
        ? 'HTTP ' + exchange.modelStatus
        : 'HTTP non disponibile',
      '---BEGIN:MODEL3D_RESPONSE---',
      String(exchange.modelBody || ''),
      '---END:MODEL3D_RESPONSE---'
    );
  }

  if (exchange.error) {
    lines.push(
      '',
      '---BEGIN:CLIENT_ERROR---',
      String(exchange.error),
      '---END:CLIENT_ERROR---'
    );
  }

  return lines.join('\n');
}

async function copyTextToClipboard(text, label = 'testo') {
  const value = String(text == null ? '' : text);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    console.warn('Clipboard API non disponibile per ' + label + '.', error);
  }

  // Fallback per browser che negano navigator.clipboard dopo una richiesta async.
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-10000px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch (error) {
    console.warn('Copia negli appunti non riuscita per ' + label + '.', error);
    return false;
  }
}

async function copyTermodelServerExchange(exchange) {
  const text = buildTermodelServerExchangeReport(exchange);
  lastTermodelServerExchange = text;
  globalThis.TERMODEL_LAST_SERVER_EXCHANGE = text;
  return copyTextToClipboard(text, 'la diagnostica Service');
}

async function copyCurrentProjectToClipboard() {
  const text = await buildCurrentProjectText();
  if (!isCompleteTermodelProjectText(text))
    throw new Error('Il progetto corrente non è TERMODEL-PROJECT-TEXT-V1.');

  const copied = await copyTextToClipboard(text, 'il progetto Termodel');
  if (!copied)
    throw new Error('Il browser non ha consentito la copia negli appunti.');

  setMainAiStatus('✓ Progetto TERMODEL-PROJECT-TEXT-V1 copiato negli appunti.');
  return text;
}

async function readTermodelServiceError(response) {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('json')) {
      const problem = await response.json();
      return problem.detail || problem.title || JSON.stringify(problem);
    }
    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch (error) {
    console.warn('Impossibile leggere la diagnostica del WebService.', error);
  }
  return 'HTTP ' + response.status;
}

async function loadCalculatedModelFromService() {
  if (loading) return;
  if (!await ensureLatestTermodelFrontend()) return;
  if (!structuredProjectActive || !currentProjectText) {
    await loadModel();
    resetView();
    return;
  }

  const associationsResolved = await ensureTermodelPendingAssociationsResolved();
  if (!associationsResolved) {
    const pendingCount = termodelPendingAssociationItems().length;
    status.textContent =
      'Aggiorna Modello annullato · ' + pendingCount +
      ' elemento/i ancora da associare';
    return;
  }

  loading = true;
  clearCurrentTermodelLogCache();
  status.textContent =
    'Connessione al Termodel Service ' +
    (termodelServiceUsesLocalhost() ? 'locale…' : 'Cloud…');

  const exchange = {
    postUrl: '',
    postStatus: null,
    postBody: '',
    modelUrl: '',
    modelStatus: null,
    modelBody: ''
  };

  try {
    await ensureTermodelServiceReady();

    let completeProjectText = await buildCurrentProjectText();
    const projectId = ensureCurrentProjectId();
    completeProjectText = currentProjectText;
    const serverPayload = await buildTermodelServerPayload(completeProjectText);
    assertNoPendingAssociationsInServerPayload(serverPayload);

    const calculationPath = buildTermodelCalculationPath();
    exchange.postUrl = calculationPath;
    status.textContent = 'AggiornaCalcolo: elaborazione TermodelService...';
    const calculationResponse = await fetchTermodelService(
      calculationPath,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain; charset=utf-8'
        },
        body: serverPayload,
        cache: 'no-store'
      }
    );

    exchange.postStatus = calculationResponse.status;
    exchange.postBody = await calculationResponse.clone().text();

    if (!calculationResponse.ok) {
      const problem = termodelParseServiceProblem(exchange.postBody);
      if (termodelIsGeometryProblem(problem, calculationResponse.status)) {
        cadSetServiceGeometryProblem(problem);
        const detail = cadText(problem?.detail) || cadText(problem?.title) || 'Errore geometrico';
        throw new Error('AggiornaCalcolo: ' + detail);
      }

      const detail = await readTermodelServiceError(calculationResponse);
      throw new Error('AggiornaCalcolo: ' + detail);
    }

    // Un calcolo accettato dal Service rende superata l'eventuale evidenza
    // geometrica della precedente elaborazione fallita.
    cadClearServiceGeometryProblem();

    const calculation = await calculationResponse.json();
    if (calculation.contractVersion !== 'TERMODEL-FRONT-SERVICE-V1')
      throw new Error('Versione contratto WebService non riconosciuta.');

    if (!calculation.projectId)
      throw new Error('Il WebService non ha restituito projectId.');

    if (String(calculation.projectId) !== String(projectId))
      throw new Error('Il WebService ha restituito un projectId inatteso.');

    const artifacts = Array.isArray(calculation.artifacts) ? calculation.artifacts : [];
    const modelArtifact = artifacts.find(item =>
      item && item.name === 'model3d' && typeof item.href === 'string' && item.href
    );
    if (!modelArtifact)
      throw new Error('Il progetto non contiene l\'artifact model3d.');

    exchange.modelUrl = String(modelArtifact.href);
    status.textContent = 'Ricezione TermodelWebModel v3...';
    const modelResponse = await fetchTermodelService(modelArtifact.href, {
      cache: 'no-store'
    });

    exchange.modelStatus = modelResponse.status;
    exchange.modelBody = await modelResponse.clone().text();

    if (!modelResponse.ok) {
      const detail = await readTermodelServiceError(modelResponse);
      throw new Error('Artifact model3d: ' + detail);
    }

    const data = await modelResponse.json();
    currentServiceManifest = calculation;
    currentCalculationSpiralEngine = String(
      calculation.spiralEngine || termodelServiceRuntimeEngine || ''
    ).trim();
    // Un nuovo calcolo può aver sostituito l'esecutivo precedente. L'overlay
    // CAD è runtime: viene invalidato e ricaricato esplicitamente dal catalogo
    // universale dei file generati.
    cadGeneratedExecutiveOverlay = null;
    if (cadShowGeneratedExecutive) {
      cadShowGeneratedExecutive.checked = false;
      cadShowGeneratedExecutive.disabled = true;
    }
    resetPannelliOnlyModeForServiceModel();
    renderModelData(data, {
      mode: 'project',
      label: 'PROGETTO CORRENTE · SERVER',
      renderOrigin: 'service',
      projectId
    });
    resetView();

    // L'esecutivo pannelli è un artifact derivato dell'ultimo calcolo:
    // se presente lo carichiamo subito come overlay runtime del CAD2D.
    // La sua assenza non rende fallito Aggiorna Modello.
    await cadLoadGeneratedExecutiveBackground({
      automatic: true,
      silentMissing: true
    });

    await refreshCurrentTermodelLog(projectId);

    const diagnostics = Array.isArray(calculation.diagnostics)
      ? calculation.diagnostics.filter(Boolean)
      : [];
    const copied = await copyTermodelServerExchange(exchange);

    status.textContent =
      'PROGETTO CORRENTE · SERVER · ' +
      (data.primitiveCount ?? data.primitives.length) +
      ' primitive · motore ' +
      (currentCalculationSpiralEngine || termodelServiceRuntimeEngine || 'n/d') +
      ' · ' + diagnostics.length + ' diagnostica/e' +
      (copied ? ' · risposta copiata negli appunti' : ' · copia appunti non riuscita');
  } catch (error) {
    console.error(error);
    currentServiceManifest = null;
    currentCalculationSpiralEngine = '';
    exchange.error = error?.message || String(error);
    const copied = await copyTermodelServerExchange(exchange);
    status.textContent =
      'Errore Aggiorna Modello: ' + error.message +
      (copied ? ' · risposta copiata negli appunti' : ' · copia appunti non riuscita');
  } finally {
    loading = false;
  }
}

function resize() {
  const w = Math.max(1, viewer.clientWidth);
  const h = Math.max(1, viewer.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

const ro = new ResizeObserver(resize);
ro.observe(viewer);
window.addEventListener('resize', resize);

document.getElementById('resetView').addEventListener('click', async () => {
  showCommandHelp('Aggiorna Modello');
  if (!structuredProjectActive || !currentProjectText) {
    await loadModel();
    resetView();
    return;
  }

  await loadCalculatedModelFromService();
});

const filtersCheck = document.getElementById('filtersCheck');
const viewCube = document.querySelector('.view-cube');
const mobileViewerQuery = window.matchMedia('(max-width: 820px)');

function isMobileViewerLayout() {
  return mobileViewerQuery.matches;
}

function setFilterPanelVisibility(visible) {
  const mobile = isMobileViewerLayout();
  filterPanel.classList.toggle('visible', visible);
  filterPanel.classList.toggle('mobile-overlay', mobile);

  // Desktop: comportamento storico, i filtri riservano 228 px.
  // Smartphone: il pannello è un overlay e il viewer conserva tutta la larghezza.
  viewer.style.right = mobile ? '0' : (visible ? '228px' : '0');

  if (viewCube)
    viewCube.style.right = mobile ? '8px' : (visible ? '248px' : '20px');

  requestAnimationFrame(resize);
}

filtersCheck.addEventListener('change', (event) => {
  setFilterPanelVisibility(event.target.checked);
  showCommandHelp('Mostra Filtri Grafici');
});

filterPanel.querySelector('.web-filter-mobile-close')?.addEventListener('click', () => {
  filtersCheck.checked = false;
  setFilterPanelVisibility(false);
});

// Desktop conserva il comportamento storico. Su smartphone i filtri partono
// chiusi per lasciare al modello 3D la massima superficie disponibile.
if (isMobileViewerLayout())
  filtersCheck.checked = false;

setFilterPanelVisibility(filtersCheck.checked);

const onMobileViewerLayoutChange = () => {
  if (isMobileViewerLayout() && filterPanel.classList.contains('visible'))
    filtersCheck.checked = false;
  setFilterPanelVisibility(filtersCheck.checked);
};

if (typeof mobileViewerQuery.addEventListener === 'function')
  mobileViewerQuery.addEventListener('change', onMobileViewerLayoutChange);
else if (typeof mobileViewerQuery.addListener === 'function')
  mobileViewerQuery.addListener(onMobileViewerLayoutChange);

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.page).classList.add('active');
    showCommandHelp(helpKeyFromElement(tab));
    if (tab.dataset.page === 'modelPage') requestAnimationFrame(resize);
  });
});

const cadToolMenus = Array.from(document.querySelectorAll('.cad-tool-menu'));

function cadCloseToolMenus(except = null) {
  cadToolMenus.forEach(menu => {
    if (menu !== except) menu.open = false;
  });
}

cadToolMenus.forEach(menu => {
  menu.addEventListener('toggle', () => {
    if (menu.open) cadCloseToolMenus(menu);
  });
});

document.querySelectorAll('.cad-tool-dropdown button').forEach(button => {
  button.addEventListener('click', () => {
    button.closest('.cad-tool-menu')?.removeAttribute('open');
  });
});

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.cad-tool-menu')) cadCloseToolMenus();
});

document.querySelectorAll('.menu > button').forEach(button => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const menu = button.parentElement;
    document.querySelectorAll('.menu').forEach(m => {
      if (m !== menu) m.classList.remove('open');
    });
    menu.classList.toggle('open');
    if (button.textContent.trim() !== 'Help')
      showCommandHelp(helpKeyFromElement(button));
  });
});

document.querySelectorAll('.dropdown button').forEach(button => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!button.dataset.archive) {
      showCommandHelp(helpKeyFromElement(button));
      button.closest('.menu')?.classList.remove('open');
    }
  });
});

document.querySelectorAll('.dropdown .menu-check').forEach(label => {
  label.addEventListener('click', event => event.stopPropagation());
});

helpExplorationMode?.addEventListener('change', () => {
  explorationModeEnabled = helpExplorationMode.checked === true;
  if (!explorationModeEnabled)
    hideCommandHelp();
});

// Default garantito OFF anche se il browser tenta di ripristinare lo stato
// precedente del checkbox dopo refresh/back-forward cache.
resetDesktopExplorationModeDefault();
resetDesktopTermodelServiceDefault();
window.addEventListener('pageshow', resetDesktopExplorationModeDefault);
window.addEventListener('pageshow', resetDesktopTermodelServiceDefault);

// In modalità esplorazione ogni controllo desktop cliccabile passa dal
// pannello informativo, ma l'evento continua verso la funzione originale.
document.addEventListener('click', handleDesktopExplorationHelp, true);

document.addEventListener('click', () => {
  document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
});

document.querySelectorAll('[data-archive]').forEach(button => {
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!structuredProjectActive) {
      openProjectStartDialog({
        target: 'archive',
        archiveName: button.dataset.archive || 'Piani'
      });
      return;
    }

    try {
      await openArchivioWeb(button.dataset.archive || 'Piani');
    } catch (error) {
      window.alert('Archivio Termodel non disponibile: ' + error.message);
    }

    button.closest('.menu')?.classList.remove('open');
  });
});


const TERMODEL_GENERAL_PROMPT_URL = './TermodelGenerale.md';
const RASTER_PROMPT_URL = './CreaPianoTermodelDaRaster.md';
const TERMODEL_AI_INDEX_URL = 'https://www.termodel.it/termodel-ui-demo/IndiceAI.html?v=0.25';
const TERMODEL_WEB_AI_URL = 'https://www.termodel.it/termodel-ui-demo/TermodelWeb.html?v=0.1';
const MYHOME3D_AI_INSTRUCTION_URL = './MyHome3D.md?v=0.26';

const instructAiButton = document.getElementById('instructAiButton');
const aiFlowHelpButton = document.getElementById('aiFlowHelpButton');
const importAiButton = document.getElementById('importAiButton');
const aiProjectChoiceModal = document.getElementById('aiProjectChoiceModal');
const aiProjectChoiceClose = document.getElementById('aiProjectChoiceClose');
const aiProjectChoiceCloseBottom = document.getElementById('aiProjectChoiceCloseBottom');
const aiProjectOpenChatGpt = document.getElementById('aiProjectOpenChatGpt');
const aiProjectCopyPrompt = document.getElementById('aiProjectCopyPrompt');
const aiSplitGuideModal = document.getElementById('aiSplitGuideModal');
const aiSplitGuideClose = document.getElementById('aiSplitGuideClose');
const aiSplitGuideBack = document.getElementById('aiSplitGuideBack');
const aiSplitGuideOpen = document.getElementById('aiSplitGuideOpen');
const aiImportChoiceModal = document.getElementById('aiImportChoiceModal');
const aiImportChoiceClose = document.getElementById('aiImportChoiceClose');
const aiImportChoiceCloseBottom = document.getElementById('aiImportChoiceCloseBottom');
const aiImportFromClipboardButton = document.getElementById('aiImportFromClipboard');
const aiImportFromDownloadsButton = document.getElementById('aiImportFromDownloads');
const aiInstructModal = document.getElementById('aiInstructModal');
const aiInstructClose = document.getElementById('aiInstructClose');
const aiInstructCloseBottom = document.getElementById('aiInstructCloseBottom');
const aiFlowHelpModal = document.getElementById('aiFlowHelpModal');
const aiFlowHelpClose = document.getElementById('aiFlowHelpClose');
const aiFlowHelpCloseBottom = document.getElementById('aiFlowHelpCloseBottom');
const webHelpModal = document.getElementById('webHelpModal');
const webHelpClose = document.getElementById('webHelpClose');
const webHelpCloseBottom = document.getElementById('webHelpCloseBottom');
const webHelpInstructAi = document.getElementById('webHelpInstructAi');

const projectExploreModal = document.getElementById('projectExploreModal');
const projectExploreExamples = document.getElementById('projectExploreExamples');
const projectExploreStatus = document.getElementById('projectExploreStatus');
const projectExploreClose = document.getElementById('projectExploreClose');
const projectExploreCloseBottom = document.getElementById('projectExploreCloseBottom');

function isInitialModelDesktopGateControl(target) {
  if (!(target instanceof Element) || !appRoot?.contains(target))
    return null;

  return target.closest('button, input, select, summary, label, .tab');
}

function shouldBypassInitialModelDesktopGate(control) {
  if (!control) return true;

  if (control === newProjectButton ||
      control === openProjectButton ||
      control === openProjectFileInput ||
      control === instructAiButton ||
      control === aiFlowHelpButton ||
      control === importAiButton)
    return true;

  if (control.closest?.('#helpMenu'))
    return true;

  // Il modello iniziale resta non esplorabile, ma i filtri agiscono
  // localmente sulle primitive 3D gia' caricate e devono restare utilizzabili.
  // Vale sia per il pannello sia per il checkbox nella barra inferiore.
  if (control === filtersCheck ||
      control.closest?.('.check-wrap') ||
      control.closest?.('#webFilterPanel'))
    return true;

  if (control.matches?.('.menu > button') &&
      control.textContent.trim() === 'File')
    return true;

  return false;
}

function handleInitialModelDesktopGate(event) {
  if (TERMODEL_ANDROID_DEVICE || !initialModelExplorationLocked)
    return;

  const control = isInitialModelDesktopGateControl(event.target);
  if (!control || shouldBypassInitialModelDesktopGate(control))
    return;

  event.preventDefault();
  event.stopImmediatePropagation();
  document.querySelectorAll('.menu').forEach(menu => menu.classList.remove('open'));

  void openProjectExploreDialog().catch(error => {
    console.error('Selezione esempio non disponibile:', error);
    if (status)
      status.textContent = 'Errore esempi: ' + (error?.message || error);
  });
}

appRoot?.addEventListener('click', handleInitialModelDesktopGate, true);

const projectStartModal = document.getElementById('projectStartModal');
const projectStartMessage = document.getElementById('projectStartMessage');
const projectStartClose = document.getElementById('projectStartClose');
const projectStartCloseBottom = document.getElementById('projectStartCloseBottom');
const projectStartBlank = document.getElementById('projectStartBlank');
const projectStartInstructAi = document.getElementById('projectStartInstructAi');
const projectStartImportAi = document.getElementById('projectStartImportAi');
const newProjectButton = document.getElementById('newProjectButton');
let projectStartContext = { target: 'cad', archiveName: '' };

const TERMODEL_AI_BOOTSTRAP = `Sei l’assistente AI di Termodel.

Prima di aiutare l’utente, apri direttamente e leggi le istruzioni aggiornate pubblicate all’indirizzo:

https://www.termodel.it/ai/

Non cercare Termodel sul Web e non sostituire questa pagina con risultati di ricerca relativi ad altri prodotti.

Dopo aver letto le istruzioni, applicale alla richiesta dell’utente.

Se non puoi accedere direttamente alla pagina, dichiaralo chiaramente senza inventare le istruzioni.`;

function setMainAiStatus(message) {
  if (status) status.textContent = message;
}

function openAiProjectChoiceDialog() {
  if (!aiProjectChoiceModal) return;
  document.querySelectorAll('.menu').forEach(menu => menu.classList.remove('open'));
  aiProjectChoiceModal.classList.add('visible');
  aiProjectChoiceModal.setAttribute('aria-hidden', 'false');
  aiProjectOpenChatGpt?.focus();
}

function closeAiProjectChoiceDialog() {
  if (!aiProjectChoiceModal) return;
  aiProjectChoiceModal.classList.remove('visible');
  aiProjectChoiceModal.setAttribute('aria-hidden', 'true');
}

let aiImportChoiceResolve = null;
let aiDownloadDirectoryHandle = null;

function finishAiImportChoice(result = false) {
  if (aiImportChoiceModal) {
    aiImportChoiceModal.classList.remove('visible');
    aiImportChoiceModal.setAttribute('aria-hidden', 'true');
  }

  const resolve = aiImportChoiceResolve;
  aiImportChoiceResolve = null;
  if (resolve) resolve(Boolean(result));
}

function openAiImportChoiceDialog() {
  if (!aiImportChoiceModal)
    return Promise.resolve(false);

  if (aiImportChoiceResolve)
    finishAiImportChoice(false);

  document.querySelectorAll('.menu').forEach(menu => menu.classList.remove('open'));
  aiImportChoiceModal.classList.add('visible');
  aiImportChoiceModal.setAttribute('aria-hidden', 'false');
  aiImportFromClipboardButton?.focus();

  return new Promise(resolve => {
    aiImportChoiceResolve = resolve;
  });
}

async function getAiDownloadsDirectoryHandle() {
  if (aiDownloadDirectoryHandle) {
    try {
      if (!aiDownloadDirectoryHandle.queryPermission)
        return aiDownloadDirectoryHandle;

      const permission = await aiDownloadDirectoryHandle.queryPermission({ mode: 'read' });
      if (permission === 'granted')
        return aiDownloadDirectoryHandle;

      if (permission === 'prompt' && aiDownloadDirectoryHandle.requestPermission) {
        const requested = await aiDownloadDirectoryHandle.requestPermission({ mode: 'read' });
        if (requested === 'granted')
          return aiDownloadDirectoryHandle;
      }
    } catch (_) {
      // Se il browser invalida l'handle, riapriamo il selettore.
    }
    aiDownloadDirectoryHandle = null;
  }

  if (typeof window.showDirectoryPicker !== 'function')
    throw new Error('ACCESSO_DOWNLOAD_NON_SUPPORTATO');

  let handle;
  try {
    handle = await window.showDirectoryPicker({
      id: 'termodel-ai-downloads',
      mode: 'read',
      startIn: 'downloads'
    });
  } catch (error) {
    if (error?.name !== 'TypeError')
      throw error;

    // Fallback per implementazioni che non accettano ancora startIn/id.
    handle = await window.showDirectoryPicker({ mode: 'read' });
  }

  aiDownloadDirectoryHandle = handle;
  return handle;
}

async function importAiFromDownloads() {
  let directoryHandle;
  try {
    directoryHandle = await getAiDownloadsDirectoryHandle();
  } catch (error) {
    if (error?.name === 'AbortError')
      return false;

    if (error?.message === 'ACCESSO_DOWNLOAD_NON_SUPPORTATO') {
      window.alert(
        'Questo browser non consente a Termodel di leggere direttamente la cartella Download.\n\n' +
        'Usa Importa dagli appunti oppure apri Termodel con una versione recente di Chrome o Edge.'
      );
      return false;
    }

    console.error('Accesso alla cartella Download non riuscito:', error);
    window.alert('Impossibile accedere alla cartella Download.\n\n' + (error?.message || error));
    return false;
  }

  let fileHandle;
  try {
    fileHandle = await directoryHandle.getFileHandle('DisegnoInput.svg');
  } catch (error) {
    if (error?.name === 'NotFoundError') {
      aiDownloadDirectoryHandle = null;
      window.alert(
        'DisegnoInput.svg non è stato trovato nella cartella selezionata.\n\n' +
        'Scarica prima DisegnoInput.svg dalla chat AI e riprova scegliendo la cartella Download.'
      );
      return false;
    }

    console.error('Lettura DisegnoInput.svg non riuscita:', error);
    window.alert('Impossibile leggere DisegnoInput.svg dalla cartella Download.\n\n' + (error?.message || error));
    return false;
  }

  try {
    const file = await fileHandle.getFile();
    const text = await file.text();

    if (!/<svg\b/i.test(text)) {
      window.alert(
        'Il file DisegnoInput.svg trovato in Download non contiene uno SVG valido da importare.'
      );
      return false;
    }

    setMainAiStatus('DisegnoInput.svg trovato in Download · importazione in corso...');
    return await importAiText(text, { source: 'download' });
  } catch (error) {
    console.error('Importazione DisegnoInput.svg non riuscita:', error);
    window.alert('DisegnoInput.svg non importato.\n\n' + (error?.message || error));
    return false;
  }
}

function openAiSplitGuideDialog() {
  if (!aiSplitGuideModal) {
    return openChatGptWithTermodelBootstrap();
  }

  closeAiProjectChoiceDialog();
  aiSplitGuideModal.classList.add('visible');
  aiSplitGuideModal.setAttribute('aria-hidden', 'false');
  aiSplitGuideOpen?.focus();
  return true;
}

function closeAiSplitGuideDialog() {
  if (!aiSplitGuideModal) return;
  aiSplitGuideModal.classList.remove('visible');
  aiSplitGuideModal.setAttribute('aria-hidden', 'true');
}

function backFromAiSplitGuideDialog() {
  closeAiSplitGuideDialog();
  openAiProjectChoiceDialog();
}

function buildChatGptTermodelUrl() {
  return 'https://chatgpt.com/?q=' + encodeURIComponent(TERMODEL_AI_BOOTSTRAP);
}

function openChatGptWithTermodelBootstrap() {
  const target = buildChatGptTermodelUrl();
  const opened = window.open(target, '_blank');
  if (!opened) {
    window.alert('Il browser ha bloccato l’apertura di ChatGPT. Consenti i popup per Termodel oppure usa la copia negli appunti.');
    return false;
  }

  // In vista affiancata il pannello filtri toglierebbe spazio al modello.
  // Lo chiudiamo soltanto dopo che l'apertura di ChatGPT è riuscita.
  if (filtersCheck?.checked) {
    filtersCheck.checked = false;
    setFilterPanelVisibility(false);
  }

  try { opened.opener = null; } catch (_) {}
  setMainAiStatus('✓ ChatGPT aperto con la programmazione Termodel · trascina la scheda a destra per affiancarla');
  return true;
}

function openWebHelpDialog() {
  if (!webHelpModal) return;
  document.querySelectorAll('.menu').forEach(menu => menu.classList.remove('open'));
  webHelpModal.classList.add('visible');
  webHelpModal.setAttribute('aria-hidden', 'false');
  webHelpInstructAi?.focus();
}

function closeWebHelpDialog() {
  if (!webHelpModal) return;
  webHelpModal.classList.remove('visible');
  webHelpModal.setAttribute('aria-hidden', 'true');
}

function openAiInstructDialog() {
  if (!aiInstructModal) return;
  aiInstructModal.classList.add('visible');
  aiInstructModal.setAttribute('aria-hidden', 'false');
}

function closeAiInstructDialog() {
  if (!aiInstructModal) return;
  aiInstructModal.classList.remove('visible');
  aiInstructModal.setAttribute('aria-hidden', 'true');
}

function openAiFlowHelpDialog() {
  if (!aiFlowHelpModal) return;
  aiFlowHelpModal.classList.add('visible');
  aiFlowHelpModal.setAttribute('aria-hidden', 'false');
  aiFlowHelpClose?.focus();
}

function closeAiFlowHelpDialog() {
  if (!aiFlowHelpModal) return;
  aiFlowHelpModal.classList.remove('visible');
  aiFlowHelpModal.setAttribute('aria-hidden', 'true');
}

function openProjectStartDialog(context = {}) {
  projectStartContext = {
    target: context.target || 'cad',
    archiveName: context.archiveName || ''
  };

  if (projectStartMessage) {
    projectStartMessage.textContent =
      projectStartContext.target === 'archive'
        ? `Il modello iniziale è un esempio. Per aprire l'archivio "${projectStartContext.archiveName}" crea o importa prima il tuo progetto Termodel.`
        : 'Il modello iniziale è un esempio. Scegli come vuoi iniziare il tuo progetto Termodel.';
  }

  if (!projectStartModal) return;
  projectStartModal.classList.add('visible');
  projectStartModal.setAttribute('aria-hidden', 'false');
}

function closeProjectStartDialog() {
  if (!projectStartModal) return;
  projectStartModal.classList.remove('visible');
  projectStartModal.setAttribute('aria-hidden', 'true');
}

function createBlankProjectSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <g id="calpestabile"></g>
  <g id="copertura"></g>
</svg>`;
}

function createBlankCleanSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <g id="locali-puliti"></g>
  <g id="pareti-architettoniche"></g>
  <g id="contorni-architettonici"></g>
  <g id="etichette-locali"></g>
</svg>`;
}

async function continueAfterProjectStart() {
  const context = projectStartContext;
  if (context.target === 'archive' && context.archiveName) {
    try {
      await openArchivioWeb(context.archiveName);
    } catch (error) {
      window.alert('Archivio Termodel non disponibile: ' + error.message);
    }
    return;
  }

  activateCadPage();
}

async function startBlankProjectFromCad() {
  closeProjectStartDialog();
  setMainAiStatus('Creazione progetto Termodel vuoto...');

  try {
    const svg = createBlankProjectSvg();
    const project = await createStructuredProjectFromSvg(svg);
    currentProjectFileName = projectFileNameFromName(project.projectName);

    validatedSvg = svg;
    lastCleanPlanSvg = createBlankCleanSvg();
    lastGeneratedPlan = null;
    lastAiPreviewData = null;
    cadSetWorkingSvg(svg);
    validatedSvg = cadSerializeWorkingSvg();
    rasterSvgText.value = validatedSvg;

    setStructuredProjectState(true);
    setMainAiStatus('Progetto vuoto creato · registrazione sul Termodel Service…');
    await saveCurrentProject(false);
    setMainAiStatus(`✓ Progetto vuoto creato sul Service: ${project.projectName} · archivi e CAD attivi`);

    projectStartContext = { target: 'cad', archiveName: '' };
    activateCadPage();
    cadSetStatus('Progetto vuoto · usa ＋ Nuova parete per iniziare il disegno');
  } catch (error) {
    setStructuredProjectState(false);
    console.error('Creazione progetto vuoto non riuscita:', error);
    setMainAiStatus(`⚠ Progetto vuoto non creato: ${error.message}`);
    window.alert('Impossibile creare il progetto Termodel vuoto.\n\n' + error.message);
  }
}

async function copyTermodelAiBootstrap({ openDialog = false } = {}) {
  const copied = await copyTextToClipboard(TERMODEL_AI_BOOTSTRAP, 'l’istruzione AI Termodel');
  if (!copied)
    return false;

  setMainAiStatus('✓ Istruzione AI Termodel copiata negli appunti');
  if (openDialog)
    openAiInstructDialog();
  return true;
}

async function instructAiFromMainForm(event) {
  event?.preventDefault();
  event?.stopPropagation();
  openAiProjectChoiceDialog();
}

const TERMODEL_AI_LINK_HASH_PREFIX = '#ai=';
const TERMODEL_AI_LINK_HASH_BASE64_PREFIX = '#ai64=';

function decodeTermodelAiLinkBase64Url(encoded) {
  const source = String(encoded || '').trim();
  if (!source)
    throw new Error('Payload del link AI vuoto.');

  let base64 = source.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4)
    base64 += '=';

  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function readTermodelAiLinkPayload() {
  const hash = String(window.location.hash || '');
  if (!hash) return '';

  if (hash.startsWith(TERMODEL_AI_LINK_HASH_BASE64_PREFIX)) {
    const encoded = hash.slice(TERMODEL_AI_LINK_HASH_BASE64_PREFIX.length);
    try {
      return decodeTermodelAiLinkBase64Url(encoded);
    } catch (error) {
      throw new Error('Link AI Termodel non valido: payload Base64URL illeggibile. ' + error.message);
    }
  }

  if (hash.startsWith(TERMODEL_AI_LINK_HASH_PREFIX)) {
    const encoded = hash.slice(TERMODEL_AI_LINK_HASH_PREFIX.length);
    if (!encoded)
      throw new Error('Link AI Termodel non valido: payload mancante.');
    try {
      return decodeURIComponent(encoded);
    } catch (error) {
      throw new Error('Link AI Termodel non valido: codifica URL illeggibile. ' + error.message);
    }
  }

  return '';
}

function clearTermodelAiLinkHash() {
  if (
    !window.location.hash.startsWith(TERMODEL_AI_LINK_HASH_PREFIX) &&
    !window.location.hash.startsWith(TERMODEL_AI_LINK_HASH_BASE64_PREFIX)
  ) return;

  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(window.history.state, document.title, cleanUrl);
}

async function importAiText(text, { source = 'clipboard' } = {}) {
  const sourceIsLink = source === 'link';
  const sourceIsDownload = source === 'download';
  const sourceLabel = sourceIsLink
    ? 'link AI'
    : sourceIsDownload
      ? 'file DisegnoInput.svg'
      : 'contenuto degli appunti';
  const value = String(text || '');

  const startingFromInitialModel =
    initialModelExplorationLocked && !structuredProjectActive;

  if (startingFromInitialModel) {
    setMainAiStatus(
      sourceIsLink
        ? 'Nuovo progetto da AI · lettura del link...'
        : sourceIsDownload
          ? 'Nuovo progetto da AI · lettura di DisegnoInput.svg da Download...'
          : 'Nuovo progetto da AI · lettura degli appunti...'
    );
  }

  if (!value.trim()) {
    window.alert(
      sourceIsLink
        ? 'Il link AI non contiene un progetto Termodel.'
        : sourceIsDownload
          ? 'DisegnoInput.svg è vuoto.'
          : "Nella clipboard non c'è un progetto MyHome3D."
    );
    return false;
  }

  const sourceUpper = value.toUpperCase();
  const containsTermodelSvgTransport = sourceUpper.includes('[TERMODEL-SVG-TEXT-V1]');
  const containsSvg = /<svg\b/i.test(value);
  const looksLikeGenericXml =
    !containsTermodelSvgTransport &&
    !containsSvg &&
    (
      /<\?xml\b/i.test(value) ||
      /<\/?[A-Za-z_][A-Za-z0-9_.:-]*(?:\s|>)/.test(value)
    );

  if (!isTermodelProjectText(value) && looksLikeGenericXml) {
    window.alert(
      'Il ' + sourceLabel + ' contiene un XML, ma "Importa da AI" non accetta XML generico o XML Nazionale.\n\n' +
      'Per un risultato generato dall’AI usa un progetto Termodel corrente oppure TERMODEL-SVG-TEXT-V1.\n\n' +
      'L’XML Nazionale appartiene a un flusso separato.'
    );
    return false;
  }

  let imported = false;

  if (isTermodelProjectText(value)) {
    try {
      const project = await loadProjectTextIntoFrontend(value, {
        fileName: '',
        buildPreview: true
      });
      imported = true;

      setMainAiStatus(
        sourceIsLink
          ? `✓ Progetto aperto dal link AI: ${project.projectName} · editing attivo`
          : `✓ Nuovo progetto importato da AI: ${project.projectName} · editing attivo`
      );
    } catch (error) {
      window.alert('Progetto Termodel non importato: ' + error.message);
      return false;
    }
  } else {
    const hadStructuredProject = structuredProjectActive;
    imported = processSvgText(value);

    if (imported) {
      if (hadStructuredProject) {
        setStructuredProjectState(true);
        setMainAiStatus(
          sourceIsLink
            ? '✓ Pianta SVG ricevuta dal link AI e aggiornata nel progetto · editing attivo'
            : '✓ Pianta SVG aggiornata nel progetto strutturato esistente · editing attivo'
        );
      } else {
        setMainAiStatus(
          sourceIsLink
            ? 'Pianta SVG ricevuta dal link AI · creazione progetto Termodel strutturato locale...'
            : 'Pianta SVG importata · creazione progetto Termodel strutturato locale...'
        );

        try {
          const project = await createStructuredProjectFromSvg(validatedSvg);

          // Il primo processSvgText() avviene prima della creazione del progetto:
          // in quel momento l'archivio Piani può non essere ancora disponibile.
          // Ora che il progetto base locale e Piani sono caricati, rileggiamo lo
          // stesso SVG nel CAD per assegnare le entità legacy al piano corrente.
          cadSetWorkingSvg(validatedSvg);
          validatedSvg = cadSerializeWorkingSvg();
          rasterSvgText.value = validatedSvg;

          setMainAiStatus(
            sourceIsLink
              ? `✓ Nuovo progetto Termodel aperto dal link AI: ${project.projectName} · geometria assegnata al piano ${cadCurrentPlane()} · archivi e CAD attivi`
              : `✓ Nuovo progetto Termodel creato da AI: ${project.projectName} · geometria assegnata al piano ${cadCurrentPlane()} · archivi e CAD attivi`
          );
        } catch (error) {
          setStructuredProjectState(false);
          console.error('Creazione progetto strutturato locale non riuscita:', error);
          setMainAiStatus(`⚠ Pianta importata ma progetto strutturato locale non creato: ${error.message}`);
          window.alert(
            'Pianta AI importata, ma il template locale non ha creato il progetto strutturato.\n\n' +
            error.message
          );
        }
      }
    }
  }

  if (!imported) {
    window.alert(
      'Il ' + sourceLabel + ' non contiene un formato importabile da AI.\n\n' +
      'Usa un progetto Termodel corrente oppure un payload TERMODEL-SVG-TEXT-V1. ' +
      'Un XML Nazionale appartiene a un flusso separato.'
    );
    return false;
  }

  // Un progetto importato dall'AI non è un esempio del catalogo:
  // azzera l'eventuale selezione precedente e ricalcola i comandi Mobile
  // sul progetto strutturato corrente.
  activeProjectBrowserExampleId = '';
  const androidExampleSelect = document.getElementById('androidExploreExample');
  if (androidExampleSelect)
    androidExampleSelect.value = '';
  syncAndroidExampleCadAvailability();

  activateModelPage();
  requestAnimationFrame(resize);
  return true;
}

async function importAiFromClipboard() {
  let text = '';
  try {
    if (!navigator.clipboard?.readText)
      throw new Error('Clipboard non disponibile');
    text = await navigator.clipboard.readText();
  } catch (_) {
    window.alert("Nella clipboard non c'è un progetto MyHome3D.");
    return false;
  }

  return importAiText(text, { source: 'clipboard' });
}

async function importAiFromMainForm(event) {
  event?.preventDefault();
  event?.stopPropagation();
  return openAiImportChoiceDialog();
}

async function importAiFromLocationHash() {
  let text = '';
  try {
    text = readTermodelAiLinkPayload();
  } catch (error) {
    clearTermodelAiLinkHash();
    console.error('Link AI Termodel non leggibile:', error);
    window.alert(error.message);
    return false;
  }

  if (!text) return false;

  // Il fragment non viene inviato al server. Dopo averlo letto lo eliminiamo
  // anche dalla barra indirizzi, così un refresh non ripete l'importazione.
  clearTermodelAiLinkHash();
  setMainAiStatus('Progetto AI rilevato nel link · importazione in corso...');

  return importAiText(text, { source: 'link' });
}

helpOpenWebHelp?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  openWebHelpDialog();
});

webHelpClose?.addEventListener('click', closeWebHelpDialog);
webHelpCloseBottom?.addEventListener('click', closeWebHelpDialog);
webHelpModal?.addEventListener('click', event => {
  if (event.target === webHelpModal)
    closeWebHelpDialog();
});
webHelpInstructAi?.addEventListener('click', async event => {
  closeWebHelpDialog();
  await instructAiFromMainForm(event);
});

if (instructAiButton)
  instructAiButton.addEventListener('click', instructAiFromMainForm);
if (aiFlowHelpButton)
  aiFlowHelpButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openAiFlowHelpDialog();
  });
if (importAiButton)
  importAiButton.addEventListener('click', importAiFromMainForm);
if (aiImportChoiceClose)
  aiImportChoiceClose.addEventListener('click', () => finishAiImportChoice(false));
if (aiImportChoiceCloseBottom)
  aiImportChoiceCloseBottom.addEventListener('click', () => finishAiImportChoice(false));
if (aiImportChoiceModal)
  aiImportChoiceModal.addEventListener('click', event => {
    if (event.target === aiImportChoiceModal) finishAiImportChoice(false);
  });
if (aiImportFromClipboardButton)
  aiImportFromClipboardButton.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const imported = await importAiFromClipboard();
    if (imported) finishAiImportChoice(true);
  });
if (aiImportFromDownloadsButton)
  aiImportFromDownloadsButton.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const imported = await importAiFromDownloads();
    if (imported) finishAiImportChoice(true);
  });
if (aiProjectChoiceClose)
  aiProjectChoiceClose.addEventListener('click', closeAiProjectChoiceDialog);
if (aiProjectChoiceCloseBottom)
  aiProjectChoiceCloseBottom.addEventListener('click', closeAiProjectChoiceDialog);
if (aiProjectChoiceModal)
  aiProjectChoiceModal.addEventListener('click', event => {
    if (event.target === aiProjectChoiceModal) closeAiProjectChoiceDialog();
  });
if (aiProjectOpenChatGpt)
  aiProjectOpenChatGpt.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openAiSplitGuideDialog();
  });
if (aiSplitGuideClose)
  aiSplitGuideClose.addEventListener('click', closeAiSplitGuideDialog);
if (aiSplitGuideBack)
  aiSplitGuideBack.addEventListener('click', backFromAiSplitGuideDialog);
if (aiSplitGuideOpen)
  aiSplitGuideOpen.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (openChatGptWithTermodelBootstrap())
      closeAiSplitGuideDialog();
  });
if (aiSplitGuideModal)
  aiSplitGuideModal.addEventListener('click', event => {
    if (event.target === aiSplitGuideModal) closeAiSplitGuideDialog();
  });
if (aiProjectCopyPrompt)
  aiProjectCopyPrompt.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    const copied = await copyTermodelAiBootstrap({ openDialog: true });
    if (!copied) {
      window.alert('Impossibile copiare la programmazione AI negli appunti.');
      return;
    }
    closeAiProjectChoiceDialog();
  });
if (aiInstructClose)
  aiInstructClose.addEventListener('click', closeAiInstructDialog);
if (aiInstructCloseBottom)
  aiInstructCloseBottom.addEventListener('click', closeAiInstructDialog);
if (aiInstructModal)
  aiInstructModal.addEventListener('click', (event) => {
    if (event.target === aiInstructModal) closeAiInstructDialog();
  });
if (aiFlowHelpClose)
  aiFlowHelpClose.addEventListener('click', closeAiFlowHelpDialog);
if (aiFlowHelpCloseBottom)
  aiFlowHelpCloseBottom.addEventListener('click', closeAiFlowHelpDialog);
if (aiFlowHelpModal)
  aiFlowHelpModal.addEventListener('click', event => {
    if (event.target === aiFlowHelpModal) closeAiFlowHelpDialog();
  });

const rasterAiModal = document.getElementById('rasterAiModal');
const rasterFileInput = document.getElementById('rasterFileInput');
const rasterSvgFileInput = document.getElementById('rasterSvgFileInput');
const rasterPreviewImage = document.getElementById('rasterPreviewImage');
const rasterPreviewPlaceholder = document.getElementById('rasterPreviewPlaceholder');
const rasterFileName = document.getElementById('rasterFileName');
const rasterCopyPrompt = document.getElementById('rasterCopyPrompt');
const rasterOpenChatGpt = document.getElementById('rasterOpenChatGpt');
const rasterSvgText = document.getElementById('rasterSvgText');
const rasterValidation = document.getElementById('rasterValidation');
const svgPreviewImage = document.getElementById('svgPreviewImage');
const svgPreviewPlaceholder = document.getElementById('svgPreviewPlaceholder');
const rasterExportSvg = document.getElementById('rasterExportSvg');
const rasterDownloadAiJson = document.getElementById('rasterDownloadAiJson');
const rasterDownloadCleanSvg = document.getElementById('rasterDownloadCleanSvg');
const svgExportModal = document.getElementById('svgExportModal');
const svgExportText = document.getElementById('svgExportText');
const svgExportStatus = document.getElementById('svgExportStatus');
const svgExportCopy = document.getElementById('svgExportCopy');
const svgExportDownload = document.getElementById('svgExportDownload');

let selectedRasterFile = null;
let rasterObjectUrl = null;
let svgObjectUrl = null;
let validatedSvg = '';

function openRasterAiDialog() {
  rasterAiModal.classList.add('visible');
  rasterAiModal.setAttribute('aria-hidden', 'false');
}

function closeRasterAiDialog() {
  closeSvgExportDialog();
  rasterAiModal.classList.remove('visible');
  rasterAiModal.setAttribute('aria-hidden', 'true');
}

function openSvgExportDialog() {
  if (!validatedSvg) return;
  svgExportText.value = validatedSvg;
  svgExportStatus.textContent = 'Pronto per la copia.';
  svgExportModal.classList.add('visible');
  svgExportModal.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    svgExportText.focus();
    svgExportText.setSelectionRange(0, 0);
  });
}

function closeSvgExportDialog() {
  if (!svgExportModal) return;
  svgExportModal.classList.remove('visible');
  svgExportModal.setAttribute('aria-hidden', 'true');
}

function downloadValidatedSvg() {
  if (!validatedSvg) return;
  const url = URL.createObjectURL(new Blob([validatedSvg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'DisegnoInput.svg';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyValidatedSvg() {
  if (!validatedSvg) return;
  svgExportText.value = validatedSvg;

  try {
    if (!navigator.clipboard?.writeText)
      throw new Error('Clipboard API non disponibile.');
    await navigator.clipboard.writeText(validatedSvg);
    svgExportStatus.textContent = '✓ SVG copiato negli appunti. Ora puoi incollarlo in Termodel.';
    return;
  } catch (_) {
    svgExportText.focus();
    svgExportText.select();
    try {
      if (document.execCommand('copy')) {
        svgExportStatus.textContent = '✓ SVG copiato negli appunti.';
        return;
      }
    } catch (_) {
      // fallback manuale sotto
    }
    svgExportStatus.textContent = 'Copia automatica non consentita: testo selezionato, premi Ctrl+C.';
  }
}

const TERMODEL_SVG_TEXT_START = '[TERMODEL-SVG-TEXT-V1]';
const TERMODEL_SVG_TEXT_END = '[/TERMODEL-SVG-TEXT-V1]';

function decodeHtmlEntitiesOnce(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function decodeTermodelSvgTransport(text) {
  const source = text ?? '';
  const upper = source.toUpperCase();
  const start = upper.indexOf(TERMODEL_SVG_TEXT_START);
  if (start < 0) return { text: source, transported: false };

  const payloadStart = start + TERMODEL_SVG_TEXT_START.length;
  const end = upper.indexOf(TERMODEL_SVG_TEXT_END, payloadStart);
  if (end < 0)
    throw new Error('Payload TERMODEL-SVG-TEXT-V1 incompleto: manca il marcatore finale.');

  const encoded = source.slice(payloadStart, end).trim();
  if (!encoded)
    throw new Error('Payload TERMODEL-SVG-TEXT-V1 vuoto.');

  return {
    text: decodeHtmlEntitiesOnce(encoded),
    transported: true
  };
}

function extractSvg(text) {
  if (!text || !text.trim()) throw new Error('Non è presente alcun testo SVG.');

  const decoded = decodeTermodelSvgTransport(text);
  const source = decoded.text;
  const start = source.toLowerCase().indexOf('<svg');
  const end = source.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < start)
    throw new Error('Blocco <svg>...</svg> non trovato, neppure dopo la decodifica TERMODEL-SVG-TEXT-V1.');

  return {
    svg: source.slice(start, end + '</svg>'.length).trim(),
    transported: decoded.transported
  };
}

function readNumberAttribute(line, name) {
  const raw = line.getAttribute(name);
  if (raw === null) throw new Error(`Una linea non contiene l'attributo ${name}.`);
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error(`Coordinata ${name}="${raw}" non valida: usa il punto come separatore decimale.`);
  return value;
}

function sanitizeSvgForPreview(svg) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  doc.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (name.startsWith('on') || name === 'href' || name.endsWith(':href') || value.includes('javascript:'))
        el.removeAttribute(attr.name);
    });
  });
  return new XMLSerializer().serializeToString(doc);
}

function showSvgPreview(svg) {
  if (svgObjectUrl) URL.revokeObjectURL(svgObjectUrl);
  const safeSvg = sanitizeSvgForPreview(svg);
  svgObjectUrl = URL.createObjectURL(new Blob([safeSvg], { type: 'image/svg+xml' }));
  svgPreviewImage.src = svgObjectUrl;
  svgPreviewImage.hidden = false;
  svgPreviewPlaceholder.hidden = true;
}

const AI_PREVIEW_WALL_HEIGHT_M = 2.70;
const AI_PREVIEW_EXTERNAL_WALL_THICKNESS_M = 0.40;
const AI_PREVIEW_INTERNAL_WALL_THICKNESS_M = 0.15;
const AI_PREVIEW_FLOOR_THICKNESS_M = 0.20;
const AI_PREVIEW_CEILING_THICKNESS_M = 0.20;
const AI_PREVIEW_WINDOW_DEPTH_EXTRA_M = 0.04;
const AI_PREVIEW_WINDOW_COLOR = '#2F9CC0';

function svgRingToThreePoints(ring) {
  return ring.map(([x, y]) => new THREE.Vector2(Number(x) / 100, -Number(y) / 100));
}

function createPrismMeshPrimitive({
  shell,
  holes = [],
  zBottom,
  zTop,
  id,
  numero,
  tipo,
  descrizione,
  parte,
  color,
  opacity = 1
}) {
  const contour = svgRingToThreePoints(shell || []);
  const holeRings = (holes || []).map(svgRingToThreePoints);

  if (contour.length < 3)
    throw new Error(`Contorno insufficiente per ${id || tipo}.`);

  const triangles = THREE.ShapeUtils.triangulateShape(contour, holeRings);
  const rings = [contour, ...holeRings];
  const points = rings.flat();

  const vertices = [
    ...points.map(p => [p.x, p.y, zBottom]),
    ...points.map(p => [p.x, p.y, zTop])
  ];
  const pointCount = points.length;
  const indices = [];

  triangles.forEach(([a, b, d]) => {
    indices.push(d, b, a);
    indices.push(pointCount + a, pointCount + b, pointCount + d);
  });

  let offset = 0;
  rings.forEach((ring) => {
    for (let i = 0; i < ring.length; i++) {
      const a = offset + i;
      const b = offset + ((i + 1) % ring.length);
      const at = pointCount + a;
      const bt = pointCount + b;
      indices.push(a, b, bt, a, bt, at);
    }
    offset += ring.length;
  });

  return {
    kind: 'mesh',
    source: 'GeneraPiantaJs',
    parte,
    numero,
    id,
    tipo,
    descrizione,
    filterMetadata: true,
    piano: 'Anteprima AI',
    confine: '',
    separatore: false,
    stessaZona: false,
    fittizia: false,
    falda: false,
    color,
    opacity,
    lineWidth: 1,
    text: '',
    vertices,
    indices
  };
}

function createWallMassPrimitive(plan) {
  if (!plan.edificio?.outerShell?.length)
    return null;

  const holes = (plan.locali || [])
    .map(locale => locale.architecturalShell)
    .filter(ring => Array.isArray(ring) && ring.length >= 3);

  return createPrismMeshPrimitive({
    shell: plan.edificio.outerShell,
    holes,
    zBottom: 0,
    zTop: AI_PREVIEW_WALL_HEIGHT_M,
    id: 'MASSA-MURARIA',
    numero: 1,
    tipo: 'Parete',
    descrizione: 'Massa muraria GeneraPianta — E 40 cm, W 15 cm',
    parte: 'massa-muraria-generapianta',
    color: '#A86F43',
    opacity: 0.92
  });
}

function createWindowPreviewPrimitive(finestra, index) {
  const widthCm = Number(finestra?.larghezzaCm);
  const heightCm = Number(finestra?.altezzaCm);
  const sillCm = Number(finestra?.sottofinestraCm);
  const wallThicknessCm = Number(finestra?.wallThicknessCm);
  const direction = finestra?.wallDirection;
  const normal = finestra?.wallNormal;

  if (
    !Number.isFinite(widthCm) || widthCm <= 0 ||
    !Number.isFinite(heightCm) || heightCm <= 0 ||
    !Number.isFinite(sillCm) ||
    !Number.isFinite(wallThicknessCm) || wallThicknessCm <= 0 ||
    !Array.isArray(direction) || direction.length < 2 ||
    !Array.isArray(normal) || normal.length < 2
  ) return null;

  const extraDepthCm = AI_PREVIEW_WINDOW_DEPTH_EXTRA_M * 100;
  const depthCm = wallThicknessCm + extraDepthCm;
  const halfWidth = widthCm / 2;
  const halfDepth = depthCm / 2;

  let centerX = Number(finestra.x);
  let centerY = Number(finestra.y);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;

  // Le E sono il filo interno: la massa muraria cresce verso l'esterno.
  // Portiamo quindi il centro del FIN a metà spessore della parete.
  if (finestra.wallClass === 'external') {
    centerX += normal[0] * wallThicknessCm / 2;
    centerY += normal[1] * wallThicknessCm / 2;
  }

  const tx = Number(direction[0]);
  const ty = Number(direction[1]);
  const nx = Number(normal[0]);
  const ny = Number(normal[1]);
  if (![tx, ty, nx, ny].every(Number.isFinite)) return null;

  const shell = [
    [centerX - tx * halfWidth - nx * halfDepth, centerY - ty * halfWidth - ny * halfDepth],
    [centerX + tx * halfWidth - nx * halfDepth, centerY + ty * halfWidth - ny * halfDepth],
    [centerX + tx * halfWidth + nx * halfDepth, centerY + ty * halfWidth + ny * halfDepth],
    [centerX - tx * halfWidth + nx * halfDepth, centerY - ty * halfWidth + ny * halfDepth]
  ];

  const zBottom = sillCm / 100;
  const zTop = zBottom + heightCm / 100;

  return createPrismMeshPrimitive({
    shell,
    holes: [],
    zBottom,
    zTop,
    id: finestra.id || `FIN-${index + 1}`,
    numero: index + 1,
    tipo: 'Finestra',
    descrizione:
      `${finestra.id || 'FIN'} · ${(widthCm / 100).toFixed(2)} × ${(heightCm / 100).toFixed(2)} m` +
      (finestra.wallLineId ? ` · ${finestra.wallLineId}` : ''),
    parte: 'finestra-provvisoria',
    color: AI_PREVIEW_WINDOW_COLOR,
    opacity: 0.96
  });
}

function createSlabMeshPrimitive(locale, index, tipo) {
  const isFloor = tipo === 'Pavimento';
  const zBottom = isFloor ? -AI_PREVIEW_FLOOR_THICKNESS_M : AI_PREVIEW_WALL_HEIGHT_M;
  const zTop = isFloor ? 0 : AI_PREVIEW_WALL_HEIGHT_M + AI_PREVIEW_CEILING_THICKNESS_M;

  return createPrismMeshPrimitive({
    shell: locale.architecturalShell || locale.shell,
    holes: [],
    zBottom,
    zTop,
    id: `${locale.id}-${isFloor ? 'PAV' : 'SOF'}`,
    numero: index + 1,
    tipo,
    descrizione: `${tipo} provvisorio — ${locale.id} ${locale.descrizione || ''}`.trim(),
    parte: isFloor ? 'pavimento-provvisorio' : 'soffitto-provvisorio',
    color: isFloor ? '#B9A58D' : '#D7D7D7',
    opacity: isFloor ? 0.96 : 0.62
  });
}

function createAiPreviewModelFromPlan(plan) {
  const walls = [];
  const wallMass = createWallMassPrimitive(plan);
  if (wallMass) walls.push(wallMass);

  const floors = plan.locali.map((locale, index) =>
    createSlabMeshPrimitive(locale, index, 'Pavimento'));
  const ceilings = plan.locali.map((locale, index) =>
    createSlabMeshPrimitive(locale, index, 'Soffitto'));
  const windows = (plan.finestre || [])
    .map(createWindowPreviewPrimitive)
    .filter(Boolean);

  const primitives = [...walls, ...floors, ...ceilings, ...windows];

  return {
    format: 'TermodelWebModel',
    version: 3,
    coordinateSystem: 'Z-up',
    generatedAtUtc: new Date().toISOString(),
    source: 'DisegnoInput.svg → JSTS GeneraPianta.js',
    preview: true,
    previewAssumptions: {
      units: 'm',
      sourceSvgUnits: 'cm',
      wallHeightMeters: AI_PREVIEW_WALL_HEIGHT_M,
      externalWallThicknessMeters: AI_PREVIEW_EXTERNAL_WALL_THICKNESS_M,
      internalWallThicknessMeters: AI_PREVIEW_INTERNAL_WALL_THICKNESS_M,
      floorThicknessMeters: AI_PREVIEW_FLOOR_THICKNESS_M,
      ceilingThicknessMeters: AI_PREVIEW_CEILING_THICKNESS_M,
      windowDepthExtraMeters: AI_PREVIEW_WINDOW_DEPTH_EXTRA_M,
      note: 'GeneraPianta v0.6: FIN rappresentati nel 3D provvisorio come parallelepipedi autonomi senza sottrazione della massa muraria.'
    },
    previewCounts: {
      walls: walls.length,
      wallMassBodies: wallMass ? 1 : 0,
      floors: floors.length,
      ceilings: ceilings.length,
      windows: windows.length,
      rooms: plan.locali.length
    },
    primitiveCount: primitives.length,
    primitives
  };
}

function setCadLayoutMode(active) {
  appRoot?.classList.toggle('cad-layout-mode', active);
  if (appTitleText)
    appTitleText.textContent = active ? APP_CAD_TITLE : APP_MAIN_TITLE;

  if (TERMODEL_ANDROID_DEVICE)
    syncAndroidViewportLayout();
}

function activateModelPage() {
  setCadLayoutMode(false);
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const modelTab = document.querySelector('.tab[data-page="modelPage"]');
  if (modelTab) modelTab.classList.add('active');
  modelPage.classList.add('active');
  requestAnimationFrame(resize);
}

function showAiPreviewModel(plan) {
  lastAiPreviewData = createAiPreviewModelFromPlan(plan);
  renderModelData(lastAiPreviewData, {
    mode: 'ai',
    label: 'ANTEPRIMA AI — GENERAPIANTA.JS',
    renderOrigin: 'local'
  });
  activateModelPage();
}

function downloadAiPreviewJson() {
  if (!lastAiPreviewData) return;
  const json = JSON.stringify(lastAiPreviewData, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'TermodelWebModel-AI.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCleanPlanSvg() {
  if (!lastCleanPlanSvg) return;
  const url = URL.createObjectURL(new Blob([lastCleanPlanSvg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'PiantaPulita-AI.svg';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function downloadArchitecturalDxf() {
  if (!lastGeneratedPlan) return;

  try {
    const dxf = generaDxfDaPianta(lastGeneratedPlan);
    const url = URL.createObjectURL(
      new Blob([dxf], { type: 'application/dxf;charset=utf-8' })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'PiantaArchitettonica-Termodel.dxf';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    window.alert('Esportazione DXF non riuscita: ' + error.message);
  }
}


const SVG_NS = 'http://www.w3.org/2000/svg';
const NORTH_SYMBOL_ID = 'termodel-north';
const NORTH_ORIENTATION_ATTR = 'data-termodel-orientamento';

function normalizeNorthAngle(value) {
  if (value === null || value === undefined || value === '' || value === '?')
    return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return ((number % 360) + 360) % 360;
}

function northSvgViewBox(doc) {
  const root = doc?.documentElement;
  const raw = String(root?.getAttribute('viewBox') || '').trim();
  const values = raw.split(/[ ,]+/).map(Number);
  if (values.length === 4 && values.every(Number.isFinite))
    return values;

  const width = Number(root?.getAttribute('width')) || 1200;
  const height = Number(root?.getAttribute('height')) || 800;
  return [0, 0, width, height];
}

function northSvgElement(doc, name, attributes = {}) {
  const node = doc.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined)
      node.setAttribute(key, String(value));
  });
  return node;
}

function readNorthOrientationFromSvg(doc) {
  const group = doc?.getElementById?.(NORTH_SYMBOL_ID);
  if (!group) return null;
  return normalizeNorthAngle(group.getAttribute(NORTH_ORIENTATION_ATTR));
}

function ensureNorthSymbolInSvg(doc, angle = readNorthOrientationFromSvg(doc)) {
  const root = doc?.documentElement;
  if (!root) return null;

  let group = doc.getElementById(NORTH_SYMBOL_ID);
  if (!group) {
    group = northSvgElement(doc, 'g', { id: NORTH_SYMBOL_ID });
    root.appendChild(group);
  } else if (group.parentElement !== root) {
    root.appendChild(group);
  }

  const normalized = normalizeNorthAngle(angle);
  group.setAttribute('data-termodel-accessorio', 'NORD');
  group.setAttribute(
    NORTH_ORIENTATION_ATTR,
    normalized === null ? '?' : String(Math.round(normalized * 100) / 100)
  );
  group.setAttribute('pointer-events', 'none');

  while (group.firstChild) group.removeChild(group.firstChild);

  const [minX, minY, width, height] = northSvgViewBox(doc);
  // Simbolo volutamente più discreto e con maggiore rispetto dal bordo:
  // deve orientare la pianta senza coprire la geometria edilizia.
  const radius = Math.min(Math.max(Math.min(width, height) * 0.032, 22), 48);
  const x = minX + width - radius * 1.15;
  const y = minY + radius * 1.15;
  group.setAttribute('transform', `translate(${x} ${y})`);

  group.appendChild(northSvgElement(doc, 'circle', {
    cx: 0, cy: 0, r: radius,
    fill: '#ffffff', 'fill-opacity': 0.88,
    stroke: '#333333', 'stroke-width': Math.max(1.5, radius * 0.035)
  }));

  if (normalized === null) {
    const text = northSvgElement(doc, 'text', {
      x: 0, y: radius * 0.16,
      'text-anchor': 'middle',
      'font-family': 'Segoe UI, Arial, sans-serif',
      'font-size': radius * 0.55,
      'font-weight': 700,
      fill: '#a11616'
    });
    text.textContent = 'N ?';
    group.appendChild(text);
    return group;
  }

  const arrow = northSvgElement(doc, 'g', {
    transform: `rotate(${normalized})`
  });
  arrow.appendChild(northSvgElement(doc, 'line', {
    x1: 0, y1: radius * 0.25,
    x2: 0, y2: -radius * 0.70,
    stroke: '#c62828',
    'stroke-width': Math.max(2, radius * 0.06),
    'stroke-linecap': 'round'
  }));
  arrow.appendChild(northSvgElement(doc, 'polygon', {
    points: `0,${-radius * 0.82} ${-radius * 0.13},${-radius * 0.55} ${radius * 0.13},${-radius * 0.55}`,
    fill: '#c62828'
  }));
  group.appendChild(arrow);

  const n = northSvgElement(doc, 'text', {
    x: 0, y: radius * 0.48,
    'text-anchor': 'middle',
    'font-family': 'Segoe UI, Arial, sans-serif',
    'font-size': radius * 0.34,
    'font-weight': 700,
    fill: '#111111'
  });
  n.textContent = 'N';
  group.appendChild(n);
  return group;
}

function ensureNorthSymbolInSvgText(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(svgText ?? ''), 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('SVG non valido durante la normalizzazione del simbolo Nord.');
  ensureNorthSymbolInSvg(doc);
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function cadNorthPanelIsOpen() {
  return Boolean(cadNorthPropertiesSection && !cadNorthPropertiesSection.hidden);
}

function cadOpenNorthPanel() {
  if (!cadNorthPropertiesSection) return;
  cadNorthPropertiesSection.hidden = false;
  cadUpdateNorthControls();
}

function cadCloseNorthPanel(updatePanel = true) {
  if (!cadNorthPropertiesSection) return;
  cadNorthPropertiesSection.hidden = true;
  if (updatePanel) cadUpdatePropertiesPanel();
}

function cadUpdateNorthControls() {
  const defined = northOrientationDeg !== null;
  const value = defined ? Math.round(northOrientationDeg) : 0;

  if (cadNorthDefined) cadNorthDefined.checked = defined;
  if (cadNorthRange) {
    cadNorthRange.disabled = !defined;
    cadNorthRange.value = String(value);
  }
  if (cadNorthAngle) {
    cadNorthAngle.disabled = !defined;
    cadNorthAngle.value = defined ? String(value) : '';
  }
  if (cadNorthNeedle) {
    cadNorthNeedle.hidden = !defined;
    cadNorthNeedle.style.display = defined ? 'block' : 'none';
    cadNorthNeedle.style.transform = `rotate(${value}deg)`;
  }
  if (cadNorthUnknown) {
    cadNorthUnknown.hidden = defined;
    cadNorthUnknown.style.display = defined ? 'none' : 'flex';
  }
}

function cadSyncNorthFromWorkingDoc() {
  northOrientationDeg = readNorthOrientationFromSvg(cadWorkingDoc);
  ensureNorthSymbolInSvg(cadWorkingDoc, northOrientationDeg);
  cadUpdateNorthControls();
  updateNorth3DMarker();
}

function cadSetNorthOrientation(value) {
  northOrientationDeg = normalizeNorthAngle(value);

  if (cadWorkingDoc) {
    ensureNorthSymbolInSvg(cadWorkingDoc, northOrientationDeg);
    validatedSvg = cadSerializeWorkingSvg();
    if (rasterSvgText) rasterSvgText.value = validatedSvg;
  }

  cadUpdateNorthControls();
  updateNorth3DMarker();

  if (cadWorkingDoc && cadPage?.classList.contains('active'))
    renderCadComparison();

  cadUpdateControls();
  cadSetStatus(
    northOrientationDeg === null
      ? 'Nord non definito · nel 3D non viene mostrato alcun indicatore'
      : `Nord ${Math.round(northOrientationDeg)}° · 0° alto pianta · positivo orario`,
    cadWorkingDoc && cadIsDirty() ? 'dirty' : ''
  );
}

function cadRenderNorthOverlay(svg, viewBoxValues) {
  if (!Array.isArray(viewBoxValues) || viewBoxValues.length !== 4) return;
  const [minX, minY, width, height] = viewBoxValues;
  if (![minX, minY, width, height].every(Number.isFinite)) return;

  // Simbolo volutamente più discreto e con maggiore rispetto dal bordo:
  // deve orientare la pianta senza coprire la geometria edilizia.
  const radius = Math.min(Math.max(Math.min(width, height) * 0.032, 22), 48);
  const x = minX + width - radius * 1.15;
  const y = minY + radius * 1.15;

  const group = svgNode('g', {
    id: 'cadNorthOverlay',
    transform: `translate(${x} ${y})`,
    'pointer-events': 'all',
    role: 'button',
    tabindex: '0',
    'aria-label': 'Apri proprietà orientamento Nord'
  });

  const openNorth = event => {
    if (cadToolMode !== 'select') return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    cadSelectedLineId = '';
    cadSelectedSymbolId = '';
    cadOpenNorthPanel();
    cadUpdatePropertiesPanel();
    cadSetStatus(
      northOrientationDeg === null
        ? 'Nord selezionato · orientamento non definito'
        : 'Nord selezionato · ' + Math.round(northOrientationDeg) + '°'
    );
  };

  group.addEventListener('pointerdown', openNorth);
  group.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') openNorth(event);
  });
  group.appendChild(svgNode('circle', {
    cx: 0, cy: 0, r: radius,
    fill: '#ffffff', 'fill-opacity': 0.94,
    stroke: '#333333', 'stroke-width': Math.max(1.5, radius * 0.035),
    'vector-effect': 'non-scaling-stroke'
  }));

  if (northOrientationDeg === null) {
    const text = svgNode('text', {
      x: 0, y: radius * 0.16,
      fill: '#a11616',
      'text-anchor': 'middle',
      'font-family': 'Segoe UI, Arial, sans-serif',
      'font-size': radius * 0.55,
      'font-weight': 700
    });
    text.textContent = 'N ?';
    group.appendChild(text);
  } else {
    const arrow = svgNode('g', {
      transform: `rotate(${northOrientationDeg})`
    });
    arrow.appendChild(svgNode('line', {
      x1: 0, y1: radius * 0.25,
      x2: 0, y2: -radius * 0.70,
      stroke: '#c62828',
      'stroke-width': Math.max(2, radius * 0.06),
      'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke'
    }));
    arrow.appendChild(svgNode('polygon', {
      points: `0,${-radius * 0.82} ${-radius * 0.13},${-radius * 0.55} ${radius * 0.13},${-radius * 0.55}`,
      fill: '#c62828'
    }));
    group.appendChild(arrow);

    const n = svgNode('text', {
      x: 0, y: radius * 0.48,
      fill: '#111111',
      'text-anchor': 'middle',
      'font-family': 'Segoe UI, Arial, sans-serif',
      'font-size': radius * 0.34,
      'font-weight': 700
    });
    n.textContent = 'N';
    group.appendChild(n);
  }

  svg.appendChild(group);
}



function svgNode(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== null && value !== undefined)
      node.setAttribute(key, String(value));
  });
  return node;
}

function cadColorForId(id) {
  if (/^E/i.test(id)) return '#1565c0';
  if (/^W/i.test(id)) return '#d35400';
  if (/^P/i.test(id)) return '#7b1fa2';
  if (/^F/i.test(id)) return '#00897b';
  return '#c62828';
}

const CAD_ACI_COLORS = {
  1: { css: '#ff0000', aliases: ['red', '#f00', '#ff0000'] },
  2: { css: '#ffff00', aliases: ['yellow', '#ff0', '#ffff00'] },
  3: { css: '#00ff00', aliases: ['lime', 'green', '#0f0', '#00ff00', '#008000'] },
  4: { css: '#00ffff', aliases: ['cyan', 'aqua', '#0ff', '#00ffff'] },
  5: { css: '#0000ff', aliases: ['blue', '#00f', '#0000ff'] },
  6: { css: '#ff00ff', aliases: ['magenta', 'fuchsia', '#f0f', '#ff00ff'] },
  7: { css: '#000000', aliases: ['black', 'white', '#000', '#000000', '#fff', '#ffffff'] },
  8: { css: '#808080', aliases: ['gray', 'grey', '#808080'] },
  9: { css: '#404040', aliases: ['darkgray', 'darkgrey', '#404040', '#444', '#444444'] }
};

function cadArchiveRecords(name) {
  try {
    return getArchivioWebRecords(name) || [];
  } catch (_) {
    return [];
  }
}

function cadText(value) {
  return String(value ?? '').trim();
}

function cadFindRecord(records, field, value) {
  const wanted = cadText(value).toLowerCase();
  if (!wanted) return null;
  return records.find(record => cadText(record?.[field]).toLowerCase() === wanted) || null;
}

function cadArchiveColorIndex(value) {
  const match = /^\s*(\d+)\s*(?:-|$)/.exec(cadText(value));
  return match ? Number(match[1]) : 0;
}

function cadCssColorIndex(value) {
  const normalized = cadText(value).toLowerCase().replace(/\s+/g, '');
  if (!normalized) return 0;
  for (const [index, data] of Object.entries(CAD_ACI_COLORS)) {
    if (data.aliases.includes(normalized)) return Number(index);
  }
  return 0;
}

function cadCssForArchiveColor(value) {
  const index = cadArchiveColorIndex(value);
  return CAD_ACI_COLORS[index]?.css || '';
}

function cadLineRawStroke(line) {
  if (!line) return '';
  const direct = cadText(line.getAttribute('stroke'));
  if (direct) return direct;
  const style = cadText(line.getAttribute('style'));
  const match = /(?:^|;)\s*stroke\s*:\s*([^;]+)/i.exec(style);
  return cadText(match?.[1]);
}

function cadDashArrayForLineType(value) {
  switch (cadText(value).toUpperCase()) {
    case 'FITTIZIA': return '2 6';
    case 'TRATTEGGIATA': return '10 6';
    case 'TRATTOPUNTO': return '10 4 2 4';
    case 'DIVIDI': return '14 4 2 4 2 4';
    default: return '';
  }
}

function cadDefaultToolbarState() {
  const datiCad = cadArchiveRecords('DatiCad')[0] || {};
  const piani = cadArchiveRecords('Piani');
  const pareti = cadArchiveRecords('Pareti');
  const confini = cadArchiveRecords('Confini');
  const reti = cadArchiveRecords('Reti');

  const valid = value => {
    const text = cadText(value);
    return text && text !== '-Seleziona-' ? text : '';
  };

  const piano = valid(datiCad.Piano) || cadText(piani[0]?.Nome);
  const tipoParete = valid(datiCad.TipoParete) || cadText(pareti[0]?.DescBreve);
  const rete = cadText(reti.find(record => cadText(record?.Attivo).toUpperCase() !== 'NO')?.Codice) ||
    cadText(reti[0]?.Codice);

  let confineParete = valid(datiCad.ConfineParete);
  if (!confineParete) {
    confineParete = cadFindRecord(confini, 'Codice', 'Automatico')
      ? 'Automatico'
      : cadText(confini[0]?.Codice);
  }

  return {
    modalita: 'edificio',
    rete,
    piano,
    tipoParete,
    confineParete
  };
}

function cadEnsureToolbarState() {
  const defaults = cadDefaultToolbarState();
  if (cadToolbarState.modalita !== 'rete' && cadToolbarState.modalita !== 'edificio')
    cadToolbarState.modalita = 'edificio';
  if (!cadText(cadToolbarState.rete)) cadToolbarState.rete = defaults.rete;
  if (!cadText(cadToolbarState.piano)) cadToolbarState.piano = defaults.piano;
  if (!cadText(cadToolbarState.tipoParete)) cadToolbarState.tipoParete = defaults.tipoParete;
  if (!cadText(cadToolbarState.confineParete)) cadToolbarState.confineParete = defaults.confineParete;
  return cadToolbarState;
}

function cadDerivedToolbarValues(state = cadToolbarState) {
  const piano = cadFindRecord(cadArchiveRecords('Piani'), 'Nome', state.piano);
  const parete = cadFindRecord(cadArchiveRecords('Pareti'), 'DescBreve', state.tipoParete);
  const confine = cadFindRecord(cadArchiveRecords('Confini'), 'Codice', state.confineParete);

  return {
    layer: cadText(piano?.LayerCad),
    colore: cadText(parete?.Colore),
    tipoLinea: cadText(confine?.Tipolinea),
    colorCss: cadCssForArchiveColor(parete?.Colore)
  };
}

function cadLayerForPlane(planeName) {
  const piano = cadFindRecord(cadArchiveRecords('Piani'), 'Nome', planeName);
  return cadText(piano?.LayerCad);
}

function cadCurrentLayer() {
  return cadLayerForPlane(cadCurrentPlane());
}

function cadDatiCadRecord() {
  return cadArchiveRecords('DatiCad')[0] || {};
}

function cadMetersToSvgCm(value) {
  const raw = cadText(value).replace(',', '.');
  const number = Number(raw);
  if (!Number.isFinite(number)) return raw || '0';
  return String(Math.round(number * 10000) / 100);
}
function cadFillSelect(select, values, preferred) {
  if (!select) return '';
  const clean = [];
  values.forEach(value => {
    const text = cadText(value);
    if (text && !clean.includes(text)) clean.push(text);
  });

  const current = cadText(preferred);
  select.replaceChildren();

  clean.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if (current && !clean.includes(current)) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = current + ' · non presente in archivio';
    option.dataset.outOfArchive = 'true';
    select.appendChild(option);
  }

  const value = current || clean[0] || '';
  select.value = value;
  return value;
}

function cadFillNetworkSelect(select, records, preferred) {
  if (!select) return '';

  const rows = [];
  const seen = new Set();
  for (const record of records || []) {
    const codice = cadText(record?.Codice);
    if (!codice || seen.has(codice)) continue;
    seen.add(codice);
    rows.push({
      codice,
      descrizione: cadText(record?.Descrizione),
      attivo: cadText(record?.Attivo).toUpperCase() !== 'NO'
    });
  }

  select.replaceChildren();

  if (!rows.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nessuna rete in archivio';
    option.selected = true;
    select.appendChild(option);
    return '';
  }

  rows.forEach(row => {
    const option = document.createElement('option');
    option.value = row.codice;
    option.textContent =
      row.codice +
      (row.descrizione ? ' — ' + row.descrizione : '') +
      (row.attivo ? '' : ' · non attiva');
    select.appendChild(option);
  });

  const wanted = cadText(preferred);
  const selected =
    rows.find(row => row.codice === wanted)?.codice ||
    rows.find(row => row.attivo)?.codice ||
    rows[0].codice;
  select.value = selected;
  return selected;
}

function cadRefreshToolbarControls() {
  cadEnsureToolbarState();

  if (cadModeSelect)
    cadModeSelect.value = cadToolbarState.modalita;

  const networkMode = cadToolbarState.modalita === 'rete';
  if (cadNetworkLabel) cadNetworkLabel.hidden = !networkMode;
  if (cadNetworkSelect) cadNetworkSelect.hidden = !networkMode;

  cadToolbarState.rete = cadFillNetworkSelect(
    cadNetworkSelect,
    cadArchiveRecords('Reti'),
    cadToolbarState.rete
  );
  if (cadNetworkSelect)
    cadNetworkSelect.disabled = !networkMode || !cadToolbarState.rete;

  cadToolbarState.piano = cadFillSelect(
    cadPropPiano,
    cadArchiveRecords('Piani').map(r => r?.Nome),
    cadToolbarState.piano
  );
  cadToolbarState.tipoParete = cadFillSelect(
    cadPropTipoParete,
    cadArchiveRecords('Pareti').map(r => r?.DescBreve),
    cadToolbarState.tipoParete
  );
  cadToolbarState.confineParete = cadFillSelect(
    cadPropConfineParete,
    cadArchiveRecords('Confini').map(r => r?.Codice),
    cadToolbarState.confineParete
  );

  const derived = cadDerivedToolbarValues();
  if (cadPropColore) cadPropColore.value = derived.colore;
  if (cadPropTipoLinea) cadPropTipoLinea.value = derived.tipoLinea;
  if (cadPropColorSwatch)
    cadPropColorSwatch.style.background = derived.colorCss || '#ccc';

  refreshAndroidCadExploreControls();
  return derived;
}

function cadWallRecordFromLine(line) {
  const pareti = cadArchiveRecords('Pareti');
  const explicit = cadText(line?.getAttribute('data-termodel-tipo-parete'));
  if (explicit) return cadFindRecord(pareti, 'DescBreve', explicit);

  const semanticColor = cadText(line?.getAttribute('data-termodel-colore'));
  let colorIndex = cadArchiveColorIndex(semanticColor);
  if (!colorIndex) colorIndex = cadCssColorIndex(cadLineRawStroke(line));
  if (!colorIndex) return null;

  return pareti.find(record => cadArchiveColorIndex(record?.Colore) === colorIndex) || null;
}

function cadBoundaryRecordFromLine(line) {
  const confini = cadArchiveRecords('Confini');
  const explicit = cadText(line?.getAttribute('data-termodel-confine-parete'));
  if (explicit) return cadFindRecord(confini, 'Codice', explicit);

  const tipoLinea = cadText(line?.getAttribute('data-termodel-tipo-linea'));
  if (!tipoLinea) return null;
  return cadFindRecord(confini, 'Tipolinea', tipoLinea);
}

function cadStateFromLine(line) {
  const defaults = cadDefaultToolbarState();
  const wall = cadWallRecordFromLine(line);
  const boundary = cadBoundaryRecordFromLine(line);
  return {
    piano: cadCurrentPlane() || defaults.piano,
    tipoParete: cadText(line?.getAttribute('data-termodel-tipo-parete')) ||
      cadText(wall?.DescBreve) || defaults.tipoParete,
    confineParete: cadText(line?.getAttribute('data-termodel-confine-parete')) ||
      cadText(boundary?.Codice) || defaults.confineParete
  };
}

function cadApplySemanticAttributes(line, state = cadToolbarState) {
  if (!line) return;

  cadSetOptionalAttribute(line, 'data-termodel-piano', state.piano);
  cadSetOptionalAttribute(line, 'data-termodel-layer', cadLayerForPlane(state.piano));
  cadSetOptionalAttribute(line, 'data-termodel-tipo-parete', state.tipoParete);
  cadSetOptionalAttribute(line, 'data-termodel-confine-parete', state.confineParete);

  const derived = cadDerivedToolbarValues(state);
  cadSetOptionalAttribute(line, 'data-termodel-colore', derived.colore);
  cadSetOptionalAttribute(line, 'data-termodel-tipo-linea', derived.tipoLinea);

  if (derived.colorCss) line.setAttribute('stroke', derived.colorCss);
  else line.removeAttribute('stroke');

  const dash = cadDashArrayForLineType(derived.tipoLinea);
  if (dash) line.setAttribute('stroke-dasharray', dash);
  else line.removeAttribute('stroke-dasharray');
}

function cadApplyPipeAttributes(line, state = cadToolbarState) {
  if (!line) return;
  cadSetOptionalAttribute(line, 'data-termodel-piano', state.piano);
  cadSetOptionalAttribute(line, 'data-termodel-layer', cadPipeLayerForPlane(state.piano));
  cadSetOptionalAttribute(line, 'data-termodel-entity', 'Tubo');
  cadSetOptionalAttribute(line, 'data-termodel-rete', state.rete);
  cadSetOptionalAttribute(line, 'data-termodel-circuito', state.circuito);
  cadSetOptionalAttribute(line, 'data-termodel-linetype', 'Continuous');
  cadSetOptionalAttribute(line, 'data-termodel-color', '1');
  line.setAttribute('stroke', '#ff0000');
  line.removeAttribute('stroke-dasharray');
}

function cadLineDisplayStyle(line) {
  const wall = cadWallRecordFromLine(line);
  const boundary = cadBoundaryRecordFromLine(line);

  const color =
    cadCssForArchiveColor(wall?.Colore) ||
    cadLineRawStroke(line) ||
    cadColorForId(line?.id || '');

  const tipoLinea =
    cadText(line?.getAttribute('data-termodel-tipo-linea')) ||
    cadText(boundary?.Tipolinea);

  return {
    color,
    tipoLinea,
    dash: cadDashArrayForLineType(tipoLinea)
  };
}

function addCadLabel(group, id, x, y, color, dataId = '') {
  if (!id || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const text = svgNode('text', {
    x, y: y - 8,
    fill: color,
    stroke: '#ffffff',
    'stroke-width': 3,
    'paint-order': 'stroke',
    'text-anchor': 'middle',
    'font-family': 'Segoe UI, Arial, sans-serif',
    'font-size': 15,
    'font-weight': 700,
    'pointer-events': 'none',
    'data-cad-label': dataId || null
  });
  text.textContent = id;
  group.appendChild(text);
}

function cadParseSvg(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('Lo SVG di lavoro del CAD non è XML valido.');
  return doc;
}

function cadSerializeWorkingSvg() {
  if (!cadWorkingDoc) return '';
  return new XMLSerializer().serializeToString(cadWorkingDoc.documentElement);
}

function cadCalpestabile(doc = cadWorkingDoc) {
  if (!doc) return null;
  return Array.from(doc.documentElement.children)
    .find(el => el.localName === 'g' && el.id === 'calpestabile') || null;
}

function cadBackgroundContainer(doc = cadWorkingDoc, create = false) {
  if (!doc) return null;
  const root = doc.documentElement;
  let group = Array.from(root.children)
    .find(el => el.localName === 'g' && el.id === 'termodel-backgrounds') || null;

  if (!group && create) {
    group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('id', 'termodel-backgrounds');
    group.setAttribute('data-termodel-accessorio', 'SFONDI');
    root.insertBefore(group, root.firstChild);
  }
  return group;
}

function cadPlaneBackground(doc = cadWorkingDoc, planeName = cadCurrentPlane()) {
  const group = cadBackgroundContainer(doc, false);
  if (!group || !planeName) return null;
  return Array.from(group.children).find(element =>
    element.localName === 'image' &&
    cadText(element.getAttribute('data-termodel-piano')) === planeName
  ) || null;
}

// v0.63 — Snap additivo agli endpoint dello sfondo vettoriale.
// v0.64 — aggiunge alla cache i punti medi fittizi tra endpoint distanti 5–20 cm.
let cadBackgroundSnapCache = {
  background: null,
  href: '',
  x: '',
  y: '',
  width: '',
  height: '',
  preserveAspectRatio: '',
  points: [],
  grid: new Map()
};

function cadVectorPlaneBackground() {
  const background = cadPlaneBackground(cadWorkingDoc, cadCurrentPlane());
  if (!background) return null;
  return cadText(background.getAttribute('data-termodel-sfondo-tipo')).toLowerCase() === 'vector'
    ? background
    : null;
}

function cadDecodeSvgDataUrl(dataUrl) {
  const source = String(dataUrl || '');
  const comma = source.indexOf(',');
  if (comma < 0 || !/^data:image\/svg\+xml/i.test(source)) return '';
  const header = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  try {
    if (/;base64(?:;|$)/i.test(header)) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch (error) {
    console.warn('Snap sfondo: Data URL SVG non decodificabile.', error);
    return '';
  }
}

function cadNormalizeToken(value) {
  return cadText(value).toLocaleLowerCase();
}

function cadParseGeneratedExecutiveSvg(svgText) {
  const safeSvg = sanitizeSvgForPreview(svgText);
  const doc = new DOMParser().parseFromString(safeSvg, 'image/svg+xml');
  if (doc.querySelector('parsererror'))
    throw new Error('Esecutivo pannelli SVG non valido.');

  const root = doc.documentElement;
  if (cadText(root.getAttribute('data-termodel-format')) !== 'TERMODEL-PANNELLI-ESECUTIVO-SVG-V1')
    throw new Error('Formato esecutivo pannelli SVG non riconosciuto.');

  const coordinateUnit = cadText(root.getAttribute('data-coordinate-unit')).toLowerCase();
  const maxY = Number(root.getAttribute('data-termodel-max-y'));
  if (coordinateUnit !== 'm' || !Number.isFinite(maxY))
    throw new Error('Esecutivo pannelli privo dei metadata metrici per l\'overlay CAD.');

  const primitiveCount = Number(root.getAttribute('data-primitive-count'));
  return {
    svgText: new XMLSerializer().serializeToString(root),
    maxY,
    primitiveCount: Number.isFinite(primitiveCount) ? primitiveCount : 0
  };
}

function cadGeneratedExecutiveAvailable() {
  if (!cadGeneratedExecutiveOverlay) return false;

  if (cadGeneratedExecutiveOverlay.sourceType === 'example-static') {
    return String(cadGeneratedExecutiveOverlay.exampleId || '') ===
      String(activeProjectBrowserExampleId || '');
  }

  return String(cadGeneratedExecutiveOverlay.projectId || '') ===
    String(currentProjectId || '');
}

function cadAppendGeneratedExecutiveOverlay(target, planeName) {
  if (!target || !cadGeneratedExecutiveAvailable()) return 0;

  const parsed = cadParseGeneratedExecutiveSvg(
    cadGeneratedExecutiveOverlay.svgText
  );
  const doc = new DOMParser().parseFromString(parsed.svgText, 'image/svg+xml');
  const wantedPlane = cadNormalizeToken(planeName);
  let count = 0;

  const toCmX = value => Number(value) * 100;
  const toCmY = value => (parsed.maxY - Number(value)) * 100;

  Array.from(doc.documentElement.children)
    .filter(group => group.localName === 'g')
    .forEach(group => {
      const layerName = cadText(group.getAttribute('data-layer'));
      const outputGroup = svgNode('g', {
        'data-generated-layer': layerName || null
      });

      Array.from(group.children).forEach(source => {
        const sourcePlane = cadNormalizeToken(source.getAttribute('data-piano'));
        if (sourcePlane && wantedPlane && sourcePlane !== wantedPlane) return;

        const color =
          source.getAttribute('stroke') ||
          source.getAttribute('fill') ||
          '#606060';

        if (source.localName === 'line') {
          const values = [
            Number(source.getAttribute('x1')),
            Number(source.getAttribute('y1')),
            Number(source.getAttribute('x2')),
            Number(source.getAttribute('y2'))
          ];
          if (!values.every(Number.isFinite)) return;
          outputGroup.appendChild(svgNode('line', {
            x1: toCmX(values[0]),
            y1: toCmY(values[1]),
            x2: toCmX(values[2]),
            y2: toCmY(values[3]),
            fill: 'none',
            stroke: color,
            'stroke-width': 1.6,
            'stroke-linecap': 'round',
            'vector-effect': 'non-scaling-stroke'
          }));
          count++;
          return;
        }

        if (source.localName === 'polyline' || source.localName === 'polygon') {
          const points = cadSvgNumberPairs(source.getAttribute('points'))
            .filter(point => point.every(Number.isFinite))
            .map(point => toCmX(point[0]) + ',' + toCmY(point[1]))
            .join(' ');
          if (!points) return;
          outputGroup.appendChild(svgNode(source.localName, {
            points,
            fill: source.localName === 'polygon' ? 'none' : 'none',
            stroke: color,
            'stroke-width': 1.6,
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
            'vector-effect': 'non-scaling-stroke'
          }));
          count++;
          return;
        }

        if (source.localName === 'text') {
          const x = Number(source.getAttribute('x'));
          const y = Number(source.getAttribute('y'));
          const fontSizeM = Number(source.getAttribute('font-size'));
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          const text = svgNode('text', {
            x: toCmX(x),
            y: toCmY(y),
            fill: color,
            'font-size': Number.isFinite(fontSizeM)
              ? Math.max(4, fontSizeM * 100)
              : 12,
            'text-anchor': source.getAttribute('text-anchor') || 'middle',
            'dominant-baseline': source.getAttribute('dominant-baseline') || 'middle',
            'font-family': 'Segoe UI, Arial, sans-serif'
          });
          text.textContent = source.textContent || '';
          outputGroup.appendChild(text);
          count++;
        }
      });

      if (outputGroup.childNodes.length)
        target.appendChild(outputGroup);
    });

  return count;
}

async function cadLoadGeneratedExecutiveBackground(options = {}) {
  const silentMissing = options.silentMissing === true;
  const automatic = options.automatic === true;

  if (!cadWorkingDoc) {
    if (!silentMissing)
      cadSetStatus('Apri prima il CAD2D.', 'error');
    return false;
  }
  if (!currentProjectId) {
    if (!silentMissing)
      cadSetStatus('Nessun projectId corrente: usa prima Aggiorna Modello.', 'error');
    return false;
  }

  try {
    if (!automatic)
      cadSetStatus('Recupero catalogo file generati dal Service…');

    const catalog = await termodelGeneratedFilesCatalog(currentProjectId);
    const record = catalog.files.find(file =>
      cadText(file?.path).toLowerCase() === 'artifacts/pannelli-esecutivo.svg'
    );

    if (!record) {
      cadGeneratedExecutiveOverlay = null;
      if (cadShowGeneratedExecutive) {
        cadShowGeneratedExecutive.checked = false;
        cadShowGeneratedExecutive.disabled = true;
      }
      renderCadComparison();
      cadUpdateControls();

      if (silentMissing) {
        cadSetStatus('Nessun esecutivo pannelli prodotto dall\'ultimo calcolo.');
        return false;
      }

      throw new Error('L\'ultimo calcolo non contiene pannelli-esecutivo.svg.');
    }

    const fetched = await termodelGeneratedFileText(record);
    const parsed = cadParseGeneratedExecutiveSvg(fetched.text);

    cadGeneratedExecutiveOverlay = {
      projectId: currentProjectId,
      sourceType: 'service-runtime',
      provenance: {
        kind: 'service-runtime',
        generator: 'Termodel Service',
        spiralEngine:
          currentCalculationSpiralEngine || termodelServiceRuntimeEngine,
        serviceCommit: termodelServiceRuntimeCommit
      },
      svgText: parsed.svgText,
      sourcePath: cadText(record.path),
      stale: fetched.stale || Boolean(record.stale),
      primitiveCount: parsed.primitiveCount
    };

    if (cadShowGeneratedExecutive) {
      cadShowGeneratedExecutive.disabled = false;
      cadShowGeneratedExecutive.checked = true;
    }

    renderCadComparison();
    cadUpdateControls();
    cadSetStatus(
      '✓ Esecutivo pannelli SVG ' +
      (automatic ? 'caricato automaticamente' : 'caricato dal Service') +
      ' · ' + parsed.primitiveCount + ' primitive' +
      (cadGeneratedExecutiveOverlay.stale ? ' · ATTENZIONE: artifact non aggiornato' : '')
    );
    return true;
  } catch (error) {
    console.error(error);
    cadGeneratedExecutiveOverlay = null;
    if (cadShowGeneratedExecutive) {
      cadShowGeneratedExecutive.checked = false;
      cadShowGeneratedExecutive.disabled = true;
    }
    renderCadComparison();
    cadUpdateControls();
    cadSetStatus(
      'Esecutivo pannelli non disponibile: ' + (error?.message || error),
      'error'
    );
    return false;
  }
}

function cadSvgMatrixIdentity() { return [1, 0, 0, 1, 0, 0]; }

function cadSvgMatrixMultiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function cadSvgMatrixApply(matrix, point) {
  return [
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5]
  ];
}

function cadSvgTransformMatrix(value) {
  const source = String(value || '').trim();
  if (!source) return cadSvgMatrixIdentity();
  let result = cadSvgMatrixIdentity();
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = re.exec(source))) {
    const name = match[1].toLowerCase();
    const values = match[2].trim().split(/[ ,]+/).filter(Boolean).map(Number);
    let next = cadSvgMatrixIdentity();

    if (name === 'matrix' && values.length >= 6 && values.slice(0, 6).every(Number.isFinite)) {
      next = values.slice(0, 6);
    } else if (name === 'translate' && Number.isFinite(values[0])) {
      next = [1, 0, 0, 1, values[0], Number.isFinite(values[1]) ? values[1] : 0];
    } else if (name === 'scale' && Number.isFinite(values[0])) {
      const sy = Number.isFinite(values[1]) ? values[1] : values[0];
      next = [values[0], 0, 0, sy, 0, 0];
    } else if (name === 'rotate' && Number.isFinite(values[0])) {
      const radians = values[0] * Math.PI / 180;
      const c = Math.cos(radians);
      const s = Math.sin(radians);
      const rotation = [c, s, -s, c, 0, 0];
      if (Number.isFinite(values[1]) && Number.isFinite(values[2])) {
        const toCenter = [1, 0, 0, 1, values[1], values[2]];
        const fromCenter = [1, 0, 0, 1, -values[1], -values[2]];
        next = cadSvgMatrixMultiply(toCenter, cadSvgMatrixMultiply(rotation, fromCenter));
      } else next = rotation;
    }
    result = cadSvgMatrixMultiply(result, next);
  }
  return result;
}

function cadSvgNumberPairs(value) {
  const numbers = String(value || '').trim().split(/[ ,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  return points;
}

function cadSvgPathVertices(pathData) {
  const segments = [];
  const re = /([a-zA-Z])([^a-zA-Z]*)/g;
  let match;
  while ((match = re.exec(String(pathData || '')))) segments.push([match[1], match[2]]);

  const points = [];
  let current = [0, 0];
  let subpathStart = null;
  const addPoint = point => {
    if (!point.every(Number.isFinite)) return;
    current = point.slice();
    points.push(current.slice());
  };

  for (const [rawCommand, payload] of segments) {
    const command = rawCommand.toUpperCase();
    const relative = rawCommand !== command;
    const values = payload.trim().split(/[ ,]+/).filter(Boolean).map(Number).filter(Number.isFinite);

    if (command === 'M' || command === 'L') {
      for (let i = 0; i + 1 < values.length; i += 2) {
        const base = relative ? current : [0, 0];
        const point = [base[0] + values[i], base[1] + values[i + 1]];
        addPoint(point);
        if (command === 'M' && i === 0) subpathStart = point.slice();
      }
    } else if (command === 'H') {
      values.forEach(value => addPoint([(relative ? current[0] : 0) + value, current[1]]));
    } else if (command === 'V') {
      values.forEach(value => addPoint([current[0], (relative ? current[1] : 0) + value]));
    } else if (command === 'Z' && subpathStart) {
      addPoint(subpathStart);
    }
  }
  return points;
}

function cadCollectSvgEndpointCandidates(svgDoc) {
  const root = svgDoc?.documentElement;
  if (!root || root.localName !== 'svg') return [];
  const result = [];
  const append = (matrix, points) => points.forEach(point => result.push(cadSvgMatrixApply(matrix, point)));

  const visit = (element, parentMatrix) => {
    if (!element || element.nodeType !== 1) return;
    const matrix = cadSvgMatrixMultiply(parentMatrix, cadSvgTransformMatrix(element.getAttribute('transform')));
    const name = element.localName;

    if (name === 'line') {
      append(matrix, [[Number(element.getAttribute('x1') || 0), Number(element.getAttribute('y1') || 0)],
                      [Number(element.getAttribute('x2') || 0), Number(element.getAttribute('y2') || 0)]]);
    } else if (name === 'polyline' || name === 'polygon') {
      append(matrix, cadSvgNumberPairs(element.getAttribute('points')));
    } else if (name === 'path') {
      append(matrix, cadSvgPathVertices(element.getAttribute('d')));
    } else if (name === 'rect') {
      const x = Number(element.getAttribute('x') || 0);
      const y = Number(element.getAttribute('y') || 0);
      const width = Number(element.getAttribute('width') || 0);
      const height = Number(element.getAttribute('height') || 0);
      if ([x,y,width,height].every(Number.isFinite) && width >= 0 && height >= 0)
        append(matrix, [[x,y],[x+width,y],[x+width,y+height],[x,y+height]]);
    }

    Array.from(element.children || []).forEach(child => visit(child, matrix));
  };

  visit(root, cadSvgMatrixIdentity());
  return result.filter(point => point.every(Number.isFinite));
}

function cadMapSvgPointToBackground(point, sourceViewBox, background) {
  if (!sourceViewBox || sourceViewBox.length !== 4 || !background) return null;
  const [vx, vy, vw, vh] = sourceViewBox;
  const x = Number(background.getAttribute('x'));
  const y = Number(background.getAttribute('y'));
  const width = Number(background.getAttribute('width'));
  const height = Number(background.getAttribute('height'));
  if (![vx,vy,vw,vh,x,y,width,height].every(Number.isFinite) || vw <= 0 || vh <= 0 || width <= 0 || height <= 0) return null;

  const preserve = String(background.getAttribute('preserveAspectRatio') || 'xMidYMid meet').trim();
  const sx = width / vw;
  const sy = height / vh;

  if (/^none(?:\s|$)/i.test(preserve))
    return [x + (point[0] - vx) * sx, y + (point[1] - vy) * sy];

  const scale = /(?:^|\s)slice(?:\s|$)/i.test(preserve) ? Math.max(sx, sy) : Math.min(sx, sy);
  const renderedWidth = vw * scale;
  const renderedHeight = vh * scale;
  let alignX = 0.5, alignY = 0.5;
  if (/xMin/i.test(preserve)) alignX = 0;
  else if (/xMax/i.test(preserve)) alignX = 1;
  if (/YMin/i.test(preserve)) alignY = 0;
  else if (/YMax/i.test(preserve)) alignY = 1;

  return [
    x + (width - renderedWidth) * alignX + (point[0] - vx) * scale,
    y + (height - renderedHeight) * alignY + (point[1] - vy) * scale
  ];
}

function cadAddBackgroundMidpointCandidates(realPoints) {
  const uniqueReal = new Map();
  (realPoints || []).forEach(point => {
    if (!Array.isArray(point) || !point.every(Number.isFinite)) return;
    const key = point[0].toFixed(4) + ',' + point[1].toFixed(4);
    if (!uniqueReal.has(key)) uniqueReal.set(key, point);
  });

  const base = Array.from(uniqueReal.values());
  if (base.length < 2) return base;

  const cellSize = CAD_BACKGROUND_MIDPOINT_MAX_CM;
  const cells = new Map();
  base.forEach((point, index) => {
    const key = Math.floor(point[0] / cellSize) + ',' + Math.floor(point[1] / cellSize);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(index);
  });

  const minDistance2 = CAD_BACKGROUND_MIDPOINT_MIN_CM * CAD_BACKGROUND_MIDPOINT_MIN_CM;
  const maxDistance2 = CAD_BACKGROUND_MIDPOINT_MAX_CM * CAD_BACKGROUND_MIDPOINT_MAX_CM;
  const midpoints = new Map();

  base.forEach((point, index) => {
    const gx = Math.floor(point[0] / cellSize);
    const gy = Math.floor(point[1] / cellSize);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const neighbours = cells.get((gx + dx) + ',' + (gy + dy));
        if (!neighbours) continue;

        neighbours.forEach(otherIndex => {
          if (otherIndex <= index) return;
          const other = base[otherIndex];
          const vx = other[0] - point[0];
          const vy = other[1] - point[1];
          const distance2 = vx * vx + vy * vy;
          if (distance2 < minDistance2 || distance2 > maxDistance2) return;

          const midpoint = [(point[0] + other[0]) / 2, (point[1] + other[1]) / 2];
          const key = midpoint[0].toFixed(4) + ',' + midpoint[1].toFixed(4);
          if (!uniqueReal.has(key) && !midpoints.has(key)) midpoints.set(key, midpoint);
        });
      }
    }
  });

  return base.concat(Array.from(midpoints.values()));
}

function cadBuildBackgroundSnapGrid(points) {
  const grid = new Map();
  const cellSize = Math.max(CAD_SNAP_DISTANCE, 0.001);
  points.forEach(point => {
    const key = Math.floor(point[0] / cellSize) + ',' + Math.floor(point[1] / cellSize);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(point);
  });
  return grid;
}

function cadBackgroundSnapCacheForCurrentPlane() {
  const background = cadVectorPlaneBackground();
  if (!background) {
    cadBackgroundSnapCache = {background:null,href:'',x:'',y:'',width:'',height:'',preserveAspectRatio:'',points:[],grid:new Map()};
    return cadBackgroundSnapCache;
  }

  const href = background.getAttribute('href') || '';
  const x = background.getAttribute('x') || '';
  const y = background.getAttribute('y') || '';
  const width = background.getAttribute('width') || '';
  const height = background.getAttribute('height') || '';
  const preserveAspectRatio = background.getAttribute('preserveAspectRatio') || '';

  if (cadBackgroundSnapCache.background === background &&
      cadBackgroundSnapCache.href === href &&
      cadBackgroundSnapCache.x === x &&
      cadBackgroundSnapCache.y === y &&
      cadBackgroundSnapCache.width === width &&
      cadBackgroundSnapCache.height === height &&
      cadBackgroundSnapCache.preserveAspectRatio === preserveAspectRatio)
    return cadBackgroundSnapCache;

  let points = [];
  try {
    const svgText = cadDecodeSvgDataUrl(href);
    if (svgText) {
      const svgDoc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      if (!svgDoc.querySelector('parsererror')) {
        const root = svgDoc.documentElement;
        let sourceViewBox = cadParseViewBox(root.getAttribute('viewBox'));
        if (!sourceViewBox) {
          const sw = Number.parseFloat(root.getAttribute('width') || '');
          const sh = Number.parseFloat(root.getAttribute('height') || '');
          if (Number.isFinite(sw) && sw > 0 && Number.isFinite(sh) && sh > 0) sourceViewBox = [0,0,sw,sh];
        }
        if (sourceViewBox) {
          const unique = new Map();
          cadCollectSvgEndpointCandidates(svgDoc).forEach(point => {
            const mapped = cadMapSvgPointToBackground(point, sourceViewBox, background);
            if (!mapped || !mapped.every(Number.isFinite)) return;
            const key = mapped[0].toFixed(4) + ',' + mapped[1].toFixed(4);
            if (!unique.has(key)) unique.set(key, mapped);
          });
          points = cadAddBackgroundMidpointCandidates(Array.from(unique.values()));
        }
      }
    }
  } catch (error) {
    console.warn('Snap sfondo: impossibile estrarre gli endpoint SVG.', error);
  }

  cadBackgroundSnapCache = {background,href,x,y,width,height,preserveAspectRatio,points,grid:cadBuildBackgroundSnapGrid(points)};
  return cadBackgroundSnapCache;
}

function cadBackgroundSnapCandidates(point) {
  if (cadSnapBackground?.checked !== true || cadShowBackground?.checked === false || !cadVectorPlaneBackground()) return [];
  const cache = cadBackgroundSnapCacheForCurrentPlane();
  if (!cache.points.length) return [];

  const cellSize = Math.max(CAD_SNAP_DISTANCE, 0.001);
  const gx = Math.floor(point[0] / cellSize);
  const gy = Math.floor(point[1] / cellSize);
  const result = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = cache.grid.get((gx + dx) + ',' + (gy + dy));
      if (cell) result.push(...cell);
    }
  }
  return result;
}

let pdfImportState = null;

function cadIsPdfFile(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
}

async function cadLoadPdfJs() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import(PDFJS_MODULE_URL)
      .then(module => {
        if (module?.GlobalWorkerOptions)
          module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return module;
      })
      .catch(error => {
        pdfJsModulePromise = null;
        throw error;
      });
  }
  return pdfJsModulePromise;
}

function cadPdfPageSizeMm(page) {
  const viewport = page.getViewport({ scale: 1 });
  return {
    width: viewport.width * 25.4 / 72,
    height: viewport.height * 25.4 / 72
  };
}

async function cadRenderPdfPage(page, maxDimension) {
  const baseViewport = page.getViewport({ scale: 1 });
  const baseMax = Math.max(baseViewport.width, baseViewport.height, 1);
  const scale = Math.max(0.1, Math.min(6, Number(maxDimension || 1) / baseMax));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D non disponibile per la rasterizzazione PDF.');

  await page.render({
    canvasContext: context,
    viewport,
    background: 'rgb(255,255,255)'
  }).promise;

  return { canvas, viewport, baseViewport, scale };
}

function cadCanvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Impossibile creare il PNG dalla pagina PDF.'));
    }, 'image/png');
  });
}

function cadPdfUpdatePageControls() {
  const state = pdfImportState;
  if (!state) return;
  const count = state.pdfDoc.numPages;
  if (pdfPageNumber) {
    pdfPageNumber.min = '1';
    pdfPageNumber.max = String(count);
    pdfPageNumber.value = String(state.pageNumber);
  }
  if (pdfPageCount) pdfPageCount.textContent = 'di ' + count;
  if (pdfPrevPage) pdfPrevPage.disabled = state.pageNumber <= 1;
  if (pdfNextPage) pdfNextPage.disabled = state.pageNumber >= count;
}

async function cadRenderPdfPreview() {
  const state = pdfImportState;
  if (!state) return;

  const token = ++state.previewToken;
  cadPdfUpdatePageControls();
  if (pdfImportRasterize) pdfImportRasterize.disabled = true;
  if (pdfImportInfo)
    pdfImportInfo.textContent = 'Preparazione pagina ' + state.pageNumber + '...';

  try {
    const page = await state.pdfDoc.getPage(state.pageNumber);
    const rendered = await cadRenderPdfPage(page, PDF_PREVIEW_MAX_DIMENSION);
    if (pdfImportState !== state || token !== state.previewToken) return;

    if (pdfPreviewCanvas) {
      pdfPreviewCanvas.width = rendered.canvas.width;
      pdfPreviewCanvas.height = rendered.canvas.height;
      const ctx = pdfPreviewCanvas.getContext('2d', { alpha: false });
      ctx?.drawImage(rendered.canvas, 0, 0);
    }

    const sizeMm = cadPdfPageSizeMm(page);
    if (pdfImportInfo) {
      pdfImportInfo.textContent =
        'Pagina ' + state.pageNumber + ' di ' + state.pdfDoc.numPages +
        ' · foglio circa ' + sizeMm.width.toFixed(1) + ' × ' + sizeMm.height.toFixed(1) + ' mm' +
        ' · anteprima ' + rendered.canvas.width + ' × ' + rendered.canvas.height + ' px';
    }
  } catch (error) {
    if (pdfImportState !== state || token !== state.previewToken) return;
    console.error('Anteprima PDF non riuscita:', error);
    if (pdfImportInfo)
      pdfImportInfo.textContent = 'Anteprima PDF non disponibile: ' + (error?.message || error);
  } finally {
    if (pdfImportState === state && token === state.previewToken && pdfImportRasterize)
      pdfImportRasterize.disabled = false;
  }
}

function cadSetPdfPage(value) {
  const state = pdfImportState;
  if (!state) return;
  const requested = Math.round(Number(value));
  if (!Number.isFinite(requested)) {
    cadPdfUpdatePageControls();
    return;
  }
  const next = Math.min(state.pdfDoc.numPages, Math.max(1, requested));
  if (next === state.pageNumber) {
    cadPdfUpdatePageControls();
    return;
  }
  state.pageNumber = next;
  void cadRenderPdfPreview();
}

function closePdfImportDialog(importSelected = false) {
  const state = pdfImportState;
  if (!state) return;

  pdfImportState = null;
  pdfImportModal?.classList.remove('visible');
  pdfImportModal?.setAttribute('aria-hidden', 'true');

  if (importSelected) {
    state.resolve({
      file: state.file,
      pdfDoc: state.pdfDoc,
      pageNumber: state.pageNumber
    });
  } else {
    Promise.resolve(state.pdfDoc.destroy?.()).catch(() => {});
    state.resolve(null);
  }
}

async function openPdfImportDialog(file) {
  const pdfjs = await cadLoadPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdfDoc = await loadingTask.promise;

  if (!pdfDoc.numPages) {
    await pdfDoc.destroy?.();
    throw new Error('Il PDF non contiene pagine importabili.');
  }

  return new Promise(resolve => {
    pdfImportState = {
      file,
      pdfDoc,
      pageNumber: 1,
      previewToken: 0,
      resolve
    };

    if (pdfImportFileName)
      pdfImportFileName.textContent = (file.name || 'documento.pdf') + ' · ' + pdfDoc.numPages + ' pagine';

    pdfImportModal?.classList.add('visible');
    pdfImportModal?.setAttribute('aria-hidden', 'false');
    cadPdfUpdatePageControls();
    void cadRenderPdfPreview();
  });
}

async function cadConvertPdfBackground(file) {
  cadSetStatus('Caricamento PDF · ' + (file.name || 'documento.pdf') + '...');
  const selection = await openPdfImportDialog(file);
  if (!selection) {
    cadSetStatus('Importazione PDF annullata.');
    return;
  }

  const { pdfDoc, pageNumber } = selection;
  try {
    cadSetStatus('Rasterizzazione PDF · pagina ' + pageNumber + '...');
    const page = await pdfDoc.getPage(pageNumber);
    const rendered = await cadRenderPdfPage(page, PDF_RASTER_MAX_DIMENSION);
    const blob = await cadCanvasToPngBlob(rendered.canvas);
    const stem = (file.name || 'sfondo').replace(/\.pdf$/i, '') || 'sfondo';
    const pngFile = new File(
      [blob],
      stem + '-pagina-' + pageNumber + '.png',
      { type: 'image/png' }
    );

    await cadImportBackgroundFile(pngFile, {
      statusLabel: 'PDF raster',
      originalName: (file.name || 'documento.pdf') + ' · pagina ' + pageNumber
    });

    const sizeMm = cadPdfPageSizeMm(page);
    cadSetStatus(
      '✓ PDF pagina ' + pageNumber + '/' + pdfDoc.numPages +
      ' → sfondo raster PNG ' + rendered.canvas.width + ' × ' + rendered.canvas.height + ' px' +
      ' · foglio ' + sizeMm.width.toFixed(1) + ' × ' + sizeMm.height.toFixed(1) + ' mm' +
      ' · usa Calibra con una misura reale',
      'dirty'
    );
  } finally {
    await pdfDoc.destroy?.();
  }
}

let dxfImportState = null;

function cadIsDxfFile(file) {
  return /\.dxf$/i.test(file?.name || '') ||
    /(?:application|image)\/dxf/i.test(file?.type || '');
}

function dxfSelectedLayers() {
  const selected = new Set();
  dxfLayerList?.querySelectorAll('input[type="checkbox"][data-dxf-layer]').forEach(input => {
    if (input.checked) selected.add(input.dataset.dxfLayer || '0');
  });
  return selected;
}

function dxfLayerLooksArchitectural(name) {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return false;
  if (value === 'defpoints') return false;
  return ![
    'quote', 'quot', 'dimension', 'dimens',
    'retin', 'hatch', 'arred', 'furniture',
    'figure', 'testi', 'testo', 'text', 'scritte'
  ].some(token => value.includes(token));
}

function markDxfImportManual() {
  if (dxfImportState) dxfImportState.profile = 'manual';
}

function dxfDialogOptions() {
  return {
    layers: dxfSelectedLayers(),
    unit: dxfDrawingUnit?.value || 'cm',
    curves: Boolean(dxfModeCurves?.checked),
    convertText: Boolean(dxfConvertText?.checked),
    explodeBlocks: Boolean(dxfExplodeBlocks?.checked),
    profile: dxfImportState?.profile || 'manual'
  };
}

function updateDxfImportSummary() {
  if (!dxfImportState || !dxfImportSummary) return;
  const options = dxfDialogOptions();
  const estimate = estimateDxfConversion(dxfImportState.model, options);
  const scaleToCm = dxfUnitScaleToCm(options.unit);
  dxfImportSummary.textContent =
    'Layer selezionati: ' + options.layers.size + ' / ' + dxfImportState.layers.length + '\n' +
    'Entità previste: ' + estimate.selected +
    ' · ignorate: ' + estimate.ignored +
    (estimate.blocks ? ' · blocchi da esplodere: ' + estimate.blocks : '') + '\n' +
    'Profilo: ' + (options.profile === 'architectural' ? 'pianta architettonica automatica' : 'selezione manuale') + '\n' +
    'Scala automatica: 1 unità DXF = ' + scaleToCm + ' cm Termodel' + '\n' +
    'Calibrazione manuale: non necessaria se unità e DXF sono corretti.';
  if (dxfImportConvert) dxfImportConvert.disabled = options.layers.size === 0;
}

function closeDxfImportDialog(result = null) {
  if (!dxfImportState) return;
  const resolve = dxfImportState.resolve;
  dxfImportState = null;
  dxfImportModal?.classList.remove('visible');
  dxfImportModal?.setAttribute('aria-hidden', 'true');
  resolve(result);
}

function openDxfImportDialog(file, model) {
  return new Promise(resolve => {
    const layers = getDxfLayerSummary(model);
    dxfImportState = { file, model, layers, resolve, profile: 'architectural' };

    if (dxfImportFileName) dxfImportFileName.textContent = file.name || 'disegno.dxf';
    if (dxfImportInfo) {
      dxfImportInfo.textContent =
        model.entities.length + ' entità principali · ' +
        model.blocks.size + ' blocchi · unità: ' +
        (model.header?.unitsLabel || 'non dichiarate');
    }

    if (dxfLayerList) {
      dxfLayerList.textContent = '';
      layers.forEach(layer => {
        const row = document.createElement('label');
        row.className = 'dxf-layer-row';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = layer.count > 0 && dxfLayerLooksArchitectural(layer.name);
        check.dataset.dxfLayer = layer.name;
        check.addEventListener('change', () => {
          markDxfImportManual();
          updateDxfImportSummary();
        });

        const name = document.createElement('span');
        name.className = 'dxf-layer-name';
        name.textContent = layer.name;

        const count = document.createElement('span');
        count.className = 'dxf-layer-count';
        count.textContent = String(layer.count);

        row.append(check, name, count);
        dxfLayerList.appendChild(row);
      });
    }

    if (dxfDrawingUnit)
      dxfDrawingUnit.value = dxfUnitFromInsUnits(model.header?.insUnits);
    if (dxfModeLines) dxfModeLines.checked = true;
    // Il profilo architettonico abilita gli archi per mantenere leggibili
    // porte, aperture e altre convenzioni grafiche tipiche delle piante.
    if (dxfModeCurves) dxfModeCurves.checked = true;
    if (dxfConvertText) dxfConvertText.checked = false;
    if (dxfExplodeBlocks) dxfExplodeBlocks.checked = false;

    dxfImportModal?.classList.add('visible');
    dxfImportModal?.setAttribute('aria-hidden', 'false');
    updateDxfImportSummary();
  });
}

async function cadConvertDxfBackground(file) {
  const text = await file.text();
  const model = parseDxfPlotSource(text);
  const options = await openDxfImportDialog(file, model);
  if (!options) {
    cadSetStatus('Importazione DXF annullata.');
    return;
  }

  try {
    cadSetStatus('Conversione DXF sul Termodel Service…');
    await ensureTermodelServiceReady();

    const response = await fetchTermodelServiceWithTimeout(
      '/api/dxf/to-svg',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dxfText: text,
          layers: Array.from(options.layers),
          unit: options.unit,
          curves: options.curves,
          convertText: options.convertText,
          explodeBlocks: options.explodeBlocks,
          profile: options.profile
        })
      },
      120000
    );

    if (!response.ok)
      throw new Error(await readTermodelServiceError(response));

    const result = await response.json();
    if (!result?.svgText || !Array.isArray(result?.viewBox))
      throw new Error('Risposta DXF→SVG del Service non valida.');

    const svgFile = new File(
      [result.svgText],
      file.name || 'sfondo.dxf',
      { type: 'image/svg+xml' }
    );

    await cadImportBackgroundFile(svgFile, {
      statusLabel: 'DXF convertito dal Service',
      originalName: file.name || 'sfondo.dxf',
      sourceUnit: result.drawingUnit,
      unitScaleToCm: result.unitScaleToCm,
      automaticDxfScale: true,
      originOffsetCm: result.originOffsetCm,
      realSizeCm: {
        width: result.viewBox[2],
        height: result.viewBox[3]
      }
    });

    cadSetStatus(
      '✓ DXF convertito dal Service in sfondo SVG · ' +
      result.stats.converted + ' entità · ' +
      result.realWidthMeters.toFixed(3) + ' × ' +
      result.realHeightMeters.toFixed(3) + ' m · ' +
      (result.profile === 'architectural' ? 'profilo architettonico · ' : '') +
      'scala automatica ' + result.drawingUnit + ' → cm · Piano ' + cadCurrentPlane() +
      ' · ' + (file.name || 'sfondo.dxf'),
      'dirty'
    );
  } catch (error) {
    cadSetStatus(
      'Conversione DXF non riuscita: ' + (error?.message || error),
      'error'
    );
    throw error;
  }
}

function cadReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('Impossibile leggere il file.')));
    reader.readAsDataURL(file);
  });
}

function cadBackgroundKind(file) {
  return file?.type === 'image/svg+xml' || /\.svg$/i.test(file?.name || '')
    ? 'vector'
    : 'raster';
}

async function cadImportBackgroundFile(file, options = {}) {
  if (!cadWorkingDoc || !file) return;

  if (cadIsPdfFile(file)) {
    await cadConvertPdfBackground(file);
    return;
  }

  if (cadIsDxfFile(file) && file.type !== 'image/svg+xml') {
    await cadConvertDxfBackground(file);
    return;
  }

  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || '');
  const isRaster = /^image\//i.test(file.type || '') && !isSvg;
  if (!isSvg && !isRaster) {
    cadSetStatus('Formato sfondo non supportato. Usa PDF, DXF, SVG o un file immagine.', 'error');
    return;
  }

  const root = cadWorkingDoc.documentElement;
  const viewBox = cadParseViewBox(root.getAttribute('viewBox'));
  const plane = cadCurrentPlane();
  if (!viewBox || !plane) {
    cadSetStatus('Impossibile aggiungere lo sfondo: viewBox o piano corrente non disponibile.', 'error');
    return;
  }

  const dataUrl = await cadReadFileAsDataUrl(file);
  if (!dataUrl) {
    cadSetStatus('Impossibile incorporare il file di sfondo.', 'error');
    return;
  }

  const before = cadSerializeWorkingSvg();
  const group = cadBackgroundContainer(cadWorkingDoc, true);
  cadPlaneBackground(cadWorkingDoc, plane)?.remove();

  const image = cadWorkingDoc.createElementNS(SVG_NS, 'image');
  image.setAttribute('data-termodel-sfondo', '1');
  image.setAttribute('data-termodel-piano', plane);
  image.setAttribute('data-termodel-layer', cadCurrentLayer());
  image.setAttribute('data-termodel-sfondo-tipo', cadBackgroundKind(file));
  image.setAttribute('data-termodel-nome-file', options.originalName || file.name || '');
  if (options.sourceUnit)
    image.setAttribute('data-termodel-dxf-unita', options.sourceUnit);
  if (Number.isFinite(options.unitScaleToCm))
    image.setAttribute('data-termodel-dxf-fattore-cm', String(options.unitScaleToCm));
  if (options.automaticDxfScale)
    image.setAttribute('data-termodel-dxf-scala-automatica', '1');
  if (Number.isFinite(options.originOffsetCm?.x))
    image.setAttribute('data-termodel-dxf-origine-x-cm', String(options.originOffsetCm.x));
  if (Number.isFinite(options.originOffsetCm?.y))
    image.setAttribute('data-termodel-dxf-origine-y-cm', String(options.originOffsetCm.y));

  const realWidth = Number(options.realSizeCm?.width);
  const realHeight = Number(options.realSizeCm?.height);
  const useRealSize =
    Number.isFinite(realWidth) && realWidth > 0 &&
    Number.isFinite(realHeight) && realHeight > 0;

  image.setAttribute('x', String(viewBox[0]));
  image.setAttribute('y', String(viewBox[1]));
  image.setAttribute('width', String(useRealSize ? realWidth : viewBox[2]));
  image.setAttribute('height', String(useRealSize ? realHeight : viewBox[3]));
  image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  image.setAttribute('opacity', '0.72');
  image.setAttribute('href', dataUrl);
  cadStyleCoverageBackground(image);
  group.appendChild(image);

  if (useRealSize) {
    const projectViewBox = cadGeometryViewBox(cadWorkingDoc, '');
    if (projectViewBox) {
      cadWorkingDoc.documentElement.setAttribute('viewBox', cadFormatViewBox(projectViewBox));
      cadViewportBase = projectViewBox.slice();
      const planeViewBox = cadGeometryViewBox(cadWorkingDoc, plane);
      cadViewport = planeViewBox?.slice() || projectViewBox.slice();
      ensureNorthSymbolInSvg(cadWorkingDoc, northOrientationDeg);
    }
  }

  cadUndoStack.push(before);
  cadRedoStack = [];
  renderCadComparison();
  cadUpdateControls();
  cadSetStatus(
    '✓ Sfondo ' + (options.statusLabel || (isSvg ? 'vettoriale' : 'raster')) +
    ' aggiunto · Piano ' + plane +
    ' · ' + (options.originalName || file.name || 'file'),
    'dirty'
  );
}

function cadCurrentPlane() {
  cadEnsureToolbarState();
  return cadText(cadToolbarState.piano);
}

function cadPlaneScopedEntities(doc = cadWorkingDoc) {
  const group = cadCalpestabile(doc);
  if (!group) return [];
  return Array.from(group.children);
}

function cadEntityPlane(element) {
  return cadText(element?.getAttribute?.('data-termodel-piano'));
}

function cadPipeLayerForPlane(planeName) {
  const plane = cadText(planeName);
  return plane ? plane + '_tubipannelli' : '';
}

function cadIsPipeLine(element) {
  if (!element || element.localName !== 'line') return false;
  const entity = cadText(element.getAttribute('data-termodel-entity')).toLowerCase();
  const layer = cadText(element.getAttribute('data-termodel-layer'));
  return entity === 'tubo' ||
    /^T\d+$/i.test(element.id || '') ||
    /_tubipannelli$/i.test(layer);
}

function cadEntityBelongsToCurrentPlane(element) {
  const current = cadCurrentPlane();
  if (!current) return true;
  return cadEntityPlane(element) === current;
}

function cadNormalizePlaneAssignments() {
  const current = cadCurrentPlane();
  if (!current) return 0;

  let count = 0;
  cadPlaneScopedEntities().forEach(element => {
    let plane = cadEntityPlane(element);
    if (!plane) {
      plane = current;
      element.setAttribute('data-termodel-piano', plane);
      count++;
    }
    const layer = cadIsPipeLine(element)
      ? cadPipeLayerForPlane(plane)
      : cadLayerForPlane(plane);
    if (layer && cadText(element.getAttribute('data-termodel-layer')) !== layer) {
      element.setAttribute('data-termodel-layer', layer);
      count++;
    }
    if (cadIsPipeLine(element) &&
        cadText(element.getAttribute('data-termodel-entity')).toLowerCase() !== 'tubo') {
      element.setAttribute('data-termodel-entity', 'Tubo');
      count++;
    }
  });
  return count;
}

function cadAllSourceLines() {
  const group = cadCalpestabile();
  if (!group) return [];
  return Array.from(group.children)
    .filter(el => el.localName === 'line' && /^[EW]/i.test(el.id || ''));
}

function cadAllPipeLines() {
  const group = cadCalpestabile();
  if (!group) return [];
  return Array.from(group.children).filter(cadIsPipeLine);
}

function cadNextPipeCircuitId(networkCode = cadToolbarState?.rete, planeName = cadCurrentPlane()) {
  const network = cadText(networkCode);
  const plane = cadText(planeName);
  let max = 0;

  cadAllPipeLines().forEach(line => {
    if (plane && cadEntityPlane(line) !== plane) return;
    if (network && cadText(line.getAttribute('data-termodel-rete')) !== network) return;
    const value = cadText(line.getAttribute('data-termodel-circuito'));
    const match = /^C(\d+)$/i.exec(value);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });

  return 'C' + String(max + 1).padStart(3, '0');
}

function cadEditableSourceLines() {
  return cadAllSourceLines().filter(cadEntityBelongsToCurrentPlane);
}

// Lo snap deve seguire il contesto CAD corrente.
// In Edificio resta ancorato alle pareti E/W; in Rete usa invece i tubi
// già disegnati sul piano corrente, così Vicino/Estremo funzionano anche
// durante la costruzione della rete impiantistica.
function cadSnapSourceLines() {
  if (cadToolbarState?.modalita === 'rete')
    return cadAllPipeLines().filter(cadEntityBelongsToCurrentPlane);
  return cadEditableSourceLines();
}

function cadSerializeCurrentPlaneSvg() {
  if (!cadWorkingDoc) return '';
  const clone = cadWorkingDoc.cloneNode(true);
  const group = cadCalpestabile(clone);
  const current = cadCurrentPlane();

  if (group && current) {
    Array.from(group.children).forEach(element => {
      const plane = cadText(element.getAttribute('data-termodel-piano'));
      if (plane && plane !== current) element.remove();
    });
  }

  const backgroundGroup = cadBackgroundContainer(clone, false);
  if (backgroundGroup && current) {
    Array.from(backgroundGroup.children).forEach(element => {
      const plane = cadText(element.getAttribute('data-termodel-piano'));
      if (plane && plane !== current) element.remove();
    });
  }

  return new XMLSerializer().serializeToString(clone.documentElement);
}

function cadRestorePlanePreview() {
  const current = cadCurrentPlane();
  lastCleanPlanSvg = cadCleanPlanByPlane.get(current) || '';
  lastGeneratedPlan = cadGeneratedPlanByPlane.get(current) || null;
}

function cadSymbolBlockType(element) {
  if (!element || element.localName !== 'text') return '';
  const first = Array.from(element.children).find(child => child.localName === 'tspan');
  const line = cadText(first?.textContent);
  const match = /^BLOCCO\s*,\s*([^,]+)$/i.exec(line);
  return match ? match[1].trim().toUpperCase() : '';
}

function cadSymbolAttribute(element, name) {
  const wanted = String(name || '').trim().toUpperCase();
  for (const child of Array.from(element?.children || [])) {
    if (child.localName !== 'tspan') continue;
    const line = cadText(child.textContent);
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    const key = line.slice(0, comma).trim().toUpperCase();
    if (key === wanted) return line.slice(comma + 1).trim();
  }
  return '';
}

function cadSymbolColor(element) {
  const type = cadSymbolBlockType(element);
  if (type === 'FIN') return cadSymbolAttribute(element, 'PORTA') === 'Struttura trasparente' ? '#00897b' : '#7b1fa2';
  if (type === 'PON') return '#7b1fa2';
  if (type === 'LOC') return '#c62828';
  if (type === 'ALLINEA') return '#455a64';
  return '#6d4c41';
}

function cadNextSymbolId(prefix) {
  const p = String(prefix || 'S').toUpperCase();
  let max = 0;
  const used = new Set(Array.from(cadWorkingDoc?.querySelectorAll?.('[id]') || []).map(element => element.id).filter(Boolean));
  const re = new RegExp('^' + p + '(\\d+)$', 'i');
  used.forEach(id => {
    const match = re.exec(id);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });
  let n = max + 1;
  let id = p + String(n).padStart(3, '0');
  while (used.has(id)) { n++; id = p + String(n).padStart(3, '0'); }
  return id;
}

function cadCreateSymbolText(id, x, y, rows) {
  const text = cadWorkingDoc.createElementNS(SVG_NS, 'text');
  text.setAttribute('id', id);
  text.setAttribute('x', Number(x).toFixed(3).replace(/\.000$/, ''));
  text.setAttribute('y', Number(y).toFixed(3).replace(/\.000$/, ''));
  text.setAttribute('font-size', '1');
  cadSetOptionalAttribute(text, 'data-termodel-piano', cadCurrentPlane());
  cadSetOptionalAttribute(text, 'data-termodel-layer', cadCurrentLayer());
  rows.forEach((row, index) => {
    const tspan = cadWorkingDoc.createElementNS(SVG_NS, 'tspan');
    tspan.setAttribute('x', text.getAttribute('x'));
    tspan.setAttribute('dy', index === 0 ? '0' : '1.2em');
    tspan.textContent = row;
    text.appendChild(tspan);
  });
  return text;
}

function cadNearestWallPoint(point, maxDistance = CAD_SNAP_DISTANCE * 3) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestLineId = '';
  cadEditableSourceLines().forEach(line => {
    const projected = cadNearestPointOnSegment(point, cadLinePoint(line, 1), cadLinePoint(line, 2));
    const distance = cadPointDistance(point, projected);
    if (distance < bestDistance) {
      best = projected;
      bestDistance = distance;
      bestLineId = line.id || '';
    }
  });
  const snapped = Boolean(best) && bestDistance <= maxDistance;
  return {
    point: best || point,
    snapped,
    distance: bestDistance,
    targetLineId: snapped ? bestLineId : ''
  };
}

function cadNearestPointOnWall(point, lineId, maxDistance = CAD_SNAP_DISTANCE * 3) {
  const line = cadFindSourceLine(lineId);
  if (!line)
    return { point, snapped: false, distance: Number.POSITIVE_INFINITY, targetLineId: '' };

  const projected = cadNearestPointOnSegment(point, cadLinePoint(line, 1), cadLinePoint(line, 2));
  const distance = cadPointDistance(point, projected);
  return {
    point: projected,
    snapped: distance <= maxDistance,
    distance,
    targetLineId: line.id || ''
  };
}

function cadSymbolInsertLabel(type) {
  if (type === 'ALLINEA') return 'Allinea';
  if (type === 'FIN') return 'Porta/Finestra';
  if (type === 'PON') return 'Ponte';
  if (type === 'LOC') return cadPlaneIsCoverage() ? 'Centrofalda' : 'Locale';
  if (type === 'COLMO') return 'Colmo';
  return 'Simbolo';
}

function cadCancelSymbolInsert() {
  cadHideContextMenu();
  if (cadToolMode === 'symbol') {
    cadToolMode = 'select';
    cadSymbolInsertType = '';
  }
  if (cadCanvas) cadCanvas.classList.remove('symbol-insert-mode');
  cadUpdateControls();
}

function cadToggleSymbolInsert(type) {
  if (!cadWorkingDoc) {
    cadSetStatus('Disegno CAD non disponibile.', 'error');
    return;
  }

  const normalized = String(type || '').toUpperCase();
  const coverage = cadPlaneIsCoverage();

  if (normalized === 'COLMO' && !coverage) {
    cadSetStatus('Il comando Colmo è disponibile soltanto sui piani Copertura.', 'error');
    return;
  }
  if (coverage && (normalized === 'FIN' || normalized === 'PON')) {
    cadSetStatus('Finestre e ponti non sono disponibili sul piano Copertura.', 'error');
    return;
  }

  if (cadToolMode === 'symbol' && cadSymbolInsertType === normalized) {
    cadCancelSymbolInsert();
    return;
  }

  if (cadToolMode === 'line') cadCancelNewLine();
  if (cadToolMode === 'window2') cadCancelWindowTwoPoint();

  cadCloseNorthPanel(false);
  cadLastRepeatableCommand = 'symbol:' + normalized;
  cadToolMode = 'symbol';
  cadSymbolInsertType = normalized;
  cadSelectedLineId = '';
  cadNewLineState = null;

  // Feedback immediato: l'attivazione del comando non deve dipendere
  // dall'aggiornamento del pannello laterale.
  cadUpdateControls();

  const needsWall = normalized === 'FIN' || normalized === 'PON' || normalized === 'COLMO';
  cadSetStatus(
    'Piano ' + cadCurrentPlane() +
    ' · Layer ' + cadCurrentLayer() +
    ' · ' + cadSymbolInsertLabel(normalized) +
    (needsWall ? ' · clicca vicino a una parete' : ' · clicca il punto di inserimento')
  );

  try {
    cadUpdatePropertiesPanel();
  } catch (error) {
    console.warn('Pannello CAD non aggiornato durante inserimento simbolo:', error);
  }
}

function cadCancelWindowTwoPoint(svg = cadCanvas?.querySelector('svg')) {
  cadHideContextMenu();
  cadWindowTwoPointState = null;
  if (cadToolMode === 'window2') cadToolMode = 'select';
  if (svg) svg.querySelector('#cadWindowTwoPointPreviewLayer')?.remove();
  cadUpdateControls();
}

function cadToggleWindowTwoPoint() {
  if (!cadWorkingDoc) {
    cadSetStatus('Disegno CAD non disponibile.', 'error');
    return;
  }

  if (cadToolMode === 'window2') {
    cadCancelWindowTwoPoint();
    return;
  }

  if (cadToolMode === 'line') cadCancelNewLine();
  if (cadToolMode === 'symbol') cadCancelSymbolInsert();

  cadCloseNorthPanel(false);
  cadLastRepeatableCommand = 'window2';
  cadToolMode = 'window2';
  cadWindowTwoPointState = null;
  cadSymbolInsertType = '';
  cadSelectedLineId = '';
  cadSelectedSymbolId = '';
  cadNewLineState = null;

  cadUpdateControls();
  cadUpdatePropertiesPanel();
}

function cadRenderWindowTwoPointPreview(svg, currentPoint = null, snapped = false) {
  svg.querySelector('#cadWindowTwoPointPreviewLayer')?.remove();
  if (cadToolMode !== 'window2') return;

  const layer = svgNode('g', {
    id: 'cadWindowTwoPointPreviewLayer',
    'pointer-events': 'none'
  });

  if (!cadWindowTwoPointState) {
    if (currentPoint && snapped) {
      layer.appendChild(svgNode('circle', {
        cx: currentPoint[0],
        cy: currentPoint[1],
        r: 10,
        class: 'cad-snap-marker'
      }));
    }
    svg.appendChild(layer);
    return;
  }

  const start = cadWindowTwoPointState.start;
  layer.appendChild(svgNode('circle', {
    cx: start[0],
    cy: start[1],
    r: 7,
    class: 'cad-newline-start'
  }));

  if (currentPoint) {
    layer.appendChild(svgNode('line', {
      x1: start[0],
      y1: start[1],
      x2: currentPoint[0],
      y2: currentPoint[1],
      class: 'cad-newline-preview'
    }));

    if (snapped) {
      layer.appendChild(svgNode('circle', {
        cx: currentPoint[0],
        cy: currentPoint[1],
        r: 10,
        class: 'cad-snap-marker'
      }));
    }
  }

  svg.appendChild(layer);
}

function cadStartOrFinishWindowTwoPoint(svg, rawPoint) {
  if (!cadWorkingDoc || cadToolMode !== 'window2') return;

  if (!cadWindowTwoPointState) {
    const first = cadNearestWallPoint(rawPoint);
    if (!first.snapped || !first.targetLineId) {
      cadSetStatus('Finestra 2 punti: clicca il primo punto vicino a una parete.', 'error');
      return;
    }

    cadWindowTwoPointState = {
      start: first.point.slice(),
      wallLineId: first.targetLineId
    };
    cadRenderWindowTwoPointPreview(svg, first.point, true);
    cadSetStatus(
      'Finestra 2 punti · primo punto su ' + first.targetLineId +
      ' · clicca il secondo punto sulla stessa parete'
    );
    return;
  }

  const second = cadNearestPointOnWall(rawPoint, cadWindowTwoPointState.wallLineId);
  if (!second.snapped) {
    cadSetStatus('Finestra 2 punti: il secondo punto deve essere sulla stessa parete.', 'error');
    return;
  }

  const start = cadWindowTwoPointState.start;
  const end = second.point;
  const widthSvgCm = cadPointDistance(start, end);
  if (widthSvgCm < 0.5) {
    cadSetStatus('Finestra 2 punti: la larghezza deve essere maggiore di zero.', 'error');
    return;
  }

  const group = cadCalpestabile();
  const plane = cadCurrentPlane();
  const layer = cadCurrentLayer();
  if (!group || !plane || !layer) {
    cadSetStatus('Piano/LayerCad corrente non disponibile: impossibile inserire la finestra.', 'error');
    return;
  }

  const before = cadSerializeWorkingSvg();
  const dati = cadDatiCadRecord();
  const id = cadNextSymbolId('F');
  const midpoint = [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2
  ];
  const rows = [
    'BLOCCO,FIN',
    'PORTA,' + (cadText(dati.Porta) || 'Struttura trasparente'),
    'TIPO,' + (cadText(dati.TipoFinestra) || 'Da associare'),
    'LARGHEZZA,' + cadTrimNumber(widthSvgCm, 2),
    'ALTEZZA,' + cadMetersToSvgCm(dati.AltezzaFinestra),
    'NUMEROANTE,' + (cadText(dati.AnteFinestra) || '0'),
    'SOTTOFINESTRA,' + cadMetersToSvgCm(dati.SottoFinestra),
    'SOPRALUCE,' + cadMetersToSvgCm(dati.SopraLuce)
  ];

  const symbol = cadCreateSymbolText(id, midpoint[0], midpoint[1], rows);
  group.appendChild(symbol);
  cadUndoStack.push(before);
  cadRedoStack = [];
  cadSelectedLineId = '';
  cadSelectedSymbolId = id;

  // Il comando resta attivo per disegnare la finestra successiva.
  cadWindowTwoPointState = null;

  renderCadComparison();
  cadUpdatePropertiesPanel();
  cadUpdateControls();
  cadSetStatus(
    '✓ ' + id +
    ' FIN 2 punti inserita · larghezza ' + cadTrimNumber(widthSvgCm / 100, 2) +
    ' m · centro sul punto medio · continua inserimento · Esc o tasto destro per interrompere',
    'dirty'
  );
}

function cadInsertSymbolAtPoint(rawPoint) {
  if (!cadWorkingDoc || cadToolMode !== 'symbol' || !cadSymbolInsertType) return;
  const group = cadCalpestabile();
  if (!group) { cadSetStatus('Gruppo calpestabile non trovato nello SVG.', 'error'); return; }
  const plane = cadCurrentPlane();
  const layer = cadCurrentLayer();
  if (!plane || !layer) { cadSetStatus('Piano/LayerCad corrente non disponibile: impossibile inserire il simbolo.', 'error'); return; }
  let point = rawPoint.slice();
  let wallSnapped = false;
  if (cadSymbolInsertType === 'FIN' || cadSymbolInsertType === 'PON' || cadSymbolInsertType === 'COLMO') {
    const snap = cadNearestWallPoint(rawPoint);
    if (!snap.snapped) { cadSetStatus(cadSymbolInsertLabel(cadSymbolInsertType) + ': clicca vicino a una parete del piano corrente.', 'error'); return; }
    point = snap.point;
    wallSnapped = true;
  }
  const before = cadSerializeWorkingSvg();
  const dati = cadDatiCadRecord();
  let id = '';
  let rows = [];
  if (cadSymbolInsertType === 'ALLINEA') {
    id = cadNextSymbolId('A');
    rows = ['BLOCCO,ALLINEA'];
  } else if (cadSymbolInsertType === 'FIN') {
    id = cadNextSymbolId('F');
    rows = [
      'BLOCCO,FIN',
      'PORTA,' + (cadText(dati.Porta) || 'Struttura trasparente'),
      'TIPO,' + (cadText(dati.TipoFinestra) || 'Da associare'),
      'LARGHEZZA,' + cadMetersToSvgCm(dati.LarghezzaFinestra),
      'ALTEZZA,' + cadMetersToSvgCm(dati.AltezzaFinestra),
      'NUMEROANTE,' + (cadText(dati.AnteFinestra) || '0'),
      'SOTTOFINESTRA,' + cadMetersToSvgCm(dati.SottoFinestra),
      'SOPRALUCE,' + cadMetersToSvgCm(dati.SopraLuce)
    ];
  } else if (cadSymbolInsertType === 'PON') {
    id = cadNextSymbolId('PON');
    const orientamento = cadText(dati.OrientamentoPonte) || 'Orizzontale';
    const lunghezza = cadText(dati.FonteLunghezzaPonte) === 'Valore imposto'
      ? cadText(dati.LungPonte)
      : (orientamento === 'Orizzontale' ? 'Lunghezza parete' : 'Altezza parete');
    rows = [
      'BLOCCO,PON',
      'TIPO,' + (cadText(dati.TipoPonte) || 'Da associare'),
      'ORIENTAMENTO,' + orientamento,
      'LUNGHEZZA,' + lunghezza
    ];
  } else if (cadSymbolInsertType === 'LOC') {
    id = cadNextSymbolId('R');
    const altezzaDaPiano = cadText(dati.FonteAltezza) === 'Da piano';
    const quotaDaPiano = cadText(dati.FonteQuotaPavimento) === 'Da piano';
    rows = [
      'BLOCCO,LOC',
      'DESCR.,' + (cadText(dati.DescrizioneLocale) || ('Locale ' + id)),
      'ZONA,' + cadText(dati.Zona),
      'CPAV,' + (cadText(dati.ConfinePavimento) || 'Automatico'),
      'CSOF,' + (cadText(dati.ConfineSoffitto) || 'Automatico'),
      'CCOPERTURA,' + (cadText(dati.ColoreCopertura) || 'Solaio piano'),
      'TPAV,' + cadText(dati.TipoPavimento),
      'TSOF,' + cadText(dati.TipoSoffitto),
      'ALTEZZALORDA,' + (altezzaDaPiano ? 'Da piano' : cadText(dati.AltezzaLorda)),
      'ALTEZZANETTA,' + (altezzaDaPiano ? 'Da piano' : cadText(dati.AltezzaNetta)),
      'QUOTAPAVIMENTO,' + (quotaDaPiano ? 'Da piano' : cadText(dati.QuotaPavimento))
    ];
  } else if (cadSymbolInsertType === 'COLMO') {
    id = cadNextSymbolId('COL');
    rows = [
      'BLOCCO,Colmo',
      'QUOTACOLMO,' + (cadText(dati.QuotaColmo) || '3.5'),
      'QUOTAGRONDA,' + (cadText(dati.QuotaGronda) || '3'),
      'LATOPARTEBASSA,' + (cadText(dati.LatoParteBassaShed) || 'Colmo semplice'),
      'QUOTASHED,' + (cadText(dati.QuotaShed) || '0'),
      'PARETESHED,' + (cadText(dati.PareteShed) || 'Dal piano sottostante')
    ];
  }
  if (!id || !rows.length) return;
  const symbol = cadCreateSymbolText(id, point[0], point[1], rows);
  group.appendChild(symbol);
  cadUndoStack.push(before);
  cadRedoStack = [];

  const continueWindows = cadSymbolInsertType === 'FIN';
  if (!continueWindows) {
    cadToolMode = 'select';
    cadSymbolInsertType = '';
  }

  cadSelectedLineId = '';
  cadSelectedSymbolId = id;
  if (cadCanvas && !continueWindows) cadCanvas.classList.remove('symbol-insert-mode');

  renderCadComparison();
  cadUpdatePropertiesPanel();
  cadUpdateControls();

  cadSetStatus(
    '✓ ' + id + ' ' + cadSymbolBlockType(symbol) +
    ' inserito · Piano ' + plane +
    ' · Layer ' + layer +
    (wallSnapped ? ' · SNAP parete' : '') +
    (continueWindows ? ' · continua inserimento · Esc o tasto destro per interrompere' : ''),
    'dirty'
  );
}
function cadFindAnySourceLine(id) {
  if (!id) return null;
  return cadPlaneScopedEntities().find(element =>
    element.localName === 'line' &&
    element.id === id &&
    cadEntityBelongsToCurrentPlane(element)
  ) || null;
}

function cadFindSourceLine(id) {
  const line = cadFindAnySourceLine(id);
  return line && /^[EW]/i.test(line.id || '') ? line : null;
}

function cadFindSelectableLine(id) {
  const line = cadFindAnySourceLine(id);
  if (!line) return null;
  if (cadToolbarState?.modalita === 'rete')
    return cadIsPipeLine(line) ? line : null;
  return /^[EW]/i.test(line.id || '') ? line : null;
}

function cadFindSourceSymbol(id) {
  if (!id) return null;
  return cadPlaneScopedEntities().find(element =>
    element.localName === 'text' &&
    element.id === id &&
    cadSymbolBlockType(element) &&
    cadEntityBelongsToCurrentPlane(element)
  ) || null;
}

const CAD_SYMBOL_PANEL_CONFIG = {
  FIN: [
    { key: 'PORTA', field: 'Porta', label: 'Porta o sup. opaca', arc: true },
    { key: 'TIPO', field: 'TipoFinestra', label: 'Tipo finestra', arc: true },
    { key: 'LARGHEZZA', field: 'LarghezzaFinestra', label: 'Larghezza (m)', svgCm: true },
    { key: 'ALTEZZA', field: 'AltezzaFinestra', label: 'Altezza (m)', svgCm: true },
    { key: 'NUMEROANTE', field: 'AnteFinestra', label: 'Numero Ante' },
    { key: 'SOTTOFINESTRA', field: 'SottoFinestra', label: 'Sottofinestra (m)', svgCm: true },
    { key: 'SOPRALUCE', field: 'SopraLuce', label: 'Sopraluce (m)', svgCm: true }
  ],
  PON: [
    { key: 'TIPO', field: 'TipoPonte', label: 'Tipo ponte', arc: true },
    { key: 'ORIENTAMENTO', field: 'OrientamentoPonte', label: 'Orientamento ponte' },
    { key: '__FONTE_LUNGHEZZA', field: 'FonteLunghezzaPonte', label: 'Fonte lunghezza ponte', virtual: true },
    { key: 'LUNGHEZZA', field: 'LungPonte', label: 'Lunghezza ponte (m)' }
  ],
  LOC: [
    { key: 'DESCR.', field: 'DescrizioneLocale', label: 'Descrizione Locale' },
    { key: 'ZONA', field: 'Zona', label: 'Zona', arc: true },
    { key: '__FONTE_ALTEZZA', field: 'FonteAltezza', label: 'Fonte altezza', virtual: true },
    { key: 'ALTEZZALORDA', field: 'AltezzaLorda', label: 'Altezza lorda (m)' },
    { key: 'ALTEZZANETTA', field: 'AltezzaNetta', label: 'Altezza netta (m)' },
    { key: '__FONTE_QUOTA', field: 'FonteQuotaPavimento', label: 'Fonte quota pavimento', virtual: true },
    { key: 'QUOTAPAVIMENTO', field: 'QuotaPavimento', label: 'Quota pavimento (m)' },
    { key: 'TSOF', field: 'TipoSoffitto', label: 'Tipo Soffitto', arc: true },
    { key: 'CSOF', field: 'ConfineSoffitto', label: 'Confine Soffitto', arc: true },
    { key: 'CCOPERTURA', field: 'ColoreCopertura', label: 'Colore copertura' },
    { key: 'TPAV', field: 'TipoPavimento', label: 'Tipo Pavimento', arc: true },
    { key: 'CPAV', field: 'ConfinePavimento', label: 'Confine Pavimento', arc: true }
  ],
  COLMO: [
    { key: 'QUOTACOLMO', field: 'QuotaColmo', label: 'Quota colmo (m)' },
    { key: 'QUOTAGRONDA', field: 'QuotaGronda', label: 'Quota gronda (m)' },
    { key: 'QUOTASHED', field: 'QuotaShed', label: 'Quota shed (m)' },
    { key: 'LATOPARTEBASSA', field: 'LatoParteBassaShed', label: 'Lato parte bassa shed' },
    { key: 'PARETESHED', field: 'PareteShed', label: 'Tipo parete shed', arc: true }
  ],
  ALLINEA: []
};

function cadSymbolPanelConfig(type) {
  return CAD_SYMBOL_PANEL_CONFIG[type] || [];
}

function cadDatiCadMeta(field) {
  return getArchivioWebSchema('DatiCad')?.[field] || {};
}

function cadUniqueValues(values) {
  const result = [];
  values.forEach(value => {
    const normalized = cadText(value);
    if (normalized && !result.includes(normalized)) result.push(normalized);
  });
  return result;
}

function cadComboInfo(field, currentValue = '') {
  const meta = cadDatiCadMeta(field);
  const combo = Array.isArray(meta.Combo) ? meta.Combo : [];
  if (!combo.length) return { values: [], archive: '' };

  if (combo[0] === 'auto_combo') {
    const archive = cadText(combo[1]);
    const archiveField = cadText(combo[2]);
    const extras = combo.slice(3);
    const values = cadArchiveRecords(archive).map(record => record?.[archiveField]);
    return {
      values: cadUniqueValues([currentValue, ...values, ...extras]),
      archive
    };
  }

  return {
    values: cadUniqueValues([currentValue, ...combo]),
    archive: ''
  };
}

function cadTrimNumber(value, decimals = 2) {
  const number = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(number)) return cadText(value);
  return Number(number.toFixed(decimals)).toString();
}

function cadSymbolPanelValue(symbol, type, config) {
  if (type === 'PON' && config.key === '__FONTE_LUNGHEZZA') {
    const value = cadSymbolAttribute(symbol, 'LUNGHEZZA');
    return value === 'Lunghezza parete' || value === 'Altezza parete'
      ? 'Altezza parete o lunghezza parete'
      : 'Valore imposto';
  }

  if (type === 'LOC' && config.key === '__FONTE_ALTEZZA') {
    return cadSymbolAttribute(symbol, 'ALTEZZALORDA') === 'Da piano' &&
      cadSymbolAttribute(symbol, 'ALTEZZANETTA') === 'Da piano'
      ? 'Da piano'
      : 'Valore imposto';
  }

  if (type === 'LOC' && config.key === '__FONTE_QUOTA') {
    return cadSymbolAttribute(symbol, 'QUOTAPAVIMENTO') === 'Da piano'
      ? 'Da piano'
      : 'Valore imposto';
  }

  const raw = cadSymbolAttribute(symbol, config.key);
  if (config.svgCm) {
    const number = Number(String(raw).replace(',', '.'));
    return Number.isFinite(number) ? cadTrimNumber(number / 100, 2) : raw;
  }

  if (
    type === 'PON' &&
    config.key === 'LUNGHEZZA' &&
    (raw === 'Lunghezza parete' || raw === 'Altezza parete')
  ) return '';

  if (
    type === 'LOC' &&
    ['ALTEZZALORDA','ALTEZZANETTA','QUOTAPAVIMENTO'].includes(config.key) &&
    raw === 'Da piano'
  ) return '';

  return raw;
}

function cadCreateSymbolPanelControl(symbol, type, config) {
  const meta = cadDatiCadMeta(config.field);
  const currentValue = cadSymbolPanelValue(symbol, type, config);
  const comboInfo = cadComboInfo(config.field, currentValue);
  const hasCombo = comboInfo.values.length > 0;
  const control = document.createElement(hasCombo ? 'select' : 'input');

  control.dataset.cadSymbolConfigKey = config.key;
  control.dataset.cadDatiCadField = config.field;

  if (hasCombo) {
    comboInfo.values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      control.appendChild(option);
    });
    control.value = currentValue;
  } else {
    control.type = (meta.NumeroCifre !== undefined || meta.NumeroDecimali !== undefined)
      ? 'number'
      : 'text';
    if (control.type === 'number') {
      const decimals = Number(meta.NumeroDecimali ?? 0);
      control.step = decimals > 0 ? String(1 / Math.pow(10, decimals)) : '1';
    }
    control.value = currentValue;
  }

  control.readOnly = Boolean(meta.ReadOnly);
  control.disabled = Boolean(meta.ReadOnly);
  return { control, comboInfo };
}

function cadUpdateSymbolPanelDependencies(type) {
  if (!cadSymbolFields) return;
  const get = key => cadSymbolFields.querySelector('[data-cad-symbol-config-key="' + key + '"]');

  if (type === 'PON') {
    const source = get('__FONTE_LUNGHEZZA');
    const length = get('LUNGHEZZA');
    if (length) length.disabled = source?.value !== 'Valore imposto';
  }

  if (type === 'LOC') {
    const sourceHeight = get('__FONTE_ALTEZZA');
    const sourceQuota = get('__FONTE_QUOTA');
    ['ALTEZZALORDA','ALTEZZANETTA'].forEach(key => {
      const control = get(key);
      if (control) control.disabled = sourceHeight?.value === 'Da piano';
    });
    const quota = get('QUOTAPAVIMENTO');
    if (quota) quota.disabled = sourceQuota?.value === 'Da piano';
  }
}

function cadRenderSelectedSymbolFields(symbol) {
  if (!cadSymbolFields) return;
  cadSymbolFields.innerHTML = '';

  const type = cadSymbolBlockType(symbol);
  const configs = cadSymbolPanelConfig(type);

  if (cadSymbolSectionTitle) {
    const title = type === 'FIN'
      ? 'Finestre / Porte'
      : type === 'PON'
        ? 'Ponti termici'
        : type === 'LOC'
          ? (cadPlaneIsCoverage() ? 'Centrofalda' : 'Locali')
          : type === 'COLMO'
            ? 'Tetti · Colmo'
            : 'Simbolo di allineamento';
    cadSymbolSectionTitle.textContent = title;
  }

  if (!configs.length) {
    const note = document.createElement('div');
    note.className = 'cad-properties-note';
    note.textContent = 'Questo simbolo non contiene attributi tecnici.';
    cadSymbolFields.appendChild(note);
    return;
  }

  configs.forEach(config => {
    const wrapper = document.createElement('div');
    wrapper.className = 'cad-prop-row';

    const label = document.createElement('label');
    label.textContent = config.label + ':';

    const { control, comboInfo } = cadCreateSymbolPanelControl(symbol, type, config);
    const meta = cadDatiCadMeta(config.field);

    if (config.arc && comboInfo.archive) {
      const controlWrap = document.createElement('div');
      controlWrap.className = 'cad-prop-with-arc';

      const arc = document.createElement('button');
      arc.type = 'button';
      arc.className = 'cad-prop-arc';
      arc.textContent = 'Arc';
      arc.title = 'Apri archivio ' + comboInfo.archive;
      arc.addEventListener('click', () => openArchivioWeb(comboInfo.archive));

      controlWrap.appendChild(control);
      controlWrap.appendChild(arc);
      wrapper.appendChild(label);
      wrapper.appendChild(controlWrap);
    } else {
      wrapper.appendChild(label);
      wrapper.appendChild(control);
    }

    if (config.virtual)
      control.addEventListener('change', () => cadUpdateSymbolPanelDependencies(type));

    if (meta.ReadOnly)
      control.title = 'Campo correlato readonly secondo definizionedati.json';

    cadSymbolFields.appendChild(wrapper);
  });

  cadUpdateSymbolPanelDependencies(type);
}

function cadSetSymbolAttribute(symbol, key, value) {
  const wanted = String(key || '').trim().toUpperCase();
  let target = null;
  for (const child of Array.from(symbol?.children || [])) {
    if (child.localName !== 'tspan') continue;
    const line = cadText(child.textContent);
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    if (line.slice(0, comma).trim().toUpperCase() === wanted) {
      target = child;
      break;
    }
  }

  if (!target) {
    target = cadWorkingDoc.createElementNS(SVG_NS, 'tspan');
    target.setAttribute('x', symbol.getAttribute('x') || '0');
    target.setAttribute('dy', '1.2em');
    symbol.appendChild(target);
  }
  target.textContent = key + ',' + cadText(value);
}

function cadSymbolPanelControlValue(key) {
  return cadText(
    cadSymbolFields?.querySelector('[data-cad-symbol-config-key="' + key + '"]')?.value
  );
}

function cadApplySelectedSymbolProperties() {
  const symbol = cadFindSourceSymbol(cadSelectedSymbolId);
  if (!symbol || !cadSymbolFields) return;

  const type = cadSymbolBlockType(symbol);
  const before = cadSerializeWorkingSvg();

  if (type === 'FIN') {
    cadSetSymbolAttribute(symbol, 'PORTA', cadSymbolPanelControlValue('PORTA'));
    cadSetSymbolAttribute(symbol, 'TIPO', cadSymbolPanelControlValue('TIPO'));
    ['LARGHEZZA','ALTEZZA','SOTTOFINESTRA','SOPRALUCE'].forEach(key => {
      cadSetSymbolAttribute(symbol, key, cadMetersToSvgCm(cadSymbolPanelControlValue(key)));
    });
    cadSetSymbolAttribute(symbol, 'NUMEROANTE', cadSymbolPanelControlValue('NUMEROANTE'));
  }

  if (type === 'PON') {
    const orientamento = cadSymbolPanelControlValue('ORIENTAMENTO');
    const fonte = cadSymbolPanelControlValue('__FONTE_LUNGHEZZA');
    cadSetSymbolAttribute(symbol, 'TIPO', cadSymbolPanelControlValue('TIPO'));
    cadSetSymbolAttribute(symbol, 'ORIENTAMENTO', orientamento);
    cadSetSymbolAttribute(
      symbol,
      'LUNGHEZZA',
      fonte === 'Valore imposto'
        ? cadSymbolPanelControlValue('LUNGHEZZA')
        : (orientamento === 'Orizzontale' ? 'Lunghezza parete' : 'Altezza parete')
    );
  }

  if (type === 'LOC') {
    const fonteAltezza = cadSymbolPanelControlValue('__FONTE_ALTEZZA');
    const fonteQuota = cadSymbolPanelControlValue('__FONTE_QUOTA');

    cadSetSymbolAttribute(symbol, 'DESCR.', cadSymbolPanelControlValue('DESCR.'));
    cadSetSymbolAttribute(symbol, 'ZONA', cadSymbolPanelControlValue('ZONA'));
    cadSetSymbolAttribute(symbol, 'TSOF', cadSymbolPanelControlValue('TSOF'));
    cadSetSymbolAttribute(symbol, 'CSOF', cadSymbolPanelControlValue('CSOF'));
    cadSetSymbolAttribute(symbol, 'CCOPERTURA', cadSymbolPanelControlValue('CCOPERTURA'));
    cadSetSymbolAttribute(symbol, 'TPAV', cadSymbolPanelControlValue('TPAV'));
    cadSetSymbolAttribute(symbol, 'CPAV', cadSymbolPanelControlValue('CPAV'));

    cadSetSymbolAttribute(
      symbol,
      'ALTEZZALORDA',
      fonteAltezza === 'Da piano' ? 'Da piano' : cadSymbolPanelControlValue('ALTEZZALORDA')
    );
    cadSetSymbolAttribute(
      symbol,
      'ALTEZZANETTA',
      fonteAltezza === 'Da piano' ? 'Da piano' : cadSymbolPanelControlValue('ALTEZZANETTA')
    );
    cadSetSymbolAttribute(
      symbol,
      'QUOTAPAVIMENTO',
      fonteQuota === 'Da piano' ? 'Da piano' : cadSymbolPanelControlValue('QUOTAPAVIMENTO')
    );
  }

  if (type === 'COLMO') {
    ['QUOTACOLMO','QUOTAGRONDA','QUOTASHED','LATOPARTEBASSA','PARETESHED']
      .forEach(key => cadSetSymbolAttribute(symbol, key, cadSymbolPanelControlValue(key)));
  }

  const after = cadSerializeWorkingSvg();
  if (after !== before) {
    cadUndoStack.push(before);
    cadRedoStack = [];
    renderCadComparison();
    cadSetStatus(cadSelectedSymbolId + ' · attributi XAML aggiornati', 'dirty');
  } else {
    cadUpdatePropertiesPanel();
    cadSetStatus(cadSelectedSymbolId + ' · attributi invariati');
  }
  cadUpdateControls();
}

function cadLinePoint(line, endpoint) {
  const suffix = endpoint === 1 ? '1' : '2';
  return [
    Number(line.getAttribute(`x${suffix}`)),
    Number(line.getAttribute(`y${suffix}`))
  ];
}

function cadSetLinePoint(line, endpoint, x, y) {
  const suffix = endpoint === 1 ? '1' : '2';
  line.setAttribute(`x${suffix}`, Number(x).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute(`y${suffix}`, Number(y).toFixed(3).replace(/\.000$/, ''));
}

function cadLineCalibrationAxis(line) {
  if (!line) return '';
  const [x1, y1] = cadLinePoint(line, 1);
  const [x2, y2] = cadLinePoint(line, 2);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return '';

  if (Math.abs(y2 - y1) <= CAD_CALIBRATION_ORTHO_EPSILON && Math.abs(x2 - x1) > CAD_CALIBRATION_ORTHO_EPSILON)
    return 'horizontal';
  if (Math.abs(x2 - x1) <= CAD_CALIBRATION_ORTHO_EPSILON && Math.abs(y2 - y1) > CAD_CALIBRATION_ORTHO_EPSILON)
    return 'vertical';
  return '';
}

function cadLineLengthCm(line) {
  if (!line) return 0;
  const [x1, y1] = cadLinePoint(line, 1);
  const [x2, y2] = cadLinePoint(line, 2);
  return Math.hypot(x2 - x1, y2 - y1);
}

function cadScaleCoordinate(value, pivot, factor) {
  const number = Number(value);
  return Number.isFinite(number) ? pivot + (number - pivot) * factor : number;
}

function cadSetSvgNumber(element, attribute, value) {
  if (!element || !Number.isFinite(value)) return;
  element.setAttribute(attribute, Number(value).toFixed(3).replace(/\.000$/, ''));
}

function cadScaleCurrentPlaneGeometry(factor, pivot) {
  const plane = cadCurrentPlane();
  if (!plane || !Number.isFinite(factor) || factor <= 0 || !Array.isArray(pivot)) return;

  cadPlaneScopedEntities().forEach(element => {
    if (cadEntityPlane(element) !== plane) return;

    if (element.localName === 'line') {
      [1, 2].forEach(endpoint => {
        const [x, y] = cadLinePoint(element, endpoint);
        cadSetLinePoint(
          element,
          endpoint,
          cadScaleCoordinate(x, pivot[0], factor),
          cadScaleCoordinate(y, pivot[1], factor)
        );
      });
      return;
    }

    // I simboli mantengono gli attributi tecnici ma seguono geometricamente
    // la nuova scala del piano.
    if (element.localName === 'text') {
      const x = Number(element.getAttribute('x'));
      const y = Number(element.getAttribute('y'));
      const nextX = cadScaleCoordinate(x, pivot[0], factor);
      const nextY = cadScaleCoordinate(y, pivot[1], factor);
      cadSetSvgNumber(element, 'x', nextX);
      cadSetSvgNumber(element, 'y', nextY);

      Array.from(element.children).forEach(child => {
        if (child.localName !== 'tspan') return;
        if (child.hasAttribute('x'))
          cadSetSvgNumber(child, 'x', cadScaleCoordinate(Number(child.getAttribute('x')), pivot[0], factor));
        if (child.hasAttribute('y'))
          cadSetSvgNumber(child, 'y', cadScaleCoordinate(Number(child.getAttribute('y')), pivot[1], factor));
      });
    }
  });

  const background = cadPlaneBackground(cadWorkingDoc, plane);
  if (background) {
    const x = Number(background.getAttribute('x'));
    const y = Number(background.getAttribute('y'));
    const width = Number(background.getAttribute('width'));
    const height = Number(background.getAttribute('height'));

    cadSetSvgNumber(background, 'x', cadScaleCoordinate(x, pivot[0], factor));
    cadSetSvgNumber(background, 'y', cadScaleCoordinate(y, pivot[1], factor));
    if (Number.isFinite(width)) cadSetSvgNumber(background, 'width', width * factor);
    if (Number.isFinite(height)) cadSetSvgNumber(background, 'height', height * factor);
  }
}

function cadGeometryViewBox(doc = cadWorkingDoc, planeName = '') {
  if (!doc) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const addPoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  cadPlaneScopedEntities(doc).forEach(element => {
    if (planeName && cadEntityPlane(element) !== planeName) return;

    if (element.localName === 'line') {
      addPoint(Number(element.getAttribute('x1')), Number(element.getAttribute('y1')));
      addPoint(Number(element.getAttribute('x2')), Number(element.getAttribute('y2')));
    } else if (element.localName === 'text') {
      addPoint(Number(element.getAttribute('x')), Number(element.getAttribute('y')));
    }
  });

  const backgroundGroup = cadBackgroundContainer(doc, false);
  Array.from(backgroundGroup?.children || []).forEach(image => {
    if (image.localName !== 'image') return;
    if (planeName && cadText(image.getAttribute('data-termodel-piano')) !== planeName) return;
    const x = Number(image.getAttribute('x'));
    const y = Number(image.getAttribute('y'));
    const width = Number(image.getAttribute('width'));
    const height = Number(image.getAttribute('height'));
    addPoint(x, y);
    addPoint(x + width, y + height);
  });

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;

  let width = maxX - minX;
  let height = maxY - minY;
  const fallback = cadParseViewBox(doc.documentElement.getAttribute('viewBox'));
  if (width < 1) width = Math.max(100, fallback?.[2] || 100);
  if (height < 1) height = Math.max(100, fallback?.[3] || 100);

  const margin = Math.max(10, Math.max(width, height) * 0.06);
  return [minX - margin, minY - margin, width + margin * 2, height + margin * 2];
}

function cadUpdateCalibrationPanel(line, northOpen = false) {
  if (!cadBackgroundCalibrationSection) return;

  const axis = line ? cadLineCalibrationAxis(line) : '';
  const show = Boolean(line && axis && !northOpen && !cadSelectedSymbolId);
  cadBackgroundCalibrationSection.hidden = !show;

  if (!show) {
    cadCalibrationLineId = '';
    return;
  }

  const lengthM = cadLineLengthCm(line) / 100;
  const changedReference = cadCalibrationLineId !== line.id;
  cadCalibrationLineId = line.id;

  if (cadCalibrationReference) {
    cadCalibrationReference.textContent =
      line.id + ' · ' +
      (axis === 'horizontal' ? 'orizzontale' : 'verticale') +
      ' · misura attuale ' + lengthM.toFixed(3) + ' m';
  }

  if (changedReference && cadCalibrationRealMeters)
    cadCalibrationRealMeters.value = Number(lengthM.toFixed(3)).toString();

  const background = cadPlaneBackground(cadWorkingDoc, cadCurrentPlane());
  const hasBackground = Boolean(background);
  const autoDxfScale = background?.getAttribute('data-termodel-dxf-scala-automatica') === '1';
  const dxfUnit = cadText(background?.getAttribute('data-termodel-dxf-unita'));
  if (cadCalibrateBackground) cadCalibrateBackground.disabled = !hasBackground;

  if (cadCalibrationNote) {
    if (!hasBackground) {
      cadCalibrationNote.textContent =
        'Aggiungi prima uno sfondo al piano corrente. Le pareti inclinate non sono ammesse come riferimento.';
    } else if (autoDxfScale) {
      cadCalibrationNote.textContent =
        'DXF già in scala automatica' +
        (dxfUnit ? ' (' + dxfUnit + ' → cm)' : '') +
        '. Usa Calibra solo per correggere un DXF o una unità dichiarata in modo errato.';
    } else {
      cadCalibrationNote.textContent =
        'Calibra usa questa parete come riferimento e ridimensiona sfondo, linee e posizioni dei simboli del piano corrente.';
    }
  }
}

function cadApplyBackgroundCalibration() {
  const line = cadFindSourceLine(cadSelectedLineId);
  const axis = cadLineCalibrationAxis(line);
  if (!line || !axis) {
    cadSetStatus('Calibrazione rifiutata: seleziona una parete orizzontale o verticale.', 'error');
    return;
  }

  if (!cadPlaneBackground(cadWorkingDoc, cadCurrentPlane())) {
    cadSetStatus('Calibrazione impossibile: il piano corrente non ha uno sfondo.', 'error');
    return;
  }

  const realMeters = Number(String(cadCalibrationRealMeters?.value || '').replace(',', '.'));
  if (!Number.isFinite(realMeters) || realMeters <= 0) {
    cadSetStatus('Inserisci una misura reale valida in metri.', 'error');
    cadCalibrationRealMeters?.focus();
    return;
  }

  const currentCm = cadLineLengthCm(line);
  const targetCm = realMeters * 100;
  if (!Number.isFinite(currentCm) || currentCm <= CAD_CALIBRATION_ORTHO_EPSILON) {
    cadSetStatus('Calibrazione impossibile: lunghezza della parete non valida.', 'error');
    return;
  }

  const factor = targetCm / currentCm;
  if (!Number.isFinite(factor) || factor <= 0 || factor < 0.0001 || factor > 10000) {
    cadSetStatus('Fattore di calibrazione fuori intervallo.', 'error');
    return;
  }

  if (Math.abs(factor - 1) < 1e-9) {
    cadSetStatus('La parete è già calibrata alla misura indicata.');
    return;
  }

  const before = cadSerializeWorkingSvg();
  const pivot = cadLinePoint(line, 1);
  const plane = cadCurrentPlane();

  cadScaleCurrentPlaneGeometry(factor, pivot);

  const projectViewBox = cadGeometryViewBox(cadWorkingDoc, '');
  if (projectViewBox) {
    cadWorkingDoc.documentElement.setAttribute('viewBox', cadFormatViewBox(projectViewBox));
    ensureNorthSymbolInSvg(cadWorkingDoc, northOrientationDeg);
  }

  const planeViewBox = cadGeometryViewBox(cadWorkingDoc, plane);
  cadViewportBase = projectViewBox?.slice() || null;
  cadViewport = planeViewBox?.slice() || projectViewBox?.slice() || null;

  cadUndoStack.push(before);
  cadRedoStack = [];
  renderCadComparison();
  cadUpdatePropertiesPanel();
  cadUpdateControls();

  cadSetStatus(
    '✓ Calibrazione ' + plane +
    ' · ' + line.id +
    ' = ' + realMeters.toFixed(3) + ' m' +
    ' · fattore ' + factor.toFixed(6),
    'dirty'
  );
}

function cadUpdatePropertiesPanel() {
  const line = cadFindSourceLine(cadSelectedLineId);
  const symbol = cadFindSourceSymbol(cadSelectedSymbolId);
  const hasDoc = !!cadWorkingDoc;

  if (cadPropertiesEmpty) cadPropertiesEmpty.hidden = hasDoc;
  if (cadPropertiesBody) cadPropertiesBody.hidden = !hasDoc;
  if (!hasDoc) return;

  if (line) {
    const lineState = cadStateFromLine(line);
    cadToolbarState.tipoParete = lineState.tipoParete;
    cadToolbarState.confineParete = lineState.confineParete;
  } else {
    cadEnsureToolbarState();
  }

  const derived = cadRefreshToolbarControls();
  const symbolType = symbol ? cadSymbolBlockType(symbol) : '';
  const northOpen = cadNorthPanelIsOpen();

  if (cadWallPropertiesSection) cadWallPropertiesSection.hidden = Boolean(symbol) || northOpen;
  if (cadWallGeometrySection) cadWallGeometrySection.hidden = Boolean(symbol) || northOpen;
  if (cadSymbolPropertiesSection) cadSymbolPropertiesSection.hidden = !symbol || northOpen;
  cadUpdateCalibrationPanel(line, northOpen);

  if (cadWallPropertiesSection) {
    const title = cadWallPropertiesSection.querySelector('.cad-properties-section-title');
    if (title)
      title.textContent = cadPlaneIsCoverage()
        ? 'Copertura · Linee perimetro falde'
        : 'Edificio · Pareti';
  }

  if (cadPropertiesHead) {
    if (northOpen)
      cadPropertiesHead.textContent = 'Dati CAD · Nord';
    else if (symbol)
      cadPropertiesHead.textContent = 'Dati CAD · ' + cadSymbolInsertLabel(symbolType) + ' ' + symbol.id;
    else if (cadPlaneIsCoverage())
      cadPropertiesHead.textContent = line
        ? `Dati CAD · Linea perimetro falde ${line.id}`
        : 'Dati CAD · Linea perimetro falde';
    else
      cadPropertiesHead.textContent = line ? `Dati CAD · Parete ${line.id}` : 'Dati CAD · Nuova parete';
  }

  if (symbol) {
    const x = Number(symbol.getAttribute('x'));
    const y = Number(symbol.getAttribute('y'));
    if (cadSymbolPosition)
      cadSymbolPosition.value = Number.isFinite(x) && Number.isFinite(y)
        ? `${x.toFixed(1)} / ${y.toFixed(1)} cm`
        : '';
    cadRenderSelectedSymbolFields(symbol);

    if (cadPropStart) cadPropStart.value = '';
    if (cadPropEnd) cadPropEnd.value = '';
    if (cadPropLength) cadPropLength.value = '';
  } else if (line) {
    const [x1, y1] = cadLinePoint(line, 1);
    const [x2, y2] = cadLinePoint(line, 2);
    const lengthCm = Math.hypot(x2 - x1, y2 - y1);

    if (cadPropStart)
      cadPropStart.value = `${x1.toFixed(1)} / ${y1.toFixed(1)} cm`;
    if (cadPropEnd)
      cadPropEnd.value = `${x2.toFixed(1)} / ${y2.toFixed(1)} cm`;
    if (cadPropLength)
      cadPropLength.value = `${lengthCm.toFixed(1)} cm · ${(lengthCm / 100).toFixed(3)} m`;
  } else {
    if (cadPropStart) cadPropStart.value = '';
    if (cadPropEnd) cadPropEnd.value = '';
    if (cadPropLength) cadPropLength.value = '';
    if (cadSymbolPosition) cadSymbolPosition.value = '';
    if (cadSymbolFields) cadSymbolFields.innerHTML = '';
  }

  if (cadPropConfirm)
    cadPropConfirm.disabled = !line;
  if (cadSymbolApply)
    cadSymbolApply.disabled = !symbol || !cadSymbolPanelConfig(symbolType).length;

  if (cadPropColorSwatch)
    cadPropColorSwatch.style.background = derived.colorCss || '#ccc';
}

function cadSetOptionalAttribute(element, name, value) {
  const normalized = String(value ?? '').trim();
  if (normalized) element.setAttribute(name, normalized);
  else element.removeAttribute(name);
}

function cadCommitToolbarToSelectedLine() {
  const line = cadFindSourceLine(cadSelectedLineId);
  if (!line) {
    cadRefreshToolbarControls();
    return;
  }

  const before = cadSerializeWorkingSvg();
  cadApplySemanticAttributes(line, cadToolbarState);
  const after = cadSerializeWorkingSvg();

  if (after !== before) {
    cadUndoStack.push(before);
    cadRedoStack = [];
    renderCadComparison();
    cadSetStatus(`${line.id} · proprietà archivio aggiornate · modifica non rigenerata`, 'dirty');
  } else {
    cadUpdatePropertiesPanel();
    cadSetStatus(`${line.id} · proprietà invariate`);
  }
  cadUpdateControls();
}

function cadWallPropertySelectionChanged() {
  cadToolbarState.tipoParete = cadText(cadPropTipoParete?.value);
  cadToolbarState.confineParete = cadText(cadPropConfineParete?.value);

  cadRefreshToolbarControls();

  if (cadFindSourceLine(cadSelectedLineId))
    cadCommitToolbarToSelectedLine();
  else
    cadSetStatus(`Piano ${cadCurrentPlane()} · valori correnti aggiornati per ＋ Nuova parete`);
}

function cadPlaneRecord(planeName = cadCurrentPlane()) {
  return cadFindRecord(cadArchiveRecords('Piani'), 'Nome', planeName);
}

function cadPlaneIsCoverage(planeName = cadCurrentPlane()) {
  return cadText(cadPlaneRecord(planeName)?.Tipo).toLowerCase() === 'copertura';
}

function cadUniquePlaneToken(field, base) {
  const used = new Set(
    cadArchiveRecords('Piani')
      .map(record => cadText(record?.[field]).toLowerCase())
      .filter(Boolean)
  );

  let candidate = base;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = base + ' ' + index;
    index++;
  }
  return candidate;
}

function cadStyleCoverageBackground(image) {
  if (!image) return;
  image.setAttribute('data-termodel-copertura-riferimento', '1');
  image.setAttribute('opacity', '0.42');

  const oldStyle = cadText(image.getAttribute('style'))
    .replace(/(?:^|;)\s*filter\s*:[^;]*/ig, '')
    .replace(/(?:^|;)\s*opacity\s*:[^;]*/ig, '')
    .replace(/^;+|;+$/g, '');

  image.setAttribute(
    'style',
    (oldStyle ? oldStyle + ';' : '') + 'filter:grayscale(1);opacity:0.42'
  );
}

function cadDuplicateBackgroundToPlane(sourcePlane, targetPlane, targetLayer) {
  const source = cadPlaneBackground(cadWorkingDoc, sourcePlane);
  if (!source) return false;

  const group = cadBackgroundContainer(cadWorkingDoc, true);
  const clone = source.cloneNode(true);
  clone.setAttribute('data-termodel-piano', targetPlane);
  clone.setAttribute('data-termodel-layer', targetLayer);
  clone.removeAttribute('data-termodel-background-id');
  cadStyleCoverageBackground(clone);
  group.appendChild(clone);
  return true;
}

function cadCreateInputDrawingBackgroundToPlane(sourcePlane, targetPlane, targetLayer) {
  if (!cadWorkingDoc || cadPlaneBackground(cadWorkingDoc, sourcePlane))
    return false;

  const sourceSvg = cadSerializeCurrentPlaneSvg();
  if (!sourceSvg.trim()) return false;

  const sourceDoc = new DOMParser().parseFromString(sourceSvg, 'image/svg+xml');
  if (sourceDoc.querySelector('parsererror')) return false;

  // Lo sfondo di fallback deve essere una fotografia vettoriale del DisegnoInput,
  // non una seconda geometria tecnica. Elimina quindi accessori locali (Nord,
  // contenitore sfondi, ecc.) dalla copia SVG incorporata.
  Array.from(sourceDoc.querySelectorAll('[data-termodel-accessorio]'))
    .forEach(element => element.remove());

  const sourceGroup = cadCalpestabile(sourceDoc);
  const hasDrawing = Array.from(sourceGroup?.children || []).some(element =>
    element.localName === 'line' || element.localName === 'text'
  );
  if (!hasDrawing) return false;

  const viewBox =
    cadParseViewBox(sourceDoc.documentElement.getAttribute('viewBox')) ||
    cadGeometryViewBox(cadWorkingDoc, sourcePlane);
  if (!viewBox) return false;

  sourceDoc.documentElement.setAttribute('viewBox', cadFormatViewBox(viewBox));
  const svgText = new XMLSerializer().serializeToString(sourceDoc.documentElement);
  const dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);

  const group = cadBackgroundContainer(cadWorkingDoc, true);
  const image = cadWorkingDoc.createElementNS(SVG_NS, 'image');
  image.setAttribute('data-termodel-sfondo', '1');
  image.setAttribute('data-termodel-piano', targetPlane);
  image.setAttribute('data-termodel-layer', targetLayer);
  image.setAttribute('data-termodel-sfondo-tipo', 'vector');
  image.setAttribute('data-termodel-nome-file', 'DisegnoInput · ' + sourcePlane);
  image.setAttribute('data-termodel-sorgente', 'DisegnoInput');
  image.setAttribute('x', String(viewBox[0]));
  image.setAttribute('y', String(viewBox[1]));
  image.setAttribute('width', String(viewBox[2]));
  image.setAttribute('height', String(viewBox[3]));
  image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  image.setAttribute('opacity', '0.72');
  image.setAttribute('href', dataUrl);
  group.appendChild(image);
  return true;
}

function cadCreateCoveragePlane() {
  if (!structuredProjectActive || !cadWorkingDoc) {
    cadSetStatus('Crea o apri prima un progetto Termodel.', 'error');
    return;
  }

  if (cadToolMode === 'line') cadCancelNewLine();
  if (cadToolMode === 'symbol') cadCancelSymbolInsert();
  if (cadToolMode === 'window2') cadCancelWindowTwoPoint();

  const sourcePlane = cadCurrentPlane();
  const sourceRecord = cadPlaneRecord(sourcePlane);
  if (!sourceRecord) {
    cadSetStatus('Piano corrente non trovato nell\'archivio Piani.', 'error');
    return;
  }

  // Prima di cambiare piano rende esplicita l'appartenenza delle entità legacy
  // al piano sorgente, così il payload multipiano può separarle senza ambiguità.
  cadNormalizePlaneAssignments();

  const name = cadUniquePlaneToken('Nome', 'Copertura');
  const layer = cadUniquePlaneToken('LayerCad', 'Copertura');
  const fileName = cadText(sourceRecord.NomeFile) || 'DisegnoInput';

  let added;
  try {
    added = addArchivioWebRecord('Piani', {
      Nome: name,
      Tipo: 'Copertura',
      NomeFile: fileName,
      LayerCad: layer
    });
  } catch (error) {
    cadSetStatus('Impossibile creare il piano Copertura: ' + error.message, 'error');
    return;
  }

  const targetPlane = cadText(added.Nome) || name;
  const targetLayer = cadText(added.LayerCad) || layer;

  let backgroundMode = 'none';
  if (cadDuplicateBackgroundToPlane(sourcePlane, targetPlane, targetLayer)) {
    backgroundMode = 'duplicated';
  } else if (cadCreateInputDrawingBackgroundToPlane(
    sourcePlane,
    targetPlane,
    targetLayer
  )) {
    backgroundMode = 'input';
  }

  cadToolbarState.piano = targetPlane;
  cadSelectedLineId = '';
  cadSelectedSymbolId = '';
  cadDragState = null;
  cadCleanPlanByPlane.delete(cadToolbarState.piano);
  cadGeneratedPlanByPlane.delete(cadToolbarState.piano);
  cadRestorePlanePreview();
  cadRefreshToolbarControls();
  renderCadComparison();
  cadUpdatePropertiesPanel();
  cadUpdateControls();

  cadSetStatus(
    '✓ Creato piano ' + cadToolbarState.piano +
    ' · Tipo Copertura · Layer ' + targetLayer +
    (backgroundMode === 'duplicated'
      ? ' · sfondo duplicato dal piano ' + sourcePlane
      : backgroundMode === 'input'
        ? ' · DisegnoInput del piano ' + sourcePlane + ' usato come sfondo vettoriale'
        : ' · nessuno sfondo o DisegnoInput utilizzabile'),
    'dirty'
  );
}

function cadCurrentNetworkLabel() {
  const record = cadFindRecord(cadArchiveRecords('Reti'), 'Codice', cadToolbarState.rete);
  if (!record) return cadText(cadToolbarState.rete);
  const codice = cadText(record.Codice);
  const descrizione = cadText(record.Descrizione);
  return descrizione ? codice + ' — ' + descrizione : codice;
}

function cadModeChanged() {
  if (cadToolMode === 'line') cadCancelNewLine();
  if (cadToolMode === 'symbol') cadCancelSymbolInsert();
  if (cadToolMode === 'window2') cadCancelWindowTwoPoint();
  cadSelectedLineId = '';
  cadSelectedSymbolId = '';

  cadToolbarState.modalita = cadModeSelect?.value === 'rete' ? 'rete' : 'edificio';
  cadRefreshToolbarControls();
  cadUpdatePropertiesPanel();
  cadUpdateControls();

  if (cadToolbarState.modalita === 'rete') {
    const rete = cadCurrentNetworkLabel();
    cadSetStatus(
      rete
        ? 'Modalità Rete · ' + rete + ' · Piano ' + cadCurrentPlane()
        : 'Modalità Rete · nessuna rete definita · Piano ' + cadCurrentPlane(),
      rete ? '' : 'error'
    );
  } else {
    cadSetStatus('Modalità Edificio · Piano ' + cadCurrentPlane());
  }
}

function cadNetworkChanged() {
  if (cadToolMode === 'line') cadCancelNewLine();
  cadToolbarState.rete = cadText(cadNetworkSelect?.value);
  cadRefreshToolbarControls();
  cadUpdateControls();
  const rete = cadCurrentNetworkLabel();
  cadSetStatus(
    rete
      ? 'Rete corrente: ' + rete + ' · Piano ' + cadCurrentPlane()
      : 'Modalità Rete · nessuna rete definita · Piano ' + cadCurrentPlane(),
    rete ? '' : 'error'
  );
}

function cadCurrentPlaneChanged() {
  const requested = cadText(cadPropPiano?.value);
  if (!requested || requested === cadCurrentPlane()) {
    cadRefreshToolbarControls();
    return;
  }

  if (cadToolMode === 'line')
    cadCancelNewLine();
  if (cadToolMode === 'symbol')
    cadCancelSymbolInsert();
  if (cadToolMode === 'window2')
    cadCancelWindowTwoPoint();

  cadCloseNorthPanel(false);
  cadToolbarState.piano = requested;
  cadSelectedLineId = '';
  cadSelectedSymbolId = '';
  cadDragState = null;
  cadRestorePlanePreview();
  cadRefreshToolbarControls();
  renderCadComparison();

  const derived = cadDerivedToolbarValues();
  cadSetStatus(
    `Piano corrente: ${requested}${derived.layer ? ` · Layer ${derived.layer}` : ''}`
  );
}

function cadApplyProperties() {
  cadWallPropertySelectionChanged();
}

function cadSetMobilePropertiesOpen(open) {
  if (!cadPage || !cadMobilePropertiesToggle) return;
  const next = Boolean(open);
  cadPage.classList.toggle('mobile-properties-open', next);
  cadMobilePropertiesToggle.classList.toggle('active', next);
  cadMobilePropertiesToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
  cadMobilePropertiesToggle.textContent = next ? '× Dati' : '▤ Dati';
}

function cadToggleMobileProperties() {
  cadSetMobilePropertiesOpen(
    !cadPage?.classList.contains('mobile-properties-open')
  );
}

function cadSetStatus(message, kind = '') {
  if (!cadEditStatus) return;
  const text = String(message ?? '');
  cadEditStatus.textContent = text;
  // La toolbar deve restare stabile anche con feedback diagnostici molto lunghi
  // (es. import DXF). Il CSS tronca visivamente con ellissi; il testo completo
  // resta disponibile passando il mouse sullo status.
  cadEditStatus.title = text;
  cadEditStatus.classList.remove('dirty', 'error');
  if (kind) cadEditStatus.classList.add(kind);
}

function cadIsDirty() {
  if (!cadWorkingDoc) return false;
  return cadSerializeWorkingSvg() !== cadCommittedSvg;
}

function cadUpdateControls() {
  const hasDoc = !!cadWorkingDoc;
  const selected = !!cadFindSelectableLine(cadSelectedLineId);
  const selectedSymbol = cadFindSourceSymbol(cadSelectedSymbolId);
  const dirty = cadIsDirty();
  const drawingLine = cadToolMode === 'line';
  const insertingSymbol = cadToolMode === 'symbol';
  const drawingWindowTwoPoint = cadToolMode === 'window2';
  const busy = drawingLine || insertingSymbol || drawingWindowTwoPoint;
  const coverage = cadPlaneIsCoverage();
  const networkMode = cadToolbarState.modalita === 'rete';

  if (cadNewLineType) cadNewLineType.hidden = networkMode;
  if (cadEntitySeparator) cadEntitySeparator.hidden = networkMode;
  if (cadInsertAlign) cadInsertAlign.hidden = networkMode;
  if (cadInsertOpening) cadInsertOpening.hidden = networkMode || coverage;
  if (cadInsertOpeningTwoPoint) cadInsertOpeningTwoPoint.hidden = networkMode || coverage;
  if (cadInsertBridge) cadInsertBridge.hidden = networkMode || coverage;
  if (cadInsertRoom) cadInsertRoom.hidden = networkMode;
  if (cadInsertRidge) cadInsertRidge.hidden = networkMode || !coverage;

  if (cadMobilePropertiesToggle)
    cadMobilePropertiesToggle.disabled = !hasDoc;
  if (cadAddBackground) cadAddBackground.disabled = !hasDoc || busy;
  if (cadLoadGeneratedExecutive)
    cadLoadGeneratedExecutive.disabled =
      !hasDoc || busy || !currentProjectId || !currentServiceManifest || loading;
  const hasGeneratedExecutive = cadGeneratedExecutiveAvailable();
  if (cadShowGeneratedExecutive) {
    cadShowGeneratedExecutive.disabled = !hasDoc || !hasGeneratedExecutive;
    if (!hasGeneratedExecutive) cadShowGeneratedExecutive.checked = false;
  }
  if (cadAddRoofPlane) cadAddRoofPlane.disabled = !hasDoc || busy;
  if (cadShowBackground)
    cadShowBackground.disabled = !hasDoc || !cadPlaneBackground(cadWorkingDoc, cadCurrentPlane());
  if (cadSnapBackground)
    cadSnapBackground.disabled = !hasDoc || !cadVectorPlaneBackground();
  if (cadUndo) cadUndo.disabled = !cadUndoStack.length || busy;
  if (cadRedo) cadRedo.disabled = !cadRedoStack.length || busy;
  if (cadDelete) {
    cadDelete.disabled = !selected || busy;
    cadDelete.title = networkMode
      ? 'Elimina il tubo selezionato'
      : 'Elimina la parete selezionata';
  }
  if (cadRegenerate) {
    cadRegenerate.disabled = !hasDoc || !dirty || busy;
    cadRegenerate.textContent = networkMode ? '⟳ Consolida rete' : '⟳ Rigenera pianta';
  }
  if (cadNewLine) {
    cadNewLine.disabled = !hasDoc;
    cadNewLine.classList.toggle('active', drawingLine);
    cadNewLine.textContent = drawingLine
      ? '× Interrompi sequenza'
      : (networkMode
          ? '＋ Tubo'
          : (coverage ? '＋ Linea perimetro falde' : '＋ Nuova parete'));
    cadNewLine.title = networkMode
      ? 'Disegna tubi in sequenza sulla rete selezionata'
      : 'Clicca il punto iniziale e poi i punti successivi';
  }
  [[cadInsertAlign,'ALLINEA'],[cadInsertOpening,'FIN'],[cadInsertBridge,'PON'],[cadInsertRoom,'LOC'],[cadInsertRidge,'COLMO']].forEach(pair => {
    const button = pair[0];
    const type = pair[1];
    if (!button) return;
    const active = insertingSymbol && cadSymbolInsertType === type;
    button.disabled = !hasDoc;
    button.classList.toggle('active', active);
    button.textContent = active
      ? (type === 'FIN' ? '× Interrompi sequenza' : '× ' + cadSymbolInsertLabel(type))
      : '＋ ' + cadSymbolInsertLabel(type);
  });
  if (cadInsertOpeningTwoPoint) {
    cadInsertOpeningTwoPoint.disabled = !hasDoc;
    cadInsertOpeningTwoPoint.classList.toggle('active', drawingWindowTwoPoint);
    cadInsertOpeningTwoPoint.textContent = drawingWindowTwoPoint
      ? '× Interrompi sequenza'
      : '＋ Finestra 2 punti';
  }
  if (cadCanvas) {
    cadCanvas.classList.toggle('symbol-insert-mode', insertingSymbol || drawingWindowTwoPoint);
    cadCanvas.classList.toggle('wall-insert-mode', drawingLine);
  }
  if (cadNewLineType) cadNewLineType.disabled = !hasDoc || busy;
  if (cadExportArchitectural) cadExportArchitectural.disabled = !lastGeneratedPlan || dirty || busy;

  // Un errore geometrico del Service rimane prioritario nello status CAD:
  // la selezione di una parete e i refresh della toolbar non lo cancellano.
  if (cadServiceGeometryErrorState)
    cadSetStatus(cadFormatServiceGeometryError(cadServiceGeometryErrorState), 'error');
  else if (!hasDoc) cadSetStatus('Genera prima una pianta');
  else if (drawingLine) {
    const tipo = (cadNewLineType?.value || 'W').toUpperCase();
    const lineLabel = networkMode
      ? ('Tubo · Rete ' + (cadNewLineState?.rete || cadToolbarState.rete))
      : (coverage ? 'Linea perimetro falde' : ('Parete ' + tipo));
    cadSetStatus(cadNewLineState
      ? ('Piano ' + cadCurrentPlane() + ' · ' + lineLabel + ' · clicca il punto successivo · tasto destro per interrompere')
      : ('Piano ' + cadCurrentPlane() + ' · ' + lineLabel + ' · clicca il punto iniziale'));
  } else if (drawingWindowTwoPoint) {
    cadSetStatus(
      cadWindowTwoPointState
        ? ('Finestra 2 punti · clicca il secondo punto sulla stessa parete ' + cadWindowTwoPointState.wallLineId + ' · Esc o tasto destro per interrompere')
        : ('Finestra 2 punti · clicca il primo punto vicino a una parete · Esc o tasto destro per interrompere')
    );
  } else if (insertingSymbol) {
    const needsWall = cadSymbolInsertType === 'FIN' || cadSymbolInsertType === 'PON' || cadSymbolInsertType === 'COLMO';
    cadSetStatus(
      'Piano ' + cadCurrentPlane() +
      ' · Layer ' + cadCurrentLayer() +
      ' · ' + cadSymbolInsertLabel(cadSymbolInsertType) +
      (needsWall ? ' · clicca vicino a una parete' : ' · clicca il punto di inserimento') +
      (cadSymbolInsertType === 'FIN' ? ' · Esc o tasto destro per interrompere' : '')
    );
  } else if (dirty) {
    cadSetStatus(
      cadSelectedSymbolId
        ? (cadSelectedSymbolId + ' · simbolo selezionato · modifica non rigenerata')
        : (cadSelectedLineId ? (cadSelectedLineId + ' · modifica non rigenerata') : 'Modifica non rigenerata'),
      'dirty'
    );
  } else if (selectedSymbol) {
    cadSetStatus(cadSelectedSymbolId + ' · ' + cadSymbolInsertLabel(cadSymbolBlockType(selectedSymbol)) + ' selezionato');
  } else if (selected) {
    const line = cadFindSelectableLine(cadSelectedLineId);
    const p1 = cadLinePoint(line, 1);
    const p2 = cadLinePoint(line, 2);
    const entityLabel = cadIsPipeLine(line) ? 'Tubo' : 'Parete';
    cadSetStatus(entityLabel + ' ' + cadSelectedLineId + ' · (' + p1[0].toFixed(1) + ', ' + p1[1].toFixed(1) + ') → (' + p2[0].toFixed(1) + ', ' + p2[1].toFixed(1) + ')');
  } else {
    cadSetStatus('Piano ' + cadCurrentPlane() + ' · Layer ' + cadCurrentLayer() + ' · seleziona una parete o inserisci una nuova entità');
  }
}
function cadSetWorkingSvg(svgText) {
  cadWorkingDoc = cadParseSvg(svgText);
  cadToolbarState = cadDefaultToolbarState();
  cadCleanPlanByPlane = new Map();
  cadGeneratedPlanByPlane = new Map();

  cadSyncNorthFromWorkingDoc();
  const normalized = cadNormalizePlaneAssignments();
  const current = cadCurrentPlane();
  if (lastCleanPlanSvg) cadCleanPlanByPlane.set(current, lastCleanPlanSvg);
  if (lastGeneratedPlan) cadGeneratedPlanByPlane.set(current, lastGeneratedPlan);

  cadCommittedSvg = cadSerializeWorkingSvg();
  cadSelectedLineId = '';
  cadSelectedSymbolId = '';
  cadUndoStack = [];
  cadRedoStack = [];
  cadDragState = null;
  cadViewportBase = null;
  cadViewport = null;
  cadPanState = null;
  cadCalibrationLineId = '';
  cadCanvas?.classList.remove('pan-mode');
  cadToolMode = 'select';
  cadNewLineState = null;
  cadSymbolInsertType = '';
  cadCloseNorthPanel(false);
  cadSetMobilePropertiesOpen(false);

  if (normalized)
    console.info(`CAD multipiano: assegnate ${normalized} entità legacy al piano "${current}".`);

  cadUpdatePropertiesPanel();
  cadUpdateControls();
}

function cadPointDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function cadNearestPointOnSegment(point, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-12) return a.slice();
  let t = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * vx, a[1] + t * vy];
}

function cadSnapMode() {
  return cadSnapEndpoint?.checked ? 'endpoint' : 'near';
}

function cadSnapLabel(result) {
  if (!result?.snapped) return '';
  if (result.snapSource === 'background') return 'SNAP SFONDO';
  return result.snapMode === 'endpoint' ? 'SNAP ESTREMO' : 'SNAP VICINO';
}

function cadSnapPoint(point, movingLineId) {
  const mode = cadSnapMode();
  let best = point;
  let bestDistance = CAD_SNAP_DISTANCE + 1;
  let bestLineId = '';
  let bestSource = '';

  const snapLines = cadSnapSourceLines();
  const snapEntitySource = cadToolbarState?.modalita === 'rete' ? 'pipe' : 'wall';

  snapLines.forEach(line => {
    if (line.id === movingLineId) return;
    const a = cadLinePoint(line, 1);
    const b = cadLinePoint(line, 2);

    if (mode === 'endpoint') {
      for (const candidate of [a, b]) {
        const distance = cadPointDistance(point, candidate);
        if (distance < bestDistance) {
          best = candidate.slice();
          bestDistance = distance;
          bestLineId = line.id || '';
          bestSource = snapEntitySource;
        }
      }
      return;
    }

    const projected = cadNearestPointOnSegment(point, a, b);
    const segmentDistance = cadPointDistance(point, projected);
    if (segmentDistance < bestDistance) {
      best = projected;
      bestDistance = segmentDistance;
      bestLineId = line.id || '';
      bestSource = snapEntitySource;
    }
  });

  cadBackgroundSnapCandidates(point).forEach(candidate => {
    const distance = cadPointDistance(point, candidate);
    if (distance < bestDistance) {
      best = candidate.slice();
      bestDistance = distance;
      bestLineId = '';
      bestSource = 'background';
    }
  });

  const snapped = bestDistance <= CAD_SNAP_DISTANCE;
  return {
    point: snapped ? best : point,
    snapped,
    targetLineId: snapped && (bestSource === 'wall' || bestSource === 'pipe') ? bestLineId : '',
    snapMode: mode,
    snapSource: snapped ? bestSource : ''
  };
}

function cadOrthoPoint(point, start) {
  const dx = point[0] - start[0];
  const dy = point[1] - start[1];

  // La direzione dominante decide automaticamente orizzontale/verticale.
  return Math.abs(dx) >= Math.abs(dy)
    ? [point[0], start[1]]
    : [start[0], point[1]];
}

function cadNewLineTargetPoint(rawPoint) {
  // Il primo punto continua a usare il normale Snap.
  if (!cadNewLineState || cadOrtho?.checked !== true) {
    const snapped = cadSnapPoint(rawPoint, '');
    return { ...snapped, ortho: false };
  }

  const start = cadNewLineState.start;
  const constrained = cadOrthoPoint(rawPoint, start);
  const snapped = cadSnapPoint(constrained, '');

  // Snap e Orto convivono solo se il punto agganciato rispetta davvero
  // lo stesso asse ortogonale. In caso contrario prevale Orto.
  if (snapped.snapped) {
    const snappedOrtho = cadOrthoPoint(snapped.point, start);
    if (cadPointDistance(snapped.point, snappedOrtho) <= CAD_JOIN_EPSILON) {
      return {
        point: snapped.point,
        snapped: true,
        ortho: true,
        targetLineId: snapped.targetLineId || '',
        snapMode: snapped.snapMode || cadSnapMode()
      };
    }
  }

  return { point: constrained, snapped: false, ortho: true, targetLineId: '', snapMode: cadSnapMode() };
}

function cadConnectedEndpointRefs(point) {
  const refs = [];
  cadEditableSourceLines().forEach(line => {
    [1, 2].forEach(endpoint => {
      const current = cadLinePoint(line, endpoint);
      if (cadPointDistance(current, point) <= CAD_JOIN_EPSILON) {
        refs.push({
          line,
          endpoint,
          x: current[0],
          y: current[1]
        });
      }
    });
  });
  return refs;
}

function cadNextLineId(prefix) {
  const p = String(prefix || 'W').toUpperCase();
  let max = 0;
  const used = new Set();

  Array.from(cadWorkingDoc?.querySelectorAll?.('line[id]') || []).forEach(line => {
    used.add(line.id);
    const match = new RegExp('^' + p + '(\\d+)$', 'i').exec(line.id || '');
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });

  let n = max + 1;
  let id = p + String(n).padStart(3, '0');
  while (used.has(id)) {
    n++;
    id = p + String(n).padStart(3, '0');
  }
  return id;
}
function cadHideContextMenu() {
  if (cadContextMenu) cadContextMenu.hidden = true;
}

function cadCanCloseWallSequence() {
  return cadToolMode === 'line' &&
    !!cadNewLineState?.sequenceStart &&
    !!cadNewLineState?.firstLineId &&
    Number(cadNewLineState?.segmentCount || 0) >= 3;
}

function cadPositionContextMenu(event, height) {
  if (!cadContextMenu) return;
  const width = 180;
  cadContextMenu.style.left = Math.max(0, Math.min(event.clientX, window.innerWidth - width - 4)) + 'px';
  cadContextMenu.style.top = Math.max(0, Math.min(event.clientY, window.innerHeight - height - 4)) + 'px';
  cadContextMenu.hidden = false;
}

function cadStartExtendTrim() {
  cadHideContextMenu();
  const source = cadFindSourceLine(cadSelectedLineId);
  if (!source || !/^[EW]/i.test(source.id || '') || !cadEntityBelongsToCurrentPlane(source)) {
    cadSetStatus('Estendi/Taglia: seleziona prima una parete E/W.', 'error');
    return;
  }
  cadExtendTrimSourceId = source.id;
  cadSetStatus('Estendi/Taglia ' + source.id + ': seleziona una seconda parete di riferimento. Esc annulla.');
}

function cadApplyExtendTrim(targetId) {
  const sourceId = cadExtendTrimSourceId;
  const source = cadFindSourceLine(sourceId);
  const target = cadFindSourceLine(targetId);
  // La seconda selezione termina sempre il comando, anche in caso di errore.
  cadExtendTrimSourceId = '';
  if (!source || !target || source === target ||
      !/^[EW]/i.test(target.id || '') ||
      !cadEntityBelongsToCurrentPlane(source) || !cadEntityBelongsToCurrentPlane(target)) {
    cadSetStatus('Estendi/Taglia impossibile: scegli due pareti E/W distinte dello stesso piano.', 'error');
    return;
  }

  const a = cadLinePoint(source, 1), b = cadLinePoint(source, 2);
  const c = cadLinePoint(target, 1), d = cadLinePoint(target, 2);
  const ax = b[0] - a[0], ay = b[1] - a[1];
  const bx = d[0] - c[0], by = d[1] - c[1];
  const cross = ax * by - ay * bx;
  const lengthA = Math.hypot(ax, ay), lengthB = Math.hypot(bx, by);
  if (!lengthA || !lengthB || Math.abs(cross) < 1e-8 * lengthA * lengthB) {
    cadSetStatus('Estendi/Taglia impossibile: linee parallele o coincidenti.', 'error');
    return;
  }

  const dx = c[0] - a[0], dy = c[1] - a[1];
  const t = (dx * by - dy * bx) / cross;
  const u = (dx * ay - dy * ax) / cross;
  const tolerance = 0.001;
  if (!Number.isFinite(t) || !Number.isFinite(u) || u < -tolerance || u > 1 + tolerance) {
    cadSetStatus('Estendi/Taglia impossibile: le linee non si incontrano sul segmento di riferimento.', 'error');
    return;
  }

  const point = [a[0] + t * ax, a[1] + t * ay];
  const endpoint = Math.abs(t) <= Math.abs(1 - t) ? 1 : 2;
  const opposite = endpoint === 1 ? b : a;
  const newLength = Math.hypot(point[0] - opposite[0], point[1] - opposite[1]);
  if (!Number.isFinite(newLength) || newLength < 0.05) {
    cadSetStatus('Estendi/Taglia impossibile: la parete risulterebbe nulla.', 'error');
    return;
  }
  if (Math.hypot(point[0] - (endpoint === 1 ? a[0] : b[0]),
                  point[1] - (endpoint === 1 ? a[1] : b[1])) < 0.001) {
    cadSetStatus('Estendi/Taglia: la parete raggiunge già il riferimento.');
    return;
  }
  const before = cadSerializeWorkingSvg();
  cadSetLinePoint(source, endpoint, point[0], point[1]);
  cadUndoStack.push(before);
  cadRedoStack = [];
  cadSelectedLineId = sourceId;
  renderCadComparison();
  cadSetStatus(sourceId + ' · ' + (t >= 0 && t <= 1 ? 'tagliata' : 'estesa') +
    ' fino a ' + targetId + ' · modifica non rigenerata', 'dirty');
}

function cadShowIdleContextMenu(event) {
  if (!cadContextMenu || cadToolMode !== 'select') return;
  if (cadRepeatLastCommand) {
    cadRepeatLastCommand.hidden = false;
    cadRepeatLastCommand.disabled = !cadLastRepeatableCommand;
  }
  if (cadCloseSequence) cadCloseSequence.hidden = true;
  if (cadCloseOrthogonalSequence) cadCloseOrthogonalSequence.hidden = true;
  if (cadStopSequence) cadStopSequence.hidden = true;
  const selectedWall = cadFindSourceLine(cadSelectedLineId);
  const canExtendTrim = !!selectedWall && /^[EW]/i.test(selectedWall.id || '') && cadEntityBelongsToCurrentPlane(selectedWall);
  if (cadExtendTrim) cadExtendTrim.hidden = !canExtendTrim;
  cadPositionContextMenu(event, canExtendTrim ? 72 : 36);
}

function cadShowLineContextMenu(event) {
  if (!cadContextMenu || cadToolMode !== 'line') return;
  if (cadExtendTrim) cadExtendTrim.hidden = true;
  const canClose = cadCanCloseWallSequence();
  const pipeMode = cadToolbarState.modalita === 'rete';
  if (cadRepeatLastCommand) cadRepeatLastCommand.hidden = true;
  if (cadCloseSequence) cadCloseSequence.hidden = !canClose;
  if (cadCloseOrthogonalSequence)
    cadCloseOrthogonalSequence.hidden = pipeMode || !canClose;
  if (cadStopSequence) cadStopSequence.hidden = false;
  cadPositionContextMenu(event, canClose ? (pipeMode ? 72 : 108) : 36);
}

function cadShowWindowSequenceContextMenu(event) {
  if (cadExtendTrim) cadExtendTrim.hidden = true;
  const activeWindowSequence =
    (cadToolMode === 'symbol' && cadSymbolInsertType === 'FIN') ||
    cadToolMode === 'window2';
  if (!cadContextMenu || !activeWindowSequence) return;
  if (cadRepeatLastCommand) cadRepeatLastCommand.hidden = true;
  if (cadCloseSequence) cadCloseSequence.hidden = true;
  if (cadCloseOrthogonalSequence) cadCloseOrthogonalSequence.hidden = true;
  if (cadStopSequence) cadStopSequence.hidden = false;
  cadPositionContextMenu(event, 36);
}

function cadCancelNewLine(svg = cadCanvas?.querySelector('svg')) {
  cadHideContextMenu();
  cadToolMode = 'select';
  cadNewLineState = null;
  if (svg) {
    svg.querySelector('#cadNewLinePreviewLayer')?.remove();
    cadSyncOverlay(svg);
  }
  cadUpdateControls();
}

function cadToggleNewLine() {
  if (!cadWorkingDoc) return;

  if (cadToolbarState.modalita === 'rete' && !cadText(cadToolbarState.rete)) {
    cadSetStatus('Modalità Rete: seleziona prima una rete nell\'archivio Reti.', 'error');
    return;
  }

  if (cadToolMode === 'window2') cadCancelWindowTwoPoint();

  if (cadToolMode === 'line') {
    cadCancelNewLine();
    return;
  }

  cadLastRepeatableCommand = 'line';
  cadCloseNorthPanel(false);
  cadSymbolInsertType = '';
  cadToolMode = 'line';
  cadNewLineState = null;
  cadSelectedLineId = '';
  cadEnsureToolbarState();
  const svg = cadCanvas?.querySelector('svg');
  if (svg) cadSyncOverlay(svg);
  cadUpdatePropertiesPanel();
  cadUpdateControls();
}

function cadRepeatLastCadCommand() {
  if (cadToolMode !== 'select' || !cadLastRepeatableCommand) return;

  cadHideContextMenu();

  if (cadLastRepeatableCommand === 'line') {
    cadToggleNewLine();
    return;
  }

  if (cadLastRepeatableCommand === 'window2') {
    cadToggleWindowTwoPoint();
    return;
  }

  const match = /^symbol:(ALLINEA|FIN|PON|LOC|COLMO)$/.exec(cadLastRepeatableCommand);
  if (match) cadToggleSymbolInsert(match[1]);
}

function cadRenderNewLineFirstPointPreview(svg, rawPoint) {
  svg.querySelector('#cadNewLinePreviewLayer')?.remove();
  if (cadToolMode !== 'line' || cadNewLineState) return { point: rawPoint, snapped: false };

  const snapped = cadSnapPoint(rawPoint, '');
  if (!snapped.snapped) return snapped;

  const layer = svgNode('g', {
    id: 'cadNewLinePreviewLayer',
    'pointer-events': 'none'
  });

  layer.appendChild(svgNode('circle', {
    cx: snapped.point[0],
    cy: snapped.point[1],
    r: 10,
    class: 'cad-snap-marker'
  }));

  svg.appendChild(layer);
  return snapped;
}

function cadRenderNewLinePreview(svg, currentPoint = null, snapped = false) {
  svg.querySelector('#cadNewLinePreviewLayer')?.remove();
  if (cadToolMode !== 'line' || !cadNewLineState) return;

  const layer = svgNode('g', {
    id: 'cadNewLinePreviewLayer',
    'pointer-events': 'none'
  });
  const [x1, y1] = cadNewLineState.start;

  layer.appendChild(svgNode('circle', {
    cx: x1, cy: y1, r: 7,
    class: 'cad-newline-start'
  }));

  if (currentPoint) {
    layer.appendChild(svgNode('line', {
      x1, y1,
      x2: currentPoint[0],
      y2: currentPoint[1],
      class: 'cad-newline-preview'
    }));

    if (snapped) {
      layer.appendChild(svgNode('circle', {
        cx: currentPoint[0],
        cy: currentPoint[1],
        r: 10,
        class: 'cad-snap-marker'
      }));
    }
  }

  svg.appendChild(layer);
}

function cadStartOrFinishNewLine(svg, rawPoint) {
  const snapped = cadNewLineTargetPoint(rawPoint);
  const point = snapped.point;

  const pipeMode = cadToolbarState.modalita === 'rete';

  if (!cadNewLineState) {
    cadNewLineState = {
      start: point.slice(),
      before: cadSerializeWorkingSvg(),
      sequenceStart: point.slice(),
      firstLineId: '',
      lastLineId: '',
      segmentCount: 0,
      kind: pipeMode ? 'pipe' : 'wall',
      rete: pipeMode ? cadToolbarState.rete : '',
      circuito: pipeMode
        ? cadNextPipeCircuitId(cadToolbarState.rete, cadCurrentPlane())
        : ''
    };
    cadRenderNewLinePreview(svg, point, snapped.snapped);
    const lineLabel = pipeMode
      ? ('Tubo · Rete ' + cadToolbarState.rete + ' · Circuito ' + cadNewLineState.circuito)
      : (cadPlaneIsCoverage() ? 'Linea perimetro falde' : ('Parete ' + (cadNewLineType?.value || 'W').toUpperCase()));
    cadSetStatus(
      `${lineLabel} · punto iniziale${snapped.snapped ? ' · ' + cadSnapLabel(snapped) : ''}${cadOrtho?.checked ? ' · ORTO' : ''} · clicca il punto successivo`
    );
    return;
  }

  if (cadPointDistance(cadNewLineState.start, point) < 0.5) {
    cadSetStatus(
      (cadNewLineState.kind === 'pipe' ? 'Il nuovo tubo' : 'La nuova parete') +
      ' deve avere una lunghezza maggiore di zero.',
      'error'
    );
    return;
  }

  const group = cadCalpestabile();
  if (!group) {
    cadSetStatus('Gruppo calpestabile non trovato nello SVG.', 'error');
    cadCancelNewLine(svg);
    return;
  }

  const previousLastLineId = cadNewLineState.lastLineId || '';
  const snapTargetLineId = snapped.targetLineId || '';
  const isPipeSequence = cadNewLineState.kind === 'pipe';
  const stopSequenceOnWallSnap =
    !isPipeSequence &&
    snapped.snapped &&
    !!snapTargetLineId &&
    snapTargetLineId !== previousLastLineId;

  const type = isPipeSequence
    ? 'T'
    : ((cadNewLineType?.value || 'W').toUpperCase() === 'E' ? 'E' : 'W');
  const id = cadNextLineId(type);
  const [x1, y1] = cadNewLineState.start;

  const line = cadWorkingDoc.createElementNS(SVG_NS, 'line');
  line.setAttribute('id', id);
  line.setAttribute('x1', Number(x1).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute('y1', Number(y1).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute('x2', Number(point[0]).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute('y2', Number(point[1]).toFixed(3).replace(/\.000$/, ''));
  cadEnsureToolbarState();
  if (isPipeSequence) {
    cadApplyPipeAttributes(line, {
      ...cadToolbarState,
      rete: cadNewLineState.rete || cadToolbarState.rete,
      circuito: cadNewLineState.circuito
    });
  } else {
    cadApplySemanticAttributes(line, cadToolbarState);
  }
  group.appendChild(line);

  cadUndoStack.push(cadNewLineState.before);
  cadRedoStack = [];
  cadSelectedLineId = isPipeSequence ? '' : id;

  const sequenceStart = cadNewLineState.sequenceStart?.slice() || [x1, y1];
  const firstLineId = cadNewLineState.firstLineId || id;
  const lastLineId = id;
  const segmentCount = Number(cadNewLineState.segmentCount || 0) + 1;

  // Se il nuovo segmento termina con Snap su una parete diversa
  // dall'ultima parete della sequenza, la connessione conclude la multilinea.
  if (stopSequenceOnWallSnap) {
    cadToolMode = 'select';
    cadNewLineState = null;
    renderCadComparison();
    cadUpdatePropertiesPanel();
    cadUpdateControls();
    cadSetStatus(
      `✓ ${id} creata${snapped.ortho ? ' · ORTO' : ''} · ${cadSnapLabel(snapped)} su ${snapTargetLineId} · sequenza terminata`,
      'dirty'
    );
    return;
  }

  // Modalità multilinea: il punto finale appena confermato diventa
  // automaticamente il punto iniziale del segmento successivo.
  // Manteniamo anche origine, prima parete e numero segmenti della sequenza.
  cadToolMode = 'line';
  cadNewLineState = {
    start: point.slice(),
    before: cadSerializeWorkingSvg(),
    sequenceStart,
    firstLineId,
    lastLineId,
    segmentCount,
    kind: isPipeSequence ? 'pipe' : 'wall',
    rete: isPipeSequence ? (cadNewLineState.rete || cadToolbarState.rete) : '',
    circuito: isPipeSequence ? cadNewLineState.circuito : ''
  };

  renderCadComparison();
  const nextSvg = cadCanvas?.querySelector('svg');
  if (nextSvg) cadRenderNewLinePreview(nextSvg, point, false);
  cadSetStatus(
    `✓ ${id} ${isPipeSequence ? 'Tubo' : 'creata'}${snapped.ortho ? ' · ORTO' : ''}${snapped.snapped ? ' · ' + cadSnapLabel(snapped) : ''} · continua dal punto finale · tasto destro per interrompere`,
    'dirty'
  );
}

function cadOrthogonalCloseCandidate(lastLine, start, sequenceStart) {
  if (!lastLine || !start || !sequenceStart) return null;

  const previousStart = cadLinePoint(lastLine, 1);
  const candidates = [
    {
      point: [sequenceStart[0], start[1]],
      axis: 'verticale',
      shift: Math.abs(start[0] - sequenceStart[0])
    },
    {
      point: [start[0], sequenceStart[1]],
      axis: 'orizzontale',
      shift: Math.abs(start[1] - sequenceStart[1])
    }
  ];

  return candidates
    .filter(candidate =>
      cadPointDistance(previousStart, candidate.point) >= 0.5 &&
      cadPointDistance(candidate.point, sequenceStart) >= 0.5
    )
    .sort((a, b) => a.shift - b.shift)[0] || null;
}

function cadCloseWallSequence(orthogonal = false) {
  if (!cadCanCloseWallSequence() || !cadWorkingDoc) return;

  const pipeMode = cadNewLineState?.kind === 'pipe';
  if (pipeMode && orthogonal) return;

  const group = cadCalpestabile();
  const firstLine = cadFindAnySourceLine(cadNewLineState.firstLineId);
  const lastLine = orthogonal
    ? cadFindAnySourceLine(cadNewLineState.lastLineId || cadSelectedLineId)
    : null;
  let start = cadNewLineState.start?.slice();
  const sequenceStart = cadNewLineState.sequenceStart?.slice();

  if (!group || !firstLine || !start || !sequenceStart || (orthogonal && !lastLine)) {
    cadSetStatus('Impossibile chiudere la sequenza pareti.', 'error');
    return;
  }

  cadHideContextMenu();

  // Se l'ultimo punto coincide già con l'origine non generiamo una parete nulla:
  // terminiamo semplicemente la sequenza.
  if (cadPointDistance(start, sequenceStart) < 0.5) {
    cadToolMode = 'select';
    cadNewLineState = null;
    renderCadComparison();
    cadUpdateControls();
    cadSetStatus('Sequenza pareti già chiusa.', 'dirty');
    return;
  }

  const before = cadSerializeWorkingSvg();
  let orthogonalAxis = '';

  if (orthogonal) {
    const candidate = cadOrthogonalCloseCandidate(lastLine, start, sequenceStart);
    if (!candidate) {
      cadSetStatus('Chiusura ortogonale impossibile senza annullare una parete.', 'error');
      return;
    }

    // Il vertice finale è condiviso: spostiamo insieme l'arrivo della
    // parete precedente e la partenza della parete di chiusura.
    const lastEnd = cadLinePoint(lastLine, 2);
    const lastStart = cadLinePoint(lastLine, 1);
    let endpoint = 0;
    if (cadPointDistance(lastEnd, start) <= CAD_JOIN_EPSILON) endpoint = 2;
    else if (cadPointDistance(lastStart, start) <= CAD_JOIN_EPSILON) endpoint = 1;

    if (!endpoint) {
      cadSetStatus('Chiusura ortogonale impossibile: ultimo vertice non riconosciuto.', 'error');
      return;
    }

    cadSetLinePoint(lastLine, endpoint, candidate.point[0], candidate.point[1]);
    cadNewLineState.start = candidate.point.slice();
    start = candidate.point.slice();
    orthogonalAxis = candidate.axis;
  }

  const type = pipeMode ? 'T' : (/^E/i.test(firstLine.id || '') ? 'E' : 'W');
  const id = cadNextLineId(type);
  const line = cadWorkingDoc.createElementNS(SVG_NS, 'line');
  line.setAttribute('id', id);
  line.setAttribute('x1', Number(start[0]).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute('y1', Number(start[1]).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute('x2', Number(sequenceStart[0]).toFixed(3).replace(/\.000$/, ''));
  line.setAttribute('y2', Number(sequenceStart[1]).toFixed(3).replace(/\.000$/, ''));

  if (pipeMode) {
    // Il tubo di chiusura conserva la stessa rete della sequenza e il layer
    // Desktop <NomePiano>_tubipannelli atteso da IoPannelli.LeggiTubiDXF.
    cadApplyPipeAttributes(line, {
      ...cadToolbarState,
      rete: cadText(firstLine.getAttribute('data-termodel-rete')) ||
        cadNewLineState.rete ||
        cadToolbarState.rete,
      circuito: cadText(firstLine.getAttribute('data-termodel-circuito')) ||
        cadNewLineState.circuito
    });
  } else {
    // La parete di chiusura eredita i dati semantici dalla prima parete.
    cadApplySemanticAttributes(line, cadStateFromLine(firstLine));
  }
  group.appendChild(line);

  cadUndoStack.push(before);
  cadRedoStack = [];
  cadSelectedLineId = id;
  cadToolMode = 'select';
  cadNewLineState = null;

  renderCadComparison();
  cadUpdateControls();
  cadSetStatus(
    orthogonal
      ? `✓ Sequenza chiusa ortogonalmente con ${id} · chiusura ${orthogonalAxis}`
      : `✓ Sequenza chiusa con ${id} · ultimo punto collegato all'inizio`,
    'dirty'
  );
}

function cadParseViewBox(value) {
  const values = String(value || '').trim().split(/[ ,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) ? values : null;
}

function cadViewBoxEqual(a, b, epsilon = 1e-6) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 4 && b.length === 4 &&
    a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}

function cadFormatViewBox(values) {
  return values.map(value => Number(value.toFixed(6))).join(' ');
}

function cadEnsureViewport(sourceViewBox) {
  const source = Array.isArray(sourceViewBox) ? sourceViewBox.slice() : null;
  if (!source || source.length !== 4) return null;

  if (!cadViewportBase || !cadViewport || !cadViewBoxEqual(cadViewportBase, source)) {
    cadViewportBase = source.slice();
    cadViewport = source.slice();
  }

  return cadViewport.slice();
}

function cadApplyViewport(svg, values) {
  if (!svg || !Array.isArray(values) || values.length !== 4) return;
  cadViewport = values.slice();
  svg.setAttribute('viewBox', cadFormatViewBox(cadViewport));
}

function cadZoomAtPointer(svg, event) {
  if (!svg) return;
  event.preventDefault();

  const current = cadViewport?.slice() || cadParseViewBox(svg.getAttribute('viewBox'));
  const base = cadViewportBase?.slice() || current?.slice();
  if (!current || !base || current[2] <= 0 || current[3] <= 0 || base[2] <= 0) return;

  const world = cadClientPoint(svg, event);
  const currentRatio = current[2] / base[2];
  const requestedFactor = Math.max(0.5, Math.min(2, Math.exp(event.deltaY * 0.0015)));
  const targetRatio = Math.max(0.02, Math.min(50, currentRatio * requestedFactor));
  const factor = targetRatio / currentRatio;

  if (Math.abs(factor - 1) < 1e-9) return;

  const nextWidth = current[2] * factor;
  const nextHeight = current[3] * factor;
  const relX = (world[0] - current[0]) / current[2];
  const relY = (world[1] - current[1]) / current[3];

  cadApplyViewport(svg, [
    world[0] - relX * nextWidth,
    world[1] - relY * nextHeight,
    nextWidth,
    nextHeight
  ]);
}

function cadStartPan(svg, event) {
  if (!svg || event.button !== 1 || cadDragState) return false;

  const current = cadViewport?.slice() || cadParseViewBox(svg.getAttribute('viewBox'));
  if (!current) return false;

  event.preventDefault();
  event.stopImmediatePropagation();

  cadPanState = {
    pointerId: event.pointerId,
    lastClientX: event.clientX,
    lastClientY: event.clientY
  };

  cadCanvas?.classList.add('pan-mode');
  if (svg.setPointerCapture) {
    try { svg.setPointerCapture(event.pointerId); } catch (_) {}
  }
  return true;
}

function cadMovePan(svg, event) {
  if (!cadPanState || cadPanState.pointerId !== event.pointerId) return false;

  event.preventDefault();

  const matrix = svg.getScreenCTM();
  if (!matrix) return true;
  const inverse = matrix.inverse();

  const dxClient = event.clientX - cadPanState.lastClientX;
  const dyClient = event.clientY - cadPanState.lastClientY;
  const dxWorld = inverse.a * dxClient + inverse.c * dyClient;
  const dyWorld = inverse.b * dxClient + inverse.d * dyClient;

  const current = cadViewport?.slice() || cadParseViewBox(svg.getAttribute('viewBox'));
  if (current) {
    current[0] -= dxWorld;
    current[1] -= dyWorld;
    cadApplyViewport(svg, current);
  }

  cadPanState.lastClientX = event.clientX;
  cadPanState.lastClientY = event.clientY;
  return true;
}

function cadFinishPan(svg, event) {
  if (!cadPanState || cadPanState.pointerId !== event.pointerId) return false;

  cadPanState = null;
  cadCanvas?.classList.remove('pan-mode');
  if (svg?.releasePointerCapture) {
    try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
  }
  return true;
}

function cadTouchCenter(points) {
  if (!points.length) return null;
  const sum = points.reduce(
    (acc, point) => [acc[0] + point.clientX, acc[1] + point.clientY],
    [0, 0]
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

function cadTouchDistance(points) {
  if (points.length < 2) return 0;
  return Math.hypot(
    points[1].clientX - points[0].clientX,
    points[1].clientY - points[0].clientY
  );
}

function cadPanViewportByClientDelta(svg, dxClient, dyClient) {
  if (!svg || (!dxClient && !dyClient)) return;

  const matrix = svg.getScreenCTM();
  if (!matrix) return;
  const inverse = matrix.inverse();
  const dxWorld = inverse.a * dxClient + inverse.c * dyClient;
  const dyWorld = inverse.b * dxClient + inverse.d * dyClient;
  const current = cadViewport?.slice() || cadParseViewBox(svg.getAttribute('viewBox'));
  if (!current) return;

  current[0] -= dxWorld;
  current[1] -= dyWorld;
  cadApplyViewport(svg, current);
}

function cadZoomViewportAtClient(svg, clientX, clientY, requestedFactor) {
  const current = cadViewport?.slice() || cadParseViewBox(svg.getAttribute('viewBox'));
  const base = cadViewportBase?.slice() || current?.slice();
  if (!current || !base || current[2] <= 0 || current[3] <= 0 || base[2] <= 0) return;

  const currentRatio = current[2] / base[2];
  const targetRatio = Math.max(0.02, Math.min(50, currentRatio * requestedFactor));
  const factor = targetRatio / currentRatio;
  if (Math.abs(factor - 1) < 1e-9) return;

  const world = cadClientPoint(svg, { clientX, clientY });
  const nextWidth = current[2] * factor;
  const nextHeight = current[3] * factor;
  const relX = (world[0] - current[0]) / current[2];
  const relY = (world[1] - current[1]) / current[3];

  cadApplyViewport(svg, [
    world[0] - relX * nextWidth,
    world[1] - relY * nextHeight,
    nextWidth,
    nextHeight
  ]);
}

function cadResetTouchGesture() {
  cadTouchPointers.clear();
  cadTouchGesture = null;
  cadCanvas?.classList.remove('pan-mode');
}

function cadRefreshTouchGesture() {
  const points = Array.from(cadTouchPointers.values()).slice(0, 2);
  if (!points.length) {
    cadTouchGesture = null;
    cadCanvas?.classList.remove('pan-mode');
    return;
  }

  cadTouchGesture = {
    center: cadTouchCenter(points),
    distance: cadTouchDistance(points)
  };
  cadCanvas?.classList.add('pan-mode');
}

function cadStartTouchNavigation(svg, event) {
  if (!TERMODEL_ANDROID_DEVICE || event.pointerType !== 'touch') return false;

  event.preventDefault();
  event.stopImmediatePropagation();

  cadTouchPointers.set(event.pointerId, {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY
  });

  if (svg.setPointerCapture) {
    try { svg.setPointerCapture(event.pointerId); } catch (_) {}
  }

  cadRefreshTouchGesture();
  return true;
}

function cadMoveTouchNavigation(svg, event) {
  if (!TERMODEL_ANDROID_DEVICE || event.pointerType !== 'touch') return false;
  if (!cadTouchPointers.has(event.pointerId)) return false;

  event.preventDefault();
  event.stopImmediatePropagation();

  cadTouchPointers.set(event.pointerId, {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY
  });

  const points = Array.from(cadTouchPointers.values()).slice(0, 2);
  const center = cadTouchCenter(points);
  if (!center) return true;

  const previous = cadTouchGesture;
  if (previous?.center) {
    cadPanViewportByClientDelta(
      svg,
      center[0] - previous.center[0],
      center[1] - previous.center[1]
    );
  }

  const distance = cadTouchDistance(points);
  if (points.length >= 2 && previous?.distance > 0 && distance > 0) {
    const factor = Math.max(0.5, Math.min(2, previous.distance / distance));
    cadZoomViewportAtClient(svg, center[0], center[1], factor);
  }

  cadTouchGesture = { center, distance };
  return true;
}

function cadFinishTouchNavigation(svg, event) {
  if (!TERMODEL_ANDROID_DEVICE || event.pointerType !== 'touch') return false;
  if (!cadTouchPointers.has(event.pointerId)) return false;

  event.preventDefault();
  event.stopImmediatePropagation();
  cadTouchPointers.delete(event.pointerId);

  if (svg?.releasePointerCapture) {
    try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
  }

  cadRefreshTouchGesture();
  return true;
}

function cadClientPoint(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return [0, 0];
  const local = point.matrixTransform(matrix.inverse());
  return [local.x, local.y];
}

function cadSelectLine(id, svg = cadCanvas?.querySelector('svg')) {
  cadSelectedLineId = cadFindSelectableLine(id) ? id : '';
  if (cadSelectedLineId) {
    cadSelectedSymbolId = '';
    cadCloseNorthPanel(false);
  }
  if (svg) cadSyncOverlay(svg);
  cadUpdatePropertiesPanel();
  cadUpdateControls();
}

function cadSelectSymbol(id, svg = cadCanvas?.querySelector('svg')) {
  cadSelectedSymbolId = cadFindSourceSymbol(id) ? id : '';
  if (cadSelectedSymbolId) {
    cadSelectedLineId = '';
    cadCloseNorthPanel(false);
  }
  if (svg) cadSyncOverlay(svg);
  cadUpdatePropertiesPanel();
  cadUpdateControls();
}

function cadRenderSelectionHandles(svg) {
  svg.querySelector('#cadHandlesLayer')?.remove();
  if (cadToolMode === 'line') return;
  const line = cadFindSourceLine(cadSelectedLineId);
  if (!line) return;

  const handles = svgNode('g', { id: 'cadHandlesLayer' });
  [1, 2].forEach(endpoint => {
    const [x, y] = cadLinePoint(line, endpoint);
    const handle = svgNode('circle', {
      cx: x,
      cy: y,
      r: 8,
      class: 'cad-handle',
      'data-cad-handle': endpoint
    });

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      if (cadToolMode === 'line') return;
      event.preventDefault();
      event.stopPropagation();
      const selected = cadFindSourceLine(cadSelectedLineId);
      if (!selected) return;

      const anchor = cadLinePoint(selected, endpoint);
      cadDragState = {
        mode: 'endpoint',
        pointerId: event.pointerId,
        lineId: selected.id,
        endpoint,
        before: cadSerializeWorkingSvg(),
        refs: cadConnectedEndpointRefs(anchor),
        moved: false
      };
      if (svg.setPointerCapture) {
        try { svg.setPointerCapture(event.pointerId); } catch (_) {}
      }
    });
    handles.appendChild(handle);
  });

  svg.appendChild(handles);
}

function cadSyncOverlay(svg) {
  if (!svg || !cadWorkingDoc) return;

  svg.querySelectorAll('[data-cad-id]').forEach(displayLine => {
    const id = displayLine.getAttribute('data-cad-id');
    const source = cadFindSelectableLine(id);
    if (!source) {
      displayLine.remove();
      return;
    }

    const [x1, y1] = cadLinePoint(source, 1);
    const [x2, y2] = cadLinePoint(source, 2);
    displayLine.setAttribute('x1', x1);
    displayLine.setAttribute('y1', y1);
    displayLine.setAttribute('x2', x2);
    displayLine.setAttribute('y2', y2);

    const style = cadLineDisplayStyle(source);
    displayLine.setAttribute('stroke', style.color);
    if (style.dash) displayLine.setAttribute('stroke-dasharray', style.dash);
    else displayLine.removeAttribute('stroke-dasharray');

    displayLine.classList.toggle('selected', id === cadSelectedLineId);

    const label = svg.querySelector(`[data-cad-label="${CSS.escape(id)}"]`);
    if (label) {
      label.setAttribute('x', (x1 + x2) / 2);
      label.setAttribute('y', (y1 + y2) / 2 - 8);
      label.setAttribute('fill', style.color);
    }
  });

  svg.querySelectorAll('[data-cad-symbol-id]').forEach(displaySymbol => {
    const id = displaySymbol.getAttribute('data-cad-symbol-id');
    displaySymbol.classList.toggle('selected', id === cadSelectedSymbolId);
  });

  // Mantiene l'evidenza diagnostica agganciata alla geometria anche durante
  // drag/spostamenti effettuati per correggere l'errore.
  cadRenderServiceGeometryErrors(svg);
  cadRenderSelectionHandles(svg);
  cadUpdatePropertiesPanel();
  cadUpdateControls();
}

function cadInstallPointerEditing(svg) {
  cadResetTouchGesture();

  // Navigazione CAD:
  // desktop: rotella = zoom sul cursore, tasto centrale + drag = pan;
  // ProjectBrowser Android: un dito = pan, due dita = pinch zoom.
  // I gesti touch hanno priorità sull'editing per evitare spostamenti accidentali.
  svg.addEventListener('pointerdown', event => {
    cadStartTouchNavigation(svg, event);
  }, true);
  svg.addEventListener('pointermove', event => {
    cadMoveTouchNavigation(svg, event);
  }, true);
  const finishTouch = event => {
    cadFinishTouchNavigation(svg, event);
  };
  svg.addEventListener('pointerup', finishTouch, true);
  svg.addEventListener('pointercancel', finishTouch, true);

  svg.addEventListener('wheel', event => cadZoomAtPointer(svg, event), { passive: false });

  // Impedisce l'autoscroll del browser sul clic della rotella.
  svg.addEventListener('mousedown', event => {
    if (event.button === 1) event.preventDefault();
  });
  svg.addEventListener('auxclick', event => {
    if (event.button === 1) event.preventDefault();
  });

  // Il pan con tasto centrale ha priorità su selezione/inserimento/drag.
  svg.addEventListener('pointerdown', event => {
    if (event.button === 1) cadStartPan(svg, event);
  }, true);

  // Il tasto destro usa un menu CAD contestuale:
  // - in modalità parete: chiusura/interruzione sequenza;
  // - in stato neutro: ripetizione dell'ultimo comando ripetibile.
  svg.addEventListener('contextmenu', event => {
    if (cadToolMode === 'line') {
      event.preventDefault();
      event.stopPropagation();
      cadShowLineContextMenu(event);
      return;
    }

    if (
      (cadToolMode === 'symbol' && cadSymbolInsertType === 'FIN') ||
      cadToolMode === 'window2'
    ) {
      event.preventDefault();
      event.stopPropagation();
      cadShowWindowSequenceContextMenu(event);
      return;
    }

    if (cadToolMode === 'select') {
      event.preventDefault();
      event.stopPropagation();
      cadShowIdleContextMenu(event);
      return;
    }

    cadHideContextMenu();
  });

  // Le modalità di inserimento intercettano il click sinistro prima delle singole entità.
  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    cadHideContextMenu();
    if (cadToolMode === 'window2') {
      event.preventDefault();
      event.stopPropagation();
      cadStartOrFinishWindowTwoPoint(svg, cadClientPoint(svg, event));
      return;
    }
    if (cadToolMode === 'symbol') {
      event.preventDefault();
      event.stopPropagation();
      cadInsertSymbolAtPoint(cadClientPoint(svg, event));
      return;
    }
    if (cadToolMode !== 'line') return;
    event.preventDefault();
    event.stopPropagation();
    cadStartOrFinishNewLine(svg, cadClientPoint(svg, event));
  }, true);

  svg.addEventListener('pointermove', event => {
    if (cadMovePan(svg, event)) return;

    if (cadToolMode === 'window2') {
      const rawPoint = cadClientPoint(svg, event);

      if (!cadWindowTwoPointState) {
        const first = cadNearestWallPoint(rawPoint);
        cadRenderWindowTwoPointPreview(svg, first.point, first.snapped);
        cadSetStatus(
          'Finestra 2 punti · clicca il primo punto vicino a una parete' +
          (first.snapped && first.targetLineId ? ' · SNAP ' + first.targetLineId : '')
        );
        return;
      }

      const second = cadNearestPointOnWall(rawPoint, cadWindowTwoPointState.wallLineId);
      cadRenderWindowTwoPointPreview(svg, second.point, second.snapped);
      const width = cadPointDistance(cadWindowTwoPointState.start, second.point);
      cadSetStatus(
        'Finestra 2 punti · secondo punto sulla stessa parete ' +
        cadWindowTwoPointState.wallLineId +
        (second.snapped ? ' · larghezza ' + cadTrimNumber(width / 100, 2) + ' m' : ' · avvicinati alla parete')
      );
      return;
    }

    if (cadToolMode === 'line') {
      const rawPoint = cadClientPoint(svg, event);

      if (!cadNewLineState) {
        const snapped = cadRenderNewLineFirstPointPreview(svg, rawPoint);
        cadSetStatus(
          `Parete ${(cadNewLineType?.value || 'W').toUpperCase()} · clicca il punto iniziale${snapped.snapped ? ' · ' + cadSnapLabel(snapped) : ''}`
        );
        return;
      }

      const snapped = cadNewLineTargetPoint(rawPoint);
      cadRenderNewLinePreview(svg, snapped.point, snapped.snapped);
      cadSetStatus(
        `Parete ${(cadNewLineType?.value || 'W').toUpperCase()} · clicca il punto successivo${snapped.ortho ? ' · ORTO' : ''}${snapped.snapped ? ' · ' + cadSnapLabel(snapped) : ''}`
      );
      return;
    }

    if (!cadDragState || cadDragState.pointerId !== event.pointerId) return;

    const point = cadClientPoint(svg, event);

    if (cadDragState.mode === 'endpoint') {
      const snapped = cadSnapPoint(point, cadDragState.lineId);
      cadDragState.refs.forEach(ref => {
        cadSetLinePoint(ref.line, ref.endpoint, snapped.point[0], snapped.point[1]);
      });
      cadDragState.moved = true;
      cadSyncOverlay(svg);
      cadSetStatus(
        `${cadDragState.lineId} · estremo ${cadDragState.endpoint}${snapped.snapped ? ' · ' + cadSnapLabel(snapped) : ''}`,
        'dirty'
      );
    } else if (cadDragState.mode === 'line') {
      const dx = point[0] - cadDragState.startPointer[0];
      const dy = point[1] - cadDragState.startPointer[1];

      cadDragState.refs.forEach(ref => {
        cadSetLinePoint(ref.line, ref.endpoint, ref.x + dx, ref.y + dy);
      });
      cadDragState.moved = true;
      cadSyncOverlay(svg);
      cadSetStatus(`${cadDragState.lineId} · spostamento parete`, 'dirty');
    }
  });

  const finishDrag = event => {
    if (cadFinishPan(svg, event)) return;
    if (!cadDragState || cadDragState.pointerId !== event.pointerId) return;

    if (cadDragState.moved) {
      cadUndoStack.push(cadDragState.before);
      cadRedoStack = [];
    }

    cadDragState = null;
    if (svg.releasePointerCapture) {
      try { svg.releasePointerCapture(event.pointerId); } catch (_) {}
    }
    cadUpdateControls();
  };

  svg.addEventListener('pointerup', finishDrag);
  svg.addEventListener('pointercancel', finishDrag);

  svg.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    if (cadToolMode === 'line' || cadToolMode === 'symbol') return;
    if (event.target === svg || event.target.getAttribute('data-cad-background') === '1') {
      cadSelectedSymbolId = '';
      cadSelectLine('', svg);
    }
  });
}

function applyCadLayerVisibility() {
  if (!cadCanvas) return;
  const background = cadCanvas.querySelector('#cadImportedBackgroundLayer');
  const generatedExecutive = cadCanvas.querySelector('#cadGeneratedExecutiveLayer');
  const input = cadCanvas.querySelector('#cadInputLayer');

  if (background) background.style.display = cadShowBackground?.checked === false ? 'none' : '';
  if (generatedExecutive)
    generatedExecutive.style.display =
      cadShowGeneratedExecutive?.checked === false ? 'none' : '';
  if (input) input.style.display = cadShowInput?.checked === false ? 'none' : '';

  const handles = cadCanvas.querySelector('#cadHandlesLayer');
  if (handles) handles.style.display = cadShowInput?.checked === false ? 'none' : '';

  cadUpdateExecutiveProvenance();
}

function renderCadComparison() {
  if (!cadCanvas) return;

  cadCanvas.innerHTML = '';
  if (!cadWorkingDoc) {
    const empty = document.createElement('div');
    empty.className = 'cad-empty';
    empty.textContent = 'Nessun disegno CAD disponibile.';
    cadCanvas.appendChild(empty);
    cadUpdateControls();
    return;
  }

  const inputRoot = cadWorkingDoc.documentElement;

  // v0.40: la "Pianta pulita" resta disponibile al motore ma non viene
  // renderizzata nel CAD. Il fondo visibile è l'eventuale disegno importato.
  const viewBox = inputRoot.getAttribute('viewBox');
  if (!viewBox) {
    const empty = document.createElement('div');
    empty.className = 'cad-empty';
    empty.textContent = 'Impossibile visualizzare il CAD: manca il viewBox SVG.';
    cadCanvas.appendChild(empty);
    return;
  }

  const sourceViewBox = cadParseViewBox(viewBox);
  const displayViewBox = cadEnsureViewport(sourceViewBox) || sourceViewBox;

  const svg = svgNode('svg', {
    viewBox: displayViewBox ? cadFormatViewBox(displayViewBox) : viewBox,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'Editor CAD della pianta Termodel'
  });

  const vb = sourceViewBox || viewBox.trim().split(/[ ,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite)) {
    svg.appendChild(svgNode('rect', {
      x: vb[0], y: vb[1], width: vb[2], height: vb[3],
      fill: '#f5f5f5',
      'data-cad-background': 1
    }));
  }

  // Sfondo importato del piano corrente: raster o SVG vettoriale incorporato.
  const backgroundLayer = svgNode('g', {
    id: 'cadImportedBackgroundLayer',
    'pointer-events': 'none'
  });
  const sourceBackground = cadPlaneBackground(cadWorkingDoc, cadCurrentPlane());
  if (sourceBackground) {
    backgroundLayer.appendChild(svgNode('image', {
      x: sourceBackground.getAttribute('x'),
      y: sourceBackground.getAttribute('y'),
      width: sourceBackground.getAttribute('width'),
      height: sourceBackground.getAttribute('height'),
      preserveAspectRatio: sourceBackground.getAttribute('preserveAspectRatio') || 'xMidYMid meet',
      opacity: sourceBackground.getAttribute('opacity') || '0.72',
      href: sourceBackground.getAttribute('href') || ''
    }));
  }
  svg.appendChild(backgroundLayer);

  // Overlay runtime dell'ultimo file generato dal Service. È volutamente
  // separato da cadWorkingDoc: può fungere da sfondo di verifica senza
  // entrare nel progetto unico né essere reinviato al calcolo.
  const generatedExecutiveLayer = svgNode('g', {
    id: 'cadGeneratedExecutiveLayer',
    opacity: '0.72',
    'pointer-events': 'none'
  });
  cadAppendGeneratedExecutiveOverlay(
    generatedExecutiveLayer,
    cadCurrentPlane()
  );
  svg.appendChild(generatedExecutiveLayer);

  // Overlay semantico editabile. In v0.7 sono editabili soltanto E/W.
  const inputLayer = svgNode('g', { id: 'cadInputLayer' });
  const calpestabile = cadCalpestabile();

  if (calpestabile) {
    Array.from(calpestabile.children)
      .filter(el => el.localName === 'line' && cadEntityBelongsToCurrentPlane(el))
      .forEach(line => {
        const id = line.id || '';
        const lineStyle = cadLineDisplayStyle(line);
        const color = lineStyle.color;
        const x1 = Number(line.getAttribute('x1'));
        const y1 = Number(line.getAttribute('y1'));
        const x2 = Number(line.getAttribute('x2'));
        const y2 = Number(line.getAttribute('y2'));
        const editable =
          cadToolbarState?.modalita === 'rete'
            ? cadIsPipeLine(line)
            : /^[EW]/i.test(id);

        const displayLine = svgNode('line', {
          x1, y1, x2, y2,
          stroke: color,
          'stroke-dasharray': lineStyle.dash || null,
          'stroke-width': editable ? 3.4 : 2.8,
          'stroke-linecap': 'round',
          opacity: editable ? 0.92 : 0.72,
          'vector-effect': 'non-scaling-stroke',
          class: editable ? 'cad-edit-line' : '',
          'data-cad-id': editable ? id : null
        });

        if (editable) {
          displayLine.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            if (cadToolMode === 'line') return;
            event.preventDefault();
            event.stopPropagation();

            if (cadExtendTrimSourceId) {
              event.preventDefault();
              event.stopPropagation();
              cadApplyExtendTrim(id);
              return;
            }
            cadSelectedSymbolId = '';
            cadSelectedLineId = id;
            cadSyncOverlay(svg);

            const source = cadFindSourceLine(id);
            if (!source) return;

            const start = cadLinePoint(source, 1);
            const end = cadLinePoint(source, 2);
            const refs = [
              ...cadConnectedEndpointRefs(start),
              ...cadConnectedEndpointRefs(end)
            ];

            // Evita di aggiornare due volte lo stesso endpoint.
            const unique = [];
            const seen = new Set();
            refs.forEach(ref => {
              const key = `${ref.line.id}:${ref.endpoint}`;
              if (seen.has(key)) return;
              seen.add(key);
              unique.push(ref);
            });

            cadDragState = {
              mode: 'line',
              pointerId: event.pointerId,
              lineId: id,
              before: cadSerializeWorkingSvg(),
              startPointer: cadClientPoint(svg, event),
              refs: unique,
              moved: false
            };

            if (svg.setPointerCapture) {
              try { svg.setPointerCapture(event.pointerId); } catch (_) {}
            }
          });
        }

        inputLayer.appendChild(displayLine);
        addCadLabel(
          inputLayer, id, (x1 + x2) / 2, (y1 + y2) / 2, color,
          editable ? id : ''
        );
      });

    Array.from(calpestabile.children)
      .filter(el => el.localName === 'text' && cadSymbolBlockType(el) && cadEntityBelongsToCurrentPlane(el))
      .forEach(labelSource => {
        const id = labelSource.id || '';
        const x = Number(labelSource.getAttribute('x'));
        const y = Number(labelSource.getAttribute('y'));
        const color = cadSymbolColor(labelSource);
        const marker = svgNode('circle', {
          cx: x, cy: y, r: 7, fill: '#ffffff', stroke: color, 'stroke-width': 2,
          'vector-effect': 'non-scaling-stroke',
          class: 'cad-edit-symbol',
          'data-cad-symbol-id': id
        });
        marker.classList.toggle('selected', id === cadSelectedSymbolId);
        marker.addEventListener('pointerdown', event => {
          if (event.button !== 0) return;
          if (cadToolMode !== 'select') return;
          event.preventDefault();
          event.stopPropagation();
          cadSelectSymbol(id, svg);
        });
        inputLayer.appendChild(marker);
        addCadLabel(inputLayer, id, x, y, color);
      });
  }

  svg.appendChild(inputLayer);
  // Overlay runtime degli errori geometrici Service: non modifica cadWorkingDoc.
  cadRenderServiceGeometryErrors(svg);
  cadRenderNorthOverlay(svg, vb);
  cadCanvas.appendChild(svg);

  cadInstallPointerEditing(svg);
  cadSyncOverlay(svg);
  applyCadLayerVisibility();
}

function cadDeleteSelected() {
  const line = cadFindSelectableLine(cadSelectedLineId);
  if (!line) return;

  const deletedId = line.id || cadSelectedLineId;
  const pipe = cadIsPipeLine(line);
  const before = cadSerializeWorkingSvg();
  line.remove();
  cadUndoStack.push(before);
  cadRedoStack = [];
  cadSelectedLineId = '';
  renderCadComparison();
  cadSetStatus(
    pipe
      ? ('Tubo ' + deletedId + ' eliminato · premi Consolida rete')
      : ('Parete ' + deletedId + ' eliminata · premi Rigenera pianta'),
    'dirty'
  );
}

function cadUndoEdit() {
  if (!cadUndoStack.length || !cadWorkingDoc) return;
  cadRedoStack.push(cadSerializeWorkingSvg());
  cadWorkingDoc = cadParseSvg(cadUndoStack.pop());
  cadSyncNorthFromWorkingDoc();
  if (!cadFindSelectableLine(cadSelectedLineId)) cadSelectedLineId = '';
  if (!cadFindSourceSymbol(cadSelectedSymbolId)) cadSelectedSymbolId = '';
  renderCadComparison();
}

function cadRedoEdit() {
  if (!cadRedoStack.length || !cadWorkingDoc) return;
  cadUndoStack.push(cadSerializeWorkingSvg());
  cadWorkingDoc = cadParseSvg(cadRedoStack.pop());
  cadSyncNorthFromWorkingDoc();
  if (!cadFindSelectableLine(cadSelectedLineId)) cadSelectedLineId = '';
  if (!cadFindSourceSymbol(cadSelectedSymbolId)) cadSelectedSymbolId = '';
  renderCadComparison();
}

function cadRegeneratePlan() {
  if (!cadWorkingDoc) return false;
  if (!cadIsDirty()) return true;

  try {
    const svgText = cadSerializeWorkingSvg();
    const current = cadCurrentPlane();

    // In modalità Rete le linee tubo sono input tecnico del Service e non
    // devono essere passate a GeneraPianta.js. Consolidiamo lo SVG completo:
    // buildTermodelServerPayload le porterà poi nel file unico tecnico.
    if (cadToolbarState.modalita === 'rete') {
      validatedSvg = svgText;
      cadCommittedSvg = svgText;
      rasterSvgText.value = svgText;
      renderCadComparison();
      cadUpdateControls();
      cadSetStatus(
        '✓ Rete ' + (cadToolbarState.rete || '?') +
        ' consolidata · Piano ' + current +
        ' · usa Aggiorna Modello per inviarla al calcolo',
        'dirty'
      );
      return true;
    }

    // Le coperture sono input tecnico del motore Termodel. Il browser non
    // tenta di inventarne il 3D: consolida il CAD 2D e lascia al Service
    // Tetti/Polig3D la generazione autorevole di falde e locali mansardati.
    if (cadPlaneIsCoverage(current)) {
      validatedSvg = svgText;
      cadCommittedSvg = svgText;
      rasterSvgText.value = svgText;
      lastCleanPlanSvg = '';
      lastGeneratedPlan = null;
      cadCleanPlanByPlane.delete(current);
      cadGeneratedPlanByPlane.delete(current);

      rasterExportSvg.disabled = true;
      if (rasterDownloadAiJson) rasterDownloadAiJson.disabled = true;
      if (rasterDownloadCleanSvg) rasterDownloadCleanSvg.disabled = true;
      if (cadExportArchitectural) cadExportArchitectural.disabled = true;

      renderCadComparison();
      cadSetStatus(
        '✓ Piano ' + current +
        ' consolidato · Copertura esclusa dall\'anteprima 3D locale · usa Aggiorna Modello'
      );
      return true;
    }

    const currentPlaneSvg = cadSerializeCurrentPlaneSvg();
    const plan = generaPiantaDaSvg(currentPlaneSvg);

    validatedSvg = svgText;
    lastCleanPlanSvg = plan.svgPulito;
    lastGeneratedPlan = plan;
    cadCleanPlanByPlane.set(current, plan.svgPulito);
    cadGeneratedPlanByPlane.set(current, plan);
    cadCommittedSvg = svgText;
    rasterSvgText.value = svgText;
    showSvgPreview(plan.svgPulito);

    // Aggiorna anche il 3D senza abbandonare la pagina CAD.
    lastAiPreviewData = createAiPreviewModelFromPlan(plan);
    renderModelData(lastAiPreviewData, {
      mode: 'ai',
      label: 'ANTEPRIMA AI — GENERAPIANTA.JS',
      renderOrigin: 'local'
    });

    rasterExportSvg.disabled = false;
    if (rasterDownloadAiJson) rasterDownloadAiJson.disabled = false;
    if (rasterDownloadCleanSvg) rasterDownloadCleanSvg.disabled = false;

    if (cadExportArchitectural) {
      cadExportArchitectural.disabled = false;
      cadExportArchitectural.title =
        `${DXF_EXPORT_INFO.version} · ${DXF_EXPORT_INFO.units}`;
    }

    renderCadComparison();
    cadSetStatus(
      `✓ Piano ${cadCurrentPlane()} rigenerato · ${plan.stats.locali} locali`
    );
    return true;
  } catch (error) {
    cadSetStatus('✗ ' + error.message, 'error');
    return false;
  }
}

function cadReturnToModel() {
  // Una linea iniziata ma non conclusa non fa ancora parte dello SVG:
  // la annulliamo prima del ritorno.
  if (cadToolMode === 'line')
    cadCancelNewLine();

  // Se il DisegnoInput è stato modificato, il modello deve sempre
  // corrispondere all'input corrente prima di lasciare il CAD.
  if (cadWorkingDoc && cadIsDirty()) {
    const regenerated = cadRegeneratePlan();
    if (!regenerated) return;
  }

  cadSetMobilePropertiesOpen(false);
  activateModelPage();
}

function activateCadPage() {
  if (!structuredProjectActive) {
    projectStartContext = { target: 'cad', archiveName: '' };
    void startBlankProjectFromCad();
    return;
  }

  setCadLayoutMode(true);
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (cadPage) cadPage.classList.add('active');

  if (!cadWorkingDoc && validatedSvg) {
    try {
      cadSetWorkingSvg(validatedSvg);
    } catch (error) {
      cadSetStatus('✗ ' + error.message, 'error');
    }
  }

  cadEnsureToolbarState();
  cadRestorePlanePreview();
  renderCadComparison();
  cadUpdatePropertiesPanel();
  refreshAndroidCadExploreControls();
}

function processSvgText(text) {
  validatedSvg = '';
  lastAiPreviewData = null;
  lastCleanPlanSvg = '';
  lastGeneratedPlan = null;
  if (cadExportArchitectural) cadExportArchitectural.disabled = true;
  rasterExportSvg.disabled = true;
  if (rasterDownloadAiJson) rasterDownloadAiJson.disabled = true;
  if (rasterDownloadCleanSvg) rasterDownloadCleanSvg.disabled = true;
  svgExportText.value = '';
  rasterValidation.className = 'raster-ai-validation';

  try {
    const extracted = extractSvg(text);
    const svg = extracted.svg;

    // GPT ha già validato la geometria. Il Web esegue soltanto il lavoro
    // necessario a GeneraPianta: noding + polygonizzazione con JSTS.
    const plan = generaPiantaDaSvg(svg);

    validatedSvg = svg;
    lastCleanPlanSvg = plan.svgPulito;
    lastGeneratedPlan = plan;
    cadSetWorkingSvg(svg);
    validatedSvg = cadSerializeWorkingSvg();
    rasterSvgText.value = validatedSvg;
    showSvgPreview(plan.svgPulito);
    showAiPreviewModel(plan);

    const counts = lastAiPreviewData.previewCounts;
    const warningText = plan.warnings?.length
      ? `\n⚠ ${plan.warnings.length} raccordi/associazioni hanno usato una protezione; dettagli in console.`
      : '';
    if (plan.warnings?.length) console.warn('GeneraPianta Web warnings:', plan.warnings);

    rasterValidation.textContent =
      `${extracted.transported ? '✓ Payload TERMODEL-SVG-TEXT-V1 decodificato\n' : ''}` +
      `✓ GeneraPianta.js: ${plan.stats.linee} linee lette · ${plan.stats.locali} locali\n` +
      `✓ Classificazione JSTS: ${plan.stats.geometricExternalEdges} lati esterni · ${plan.stats.geometricInternalEdges} lati interni\n` +
      `✓ Regola netta: E ferme · W spostate 7.5 cm verso il locale · esterno edificio +40 cm\n` +
      `✓ Incongruenze E/W GPT vs geometria: ${plan.stats.classificationMismatches}\n` +
      `✓ ${counts.floors} pavimenti · spessore default ${AI_PREVIEW_FLOOR_THICKNESS_M.toFixed(2)} m\n` +
      `✓ ${counts.ceilings} soffitti · spessore default ${AI_PREVIEW_CEILING_THICKNESS_M.toFixed(2)} m\n` +
      `✓ ${counts.windows || 0} FIN visibili nel 3D provvisorio\n` +
      `✓ Pianta SVG pulita generata\n` +
      `✓ Anteprima 3D caricata nel viewer` + warningText;

    rasterValidation.classList.add('ok');
    rasterExportSvg.disabled = false;
    if (rasterDownloadAiJson) rasterDownloadAiJson.disabled = false;
    if (rasterDownloadCleanSvg) rasterDownloadCleanSvg.disabled = false;
    if (cadExportArchitectural) {
      cadExportArchitectural.disabled = false;
      cadExportArchitectural.title = `${DXF_EXPORT_INFO.version} · ${DXF_EXPORT_INFO.units}`;
    }

    // Il ritorno da GPT porta direttamente alla pianta estrusa.
    closeRasterAiDialog();
    return true;
  } catch (error) {
    rasterValidation.textContent = '✗ ' + error.message;
    rasterValidation.classList.add('error');
    return false;
  }
}

document.getElementById('rasterSelectButton').addEventListener('click', () => rasterFileInput.click());
rasterFileInput.addEventListener('change', () => {
  const file = rasterFileInput.files?.[0];
  if (!file) return;

  selectedRasterFile = file;
  if (rasterObjectUrl) URL.revokeObjectURL(rasterObjectUrl);
  rasterObjectUrl = URL.createObjectURL(file);
  rasterPreviewImage.src = rasterObjectUrl;
  rasterPreviewImage.hidden = false;
  rasterPreviewPlaceholder.hidden = true;
  rasterFileName.textContent = file.name;
  rasterCopyPrompt.disabled = false;
  rasterOpenChatGpt.disabled = false;
});

rasterCopyPrompt.addEventListener('click', async () => {
  if (!selectedRasterFile) return;
  try {
    const [generalResponse, rasterResponse] = await Promise.all([
      fetch(TERMODEL_GENERAL_PROMPT_URL, { cache: 'no-store' }),
      fetch(RASTER_PROMPT_URL, { cache: 'no-store' })
    ]);
    if (!generalResponse.ok) throw new Error(`Istruzioni generali: HTTP ${generalResponse.status}`);
    if (!rasterResponse.ok) throw new Error(`Istruzioni raster: HTTP ${rasterResponse.status}`);
    const generalInstructions = await generalResponse.text();
    const rasterInstructions = await rasterResponse.text();
    const instructions = generalInstructions + '\n\n---\n\n' + rasterInstructions;
    const session = `

---
IMMAGINE DI QUESTA SESSIONE: ${selectedRasterFile.name}
L'utente allegherà alla chat il file raster; non tentare di aprire percorsi locali di Termodel.`;
    await navigator.clipboard.writeText(instructions + session);
    rasterValidation.className = 'raster-ai-validation ok';
    rasterValidation.textContent = '✓ Istruzioni Termodel copiate. Ora apri ChatGPT e allega la stessa pianta.';
  } catch (error) {
    rasterValidation.className = 'raster-ai-validation error';
    rasterValidation.textContent = '✗ Impossibile copiare le istruzioni: ' + error.message;
  }
});

rasterOpenChatGpt.addEventListener('click', () => {
  if (!selectedRasterFile) return;
  window.open('https://chatgpt.com/', '_blank', 'noopener');
});

document.getElementById('rasterLoadSvg').addEventListener('click', () => rasterSvgFileInput.click());
rasterSvgFileInput.addEventListener('change', async () => {
  const file = rasterSvgFileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  rasterSvgText.value = text;
  processSvgText(text);
});

document.getElementById('rasterPasteSvg').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    rasterSvgText.value = text;
    processSvgText(text);
  } catch (error) {
    rasterValidation.className = 'raster-ai-validation error';
    rasterValidation.textContent = '✗ Il browser non ha consentito la lettura degli appunti. Incolla manualmente nel riquadro.';
  }
});

document.getElementById('rasterValidateSvg').addEventListener('click', () => {
  processSvgText(rasterSvgText.value);
});

rasterExportSvg.addEventListener('click', openSvgExportDialog);
if (rasterDownloadAiJson)
  rasterDownloadAiJson.addEventListener('click', downloadAiPreviewJson);
if (rasterDownloadCleanSvg)
  rasterDownloadCleanSvg.addEventListener('click', downloadCleanPlanSvg);
svgExportCopy.addEventListener('click', copyValidatedSvg);
svgExportDownload.addEventListener('click', downloadValidatedSvg);
document.getElementById('svgExportClose').addEventListener('click', closeSvgExportDialog);
document.getElementById('svgExportCloseBottom').addEventListener('click', closeSvgExportDialog);
svgExportModal.addEventListener('click', (event) => {
  if (event.target === svgExportModal) closeSvgExportDialog();
});

document.getElementById('rasterAiClose').addEventListener('click', closeRasterAiDialog);
document.getElementById('rasterAiCloseBottom').addEventListener('click', closeRasterAiDialog);
rasterAiModal.addEventListener('click', (event) => {
  if (event.target === rasterAiModal) closeRasterAiDialog();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (pdfImportModal?.classList.contains('visible')) {
    closePdfImportDialog(false);
    return;
  }
  if (dxfImportModal?.classList.contains('visible')) {
    closeDxfImportDialog(null);
    return;
  }
  if (aiSplitGuideModal?.classList.contains('visible')) {
    closeAiSplitGuideDialog();
    return;
  }
  if (aiInstructModal?.classList.contains('visible')) {
    closeAiInstructDialog();
    return;
  }
  if (projectExploreModal?.classList.contains('visible')) {
    closeProjectExploreDialog(null);
    return;
  }
  if (svgExportModal.classList.contains('visible')) {
    closeSvgExportDialog();
    return;
  }
  if (rasterAiModal.classList.contains('visible'))
    closeRasterAiDialog();
});


pdfPrevPage?.addEventListener('click', () => {
  if (pdfImportState) cadSetPdfPage(pdfImportState.pageNumber - 1);
});
pdfNextPage?.addEventListener('click', () => {
  if (pdfImportState) cadSetPdfPage(pdfImportState.pageNumber + 1);
});
pdfPageNumber?.addEventListener('change', () => cadSetPdfPage(pdfPageNumber.value));
pdfPageNumber?.addEventListener('keydown', event => {
  if (event.key === 'Enter') cadSetPdfPage(pdfPageNumber.value);
});
pdfImportRasterize?.addEventListener('click', () => closePdfImportDialog(true));
pdfImportCancel?.addEventListener('click', () => closePdfImportDialog(false));
pdfImportClose?.addEventListener('click', () => closePdfImportDialog(false));
pdfImportModal?.addEventListener('click', event => {
  if (event.target === pdfImportModal) closePdfImportDialog(false);
});

dxfSelectAll?.addEventListener('click', () => {
  dxfLayerList?.querySelectorAll('input[type="checkbox"][data-dxf-layer]').forEach(input => {
    input.checked = true;
  });
  markDxfImportManual();
  updateDxfImportSummary();
});
dxfSelectNone?.addEventListener('click', () => {
  dxfLayerList?.querySelectorAll('input[type="checkbox"][data-dxf-layer]').forEach(input => {
    input.checked = false;
  });
  markDxfImportManual();
  updateDxfImportSummary();
});
dxfDrawingUnit?.addEventListener('change', updateDxfImportSummary);
[dxfModeLines, dxfModeCurves, dxfConvertText, dxfExplodeBlocks].forEach(control => {
  control?.addEventListener('change', () => {
    markDxfImportManual();
    updateDxfImportSummary();
  });
});
dxfImportConvert?.addEventListener('click', () => closeDxfImportDialog(dxfDialogOptions()));
dxfImportCancel?.addEventListener('click', () => closeDxfImportDialog(null));
dxfImportClose?.addEventListener('click', () => closeDxfImportDialog(null));
dxfImportModal?.addEventListener('click', event => {
  if (event.target === dxfImportModal) closeDxfImportDialog(null);
});

cadAddBackground?.addEventListener('click', () => {
  if (!cadWorkingDoc || !cadBackgroundFile) return;
  cadBackgroundFile.click();
});
cadLoadGeneratedExecutive?.addEventListener(
  'click',
  cadLoadGeneratedExecutiveBackground
);
cadShowGeneratedExecutive?.addEventListener('change', () => {
  applyCadLayerVisibility();
  cadUpdateControls();
});
cadBackgroundFile?.addEventListener('change', async () => {
  const file = cadBackgroundFile.files?.[0];
  cadBackgroundFile.value = '';
  if (!file) return;
  try {
    await cadImportBackgroundFile(file);
  } catch (error) {
    console.error(error);
    cadSetStatus('Errore importazione sfondo: ' + (error?.message || error), 'error');
  }
});
if (cadShowBackground)
  cadShowBackground.addEventListener('change', () => {
    applyCadLayerVisibility();
    cadUpdateControls();
  });
if (cadShowInput)
  cadShowInput.addEventListener('change', applyCadLayerVisibility);
cadSnapBackground?.addEventListener('change', () => {
  const enabled = cadSnapBackground.checked && !!cadVectorPlaneBackground();
  cadSetStatus(enabled ? 'Snap sfondo vettoriale attivo · solo endpoint' : 'Snap sfondo vettoriale disattivato');
});
cadCalibrateBackground?.addEventListener('click', cadApplyBackgroundCalibration);
cadCalibrationRealMeters?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !cadCalibrateBackground?.disabled)
    cadApplyBackgroundCalibration();
});
if (cadUndo)
  cadUndo.addEventListener('click', cadUndoEdit);
if (cadRedo)
  cadRedo.addEventListener('click', cadRedoEdit);
if (cadDelete)
  cadDelete.addEventListener('click', cadDeleteSelected);
if (cadNewLine)
  cadNewLine.addEventListener('click', cadToggleNewLine);
cadRepeatLastCommand?.addEventListener('click', cadRepeatLastCadCommand);
cadExtendTrim?.addEventListener('click', cadStartExtendTrim);
cadCloseSequence?.addEventListener('click', () => cadCloseWallSequence(false));
cadCloseOrthogonalSequence?.addEventListener('click', () => cadCloseWallSequence(true));
cadStopSequence?.addEventListener('click', () => {
  cadHideContextMenu();
  if (cadToolMode === 'line') {
    cadCancelNewLine();
    return;
  }
  if (cadToolMode === 'symbol' && cadSymbolInsertType === 'FIN') {
    cadCancelSymbolInsert();
    return;
  }
  if (cadToolMode === 'window2')
    cadCancelWindowTwoPoint();
});
document.addEventListener('pointerdown', event => {
  if (!cadContextMenu || cadContextMenu.hidden) return;
  if (!cadContextMenu.contains(event.target)) cadHideContextMenu();
});
cadInsertAlign?.addEventListener('click', () => cadToggleSymbolInsert('ALLINEA'));
cadInsertOpening?.addEventListener('click', () => cadToggleSymbolInsert('FIN'));
cadInsertOpeningTwoPoint?.addEventListener('click', cadToggleWindowTwoPoint);
cadInsertBridge?.addEventListener('click', () => cadToggleSymbolInsert('PON'));
cadInsertRoom?.addEventListener('click', () => cadToggleSymbolInsert('LOC'));
cadInsertRidge?.addEventListener('click', () => cadToggleSymbolInsert('COLMO'));
if (cadPropConfirm)
  cadPropConfirm.addEventListener('click', cadApplyProperties);
cadSymbolApply?.addEventListener('click', cadApplySelectedSymbolProperties);
cadNorthClose?.addEventListener('click', () => cadCloseNorthPanel(true));
cadNorthDefined?.addEventListener('change', () => {
  cadSetNorthOrientation(cadNorthDefined.checked ? (cadNorthAngle?.value || 0) : null);
});
cadNorthRange?.addEventListener('input', () => {
  if (cadNorthDefined?.checked)
    cadSetNorthOrientation(cadNorthRange.value);
});
cadNorthAngle?.addEventListener('change', () => {
  if (cadNorthDefined?.checked)
    cadSetNorthOrientation(cadNorthAngle.value);
});
cadModeSelect?.addEventListener('change', cadModeChanged);
cadNetworkSelect?.addEventListener('change', cadNetworkChanged);
cadPropPiano?.addEventListener('change', cadCurrentPlaneChanged);
[cadPropTipoParete, cadPropConfineParete].forEach(control => {
  control?.addEventListener('change', cadWallPropertySelectionChanged);
});
cadOpenPianiArchive?.addEventListener('click', () => openArchivioWeb('Piani'));
cadAddRoofPlane?.addEventListener('click', cadCreateCoveragePlane);
cadMobilePropertiesToggle?.addEventListener('click', cadToggleMobileProperties);
cadOpenParetiArchive?.addEventListener('click', () => openArchivioWeb('Pareti'));
cadOpenConfiniArchive?.addEventListener('click', () => openArchivioWeb('Confini'));
window.addEventListener('termodel:archives-updated', () => {
  const piani = cadArchiveRecords('Piani').map(r => cadText(r?.Nome)).filter(Boolean);
  if (piani.length && !piani.includes(cadText(cadToolbarState.piano))) {
    cadToolbarState.piano = piani[0];
    cadSelectedLineId = '';
    cadRestorePlanePreview();
  }
  cadRefreshToolbarControls();
  if (cadPage?.classList.contains('active')) {
    renderCadComparison();
    cadUpdatePropertiesPanel();
  }
});
if (cadRegenerate)
  cadRegenerate.addEventListener('click', cadRegeneratePlan);
if (cadReturnModel)
  cadReturnModel.addEventListener('click', cadReturnToModel);
if (cadExportArchitectural)
  cadExportArchitectural.addEventListener('click', downloadArchitecturalDxf);

// Scorciatoie operative del mini-CAD.
document.addEventListener('keydown', event => {
  if (!cadPage?.classList.contains('active')) return;
  const tag = event.target?.tagName?.toLowerCase();

  if (event.key === 'Escape' && (cadToolMode === 'line' || cadToolMode === 'symbol' || cadToolMode === 'window2')) {
    event.preventDefault();
    if (cadToolMode === 'line') cadCancelNewLine();
    else if (cadToolMode === 'window2') cadCancelWindowTwoPoint();
    else cadCancelSymbolInsert();
    return;
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if ((event.key === 'Delete' || event.key === 'Backspace') && cadSelectedLineId) {
    event.preventDefault();
    cadDeleteSelected();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) cadRedoEdit();
    else cadUndoEdit();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    cadRedoEdit();
  }
});
// v0.63: ArchivioWeb usa il file progetto completo + definizionedati.json.
initArchivioWeb({ schemaUrl: './definizionedati.json?v=0.70' })
  .catch(error => console.error('ArchivioWeb non inizializzato:', error));

document.querySelectorAll('[data-action]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'Edita nel Cad') {
      activateCadPage();
      return;
    }
    showCommandHelp(button.dataset.action);
  });
});

projectExploreClose?.addEventListener('click', () => closeProjectExploreDialog(null));
projectExploreCloseBottom?.addEventListener('click', () => closeProjectExploreDialog(null));
projectExploreModal?.addEventListener('click', event => {
  if (event.target === projectExploreModal) closeProjectExploreDialog(null);
});

projectStartClose?.addEventListener('click', closeProjectStartDialog);
projectStartCloseBottom?.addEventListener('click', closeProjectStartDialog);
projectStartModal?.addEventListener('click', event => {
  if (event.target === projectStartModal) closeProjectStartDialog();
});
projectStartBlank?.addEventListener('click', () => {
  projectStartContext = { target: 'cad', archiveName: '' };
  void startBlankProjectFromCad();
});
projectStartInstructAi?.addEventListener('click', async event => {
  closeProjectStartDialog();
  await instructAiFromMainForm(event);
});
projectStartImportAi?.addEventListener('click', async event => {
  const context = projectStartContext;
  closeProjectStartDialog();
  await importAiFromMainForm(event);
  if (structuredProjectActive) {
    projectStartContext = context;
    await continueAfterProjectStart();
  }
});
openProjectButton?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  openProjectFileInput?.click();
});

openProjectFileInput?.addEventListener('change', async () => {
  const file = openProjectFileInput.files?.[0];
  openProjectFileInput.value = '';
  if (!file) return;

  try {
    await openProjectFile(file);
  } catch (error) {
    console.error('Apertura progetto non riuscita:', error);
    window.alert('Impossibile aprire il progetto Termodel.\n\n' + error.message);
  }
});

openExampleButton?.addEventListener('click', async event => {
  event.preventDefault();
  event.stopPropagation();

  try {
    await openProjectBrowserExampleFromMenu();
  } catch (error) {
    console.error('Apertura esempio non riuscita:', error);
    window.alert('Impossibile aprire l’esempio Termodel.\n\n' + error.message);
  }
});

saveProjectButton?.addEventListener('click', async event => {
  event.preventDefault();
  event.stopPropagation();
  try {
    await saveCurrentProject(false);
  } catch (error) {
    console.error('Salvataggio progetto non riuscito:', error);
    window.alert('Impossibile salvare il progetto Termodel.\n\n' + error.message);
  }
});

saveProjectAsButton?.addEventListener('click', async event => {
  event.preventDefault();
  event.stopPropagation();
  try {
    await saveCurrentProject(true);
  } catch (error) {
    console.error('Salvataggio progetto non riuscito:', error);
    window.alert('Impossibile salvare il progetto Termodel.\n\n' + error.message);
  }
});

helpCopyProjectClipboard?.addEventListener('click', async event => {
  event.preventDefault();
  event.stopPropagation();
  helpCopyProjectClipboard.closest('.menu')?.classList.remove('open');

  try {
    await copyCurrentProjectToClipboard();
  } catch (error) {
    console.error('Copia progetto negli appunti non riuscita:', error);
    window.alert('Impossibile copiare il progetto negli appunti.\n\n' + error.message);
  }
});

helpLocalService?.addEventListener('change', () => {
  resetTermodelServiceConnectionCache();
  status.textContent =
    'Termodel Service prossimo comando: ' +
    currentTermodelServiceTargetLabel();
});

helpSpiralEngine?.addEventListener('change', () => {
  const selected = selectedTermodelSpiralEngine();
  const label = selected || ('Predefinito Service (' + (termodelServiceRuntimeEngine || 'da /health') + ')');
  status.textContent = 'Motore spirali prossimo Aggiorna Modello: ' + label;
});

helpSpiralClosure?.addEventListener('change', () => {
  if (helpSpiralEngine &&
      selectedTermodelSpiralEngine() !== 'Vittorio_revisionato') {
    helpSpiralEngine.value = 'Vittorio_revisionato';
  }

  status.textContent =
    'Motore spirali prossimo Aggiorna Modello: Vittorio_revisionato · chiusura ' +
    (selectedTermodelSpiralClosure() ? 'attiva' : 'aperta');
});

helpCopyLogClipboard?.addEventListener('click', async event => {
  event.preventDefault();
  event.stopPropagation();
  helpCopyLogClipboard.closest('.menu')?.classList.remove('open');

  try {
    await copyCurrentTermodelLogToClipboard();
  } catch (error) {
    console.error('Copia log negli appunti non riuscita:', error);
    window.alert('Impossibile copiare il log negli appunti.\n\n' + error.message);
  }
});

newProjectButton?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  openProjectStartDialog({ target: 'cad' });
});

setStructuredProjectState(false);
setInitialModelExplorationLocked(true);
syncCopyTermodelLogAvailability();

if (TERMODEL_ANDROID_DEVICE) {
  createAndroidExploreBox();
  createAndroidCadBrowserBox();
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

resize();
completeTermodelMobileBoot();
void (async () => {
  await loadModel();
  await importAiFromLocationHash();
})();
