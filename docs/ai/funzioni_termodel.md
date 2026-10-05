# TERMODEL — Funzioni, tasti e menu

> DOCUMENTO OPERATIVO GENERATO DAI SORGENTI WEB  
> Ultimo aggiornamento: 2026-10-05  
> Frontend esaminato: **Termodel Web 1.45**

## Scopo

Questo documento fornisce alla chat AI una panoramica aggiornata dell'interfaccia reale di Termodel Web e MyHome3D Mobile.

Non è una specifica teorica: deve essere ricostruito dai sorgenti correnti quando viene richiesto un aggiornamento.

Quando l'utente chiede come usare un tasto, un menu, una finestra o una funzione dell'interfaccia, la chat deve consultare questo documento prima di rispondere.

## Protocollo di aggiornamento a richiesta

Quando Diego o un incaricato chiede di **aggiornare le funzioni Termodel**, non limitarti a correggere questo testo a memoria.

Rileggi almeno i sorgenti correnti:

- `docs/termodel-ui-demo/frontend-version.txt`
- `docs/termodel-ui-demo/index.html`
- `docs/termodel-ui-demo/app.js`
- `docs/termodel-ui-demo/archivio-web.js`
- `docs/termodel-ui-demo/examples/catalog.json`
- `docs/termodel-ui-demo/LINEE-GUIDA-MOBILE.md`
- `docs/termodel-ui-demo/MyHome3D.md`

Se una funzione richiamata dall'interfaccia è implementata in un modulo separato, esamina anche quel modulo.

Poi aggiorna integralmente questo documento riportando:

1. versione frontend;
2. menu e tasti realmente presenti;
3. funzione effettivamente collegata nel JavaScript;
4. controlli presenti ma non ancora collegati;
5. differenze PC / Mobile;
6. esempi disponibili;
7. nuove finestre o flussi comparsi nel sorgente.

Il sorgente corrente ha sempre priorità su descrizioni precedenti.

---

# 1. Stato generale dell'interfaccia

Versione frontend rilevata: **1.45**.

Titoli applicazione dichiarati dal sorgente:

- Home Web: **Termodel 3.2 — Web — GeneraPianta + ArchivioWeb v1.45**
- CAD 2D: **Termodel Cad 2d Versione 1.45**

L'interfaccia Web PC è organizzata in:

- barra menu superiore;
- schede principali;
- area modello 3D;
- barra comandi inferiore;
- CAD 2D dedicato;
- finestre di archivio;
- finestre AI/import/export.

Lo stato iniziale può essere in modalità esplorazione esempi: alcune funzioni richiedono prima la creazione, apertura o scelta di un progetto.

---

# 2. Menu superiore — versione Web PC

## File

### Funzioni collegate

- **Nuovo** — avvia la creazione di un nuovo progetto. Se serve, apre la scelta iniziale che permette di entrare nel CAD vuoto, istruire l'AI o importare da AI.
- **Apri...** — apre un progetto Termodel da file.
- **Apri esempio...** — apre la selezione degli esempi disponibili.
- **Salva** — salva il progetto corrente; è disponibile quando esiste un progetto strutturato.
- **Salva con nome** — salva il progetto corrente scegliendo un nuovo nome.
- **Copia progetto negli appunti** — copia il progetto completo nel formato di interscambio Termodel; richiede un progetto attivo.

### Voci presenti nell'interfaccia ma senza collegamento operativo specifico rilevato nella v1.45

- **Carica progetto ZIP**
- **Salva progetto ZIP**
- **Importa XML nazionale**
- **Esporta XML nazionale**
- **Esporta BIM (ifc)**

Queste voci sono visibili nel menu HTML, ma nella v1.45 non hanno un identificatore o un handler dedicato rilevato in `app.js`. Non descriverle all'utente come già operative senza una nuova verifica del sorgente.

---

## Modifica

### Archivi collegati

Le seguenti voci aprono `ArchivioWeb` tramite `data-archive`:

- **Archivio Pareti**
- **Archivio Finestre**
- **Archivio Ponti termici**
- **Archivio Confini**
- **Archivio Zone**
- **Archivio Reti**
- **Archivio Tipologie pannelli**

Se non esiste ancora un progetto completo, Termodel propone prima di creare o importare un progetto.

### Voci presenti ma non collegate direttamente nella v1.45

- **Visualizza/Edita disegni di input nel CAD**
- **Archivio dati climatici**

Per entrare nel CAD usare il comando operativo **Edita nel Cad** della barra inferiore.

---

## Visualizza

