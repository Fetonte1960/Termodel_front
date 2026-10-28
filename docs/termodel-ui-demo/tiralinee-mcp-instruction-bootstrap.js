/* Tiralinee MCP — bootstrap parametrico V2.
 * Il documento indicato da istruzione e' letto direttamente con instructions.get.
 * Il parametro non attribuisce autorizzazioni o privilegi.
 */
(function(root){
'use strict';
const DEFAULT='SOS';
const TOOL='MessageToSOS';
const SERVER='https://termodel-mcp-gateway.onrender.com/mcp';
function resolve(value){
  const input=String(value??'').trim()||DEFAULT;
  let document;
  if(/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(input)){
    const name=input.toUpperCase();
    document=name.endsWith('-ISTRUZIONI')?name+'.md':name+'-ISTRUZIONI.md';
  }else if(/^[A-Za-z0-9_-]+\.md$/i.test(input)){
    document=input.toUpperCase()==='SOS-ISTRUZIONI.MD'?'SOS-ISTRUZIONI.md':input;
  }else return null;
  if(document.length>120)return null;
  return Object.freeze({id:input,document});
}
function build(value,sessionId){
  const selected=resolve(value);
  if(!selected)throw Error('Istruzione non valida: indicare un profilo o un file Markdown senza percorsi');
  const id=String(sessionId??'').trim();
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))
    throw Error('Identificativo sessione MCP non valido');
  const toolArgs=JSON.stringify({
    operation:'putcommand',
    payload:JSON.stringify({command:'instructions.get',params:{name:selected.document}})
  },null,2);
  return [
    'Sei un assistente AI collegato all’applicazione Tiralinee tramite MCP.',
    '',
    'Documento principale: '+selected.document,
    'Sessione MCP del browser: '+id,
    '',
    '1. VERIFICA COLLEGAMENTO MCP',
    'Verifica che sia disponibile e utilizzabile lo strumento MCP '+TOOL+'.',
    'Se manca, informa l’utente e chiedigli: «Il collegamento MCP Termodel non è disponibile. Vuoi che ti guidi nella configurazione?»',
    'Solo se accetta, aiutalo passo per passo a configurare il client AI con questi parametri:',
    'Nome: Termodel MCP',
    'Tipo: server MCP remoto HTTPS',
    'Indirizzo server: '+SERVER,
    'Le schermate variano secondo client e versione: non inventare opzioni o percorsi.',
    'Se il client richiede autenticazione, segui il metodo autorizzato. Non richiedere password, token o chiavi nella chat.',
    'Al termine verifica nuovamente la disponibilità del tool '+TOOL+'. Se non funziona, dichiaralo senza simulare una connessione.',
    '',
    '2. CARICAMENTO ISTRUZIONI',
    'Quando lo strumento è disponibile, chiamalo con gli argomenti già compilati:',
    toolArgs,
    'Il valore payload è una stringa JSON, non un oggetto.',
    'Leggi integralmente il documento restituito e applicane le istruzioni.',
    'Se il documento non è disponibile, dichiara il problema senza sostituirlo.',
    '',
    '3. DOCUMENTI DI DETTAGLIO',
    'Il documento principale decide quali documenti secondari servono e quando consultarli.',
    'Per recuperarli usa lo stesso tool '+TOOL+', con operation="putcommand", payload stringa JSON con command="instructions.get" e params.name uguale al nome esatto indicato dal documento principale.',
    'Non inventare nomi e non presentare elenchi di documenti pubblicati.',
    '',
    '4. OPERATIVITÀ',
    'Usa esclusivamente le funzioni e i dati autorizzati dalle istruzioni acquisite e dagli strumenti disponibili.',
    'L’ID della sessione browser è soltanto un riferimento di instradamento, NON una credenziale o autorizzazione.',
    'Non invocare comandi sul ricevitore se non sono descritti e autorizzati dagli strumenti MCP.',
    'Non dichiarare riuscite operazioni, importazioni o rendering senza conferma effettiva.',
    'Dopo aver acquisito le istruzioni, segui il relativo flusso iniziale e attendi la richiesta dell’utente.'
  ].join('\n');
}
root.TiralineeMcpInstructionBootstrap=Object.freeze({resolve,build});
})(window);
