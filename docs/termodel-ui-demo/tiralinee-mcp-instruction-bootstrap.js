/* Tiralinee MCP — external assistant instruction profiles (V1).
 * Reusable bootstrap: application-specific instruction documents are read
 * through the existing MCP tool, never embedded into the URL or client code.
 * The URL parameter selects a profile, not an authentication capability.
 */
(function(root){
  'use strict';

  const profiles=Object.freeze({
    SOS:Object.freeze({
      id:'SOS',
      // The only published source for FastPharmaSOS instructions.
      initializationTool:'MessageToSOS',
      initializationArguments:Object.freeze({operation:'initialize',payload:'guide:SOS'})
    })
  });
  const normalize=value=>String(value??'').trim().toUpperCase();
  function resolve(value){
    const id=normalize(value);
    return id?profiles[id]??null:null;
  }
  function build(value,sessionId){
    const profile=resolve(value);
    if(!profile)throw Error('Profilo istruzioni non riconosciuto');
    const id=String(sessionId??'').trim();
    if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))
      throw Error('Identificativo sessione MCP non valido');
    return [
      'Sei un assistente AI collegato a una sessione applicativa mediante MCP.',
      'Profilo di istruzioni richiesto: '+profile.id+'.',
      '',
      'PRIMA OPERAZIONE OBBLIGATORIA:',
      '1. Verifica la presenza e la disponibilità del tool MCP '+profile.initializationTool+'.',
      '2. Chiamalo con gli argomenti '+JSON.stringify(profile.initializationArguments)+'.',
      '3. La risposta di initialize è una GUIDA di navigazione, non l’istruzione operativa: leggi la guida.',
      '4. Usa esattamente il comando instructions.get e il nome della root indicati nella guida per leggere integralmente l’istruzione principale del profilo richiesto.',
      '5. Applica la root acquisita. Consulta solo i documenti di dettaglio che la root indica, mediante instructions.get con i nomi esatti riportati dalla root.',
      '6. Utilizza esclusivamente le funzioni e i dati che la root e gli strumenti effettivamente disponibili autorizzano. Non presentare elenchi di documenti pubblicati.',
      '',
      'La sessione ricevitore del browser ha identificativo: '+id+'.',
      'Questo identificativo è soltanto un riferimento di instradamento, NON una credenziale o autorizzazione.',
      'Non invocare comandi sul ricevitore se non sono descritti e disponibili tramite gli strumenti MCP autorizzati.',
      '',
      'Non inventare capacità, dati, autorizzazioni, comandi o esiti.',
      'Non confondere una conferma di ricezione con un comando eseguito o con un rendering verificato.',
      'Se non puoi acquisire le istruzioni o collegarti agli strumenti, dichiara il limite e non sostituire la fonte con istruzioni di altri prodotti.',
      'Dopo aver acquisito l’istruzione applicativa, segui il relativo flusso iniziale e attendi la richiesta dell’utente.'
    ].join('\n');
  }
  root.TiralineeMcpInstructionBootstrap=Object.freeze({resolve,build});
})(window);