- **Archivi** — apre la gestione dell'archivio **Piani**.
- **Modello** — voce presente nel menu; la vista modello è comunque gestita dalla scheda principale **Modello**.
- **Plugin Autocad** — presente nel menu ma senza handler Web specifico rilevato.
- **Visualizza tutor** — presente nel menu ma senza handler Web specifico rilevato.
- **Genera il modello all'avvio** — presente nel menu ma senza handler Web specifico rilevato.

---

## Calcoli

- **Visualizza risultati dell'ultimo calcolo** — voce presente nell'interfaccia; nella v1.45 non risulta un handler dedicato associato a questo pulsante del menu.

Le elaborazioni server e gli esecutivi vengono comunque richiamati da altri comandi operativi del CAD e del modello.

---

## Help

Funzioni operative rilevate:

- **Help Termodel Web** — apre la finestra Help Web.
- **Modalità esplorazione** — abilita/disabilita l'aiuto contestuale sui controlli desktop.
- **Usa localhost:5080 (debug Visual Studio)** — devia il Service verso l'istanza locale di sviluppo.
- **Motore** — selezione fra:
  - Predefinito Service
  - Vittorio_revisionato
  - Vittorio
  - Diego_Vittorio
- **Chiudi circuito** — opzione di calcolo delle spirali.
- categorie log selezionabili:
  - Sempre
  - colmi
  - spezza
  - Error
  - Svg
  - RedrawHelix
  - GeneraModello
  - Performance
  - PontiAutomatici
  - SpiraliDiego
- **Copia log negli appunti** — copia il log quando disponibile.

La finestra **Help Termodel Web** contiene anche **Istruisci AI per Termodel Web**.

---

# 3. Schede principali Web PC

Sono presenti tre schede:

- **Modello** — vista 3D principale.
- **Informazioni sul modello** — informazioni descrittive del progetto/modello.
- **Calcoli** — area dedicata ai risultati o alle elaborazioni previste dall'interfaccia.

---

# 4. Barra inferiore della Home Web PC

Comandi principali:

- **Gestione Piani** — apre l'archivio Piani.
- **Istruisci AI** — copia/prepara il collegamento dell'AI alle istruzioni Termodel e apre la guida visibile.
- **Importa da AI** — importa dagli appunti un progetto Termodel corrente oppure una pianta restituita dall'AI come SVG / `TERMODEL-SVG-TEXT-V1`. Un XML generico o XML Nazionale non è un payload valido per questo comando; dalla v1.45 viene mostrato un messaggio esplicito invece del generico errore di progetto non valido.
- **Edita nel Cad** — entra nel CAD 2D Web; se manca un progetto, apre prima il flusso di creazione/importazione.
- **Aggiorna Modello** — rigenera/aggiorna la vista del modello.
- **Mostra Filtri Grafici** — abilita la visualizzazione del pannello filtri grafici nella versione desktop.

---

# 5. Finestra iniziale di creazione progetto

Quando una funzione richiede un progetto ma non ne esiste ancora uno, Termodel può proporre:

- **Edita nel Cad** — apre un progetto vuoto nel CAD Web.
- **Istruisci AI** — prepara l'AI per Termodel.
- **Importa da AI** — usa il progetto o la pianta presenti negli appunti.
- **Annulla** — chiude il flusso.

---

# 6. Esplorazione esempi

Catalogo corrente: `examples/catalog.json`.

Esempi presenti alla data di questo aggiornamento:

1. **Pannelli radianti**
   - progetto reale di regressione;
   - 6 circuiti radianti;
   - esempio predefinito;
   - esecutivo pannelli consolidato disponibile.

2. **Quadrato con pannelli**
   - quadrato 4 × 4 m;
   - tubo di ingresso;
   - esecutivo pannelli consolidato disponibile.

La finestra iniziale di esplorazione permette di scegliere un esempio e caricarlo senza dover creare prima un progetto personale.

---

# 7. CAD 2D Web — barra strumenti

## Gestione sfondo ed esecutivo

- **＋ Aggiungi sfondo** — aggiunge un'immagine di sfondo al piano.
- **↻ Esecutivo pannelli SVG** — carica/mostra l'esecutivo pannelli SVG quando disponibile.
- **Calibra** — calibra lo sfondo usando una misura nota.

## Disegno geometrico

- **＋ Nuova parete** — avvia il disegno di una nuova parete.
- **＋ Allinea** — inserisce/usa un comando di allineamento.
- **＋ Porta/Finestra** — inserisce un'apertura su una parete.
- **＋ Finestra 2 punti** — inserisce una finestra definita mediante due punti.
- **＋ Ponte** — inserisce un ponte termico.
- **＋ Locale** — inserisce il simbolo/dato di un locale.
- **＋ Colmo** — inserisce un colmo di copertura.
- **＋ Copertura** — crea un nuovo piano Copertura usando lo sfondo del piano corrente.

