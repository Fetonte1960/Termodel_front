/* MCP_Arredi M9: deterministic instance-lines and overview for quotation.
 * A browser export is NON DEPOSITATO. Codes must be re-resolved against the
 * authoritative catalog on the backend before creating an immutable Neon lot.
 * No prices and no direct API calls to Preventivi.
 */
(function (root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TiralineeArrediDistinta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function normalize(layout, catalog, metadata) {
    if (!layout || layout.format!=='TERMODEL-ARREDI-LAYOUT-V1' ||
        layout.version!==1 || layout.units!=='cm' ||
        !Array.isArray(layout.items) || layout.items.length>500 ||
        !metadata || typeof metadata.layoutRevision!=='string' ||
        !/^[a-f0-9]{32}$/i.test(metadata.layoutRevision) ||
        typeof layout.importId!=='string' ||
        typeof layout.projectRevision!=='string' ||
        !layout.floorName || !Array.isArray(catalog))
      throw Error('Layout o revisione salvata non validi');
    const items=new Map();
    for(const c of catalog)if(c && typeof c.id==='string' &&
      typeof c.code==='string' && /^[A-Z0-9][A-Z0-9_.-]{0,79}$/.test(c.code))
      items.set(c.id,c);
    const seen=new Set();
    const lines=[];
    for(const item of layout.items){
      if(!item || !/^AR-[1-9][0-9]*$/.test(item.id||'') ||
         seen.has(item.id) || typeof item.catalogId!=='string')
        throw Error('ID arredo mancante o duplicato');
      seen.add(item.id);
      const c=items.get(item.catalogId);
      if(!c)throw Error('Articolo non disponibile nel catalogo: '+item.catalogId);
      const sourceLineId=layout.floorName+':'+item.id;
      lines.push({
        sourceLineId,instanceId:item.id,catalogId:item.catalogId,
        catalogCode:c.code,workCode:'ARREDI:'+c.code,
        description:c.name,quantity:1,unit:'cad',floor:layout.floorName,
        note:'Ingombro '+item.widthCm+' × '+item.depthCm+' cm; fornitura/posa da definire',
        status:'DA_ASSOCIARE'
      });
    }
    lines.sort((a,b)=>a.sourceLineId.localeCompare(b.sourceLineId,'it'));
    const grouped=new Map();
    for(const item of lines){
      const k=item.catalogCode+'|'+item.unit+'|'+item.floor;
      if(!grouped.has(k))grouped.set(k,{catalogCode:item.catalogCode,
        workCode:item.workCode,description:item.description,
        unit:item.unit,floor:item.floor,quantity:0});
      grouped.get(k).quantity++;
    }
    return {
      schema:'TERMODEL-ARREDI-DISTINTA-V1',state:'NON_DEPOSITATO',
      sourceSystem:'MCP_Arredi',
      projectRevision:layout.projectRevision,sourceImportId:layout.importId,
      floorId:layout.floorName,layoutRevision:metadata.layoutRevision,
      sourceRevision:layout.projectRevision+':'+metadata.layoutRevision,
      sourceBatchId:layout.importId+':'+layout.floorName,
      lines,summary:[...grouped.values()].sort((a,b)=>
        a.catalogCode.localeCompare(b.catalogCode,'it'))
    };
  }
  function sameConfirmedItems(a,b) {
    if(!a || !b || a.format!==b.format ||
       a.importId!==b.importId || a.projectRevision!==b.projectRevision ||
       a.floorName!==b.floorName || !Array.isArray(a.items) ||
       !Array.isArray(b.items))return false;
    const pick=it=>({id:it.id,catalogId:it.catalogId,
      x:it.x,y:it.y,angle:it.angle,widthCm:it.widthCm,
      depthCm:it.depthCm,name:it.name,description:it.description});
    const sort=x=>x.map(pick).sort((i,j)=>i.id.localeCompare(j.id));
    return JSON.stringify(sort(a.items))===JSON.stringify(sort(b.items));
  }
  return {normalize,sameConfirmedItems};
});
