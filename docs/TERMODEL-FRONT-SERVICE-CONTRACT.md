# TERMODEL — CONTRATTO FRONTEND ↔ SERVICE

Versione documento: **1.28**  
Aggiornamento: **30 settembre 2026**  
Stato: **progetti autorevoli locali nel frontend; Service Render dedicato a calcolo e artifact con workspace ricreabile per projectId; endpoint legacy open/save/lock mantenuti compatibili; conversione DXF→SVG nel Core/Service; Pianta pulita SVG persistente e projectId-scoped; feedback utenti verso GitHub Issues, archivi Reti/TipologiePannelli, CAD Tubo, calcolo idraulico per circuito, esecutivo pannelli SVG/DXF, canale universale dei file generati, snapshot diagnostico Render→GitHub e notifica GitHub Actions/telefono implementati**

Questo documento è il riferimento condiviso tra **Termodel Web** e
**Termodel.Core / Termodel.WebService** per orchestrare la comunicazione fra
browser e server.

Non sostituisce:

- `PROJECT-SUMMARY.md`, che resta il Summary della linea Web JavaScript;
- `Server/Termodelwebservice/PROJECT-SUMMARY-SERVICE.md`, che resta il Summary
  della linea Core/WebService;
- `SorgentiTermodel/Library/`, che resta il riferimento dei sorgenti Desktop.

Quando frontend e server devono concordare endpoint, formati, sequenze,
versionamento o comportamento della comunicazione, **questo documento è il
punto comune da aggiornare**.

---

## 0.1 Regola operativa GitHub Actions — IMPORTANTE

Gli incarichi operativi eseguiti tramite GitHub Actions devono seguire la
specifica canonica:

```text
.github/TERMODEL-ACTION-NOTIFICATIONS.md
```

Regola sintetica: `RUNNING -> SUCCESS/FAILED` tramite Commit Status
`Termodel/job`; notifica push telefono solo nello stato terminale; step finale
con `always()`; secret `TERMODEL_NTFY_TOPIC` mai esposto. Il meccanismo è
stato verificato end-to-end il 24 settembre 2026.

---

## 0.2 Decisione 2026-09-24 — persistenza progetto locale

La gestione ordinaria dei progetti torna al frontend: `Apri`, `Salva` e `Salva con nome` operano su file locali. Render/Termodel.WebService viene usato per elaborazione e artifact, non come archivio autorevole dei progetti. Un `POST /api/calculations` deve essere autosufficiente e deve funzionare anche dopo la perdita completa del filesystem Render.

## 0.3 Decisione 2026-09-24 — artifact Pianta pulita

La **Pianta pulita** è l'elaborato architettonico 2D prodotto dal percorso Core
`LeggiDxf -> GeneraPianta` per ogni piano calpestabile. Il formato Web
canonico è SVG `TERMODEL-CLEAN-FLOOR-SVG-V1`, unità centimetri.

Dopo un `POST /api/calculations` riuscito, le piante pulite della stessa
elaborazione devono essere pubblicate nello stesso workspace atomico del
`projectId`, sotto `artifacts/pianta-pulita/`, ed essere elencate dal
catalogo `GET /api/projects/{projectId}/generated-files`.

Lettura canonica per nome piano:

```http
GET /api/projects/{projectId}/artifacts/pianta-pulita/{piano}
```

La lettura restituisce `image/svg+xml`, non riesegue il calcolo e segue lo
stesso stato stale degli altri artifact. Il nome del piano nell'URL è il nome
logico del piano, mentre il nome fisico del file nel workspace è un dettaglio
interno del Service.

Il legacy `GET /api/model/clean-floor/{floorName}` resta compatibile, ma non
deve essere usato dal frontend come riferimento stabile perché non è
projectId-scoped.

## 0.4 Decisione 2026-09-25 — identità runtime Service nel frontend

`GET /health` resta l'endpoint leggero di disponibilità, ma espone anche
l'identità del Service realmente in esecuzione:

```json
{
  "status": "ok",
  "serviceCommit": "<sha completo o stringa vuota>",
  "serviceCommitShort": "<prime 8 cifre o stringa vuota>",
  "spiralEngine": "Diego_Vittorio"
}
```

Il commit runtime viene risolto, in ordine, da
`RENDER_GIT_COMMIT -> GITHUB_SHA -> SOURCE_VERSION`. Il motore spirali
viene invece letto dal resolver autorevole del Core; se
`TERMODEL_SPIRAL_ENGINE` non è configurata il default corrente è
`Diego_Vittorio`. `SpiraliVittorio` resta il riferimento invariato e
`StrategiaDiego` / selettore `Diego` resta disponibile ma PARKED per il
costo computazionale elevato.

Il frontend v1.19 usa questi dati per mostrare nella status bar:

```text
Server fc287c9b · Diego_Vittorio
```

In ambiente locale privo di identificatore commit usa `Server locale · ...`.
Il testo non deve essere costruito da una versione hard-coded del frontend:
deve rappresentare il Service realmente contattato.

## 0.5 Decisione 2026-09-25 — diagnostica selettiva StrategiaDiego

Il Service estende il contratto log headless con la categoria specifica:

```text
SpiraliDiego
```

È una categoria **Service/Core**, aggiuntiva rispetto alle nove categorie
storiche Desktop. La Library Desktop non viene modificata.

Richiesta:

```http
POST /api/calculations?logEnabled=true&logCategories=SpiraliDiego
```

La categoria raccoglie le decisioni strategiche del motore Diego:
ingresso locale, radici mandata/ritorno, espansione dell'albero, scelte
accettate/rifiutate, motivi geometrici principali di rifiuto, terminali,
closure preliminari e aggiornamenti della soluzione migliore.

Il log completo dell'ultima elaborazione valida resta leggibile tramite:

```http
GET /api/projects/{projectId}/logs/termodel
```

Il frontend v1.19 aggiunge nel menu Help:
- checkbox `spiralidiego`, che invia la categoria `SpiraliDiego`;
- comando `Copia log negli appunti`.

Il comando di copia resta disabilitato finché non esiste un log aggiornato
per il `projectId` corrente. Dopo un `Aggiorna Modello` riuscito con almeno
una categoria log attiva, il frontend legge e mantiene in cache il log
corrente; il click successivo esegue soltanto la copia negli appunti, evitando
di dipendere da autorizzazioni clipboard dopo una fetch asincrona.

`logCategories=all` abilita ora undici categorie headless:
le nove categorie Desktop più `SpiraliDiego` e `SpiraliDiegoVittorio`.

La categoria aggiuntiva:

```text
SpiraliDiegoVittorio
```

è una categoria **Service/Core** dedicata alla diagnostica permanente ma
selettiva del motore `Diego_Vittorio`. Usa lo stesso contratto generale:

```http
POST /api/calculations?logEnabled=true&logCategories=SpiraliDiegoVittorio
```

I messaggi hanno sottotag stabili come `Supply.Context`,
`Supply.ComputeOffset.Edge`, `Supply.Offset.Stop`, `Supply.Traverse.*` e
`Supply.Finalize.*`. La categoria non modifica geometria o selezione del
motore; quando non è richiesta i blocchi diagnostici governati da
`IsEnabled(...)` restano inattivi. La Library Desktop non è modificata.

## 0.6 Decisione 2026-09-26 — numerazione diagnostica nodi StrategiaDiego

`POST /api/calculations` accetta il parametro opzionale:

```http
POST /api/calculations?numerazioneSpirali=true
```

Valori ammessi: `true | false`. Il default è `true`.

Con motore `Diego`, quando il parametro è attivo, l'artifact
`pannelli-esecutivo-svg` contiene un layer diagnostico
`<Piano>_SpiraliDebug_Output` con un piccolo numero per ogni nodo della
soluzione selezionata. Lo stesso ID è scritto nel log `SpiraliDiego`.

La numerazione è un overlay SVG di debug: non modifica geometria, scelta del
circuito, DXF tecnico o conteggio delle primitive tecniche. Gli altri motori
non sono modificati da questo parametro.

---

## 1. Obiettivo dell'architettura

Il frontend deve occuparsi principalmente di:

- interazione utente;
- CAD 2D;
- viewer e rappresentazione grafica;
- editing del progetto;
- composizione del file unico;
- visualizzazione degli elaborati restituiti dal server.

Il server deve occuparsi principalmente di:

- validazione del progetto;
- ricostruzione del modello Termodel;
- esecuzione dei calcoli;
- utilizzo della logica condivisibile proveniente dal Desktop;
- produzione degli elaborati derivati;
- esposizione degli elaborati tramite API.

Principio:

```text
FRONTEND
   |
   | file unico di progetto
   v
TERMODEL.WEBSERVICE
   |
   v
TERMODEL.CORE
   |
   | logica Termodel
   v
ARTIFACT DI CALCOLO
   |
   v
FRONTEND / VIEW
```

Il browser non deve diventare un secondo motore Termodel e il WebService non
deve contenere logica algoritmica che può vivere in `Termodel.Core`.

---

## 2. Input autorevole: file unico di progetto

Il formato di scambio principale è:

```text
TERMODEL-PROJECT-TEXT-V1
```

Il frontend invia al server l'intero **progetto tecnico necessario al calcolo**.

Questo non significa che il payload server debba essere identico byte-per-byte
al file locale salvato dal browser.

È già stabilita una distinzione fra:

```text
progetto locale completo
    può contenere risorse puramente frontend

payload server
    contiene il progetto tecnico necessario al calcolo
```

In particolare, gli **sfondi locali del CAD non devono essere trasmessi a
Termodel.Core / Termodel.WebService**.

Prima di `POST /api/calculations`, il frontend dovrà quindi derivare il payload
server dal `TERMODEL-PROJECT-TEXT-V1` corrente eliminando:

- sezioni `assets/backgrounds/*`;
- Data URL/Base64 appartenenti agli sfondi;
- riferimenti SVG usati esclusivamente per ricollegare gli sfondi locali;
- eventuali future risorse equivalenti dichiarate come locali/frontend.

