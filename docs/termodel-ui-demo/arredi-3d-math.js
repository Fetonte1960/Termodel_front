/* MCP_Arredi M7 — canonical mapping of 2D metric rectangles to Service 3D.
 * TermodelWebModel V3: meters, Z-up => Three.js meters Y-up (x,z,-y).
 * GLB assets: meters, Y-up, centered footprint, base Y=0 and front +Z.
 * No model editing or browser storage.
 */
(function(root,factory){
  const value=Object.freeze(factory());
  if(typeof module==='object'&&module.exports)module.exports=value;
  root.TiralineeArredi3DMath=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const rad=Math.PI/180;
  function sceneItem(item){
    if(!item||typeof item.id!=='string'||typeof item.catalogId!=='string'||
       !Number.isFinite(item.x)||!Number.isFinite(item.y)||
       !Number.isFinite(item.angle)||
       !Number.isFinite(item.widthCm)||item.widthCm<=0||
       !Number.isFinite(item.depthCm)||item.depthCm<=0)throw Error('Arredo 2D non valido');
    return {id:item.id,catalogId:item.catalogId,
      position:{x:item.x/100,y:0,z:-item.y/100},
      rotationY:((item.angle%360)+360)%360*rad,
      widthM:item.widthCm/100,depthM:item.depthCm/100};
  }
  function validContext(context,state){
    return Boolean(context && state?.ready &&
      context.floorName===state.floor &&
      /^[0-9a-f-]{36}$/i.test(context.importId||'') &&
      typeof context.projectRevision==='string' &&
      context.projectRevision.length>0);
  }
  function allowedAsset(url){
    try {
      const u=new URL(url);
      return u.origin==='https://www.termodel.it'&&
        u.pathname.startsWith('/termodel-ui-demo/arredi-assets/') &&
        u.pathname.endsWith('.glb') && !u.search && !u.hash &&
        !u.pathname.includes('..');
    }catch{return false;}
  }
  return {sceneItem,validContext,allowedAsset};
});
