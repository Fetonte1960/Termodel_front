/* M9 UI: Saved SOS DEMO layout -> source lines + preview grouped 2+1,
   with explicitly local-only JSON export while central writer is not authorized. */
(function(){
  'use strict';
  const q=new URLSearchParams(window.location.search);
  if(!q.has('istruzione')||
     window.TiralineeMcpInstructionBootstrap?.resolve(q.get('istruzione'))?.id!=='ARREDI')return;
  const host=document.querySelector('#arredi-2d-sidebar');
  const api=window.TiralineeArrediDistinta;
  if(!host||!api)return;
  const button=document.createElement('button');button.id='arredi-distinta';
  button.textContent='Distinta arredi';button.type='button';
  const panel=document.createElement('section');panel.id='arredi-distinta-panel';
  panel.hidden=true;
  panel.style.cssText='border-top:1px solid #ced6e2;padding:8px 0;';
  const text=document.createElement('p');
  text.id='arredi-distinta-status';text.setAttribute('role','status');
  text.textContent='Nessuna distinta depositata.';
  const list=document.createElement('div');
  list.id='arredi-distinta-summary';
  const exportButton=document.createElement('button');
  exportButton.type='button';exportButton.textContent='Esporta JSON locale';
  exportButton.disabled=true;
  panel.append(text,list,exportButton);
  host.querySelector('.arredi-actions')?.appendChild(button);
  host.appendChild(panel);
  let current=null;
  function download(data){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download='distinta-arredi-NON-DEPOSITATA.json';
    anchor.click();URL.revokeObjectURL(url);
  }
  exportButton.addEventListener('click',()=>{if(current)download(current);});
  async function refresh(){
    current=null;list.replaceChildren();exportButton.disabled=true;
    panel.hidden=false;
    text.textContent='Verifico il documento Arredi salvato in SOS…';
    try{
      const io=window.TiralineeArrediDocumentIo;
      const placement=window.TiralineeArrediPlacement;
      const context=io?.context?.();
      const before=placement?.getState?.();
      if(!context||!before?.ready||before.pending)
        throw Error('Apri prima la Pianta pulita e completa la posa.');
      const saved=await io.load();
      if(!saved?.layout||!saved?.version)
        throw Error('Layout non ancora salvato: premi Salva.');
      if(saved.layout.importId!==context.importId ||
         saved.layout.projectRevision!==context.projectRevision ||
         saved.layout.floorName!==context.floorName)
        throw Error('Layout salvato di un progetto differente.');
      const after=placement.getState();
      const currentLayout=placement.exportLayout(context);
      if(after.planKey!==before.planKey ||
         after.editRevision!==before.editRevision ||
         !api.sameConfirmedItems(currentLayout,saved.layout))
        throw Error('Modifiche locali non salvate: premi Salva prima della distinta.');
      const catalog=window.TiralineeArrediCatalog?.getItems?.()||[];
      const lot=api.normalize(saved.layout,catalog,{layoutRevision:saved.version});
      current=lot;
      text.textContent='ANTEPRIMA '+lot.lines.length+
        ' righe istanza · NON DEPOSITATA nel lotto Preventivi.';
      const ul=document.createElement('ul');
      for(const row of lot.summary){
        const li=document.createElement('li');
        li.textContent=row.catalogCode+' · '+row.quantity+' cad';
        ul.append(li);
      }
      list.append(ul);
      exportButton.disabled=false;
    }catch(error){
      text.textContent='Distinta non disponibile: '+String(error?.message||error);
    }
  }
  button.addEventListener('click',()=>void refresh());
  window.TiralineeArrediDistintaUi=Object.freeze({refresh,
    getCurrent:()=>current});
})();