Questa esclusione non riguarda sezioni tecniche del progetto necessarie al
motore, ad esempio `project/DisegnoInput.dxf` quando fa parte del progetto
Termodel e non è soltanto una risorsa grafica locale di sfondo.

Il file unico filtrato inviato al server rappresenta lo **stato autorevole del
progetto tecnico inviato**.

Gli elaborati prodotti dal server sono invece **derivati** da quello stato.

Esempi di sezioni già previste nel file unico:

```text
manifest.json
definition/definizionedati.json
definition/reti-pannelli-definizionedati.json
geometry/project.svg
archives/xml/*.xml
archives/json/*.json
project/DisegnoInput.dxf
thermal/input.xml
thermal/input.json
```

Il server non deve modificare implicitamente il file unico ricevuto mentre
calcola. Un eventuale futuro "progetto aggiornato dal server" dovrà essere
definito come operazione esplicita e separata.

## 2.0.1 Archivi di progetto per completamento pannelli radianti

Revisione del 23 settembre 2026: il modello dati autorevole per il
completamento pannelli radianti usa **due archivi estesi**, non tre:

```text
archives/json/Reti.json
archives/json/TipologiePannelli.json
```

con le corrispondenti sezioni XML:

```text
archives/xml/Reti.xml
archives/xml/TipologiePannelli.xml
```

I metadata sono separati dalla definizione Desktop storica:

```text
definition/reti-pannelli-definizionedati.json
```

### Responsabilità di `Reti`

`Reti` descrive la rete che il progettista sta definendo e raccoglie dati
**indipendenti dal costruttore del pannello**.

La struttura è predisposta per distinguere in futuro tipi di rete quali:

```text
PannelliRadianti
Tubazioni
Canali
...
```

ma nella fase corrente è implementato e precompilato soltanto
`PannelliRadianti`.

La prima riga è:

```text
Codice = RAD-DEFAULT
TipoRete = PannelliRadianti
CodiceTipologiaPannello = GEN-DEFAULT
```

Per la rete pannelli contiene almeno:

- tipologia pannello selezionata;
- passo scelto per quella rete;
- fluido, attualmente `Acqua`;
- temperatura mandata;
- temperatura ritorno;
- temperatura ambiente;
- temperatura esterna di progetto;
- lunghezza massima circuito;
- perdita di carico massima circuito;
- coefficiente `KLayout` per la stima lunghezza spirale;
- formula di perdita, inizialmente `Darcy-Weisbach`;
- stato attivo.

Il passo scelto è un **dato della rete/progetto**. Deve appartenere ai passi
ammessi dalla tipologia pannello selezionata. La validazione/combo dipendente
dei passi sarà completata quando verrà definita la gestione CAD della rete.

Le proprietà fisiche dell'acqua non vengono più replicate in un archivio
`Fluidi`: per il primo solver saranno derivate dalla temperatura media
dell'acqua. Eventuali fluidi diversi dall'acqua saranno una futura estensione
del programma generalista.

### Responsabilità di `TipologiePannelli`

`TipologiePannelli` è codificato per:

```text
CasaProduttrice + Modello
```

e contiene dati dipendenti dal prodotto/sistema:

- codice;
- casa produttrice;
- modello e descrizione;
- materiale tubo;
- diametro esterno;
- spessore;
- diametro interno;
- rugosità assoluta;
- presenza barriera ossigeno;
- elenco dei passi disponibili;
- lunghezza matassa;
- coefficiente di resa usato dal modello pannelli corrente;
- stato attivo.

L'elenco dei passi è necessario in particolare per sistemi con geometria
vincolata, per esempio pannelli a funghetti. Nella prima riga
`Generico / Default Termodel` è memorizzato come elenco separato da `;`:

```text
50;100;150;200;250;300
```

Il progetto default seleziona 300 mm per mantenere il precedente valore
hard-coded `PassoTubi = 0,30 m`.

### Regole di contratto

- `definizionedati.json` storico non viene modificato;
- `POST /api/projects/new` deve creare `Reti` e
  `TipologiePannelli` già precompilati;
- il `ProgettoVuoto` consolidato del frontend deve contenere gli stessi due
  archivi;
- i nuovi progetti **non devono più generare** gli archivi separati
  `Tubazioni` e `Fluidi`;
- apertura, modifica e ricostruzione del file unico devono conservare i due
  archivi;
- il frontend espone nel menu `Modifica`:
  `Archivio Reti` e `Archivio Tipologie pannelli`;
- `ArchivioWeb` legge i metadata da
  `definition/reti-pannelli-definizionedati.json`;
- per compatibilità transitoria, il caricatore frontend può ancora leggere la
  precedente sezione
  `definition/pannelli-tubazioni-definizionedati.json` se presente in un
  progetto già creato, senza però rigenerarla nei nuovi progetti;
- le vecchie sezioni `Tubazioni` e `Fluidi` presenti in un progetto
  precedente non vanno eliminate automaticamente al solo caricamento/salvataggio:
  sono dati legacy da preservare finché non viene definita una migrazione;
- `Reti` e `TipologiePannelli` sono dati tecnici del progetto e non devono
  essere filtrati dal payload inviato a `POST /api/calculations`;
- il contenitore resta `TERMODEL-PROJECT-TEXT-V1`.

### Selezione rete e primitive Tubo nel CAD 2D

Implementazione del 23 settembre 2026.

Il pannello principale del CAD 2D espone:

```text
Modalità = Edificio | Rete
Rete     = Reti.Codice
Piano    = Piani.Nome
```

Il piano resta sempre selezionabile anche in modalità `Rete`: una stessa rete
può quindi svilupparsi su più piani. In modalità `Rete` la sola entità
disegnabile corrente è `Tubo`.

Per `TipoRete=PannelliRadianti` il frontend segue la convenzione già usata
dal Desktop in `ScriptCad.TipoComandoEnum.Tubo` e letta da
`IoPannelli.LeggiTubiDXF`:

```text
layer    = <Piani.Nome>_tubipannelli
colore   = ACI 1 (rosso)
linetype = Continuous
```

Ogni segmento Tubo nello SVG operativo deve essere una `line` tecnica e
conservare almeno:

```xml
<line
  id="T001"
  ...
  data-termodel-piano="<Piani.Nome>"
  data-termodel-layer="<Piani.Nome>_tubipannelli"
  data-termodel-entity="Tubo"
  data-termodel-rete="<Reti.Codice>"
  data-termodel-linetype="Continuous"
  data-termodel-color="1" />
```

Regole:

- gli ID `T001`, `T002`, ... sono identificatori frontend stabili della
  primitiva e non sostituiscono il codice rete;
- `data-termodel-rete` associa la geometria alla riga `Reti` selezionata;
- il layer resta quello storico Desktop perché il codice di riferimento cerca
  esattamente `<NomePiano>_tubipannelli`;
- la trasformazione in `TERMODEL-PROJECT-SVG-V1` conserva la linea e i suoi
  metadata tecnici; `SvgDxfReader` usa
  `data-termodel-layer/data-termodel-linetype/data-termodel-color` per
  ricostruire la corrispondente linea nel `DxfDocument` virtuale;
- `data-termodel-rete` è conservato nel Virtual CAD e viene usato dal primo
  adapter idraulico Core per associare i segmenti Tubo alla riga `Reti`;
- il disegno Tubo è sequenziale/multiplo come quello Parete; `Chiudi` diretto
  è ammesso, mentre `Chiudi ortogonale` non è disponibile in modalità Rete;
- `GeneraPianta.js` deve ignorare le linee Tubo nella polygonizzazione
  architettonica: solo le linee E/W partecipano alla ricostruzione dei locali.

Il Core headless accetta il layer tubi al confine
`LeggiDxf -> IoPannelli.LeggiTubiDXF`. Inoltre `SvgDxfReader` conserva
nel `UserData` della linea virtuale l'identificatore, il piano, l'entità e
`Reti.Codice`, senza alterare il contratto netDxf visto dal codice Desktop.

### Primo calcolo idraulico pannelli — artifact `pannelli`

Dal 23 settembre 2026 `POST /api/calculations` esegue anche il primo adapter
headless dei pannelli radianti e pubblica:

```http
GET /api/projects/{projectId}/artifacts/pannelli
Content-Type: application/json
```

Il formato corrente è:

```text
TermodelRadiantPanels v1
```

Il calcolo usa gli archivi **XML runtime** del file unico:

```text
Reti
  -> TipoRete=PannelliRadianti
  -> CodiceTipologiaPannello
  -> PassoSelezionatoMm
  -> temperature
  -> limiti lunghezza/perdita
  -> KLayout
  -> FormulaPerdita

TipologiePannelli
  -> diametro interno
  -> rugosità
  -> passi disponibili
  -> coefficiente resa
```

Regole implementate:

- `PassoSelezionatoMm` deve appartenere a
  `TipologiePannelli.PassiDisponibiliMm`; in caso contrario
  `POST /api/calculations` fallisce con progetto non valido e l'ultimo
  artifact valido non viene sostituito;
- attualmente sono supportati `Fluido=Acqua` e
  `FormulaPerdita=Darcy-Weisbach`;
- segmenti Tubo geometricamente connessi entro 1 mm vengono raggruppati come
  un circuito CAD;
- la lunghezza delle centerline Tubo è espressa in metri dopo la conversione
  canonica SVG cm -> Virtual CAD;
- il fattore tubo per passo usa i valori registrati nel programma Tubazioni
  (50→20; 100→10; 125→8; 150→6,7; 175→5,8; 200→5; 300→3,4 m/m²) e fallback
  `1000/passo_mm`;
- densità e viscosità dell'acqua sono derivate dalla temperatura media;
- il fattore Darcy usa `64/Re` in laminare, Colebrook in turbolento e una
  transizione diagnosticata fra Re 2300 e 4000;
- l'artifact espone almeno lunghezza, area servita stimata, passo, portata,
  diametro, velocità, Reynolds, fattore Darcy, Pa/m, Pa e kPa per circuito.

