# Modulo Spirali — Sorgenti cruciali

Questa pagina raccoglie i punti di ingresso essenziali per il collaudo e lo sviluppo del **Modulo Spirali** di TermodelService.

Ogni path è collegato direttamente al repository GitHub, così è possibile consultare sorgenti, casi di test e linee guida dal browser senza clonare l'intero repository.

## Protocollo di collaborazione con il consulente — riepilogo operativo

Questo paragrafo serve come punto di ripartenza completo nel caso in cui il consulente perda gli appunti precedenti.

### Canale di comunicazione

Il **canale pubblico canonico** tra ChatGPT/TermodelService e il consulente è questo file:

`docs/modulo-spirali/sorgenti-cruciali.md`

ChatGPT scrive qui:
- risposte tecniche al consulente;
- risultati di verifiche e analisi;
- richieste di chiarimento o controproposte;
- stato dei motori e delle decisioni geometriche;
- riferimenti a commit, Harness, SVG e file rilevanti.

Quando ChatGPT ha pubblicato qualcosa destinato al consulente, comunica a Diego una sola parola:

**aggiornati**

A quel punto Diego avvisa il consulente, che rilegge questa pagina pubblica e risponde con la richiesta successiva. Il consulente non deve entrare nel server TermodelService e non deve basarsi su stato locale non pubblicato: il riferimento comune è questa pagina e i file GitHub collegati da qui.

### Canale bidirezionale e comando «aggiornati»

Dal 30/09/2026 il consulente è autorizzato a **rispondere direttamente sullo stesso canale pubblico**:

`docs/modulo-spirali/sorgenti-cruciali.md`

Il canale è quindi bidirezionale:

```text
ChatGPT → pagina pubblica → consulente
consulente → pagina pubblica → ChatGPT
```

Quando Diego scrive in chat:

**aggiornati**

ChatGPT deve:

1. rileggere la pagina pubblica e individuare gli ultimi aggiornamenti del consulente;
2. fornire a Diego una **breve sintesi** di cosa è cambiato;
3. evidenziare eventuali proposte, obiezioni, rischi o richieste diagnostiche;
4. discuterle con Diego prima di trasformarle in modifiche al codice, salvo autorizzazione già esplicita;
5. se ChatGPT pubblica una risposta sulla pagina, segnalarlo a Diego con `aggiornati` accompagnato da una breve sintesi di ciò che è stato scritto.

Il parere del consulente resta importante ma non vincolante; la decisione finale resta di Diego.

### Ruoli

- **Diego** decide la direzione finale del lavoro.
- **Il consulente** fornisce analisi, proposte geometriche, richieste diagnostiche e osservazioni tecniche. Il suo parere è importante ma **non vincolante**.
- **ChatGPT** verifica le proposte contro il repository reale, evidenzia compatibilità/rischi/alternative, le discute con Diego e implementa soltanto dopo una decisione operativa.

Quindi una proposta del consulente non diventa automaticamente codice. Il flusso corretto è:

```text
consulente
    ↓
proposta tecnica
    ↓
ChatGPT verifica sul repository reale
    ↓
discussione con Diego
    ↓
decisione di Diego
    ↓
eventuale implementazione + test
    ↓
risultato pubblicato qui
    ↓
aggiornati
```

### Cosa stiamo facendo

Stiamo lavorando sul modulo spirali di **TermodelService**, in particolare sulla relazione tra Mandata, Return e chiusura finale dei circuiti radianti.

I tre riferimenti principali sono:

- **`Vittorio`** — riferimento storico. È **intoccabile** e serve come baseline funzionale/geometrica.
- **`Diego_Vittorio`** — strategia evolutiva con Return autonomo/doppio lancio, combinatoria di chiusura e altre logiche sperimentali. Non deve essere trasferita automaticamente dentro Vittorio_revisionato.
- **`Vittorio_revisionato`** — linea sperimentale che vogliamo ricondurre a una derivazione stretta di Vittorio: Mandata Vittorio, Return parallelo Vittorio e sola correzione controllata della chiusura finale secondo LG-051.

### Obiettivo architetturale di Vittorio_revisionato

L'obiettivo che stiamo cercando di preservare è:

```text
Vittorio_revisionato
    = Mandata Vittorio
    + Return parallelo Vittorio
    + sola logica di chiusura/raccordatura LG-051
```