## Archivi e dati

- **▤ Arc** accanto ai comandi copertura — apre l'archivio Piani.
- **Arc** nel pannello proprietà parete — apre l'archivio Pareti.
- **Arc** nel pannello Confini — apre l'archivio Confini.
- **▤ Dati** — su schermi piccoli apre/chiude il pannello dati CAD.

## Modifica

- **↶ Undo** — annulla l'ultima modifica.
- **↷ Redo** — ripristina una modifica annullata.
- **× Elimina** — elimina l'elemento selezionato.
- **Applica al simbolo** — applica i dati modificati al simbolo selezionato.
- **Applica alla linea** — applica i dati modificati alla linea/parete selezionata.

## Sequenze di disegno

Durante i comandi di disegno possono apparire:

- **Ripeti ultimo comando**
- **Chiudi**
- **Chiudi ortogonale**
- **Interrompi sequenza**

## Rigenerazione e uscita

- **⟳ Rigenera pianta** — rigenera la pianta/modello derivato dopo le modifiche.
- **⇩ Esporta pianta CAD (.DXF)** — esporta la pianta CAD quando la generazione richiesta è disponibile.
- **↩ Torna al modello 3d** — rientra nella vista 3D; se necessario Termodel rigenera prima il modello.

---

# 8. Archivi Web

Gli archivi attualmente collegati dall'interfaccia comprendono:

- Piani
- Pareti
- Finestre
- Ponti
- Confini
- Zone
- Reti
- TipologiePannelli

La finestra **ArchivioWeb** genera campi e griglia usando `definizionedati.json`.

Comandi della finestra archivio:

- **Aggiungi riga**
- **Inserisci prima**
- **Cancella riga**
- **Applica**
- **Vai al modello**
- **X / Chiudi**

Per alcuni archivi l'aggiunta o cancellazione delle righe è protetta, mentre la modifica dei record resta disponibile.

Su schermi stretti l'archivio diventa a pieno schermo, con tab orizzontali scorrevoli, campi più grandi e comandi adatti al touch.

---

# 9. Funzioni AI e importazione pianta

## Contratto corrente di importazione dagli appunti

Per **Importa da AI** il sorgente v1.45 distingue:

- progetto completo corrente `TERMODEL-PROJECT-TEXT-V1`;
- SVG Termodel o busta `TERMODEL-SVG-TEXT-V1`;
- XML generico / XML Nazionale, che viene rifiutato con un messaggio specifico.

Per una nuova geometria generata dall'AI il percorso robusto è `TERMODEL-SVG-TEXT-V1`: Termodel valida lo SVG e crea il progetto strutturato usando il template corrente. L'AI non deve ricostruire a memoria un contenitore progetto completo, perché manifest, archivi e definizioni possono evolvere.

La voce **Importa XML nazionale** resta visibile nel menu File ma, nella v1.45 verificata, non risulta collegata a un handler operativo dedicato. Non presentarla quindi come funzione Web disponibile senza una nuova verifica.

La finestra dedicata al flusso raster/AI contiene:

- **Scegli pianta...**
- **Copia istruzioni Termodel**
- **Apri ChatGPT**
- **Apri SVG...**
- **Incolla SVG**
- **Controlla SVG**
- **Esporta / Copia SVG Termodel**
- **Scarica pianta SVG pulita**
- **Scarica JSON 3D AI**
- **Chiudi**

I pulsanti dipendenti da una fase precedente possono essere inizialmente disabilitati.

---

# 10. Importazione PDF

Quando viene importato un PDF come riferimento grafico:

- **←** pagina precedente
- **→** pagina successiva
- **Importa pagina** — rasterizza/importa la pagina selezionata
- **Annulla**
- **X**

---

# 11. Importazione DXF

La finestra di conversione DXF comprende:

- **Tutti** — seleziona tutti i layer disponibili.
- **Nessuno** — deseleziona tutti i layer.
- **Converti** — converte i layer selezionati.
- **Annulla**
- **X**

---

# 12. Esportazione SVG

La finestra di esportazione SVG comprende:

- **Copia SVG**
- **Scarica SVG**
- **Chiudi**
- **X**

---

# 13. Versione Mobile / MyHome3D

## Attivazione effettiva

Nel sorgente v1.45 la modalità Mobile dedicata viene riconosciuta automaticamente tramite user agent **Android**.