Nella **prima versione operativa**, il CAD manuale non distingue ancora nello
stesso circuito la spirale interna dai collegamenti al collettore. La
centerline Tubo viene quindi trattata come lunghezza idraulica effettiva;
l'area servita viene ricavata inversamente da lunghezza/passo/KLayout. La
portata è una **portata preliminare derivata** dalla resa
`CoefficienteResaWm2K`, dalla differenza fra temperatura media acqua e
ambiente e dal salto mandata/ritorno.

Non sono ancora inclusi nella perdita:

- collettore;
- valvole e flussimetri;
- perdite concentrate;
- distribuzione primaria.

### Identità esplicita del circuito, senza grafo generalista

Decisione consolidata del 24 settembre 2026 sul progetto reale di regression:
la sola connettività geometrica non è sufficiente a rappresentare il CAD
manuale dei pannelli. Più sequenze Tubo possono infatti partire dallo stesso
punto di collettore usando lo snap e restare circuiti idraulici distinti.

Il CAD Web assegna quindi a ogni nuova sequenza Tubo un identificatore stabile:

```text
data-termodel-circuito="C001"
data-termodel-circuito="C002"
...
```

Tutti i segmenti creati nella stessa sequenza conservano lo stesso
`data-termodel-circuito`, insieme a `data-termodel-rete`, piano e layer.
Una nuova sequenza riceve un nuovo codice circuito anche quando il suo primo
punto viene agganciato con Snap Vicino/Estremo a un tubo esistente.

Il Core conserva il metadato nel Virtual CAD e applica la seguente precedenza:

```text
data-termodel-circuito presente
    -> raggruppamento per circuito dichiarato dal CAD

data-termodel-circuito assente (progetti legacy)
    -> fallback: 1 componente geometrica connessa = 1 circuito
```

Questo permette a circuiti diversi di condividere geometricamente un punto
di collettore senza essere fusi in un'unica componente ramificata. Se uno
stesso circuito dichiarato contiene più componenti disconnesse, il Core le
separa e produce diagnostica invece di sommarle silenziosamente.

La modifica **non introduce il grafo generalista di rete**: collettore
topologico, percorso sfavorito, sizing, equilibratura, perdite concentrate e
distribuzione primaria restano nella futura fase **Tubi universale**. Il
kernel Darcy per circuito resta parte stabile e riusabile del Core.

### Esecutivo pannelli con default corrente

Il Service usa **StrategiaDiego** come motore spirali di default; gli override
espliciti `Vittorio | GPT | Diego` restano disponibili tramite
`TERMODEL_SPIRAL_ENGINE`. Il passo corrente del banco prova resta 0,30 m,
coerente con il progetto iniziale `RAD-DEFAULT` che seleziona 300 mm.

`POST /api/calculations`, quando dispone di locali e tubi pannelli idonei,
può quindi pubblicare anche:

```http
GET /api/projects/{projectId}/artifacts/pannelli-esecutivo-svg
GET /api/projects/{projectId}/artifacts/pannelli-esecutivo-dxf
```

Gli artifact persistiti sono:

```text
artifacts/pannelli-esecutivo.svg
artifacts/pannelli-esecutivo.dxf
```

Il principio di equivalenza è vincolante: **SVG e DXF non sono due disegni
ricalcolati separatamente**. Il Core costruisce un unico modello grafico
esecutivo neutro e lo serializza nei due formati. Il contenuto equivalente
comprende, per il perimetro supportato:

- **pianta pulita reale del piano** prodotta dal percorso headless
  `GeneraPianta`, importata nello stesso modello esecutivo prima delle
  spirali; i suoi contorni conservano gli offset ricavati dagli spessori
  effettivi delle pareti del progetto e vengono pubblicati sul layer
  `<Piano>_PiantaPulita_Output`;
- simboli/linee della pianta pulita, quando presenti, su
  `<Piano>_PiantaPulitaSimboli_Output`;
- andata/mandata rossa sul layer `<Piano>_PannelliMandata_Output`;
- ritorno blu sul layer `<Piano>_PannelliRitorno_Output`;
- box e numero circuito verdi su `<Piano>_NumeriCircuiti_Output`, quando
  prodotti dal motore selezionato.

La precedente geometria base a linee `<Piano>_Edificio_Output` resta solo
fallback di compatibilità se, per un progetto legacy, la pianta pulita non è
disponibile. L'esecutivo non deve ricostruire artificialmente gli spessori:
riusa l'SVG canonico `TERMODEL-CLEAN-FLOOR-SVG-V1` generato nella stessa
elaborazione.

Il formato SVG dichiara:

```text
TERMODEL-PANNELLI-ESECUTIVO-SVG-V1
```

e mantiene lo stesso insieme di primitive tecniche del DXF OUT della
milestone. La diversa convenzione dell'asse Y nel rendering SVG è una
trasformazione di presentazione, non un secondo modello geometrico.

Il **grafo non viene riattivato** da questa funzione. In assenza di
`retePannelli.xml`, come nel percorso Desktop, disposizione degli attacchi
sul collettore e disegno del collettore restano no-op. Questa responsabilità
rimane rimandata a **Tubi universale**.

Limitazione intenzionale: il motore condiviso usa ancora
`PassoTubi=0,30 m` compile-time e un workspace temporaneo
`locale.xml/locale.svg`. Per questa milestone è usato esclusivamente con il
default corrente richiesto. La futura generalizzazione dei passi dovrà
rendere parametrico/headless lo stesso motore condiviso; non va creata una
seconda implementazione nel WebService.

### Canale universale dei file generati

Dal 23 settembre 2026 gli elaborati derivati non devono richiedere un nuovo
endpoint specifico per ogni futuro disegno o report. Il Service espone un
catalogo read-only del workspace di calcolo:

```http
GET /api/projects/{projectId}/generated-files
```

Contratto catalogo:

```text
TERMODEL-GENERATED-FILES-V1
```

Ogni voce contiene almeno:

```text
path
fileName
category
contentType
size
lastWriteTimeUtc
inline
stale
href
```

Il file si legge tramite l'`href` restituito, che usa la forma:

```http
GET /api/projects/{projectId}/generated-files/{relativePath}
```

Il canale è intenzionalmente limitato a:

```text
artifacts/**
logs/**
```

e **non** può esporre `project.tmdl`, file di configurazione del server o
percorsi arbitrari. Il Service normalizza il path, rifiuta traversal e invia
`X-Content-Type-Options: nosniff`. SVG/HTML sono inoltre serviti con una
Content-Security-Policy sandbox.

Content type già riconosciuti comprendono JSON, SVG, DXF, PDF, CSV, TXT,
Markdown, XML e i principali formati immagine. Gli endpoint specifici
esistenti restano validi per retrocompatibilità.

`POST /api/calculations` restituisce anche:

```json
{
  "generatedFilesHref": "/api/projects/{projectId}/generated-files"
}
```

Questo è il canale previsto per futuri:

- disegni;
- report;
- tabelle CSV;
- PDF;
- elaborati DXF/SVG;
- risultati JSON;
- log diagnostici.

### Procedura diagnostica permanente Render → GitHub → AI

Questa procedura è parte **normativa** del contratto operativo fra frontend,
Service e sviluppo AI.

Il flusso utente da usare quando una chat deve esaminare ciò che il Service
ha realmente prodotto è:

```text
Aggiorna Modello
    ↓
Pubblica snapshot
    ↓
"esamina l'ultimo snapshot"
```

La pubblicazione **non avviene automaticamente** a ogni
`POST /api/calculations`. Viene eseguita soltanto su richiesta esplicita
tramite:

```http
POST /api/projects/{projectId}/publish-session-snapshot
X-Termodel-Snapshot-Key: <chiave amministrativa>
```

Lo snapshot usa esclusivamente i file derivati già pubblicabili dal canale
`generated-files` e li rende persistenti sul branch GitHub:

```text
service-snapshots
```

Per una chat AI la procedura obbligatoria di lettura è:

```text
branch service-snapshots
  -> service-snapshots/LATEST.json
  -> <rootPath>/manifest.json
  -> artifact/log necessari
```

L'utente **non deve** copiare manualmente SVG, DXF, JSON, report o log già
presenti nello snapshot e non deve comunicare lo `snapshotId`: il file
`LATEST.json` individua l'ultima sessione pubblicata.

La chiave `TERMODEL_SNAPSHOT_ADMIN_KEY` e il token
`TERMODEL_SNAPSHOT_GITHUB_TOKEN` sono secret server e **non devono essere
inseriti nel frontend né incollati in chat**.

Persistenza:

- il workspace Render Free può essere azzerato da redeploy/riavvio;
- lo snapshot GitHub resta persistente;
- attualmente **non esiste pulizia automatica** degli snapshot;
- `LATEST.json` punta soltanto all'ultimo, senza cancellare i precedenti;
- una futura retention automatica deve essere deliberata esplicitamente
  prima di eliminare snapshot storici.

La procedura completa, incluse le istruzioni per l'utente e per ogni nuova
chat, è autorevole in:

```text
Server/Termodelwebservice/docs/SERVICE-SNAPSHOT-DIAGNOSTIC.md
```

Il collegamento reale Render → GitHub → lettura AI è stato verificato il
23 settembre 2026.

### Esecutivo pannelli SVG come sfondo runtime CAD2D

Il frontend v1.05 usa il catalogo universale per recuperare
`artifacts/pannelli-esecutivo.svg`.

Nel menu **Sfondo** del CAD2D sono disponibili:

```text
↻ Esecutivo pannelli SVG
Mostra esecutivo calcolato
```

L'esecutivo è un **overlay runtime di verifica**.

Comportamento frontend aggiornato il **24 settembre 2026**:

- dopo un `POST /api/calculations` completato, il frontend tenta automaticamente di recuperare dal catalogo universale `artifacts/pannelli-esecutivo.svg`;
- se il file esiste ed è valido, viene caricato come overlay, `Mostra esecutivo calcolato` viene abilitato e spuntato e il CAD2D viene ridisegnato immediatamente;
- se il file non esiste, l'assenza dell'esecutivo non rende fallito `Aggiorna Modello`: il controllo resta disabilitato;
- il comando `Esecutivo pannelli SVG` resta disponibile come ricarica manuale dell'ultimo artifact corrente.

