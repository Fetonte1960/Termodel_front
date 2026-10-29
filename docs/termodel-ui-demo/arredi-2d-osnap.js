/* Arredi OSNAP geometry — metric centimeters, no network or persisted changes.
 * clean-boundary polylines are architectural wall faces; window-symbol lines
 * are intentionally NOT selectable. The current furniture angle picks the
 * closest existing side. Then the entire furniture rotates so that SAME side
 * becomes parallel to the selected wall and translates until it touches.
 */
(function(root,factory){
  'use strict';
  const api=Object.freeze(factory());
  if(typeof module==='object' && module.exports)module.exports=api;
  if(root)root.TiralineeArrediOsnap=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const DEG=Math.PI/180;
  const finite=n=>typeof n==='number' && Number.isFinite(n);
  function pointsFromText(raw){
    if(typeof raw!=='string')return [];
    const parts=raw.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if(parts.length<4 || parts.length%2 || !parts.every(finite))return [];
    const points=[];
    for(let i=0;i<parts.length;i+=2)points.push({x:parts[i],y:parts[i+1]});
    return points;
  }
  function extractWalls(xml){
    const doc=xml?.documentElement;
    if(doc?.localName!=='svg' || doc.getAttribute('data-termodel-format')!=='TERMODEL-CLEAN-FLOOR-SVG-V1'
      ||doc.getAttribute('data-termodel-units')!=='cm')
      return [];
    // Only approved architectural boundaries; exclude windows and annotations.
    const candidates=doc.querySelectorAll('polyline.clean-boundary');
    const segments=[];
    for(const polyline of candidates){
      const points=pointsFromText(polyline.getAttribute('points'));
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i];
        const length=Math.hypot(b.x-a.x,b.y-a.y);
        if(length>1)segments.push({a,b,length});
      }
    }
    return segments;
  }
  function nearestOnSegment(point,segment){
    const {a,b}=segment;
    const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    if(!finite(den)||den<1e-9)return null;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/den));
    const x=a.x+t*dx,y=a.y+t*dy;
    return {x,y,t,distance:Math.hypot(point.x-x,point.y-y)};
  }
  function selectWall(segments,point,toleranceCm){
    if(!finite(point?.x)||!finite(point?.y)||!finite(toleranceCm)||toleranceCm<=0)
      return null;
    let best=null;
    for(const segment of segments){
      const hit=nearestOnSegment(point,segment);
      if(hit && hit.distance<=toleranceCm && (!best||hit.distance<best.distance))
        best={segment,hit,distance:hit.distance};
    }
    return best;
  }
  function norm180(deg){
    return ((deg+90)%180+180)%180-90;
  }
  function norm360(deg){return ((deg%360)+360)%360;}
  function rotate(point,deg){
    const a=deg*DEG,c=Math.cos(a),s=Math.sin(a);
    return {x:point.x*c-point.y*s,y:point.x*s+point.y*c};
  }
  function localSides(width,depth){
    const w=width/2,h=depth/2;
    // Deliberately fixed side identity; never substitute a different side
    // during alignment merely to reduce the angular change.
    const p=[{x:-w,y:-h},{x:w,y:-h},{x:w,y:h},{x:-w,y:h}];
    return [0,1,2,3].map(i=>{
      const a=p[i],b=p[(i+1)%4];
      return {index:i,a,b,mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};
    });
  }
  function alignFurniture(placement,wall){
    if(!placement||![placement.x,placement.y,placement.widthCm,
      placement.depthCm,placement.angle].every(finite)||
       placement.widthCm<=0||placement.depthCm<=0||!wall?.a||!wall?.b)
      return null;
    // Contact point is the projection of the CURRENT furniture center on
    // the selected, finite architectural segment. It minimizes translation.
    const q=nearestOnSegment({x:placement.x,y:placement.y},wall);
    if(!q)return null;
    const currentAngle=norm360(placement.angle);
    const sides=localSides(placement.widthCm,placement.depthCm);
    let chosen=null;
    for(const side of sides){
      // Compare SIDE MIDPOINTS in the CURRENT orientation. Comparing closest
      // corner-to-wall distance is ambiguous: a shared corner would equally
      // nominate two adjacent sides, making the result depend on enumeration.
      const mid=rotate(side.mid,currentAngle);
      const dist=Math.hypot(placement.x+mid.x-q.x,placement.y+mid.y-q.y);
      if(!chosen||dist<chosen.distance-1e-6)chosen={side,distance:dist};
    }
    if(!chosen)return null;
    const wallDir=Math.atan2(wall.b.y-wall.a.y,wall.b.x-wall.a.x)/DEG;
    const sideDir=Math.atan2(chosen.side.b.y-chosen.side.a.y,
      chosen.side.b.x-chosen.side.a.x)/DEG+currentAngle;
    // An unoriented wall may be traversed in either direction. Choose the
    // smallest correction modulo 180 while keeping the selected side ID.
    const correction=norm180(wallDir-sideDir);
    const angle=norm360(currentAngle+correction);
    const mid=rotate(chosen.side.mid,angle);
    const x=q.x-mid.x,y=q.y-mid.y;
    if(![x,y,angle].every(finite))return null;
    return {x:Math.round(x*100)/100,y:Math.round(y*100)/100,
      angle:Math.round(angle*100)/100,
      sideIndex:chosen.side.index,
      wallContact:{x:q.x,y:q.y},
      wall:{a:{...wall.a},b:{...wall.b}},
      correction};
  }

  function angleDifference(a,b){
    return Math.abs(norm180(a-b));
  }
  function wallSame(first,second){
    if(!first?.a || !first?.b || !second?.a || !second?.b)return false;
    const close=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<0.01;
    return (close(first.a,second.a)&&close(first.b,second.b)) ||
      (close(first.a,second.b)&&close(first.b,second.a));
  }
  function alignTwoWalls(placement,wallFirst,wallSecond){
    if(wallSame(wallFirst,wallSecond))return null;
    const first=alignFurniture(placement,wallFirst);
    if(!first || !wallSecond?.a || !wallSecond?.b)return null;

    // Wall 1 fixes the angle and the perpendicular offset. Translation is
    // allowed ONLY along that wall, so wall 2 can never rotate the first side.
    const dx=wallFirst.b.x-wallFirst.a.x;
    const dy=wallFirst.b.y-wallFirst.a.y;
    const len=Math.hypot(dx,dy);
    if(!len || !Number.isFinite(len))return null;
    const u={x:dx/len,y:dy/len};
    const firstContact=first.wallContact;
    const along=(firstContact.x-wallFirst.a.x)*u.x+
      (firstContact.y-wallFirst.a.y)*u.y;
    const lower=-Math.max(0,Math.min(len,along));
    const upper=len+lower;
    const sides=localSides(placement.widthCm,placement.depthCm);
    let choice=null;

    for(const side of sides){
      if(side.index===first.sideIndex)continue;
      const mid=rotate(side.mid,first.angle);
      const base={x:first.x+mid.x,y:first.y+mid.y};
      const segmentDistance=t=>{
        const q=nearestOnSegment({
          x:base.x+t*u.x,y:base.y+t*u.y
        },wallSecond);
        return q?.distance??Infinity;
      };
      // Minimize distance from the SECOND side's midpoint to the finite
      // SECOND segment, with a tiny regularizer to avoid needless sliding
      // when walls are parallel and both translations are equally good.
      const objective=t=>{
        const d=segmentDistance(t);
        return d*d+0.000001*t*t;
      };
      let lo=lower,hi=upper;
      for(let i=0;i<66;i++){
        const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;
        if(objective(a)<=objective(b))hi=b;
        else lo=a;
      }
      const t=(lo+hi)/2;
      const gap=segmentDistance(t);
      const sideDir=Math.atan2(side.b.y-side.a.y,
        side.b.x-side.a.x)/DEG+first.angle;
      const secondDir=Math.atan2(wallSecond.b.y-wallSecond.a.y,
        wallSecond.b.x-wallSecond.a.x)/DEG;
      const difference=angleDifference(sideDir,secondDir);
      // Prefer a geometrically compatible face, but do not override wall 1
      // in a conflicting-corner case. The second contact is best effort.
      const score=gap*gap+0.000001*t*t+
        (difference*0.15)*(difference*0.15);
      if(!choice || score<choice.score){
        choice={sideIndex:side.index,gap,angleErrorDeg:difference,
          t,score};
      }
    }
    if(!choice)return null;
    const x=first.x+choice.t*u.x,y=first.y+choice.t*u.y;
    const snapped={
      x:Math.round(x*100)/100,y:Math.round(y*100)/100,
      angle:first.angle,
      firstSideIndex:first.sideIndex,
      secondSideIndex:choice.sideIndex,
      firstWall:wallFirst,secondWall:wallSecond,
      // Recalculate after rounding to report actual resulting residual.
      secondGapCm:0,
      secondAngleErrorDeg:Math.round(choice.angleErrorDeg*100)/100
    };
    const secondSide=sides[choice.sideIndex];
    const mid=rotate(secondSide.mid,snapped.angle);
    snapped.secondGapCm=Math.round(
      (nearestOnSegment({x:snapped.x+mid.x,y:snapped.y+mid.y},
        wallSecond)?.distance??Infinity)*100)/100;
    snapped.firstGapCm=Math.round(
      (nearestOnSegment({
        x:snapped.x+rotate(sides[first.sideIndex].mid,first.angle).x,
        y:snapped.y+rotate(sides[first.sideIndex].mid,first.angle).y
      },wallFirst)?.distance??Infinity)*100)/100;
    return snapped;
  }

  return {extractWalls,pointsFromText,selectWall,alignFurniture,alignTwoWalls,nearestOnSegment,localSides,norm360,wallSame};
});
