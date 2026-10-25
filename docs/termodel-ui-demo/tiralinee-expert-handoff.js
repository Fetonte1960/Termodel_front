/* SH -> expert ChatGPT handoff. Only after explicit user consent.
   Prompts reuse the official SOS Shell bootstrap when pairing is verified.
   No bearer secrets or lab credentials are ever included. */
(function(root){
  'use strict';
  const QUESTION='Non riesco ad intepretare la tua richiesta, vuoi che passi la conversazione ad un modello ai esperto ?';
  function isUnrecognized(result){
    return Boolean(result&&result.esito==='FAULT'&&!result.reason);
  }
  function buildPrompt(options){
    const opts=options||{};
    const paired=Boolean(opts.paired);
    const official=typeof opts.shellBootstrap==='string'&&opts.shellBootstrap.length<=7000?
      opts.shellBootstrap.trim():'';
    const base=paired&&official?official:[
      'Sei l’assistente AI esperto di Termodel per il laboratorio Tiralinee.',
      'Prima di aiutare l’utente, consulta le istruzioni ufficiali aggiornate:',
      'https://www.termodel.it/ai/',
      'Non sostituirle con risultati di ricerca di altri prodotti. Se non puoi accedervi, dichiaralo senza inventarle.',
      'Il visualizzatore Tiralinee è già aperto. Il modello 3D mostrato è quello sintetico di test SOS-TEST-001, elaborato dal Termodel Service.',
      'Non è stata aperta una sessione assistenza SOS e non è stato creato un ticket.',
      'Non dichiarare accesso ai documenti delle farmacie reali o l’esecuzione di comandi finché strumenti e autorizzazioni non sono effettivamente disponibili.',
      'Se serve operare sui dati SOS, guida l’utente ad avviare la sessione dalla Service Shell; usa soltanto gli strumenti autorizzati.',
      'Non generare immagini al posto degli artefatti tecnici già archiviati.'
    ].join('\n');
    const history=Array.isArray(opts.history)?opts.history:[];
    const transcript=history.slice(-8).map(entry=>{
      const role=entry?.role==='assistant'?'SH Engine':'Utente';
      const content=String(entry?.text||'').slice(0,700);
      return role+': '+content;
    }).filter(v=>v.trim().length>8).join('\n');
    const failed=String(opts.lastRequest||'').slice(0,500);
    return [
      base,
      'CONTESTO DEL PASSAGGIO DA SH-INTELLIGENCEENGINE.',
      'L’utente ha scelto esplicitamente di proseguire con un modello AI esperto perché il motore SH non ha interpretato la richiesta.',
      'La conversazione precedente era nella chat di Tiralinee. La chat SH locale viene chiusa; il modello 3D Tiralinee rimane aperto.',
      'Nessun ticket o intervento viene creato automaticamente da questo passaggio.',
      transcript?'Ultimi messaggi di contesto:\n'+transcript:'',
      failed?'Richiesta da affrontare adesso: '+failed:'',
      'Prosegui la conversazione sulla richiesta senza inventare dati, comandi eseguiti o collegamenti non verificati.'
    ].filter(Boolean).join('\n\n');
  }
  root.TiralineeExpertHandoff=Object.freeze({QUESTION,isUnrecognized,buildPrompt});
})(window);