Proprietà dell'overlay:

- non viene inserito in `cadWorkingDoc`;
- non entra nello stack Undo/Redo;
- non modifica `TERMODEL-PROJECT-TEXT-V1`;
- non viene reinviato al Service con il calcolo successivo;
- può essere mostrato/nascosto indipendentemente dagli sfondi importati;
- in un progetto multipiano vengono visualizzate soltanto le primitive con
  `data-piano` corrispondente al piano CAD corrente.

Per consentire l'allineamento metrico con il CAD, l'SVG esecutivo dichiara:

```text
data-coordinate-unit="m"
data-termodel-max-y="..."
```

Il frontend converte le coordinate del modello esecutivo in centimetri e
annulla la sola trasformazione dell'asse Y usata dal writer SVG. I testi
vengono ricostruiti senza specchiatura.

## 2.1 Standard del payload Frontend → Service

Il file trasmesso dal frontend a `POST /api/calculations` mantiene il formato:

```text
TERMODEL-PROJECT-TEXT-V1
```

Non viene introdotta una seconda versione del progetto soltanto per il server:
si tratta dello stesso contenitore, derivato dallo stato corrente del progetto
e filtrato delle sole risorse locali/frontend.

Trasporto:

```http
Content-Type: text/plain; charset=utf-8
```

Struttura del contenitore:

```text
[TERMODEL-PROJECT-TEXT-V1]
---BEGIN:manifest.json---
...
---END:manifest.json---
---BEGIN:geometry/project.svg---
...
---END:geometry/project.svg---
...
[END-TERMODEL-PROJECT-TEXT-V1]
```

Regole normative del payload server:

- `manifest.json` e `geometry/project.svg` devono essere presenti;
- le sezioni tecniche del progetto devono essere conservate, comprese quelle
  necessarie al motore come archivi, input termici e
  `project/DisegnoInput.dxf` quando previsto dal progetto;
- tutte le sezioni `assets/backgrounds/*` devono essere escluse;
- il payload non deve contenere Data URL/Base64 appartenenti agli sfondi CAD;
- da `geometry/project.svg` devono essere eliminati gli elementi/riferimenti
  usati esclusivamente per visualizzare o reidratare tali sfondi;
- geometria tecnica, simboli, attributi Termodel e dati necessari al calcolo non
  devono essere eliminati;
- dopo il filtraggio, l'eventuale elenco delle sezioni e i relativi hash nel
  `manifest.json` devono descrivere il payload realmente trasmesso, non il file
  locale completo;
- il server tratta il testo ricevuto come input immutabile della specifica
  elaborazione;
- `geometry/project.svg` nel payload server deve usare il formato tecnico
  `TERMODEL-PROJECT-SVG-V1`, con namespace SVG e
  `data-termodel-units="cm"`;
- nel blocco tecnico `FIN` prodotto dal CAD Web, gli attributi dimensionali
  `LARGHEZZA`, `ALTEZZA`, `SOTTOFINESTRA` e `SOPRALUCE` sono espressi
  in **centimetri**, coerentemente con l'unità dello SVG; il confine
  `SvgDxfReader` li converte in **metri** quando ricostruisce il blocco
  netDxf atteso dal motore Desktop storico. `NUMEROANTE` resta un intero e
  non subisce conversioni;
- i piani devono essere figli diretti `g` della radice SVG e dichiarare
  `data-termodel-floor-id`, `data-termodel-name`,
  `data-termodel-role`, `data-termodel-file`,
  `data-termodel-layer` e `data-termodel-order`;
- dentro ogni gruppo di piano il reader corrente accetta come entità tecniche
  dirette `line` e `text`/blocchi; lo SVG operativo locale del CAD può
  avere una struttura diversa, ma deve essere trasformato nella forma tecnica
  canonica prima del POST senza alterare il progetto locale.

Il file locale completo può quindi continuare a contenere sfondi e altre
risorse di lavoro del browser, mentre il payload server contiene soltanto il
progetto tecnico.

## 2.2 Standard dell'artifact grafico Server → Frontend

L'artifact logico:

```text
model3d
```

usa come formato grafico condiviso:

```text
TermodelWebModel v3
```

e viene restituito come:

```http
Content-Type: application/json
```

Questo JSON è il formato destinato al redraw 3D dopo l'elaborazione autorevole
del progetto da parte del server. Deriva dalle primitive finali del motore
Termodel/DrawBim e non è una copia del progetto né un formato di editing.

Struttura radice:

```json
{
  "format": "TermodelWebModel",
  "version": 3,
  "coordinateSystem": "Z-up",
  "generatedAtUtc": "2026-09-21T00:00:00Z",
  "primitiveCount": 1,
  "primitives": []
}
```

Campi radice:

- `format`: deve essere `TermodelWebModel`;
- `version`: versione del formato, attualmente `3`;
- `coordinateSystem`: coordinate Termodel finali, attualmente `Z-up`;
- `generatedAtUtc`: istante di generazione in formato temporale ISO;
- `primitiveCount`: numero delle primitive;
- `primitives`: elenco delle primitive grafiche.

Ogni primitiva può contenere:

```json
{
  "kind": "mesh",
  "source": "MeshGeometry3D",
  "parte": "mesh",
  "numero": 1,
  "id": "elemento",
  "tipo": "Parete",
  "descrizione": "",
  "filterMetadata": true,
  "piano": "Piano Terra",
  "confine": "Esterno",
  "separatore": false,
  "stessaZona": false,
  "fittizia": false,
  "falda": false,
  "color": "#A0522D",
  "opacity": 1.0,
  "lineWidth": 1.0,
  "text": "",
  "vertices": [[0,0,0],[1,0,0],[1,1,0]],
  "indices": [0,1,2]
}
```

Significato:

- `kind`: tipo grafico; i valori correnti comprendono `mesh`,
  `lineSegments` e `label`;
- `source` e `parte`: provenienza e porzione grafica della primitiva;
- `numero`, `id`, `tipo`, `descrizione`: collegamento informativo con
  l'elemento Termodel;
- `filterMetadata`: indica se sono disponibili metadati completi per i filtri;
- `piano`, `confine`, `separatore`, `stessaZona`, `fittizia`, `falda`:
  metadati necessari a riprodurre i Filtri Grafici del Desktop;
- `color`: colore RGB `#RRGGBB`;
- `opacity`: opacità numerica;
- `lineWidth`: spessore logico per primitive lineari;
- `text`: testo delle eventuali label;
- `vertices`: coordinate finali `[x,y,z]` nel sistema `Z-up`;
- `indices`: indici dei vertici; triangoli per le mesh e coppie per i segmenti.

Regole di consumo frontend:

- il redraw 3D deve ricostruire la scena dall'artifact senza ricalcolare il
  modello Termodel nel browser;
- la conversione dal sistema `Z-up` di Termodel al sistema grafico usato dal
  viewer è responsabilità del frontend e non modifica il JSON;
- se `filterMetadata=false`, il frontend non deve inventare piano, confine o
  altri metadati mancanti;
- campi aggiuntivi compatibili possono essere ignorati dai client che non li
  conoscono;
- un `kind` non ancora supportato dal viewer non deve rendere inutilizzabile
  l'intero artifact;
- questo JSON è un risultato derivato del workspace corrente del progetto: non deve essere usato per
  ricostruire o sostituire il `TERMODEL-PROJECT-TEXT-V1`;
- leggere nuovamente `model3d` per lo stesso `projectId` non deve
  provocare una nuova elaborazione.

Le fonti implementative correnti del formato sono
`SorgentiTermodel/Work/Web/DrawBimJson.cs`,
`Server/Termodelwebservice/src/Termodel.Core/Model3D/TermodelWebModel.cs` e il
renderer di `docs/termodel-ui-demo/app.js`. Il contratto resta comunque il
riferimento comune fra frontend e server.

---

## 2.3 Conversione DXF → SVG di sfondo

La conversione di un file DXF scelto come sfondo del CAD 2D è una funzione
derivata e non deve più essere eseguita dal JavaScript del frontend.

Responsabilità correnti:

```text
frontend
  legge il DXF solo per mostrare rapidamente layer/opzioni nel dialog
  invia DXF originale + opzioni
        |
        v
POST /api/dxf/to-svg
        |
        v
Termodel.Core.Cad.DxfSvgConverter
        |
        v
SVG normalizzato in centimetri Termodel
```

Endpoint:

```http
POST /api/dxf/to-svg
Content-Type: application/json
```

Payload:

```json
{
  "dxfText": "0\nSECTION\n...",
  "layers": ["MURI", "SERRAMENTI"],
  "unit": "mm",
  "curves": true,
  "convertText": false,
  "explodeBlocks": false,
  "profile": "architectural"
}
```

Regole:

- `dxfText` contiene il DXF ASCII originale selezionato dall'utente;
- `layers` contiene i layer selezionati nel dialog; se omesso il Core usa
  tutti i layer disponibili, mentre un array esplicitamente vuoto non produce
  geometria;
- `unit` ammette `mm`, `cm`, `m`; se omesso viene dedotta da
  `$INSUNITS`, con fallback storico a centimetri;
- `curves` abilita ARC/CIRCLE/ELLIPSE/SPLINE e i bulge delle polilinee;
- `convertText` abilita TEXT/MTEXT;
- `explodeBlocks` abilita INSERT e l'esplosione ricorsiva dei blocchi;
- `profile` ammette `manual` e `architectural`; se omesso resta
  `manual` per retrocompatibilità;
- con `architectural` il Core filtra automaticamente layer evidentemente
  annotativi/non architettonici (quote, retini, testi, arredi, Defpoints),
  scarta layer in cui quote/testi/retini prevalgono sulla geometria utile e
  abilita le curve anche se `curves=false`, così porte e aperture restano
  leggibili;
- il profilo architettonico applica inoltre una gerarchia grafica leggera:
  sezioni/muri/strutture più marcati, proiezioni/infissi più leggeri;
- input non convertibile o selezione che non produce geometria restituiscono
  HTTP `422`;
