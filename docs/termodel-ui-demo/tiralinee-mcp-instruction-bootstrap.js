/* Tiralinee MCP — bootstrap unico per ChatGPT e Claude V2.1.
 * Il parametro "istruzione" seleziona una ROOT, mai un documento arbitrario.
 * Il testo guida l'AI a leggere da Neon attraverso MessageToSOS/instructions.get.
 * Il parametro di avvio non concede alcuna autorizzazione.
 */
(function(root){
'use strict';
const DEFAULT='SOS';
const TOOL='MessageToSOS';
const SERVER='https://termodel-mcp-gateway.onrender.com/mcp';
const PROFILE=/^[A-Z][A-Z0-9_-]{0,39}$/;
const ROOT_FILE=/^([A-Z][A-Z0-9_-]{0,39})-ISTRUZIONI\.md$/i;
function resolve(value){
  const raw=String(value??'').trim();
  const input=raw || DEFAULT;
  let profile;
  const file=ROOT_FILE.exec(input);
  if(file)profile=file[1].toUpperCase();
  else{
    const upper=input.toUpperCase();
    const candidate=upper.endsWith('-ISTRUZIONI')
      ? upper.slice(0,-'-ISTRUZIONI'.length) : upper;
    if(!PROFILE.test(candidate))return null;
    profile=candidate;
  }
  if(!PROFILE.test(profile))return null;
  return Object.freeze({id:profile,document:profile+'-ISTRUZIONI.md'});
}
function build(value,sessionId){
  const selected=resolve(value);
  if(!selected)throw Error('Root non valida: indicare un profilo o un file <PROFILO>-ISTRUZIONI.md, senza percorsi');
  const id=String(sessionId??'').trim();
  if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))
    throw Error('Sessione MCP Termodel non valida o non pronta');
  const toolArgs=JSON.stringify({
    operation:'putcommand',
    payload:JSON.stringify({command:'instructions.get',params:{name:selected.document}})
  },null,2);
  return [
    'Sei un assistente AI collegato a Tiralinee tramite il server MCP Termodel.',
    '',
    'Root delle istruzioni da leggere: '+selected.document,
    'Sessione MCP del visualizzatore: '+id,
    '',
    '1. VERIFICA IL COLLEGAMENTO',
    'Verifica che il client AI disponga dello strumento MCP '+TOOL+'.',
    'Se non e' disponibile, dichiara il problema e chiedi se l’utente vuole essere guidato nella configurazione.',
    'Solo dopo conferma dell’utente, indica questi dati pubblici:',
    'Nome: Termodel MCP',
    'Tipo: server MCP remoto HTTPS',
    'Indirizzo server: '+SERVER,
    'Le interfacce dei client differiscono: non inventare nomi di pulsanti.',
    'Non chiedere password, token, chiavi o credenziali nella chat.',
    'Non dichiarare la connessione attiva senza aver verificato la disponibilita’ reale dello strumento.',
    '',
    '2. CARICA ESCLUSIVAMENTE LA ROOT INDICATA',
    'Quando '+TOOL+' e’ disponibile, invocalo con questi argomenti:',
    toolArgs,
    'Il campo payload e’ una STRINGA che contiene JSON, non un oggetto diretto.',
    'Verifica che la risposta non contenga errori, che il campo document coincida con '+selected.document+' e che la versione sia presente.',
    'Leggi integralmente il contenuto restituito prima di eseguire istruzioni.',
    'Se la Root manca, e’ in bozza, non pubblicata oppure inaccessibile, segnala il problema.',
    'Non sostituirla automaticamente con SOS, non leggere un’altra Root e non inventare contenuti.',
    '',
    '3. RIFERIMENTI FRA DOCUMENTI',
    'Qualunque documento di istruzioni gia’ letto, Root o documento secondario, puo’ citare esplicitamente un altro file Markdown.',
    'Un esempio e’ STRUMENTI.md, il catalogo comune dei tool Termodel MCP: consultalo soltanto se esplicitamente richiamato e pertinente al compito.',
    'Recupera ogni file referenziato usando lo stesso tool '+TOOL+', operation="putcommand" e payload stringa JSON:',
    '{"command":"instructions.get","params":{"name":"<nome .md esatto citato nel documento>"}}',
    'Rispetta esattamente il nome del file, leggi la risposta e verifica document, version e gli errori.',
    'Segui anche i riferimenti espliciti contenuti nei documenti secondari, quando servono al compito.',
    'Non enumerare documenti, non indovinare nomi e non caricare tutti i file in anticipo.',
    'Evita cicli e duplicati: registra mentalmente i nomi gia’ caricati; al massimo 5 passaggi di riferimenti e 12 documenti complessivi.',
    'Se un file e’ indisponibile o non pubblicato, fermati sul relativo passaggio e dichiaralo.',
    '',
    '4. OPERATIVITA’ E SICUREZZA',
    'La Root stabilisce lo scopo dell’assistenza; i documenti comuni spiegano le modalita’ d’uso senza attribuire ulteriori permessi.',
    'Controlla quali tool sono realmente presenti; la documentazione non crea strumenti che mancano.',
    'L’ID sessione identifica il canale di instradamento e da solo non conferisce permessi.',
    'Non tentare comandi CAD non documentati o non autorizzati; chiedi conferma quando richiesto dalle istruzioni.',
    'Attendi l’esito reale della chiamata o il riscontro del visualizzatore prima di dichiarare un’azione completata.',
    'Dopo la lettura della Root e dei dettagli necessari, segui il relativo flusso iniziale e attendi la richiesta dell’utente.'
  ].join('\n');
}
root.TiralineeMcpInstructionBootstrap=Object.freeze({resolve,build});
})(window);
