# MyHome3D — Linee guida della versione Mobile

## Identità e scopo

La versione Mobile di Termodel viene da ora definita e presentata come **MyHome3D**.

Lo scopo di MyHome3D è permettere a chiunque di creare un modello della propria casa, compresi gli impianti.

Il modello deve poter essere utilizzato dall'utente per interagire con aziende di costruzione e di installazione/impiantistica, così da ottenere rapidamente preventivi senza la necessità di riprogettare quanto è già stato progettato.

Questa è, allo stato attuale, la definizione concordata del progetto Mobile. Non vengono introdotte altre regole, funzioni o decisioni finché non saranno concordate esplicitamente.

## Strumento di realizzazione e riferimento per l'assistenza

**Termodel è lo strumento utilizzato per la realizzazione del modello MyHome3D.**

Per la generazione di help o di istruzioni richieste dall'utente per approfondire una funzione, MyHome3D farà riferimento alle **istruzioni AI di Termodel**.

## Help Mobile

La prima funzione Help di MyHome3D deve essere accessibile dal minipannello mobile **Esplora** sia nella vista **3D** sia nella vista **CAD 2D**.

Il pannello Help deve:
- mostrare come primo comando in alto **Chiedi informazioni ad AI**;
- contenere un primo messaggio di spiegazione scorrevole;
- guidare l'utente nell'uso dell'assistenza AI;
- copiare negli appunti un'istruzione AI dedicata a **MyHome3D**, coerente con queste linee guida;
- usare le **istruzioni AI di Termodel** come riferimento per gli approfondimenti richiesti dall'utente.

### Sorgente autorevole dell'Help AI

Il comando **Chiedi informazioni ad AI** deve copiare negli appunti la specifica istruzione AI pubblicata sul sito Termodel per **MyHome3D Mobile**.

Questa istruzione deve essere armonizzata con le regole generali Termodel ma, per il flusso Mobile, deve riferirsi all'**input unifilare della versione Web / CAD 2D** e non indirizzare l'utente verso AutoCAD o il flusso desktop DXF.

## Barra principale Home Mobile 3D

Il comando **Filtri** appartiene alla barra principale della Home Mobile 3D e non al menu **Esplora**.

**Filtri deve essere sempre attivo**, anche quando è visualizzato un esempio sul quale le altre funzioni di esplorazione non sono disponibili. I filtri grafici restano applicabili al modello visualizzato.

Il comportamento della finestra Filtri rimane quello già consolidato:
- le scelte nella finestra sono temporanee;
- **Applica** trasferisce le scelte ai filtri reali e aggiorna il modello;
- **Annulla**, X e chiusura non applicano modifiche.

## Istruzione AI Mobile — modalità informativa

L'istruzione AI copiata da **Chiedi informazioni ad AI** deve essere esclusivamente informativa su **MyHome3D** e **Termodel**.

Non deve contenere istruzioni per generare o ricostruire un progetto da descrizione testuale, bitmap, raster o altra immagine e non deve avviare automaticamente operazioni sul progetto.

Dopo l'acquisizione dell'istruzione, l'AI deve rispondere soltanto:

```text
Perfetto adesso sono in grado di darti informazioni su Myhome 3d e Termodel
```

Dopo questa conferma attende la domanda dell'utente.

## Creazione, consolidamento e livelli di accesso

MyHome3D permette all'utente di arrivare alla costruzione del modello passando alla **versione Web PC di Termodel**.

### Uso senza registrazione

Senza registrazione l'utente può realizzare un **modello base** e visualizzarne l'**anteprima 3D**.

Non può:
- usare il server di calcolo per le funzioni avanzate;
- consolidare il modello;
- ottenere un link di condivisione del modello consolidato.

### Registrazione

Con la registrazione l'utente può:
- **consolidare il modello**;
- ottenere un **link condivisibile** da inviare a fornitori, installatori, imprese o altre persone che devono esplorare il modello;
- evitare di far riprogettare a ogni interlocutore ciò che è già stato definito;
- richiedere consigli su **miglioramenti termici**, interventi sugli **impianti** e sull'**isolamento**.

La registrazione da sola non abilita le elaborazioni avanzate del server.

### Abbonamento server

Per i modelli avanzati che richiedono il motore di calcolo Termodel è necessario un abbonamento di **100 € + IVA per anno**.

Rientrano tra le funzioni avanzate:
- modelli con **più piani**;
- **tetti/coperture** avanzati;
- **locali mansardati**;
- altre elaborazioni che richiedono il server di calcolo completo.

## Persistenza dei Filtri Mobile

Le scelte effettuate nella finestra **Filtri** diventano effettive soltanto con **Applica**.

Dopo **Applica**:
- le selezioni diventano lo stato reale dei filtri;
- il modello 3D viene aggiornato immediatamente;
- riaprendo la finestra devono ricomparire le selezioni applicate.

**Annulla**, X e chiusura non consolidano le modifiche.

