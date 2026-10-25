/* Tiralinee Standalone Lab — local command grammar. No server, no credentials.
   SH-IntelligenceEngine remains universal and unmodified. Local viewer actions
   are NOT represented as SH interpretations. */
(function(global) {
  'use strict';
  const componentAliases = Object.freeze({
    parete:'Parete',pareti:'Parete',muro:'Parete',muri:'Parete',
    finestra:'Finestra',finestre:'Finestra',infissi:'Finestra',
    pavimento:'Pavimento',pavimenti:'Pavimento',
    soffitto:'Soffitto',soffitti:'Soffitto',solaio:'Soffitto',solai:'Soffitto',
    tetto:'Falda',tetti:'Falda',falda:'Falda',falde:'Falda',
    ponte:'Ponte',ponti:'Ponte', 'ponti termici':'Ponte',
    pannelli:'Pannelli',pannello:'Pannelli',
    mansardato:'Mansardato',mansardati:'Mansardato',
    copertura:'Falda'
  });
  function normalize(text) {
    return String(text||'').toLocaleLowerCase('it-IT').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[!?.,;:]+$/g,'').replace(/\s+/g,' ').trim();
  }
  function parse(input) {
    const msg=normalize(input);
    if(!msg||msg.length>500)return null;
    if(/^(?:aiuto|help|comandi|cosa sai fare|elenca comandi)$/.test(msg))
      return {action:'help'};
    if(/^(?:stato|stato filtri|elenca filtri|quali filtri|filtri attivi)$/.test(msg))
      return {action:'status'};
    if(/^(?:carica|ricarica|apri) (?:il )?(?:modello )?(?:demo|di prova|esempio)$/.test(msg) ||
       /^(?:carica|ricarica) modello$/.test(msg))
      return {action:'loadDemo'};
    if(/^(?:zoom tutto|zoom estensione|adatta vista|inquadra tutto|inquadra modello|vista completa|reset zoom|ripristina zoom|mostra modello intero)$/.test(msg))
      return {action:'zoomFit'};
    if(/^(?:zoom avanti|zoom in|ingrandisci|avvicina|avvicinati|aumenta zoom|ingrandisci vista|zoom \+)$/.test(msg))
      return {action:'zoom',factor:0.7};
    if(/^(?:zoom indietro|zoom out|riduci zoom|allontana|allontanati|rimpicciolisci|zoom -)$/.test(msg))
      return {action:'zoom',factor:1/0.7};
    if(/^(?:mostra tutto|mostra tutti|visualizza tutto|ripristina filtri|reset filtri|azzera filtri)$/.test(msg))
      return {action:'resetFilters'};
    const m=msg.match(/^(mostra solo|visualizza solo|isola|nascondi|mostra|visualizza|attiva|disattiva) (?:le |la |il |i |gli |lo |l'|solo )?(.+)$/);
    if(!m)return null;
    const verb=m[1],only=['mostra solo','visualizza solo','isola'].includes(verb);
    const checked= !['nascondi','disattiva'].includes(verb);
    const target=m[2].replace(/^(?:le |la |il |i |gli |lo )/,'').trim();
    const floor=target.match(/^pian[oi] (.+)$/);
    if(floor) return {action:'filter',group:'piani',name:floor[1],checked,only};
    const component=componentAliases[target];
    if(component)return {action:'filter',group:'componenti',name:component,checked,only};
    return null;
  }
  global.TiralineeLab=Object.freeze({parse,normalize});
})(window);
