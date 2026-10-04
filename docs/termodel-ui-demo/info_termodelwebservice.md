# Informazioni per il developer frontend — Termodel WebService

## Scopo della nota

Questa nota coordina il frontend Termodel Web con il backend ASP.NET Core sperimentale. Non modifica la definizione funzionale o grafica del frontend e distingue le funzioni già provate da quelle ancora in studio.

Il contratto condiviso e autorevole per endpoint, `AggiornaCalcolo`, `calculationId`, artifact, versionamento ed errori è:

```text
docs/TERMODEL-FRONT-SERVICE-CONTRACT.md
```

Questa nota resta un documento di orientamento frontend; in caso di differenza sul contratto di comunicazione prevale il documento condiviso.

Aggiornamento: 23 settembre 2026.

## Procedura diagnostica Service → GitHub → AI

Questa procedura è importante anche per il developer frontend perché evita di
trasferire manualmente alla chat file prodotti dal backend.

Quando serve far esaminare alla chat l'ultima elaborazione reale:

```text
1. nel frontend eseguire "Aggiorna Modello";
2. pubblicare lo snapshot del projectId corrente;
3. dire alla chat: "esamina l'ultimo snapshot".
```

La pubblicazione avviene **solo su richiesta**, non dopo ogni
`Aggiorna Modello`.

Endpoint amministrativo:

```http
POST /api/projects/{projectId}/publish-session-snapshot
X-Termodel-Snapshot-Key: <chiave amministrativa>
```

La chiave non deve essere inserita nel JavaScript/frontend. Fino a quando non
sarà disponibile un comando locale sicuro dedicato, viene usata dall'utente
fuori dal browser, ad esempio da PowerShell.

Gli output vengono conservati sul branch GitHub
`service-snapshots`. Una chat nuova deve partire da:

```text
service-snapshots/LATEST.json
```

e poi leggere `manifest.json` e gli artifact/log elencati.

In questo modo la chat può controllare direttamente gli output reali del
Service, inclusi SVG, DXF, JSON e log, senza chiedere copie manuali
all'utente.

Il filesystem Render Free resta effimero; lo snapshot GitHub è la copia
diagnostica persistente. Al momento gli snapshot storici non vengono
cancellati automaticamente.

Documento operativo completo:

```text
Server/Termodelwebservice/docs/SERVICE-SNAPSHOT-DIAGNOSTIC.md
```

Il collegamento reale Render → GitHub → lettura AI è stato verificato il
23 settembre 2026.

## Separazione delle responsabilità

La chat che mantiene il frontend resta responsabile di:

- UI e UX;
- HTML, CSS e comportamento applicativo del browser;
- BIM-CAD Web;
- Three.js e JSTS nel frontend;
- editing, rendering e definizione funzionale dei comandi Web;
- workflow AI lato browser.

Codex lato Core/WebService si limita a:

- contratto di comunicazione frontend/backend;
- protocollo testuale del progetto;
- manifest, DTO e versionamento;
- endpoint ASP.NET Core;
- validazione delle richieste e diagnostica;
- CORS e configurazione di collegamento;
- adattatore JavaScript minimo necessario a chiamare il backend;
- test d'integrazione fra browser e server.

Il frontend deve rimanere funzionante durante l'evoluzione. Le integrazioni backend saranno additive e retrocompatibili finché un nuovo flusso non sarà stato collaudato e approvato.

## Coordinamento prima delle modifiche

Prima che Codex modifichi qualsiasi file sotto `docs/termodel-ui-demo`:

1. comunica all'utente file, motivo e impatto;
2. chiede all'utente di sospendere il lavoro parallelo sul frontend;
3. attende conferma esplicita;
4. ricontrolla branch, stato Git e modifiche recenti;
5. applica soltanto la modifica d'integrazione necessaria;
6. verifica che il frontend continui a funzionare;
7. comunica i file modificati e autorizza la ripresa del lavoro parallelo.

