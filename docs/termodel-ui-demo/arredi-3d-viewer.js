/* MCP_Arredi M7 — read-only composite building + GLB furniture 3D.
 * Loaded ONLY for explicit istruzione=ARREDI; clicking Aggiorna reads the
 * CURRENT, potentially unsaved 2D rectangle positions.
 * The Termodel Service meshes are never rebuilt or modified here.
 */
import './arredi-3d-math.js';
import './arredi-attachment.js';
const math=globalThis.TiralineeArredi3DMath;
const ROOT='https://termodel-mcp-gateway.onrender.com/api/arredi/v1/models';
const DEMO='./arredi-assets/demo-models.json';
const MAX_BYTES=12*1024*1024;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');

export function installArredi3D({THREE,buildingRoot,renderNow,captureFrame,isBuildingReady}){
  const params=new URLSearchParams(window.location.search);
  const profile=window.TiralineeMcpInstructionBootstrap?.resolve(params.get('istruzione'));
  if(!params.has('istruzione')||profile?.id!=='ARREDI')return null;
  const tab=document.getElementById('tab-3d');
  if(!tab)return null;
  const toolbar=document.createElement('div');
  toolbar.id='arredi-3d-toolbar';
  toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:4px 0;';
  const update=document.createElement('button');
  update.type='button';update.id='arredi-3d-update';
  update.textContent='Aggiorna';update.title='Aggiorna la scena edificio + arredi dalla pianta 2D';
  update.style.cssText='margin:0;padding:6px 16px;border:1px solid #5a93b9;'+
    'border-radius:5px;background:#dceefa;color:#124565;font-weight:650';
  const status=document.createElement('span');
  status.id='arredi-3d-status';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  status.style.cssText='font-size:12px;color:#344960;';
  status.textContent='Arredi 3D: premi Aggiorna dopo il posizionamento 2D';
  const attach=document.createElement('button');
  attach.id='arredi-3d-attach';attach.type='button';
  attach.textContent='Allega 3D al preventivo';
  attach.title='Cattura la vista 3D dal layout salvato, prepara PNG e manifest';
  attach.disabled=true;
  attach.style.cssText=update.style.cssText;
  const evidenceState=document.createElement('span');
  evidenceState.id='arredi-3d-attach-status';
  evidenceState.setAttribute('role','status');
  evidenceState.textContent='Non depositato nel dossier.';
  toolbar.append(update,attach,status,evidenceState);
  tab.insertBefore(toolbar,tab.firstChild);
  let currentLayer=null,busy=false,lastUpdated=-1,lastPlanKey=null,lastImport=null,lastRevision=null,attachBusy=false;
  const glbCache=new Map();
  function proxy(item,entry){
    const obj=new THREE.Group();
    const width=item.widthM,depth=item.depthM;
    const height=(Number(entry?.heightCm)>0?Number(entry.heightCm):80)/100;
    const material=new THREE.MeshStandardMaterial({
      color:0x5d91ad,roughness:.8,metalness:0,transparent:true,opacity:.72});
    const cube=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    cube.position.y=height/2;
    obj.add(cube);
    return obj;
  }
  async function metadata(){
    const response=await fetch(ROOT,{cache:'no-store',credentials:'omit',
      headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('Catalogo modelli 3D HTTP '+response.status);
    const payload=await response.json();
    if(payload?.schema!=='TERMODEL-ARREDI-MODELS-V1'||
       !Array.isArray(payload.models)||payload.models.length>200)
      throw Error('Formato catalogo 3D non valido');
    return payload;
  }
  async function demoMetadata(){
    const response=await fetch(DEMO,{cache:'no-store',credentials:'omit'});
    if(!response.ok)return [];
    const payload=await response.json();
    if(payload?.schema!=='TERMODEL-ARREDI-MODELS-V1'||
      !Array.isArray(payload.models))return [];
    return payload.models;
  }
  async function allModels(){
    // Database is authoritative; static assets provide a clearly marked
    // synthetic DEMO fallback until their metadata is registered in Neon.
    let source='database',data;
    try {data=await metadata();}
    catch(error){
      data={models:[],ready:false};
      source='backend non disponibile: '+String(error?.message||error);
    }
    const map=new Map();
    for(const m of data.models)if(typeof m.catalogId==='string')map.set(m.catalogId,{...m,source:'Neon'});
    const demos=await demoMetadata().catch(()=>[]);
    for(const m of demos)if(!map.has(m.catalogId))map.set(m.catalogId,{...m,source:'DEMO statico'});
    return {map,source:data.ready?source:'GLB demo statici (Neon non ancora associato)'};
  }
  async function loadGlb(info,loader){
    if(!math.allowedAsset(info.url)||!(/^[a-f0-9]{64}$/.test(info.sha256)))
      throw Error('Riferimento modello GLB non autorizzato');
    const key=info.url+'#'+info.sha256;
    if(glbCache.has(key))return glbCache.get(key).clone(true);
    const response=await fetch(info.url,{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Modello GLB HTTP '+response.status);
    const length=Number(response.headers.get('content-length')||0);
    if(length>MAX_BYTES)throw Error('GLB eccessivo');
    const buffer=await response.arrayBuffer();
    if(buffer.byteLength<20||buffer.byteLength>MAX_BYTES)
      throw Error('Dimensione GLB non valida');
    const magic=new DataView(buffer).getUint32(0,true);
    if(magic!==0x46546c67)throw Error('Il file non è GLB');
    const digest=await crypto.subtle.digest('SHA-256',buffer);
    const actual=hex(new Uint8Array(digest));
    if(actual!==info.sha256)throw Error('Checksum GLB diverso dal catalogo');
    const parsed=await new Promise((resolve,reject)=>loader.parse(buffer,'',resolve,reject));
    if(!parsed?.scene)throw Error('Scena GLB vuota');
    glbCache.set(key,parsed.scene);
    return parsed.scene.clone(true);
  }
  function normalized(asset,item){
    const bounds=new THREE.Box3().setFromObject(asset);
    if(bounds.isEmpty())throw Error('Geometria GLB vuota');
    const dims=bounds.getSize(new THREE.Vector3());
    const ok=(actual,target)=>actual>0 && Math.abs(actual-target)<=Math.max(.015,target*.08);
    if(!ok(dims.x,item.widthM)||!ok(dims.z,item.depthM))
      throw Error('Ingombro GLB diverso dal rettangolo 2D');
    const base=new THREE.Group();
    asset.position.sub(new THREE.Vector3(
      (bounds.min.x+bounds.max.x)/2,bounds.min.y,
      (bounds.min.z+bounds.max.z)/2));
    base.add(asset);
    return base;
  }
  function clearPrevious(){
    if(currentLayer?.parent)currentLayer.parent.remove(currentLayer);
    // GLB geometry/material are cached and shared; do not dispose them here.
    currentLayer=null;
    lastUpdated=-1;lastPlanKey=null;lastImport=null;lastRevision=null;
    attach.disabled=true;
  }
  async function refresh(){
    if(busy)return;
    const placement=window.TiralineeArrediPlacement;
    const context=window.TiralineeArrediDocumentIo?.context?.();
    const state=placement?.getState?.();
    if(!isBuildingReady()||!math.validContext(context,state)){
      status.textContent='Carica il modello Service e la Pianta pulita 2D prima di Aggiorna.';
      return;
    }
    if(state.items.length>500){
      status.textContent='Troppi arredi per la scena 3D';return;
    }
    const beforeRevision=state.editRevision;
    busy=true;update.disabled=true;status.textContent='Aggiornamento scena 3D…';
    try{
      const result=await allModels();
      const catalogue=new Map((window.TiralineeArrediCatalog?.getItems?.()||[]).map(x=>[x.id,x]));
      // Only parse GLB after the user explicitly clicks Aggiorna.
      let loader=null,glb=0,proxies=0,failures=0;
      const layer=new THREE.Group();
      layer.name='Arredi M7 — sovrapposizione 3D';
      for(const item2d of state.items){
        const placement=math.sceneItem(item2d);
        const entry=result.map.get(placement.catalogId);
        let obj=null;
        if(entry && math.allowedAsset(entry.url)){
          try{
            if(!loader){const mod=await import('three/addons/loaders/GLTFLoader.js');
              loader=new mod.GLTFLoader();}
            const asset=await loadGlb(entry,loader);
            obj=normalized(asset,placement);
            glb++;
          }catch(error){failures++;console.warn('GLB arredo non utilizzabile:',placement.id,String(error));}
        }
        if(!obj){obj=proxy(placement,catalogue.get(placement.catalogId)||entry);proxies++;}
        obj.position.set(placement.position.x,placement.position.y,
          placement.position.z);
        obj.rotation.y=placement.rotationY;
        obj.userData.arredoId=placement.id;
        obj.userData.catalogId=placement.catalogId;
        obj.userData.renderKind=obj===null?'unknown':(entry?'GLB o proxy':'proxy');
        layer.add(obj);
      }
      const current=placement.getState();
      const currentContext=window.TiralineeArrediDocumentIo?.context?.();
      if(!math.validContext(currentContext,current) ||
         current.planKey!==state.planKey ||
         current.editRevision!==beforeRevision ||
         currentContext.importId!==context.importId ||
         currentContext.projectRevision!==context.projectRevision ||
         !isBuildingReady())throw Error('Pianta modificata durante il caricamento: premi Aggiorna di nuovo');
      clearPrevious();
      currentLayer=layer;
      buildingRoot.add(layer);
      renderNow();
      lastUpdated=beforeRevision;
      lastPlanKey=state.planKey;
      lastImport=context.importId;
      lastRevision=context.projectRevision;
      updateAttachAvailability();
      status.textContent='Edificio + '+state.items.length+' arredi · '+
        glb+' GLB, '+proxies+' proxy'+(failures?' ('+failures+' GLB non utilizzabili)':'')+
        ' · '+result.source;
      const preview=document.getElementById('preview-info');
      if(preview)preview.textContent='Termodel Service 3D + '+state.items.length+
        ' arredi nelle posizioni della Pianta 2D ('+glb+' GLB; '+proxies+' proxy)';
    }catch(error){
      status.textContent='Aggiorna non completato: '+String(error?.message||error);
    }finally {busy=false;update.disabled=false;updateAttachAvailability();}
  }
  function updateAttachAvailability(){
    const state=window.TiralineeArrediPlacement?.getState?.();
    const context=window.TiralineeArrediDocumentIo?.context?.();
    attach.disabled=Boolean(attachBusy||busy||!currentLayer ||
      currentLayer.parent!==buildingRoot||!isBuildingReady() ||
      !math.validContext(context,state) ||
      !state || state.pending || state.editRevision!==lastUpdated ||
      state.planKey!==lastPlanKey ||
      context.importId!==lastImport ||
      context.projectRevision!==lastRevision);
  }
  function download(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=filename;
    document.body.appendChild(a);
    try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }
  async function attachView(){
    updateAttachAvailability();
    if(attach.disabled)return;
    attachBusy=true;attach.disabled=true;
    evidenceState.textContent='Verifico layout salvato…';
    try{
      const context=window.TiralineeArrediDocumentIo.context();
      const placement=window.TiralineeArrediPlacement;
      const state=placement.getState();
      const saved=await window.TiralineeArrediDocumentIo.load();
      const now=placement.getState();
      const check=globalThis.TiralineeArrediAttachment;
      if(!check?.matching({scene:{busy,count:currentLayer?.children.length,
          lastUpdated,planKey:lastPlanKey,importId:lastImport,
          projectRevision:lastRevision},
          now,context,saved,local:placement.exportLayout(context)}) ||
          now.editRevision!==state.editRevision ||
          currentLayer?.parent!==buildingRoot || !isBuildingReady())
        throw Error('Modello/layout non allineati: Salva, quindi Aggiorna in 3D.');
      const caption=window.prompt('Didascalia della vista 3D (massimo 300 caratteri):',
        'Farmacia DEMO — vista edificio e arredi');
      if(caption===null){evidenceState.textContent='Operazione annullata.';return;}
      if(caption.length>300)throw Error('Didascalia troppo lunga');
      if(!window.confirm('Creare PNG e manifest LOCALI? Il dossier Neon non è ancora autorizzato: NON saranno depositati.'))
        {evidenceState.textContent='Operazione annullata.';return;}
      evidenceState.textContent='Cattura 3D in corso…';
      const {blob,width,height}=await captureFrame();
      const current=placement.getState();
      if(current.editRevision!==state.editRevision||
         current.planKey!==state.planKey||
         currentLayer?.parent!==buildingRoot||
         window.TiralineeArrediDocumentIo?.context?.()?.importId!==context.importId)
        throw Error('La pianta è cambiata durante la cattura: riprova.');
      const bytes=await blob.arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const sha256=hex(new Uint8Array(digest));
      const manifest=check.draft({context,layoutRevision:saved.version,
        renderEditRevision:lastUpdated,caption,pixelWidth:width,
        pixelHeight:height,byteLength:blob.size,sha256});
      evidenceState.textContent='PNG pronto; esportazione LOCALE — NON DEPOSITATO.';
      download(blob,'vista-3d-arredi-NON-DEPOSITATA.png');
      download(new Blob([JSON.stringify(manifest,null,2)],
        {type:'application/json'}),'vista-3d-arredi-manifest-NON-DEPOSITATO.json');
    }catch(error){
      evidenceState.textContent='Allegato non creato: '+String(error?.message||error);
    }finally{attachBusy=false;updateAttachAvailability();}
  }
  attach.addEventListener('click',()=>void attachView());
  update.addEventListener('click',()=>void refresh());
  return Object.freeze({refresh,
    onPlacementChanged:updateAttachAvailability,
    getState:()=>({count:currentLayer?.children.length||0,lastUpdated,busy,
      planKey:lastPlanKey,importId:lastImport,projectRevision:lastRevision})});
}
