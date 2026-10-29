/* Pure metric geometry regression for wall OSNAP, without rendering/Neon. */
'use strict';
const assert=require('node:assert/strict');
const s=require('../arredi-2d-osnap.js');
const fakePolyline=points=>({getAttribute:k=>k==='points'?points:null});
const fakeDocument=(format='TERMODEL-CLEAN-FLOOR-SVG-V1',unit='cm')=>({
  documentElement:{
    localName:'svg',
    getAttribute:key=>({'data-termodel-format':format,'data-termodel-units':unit}[key]||null),
    querySelectorAll:query=>{
      assert.equal(query,'polyline.clean-boundary');
      // The genuine source has clean-boundary polylines and 60 window-symbol
      // <line> elements; window lines are never returned by this selector.
      return [fakePolyline('0,100 800,100 800,500')];
    }
  }
});
const segs=s.extractWalls(fakeDocument());
assert.equal(segs.length,2);
assert.deepEqual(s.extractWalls(fakeDocument('UNKNOWN')),[]);
assert.deepEqual(s.extractWalls(fakeDocument('TERMODEL-CLEAN-FLOOR-SVG-V1','px')),[]);
assert.equal(s.selectWall(segs,{x:500,y:111},12).segment,segs[0]);
assert.equal(s.selectWall(segs,{x:500,y:140},12),null);
assert.equal(s.selectWall(segs,{x:900,y:130},10),null);
const near=(a,b,delta=.03)=>assert.ok(Math.abs(a-b)<=delta,'expected '+a+' ~= '+b);
function sideContact(item,aligned,wall){
  const side=s.localSides(item.widthCm,item.depthCm)[aligned.sideIndex];
  const rotated=s.nearestOnSegment;
  const theta=aligned.angle*Math.PI/180,cs=Math.cos(theta),sn=Math.sin(theta);
  const point=p=>({x:aligned.x+p.x*cs-p.y*sn,
    y:aligned.y+p.x*sn+p.y*cs});
  const a=point(side.a),b=point(side.b),m=point(side.mid);
  const proj=rotated(m,wall);
  near(proj.distance,0,.05);
  const cross=(b.x-a.x)*(wall.b.y-wall.a.y)-
    (b.y-a.y)*(wall.b.x-wall.a.x);
  near(cross,0,.25);
}
const wall=segs[0];
let item={x:500,y:300,angle:30,widthCm:180,depthCm:90};
let aligned=s.alignFurniture(item,wall);
assert.equal(aligned.sideIndex,0,'upper edge closest to wall before alignment');
near(aligned.angle,0);
near(aligned.x,500);near(aligned.y,145);
sideContact(item,aligned,wall);
const reverse={a:{...wall.b},b:{...wall.a}};
const reverseResult=s.alignFurniture(item,reverse);
assert.equal(reverseResult.sideIndex,0);
near(reverseResult.angle,0);
sideContact(item,reverseResult,wall);
const vertical={a:{x:100,y:0},b:{x:100,y:600}};
item={x:300,y:230,angle:25,widthCm:180,depthCm:90};
aligned=s.alignFurniture(item,vertical);
assert.equal(aligned.sideIndex,3,'left side closest before alignment');
near(aligned.angle,0);
near(aligned.x,190);near(aligned.y,230);
sideContact(item,aligned,vertical);
const diag={a:{x:0,y:0},b:{x:700,y:700}};
item={x:240,y:440,angle:20,widthCm:220,depthCm:90};
aligned=s.alignFurniture(item,diag);
assert.ok(aligned && aligned.sideIndex>=0);
sideContact(item,aligned,diag);
const same=s.alignFurniture({...item,...aligned},diag);
near(same.angle,aligned.angle);
assert.equal(same.sideIndex,aligned.sideIndex);
assert.equal(s.alignFurniture({...item,widthCm:0},diag),null);
assert.equal(s.alignFurniture(item,{a:{x:1,y:1},b:{x:1,y:1}}),null);

/* Dual-wall snap: first wall dictates angle, the other selected side fixes
 * position along wall 1. Conflicting wall directions cannot rotate item. */
const firstWall={a:{x:0,y:100},b:{x:800,y:100}};
const secondWall={a:{x:100,y:0},b:{x:100,y:600}};
const furniture={x:450,y:320,angle:30,widthCm:180,depthCm:90};
const one=s.alignFurniture(furniture,firstWall);
const two=s.alignTwoWalls(furniture,firstWall,secondWall);
assert.ok(two,'two-wall snap should produce a result');
assert.equal(two.firstSideIndex,one.sideIndex,
  'first side must be selected using ORIGINAL rotation, not second-wall geometry');
assert.equal(two.secondSideIndex,3,'near left side must contact second wall');
near(two.angle,one.angle,'first wall fixes the final angle');
near(two.x,190);
near(two.y,145);
near(two.firstGapCm,0);
near(two.secondGapCm,0);
near(two.secondAngleErrorDeg,0);
assert.notEqual(two.firstSideIndex,two.secondSideIndex,
  'two different furniture sides must be selected');
const reversed=s.alignTwoWalls(furniture,
  {a:{...firstWall.b},b:{...firstWall.a}},secondWall);
assert.ok(reversed);
near(reversed.angle,two.angle);
near(reversed.x,two.x);
near(reversed.y,two.y);
const conflictingSecond={a:{x:100,y:0},b:{x:380,y:520}};
const conflict=s.alignTwoWalls(furniture,firstWall,conflictingSecond);
assert.ok(conflict);
near(conflict.angle,one.angle);
assert.ok(conflict.secondAngleErrorDeg>1,
  'conflicting angle must be reported, never override first wall angle');
near(conflict.firstGapCm,0,.05);
const parallelSecond={a:{x:0,y:250},b:{x:800,y:250}};
const parallel=s.alignTwoWalls(furniture,firstWall,parallelSecond);
assert.ok(parallel);
near(parallel.angle,one.angle);
near(parallel.firstGapCm,0);
assert.ok(parallel.secondGapCm>=0);
assert.equal(s.alignTwoWalls(furniture,firstWall,firstWall),null,
  'the same wall cannot count as two selections');
console.log('ARREDI_TWO_WALL_OSNAP_OK: original primary side, two adjacent contacts, reversed walls, conflicting angles prioritize first');

console.log('ARREDI_OSNAP_GEOMETRY_OK: nearest original side; rotate same side to wall; exact contact; reversed and diagonal walls; windows excluded');