Non vogliamo trasformarlo in un secondo motore indipendente simile a Diego_Vittorio.

Una verifica recente ha confermato che il percorso pubblico attuale genera ancora il Return a partire da `CreaRientro(...)` di Vittorio, quindi il Return effettivo è ancora parallelo alla Mandata. Tuttavia nella cartella revisionata sono presenti astrazioni e dipendenze derivate da Diego_Vittorio che dovranno essere eliminate o isolate se vogliamo tornare a una derivazione stretta.

### Regola LG-051 che stiamo usando

La sequenza desiderata è:

```text
Mandata rettilinea
        ↓
Return rettilineo parallelo
        ↓
NESSUN raccordo ancora
        ↓
candidati di chiusura
        ↓
filtri:
    lunghezza >= 2*P
    nessun angolo acuto in Mandata
    nessun angolo acuto in Return
    nessuna intersezione
        ↓
primo candidato valido → stop
nessun candidato valido → circuito aperto
        ↓
solo dopo: raccordatura finale R=0,10
```

Non vogliamo scegliere automaticamente il candidato più lungo e non vogliamo codificare `0.30 m` come costante: la soglia è `2*P`.

### Strumento attuale per osservare il problema

`Vittorio_revisionato` dispone ora di un controllo frontend:

**Help → Motore spirali — test pubblico → Chiudi circuito**

Frontend pubblico corrente: **v1.39**.

Se il controllo viene modificato, il frontend seleziona automaticamente `Vittorio_revisionato`. Con chiusura disattivata viene inviato:

```http
spiralEngine=Vittorio_revisionato&spiralClosure=false
```

In questa modalità Mandata e Return vengono mostrati aperti, senza forzare la chiusura finale. Questo serve proprio a osservare il Return reale prima di decidere se modificarne la generazione.

### Punto di discussione attuale

Il consulente ha proposto una chirurgia basata su un nuovo `OffsetEngine.Parallel(...)` per creare il Return. La nostra obiezione è che **prima dobbiamo verificare se il Return Vittorio già esistente, osservato con `spiralClosure=false`, è geometricamente quello desiderato**.

Se è già corretto, non introdurremo un nuovo algoritmo di offset: interverremo soltanto sulla chiusura LG-051. Se invece il Return aperto risulta realmente errato, allora discuteremo insieme una modifica della logica di Return.

### Regola operativa per il prossimo scambio

Il consulente può leggere questa sezione come base aggiornata e inviare una richiesta diagnostica o una controproposta precisa. ChatGPT la confronterà col repository reale e la discuterà con Diego prima di qualsiasi nuova modifica geometrica.

## Indice