- la conversione è headless e vive in `Termodel.Core`: il WebService non
  contiene un secondo algoritmo CAD;
- il Core non dipende da WPF o Helix per questa funzione.

Risposta JSON:

```json
{
  "svgText": "<svg ...>...</svg>",
  "stats": {
    "converted": 1,
    "ignored": 0,
    "unsupported": 0,
    "explodedBlocks": 0
  },
  "bounds": {
    "minX": 0,
    "minY": 0,
    "maxX": 100,
    "maxY": 0,
    "width": 100,
    "height": 0.000001
  },
  "viewBox": [-2, -2, 104, 4.000001],
  "drawingUnit": "mm",
  "unitScaleToCm": 0.1,
  "realWidthMeters": 1,
  "realHeightMeters": 0.00000001,
  "originOffsetCm": { "x": 0, "y": 0 },
  "unitsCode": 4,
  "unitsLabel": "mm",
  "profile": "architectural",
  "appliedLayers": ["0", "01-SEZIONI", "02-PROIEZIONI"]
}
```

Lo `svgText` conserva la convenzione già usata dal CAD Web:
coordinate in centimetri, origine geometrica normalizzata, gruppi identificati
con `data-dxf-layer` e metadata
`data-termodel-dxf-plotter/data-termodel-source-unit`. Nel profilo
architettonico i gruppi possono contenere anche `data-dxf-role` con
`section`, `projection` o `base`; la radice dichiara
`data-termodel-dxf-profile="architectural"`.

Il frontend continua a usare il parser JS leggero soltanto per popolare il
dialog e stimare le entità prima della conferma; quel parser non è autorizzato
a generare lo SVG operativo. Il default UI usa il profilo architettonico,
deseleziona i layer annotativi evidenti e abilita le curve. Se l'utente cambia
manualmente layer o opzioni grafiche, il frontend passa al profilo `manual`
e il Service rispetta esattamente la selezione.

Regression fixture reale consolidata:
`Server/Termodelwebservice/tests/fixtures/Farmacia.dxf.gz.b64`. È la copia
lossless gzip/base64 del DXF originale SHA-256
`81b7e14c361b0b5de94a877c715091b77a42f599c6a757ca1fc2906251496adc`.
Il regression smoke ricostruisce il file byte-per-byte e verifica che il
profilo architettonico applichi i layer `0`, `01-SEZIONI` e
`02-PROIEZIONI`, escluda `03-QUOTE` e `04-RETINI`, conservi unità in
metri e produca una pianta circa 19,05 × 17,153 m.


## 2.5 projectId tecnico del progetto

Decisione architetturale aggiornata **24 settembre 2026**:

- il file `TERMODEL-PROJECT-TEXT-V1` salvato dall'utente è la copia autorevole del progetto;
- `projectId` non identifica più una persistenza autorevole sul Service;
- il frontend può leggere un `projectId` già presente nel manifest oppure generarne localmente uno UUID quando serve una elaborazione server;
- il Service usa `projectId` come chiave tecnica per raggruppare gli artifact prodotti dall'ultimo `POST /api/calculations`;
- dopo un redeploy o una perdita del filesystem Render il frontend deve poter ricalcolare semplicemente reinviando il file progetto completo, senza una preventiva apertura/registrazione sul Service;
- `POST /api/projects/allocate-id` resta disponibile soltanto per compatibilità con client precedenti e non fa parte del flusso frontend corrente.

Il `projectId` può restare nel manifest per continuità e correlazione diagnostica, ma non rende il file locale dipendente dallo stato del server.


## 2.6 Operazioni progetto: Apri, Salva, Salva con nome

Dal **24 settembre 2026** queste operazioni sono responsabilità esclusiva del frontend.

### Apri progetto

`File → Apri...` apre un file locale `.termodel.txt` / testo compatibile tramite il file picker del browser e lo carica con il normale loader `TERMODEL-PROJECT-TEXT-V1`.

Non deve interrogare `GET /api/projects` né `POST /api/projects/{projectId}/open`.

### Salva progetto

`File → Salva` ricostruisce il progetto corrente con `buildCurrentProjectText()` e genera localmente il download del file progetto usando il nome corrente.

Non deve eseguire `PUT /api/projects/{projectId}/save`.

### Salva progetto con nome

`File → Salva con nome` chiede il nome file e genera localmente un nuovo download del medesimo progetto aggiornato.

Non deve eseguire `PUT /api/projects/{projectId}/save-as`.

Gli endpoint server di apertura/salvataggio possono restare temporaneamente disponibili per compatibilità, ma non sono usati dal frontend Termodel Web corrente e non sono fonte autorevole dei progetti.


## 2.7 Lock progetto e compatibilità legacy

Il frontend corrente non acquisisce lock server, non invia heartbeat e non rilascia lock in chiusura pagina.

Gli endpoint di lock/open/save introdotti nella fase di persistenza server restano **legacy compatibili** finché non verranno deprecati esplicitamente. Non devono però essere richiesti da `Aggiorna Modello`.

L'isolamento delle elaborazioni concorrenti sul Service è gestito internamente per `projectId` dal `ProjectStore`; non richiede un token di modifica dal browser nel flusso corrente.


## 2.8 Profilo di pretest remoto Render

Render ospita il WebService di calcolo, non l'archivio autorevole dei progetti utente.

Con il piano Free il filesystem può essere azzerato da redeploy/rebuild. Questo è accettabile perché:

- i progetti vengono aperti e salvati localmente dal frontend;
- ogni `POST /api/calculations` contiene il progetto tecnico completo necessario al calcolo;
- gli artifact server sono una cache/istantanea di elaborazione ricreabile;
- la perdita del workspace Render non impedisce di riaprire il progetto;
- per ricostruire gli artifact è sufficiente premere nuovamente `Aggiorna Modello`.

Il cold start Render resta una caratteristica operativa del Service remoto.

## 2.9 Feedback utenti verso GitHub

Decisione architetturale del **23 settembre 2026**.

I suggerimenti/bug inviati dagli utenti non devono produrre commit automatici
nel branch `main` e il container Render non deve eseguire `git push`.

La destinazione scelta è **GitHub Issues** del repository:

```text
Fetonte1960/Termodel
```

Il browser invia il feedback esclusivamente al Termodel.WebService:

```http
POST /api/feedback
Content-Type: application/json
Origin: https://www.termodel.it
```

Payload previsto:

```json
{
  "message": "Testo del suggerimento o problema",
  "category": "suggestion",
  "title": "Titolo opzionale",
  "page": "/termodel-ui-demo/",
  "appVersion": "0.98"
}
```

Campi:
- `message`: obbligatorio;
- `category`: `suggestion`, `bug`, `question` oppure `other`;
- `title`: opzionale;
- `page`: opzionale, percorso/pagina applicativa senza dati personali;
- `appVersion`: opzionale.

Il Service crea una GitHub Issue e restituisce, a creazione riuscita:

```json
{
  "status": "created",
  "issueNumber": 123,
  "issueUrl": "https://github.com/Fetonte1960/Termodel/issues/123"
}
```

Regole di sicurezza/privacy:
- il token GitHub resta **solo sul server** e non viene mai inviato al frontend;
- usare un fine-grained token con accesso al solo repository Termodel e
  permesso minimo `Issues: Read and write`;
- il Service non allega automaticamente file progetto, `projectId`, email, IP,
  cookie o contenuti tecnici del progetto alla Issue;
- il body utente è validato per lunghezza e categoria;
- l'endpoint accetta soltanto l'origine Web Termodel configurata;
- è previsto un rate-limit server-side per limitare abusi/spam;
- se la configurazione GitHub non è disponibile l'endpoint restituisce un
  errore strutturato e non salva il feedback nel filesystem effimero Render.

Configurazione prevista lato Service/Render:

```text
TERMODEL_FEEDBACK_GITHUB_TOKEN=<secret>
TERMODEL_FEEDBACK_REPOSITORY=Fetonte1960/Termodel
TERMODEL_FEEDBACK_ALLOWED_ORIGIN=https://www.termodel.it
TERMODEL_FEEDBACK_GITHUB_API_BASE_URL=https://api.github.com
```

`TERMODEL_FEEDBACK_GITHUB_TOKEN` deve essere configurato come secret
dell'hosting, mai nel repository.

Il frontend `Invia suggerimento` sarà un intervento separato; questa sezione
definisce il contratto dell'endpoint server.

---
## 3. Operazione principale: AggiornaCalcolo

L'azione concettuale principale fra frontend e server è:

```text
AggiornaCalcolo
```

Endpoint:

```http
POST /api/calculations
Content-Type: text/plain; charset=utf-8
```

**Stato implementazione aggiornato 24 settembre 2026:** `POST /api/calculations`
legge `manifest.projectId` dal file completo ricevuto dal frontend e crea o
sostituisce direttamente il workspace tecnico `SavedProjects/{projectId}/`,
anche se l'ID non era stato precedentemente allocato o il filesystem Render è
stato ricreato. `POST /api/projects/allocate-id` resta soltanto compatibile
con i client precedenti. `model3d` viene scritto nel workspace tecnico e letto
tramite `GET /api/projects/{projectId}/artifacts/model3d` senza ricalcolo.
Il precedente snapshot RAM per-elaborazione e la relativa route artifact sono
stati rimossi dal WebService.

### Commissione frontend — modalità Copertura e simbolo Colmo

Stato: **ESEGUITO** — 21 settembre 2026.

Riferimenti usati:

- `docs/infotermodelGPT.html`;
- `SorgentiTermodel/Library/leggidxf/CadGPT.xaml.cs`;
- `SorgentiTermodel/Library/leggidxf/ScriptCad.cs`;
- `SorgentiTermodel/Library/MainWindow.xaml`;
- `Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/Leggidxf/LeggiDxf.cs`;
- `Server/Termodelwebservice/src/Termodel.Core/NetDxfCompat/SvgDxfReader.cs`.

Termodel Web v0.77 implementa la modalità CAD specifica per
`Piani.Tipo=Copertura`:

