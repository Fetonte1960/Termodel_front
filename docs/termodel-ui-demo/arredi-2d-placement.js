/* MCP_Arredi Fase 2 — 2D metric footprint placement.
 * Only for explicit istruzione=ARREDI, separate from the immutable Termodel SVG.
 * Canonical clean floor: TERMODEL-CLEAN-FLOOR-SVG-V1; units: centimeters.
 * The mouse wheel is reserved exclusively for zooming; rotation uses sidebar slider.
 * Positioned items are session-local (no server save or invented project persistence).
 */
(function(root){
  'use strict';
  const param = new URLSearchParams(root.location.search);
  const profile = root.TiralineeMcpInstructionBootstrap?.resolve(
    param.has('istruzione') ? param.get('istruzione') : null);
  if (!param.has('istruzione') || profile?.id !== 'ARREDI') return;
  const view = document.getElementById('view2d');
  if (!view) return;
  const NS='http://www.w3.org/2000/svg';
  const state = {
    view, stage:null, overlay:null, sourceImg:null, planKey:null, meta:null,
    items:[], pending:null, selectedId:null, dragging:null, angle:0,
    zoom:1, panX:0, panY:0, sequence:0,
    onChange:null, loadingSource:null, lastError:'',
    walls:[], snapMode:'', hoveredWall:null, snapSideIndex:null, contextMenu:null,
    snapFirstWall:null, snapOriginal:null, snapSecondWall:null, snapInfo:null
  };
  function emit(message='') {
    state.onChange?.({
      pending: state.pending,
      selected: state.items.find(x=>x.id===state.selectedId) || null,
      count:state.items.length,
      zoom:Math.round(state.zoom*100),
      ready:!!state.overlay,
      snapMode:state.snapMode, wallCount:state.walls.length,
      snapInfo:state.snapInfo,
      message:message || state.lastError
    });
  }
  function positive(n){return typeof n==='number' && Number.isFinite(n) && n>0;}
  function canonical(item){
    return item && typeof item.id==='string' && item.id.length>0 &&
      typeof item.name==='string' && item.name.length>0 &&
      positive(item.widthCm) && positive(item.depthCm);
  }
  function angleNumber(n){
    const value=Number(n);
    return Number.isFinite(value)?((Math.round(value*100)/100%360)+360)%360:0;
  }
  function parsePlan(source){
    const xml=new DOMParser().parseFromString(source,'image/svg+xml');
    if(xml.querySelector('parsererror'))throw Error('SVG non valido');
    const svg=xml.documentElement;
    if(svg.localName!=='svg' || svg.getAttribute('data-termodel-format')!=='TERMODEL-CLEAN-FLOOR-SVG-V1')
      throw Error('Pianta Termodel non riconosciuta');
    if(svg.getAttribute('data-termodel-units')!=='cm')
      throw Error('Unità della pianta non metriche (cm)');
    const raw=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
    if(raw.length!==4 || !raw.every(Number.isFinite) || raw[2]<=0 || raw[3]<=0)
      throw Error('viewBox metrico della pianta non valido');
    return {x:raw[0],y:raw[1],width:raw[2],height:raw[3],
      floor:svg.getAttribute('data-termodel-floor-name')||'',
      walls:root.TiralineeArrediOsnap?.extractWalls(xml)||[]};
  }
  function svgNode(tag,attrs={}){
    const node=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
    return node;
  }
  function makeFootprint(item,preview){
    const g=svgNode('g',{'data-arredi-item':item.id});
    const rect=svgNode('rect',{x:-item.widthCm/2,y:-item.depthCm/2,
      width:item.widthCm,height:item.depthCm,rx:4,ry:4,
      fill:preview?'#42b5de':'#6ca7d7',
      'fill-opacity':preview?'.38':'.55',
      stroke:preview?'#00759b':'#125a88','stroke-width':3});
    if(preview)rect.setAttribute('stroke-dasharray','12 7');
    const text=svgNode('text',{x:0,y:0,'text-anchor':'middle',
      'dominant-baseline':'central','font-size':Math.min(24,Math.max(10,item.widthCm/8)),
      fill:'#123d60','pointer-events':'none'});
    text.textContent=item.name.length>22?item.name.slice(0,20)+'…':item.name;
    g.append(rect,text);
    g.style.cursor=preview?'crosshair':'move';
    return g;
  }
  function transform(node,placement){
    node.setAttribute('transform','translate('+placement.x+' '+placement.y+') rotate('+placement.angle+')');
  }
  function redraw(){
    if(!state.overlay)return;
    state.overlay.replaceChildren();
    for(const placement of state.items){
      const node=makeFootprint(placement,false);
      transform(node,placement);
      if(placement.id===state.selectedId) {
        const rect=node.querySelector('rect');
        rect?.setAttribute('stroke','#db7b15');
        rect?.setAttribute('stroke-width','5');
      }
      node.setAttribute('data-placement-id',placement.id);
      state.overlay.appendChild(node);
    }
    if(state.snapFirstWall){
      const {a,b}=state.snapFirstWall;
      state.overlay.appendChild(svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,
        stroke:'#26a269','stroke-width':8,'stroke-linecap':'round',
        'pointer-events':'none','data-arredi-osnap-target':'first-wall'}));
    }
    if(state.hoveredWall){
      const {a,b}=state.hoveredWall;
      const hit=svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,
        stroke:'#f18821','stroke-width':8,'stroke-linecap':'round',
        'pointer-events':'none','data-arredi-osnap-target':'wall'});
      state.overlay.appendChild(hit);
    }
    if(state.pending){
      const node=makeFootprint(state.pending,true);
      transform(node,state.pending);
      node.setAttribute('data-arredi-preview','true');
      node.style.pointerEvents='none';
      state.overlay.appendChild(node);
    }
  }
  function updateZoom(){
    if(!state.stage)return;
    state.stage.style.transform='translate('+state.panX+'px,'+state.panY+'px) scale('+state.zoom+')';
    emit();
  }
  function pointFromEvent(e){
    const svg=state.overlay;
    if(!svg || typeof svg.createSVGPoint!=='function' || !svg.getScreenCTM())return null;
    const p=svg.createSVGPoint();
    p.x=e.clientX;p.y=e.clientY;
    const pt=p.matrixTransform(svg.getScreenCTM().inverse());
    if(!Number.isFinite(pt.x)||!Number.isFinite(pt.y))return null;
    if(pt.x<state.meta.x||pt.x>state.meta.x+state.meta.width||
       pt.y<state.meta.y||pt.y>state.meta.y+state.meta.height)return null;
    return {x:Math.round(pt.x*100)/100,y:Math.round(pt.y*100)/100};
  }
  // The pick radius is measured in screen pixels and converted through
  // the actual SVG screen transform, so zoom never changes hit accuracy.
  function hitTarget(point){
    if(!root.TiralineeArrediOsnap)return null;
    // Include the four transformed, metric edges of every CONFIRMED item.
    // Never include the moving preview being placed.
    const targets=[...state.walls,...root.TiralineeArrediOsnap.furnitureSegments(state.items)];
    if(!targets.length)return null;
    const matrix=state.overlay?.getScreenCTM?.();
    let pixelsPerCm=Math.hypot(matrix?.a??NaN,matrix?.b??NaN);
    if(!Number.isFinite(pixelsPerCm)||pixelsPerCm<=0){
      const box=view.getBoundingClientRect();
      pixelsPerCm=Math.min(box.width/state.meta.width,
        box.height/state.meta.height)*state.zoom;
    }
    return root.TiralineeArrediOsnap.selectWall(
      targets,point,12/Math.max(pixelsPerCm,.001));
  }
  function closeContextMenu(){
    state.contextMenu?.remove?.();
    state.contextMenu=null;
  }
  function beginWallSnap(count=1){
    if(!state.pending || !state.overlay ||
      (!state.walls.length && !state.items.length)){
      emit('OSNAP non disponibile: nessun arredo in inserimento o lato selezionabile');
      return false;
    }
    closeContextMenu();
    state.snapMode=count===2?'pick-first-wall':'pick-wall';
    state.snapOriginal={...state.pending};
    state.snapFirstWall=null;state.snapSecondWall=null;
    state.snapInfo=null;state.snapSideIndex=null;state.hoveredWall=null;
    redraw();
    emit(count===2?'OSNAP: scegli la PRIMA parete o il PRIMO lato di arredo':
      'OSNAP: scegli una parete o un lato di arredo');
    return true;
  }
  function onContextMenu(e){
    if(!state.pending||!state.overlay)return;
    e.preventDefault();
    closeContextMenu();
    const box=view.getBoundingClientRect();
    const menu=document.createElement('div');
    menu.id='arredi-osnap-menu';
    menu.setAttribute('role','menu');
    menu.setAttribute('aria-label','OSNAP arredi');
    menu.style.cssText='position:absolute;z-index:50;min-width:190px;'+
      'padding:7px;background:#fff;border:1px solid #7c91aa;'+
      'border-radius:6px;box-shadow:0 5px 20px #0003;color:#1a3349';
    menu.style.left=Math.max(0,Math.min(e.clientX-box.left,box.width-215))+'px';
    menu.style.top=Math.max(0,Math.min(e.clientY-box.top,box.height-80))+'px';
    const title=document.createElement('strong');
    title.textContent='OSNAP';
    title.style.cssText='display:block;margin:2px 5px 6px;font-size:12px';
    const align=document.createElement('button');
    align.type='button';align.setAttribute('role','menuitem');
    align.textContent='Allinea con parete/arredo';
    align.style.cssText='display:block;margin:0;width:100%;padding:9px;'+
      'text-align:left;cursor:pointer;background:#e8f3fb;'+
      'border:1px solid #9cbbd2;border-radius:4px';
    align.addEventListener('click',()=>beginWallSnap(1));
    const alignTwo=document.createElement('button');
    alignTwo.type='button';alignTwo.setAttribute('role','menuitem');
    alignTwo.textContent='Allinea con 2 pareti/arredi';
    alignTwo.style.cssText=align.style.cssText+'margin-top:5px';
    alignTwo.addEventListener('click',()=>beginWallSnap(2));
    menu.append(title,align,alignTwo);
    view.appendChild(menu);state.contextMenu=menu;
  }
  function onMove(e){
    const point=pointFromEvent(e);
    if(!point)return;
    if(state.dragging){
      const item=state.items.find(x=>x.id===state.dragging.id);
      if(item){
        item.x=point.x-state.dragging.dx;
        item.y=point.y-state.dragging.dy;
        redraw();emit('Spostamento: rilascia il mouse per confermare');
      }
    }else if(state.pending){
      if(['pick-wall','pick-first-wall','pick-second-wall'].includes(state.snapMode)){
        const candidate=hitTarget(point);
        state.hoveredWall=candidate?.segment||null;
        if(state.snapMode==='pick-second-wall' &&
          root.TiralineeArrediOsnap?.wallSame(state.snapFirstWall,state.hoveredWall))
          state.hoveredWall=null;
        redraw();
        const found=!!state.hoveredWall;
        const hint=state.snapMode==='pick-first-wall'?'PRIMA':
          state.snapMode==='pick-second-wall'?'SECONDA':'unica';
        const kind=state.hoveredWall?.source==='arredo'?'Lato di arredo':'Parete';
        emit(found?kind+' '+hint+' individuato: clicca per selezionarlo':
          'Seleziona la '+hint+' parete o un lato di arredo');
        return;
      }
      if(state.snapMode==='aligned')return;
      state.pending.x=point.x;
      state.pending.y=point.y;
      redraw();
      emit('Anteprima: clic sulla pianta per collocare');
    }
  }
  function onPointerDown(e){
    if(e.button!==0 || !state.overlay ||
      ['pick-wall','pick-first-wall','pick-second-wall'].includes(state.snapMode))return;
    const placed=e.target?.closest?.('[data-placement-id]');
    if(!placed)return;
    const item=state.items.find(x=>x.id===placed.getAttribute('data-placement-id'));
    const point=pointFromEvent(e);
    if(!item||!point)return;
    e.stopPropagation();e.preventDefault();
    state.pending=null;
    state.selectedId=item.id;
    state.angle=item.angle;
    state.dragging={id:item.id,dx:point.x-item.x,dy:point.y-item.y};
    state.overlay.setPointerCapture?.(e.pointerId);
    redraw();
    emit('Arredo selezionato: trascina per spostarlo o regola la rotazione');
  }
  function onPointerUp(e){
    if(!state.dragging)return;
    state.dragging=null;
    state.overlay.releasePointerCapture?.(e.pointerId);
    redraw();
    emit('Posizione consolidata nel layout corrente');
  }
  function commitPending(message,point){
    if(!state.pending)return;
    // For OSNAP, the calculated center is already stored in the pending
    // item. Never replace it with the coordinates of the target click.
    const center=point||state.pending;
    const item=Object.assign({},state.pending,{
      id:'AR-'+(++state.sequence),x:center.x,y:center.y,angle:state.angle
    });
    state.items.push(item);
    state.selectedId=item.id;
    state.pending=null;
    state.snapMode='';state.hoveredWall=null;state.snapSideIndex=null;
    state.snapFirstWall=null;state.snapSecondWall=null;
    state.snapOriginal=null;state.snapInfo=null;
    redraw();
    emit(message+' · '+item.name+' · '+item.widthCm+' × '+
      item.depthCm+' cm · '+item.angle+'°');
  }
  function onClick(e){
    if(e.button!==0 || !state.pending || state.dragging)return;
    const point=pointFromEvent(e);
    if(!point)return;
    if(['pick-wall','pick-first-wall','pick-second-wall'].includes(state.snapMode)){
      const candidate=hitWall(point);
      if(!candidate){emit('Clicca vicino a una parete o a un lato di arredo');return;}
      if(state.snapMode==='pick-first-wall'){
        const alignedFirst=root.TiralineeArrediOsnap?.alignFurniture(
          state.snapOriginal,candidate.segment);
        if(!alignedFirst){emit('Impossibile allineare al primo lato');return;}
        state.snapFirstWall=candidate.segment;
        state.pending.x=alignedFirst.x;state.pending.y=alignedFirst.y;
        state.pending.angle=angleNumber(alignedFirst.angle);
        state.angle=state.pending.angle;
        state.snapSideIndex=alignedFirst.sideIndex;
        state.snapMode='pick-second-wall';state.hoveredWall=null;
        redraw();emit('Primo riferimento acquisito, angolo '+state.angle+
          '°. Ora clicca il SECONDO riferimento parete/arredo');
        return;
      }
      if(state.snapMode==='pick-second-wall'){
        if(root.TiralineeArrediOsnap?.wallSame(state.snapFirstWall,candidate.segment)){
          emit('Seleziona un secondo lato differente dal primo');return;
        }
        const result=root.TiralineeArrediOsnap?.alignTwoWalls(
          state.snapOriginal,state.snapFirstWall,candidate.segment);
        if(!result){emit('Impossibile allineare ai due lati');return;}
        state.pending.x=result.x;state.pending.y=result.y;
        state.pending.angle=angleNumber(result.angle);
        state.angle=state.pending.angle;
        state.snapInfo=result;
        state.snapSideIndex=result.firstSideIndex;
        state.snapSecondWall=candidate.segment;
        state.hoveredWall=candidate.segment;
        const conflict=result.secondAngleErrorDeg>1;
        const gap=result.secondGapCm>1;
        commitPending('OSNAP 2 pareti/arredi: angolo '+state.angle+'° · '+
          (conflict?'direzioni contrastanti, priorità PRIMO riferimento; ':
            'due lati orientati; ')+
          'scostamento secondo riferimento '+result.secondGapCm+' cm'+
          (gap?' (accostamento parziale)':''));
        return;
      }
      const aligned=root.TiralineeArrediOsnap?.alignFurniture(state.pending,candidate.segment);
      if(!aligned){emit('Impossibile allineare al lato selezionato');return;}
      state.pending.x=aligned.x;
      state.pending.y=aligned.y;
      state.pending.angle=angleNumber(aligned.angle);
      state.angle=state.pending.angle;
      state.snapSideIndex=aligned.sideIndex;
      state.hoveredWall=candidate.segment;
      commitPending('OSNAP: lato '+(aligned.sideIndex+1)+
        ' allineato a '+(candidate.segment.source==='arredo'?'arredo':'parete')+
        ' · '+state.angle+'°');
      return; // First target click has already confirmed the furniture.
    }
    commitPending('Collocato arredo (layout di sessione)',point);
  }
  function onWheel(e){
    if(!state.stage)return;
    // Always wheel = zoom, including during pending placement. Never rotation.
    e.preventDefault();
    const ratio=e.deltaY<0?1.12:1/1.12;
    const target=Math.max(.4,Math.min(8,state.zoom*ratio));
    const effective=target/state.zoom;
    const bounds=view.getBoundingClientRect();
    const px=e.clientX-bounds.left,py=e.clientY-bounds.top;
    state.panX=px-(px-state.panX)*effective;
    state.panY=py-(py-state.panY)*effective;
    state.zoom=target;
    updateZoom();
  }
  function onKey(e){
    if(e.key!=='Escape'||!state.pending)return;
    if(e.target?.matches?.('input,textarea,[contenteditable]'))return;
    e.preventDefault();
    cancel();
  }
  function clearStage(){
    state.stage=null;state.overlay=null;state.sourceImg=null;
    state.meta=null;state.planKey=null;state.pending=null;state.selectedId=null;
    state.items=[];state.sequence=0;state.zoom=1;state.panX=0;state.panY=0;
    state.walls=[];state.snapMode='';state.hoveredWall=null;state.snapSideIndex=null;
    state.snapFirstWall=null;state.snapSecondWall=null;
    state.snapOriginal=null;state.snapInfo=null;
    closeContextMenu();
  }
  async function prepare(img){
    if(!img || img===state.sourceImg || img===state.loadingSource)return;
    state.loadingSource=img;
    try{
      // The Termodel harness makes a blob: URL from the validated clean-floor SVG.
      // Do not fetch arbitrary remote images and guess their metric scale.
      if(!img.src.startsWith('blob:'))throw Error('La pianta non è un SVG Termodel locale');
      const response=await fetch(img.src,{credentials:'omit'});
      if(!response.ok)throw Error('SVG Termodel non leggibile');
      const source=await response.text();
      const meta=parsePlan(source);
      if(!img.isConnected || !view.contains(img))return;
      const identity=source.length+':'+source.slice(0,110)+':'+source.slice(-110);
      if(state.planKey!==null && state.planKey!==identity){
        state.items=[];state.sequence=0;state.pending=null;state.selectedId=null;
        state.lastError='Pianta cambiata: layout precedente azzerato (solo sessione)';
      }
      state.planKey=identity;
      state.meta=meta;
      state.walls=meta.walls;
      state.snapMode='';state.hoveredWall=null;state.snapSideIndex=null;
      state.snapFirstWall=null;state.snapSecondWall=null;
      state.snapOriginal=null;state.snapInfo=null;
      const stage=document.createElement('div');
      stage.id='arredi-2d-stage';
      stage.style.cssText='position:absolute;inset:0;transform-origin:0 0;';
      const overlay=svgNode('svg',{
        viewBox:[meta.x,meta.y,meta.width,meta.height].join(' '),
        preserveAspectRatio:'xMidYMid meet',
        'aria-label':'Arredi sovrapposti alla pianta in centimetri'
      });
      overlay.id='arredi-2d-overlay';
      overlay.style.cssText='position:absolute;inset:0;width:100%;height:100%;touch-action:none;pointer-events:all';
      stage.append(img,overlay);
      view.replaceChildren(stage);
      state.stage=stage;state.overlay=overlay;state.sourceImg=img;
      overlay.addEventListener('pointermove',onMove);
      overlay.addEventListener('pointerdown',onPointerDown);
      overlay.addEventListener('pointerup',onPointerUp);
      overlay.addEventListener('pointercancel',onPointerUp);
      overlay.addEventListener('click',onClick);
      state.lastError='';
      state.zoom=1;state.panX=0;state.panY=0;
      redraw();updateZoom();
      emit('Pianta in scala centimetri pronta: scegli un arredo dalla barra');
    }catch(error){
      state.lastError='Posa non disponibile: '+String(error?.message||error);
      emit();
    }finally{state.loadingSource=null;}
  }
  const observer=new MutationObserver(()=>{
    if(state.stage?.isConnected && state.overlay?.isConnected)return;
    const img=view.querySelector('img');
    if(img)void prepare(img);
  });
  observer.observe(view,{childList:true});
  view.addEventListener('wheel',onWheel,{passive:false});
  view.addEventListener('contextmenu',onContextMenu);
  document.addEventListener('keydown',onKey);
  const initial=view.querySelector('img');
  if(initial)void prepare(initial);
  function start(item){
    if(!canonical(item))return false;
    closeContextMenu();
    state.selectedId=null;
    state.angle=0;
    state.snapMode='';state.hoveredWall=null;state.snapSideIndex=null;
    state.snapFirstWall=null;state.snapSecondWall=null;
    state.snapOriginal=null;state.snapInfo=null;
    state.pending={catalogId:item.id,id:item.id,name:item.name,
      description:item.description||'',widthCm:item.widthCm,
      depthCm:item.depthCm,x:state.meta?.x+state.meta?.width/2||0,
      y:state.meta?.y+state.meta?.height/2||0,angle:0};
    redraw();
    emit(state.overlay?'Muovi il mouse sulla pianta, regola l’angolo e clicca per confermare':
      'Arredo scelto; attendi il caricamento della Pianta pulita');
    return true;
  }
  function setAngle(angle){
    state.angle=angleNumber(angle);
    if(state.pending){
      state.pending.angle=state.angle;
      if(state.snapMode==='aligned'){
        state.snapMode='';state.hoveredWall=null;state.snapSideIndex=null;
        state.snapFirstWall=null;state.snapSecondWall=null;
        state.snapOriginal=null;state.snapInfo=null;
      }
    }
    else {
      const item=state.items.find(x=>x.id===state.selectedId);
      if(item)item.angle=state.angle;
    }
    redraw();emit();
    return state.angle;
  }
  function cancel(){
    closeContextMenu();
    state.pending=null;state.dragging=null;
    state.snapMode='';state.hoveredWall=null;state.snapSideIndex=null;
    state.snapFirstWall=null;state.snapSecondWall=null;
    state.snapOriginal=null;state.snapInfo=null;
    redraw();emit('Posizionamento annullato');
  }
  function remove(){
    if(!state.selectedId)return false;
    state.items=state.items.filter(x=>x.id!==state.selectedId);
    state.selectedId=null;
    redraw();emit('Arredo rimosso dal layout corrente');
    return true;
  }
  function resetZoom(){
    state.zoom=1;state.panX=0;state.panY=0;updateZoom();
  }
  root.TiralineeArrediPlacement=Object.freeze({
    start,setAngle,cancel,remove,resetZoom,beginWallSnap,
    onChange(fn){state.onChange=typeof fn==='function'?fn:null;emit();},
    getState(){return {ready:!!state.overlay,zoom:state.zoom,
      items:state.items.map(x=>({...x})),pending:state.pending?{...state.pending}:null,
      selectedId:state.selectedId,angle:state.angle,unit:state.meta?'cm':null,
      floor:state.meta?.floor||null,
      wallCount:state.walls.length,snapMode:state.snapMode,
      snapSideIndex:state.snapSideIndex,
      snapInfo:state.snapInfo?{...state.snapInfo}:null};}
  });
})(window);