## Istruzione AI — formato normalizzato

L'istruzione breve copiata da Termodel/MyHome3D per collegare l'assistente AI deve essere sempre:

```text
Sei l’assistente AI di Termodel.

Prima di aiutare l’utente, apri direttamente e leggi le istruzioni aggiornate pubblicate all’indirizzo:

https://www.termodel.it/ai/

Non cercare Termodel sul Web e non sostituire questa pagina con risultati di ricerca relativi ad altri prodotti.

Dopo aver letto le istruzioni, applicale alla richiesta dell’utente.

Se non puoi accedere direttamente alla pagina, dichiaralo chiaramente senza inventare le istruzioni.
```

L'utente non deve ricevere il prompt tecnico completo: il messaggio breve rimanda alla pagina pubblica aggiornata `/ai/`.

## Gruppo AI nella Home Mobile / Esplora

Nel menu **Esplora** della Home Mobile i comandi AI devono essere raggruppati visivamente nello stesso blocco:

- **Copia istruzione AI negli appunti**;
- **Importa progetto realizzato con AI dagli appunti**;
- **? / Help flusso AI**.

Il pulsante Help del gruppo deve spiegare il ciclo corretto:

1. copia l'istruzione AI;
2. apri ChatGPT, Gemini, DeepSeek o un altro assistente e incolla l'istruzione;
3. descrivi il progetto o allega pianta/PDF;
4. l'AI deve proporre **per primo il download di `DisegnoInput.svg`**, quando può creare realmente il file;
5. deve fornire anche il blocco `TERMODEL-SVG-TEXT-V1` per il normale copia/incolla;
6. se può costruire e verificare esattamente il Link V1 e questo non supera **8000 caratteri**, può aggiungere anche **Apri il progetto in Termodel** come terza via.

Il Help deve ricordare che per una nuova geometria il formato previsto è `TERMODEL-SVG-TEXT-V1`, mentre un progetto Termodel completo corrente può usare `TERMODEL-PROJECT-TEXT-V1`. XML generico e XML Nazionale non vanno incollati in **Importa da AI**.



## Regola formati per l'importazione AI

Il comando Mobile **Importa progetto realizzato con AI dagli appunti** usa lo stesso contratto del Web.

- Nuova geometria generata dall'AI: `TERMODEL-SVG-TEXT-V1` / SVG previsto dal flusso.
- Progetto completo: `TERMODEL-PROJECT-TEXT-V1` soltanto se proviene dal flusso Termodel corrente.
- **XML Nazionale: non è un payload di Importa da AI.**

Il formato interno del progetto può evolvere: per una nuova geometria l'AI non deve ricostruire a memoria il progetto completo; deve lasciare a Termodel la creazione del contenitore corrente e la validazione.

---

## Importazione progetto AI dalla Home Mobile

Nel menu **Esplora** della Home Mobile il comando **Importa progetto realizzato con AI dagli appunti** è affiancato da **Copia istruzione AI negli appunti** e dal relativo **Help flusso AI**.

Il comando riusa la stessa procedura di importazione già disponibile nel frontend Termodel Web: legge dagli appunti un progetto completo `TERMODEL-PROJECT-TEXT-V1` oppure, quando previsto dal flusso esistente, una pianta SVG restituita dall'AI. Non deve esistere una seconda logica di importazione dedicata al Mobile.

Il comando deve essere raggiungibile anche quando è visualizzato il modello iniziale non esplorabile: in questo stato il menu **Esplora** resta apribile e permette sia di scegliere un esempio sia di importare il progetto AI dagli appunti.


## Link AI V1 — apertura diretta

Dalla versione frontend **1.48** Termodel/MyHome3D può ricevere un risultato AI direttamente nel fragment dell'URL, senza passare dagli appunti.

Formati accettati:

- `#ai64=<payload>` — formato preferito;
- `#ai=<payload>` — variante compatibile.

Per una **nuova geometria**, il payload preferito del Link V1 è lo **SVG finale grezzo e validato**, codificato UTF-8 → Base64URL senza padding. Non è necessario inserire nel link il wrapper `TERMODEL-SVG-TEXT-V1`.

Il contenuto decodificato viene passato allo stesso importatore già usato da **Importa progetto realizzato con AI dagli appunti**: non esiste un secondo validatore.

Regola di emissione AI: la consegna prioritaria è il file scaricabile **`DisegnoInput.svg`**, quando l'ambiente AI supporta realmente la creazione di file. Il blocco `TERMODEL-SVG-TEXT-V1` resta sempre la via universale di copia/incolla. Il Link V1 è una terza via opzionale e può essere proposto soltanto quando la sua lunghezza finale è al massimo **8000 caratteri** e la codifica è stata verificata con round-trip esatto. Se non è possibile verificare la codifica o se il link supera la soglia, non va pubblicato.

Dopo la lettura il fragment viene rimosso dalla barra degli indirizzi, così un refresh non ripete automaticamente l'importazione.