- lo sfondo locale duplicato o derivato dal DisegnoInput viene visualizzato
  in grigio e con opacità ridotta;
- i comandi Porta/Finestra, Finestra 2 punti e Ponte vengono nascosti;
- il comando di linea resta disponibile con dicitura
  `Linea perimetro falde`;
- il blocco tecnico `LOC` resta invariato ma nel CAD viene presentato come
  `Centrofalda`;
- compare il comando `Colmo` soltanto in modalità Copertura;
- il punto di inserimento del Colmo viene agganciato alla linea più vicina;
- il simbolo viene serializzato secondo lo standard Desktop/Core:

```text
BLOCCO,Colmo
QUOTACOLMO,...
QUOTAGRONDA,...
LATOPARTEBASSA,...
QUOTASHED,...
PARETESHED,...
```

- il pannello proprietà del Colmo modifica i cinque attributi usando i campi
  `DatiCad` già esistenti: `QuotaColmo`, `QuotaGronda`,
  `LatoParteBassaShed`, `QuotaShed`, `PareteShed`;
- `PareteShed` riusa la combo/archivio Pareti prevista da
  `definizionedati.json`;
- il pannello linee cambia intestazione in
  `Copertura · Linee perimetro falde`;
- il frontend continua a non generare il tetto 3D: i blocchi e le linee sono
  input per il Service/Core.

Il comportamento corrisponde al Core corrente: `LeggiDxf` legge i blocchi
`Colmo`, associa il simbolo alla linea più vicina, assegna
`QUOTACOLMO` ai vertici della linea, registra `QUOTAGRONDA` e gestisce
`QUOTASHED/LATOPARTEBASSA/PARETESHED` per gli shed.

Verifica eseguita: sintassi JavaScript valida e presenza dei comandi/formati
controllata nei sorgenti. Test funzionale browser → Service ancora da eseguire.

### Commissione frontend — fallback sfondo Copertura da DisegnoInput

Stato: **ESEGUITO** — 21 settembre 2026.

Termodel Web v0.76 completa `＋ Copertura` con questo fallback:

- se il piano corrente possiede già uno sfondo locale, lo duplica sul nuovo
  piano come nella v0.75;
- se non esiste uno sfondo, costruisce una fotografia vettoriale SVG del
  DisegnoInput del piano corrente e la incorpora come sfondo locale della
  nuova copertura;
- dalla copia SVG usata come sfondo vengono rimossi gli accessori locali
  (Nord, contenitore sfondi, ecc.);
- lo sfondo conserva lo stesso viewBox/allineamento del disegno sorgente ed è
  marcato come `data-termodel-sfondo-tipo="vector"`;
- pareti e simboli sorgenti non vengono duplicati come geometria tecnica della
  copertura: compaiono soltanto dentro l'immagine SVG di riferimento;
- il fallback resta risorsa frontend e viene escluso dal payload Service dalle
  regole già vigenti sugli sfondi.

Verifica eseguita: sintassi JavaScript valida e pubblicazione v0.76 coerente.
La prova funzionale browser resta da eseguire.

### Commissione frontend — nuovo piano Copertura per test Service avanzato

Stato: **ESEGUITO** — 21 settembre 2026.

Termodel Web v0.75 aggiunge il comando `＋ Copertura` accanto ad `Arc`
nella selezione del piano.

Il comando:

- crea un vero record `Piani` inizializzato secondo
  `definizionedati.json`, senza modificare lo schema;
- imposta `Tipo = Copertura`;
- genera `Nome` e `LayerCad` univoci (`Copertura`,
  `Copertura 2`, ...);
- mantiene il `NomeFile` del piano sorgente;
- duplica esclusivamente lo sfondo locale, mantenendo trasformazioni,
  dimensioni e calibrazione, e lo associa al nuovo piano/layer;
- non duplica pareti, simboli o altra geometria tecnica;
- commuta immediatamente il CAD sul nuovo piano;
- consolida la geometria 2D di un piano `Copertura` senza invocare
  `GeneraPianta.js` e senza produrre un tetto 3D locale;
- lascia invariata l'anteprima locale dei piani `Calpestabile`.

La trasformazione verso `TERMODEL-PROJECT-SVG-V1` è stata inoltre resa
multipiano: nello SVG operativo Web le entità possono restare nel contenitore
storico comune, mentre `data-termodel-piano` e `LayerCad` determinano il
gruppo tecnico corretto inviato al Service. Il piano `Copertura` e le sue
entità tecniche vengono quindi trasmessi a `AggiornaCalcolo`; lo sfondo
resta esclusivamente frontend.

Verifica eseguita: sintassi JavaScript dei moduli modificati valida e diff
limitato a frontend/contratto. La prova funzionale reale di tetti e locali
mansardati sul Service è il passo successivo e non è ancora dichiarata
verificata.

### Commissione frontend — copia diagnostica risposte Service

Stato: **ESEGUITO** — 21 settembre 2026.

Termodel Web v0.74 prepara automaticamente negli appunti, dopo
`Aggiorna Modello`, un blocco diagnostico `TERMODEL-SERVICE-EXCHANGE-V1`
contenente le risposte effettivamente ricevute dal Service:

- status HTTP e corpo della risposta di `POST /api/calculations`;
- `projectId`, manifest e diagnostica presenti nella risposta POST;
- URL, status HTTP e corpo del GET artifact corrente;
- in caso di errore, la risposta disponibile e il messaggio client.

Il testo copiato contiene le risposte del server, non il payload progetto
inviato. Viene inoltre mantenuto in
`globalThis.TERMODEL_LAST_SERVER_EXCHANGE` come supporto diagnostico.

La Clipboard API viene tentata per prima; esiste un fallback browser basato su
selezione/copia. L'eventuale impossibilità di copiare non deve far fallire il
calcolo o il rendering e viene indicata nella barra di stato.

### Commissione frontend — indicatore origine rendering

Stato: **ESEGUITO** — 21 settembre 2026.

Termodel Web v0.72 mostra nel viewer un indicatore persistente dell'origine del
modello visualizzato:

- `ANTEPRIMA LOCALE · nessuna elaborazione server` per JSON demo e preview
  prodotte nel browser;
- `RENDERING ELABORATO DA TERMODEL SERVICE · projectId ...` per
  l'artifact `model3d` corrente del progetto.

Per il rendering server viene mostrata una forma abbreviata del
`projectId` e l'identificativo completo resta disponibile nel tooltip.
L'indicatore descrive il modello attualmente visualizzato e non viene usato come
prova autonoma della correttezza del calcolo.

### Commissione frontend — SVG tecnico canonico per AggiornaCalcolo

Stato: **ESEGUITO** — 21 settembre 2026.

Anomalia osservata nella prima prova reale browser → Service:

```text
Errore Aggiorna Modello: AggiornaCalcolo:
Lo SVG deve dichiarare data-termodel-units='cm'.
```

La prova ha confermato che browser, CORS, `POST /api/calculations` e Core
erano raggiunti; l'errore proveniva dalla validazione `SvgDxfReader`.

Termodel Web v0.73 corregge il payload senza modificare il WebService/Core:

- lo SVG locale CAD/AI resta invariato;
- `buildTermodelServerPayload(...)` ricostruisce per il solo POST un
  `geometry/project.svg` con radice
  `data-termodel-format="TERMODEL-PROJECT-SVG-V1"` e
  `data-termodel-units="cm"`;
- i gruppi piano vengono ricavati dal manifest/archivio `Piani` e riportano
  `floor-id/name/role/file/layer/order`;
- vengono trasferite soltanto le entità tecniche dirette `line` e i
  `text` che dichiarano `BLOCCO,...`, assegnandole al piano tramite
  `data-termodel-piano`/layer;
- gli attributi locali `data-termodel-tipo-linea` e
  `data-termodel-colore` vengono tradotti, quando disponibili, nei campi
  `data-termodel-linetype` e `data-termodel-color` letti dal Core;
- sfondi e accessori grafici frontend non entrano nello SVG tecnico;
- manifest e SHA-256 vengono rigenerati sul payload finale.

Verifica eseguita: sintassi JavaScript di `app.js` e
`termodel-project-text.js` valida e presenza dei metadati canonici
controllata sui sorgenti. La nuova esecuzione runtime sul PC dopo v0.73 è
ancora da effettuare e resta un livello di verifica separato.

### Commissione frontend — pulsante Aggiorna Modello

Stato: **ESEGUITO** — 21 settembre 2026.

Implementazione frontend: Termodel Web v0.71. Il pulsante mantiene il JSON demo
quando non esiste un progetto strutturato; con progetto corrente costruisce un
payload tecnico temporaneo tramite `buildTermodelServerPayload(...)`, chiama
`POST /api/calculations`, segue l'`href` dell'artifact `model3d` e passa il
`TermodelWebModel v3` ricevuto al renderer esistente.

Il payload temporaneo rimuove `assets/backgrounds/*` e gli elementi SVG
marcati come sfondo, quindi rigenera l'elenco sezioni e gli SHA-256 del
`manifest.json`. Il progetto locale completo non viene privato degli sfondi.

Stato di verifica: sintassi JavaScript controllata; il ciclo browser pubblico
→ WebService locale → artifact 3D deve ancora essere provato sul PC reale.

Il pulsante `Aggiorna Modello` del frontend deve applicare il seguente
comportamento senza introdurre endpoint alternativi:

```text
nessun progetto strutturato
    -> carica il TermodelWebModel.json di esempio

progetto strutturato corrente
    -> costruisce TERMODEL-PROJECT-TEXT-V1 corrente
    -> deriva il payload tecnico senza sfondi locali/frontend
    -> POST /api/calculations
    -> riceve projectId + manifest
    -> segue l'href dell'artifact model3d
    -> GET artifact model3d
    -> renderizza TermodelWebModel v3 nel viewer
```

Il file progetto locale completo deve restare invariato rispetto alle proprie
risorse frontend: il filtraggio degli sfondi produce soltanto il payload
temporaneo destinato al Service.

Body:

```text
[TERMODEL-PROJECT-TEXT-V1]
...
[END-TERMODEL-PROJECT-TEXT-V1]
```

