(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpanseScaleRaster=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 // This deliberately conservative allowance is for an isolated one-pixel MSAA
 // raster edge. Uniform alpha/coplanar fixtures require exact agreement instead.
 function coNearestIDs(hits){
  if(!Array.isArray(hits))throw new TypeError('Dense finite ray hits required.');
  let nearest=Infinity;for(let i=0;i<hits.length;i++){const h=hits[i];if(!Object.prototype.hasOwnProperty.call(hits,i)||!h||typeof h.id!=='string'||!h.id||!Number.isFinite(h.distance)||h.distance<0)throw new TypeError('Dense finite ray hits required.');nearest=Math.min(nearest,h.distance);}
  if(!hits.length)return [];
  // Only floating-point roundoff around a physically coplanar nearest surface,
  // never a depth-buffer tolerance or pixel-derived distance allowance.
  const epsilon=64*Number.EPSILON*Math.max(1,nearest);
  return [...new Set(hits.filter(h=>h.distance-nearest<=epsilon).map(h=>h.id))].sort();
 }
 function compare(actual,reference,width,height,edgeMask){
  const length=width*height*4;if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||!Number.isSafeInteger(length)||!ArrayBuffer.isView(actual)||!ArrayBuffer.isView(reference)||actual.length!==length||reference.length!==length)throw new TypeError('Matching RGBA pixel buffers and positive dimensions required.');
  const errorAt=i=>Math.max(Math.abs(actual[i]-reference[i]),Math.abs(actual[i+1]-reference[i+1]),Math.abs(actual[i+2]-reference[i+2]));
  if(edgeMask!==undefined&&(!ArrayBuffer.isView(edgeMask)||edgeMask.length!==width*height))throw new TypeError('Independent geometry edge mask must match the image.');
  let different=0,edgeDifferences=0,invalidDifferences=0,maxError=0;const samples=[],qualified=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4,error=errorAt(i);maxError=Math.max(maxError,error);if(error<=2)continue;different++;
   let isolated=true;const min=[reference[i],reference[i+1],reference[i+2]],max=min.slice(),colours=[min.slice()],pixel=[actual[i],actual[i+1],actual[i+2]];
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if((dx===0&&dy===0)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;const j=((y+dy)*width+x+dx)*4;if(errorAt(j)>2)isolated=false;
    if(Math.abs(dx)+Math.abs(dy)===1){colours.push([reference[j],reference[j+1],reference[j+2]]);for(let c=0;c<3;c++){min[c]=Math.min(min[c],reference[j+c]);max[c]=Math.max(max[c],reference[j+c]);}}
   }
   let coherent=false;for(let a=0;a<colours.length;a++)for(let b=a;b<colours.length;b++){const v=colours[b].map((n,c)=>n-colours[a][c]),den=v.reduce((s,n)=>s+n*n,0),t=den?Math.max(0,Math.min(1,v.reduce((s,n,c)=>s+n*(pixel[c]-colours[a][c]),0)/den)):0;if(pixel.every((n,c)=>Math.abs(n-(colours[a][c]+v[c]*t))<=2))coherent=true;}
   const geometryEdge=!!edgeMask&&edgeMask[y*width+x]===1,edge=isolated&&geometryEdge&&coherent;
   if(edge){edgeDifferences++;if(qualified.length<33)qualified.push([x,y]);}else invalidDifferences++;
   if(samples.length<32)samples.push({x,y,actual:pixel,reference:[reference[i],reference[i+1],reference[i+2]],min,max,isolated,geometryEdge,coherent,edge});
  }
  const exceptionBudgetExceeded=edgeDifferences>32;let recurring=false;
  if(!exceptionBudgetExceeded)for(let a=0;a<qualified.length;a++)for(let b=a+1;b<qualified.length;b++)for(let c=b+1;c<qualified.length;c++){const p=qualified[a],q=qualified[b],r=qualified[c];if((q[0]-p[0])*(r[1]-p[1])===(q[1]-p[1])*(r[0]-p[0]))recurring=true;}
  if(recurring||exceptionBudgetExceeded){invalidDifferences+=edgeDifferences;edgeDifferences=0;}
  return {different,edgeDifferences,invalidDifferences,maxError,recurring,exceptionBudgetExceeded,samples};
 }
 return Object.freeze({compare,coNearestIDs});
});
