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
    onChange:null, loadingSource:null, lastError:''
  };
  function emit(message='') {
    state.onChange?.({
      pending: state.pending,
      selected: state.items.find(x=>x.id===state.selectedId) || null,
      count:state.items.length,
      zoom:Math.round(state.zoom*100),
      ready:!!state.overlay,
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
    return Number.isFinite(value)?((Math.round(value)%360)+360)%360:0;
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
      floor:svg.getAttribute('data-termodel-floor-name')||''};
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
      state.pending.x=point.x;
      state.pending.y=point.y;
      redraw();
      emit('Anteprima: clic sulla pianta per collocare');
    }
  }
  function onPointerDown(e){
    if(e.button!==0 || !state.overlay)return;
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
  function onClick(e){
    if(e.button!==0 || !state.pending || state.dragging)return;
    const point=pointFromEvent(e);
    if(!point)return;
    const item=Object.assign({},state.pending,{
      id:'AR-'+(++state.sequence),x:point.x,y:point.y,angle:state.angle
    });
    state.items.push(item);
    state.selectedId=item.id;
    state.pending=null;
    redraw();
    emit('Collocato '+item.name+' · '+item.widthCm+' × '+item.depthCm+
      ' cm · '+item.angle+'° (layout di sessione)');
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
  document.addEventListener('keydown',onKey);
  const initial=view.querySelector('img');
  if(initial)void prepare(initial);
  function start(item){
    if(!canonical(item))return false;
    state.selectedId=null;
    state.angle=0;
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
    if(state.pending)state.pending.angle=state.angle;
    else {
      const item=state.items.find(x=>x.id===state.selectedId);
      if(item)item.angle=state.angle;
    }
    redraw();emit();
    return state.angle;
  }
  function cancel(){
    state.pending=null;state.dragging=null;
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
    start,setAngle,cancel,remove,resetZoom,
    onChange(fn){state.onChange=typeof fn==='function'?fn:null;emit();},
    getState(){return {ready:!!state.overlay,zoom:state.zoom,
      items:state.items.map(x=>({...x})),pending:state.pending?{...state.pending}:null,
      selectedId:state.selectedId,angle:state.angle,unit:state.meta?'cm':null,
      floor:state.meta?.floor||null};}
  });
})(window);