La richiesta deve provocare **una sola elaborazione coerente** del progetto.

Non deve accadere:

```text
richiesta XML        -> ricalcola tutto
richiesta spirali    -> ricalcola tutto
richiesta report     -> ricalcola tutto
richiesta modello 3D -> ricalcola tutto
```

Deve accadere:

```text
AggiornaCalcolo
      |
      v
una ricostruzione del modello
      |
      +--> modello 3D
      +--> piante pulite
      +--> XML nazionale
      +--> dispersioni
      +--> pannelli
      +--> spirali
      +--> altri elaborati futuri
```

Le view leggono successivamente gli elaborati già prodotti.

---


## 4. projectId come riferimento tecnico degli artifact

Nel flusso corrente `projectId` è una chiave tecnica di correlazione tra una richiesta di calcolo e gli artifact che il Service pubblica nel proprio workspace temporaneo/corrente.

Non è la posizione di salvataggio autorevole del progetto utente.

Il frontend:

1. usa l'ID già presente nel manifest, se valido;
2. altrimenti genera localmente un UUID e lo inserisce nel manifest in memoria;
3. invia il progetto completo a `POST /api/calculations`.

Il Service deve accettare quel projectId anche se non esiste alcun workspace precedente e deve creare/ricreare il workspace durante il calcolo.


## 5. Risposta di AggiornaCalcolo

Il server risponde quando l'elaborazione richiesta è stata completata e gli artifact correnti sono disponibili nel workspace tecnico del `projectId`.

Risposta indicativa:

```json
{
  "contractVersion": "TERMODEL-FRONT-SERVICE-V1",
  "projectId": "7b30f4f4-...",
  "status": "completed",
  "artifacts": [
    {
      "name": "model3d",
      "contentType": "application/json",
      "href": "/api/projects/7b30f4f4-.../artifacts/model3d"
    }
  ],
  "diagnostics": []
}
```

Non è richiesto alcun `projectLockToken` e la risposta non deve dipendere da un lease di apertura progetto.

### 5.1 Risposta diretta di un artifact richiesta dal chiamante

`POST /api/calculations` accetta il parametro query opzionale
`responseArtifact`.

Senza il parametro il comportamento resta invariato e la risposta è il
manifest JSON descritto sopra.

Con il parametro, il Service esegue **la stessa unica elaborazione completa**,
pubblica atomicamente tutti gli artifact nel workspace corrente e restituisce
nel body direttamente l'artifact richiesto. Questa modalità è pensata anche
per regression e debug GitHub Actions, senza introdurre un secondo calcolo.

Valori correnti:

```text
responseArtifact=model3d
responseArtifact=pannelli
responseArtifact=pannelli-esecutivo-svg
responseArtifact=pannelli-esecutivo-dxf
responseArtifact=pianta-pulita&responseFloor=<nome piano>
```

Esempio per le spirali:

```http
POST /api/calculations?responseArtifact=pannelli-esecutivo-svg
Content-Type: text/plain; charset=utf-8
```

La risposta usa il Content-Type proprio dell'artifact e include gli header:

```text
X-Termodel-Project-Id
X-Termodel-Response-Artifact
X-Termodel-Artifact-Stale: false
```

Un nome `responseArtifact` non riconosciuto produce HTTP 400. Un artifact
riconosciuto ma non generato dal progetto produce HTTP 404. Per
`pianta-pulita` `responseFloor` è obbligatorio.

Questa estensione è retrocompatibile: il frontend corrente può continuare a
omettere `responseArtifact` e ricevere il manifest come prima.

## 6. Manifest degli artifact

La risposta a `AggiornaCalcolo` contiene il manifest degli elaborati realmente
disponibili.

Il frontend **non deve supporre** che tutti gli artifact esistano sempre.

Esempi:

| Artifact logico | Formato previsto | Uso principale |
|---|---|---|
| `model3d` | JSON | viewer 3D |
| `pianta-pulita/{piano}` | SVG | viste di pianta |
| `xml-nazionale` | XML | export APE nazionale |
| `report-dispersioni` | JSON | view dispersioni |
| `pannelli` | JSON | view calcolo pannelli |
| `spirali/{piano}` | SVG | view pannelli radianti |
| `esecutivo-dxf/{piano}` | DXF | eventuale download/esecutivo futuro |

Il manifest deve descrivere ciò che è presente nel workspace corrente del progetto,
non ciò che il server potrebbe teoricamente produrre.

---

## 7. Lettura degli artifact

Gli artifact correnti sono letti tramite `projectId`.

Endpoint di riferimento:

```http
GET /api/projects/{projectId}/artifacts/model3d
GET /api/projects/{projectId}/artifacts/pannelli
```

Entrambi gli artifact vengono letti dal workspace persistito dell'ultima
elaborazione valida e **non provocano un nuovo calcolo**. L'header
`X-Termodel-Artifact-Stale` indica se un successivo salvataggio del progetto
li ha resi non più allineati al file corrente.

Schema previsto:

```http
GET /api/projects/{projectId}/artifacts/model3d
GET /api/projects/{projectId}/artifacts/xml-nazionale
GET /api/projects/{projectId}/artifacts/report-dispersioni
GET /api/projects/{projectId}/artifacts/pannelli
GET /api/projects/{projectId}/artifacts/spirali/{piano}
GET /api/projects/{projectId}/artifacts/pianta-pulita/{piano}
```

Regola fondamentale:

> leggere un artifact non deve rieseguire il calcolo.

Dopo un nuovo `AggiornaCalcolo` riuscito, lo stesso URL del progetto restituisce
il nuovo artifact corrente perché la precedente elaborazione è stata
sostituita.

Il manifest della risposta deve fornire gli `href` correnti.

---

## 8. Formato dei dati per le view

Il Core deve restituire **dati**, non UI.

Per esempio il report dispersioni non deve arrivare come HTML già impaginato.

Preferibile:

```json
{
  "totaleDispersioni": 4823.5,
  "zone": [
    {
      "id": "Z1",
      "descrizione": "Zona principale",
      "totaleDispersioni": 4823.5,
      "locali": []
    }
  ]
}
```

Il frontend decide:

- tabella;
- card;
- grafico;
- pannello laterale;
- stampa;
- formattazione.

Lo stesso principio vale per il calcolo pannelli.

Gli SVG, invece, sono adatti a essere restituiti direttamente quando
rappresentano elaborati grafici 2D come pianta pulita o spirali.

---


## 9. Orchestrazione lato frontend

Flusso corrente:

```text
utente crea/apre file locale TERMODEL-PROJECT-TEXT-V1
        ↓
frontend modifica CAD e archivi
        ↓
Salva / Salva con nome
        ↓
download locale del progetto completo

quando serve il calcolo:
        ↓
buildCurrentProjectText()
        ↓
projectId presente?
   ├── sì → lo mantiene
   └── no → genera UUID localmente e lo inserisce nel manifest
        ↓
filtra le sole risorse frontend/sfondi
        ↓
POST /api/calculations
        ↓
Service crea o ricrea il workspace tecnico del projectId
        ↓
riceve manifest artifact
        ↓
segue href degli artifact correnti
        ↓
aggiorna viewer e view
```

Non esistono passaggi obbligatori di elenco, apertura, salvataggio, lock o heartbeat sul Service.

## 10. Orchestrazione interna lato server

Pipeline concettuale:

```text
1. ricezione file unico
2. parsing TERMODEL-PROJECT-TEXT-V1
3. lettura e validazione manifest.projectId
4. validazione manifest e sezioni
5. caricamento archivi
6. ricostruzione geometrica/modello
7. produzione model3d
8. produzione progressiva degli altri artifact
9. raccolta diagnostica/log
10. preparazione workspace temporaneo
11. sostituzione atomica di SavedProjects/{projectId}/
12. risposta con projectId + manifest artifact
```

Tutti gli artifact devono derivare dalla stessa elaborazione corrente.

Se un passaggio fallisce, il Service non deve pubblicare output parziali come
nuovo stato valido del progetto.

---


## 11. Workspace tecnico del calcolo

Il Service può continuare a usare internamente:

```text
SavedProjects/
└── {projectId}/
    ├── project.tmdl
    ├── artifacts/
    └── logs/
```

ma questa directory è un **workspace tecnico ricreabile**, non l'archivio autorevole dell'utente.

`POST /api/calculations` deve poter creare il workspace anche quando `projectId` non era stato precedentemente allocato o aperto sul Service.

La sostituzione del workspace deve restare atomica per evitare artifact parziali.


## 12. Durata dei risultati

Gli artifact restano disponibili finché il workspace corrente esiste sul Service.

Su Render Free un redeploy/rebuild può cancellarli. Questo non costituisce perdita del progetto, perché il file autorevole è locale. Il frontend deve semplicemente reinviare il progetto completo con `Aggiorna Modello` per ricrearli.

La persistenza server multiutente, se introdotta in futuro, sarà una funzione separata e non deve essere confusa con il normale salvataggio locale del progetto.

## 13. Diagnostica ed errori

Gli errori HTTP devono essere strutturati e leggibili dal frontend.

| HTTP | Significato |
|---|---|
| 400 | richiesta malformata o feedback non valido |
| 403 | origine non autorizzata per l'invio feedback |
| 404 | projectId o artifact non disponibile |
| 409 | conflitto nella registrazione/allocazione del projectId |
| 415 | Content-Type non supportato |
| 422 | progetto valido come richiesta HTTP ma non elaborabile da Termodel |
| 429 | rate-limit feedback superato |
| 500 | errore interno inatteso |
| 502 | dipendenza GitHub feedback raggiunta ma non utilizzabile |
| 503 | risorsa/dipendenza necessaria non configurata o non disponibile |

Warning e diagnostica dell'ultima elaborazione riuscita devono essere associati
al workspace del `projectId`.

Un errore durante un nuovo calcolo non deve distruggere gli artifact validi
precedenti.

---

## 14. Versionamento

Devono essere distinti almeno:

