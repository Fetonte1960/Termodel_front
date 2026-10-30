/* M8 local-only evidence contract, no claim of dossier persistence.
 * The eventual backend generates artifactId, projectId, UTC timestamp, hash
 * and authoritative version once owner/tenant ACL is approved.
 */
(function(root,factory){
 const api=Object.freeze(factory());
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.TiralineeArrediAttachment=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function matching({scene,now,context,saved,local}){
   if(!scene||scene.busy||!scene.count || !now?.ready||
      scene.lastUpdated!==now.editRevision ||
      scene.planKey!==now.planKey ||
      scene.importId!==context?.importId ||
      scene.projectRevision!==context?.projectRevision ||
      !saved?.version||!saved?.layout || !local)
     return false;
   return saved.layout.importId===context.importId &&
     saved.layout.projectRevision===context.projectRevision &&
     saved.layout.floorName===context.floorName &&
     Boolean(globalThis.TiralineeArrediDistinta?.sameConfirmedItems?.(local,saved.layout));
 }
 function draft({context,layoutRevision,renderEditRevision,caption,pixelWidth,pixelHeight,byteLength,sha256}){
   if(!context||!layoutRevision||typeof caption!=='string'||caption.length>300||
     !Number.isInteger(pixelWidth)||!Number.isInteger(pixelHeight)||
     pixelWidth<1||pixelHeight<1||pixelWidth>2000||pixelHeight>2000||
     pixelWidth*pixelHeight>2000000||byteLength>2000000 ||
     !/^[a-f0-9]{64}$/.test(sha256))throw Error('Metadati PNG non validi');
   return {
     schema:'TERMODEL-PROJECT-ATTACHMENT-V1',
     kind:'RENDER_3D_ARREDI',sourceSystem:'MCP_Arredi',
     sourceImportId:context.importId,projectRevision:context.projectRevision,
     floorId:context.floorName,layoutRevision,
     renderEditRevision:String(renderEditRevision),
     title:'Vista 3D edificio + arredi (DEMO)',caption,
     mimeType:'image/png',pixelWidth,pixelHeight,byteLength,sha256,
     demo:true,state:'NON_DEPOSITATO',
     // Source projectId and artifactId are never guessed in the browser.
     sourceProjectId:null,artifactId:null,artifactVersion:null
   };
 }
 return {matching,draft};
});
