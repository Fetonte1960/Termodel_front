/* Actual SH Tiralinee v1 FAQ: each text is an existing BASE phrase.
 * This catalog is ONLY a presentation of currently supported dispatcher intents;
 * the Gateway still interprets every click and validates permissions. */
(function(root){
  'use strict';
  const local=Object.freeze([
    Object.freeze({intent:'TL_SHOW_MODEL',label:'Visualizza il modello',message:'visualizza il modello',icon:'▣'}),
    Object.freeze({intent:'TL_ZOOM_FIT',label:'Inquadra tutto',message:'inquadra tutto',icon:'⛶'}),
    Object.freeze({intent:'TL_ZOOM_IN',label:'Zoom avanti',message:'zoom avanti',icon:'+'}),
    Object.freeze({intent:'TL_ONLY_WALLS',label:'Mostra solo le pareti',message:'mostra solo le pareti',icon:'▤'}),
    Object.freeze({intent:'TL_HIDE_WINDOWS',label:'Nascondi le finestre',message:'nascondi le finestre',icon:'◫'}),
    Object.freeze({intent:'TL_SHOW_WINDOWS',label:'Mostra le finestre',message:'mostra le finestre',icon:'◫'}),
    Object.freeze({intent:'TL_HIDE_FIRST_FLOOR',label:'Nascondi il piano primo',message:'nascondi il piano primo',icon:'▱'}),
    Object.freeze({intent:'TL_RESET_FILTERS',label:'Ripristina filtri',message:'ripristina filtri',icon:'↺'}),
    Object.freeze({intent:'TL_FILTER_STATUS',label:'Stato filtri',message:'stato filtri',icon:'☷'})
  ]);
  const paired=Object.freeze([
    Object.freeze({intent:'TL_SOS_LIST_CASES',label:'Elenca le commesse',message:'elenca le commesse',icon:'≡'}),
    Object.freeze({intent:'TL_SOS_COUNT_OPEN',label:'Quante pratiche aperte ci sono?',message:'quante pratiche aperte ci sono',icon:'#'})
  ]);
  root.TiralineeSosFaq=Object.freeze({
    version:'Tiralinee-1',
    local,paired,
    entries:mode=>mode==='paired'?[...local,...paired]:[...local]
  });
})(window);
