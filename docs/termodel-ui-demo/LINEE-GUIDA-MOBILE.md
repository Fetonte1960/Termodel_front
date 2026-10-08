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

Questa modalità informativa resta distinta dal percorso operativo **Fotografa una pianta con ChatGPT**, che usa invece il bootstrap generale Termodel e il flusso immagine → progetto.

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

Nel menu **Esplora** della Home Mobile i comandi AI devono essere raggruppati nello stesso blocco, con il percorso fotografico come azione principale:

- **Fotografa una pianta con ChatGPT** — apre direttamente ChatGPT con il bootstrap Termodel corrente e una breve istruzione di sessione che chiede di attendere la foto; la fotografia o la scelta di una foto già esistente avviene dentro ChatGPT, evitando di acquisire l'immagine due volte;
- **Copia istruzione AI negli appunti** — percorso alternativo per usare un'altra AI o incollare manualmente il bootstrap;
- **Importa progetto dagli appunti** — legge direttamente gli appunti e usa lo stesso importatore/validator del Web, senza aprire la scelta Desktop Appunti/Download;
- **? / Help flusso AI** — spiega il ciclo completo foto → ChatGPT → copia → ritorno MyHome3D.

Il flusso consigliato è:

1. apri **Esplora**;
2. premi **Fotografa una pianta con ChatGPT**;
3. in ChatGPT usa il comando allega/fotocamera e fotografa la pianta, oppure scegli una foto già presente;
4. l'AI applica il flusso immagine → progetto delle istruzioni Termodel e produce il blocco completo **`TERMODEL-SVG-TEXT-V1`**;
5. usa il normale comando **Copia** del blocco in ChatGPT;
6. torna in MyHome3D;
7. apri **Esplora** e premi **Importa progetto dagli appunti**;
8. Termodel usa il validator corrente, crea il contenitore progetto e mostra il modello.

Non chiedere all'utente di fotografare prima la pianta dentro Termodel e poi allegarla una seconda volta in ChatGPT: il browser non può trasferire automaticamente un file selezionato in una pagina Web dentro il campo allegati di un altro sito. La fotografia deve quindi avvenire direttamente nell'ambiente AI.

Per una nuova geometria il formato di ritorno consigliato e universale resta **`TERMODEL-SVG-TEXT-V1`**. Un progetto Termodel completo corrente può usare `TERMODEL-PROJECT-TEXT-V1`. XML generico e XML Nazionale non vanno incollati in **Importa progetto dagli appunti**.


## Regola formati per l'importazione AI

Il comando Mobile **Importa progetto realizzato con AI dagli appunti** usa lo stesso contratto del Web.

- Nuova geometria generata dall'AI: `TERMODEL-SVG-TEXT-V1` / SVG previsto dal flusso.
- Progetto completo: `TERMODEL-PROJECT-TEXT-V1` soltanto se proviene dal flusso Termodel corrente.
- **XML Nazionale: non è un payload di Importa da AI.**

Il formato interno del progetto può evolvere: per una nuova geometria l'AI non deve ricostruire a memoria il progetto completo; deve lasciare a Termodel la creazione del contenitore corrente e la validazione.

---

## Importazione progetto AI dalla Home Mobile

Nel menu **Esplora** della Home Mobile il comando **Importa progetto dagli appunti** è il rientro principale dopo ChatGPT.

Su Mobile questo comando deve:

- leggere direttamente gli appunti in seguito al gesto esplicito dell'utente;
- non aprire la finestra Desktop con la scelta **Importa dagli appunti / Leggi DisegnoInput.svg da Download**;
- riusare esattamente `importAiFromClipboard()` e lo stesso `importAiText()` del frontend Web;
- accettare `TERMODEL-SVG-TEXT-V1` / SVG previsto dal flusso oppure un progetto completo corrente `TERMODEL-PROJECT-TEXT-V1`;
- restare raggiungibile anche quando è visualizzato il modello iniziale non esplorabile.

Dopo un'importazione riuscita il nuovo progetto viene creato con il template corrente e l'utente rientra nella Home Mobile con il modello disponibile per esplorazione e modifica.


## Link AI V1 — compatibilità

Il frontend continua a riconoscere i fragment `#ai64=` e `#ai=` introdotti dalla versione 1.48 e li passa allo stesso importatore usato dagli appunti.

Nel nuovo percorso Mobile **foto → ChatGPT → ritorno MyHome3D**, però, il Link AI V1 non è la via consigliata: la consegna operativa è il blocco copiabile `TERMODEL-SVG-TEXT-V1`.

Il Link V1 resta quindi una compatibilità disponibile per flussi specifici che possano generarlo e verificarlo deterministicamente. Dopo la lettura il fragment viene rimosso dalla barra degli indirizzi per evitare una seconda importazione al refresh.