Il codice usa:

`/Android/i.test(navigator.userAgent)`

Quindi la UI speciale MyHome3D descritta qui sotto è quella effettivamente attivata automaticamente sui dispositivi Android. Su altri dispositivi mobili il comportamento va verificato sul browser concreto prima di assumere che venga applicata la stessa modalità.

All'avvio Android la UI desktop viene nascosta durante la preparazione per evitare il lampeggio dell'interfaccia completa.

---

## Home Mobile 3D

La Home Mobile sostituisce gran parte dell'interfaccia desktop con una piccola palette sovrapposta.

Comandi principali:

- **Esplora**
- **Filtri**
- **Help**
- icona **Versione completa desktop**

### Esplora

Apre un minipannello con un gruppo AI in alto:

- **Copia istruzione AI negli appunti** — copia il bootstrap normalizzato che rimanda a `https://www.termodel.it/ai/`.
- **Importa progetto realizzato con AI dagli appunti** — richiama lo stesso importatore della Home Web e accetta progetto Termodel corrente oppure SVG/TERMODEL-SVG-TEXT-V1; resta raggiungibile anche dal modello iniziale non esplorabile.
- **? Help AI** — apre una spiegazione del flusso corretto copia istruzione → chat AI → copia risultato → importazione.
- **Esempio** — scelta dell'esempio Termodel.
- **Disegno unifilare** — apre il CAD 2D mostrando l'input unifilare.
- **Disegno esecutivo** — apre l'esecutivo pannelli quando disponibile.

Se l'esempio non supporta una delle viste, il comando relativo viene disabilitato.

### Filtri

**Filtri** è indipendente da Esplora ed è sempre disponibile, anche sul modello iniziale non esplorabile.

La finestra contiene quattro gruppi:

- **Piani**
- **Componenti**
- **Confini**
- **Separazione tra vani**

Comandi:

- **Applica** — trasferisce le selezioni allo stato reale dei filtri e aggiorna il modello 3D.
- **Annulla** — chiude senza applicare.
- **X** — chiude senza applicare.

Dopo **Applica**, riaprendo la finestra devono riapparire le scelte consolidate.

### Help

Apre **MyHome3D — Help**.

Il primo comando della finestra è:

- **Chiedi informazioni ad AI**

Questo comando carica l'istruzione informativa MyHome3D dal sito Termodel e la copia negli appunti.

L'Help distingue il contesto:

- Vista modello 3D
- Vista CAD 2D

### Versione completa desktop

L'icona con il monitor passa dalla UI mobile alla disposizione completa desktop di Termodel.

---

# 14. CAD 2D Mobile

Nel CAD mobile compare una palette dedicata con:

- **Home** — torna al modello 3D.
- **Esplora** — apre i controlli di visualizzazione del CAD.
- **Help** — apre l'Help MyHome3D nel contesto CAD 2D.

Dentro **Esplora**:

- **Piano** — seleziona il piano visualizzato.
- **Sfondo** — mostra/nasconde lo sfondo.
- **Esecutivo pannelli** — mostra/nasconde l'esecutivo, e se necessario ne richiede la disponibilità.
- **Unifilare input** — mostra/nasconde il disegno di input.

Su schermi piccoli è inoltre disponibile il comando **▤ Dati** per aprire/chiudere il pannello delle proprietà CAD.

---

# 15. Differenza importante tra default PC e Mobile sugli esempi

Quando viene caricato un esempio:

## Android / MyHome3D

Se esiste un esecutivo consolidato:

- **Esecutivo pannelli: ON**
- **Unifilare input: OFF**
- **Sfondo: OFF**

L'utente vede quindi subito l'esecutivo.

## Desktop

- **Esecutivo pannelli: OFF**
- **Unifilare input: ON**
- **Sfondo: ON**

Il default Mobile non viene propagato alla versione desktop.

---

# 16. Come deve usare questo documento l'AI

Quando l'utente chiede:

- "dove trovo questo comando?"
- "cosa fa questo tasto?"
- "come apro il CAD?"
- "come vedo l'esecutivo?"
- "su telefono dove si trova?"
- "perché sul PC vedo cose diverse?"
- "quali funzioni ci sono?"

usa prima questo documento.

Distingui sempre:

1. **Web PC**
2. **CAD 2D Web**
3. **MyHome3D / Mobile Android**
4. **funzione realmente collegata**
5. **voce soltanto presente ma non ancora operativa**

Se il documento è precedente alla versione frontend corrente, aggiornalo dai sorgenti prima di dare indicazioni dettagliate.