Non sovrascrivere modifiche frontend recenti e non ridefinire unilateralmente UI o modello Web.

## WebService sperimentale esistente

Sul PC di sviluppo è stata creata una soluzione separata:

```text
C:\DOCUMENTI\termomodel\codec\Termodelwebservice\Termodel.WebService.sln
```

Contiene:

- `Termodel.Core`, libreria `.NET 8` con il primo servizio indipendente `ProgFileUnico`, ma ancora priva del restante motore Termodel;
- `Termodel.WebService`, Web API ASP.NET Core minimale.

Endpoint dimostrativi presenti nello scheletro:

```text
GET /
GET /health
GET /api/model/capabilities
POST /api/projects/new
```

`POST /api/projects/new` implementa in forma sperimentale `NuovoProgetto`: legge la definizione database distribuita dal sorgente autorevole, inizializza gli archivi, genera XML e JSON coerenti e restituisce il contenitore testuale con SVG multipiano. La soluzione è stata compilata con zero errori e zero avvisi e l'endpoint ha restituito HTTP 201 in una prova locale. `Aggiorna modello` non è ancora presente.

## Protocollo corrente da preservare

Il frontend locale dichiara la versione `v0.3` in `index.html` e riconosce il protocollo:

```text
[TERMODEL-SVG-TEXT-V1]
...
[/TERMODEL-SVG-TEXT-V1]
```

Questo flusso non deve essere rimosso o interrotto durante lo sviluppo del nuovo protocollo.

Un aggiornamento esterno ricevuto successivamente dichiarava `v0.20`; il clone locale esaminato continua tuttavia a dichiarare `v0.3`. Prima di qualsiasi intervento occorre sincronizzare e verificare quale revisione sia effettivamente corrente. Non risolvere la discrepanza cambiando soltanto il numero di versione.

## Nuovo file unico di progetto

Il formato canonico in studio è un unico file di testo UTF-8, autosufficiente e copiabile integralmente negli appunti. Deve funzionare nello stesso modo:

- fra desktop e server;
- fra server e browser;
- verso e da un'AI;
- come file allegato;
- come testo copiato e incollato.

Protocollo implementato in forma sperimentale, non ancora definitivo:

```text
[TERMODEL-PROJECT-TEXT-V1]

---BEGIN:manifest.json---
...
---END:manifest.json---

---BEGIN:geometry/project.svg---
...
---END:geometry/project.svg---

---BEGIN:archives/xml/Piani.xml---
...
---END:archives/xml/Piani.xml---

---BEGIN:archives/json/Piani.json---
...
---END:archives/json/Piani.json---

[END-TERMODEL-PROJECT-TEXT-V1]
```

SVG, XML e JSON restano testi nativi, senza Base64 e senza incorporarli come stringhe JSON soggette a escape.

Il nuovo protocollo dovrà inizialmente convivere con `TERMODEL-SVG-TEXT-V1`. Il frontend potrà aggiungere importazione/esportazione del progetto completo soltanto dopo l'approvazione della specifica e la disponibilità del parser condiviso.

## Prerequisito `ProgFileUnico`

Prima di sperimentare il motore server, Termodel desktop dovrà poter creare e leggere il file unico mediante una classe separata denominata `ProgFileUnico`.

Il backend espone la prima versione sperimentale della funzione concettuale:

```text
NuovoProgetto(richiesta, versioneDefinizione)
    → testo TERMODEL-PROJECT-TEXT-V1
    + diagnostica strutturata
```

L'endpoint corrente è `POST /api/projects/new`. Forma della richiesta, DTO e protocollo sono implementati per la sperimentazione ma non ancora approvati come contratto definitivo. Il frontend non lo chiama ancora.

## Definizione del database: vincolo inderogabile

Il riferimento autorevole è:

```text
definizionedati/definizionedati.json
```

Questo file non può essere modificato senza autorizzazione specifica che lo nomini espressamente. Frontend e backend non devono introdurre uno schema concorrente o assumere che una copia locale sia automaticamente aggiornata.

