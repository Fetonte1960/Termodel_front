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

## Istruisci AI — guida visibile

Il comando **Istruisci AI** deve:
- copiare negli appunti il messaggio di collegamento alle istruzioni Web Termodel;
- aprire una finestra ben visibile che spieghi chiaramente cosa fare;
- distinguere il flusso PC (**Ctrl+V**) dal flusso smartphone (**pressione prolungata nel campo messaggio -> Incolla -> Invia**);
- mostrare un esempio pratico con **Meta AI in WhatsApp**;
- usare per l'esempio solo nomi, testo e descrizioni generiche dei comandi, senza incorporare loghi o asset grafici di terzi.



## Importazione progetto AI dalla Home Mobile

Nel menu **Esplora** della Home Mobile è disponibile il comando **Importa progetto realizzato con AI dagli appunti**.

Il comando riusa la stessa procedura di importazione già disponibile nel frontend Termodel Web: legge dagli appunti un progetto completo `TERMODEL-PROJECT-TEXT-V1` oppure, quando previsto dal flusso esistente, una pianta SVG restituita dall'AI. Non deve esistere una seconda logica di importazione dedicata al Mobile.

Il comando deve essere raggiungibile anche quando è visualizzato il modello iniziale non esplorabile: in questo stato il menu **Esplora** resta apribile e permette sia di scegliere un esempio sia di importare il progetto AI dagli appunti.