```text
formato progetto:
TERMODEL-PROJECT-TEXT-V1

contratto frontend/server:
TERMODEL-FRONT-SERVICE-V1

formato eventuale modello 3D:
TermodelWebModel v3
```

Una variazione compatibile può aggiungere campi senza rompere i client.

Una variazione incompatibile richiede una nuova versione esplicita del
contratto o dell'artifact interessato.

Frontend e server non devono dedurre la compatibilità soltanto dalla versione
grafica dell'applicazione Web.

---


## 15. Compatibilità con le API esistenti

Riferimento operativo corrente del frontend:

```http
POST /api/calculations
GET  /api/projects/{projectId}/artifacts/...
GET  /api/projects/{projectId}/generated-files
```

Restano compatibili ma non sono più usati dal frontend corrente per la gestione ordinaria dei progetti:

```http
GET  /api/projects
POST /api/projects/allocate-id
POST /api/projects/{projectId}/open
PUT  /api/projects/{projectId}/save
PUT  /api/projects/{projectId}/save-as
POST /api/projects/{projectId}/heartbeat
POST /api/projects/{projectId}/close
```

Gli endpoint legacy non devono diventare una dipendenza indiretta di `POST /api/calculations`.


## 16. Nuovo progetto

`Nuovo` parte dal template locale consolidato del frontend.

Non richiede una chiamata al Service e non richiede `allocate-id`.

Il `projectId`, se necessario per un successivo calcolo, viene generato localmente al primo `Aggiorna Modello` e può poi essere conservato nel file salvato.


## 17. Separazione delle responsabilità

### Frontend

Responsabile di:

- UI/UX;
- editing e CAD 2D;
- stato del progetto lato browser;
- apertura del file progetto locale;
- costruzione/lettura del file unico;
- Salva / Salva con nome tramite download locale;
- generazione locale del projectId quando necessario;
- richiesta di aggiornamento;
- scelta e rendering degli artifact.

### Termodel.WebService

Responsabile di:

- API HTTP, CORS e validazione di trasporto;
- ricezione del progetto tecnico completo;
- calcolo/orchestrazione Core;
- workspace tecnico ricreabile per projectId;
- esposizione degli artifact e dei log;
- mapping errori HTTP.

Il WebService non è la fonte autorevole di persistenza dei progetti nel flusso corrente.

### Termodel.Core

Responsabile di:

- logica Termodel indipendente dalla UI;
- parsing/validazione funzionale;
- ricostruzione modello;
- calcoli;
- produzione dati/artifact.

### Desktop / Library

Restano riferimento storico per comportamento, algoritmi, formati e risultati.


## 18. Concorrenza e isolamento

Ogni `projectId` ha un proprio workspace tecnico.

Due richieste concorrenti sullo stesso `projectId` devono essere serializzate o coordinate internamente dal Service. Il frontend non usa lock applicativi per questo scopo.

Due progetti distinti possono essere elaborati contemporaneamente.

## 19. CORS, localhost e sicurezza

Durante lo sviluppo il frontend pubblico può interrogare il server locale,
attualmente con origine autorizzata:

```text
https://www.termodel.it
```

Il Termodel WebService locale opera attualmente tramite HTTP sulla porta
`5080`. La base URL predefinita dell'ambiente di sviluppo è quindi:

```text
http://localhost:5080
```

Tutti i percorsi API descritti in questo documento sono relativi a questa base
URL durante le prove locali. Per esempio, l'endpoint di stato completo è
`http://localhost:5080/health`.

Il browser può richiedere autorizzazione Local Network Access / Private Network
Access.

Il contratto funzionale non deve dipendere dalla porta locale `5080`: la base
URL è configurazione dell'ambiente.

Dal frontend PC v1.37 la selezione dell'ambiente è disponibile anche
direttamente in **Help → Termodel Service**:
- default a ogni apertura: **Cloud**, base URL `https://termodel.onrender.com`;
- flag **Usa localhost:5080 (debug Visual Studio)**: base URL
  `http://localhost:5080`;
- la scelta è solo runtime del browser, non viene scritta nel
  `TERMODEL-PROJECT-TEXT-V1`;
- cambiando ambiente il frontend azzera la cache di `/health` e
  `/api/model/capabilities`, così il comando successivo interroga realmente
  il Service selezionato;
- l'override tecnico preesistente `globalThis.TERMODEL_SERVICE_BASE_URL`
  resta compatibile per ambienti di sviluppo speciali; il flag localhost ha
  precedenza quando è spuntato.

Autenticazione e autorizzazione non sono ancora implementate e saranno aggiunte
prima dell'uso multiutente su server pubblico.

---


## 20. Sequenza di implementazione concordata

### Fase corrente — progetto locale + Service di calcolo

Stato deciso il 24 settembre 2026:

- apertura progetto locale nel browser;
- salvataggio locale del file unico;
- nessun elenco/apertura/salvataggio progetto sul Service nel frontend corrente;
- nessun lock/heartbeat frontend;
- projectId locale o già presente nel manifest;
- `POST /api/calculations` autosufficiente: crea/ricrea il workspace tecnico;
- artifact letti tramite gli href restituiti dal calcolo.

### Fase successiva — artifact aggiuntivi

Integrare nello stesso workspace tecnico:

- piante pulite;
- XML nazionale;
- report dispersioni;
- pannelli;
- spirali SVG;
- esecutivi DXF;
- altri elaborati.

### Fasi successive

- regression test automatici;
- Golden Results;
- autenticazione;
- eventuale persistenza server multiutente come funzione separata;
- EnergyPlus / gbXML / IDF.

## 21. Test del contratto

Ogni funzione aggiunta al contratto deve essere verificata almeno a questi
livelli:

```text
progettata
implementata
compilata
endpoint eseguito
artifact ricevuto
visualizzato dal frontend
confrontato con Desktop/golden quando applicabile
```

Il fatto che un endpoint compili non significa che il risultato sia stato
confrontato con Termodel Desktop.

Gli artifact importanti devono diventare progressivamente parte dei regression
test.

---

## 22. Regola di modifica di questo documento

Questo file è il contratto condiviso.

Quando una modifica riguarda:

- endpoint;
- request/response;
- nomi artifact;
- versioni;
- lifecycle del calcolo;
- formati;
- errori;
- orchestrazione;
- responsabilità frontend/server;

la modifica deve essere registrata qui **prima o insieme all'implementazione**.

Non duplicare il contratto completo nei due Summary.

I Summary devono soltanto indicare:

- stato della rispettiva linea;
- cosa è implementato;
- riferimento a questo documento per il contratto comune.

---

## 23. Decisioni ancora aperte

Da definire durante l'implementazione:

- formato definitivo del manifest artifact;
- politica di cancellazione/archiviazione dei workspace per projectId;
- autenticazione e associazione projectId/utente;
- eventuale endpoint per leggere il manifest degli artifact correnti;
- eventuale comando esplicito di duplicazione progetto con nuovo projectId;
- eventuale storico versionato delle elaborazioni, non attivo di default;
- persistenza multiutente/server pubblico.

Il principio non aperto è già deciso:

> il file locale `TERMODEL-PROJECT-TEXT-V1` è la copia autorevole del
> progetto; il `projectId` è soltanto la chiave tecnica degli artifact sul
> Service e un nuovo `AggiornaCalcolo` può ricreare interamente il workspace.


### Selezione motore spirali per singola elaborazione — test pubblico

Dal 29 settembre 2026 `POST /api/calculations` accetta il parametro query
opzionale:

```http
POST /api/calculations?spiralEngine=Vittorio_revisionato
```

Valori ammessi:

```text
Vittorio
Vittorio_revisionato
GPT
Diego
Diego_Vittorio
```

Regole:
- se `spiralEngine` è omesso, resta valido il default del Service
  (attualmente `Diego_Vittorio`) o l'eventuale configurazione
  `TERMODEL_SPIRAL_ENGINE`;
- la selezione è **per-request**: non modifica variabili globali, il progetto
  `TERMODEL-PROJECT-TEXT-V1` né le elaborazioni di altri utenti;
- `Vittorio_revisionato` è pubblicato per collaudo collaborativo e non
  sostituisce il default;
- la risposta JSON di `POST /api/calculations` riporta
  `spiralEngine` con il motore effettivamente usato;
- con `responseArtifact=...` lo stesso valore è esposto nell'header
  `X-Termodel-Spiral-Engine`;
- `/health` continua a riportare in `spiralEngine` il default del Service e
  pubblica anche `spiralEngines`, elenco dei motori disponibili.

Il frontend pubblico v1.38 espone in **Help → Motore spirali — test pubblico**
una scelta esplicita. `Predefinito Service` non invia il parametro;
`Vittorio_revisionato` consente di ripetere `Aggiorna Modello` su progetti
reali senza modificare il file salvato. La provenienza dell'esecutivo runtime
mostra il motore restituito dalla singola elaborazione.

### Chiusura opzionale di Vittorio_revisionato

Dal 30 settembre 2026 `POST /api/calculations` accetta anche:

```http
POST /api/calculations?spiralEngine=Vittorio_revisionato&spiralClosure=false
```

Valori ammessi per `spiralClosure`:

```text
true
false
```

Regole:
- il default è `true`, quindi l'omissione del parametro preserva il comportamento
  corrente di `Vittorio_revisionato`;
- il parametro è per-request e non viene salvato nel
  `TERMODEL-PROJECT-TEXT-V1`;
- con `false`, Mandata e Return vengono comunque generati e raccordati
  singolarmente, ma non viene applicato il collegamento finale fra i due
  terminali e non viene emessa l'etichetta di chiusura;
- il parametro è significativo per `Vittorio_revisionato`; gli altri motori
  mantengono il proprio comportamento;
- la risposta manifest riporta `spiralClosure`; con
  `responseArtifact=...` lo stesso valore è esposto nell'header
  `X-Termodel-Spiral-Closure`.

Il frontend v1.38 espone nello stesso menu Help il checkbox **Chiudi circuito**.
Quando è selezionato `Vittorio_revisionato`, il frontend invia esplicitamente
`spiralClosure=true|false`. La scelta è runtime del browser e non modifica il
file progetto.