- [Mappa dei sorgenti](#mappa-dei-sorgenti)
- [Harness e test](#harness-e-test)
- [Motori spirali](#motori-spirali)
- [Verifica architetturale Vittorio_revisionato — 30/09/2026](#verifica-architetturale-vittorio_revisionato--30092026)
- [Linee guida](#linee-guida)
- [Regression e Golden](#regression-e-golden)
- [Regola sui Golden](#regola-sui-golden)

## Mappa dei sorgenti

| Area | Path Repo | Ruolo |
|---|---|---|
| Harness | [`Server/Termodelwebservice/tools/Termodel.RadiantPanels.Harness/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tools/Termodel.RadiantPanels.Harness) | Eseguibile di collaudo rapido delle spirali. Permette di lanciare casi sintetici o reali, scegliere il motore, produrre SVG, log e metriche e isolare Supply, Return, chiusura e raccordatura senza passare dal frontend. |
| Harness | [`Server/Termodelwebservice/tests/radiant-harness/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tests/radiant-harness) | Banco di test dell'Harness: casi, input preparati, baseline e materiali di regression. Contiene i casi principali usati per verificare che una modifica geometrica non rompa risultati già approvati. |
| Harness / CI | [`.github/workflows/termodel-diego-vittorio-fast.yml`](https://github.com/Fetonte1960/Termodel/blob/main/.github/workflows/termodel-diego-vittorio-fast.yml) | Workflow GitHub Actions rapido per compilazione Harness/Core e regression delle strategie spirali. È il gate automatico principale per i controlli veloci su Diego_Vittorio e Vittorio_revisionato. |
| Motore | [`Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorio/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorio) | **Riferimento storico intoccabile.** Rappresenta il comportamento Vittorio originale e viene usato come confronto funzionale. Non va modificato durante gli interventi sulle strategie evolutive. |
| Motore | [`Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliDiegoVittorio/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliDiegoVittorio) | Strategia evolutiva con logica Supply, Return autonomo, chiusura combinatoria e raccordatura. È il motore con il banco di regression più esteso e contiene diversi criteri geometrici già consolidati. |
| Motore | [`Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorioRevisionato/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorioRevisionato) | Strategia **Vittorio_revisionato**. Obiettivo architetturale: copia stretta di Vittorio con Return parallelo e sola correzione LG-051 della chiusura/raccordatura. La verifica del 30/09/2026 ha rilevato astrazioni e dipendenze Diego_Vittorio da rimuovere prima di considerarla nuovamente una derivazione stretta. |
| Linee guida | [`Server/Termodelwebservice/docs/spirali-strategy-register/LINEE-GUIDA-SVILUPPO-DISEGNO-SPIRALI.md`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/docs/spirali-strategy-register/LINEE-GUIDA-SVILUPPO-DISEGNO-SPIRALI.md) | Registro delle decisioni geometriche consolidate. Per chiusura e raccordatura sono particolarmente importanti **LG-048**, **LG-049** e **LG-051**. |
| Regression | [`Server/Termodelwebservice/tests/radiant-harness/cases/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tests/radiant-harness/cases) | Casi eseguibili dal banco test. Fra quelli cruciali: `locale_1`, `locale_5`, `locale_8`, `locale_9`, quadrato pubblico Diego_Vittorio e quadrato Vittorio_revisionato. |
| Regression / Golden | [`Server/Termodelwebservice/tests/radiant-harness/baselines/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tests/radiant-harness/baselines) | Baseline approvate usate come Golden di confronto. Nel repository corrente la directory effettiva si chiama **`baselines`**: non esiste una directory `goldens/`. Il Golden Diego_Vittorio non va aggiornato automaticamente quando cambia l'output. |

## Harness e test

Il punto di ingresso eseguibile è:

[`tools/Termodel.RadiantPanels.Harness/Program.cs`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tools/Termodel.RadiantPanels.Harness/Program.cs)

Il progetto .NET dell'Harness è:

[`tools/Termodel.RadiantPanels.Harness/Termodel.RadiantPanels.Harness.csproj`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tools/Termodel.RadiantPanels.Harness/Termodel.RadiantPanels.Harness.csproj)

Il banco di test è organizzato principalmente in:

- [`cases/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tests/radiant-harness/cases) — casi eseguibili;
- [`prepared/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tests/radiant-harness/prepared) — input reali o preparati;
- [`baselines/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/tests/radiant-harness/baselines) — risultati di riferimento approvati.

## Motori spirali

### Vittorio

[`SpiraliVittorio/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorio)

È il riferimento storico. Va usato per capire il comportamento originale e per confrontare le strategie successive. Durante il collaudo delle strategie evolutive deve rimanere invariato.

### Diego_Vittorio

[`SpiraliDiegoVittorio/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliDiegoVittorio)

Contiene la strategia evolutiva con Supply, Return autonomo, chiusura e raccordatura. I casi reali già consolidati costituiscono una protezione importante contro regressioni involontarie.

### Vittorio_revisionato

[`SpiraliVittorioRevisionato/`](https://github.com/Fetonte1960/Termodel/tree/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorioRevisionato)

La regola attuale di riferimento è **LG-051**:

```text
Mandata rettilinea + Ritorno rettilineo
        ↓
chiusura combinatoria rettilinea
        ↓
percorso rettilineo definitivo
        ↓
raccordatura con archi circolari
        ↓
SVG finale
```

La scelta della chiusura e la raccordatura sono due fasi separate.

## Verifica architetturale Vittorio_revisionato — 30/09/2026

**Esito della richiesta pubblica: confermata una contaminazione architetturale da Diego_Vittorio, con una precisazione importante.**

Il percorso pubblico corrente di `Vittorio_revisionato` **non esegue un secondo lancio autonomo del generatore per costruire il Return**. Il Return pubblico nasce ancora dal metodo parallelo di Vittorio:

- in `SpiraliVittorioRevisionato/ChiudiSpirale.cs` viene chiamato `CreaRientro(spiraleRiferimentoVittorio, distanzaRitorno)`;
- il corpo di `CreaRientro(...)` è uguale a quello presente in `SpiraliVittorio/ChiudiSpirale.cs`;
- quindi l'origine del Return del percorso pubblico resta **parallela alla Mandata**, non un vero doppio lancio indipendente.

Tuttavia `Vittorio_revisionato` **non è più una copia stretta di Vittorio**, per quattro ragioni verificabili.

1. **Astrazione neutra del generatore.**  
   [`SpiraliVittorioRevisionato/Spiralgenerator.cs`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorioRevisionato/Spiralgenerator.cs) introduce `SpiralGenerationInput`, `LineeCondizionamento`, `DistanzaCondizionamento` e `TerminalCenterline`, assenti dal generatore Vittorio.

2. **Il percorso pubblico modifica anche la Mandata prima della chiusura.**  
   [`SpiraliVittorioRevisionato/Program.cs`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorioRevisionato/Program.cs) esegue `GeneraSpirale(terminalCenterline: true)`. Quindi la derivazione pubblica non differisce da Vittorio soltanto nella chiusura: abilita anche l'estensione terminale sperimentale `TerminalCenterline`.

3. **L'astrazione supporta davvero un Return generato autonomamente, anche se non è usato dal percorso pubblico.**  
   [`StrategiaVittorioRevisionatoBenchmark.cs`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/src/Termodel.Core/RadiantPanels/StrategiaVittorioRevisionatoBenchmark.cs) contiene `CheckAbstraction()`, che effettua chiamate separate a `SpiralGenerator.Generate(...)` per `unconditionedReturn` e `conditionedReturn`, con la Supply passata come `LineeCondizionamento`. Questa è l'astrazione di doppio lancio che non appartiene all'architettura desiderata di Vittorio_revisionato.

4. **La chiusura pubblica dipende direttamente dal motore Diego_Vittorio.**  
   In [`SpiraliVittorioRevisionato/ChiudiSpirale.cs`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/src/Termodel.Core/CopiedFromTermodel/SpiraliVittorioRevisionato/ChiudiSpirale.cs) il Return parallelo di Vittorio viene trasformato e passato a:
   - `SpiralHeatingDiegoVittorio.ChiudiSpirale.PreparaRitornoRettilineoVittorio(...)`;
   - `SpiralHeatingDiegoVittorio.ChiudiSpirale.ApplicaChiusuraCombinatoriaRettilineaVittorio(...)`.

   Inoltre `Program.cs` conserva il metodo `ChiudiSpiraleFilesDiegoVittorio()`, non richiamato dal percorso pubblico corrente ma ulteriore segno della dipendenza architetturale.

### Conclusione architetturale

La descrizione più precisa dello stato attuale è:

```text
Vittorio_revisionato pubblico
    Mandata: derivata da Vittorio MA con TerminalCenterline
    Return:  CreaRientro Vittorio parallelo
    Chiusura: helper presi direttamente da Diego_Vittorio
    Generatore: contiene anche astrazione neutra/condizionata per doppio lancio
```

Quindi:

- **corretto:** `Vittorio_revisionato` ha incorporato astrazioni Diego che non dovrebbero far parte della derivazione stretta;
- **da precisare:** il Return del percorso pubblico corrente è ancora costruito con `CreaRientro` parallelo; il doppio lancio esiste come astrazione/capacità e nel benchmark, non come sequenza effettiva del percorso pubblico;
- **obiettivo da ripristinare:** `Vittorio_revisionato = Vittorio invariato per Mandata + Return parallelo Vittorio + sola correzione LG-051 della chiusura/raccordatura`;
- la futura correzione dovrà quindi eliminare dal percorso revisionato `TerminalCenterline`, l'astrazione Return neutra/condizionata e la dipendenza diretta dal namespace `SpiralHeatingDiegoVittorio`, preservando invece `CreaRientro` Vittorio.

**Stato di questa verifica:** sola analisi. Nessun motore, Golden, Harness o frontend è stato modificato.

## Aggiornamento operativo — chiusura configurabile Vittorio_revisionato

Su indicazione dell'utente **non è stato creato alcun motore `Vittorio_modificata`**. La richiesta corretta è stata applicata direttamente a `Vittorio_revisionato`.

Implementazione pubblicata su `main`:

- `Vittorio` resta intoccabile;
- `Vittorio_revisionato` espone ora una modalità di chiusura per-request;
- `spiralClosure=true` conserva il comportamento di chiusura corrente;
- `spiralClosure=false` mantiene Mandata e Return ma lascia aperte le due estremità, senza applicare il collegamento finale e senza etichetta di chiusura;
- il frontend v1.38 espone in **Help → Motore spirali — test pubblico** il checkbox **Chiudi circuito**;
- la scelta è runtime e non viene salvata nel progetto.

Richiesta Service:

```http
POST /api/calculations?spiralEngine=Vittorio_revisionato&spiralClosure=false
```

È stata aggiunta una regression CI dedicata che richiede esplicitamente la modalità aperta e verifica la presenza dei layer Mandata/Return e l'assenza del layer di chiusura/numerazione.

**Verifica reale:** TermodelService Build #1196 / run `36705902144`: restore, JavaScript frontend, build .NET, smoke `Vittorio_revisionato` chiuso e smoke `spiralClosure=false` tutti **SUCCESS**. Il test aperto ha emesso `VITTORIO_REVISIONATO_OPEN_CIRCUITS_OK`. La verifica pubblica ha rilevato Render al commit `9c045895ef2f447bcde0f16729618794d7c56b3b` e frontend pubblico v1.38. Il workflow complessivo resta rosso per uno smoke separato di storage/lock che non è riuscito ad avviare il Service sulla propria porta di test; non riguarda il motore spirali.

Nota diagnostica: sul progetto pubblico usato nello smoke, l'SVG chiuso e quello aperto hanno lo stesso hash perché la geometria corrente non produceva comunque una chiusura applicata; il test conferma quindi il trasporto del flag e la modalità aperta, non una differenza geometrica su quel caso specifico.

## Correzione UI chiusura Vittorio_revisionato — 30/09/2026

Bug riprodotto da screenshot utente: il checkbox **Chiudi circuito** poteva essere disattivato mentre il motore restava **Predefinito Service**. Poiché il default pubblico è `Diego_Vittorio`, il parametro di chiusura non veniva applicato a `Vittorio_revisionato` e la chiusura rimaneva visibile.

Correzione frontend v1.39:

- modificando **Chiudi circuito**, il selettore motore passa automaticamente a `Vittorio_revisionato`;
- il successivo **Aggiorna Modello** invia quindi realmente `spiralEngine=Vittorio_revisionato&spiralClosure=true|false`;
- nessuna modifica geometrica a `Vittorio` o agli altri motori;
- il tooltip del controllo chiarisce l'auto-selezione.

Stato: **pubblicato e verificato**.

- GitHub Pages run `36710823681`: SUCCESS;
- TermodelService Build #1200: JavaScript SUCCESS, build .NET SUCCESS, smoke `Vittorio_revisionato` chiuso SUCCESS, smoke `spiralClosure=false` SUCCESS;
- verifica pubblica: `publicFrontendVersion=1.39` e `PUBLIC_VITTORIO_REVISIONATO_DEPLOY_OK`;
- il workflow globale conserva il noto fallimento separato dello smoke storage/lock; i gate relativi a questa correzione sono SUCCESS.

## Risposta tecnica alla proposta «CHIRURGIA - Ritorno Parallelo» — 30/09/2026

La direzione generale proposta è condivisibile:

```text
Mandata definitiva
    ↓
Return parallelo
    ↓
scelta della chiusura su geometria rettilinea
    ↓
raccordatura finale
```

e resta valido anche il principio: **se nessun candidato di chiusura è realmente valido, lasciare il circuito aperto è preferibile a forzare una chiusura corta o geometricamente scorretta.**

Ci sono però quattro obiezioni operative rispetto allo pseudocodice proposto.

### 1. Evitare un nuovo `OffsetEngine.Parallel(...)` se il Return Vittorio è già quello desiderato

Nel codice reale di `Vittorio_revisionato` il Return pubblico nasce ancora dalla logica storica Vittorio tramite `CreaRientro(...)`. Prima di introdurre un nuovo motore di offset conviene verificare visivamente la modalità già pubblicata con `spiralClosure=false`, che mostra Mandata e Return aperti.

Se quel Return è già il parallelo corretto, introdurre `OffsetEngine.Parallel(...)` significherebbe duplicare una funzione esistente e potrebbe cambiare involontariamente angoli, verso o geometria. In quel caso la chirurgia dovrebbe limitarsi alla sola chiusura.

### 2. Nessun raccordo prima della scelta LG-051

Il passaggio proposto:

```text
ritornoPoly = RaccordaConRaggio(...)
```

non dovrebbe precedere la ricerca della chiusura. LG-051 è stata introdotta proprio per separare:

```text
Mandata rettilinea + Return rettilineo
        ↓
scelta chiusura
        ↓
solo dopo: raccordatura
```

Quindi il Return deve restare rettilineo durante la valutazione dei candidati.

### 3. `OrderByDescending(Lunghezza)` non coincide con la regola consolidata

La regola attuale è **primo candidato valido e stop**, non «scegli il candidato valido più lungo». Ordinare per lunghezza introduce una nuova strategia geometrica e potrebbe cambiare il risultato anche quando un candidato precedente è già valido.

Per restare coerenti con LG-051, il flusso dovrebbe essere:

```text
enumera candidati nell'ordine previsto
    ↓
primo candidato che supera tutti i filtri
    ↓
stop
```

### 4. I filtri devono restare parametrici e completi

La soglia non dovrebbe essere fissata a `0.30`, ma espressa come `2*P`.

Inoltre il filtro del candidato deve comprendere esplicitamente tutti i vincoli già stabiliti:

```text
lunghezza >= 2*P
nessun angolo acuto all'innesto Mandata
nessun angolo acuto all'innesto Return
nessuna intersezione con Mandata o Return
```

### Proposta di convergenza

Prima di rifare il Return, suggerisco questo controllo minimo:

1. eseguire `Vittorio_revisionato` con `spiralClosure=false` sul quadrato;
2. osservare Mandata e Return aperti senza alcuna chiusura;
3. se il Return è già il parallelo desiderato, **non modificare la generazione del Return**;
4. intervenire soltanto sulla chiusura LG-051;
5. se invece il Return aperto è geometricamente errato, allora ha senso discutere una sostituzione della logica di offset.

La versione operativa che propongo, preservando quanto già esiste in Vittorio, è quindi:

```text
Mandata rettilinea Vittorio
        ↓
Return parallelo Vittorio
        ↓
NESSUN raccordo
        ↓
candidati LG-051 nell'ordine previsto
        ↓
per ogni candidato:
    lunghezza >= 2*P
    angoli di innesto non acuti
    nessuna intersezione
        ↓
primo valido → stop
nessun valido → circuito aperto
        ↓
solo alla fine raccordatura R=0,10
```

Queste osservazioni non respingono l'impostazione del consulente: cercano di ridurre il cambiamento al minimo necessario e di evitare che `Vittorio_revisionato` introduca un secondo algoritmo di Return quando il riferimento storico potrebbe già fornire quello corretto.


## Conferma operativa del canale consulente — 30/09/2026

Il protocollo sopra riportato è confermato come riferimento operativo per il prossimo scambio con il consulente.

Per questa sessione:

- le risposte tecniche destinate al consulente vengono pubblicate in questa pagina;
- prima di qualsiasi proposta operativa, ChatGPT verifica quanto necessario direttamente sul repository GitHub reale;
- nessuna proposta del consulente viene trasformata automaticamente in modifica geometrica o codice;
- ogni eventuale implementazione resta subordinata alla discussione con Diego e alla sua decisione;
- non vengono utilizzati altri canali o accessi oltre a GitHub per questo scambio.

Il consulente può quindi inviare la prossima richiesta diagnostica o controproposta precisa. La risposta successiva verrà aggiunta qui, con i riferimenti tecnici necessari.

## Obiettivo corrente e richiesta di direttive al consulente

Il nostro obiettivo operativo, da usare come riferimento per il prossimo passo, è il seguente:

```text
Vittorio_revisionato
    = Mandata Vittorio
    + Return parallelo Vittorio
    + chiusura LG-051 separata dalla raccordatura
```

Vincoli da preservare:

- `Vittorio` resta intoccabile;
- niente secondo motore indipendente nascosto dentro `Vittorio_revisionato`;
- niente doppio lancio del Return in stile `Diego_Vittorio`, salvo decisione esplicita successiva;
- Return parallelo da mantenere se quello storico Vittorio risulta geometricamente corretto;
- ricerca chiusura su geometria rettilinea;
- soglia minima chiusura = `2*P`;
- controllo angoli acuti su Mandata e Return;
- controllo intersezioni;
- regola attuale: primo candidato valido e stop;
- se nessun candidato è valido, circuito lasciato aperto;
- raccordatura finale soltanto dopo la scelta della chiusura, con riferimento corrente `R=0,10`.

Stato attuale:

- il frontend pubblico permette di eseguire `Vittorio_revisionato` con `spiralClosure=false`;
- in questa modalità possiamo osservare Mandata e Return senza il collegamento finale;
- questo ci consente di verificare se il Return parallelo storico Vittorio è già quello corretto prima di introdurre una nuova logica di offset.

### Richiesta al consulente

Attendiamo una **direttiva tecnica o diagnostica precisa** per il prossimo passo.

Può indicarci, ad esempio:

- quale caso Harness eseguire;
- quali SVG confrontare;
- quali misure/angoli/distanze verificare;
- quale segmento o porzione del Return considera geometricamente non corretta;
- oppure quale modifica minima propone dopo aver osservato il Return aperto.

La sua indicazione verrà verificata sul repository reale e discussa con Diego prima di qualsiasi nuova modifica geometrica.

## Linee guida

Documento autorevole:

[`LINEE-GUIDA-SVILUPPO-DISEGNO-SPIRALI.md`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/docs/spirali-strategy-register/LINEE-GUIDA-SVILUPPO-DISEGNO-SPIRALI.md)

Riferimenti principali:

- **LG-048** — chiusura rapida terminale Diego_Vittorio;
- **LG-049** — raccordi adattivi a frammentazione limitata Diego_Vittorio;
- **LG-051** — Vittorio_revisionato: chiusura rettilinea completa prima della raccordatura.

## Regression e Golden

I casi reali rettangolari principali sono:

- [`DV-PUBLIC-PANELS-RECT-01-P030-DIEGO-VITTORIO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/cases/DV-PUBLIC-PANELS-RECT-01-P030-DIEGO-VITTORIO.json) — `locale_1`;
- [`DV-PUBLIC-PANELS-RECT-05-P030-DIEGO-VITTORIO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/cases/DV-PUBLIC-PANELS-RECT-05-P030-DIEGO-VITTORIO.json) — `locale_5`;
- [`DV-PUBLIC-PANELS-RECT-08-P030-DIEGO-VITTORIO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/cases/DV-PUBLIC-PANELS-RECT-08-P030-DIEGO-VITTORIO.json) — `locale_8`;
- [`DV-PUBLIC-PANELS-RECT-09-P030-DIEGO-VITTORIO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/cases/DV-PUBLIC-PANELS-RECT-09-P030-DIEGO-VITTORIO.json) — `locale_9`;
- [`DV-PUBLIC-SQUARE-LEFT-P030-DIEGO-VITTORIO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/cases/DV-PUBLIC-SQUARE-LEFT-P030-DIEGO-VITTORIO.json) — quadrato pubblico Diego_Vittorio;
- [`LG041-SQUARE4X4-T1-P030-VITTORIO-REVISIONATO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/cases/LG041-SQUARE4X4-T1-P030-VITTORIO-REVISIONATO.json) — quadrato di controllo Vittorio_revisionato.

Il Golden attivo del quadrato pubblico Diego_Vittorio è:

[`baselines/DV-PUBLIC-SQUARE-LEFT-P030-DIEGO-VITTORIO.json`](https://github.com/Fetonte1960/Termodel/blob/main/Server/Termodelwebservice/tests/radiant-harness/baselines/DV-PUBLIC-SQUARE-LEFT-P030-DIEGO-VITTORIO.json)

## Regola sui Golden

> **Non aggiornare il Golden Diego_Vittorio alla cieca.**
>
> Se il risultato geometrico cambia, la differenza deve essere prima riprodotta, compresa e verificata. Un Golden va aggiornato solo dopo aver stabilito che il nuovo risultato è quello corretto e approvato; non va mai usato l'aggiornamento del Golden per trasformare automaticamente una regressione in un test verde.

---

Repository: [Fetonte1960/Termodel](https://github.com/Fetonte1960/Termodel)