Il manifest del progetto dovrà riportare almeno versione o impronta della definizione utilizzata. Archivi XML e JSON devono essere validati contro tale definizione; dati incompatibili devono produrre diagnostica e non modificare lo schema.

### Copia disponibile per il frontend

Per consentire al developer frontend di consultare la stessa definizione senza accedere al workspace desktop, è stata aggiunta al clone Git la copia:

```text
SorgentiTermodel/Library/definizionedati/definizionedati.json
```

Questa è una copia di distribuzione in sola lettura logica, non una seconda fonte da mantenere autonomamente. Al momento della copia ha lo stesso SHA-256 dell'originale autorevole:

```text
29E30DE64C7D45E4613F145AC485F573DB34F4328C6CE0BC7367EB92D83AAD0B
```

Anche il progetto distribuibile WebService contiene una copia verificata autonoma in `src/Termodel.WebService/Definitions/definizionedati.json`. Questa scelta elimina la dipendenza di build dalla cartella gemella Termodel e permette la futura compilazione Docker. La fonte autorevole e le regole di aggiornamento non cambiano.

Il developer frontend deve aggiornarsi sul lavoro Core/WebService leggendo anzitutto questo documento e, per i dettagli del protocollo, i documenti `DOCS/ProgFileUnico.md` e `DOCS/TermodelWeb-Core.md` nel workspace Termodel. Prima di usare la copia del JSON deve verificare che la sua impronta coincida con quella riportata dal manifest o comunicata dal responsabile del Core. Non deve modificare la copia per introdurre campi frontend: ogni variazione dello schema deve essere autorizzata espressamente sull'originale e poi propagata mediante copia verificata.

### Sorgenti di riferimento per database e form automatiche

Nella Library Git sono disponibili anche copie verificate dei sorgenti desktop da cui ricavare le regole funzionali:

```text
SorgentiTermodel/Library/utilities/Utidb.cs
SorgentiTermodel/Library/definizionedati/AutoForm.cs
SorgentiTermodel/Library/definizionedati/FormArchivio.xaml
SorgentiTermodel/Library/definizionedati/FormArchivio.xaml.cs
SorgentiTermodel/Library/definizionedati/Form dettaglio.xaml
SorgentiTermodel/Library/definizionedati/Form dettaglio.xaml.cs
SorgentiTermodel/Library/definizionedati/README-riferimento-frontend.md
```

Questi file illustrano caricamento dello schema, inizializzazione delle righe, collezioni, XML/JSON, DataGrid, combo e generazione delle form WPF. Il developer deve usarli come riferimento comportamentale: WPF e le dipendenze desktop non devono essere copiate nel browser. La nota `README-riferimento-frontend.md` indica quali metadati tradurre in controlli Web e dove seguire i successivi aggiornamenti Core/WebService.

Il riferimento completo per il futuro motore unico `ArchivioWeb` è ora `SorgentiTermodel/Library/ARCHIVI-WEB-RIFERIMENTO.md`. Sono inoltre disponibili sei XML di un progetto sintetico di test in `SorgentiTermodel/Library/examples/dbtempfiles`. Al momento il WebService non espone endpoint CRUD per gli archivi: `POST /api/projects/new` li inizializza e li include nel file unico, ma carica/elenca/modifica/cancella/salva devono ancora essere progettati.

## Indicazioni per il frontend

Fino a nuova specifica:

- conservare il funzionamento attuale di importazione SVG;
- non implementare autonomamente una variante incompatibile del file progetto;
- non duplicare nel frontend la definizione autorevole del database;
- predisporre eventuali integrazioni dietro funzioni o moduli separati;
- trattare errori HTTP e incompatibilità di versione come diagnostica visibile, senza fallback silenziosi;
- non assumere che il server sia disponibile in produzione solo perché lo scheletro locale risponde.

Le decisioni complete sono mantenute nel progetto desktop in `DOCS/ProgFileUnico.md` e `DOCS/TermodelWeb-Core.md`.
