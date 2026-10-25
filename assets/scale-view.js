(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.ExpanseScaleView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const varying='varying highp float vExpanseDepth;\n';
 function denseArray(value,length,predicate){if(!Array.isArray(value)||value.length!==length)return false;for(let i=0;i<length;i++)if(!Object.prototype.hasOwnProperty.call(value,i)||!predicate(value[i]))return false;return true;}
 function finiteArray(value,length){return denseArray(value,length,Number.isFinite);}
 function patchShader(shader,bounds){
  const project=shader.vertexShader.includes('#include <project_vertex>')?'#include <project_vertex>':shader.vertexShader.includes('gl_Position = projectionMatrix * mvPosition;')?'gl_Position = projectionMatrix * mvPosition;':null;
  if(!project)throw new Error('Unclassified physical shader: project_vertex adapter required.');
  if(!/void\s+main\s*\(\s*\)\s*\{/.test(shader.fragmentShader))throw new Error('Unclassified fragment shader main.');
  shader.vertexShader=varying+shader.vertexShader.replace(project,project+'\nvExpanseDepth = -mvPosition.z;');
  shader.fragmentShader=varying+'uniform highp float uExpanseNear;\nuniform highp float uExpanseFar;\nuniform highp float uExpanseLast;\n'+shader.fragmentShader.replace(/void\s+main\s*\(\s*\)\s*\{/,
   'void main(){\nif(vExpanseDepth < uExpanseNear || (uExpanseLast < .5 ? vExpanseDepth >= uExpanseFar : vExpanseDepth > uExpanseFar)) discard;\n');
  Object.assign(shader.uniforms,{uExpanseNear:bounds.near,uExpanseFar:bounds.far,uExpanseLast:bounds.last});
 }
 function capabilityErrors(c){
  const errors=[];
  if(!c.complete)errors.push('Incomplete framebuffer.');
  if(!(c.depthBits>=24))errors.push('At least 24 depth bits required.');
  ['vertex','fragment'].forEach(stage=>{const f=c[stage];if(!f||f.precision<23||f.rangeMin<4||f.rangeMax<38)errors.push(stage+' HIGH_FLOAT cannot cover the required highp depth range.');});
  if(c.selected!=='highp')errors.push('Renderer must select highp.');
  return errors;
 }
 function create(options){
  const {THREE:T,renderer:r,math:M}=options;
  if(!T||!r||!M)throw new TypeError('THREE, renderer and math are required.');
  const scene=new T.Scene(),sky=new T.Scene(),camera=new T.PerspectiveCamera();scene.background=null;sky.background=null;
  const bounds={near:{value:.1},far:{value:2e11},last:{value:1}};
  const materials=new Map(),roots=[],mapping=new Map(),reverse=new Map();
  let frame=null,disposed=false,drawStats=null;
  const ownedMaterials=new Set(),ownedGeometries=new Set();
  function alive(){if(disposed)throw new Error('Scale adapter disposed.');}
  function material(source,unit,backdrop){
   if(String(source.onBeforeCompile)!==String(T.Material.prototype.onBeforeCompile))throw new Error('Unclassified source material compile callback.');
   if(backdrop&&!['PointsMaterial','SpriteMaterial','MeshBasicMaterial'].includes(source.type))throw new Error('Unclassified backdrop material '+source.type);
   if(backdrop){let byUnit=materials.get(source);if(!byUnit){byUnit=new Map();materials.set(source,byUnit);}const key=unit+':sky';if(byUnit.has(key))return byUnit.get(key);const m=source.clone();m.depthWrite=false;if(m.isPointsMaterial&&m.sizeAttenuation)m.size*=unit;byUnit.set(key,m);ownedMaterials.add(m);return m;}
   if(source.isRawShaderMaterial)throw new Error('Unclassified raw physical shader.');
   if(source.isShaderMaterial){
    const vertex=source.vertexShader;
    const atmo='varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
    const corona='varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
    if(![atmo,corona].includes(vertex)||!source.fragmentShader.includes('normalize(cameraPosition - vW)'))throw new Error('Unclassified custom physical shader; explicit dimensional adapter required.');
    let byUnit=materials.get(source);if(!byUnit){byUnit=new Map();materials.set(source,byUnit);}if(byUnit.has(unit))return byUnit.get(unit);
    const m=source.clone();m.precision='highp';m.vertexShader=vertex.replace('gl_Position = projectionMatrix * viewMatrix * w;','vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;');
    // The source normal is in view space. Keep the view vector in that space too.
    m.fragmentShader=m.fragmentShader.replace('normalize(cameraPosition - vW)','normalize((viewMatrix * vec4(cameraPosition - vW, 0.0)).xyz)');
    m.onBeforeCompile=shader=>patchShader(shader,bounds);m.customProgramCacheKey=()=> 'expanse-fresnel-slice-v1';byUnit.set(unit,m);ownedMaterials.add(m);return m;
   }
   if(!['MeshBasicMaterial','MeshStandardMaterial','MeshPhongMaterial','MeshLambertMaterial','MeshNormalMaterial','MeshDepthMaterial','PointsMaterial','SpriteMaterial','LineBasicMaterial','LineDashedMaterial'].includes(source.type))throw new Error('Unclassified material '+source.type);
   let byUnit=materials.get(source);if(!byUnit){byUnit=new Map();materials.set(source,byUnit);}
   if(byUnit.has(unit))return byUnit.get(unit);
   const m=source.clone();m.precision='highp';m.onBeforeCompile=shader=>patchShader(shader,bounds);
   m.customProgramCacheKey=()=> 'expanse-native-slice-v1';
   if(m.isPointsMaterial&&m.sizeAttenuation)m.size=source.size*unit;
   // Dash/gap and the retained lineDistance attribute all stay in authored
   // geometry units. Their ratio is visual; no metre-space comparison occurs.
   byUnit.set(unit,m);ownedMaterials.add(m);return m;
  }
  function detach(object){if(object.parent)object.parent.remove(object);}
  function clearSource(){roots.forEach(entry=>{detach(entry.proxy);if(entry.proxy.isInstancedMesh)entry.proxy.dispose();});roots.length=0;mapping.clear();reverse.clear();ownedMaterials.forEach(m=>m.dispose());ownedMaterials.clear();ownedGeometries.forEach(g=>g.dispose());ownedGeometries.clear();materials.clear();frame=null;}
  function setSource(entries){
   alive();clearSource();
   const detached=[];
   try{entries.forEach(entry=>{
    const unit=entry.metresPerUnit;if(!Number.isFinite(unit)||unit<=0||!entry.source)throw new TypeError('Explicit positive metresPerUnit and source required.');
    if(entry.source.fog)throw new Error('Fog dimensional adapter is not registered.');
    const proxy=entry.source.clone(true),pairs=[];
    function walk(source,draw,backdrop,identity){
     identity=(entry.identities&&entry.identities.get(source))||identity||entry.id;
     backdrop=backdrop||source.userData.expanseRole==='backdrop';
     if(source.userData.expanseRole==='backdrop')detached.push({source,proxy:draw,unit,id:entry.id,special:'backdrop'});
     if(source.isInstancedMesh){if(!denseArray(source.userData.expanseMatrices,source.count,matrix=>finiteArray(matrix,16)))throw new TypeError('Instance positions require retained dense high-precision descriptors.');detached.push({source,proxy:draw,unit,id:entry.id,special:'instances'});}
     if(source.isLight)detached.push({source,proxy:draw,unit,id:entry.id,special:'light'});
     if(source.userData.expanseHistory){if(!source.isPoints)throw new Error('History adapter expects Points.');if(!denseArray(source.userData.expanseHistory,source.geometry.attributes.position.count,point=>finiteArray(point,3)))throw new TypeError('Invalid retained dense comet history.');draw.geometry=source.geometry.clone();ownedGeometries.add(draw.geometry);detached.push({source,proxy:draw,unit,id:entry.id,special:'history'});}
     if(source.isSkinnedMesh)throw new Error('Skinned geometry requires an explicit adapter.');
     if(source.geometry&&source.geometry.userData.expanseWorldPositions)throw new Error('Embedded world-position buffer requires an explicit rebase adapter.');
     if(source.isScene){draw.background=null;draw.fog=null;draw.overrideMaterial=null;}
     if(source.material)draw.material=Array.isArray(source.material)?source.material.map(m=>material(m,unit,backdrop)):material(source.material,unit,backdrop);
     mapping.set(source,draw);reverse.set(draw,entry.identities&&identity===entry.id?null:identity);pairs.push([source,draw]);
     source.children.forEach((child,i)=>walk(child,draw.children[i],backdrop,identity));
    }
    walk(entry.source,proxy);scene.add(proxy);roots.push({source:entry.source,proxy,unit,id:entry.id,ignoreRootScale:!!entry.ignoreRootScale,pairs,box:new T.Box3()});
   });
   detached.forEach(e=>{const duplicate=roots.findIndex(root=>root.proxy===e.proxy);if(duplicate>=0)roots.splice(duplicate,1);detach(e.proxy);(e.special==='backdrop'?sky:scene).add(e.proxy);e.proxy.frustumCulled=false;roots.push({...e,pairs:[],box:new T.Box3()});});
   // Directional targets may be outside their source light's subtree.
   mapping.forEach((proxy,source)=>{if(source.isDirectionalLight){if(!mapping.has(source.target))throw new Error('Directional target must be registered in the source graph.');proxy.target=mapping.get(source.target);}});
   }catch(error){clearSource();throw error;}
  }
  function snapshot(value){
   alive();const {origin,eye,quaternion,fov,aspect,width,height}=value;
   if(!finiteArray(origin,3)||!finiteArray(eye,3)||!finiteArray(quaternion,4)||Math.abs(Math.hypot(...quaternion)-1)>1e-5||![fov,aspect,width,height].every(Number.isFinite)||fov<=0||fov>=180||!Number.isFinite(1/Math.tan(fov*Math.PI/360)/aspect)||aspect<=0||width<=0||height<=0)throw new TypeError('Invalid scale frame.');
   const hullAlpha=value.hullAlpha===undefined?1:value.hullAlpha;if(!Number.isFinite(hullAlpha)||hullAlpha<0||hullAlpha>1)throw new TypeError('Invalid physical hull opacity.');
   try{
   frame=Object.freeze({origin:Object.freeze(origin.slice()),eye:Object.freeze(eye.slice()),quaternion:Object.freeze(quaternion.slice()),fov,aspect,width,height,hullAlpha});
   camera.position.fromArray(eye);camera.quaternion.fromArray(quaternion);camera.fov=fov;camera.aspect=aspect;camera.updateMatrixWorld(true);
   roots.forEach(entry=>{
    if(entry.special&&entry.special!=='backdrop')return;
    entry.source.updateWorldMatrix(true,true);
    entry.pairs.forEach(([s,p])=>{
     p.position.copy(s.position);p.quaternion.copy(s.quaternion);p.scale.copy(s.scale);p.visible=s.visible;p.layers.mask=s.layers.mask;
     if(s.isPointLight||s.isSpotLight){p.distance=s.distance*entry.unit;p.intensity=s.intensity;p.decay=s.decay;}
     if(s.isLight){p.color.copy(s.color);p.intensity=s.intensity;}
    });
    const pos=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();entry.source.matrixWorld.decompose(pos,q,scale);
    entry.proxy.position.fromArray(M.relativeMetres(pos.toArray(),origin));entry.proxy.quaternion.copy(q);entry.proxy.scale.copy(entry.ignoreRootScale?new T.Vector3(1,1,1):scale).multiplyScalar(entry.unit);entry.proxy.visible=effectiveVisible(entry.source);
    entry.proxy.updateMatrixWorld(true);entry.box.setFromObject(entry.proxy);
   });
   roots.forEach(entry=>{
    if(entry.special==='light'){
     const parent=mapping.get(entry.source.parent),world=new T.Matrix4();entry.source.updateWorldMatrix(true,false);if(parent)world.multiplyMatrices(parent.matrixWorld,entry.source.matrix);else{world.copy(entry.source.matrixWorld);for(let j=0;j<12;j++)world.elements[j]*=entry.unit;world.elements[12]=(world.elements[12]-origin[0])*1e6;world.elements[13]=(world.elements[13]-origin[1])*1e6;world.elements[14]=(world.elements[14]-origin[2])*1e6;}
     world.decompose(entry.proxy.position,entry.proxy.quaternion,entry.proxy.scale);entry.proxy.visible=effectiveVisible(entry.source);entry.proxy.intensity=entry.source.intensity;entry.proxy.color.copy(entry.source.color);if(entry.source.distance!==undefined){entry.proxy.distance=entry.source.distance*entry.unit;entry.proxy.decay=entry.source.decay;}entry.proxy.updateMatrixWorld(true);return;
    }
    if(entry.special!=='instances'&&entry.special!=='history')return;
    entry.source.updateWorldMatrix(true,false);entry.proxy.position.set(0,0,0);entry.proxy.quaternion.identity();entry.proxy.scale.setScalar(1);entry.proxy.visible=effectiveVisible(entry.source);
    const matrix=new T.Matrix4(),world=new T.Matrix4(),v=new T.Vector3();
    entry.box.makeEmpty();
    if(entry.special==='instances'){
     const geometry=entry.source.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
     if(!denseArray(entry.source.userData.expanseMatrices,entry.source.count,elements=>finiteArray(elements,16)))throw new TypeError('Invalid retained dense instance matrices.');entry.source.userData.expanseMatrices.forEach((elements,i)=>{matrix.fromArray(elements);world.multiplyMatrices(entry.source.matrixWorld,matrix);for(let j=0;j<12;j++)world.elements[j]*=entry.unit;world.elements[12]=(world.elements[12]-origin[0])*1e6;world.elements[13]=(world.elements[13]-origin[1])*1e6;world.elements[14]=(world.elements[14]-origin[2])*1e6;entry.proxy.setMatrixAt(i,world);const b=geometry.boundingBox;for(let mask=0;mask<8;mask++){v.set(mask&1?b.max.x:b.min.x,mask&2?b.max.y:b.min.y,mask&4?b.max.z:b.min.z).applyMatrix4(world);entry.box.expandByPoint(v);}});entry.proxy.instanceMatrix.needsUpdate=true;
    }else{
     const history=entry.source.userData.expanseHistory,positions=entry.proxy.geometry.attributes.position;if(!denseArray(history,positions.count,p=>finiteArray(p,3)))throw new TypeError('Invalid retained dense comet history.');
     history.forEach((p,i)=>{v.fromArray(p).applyMatrix4(entry.source.matrixWorld);v.set((v.x-origin[0])*1e6,(v.y-origin[1])*1e6,(v.z-origin[2])*1e6);positions.setXYZ(i,v.x,v.y,v.z);entry.box.expandByPoint(v);});positions.needsUpdate=true;
     // Point sprites have an attenuated physical extent around each retained centre.
     entry.box.expandByScalar(entry.source.material.size*entry.unit);
    }
    entry.proxy.updateMatrixWorld(true);
   });
   materials.forEach((byUnit,source)=>byUnit.forEach(draw=>{draw.visible=source.visible;draw.opacity=source.opacity;if(source.color)draw.color.copy(source.color);if(source.emissive)draw.emissive.copy(source.emissive);if(source.emissiveIntensity!==undefined)draw.emissiveIntensity=source.emissiveIntensity;if(source.isShaderMaterial)Object.keys(source.uniforms).forEach(key=>{draw.uniforms[key].value=source.uniforms[key].value;});}));
   roots.filter(e=>e.ignoreRootScale).forEach(entry=>{entry.proxy.visible=effectiveVisible(entry.source)&&hullAlpha>0;entry.pairs.forEach(([source,draw])=>{if(!source.material)return;const a=Array.isArray(source.material)?source.material:[source.material],b=Array.isArray(draw.material)?draw.material:[draw.material];b.forEach((m,i)=>{m.opacity=a[i].opacity*hullAlpha;m.transparent=a[i].transparent||hullAlpha<1;m.depthWrite=a[i].depthWrite&&hullAlpha===1;});});});
   return frame;
   }catch(error){frame=null;throw error;}
  }
  function effectiveVisible(source){for(let node=source;node;node=node.parent)if(!node.visible)return false;return true;}
  function targetState(){const gl=r.getContext();return {target:r.getRenderTarget(),viewport:new T.Vector4().fromArray(gl.getParameter(gl.VIEWPORT)),scissor:new T.Vector4().fromArray(gl.getParameter(gl.SCISSOR_BOX)),test:gl.isEnabled(gl.SCISSOR_TEST),canvasTest:r.getScissorTest(),face:r.getActiveCubeFace?r.getActiveCubeFace():0,level:r.getActiveMipmapLevel?r.getActiveMipmapLevel():0};}
  function restoreTarget(state){
   r.setScissorTest(state.canvasTest);
   if(state.target){const target=state.target,viewport=target.viewport.clone(),scissor=target.scissor.clone(),test=target.scissorTest;try{target.viewport.copy(state.viewport);target.scissor.copy(state.scissor);target.scissorTest=state.test;r.setRenderTarget(target,state.face,state.level);}finally{target.viewport.copy(viewport);target.scissor.copy(scissor);target.scissorTest=test;}}
   else{r.setRenderTarget(null);r.state.viewport(state.viewport);r.state.scissor(state.scissor);r.state.setScissorTest(state.test);}
  }
  function capabilities(target){
   alive();const old=targetState();try{
    r.setRenderTarget(target||null);const gl=r.getContext();
    const fmt=stage=>{const f=gl.getShaderPrecisionFormat(stage,gl.HIGH_FLOAT);return f?{precision:f.precision,rangeMin:f.rangeMin,rangeMax:f.rangeMax}:null;};
    const c={depthBits:gl.getParameter(gl.DEPTH_BITS),complete:gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE,vertex:fmt(gl.VERTEX_SHADER),fragment:fmt(gl.FRAGMENT_SHADER),selected:r.capabilities.precision};
    return Object.freeze({...c,errors:capabilityErrors(c)});
   }finally{restoreTarget(old);}
  }
  function interval(entry){
   if(entry.box.isEmpty())return [-Infinity,Infinity];
   let min=Infinity,max=-Infinity;const v=new T.Vector3();
   for(let mask=0;mask<8;mask++){v.set(mask&1?entry.box.max.x:entry.box.min.x,mask&2?entry.box.max.y:entry.box.min.y,mask&4?entry.box.max.z:entry.box.min.z).applyMatrix4(camera.matrixWorldInverse);min=Math.min(min,-v.z);max=Math.max(max,-v.z);}
   return [min,max];
  }
  function render(options={}){
   alive();if(!frame)throw new Error('Snapshot required before rendering.');
   const target=options.target||null,caps=capabilities(target);if(caps.errors.length)throw new Error(caps.errors.join(' '));
   const oldTarget=targetState(),oldClear=r.getClearColor(new T.Color()),oldAlpha=r.getClearAlpha(),oldAuto=r.autoClear;
   const oldVisibility=roots.map(e=>e.proxy.visible),intervals=roots.map(interval),draws=[];
   try{
    r.setRenderTarget(target);r.setScissorTest(false);r.autoClear=false;r.setClearColor(options.clearColor===undefined?0x020307:options.clearColor,1);r.clear(true,true,true);
    fullCamera();let backdropCalls=0;if(sky.children.length){r.render(sky,camera);backdropCalls+=r.info.render.calls;}if(options.backdrop){r.render(options.backdrop,camera);backdropCalls+=r.info.render.calls;}
    const slices=options.reference?[{near:options.reference[0],far:options.reference[1],clipNear:options.reference[0],clipFar:options.reference[1],includeFar:true}]:M.sliceIntervals();
    for(let i=slices.length-1;i>=0;i--){const band=slices[i];let count=0;
     roots.forEach((e,j)=>{if(e.special==='backdrop'||e.special==='light')return;const span=intervals[j];e.proxy.visible=oldVisibility[j]&&span[1]>=band.near&&span[0]<=band.far;if(e.proxy.visible)count++;});
     if(!count)continue;
     camera.near=band.clipNear;camera.far=band.clipFar;camera.updateProjectionMatrix();bounds.near.value=band.near;bounds.far.value=band.far;bounds.last.value=band.includeFar?1:0;
     ownedMaterials.forEach(m=>{if(m.isShaderMaterial)m.uniformsNeedUpdate=true;});
     r.clearDepth();r.render(scene,camera);draws.push({band:i,roots:count,calls:r.info.render.calls,triangles:r.info.render.triangles});
    }
    const gl=r.getContext(),error=gl.getError();if(error!==gl.NO_ERROR)throw new Error('Scale draw failed with WebGL error '+error+'.');
    drawStats=Object.freeze({bands:draws.length,draws,backdropCalls,resources:{...r.info.memory},programs:r.info.programs.length});return drawStats;
   }finally{
    roots.forEach((e,j)=>{e.proxy.visible=oldVisibility[j];});r.autoClear=oldAuto;r.setClearColor(oldClear,oldAlpha);restoreTarget(oldTarget);
   }
  }
  function fullCamera(){camera.near=.1;camera.far=2e11;camera.updateProjectionMatrix();return camera;}
  function projectAuthored(position){alive();if(!frame)throw new Error('Snapshot required.');const v=new T.Vector3().fromArray(M.relativeMetres(position,frame.origin)).applyMatrix4(fullCamera().matrixWorldInverse),p=M.projectEye(v.toArray(),frame.fov,frame.aspect,frame.width,frame.height);return {...p,visible:p.visible&&M.sliceIndex(p.depth)>=0};}
  function hitMaterial(hit){const material=hit.object.material;return Array.isArray(material)?material[hit.face?hit.face.materialIndex:0]:material;}
  function drawnMaterial(material){return !!material&&material.visible&&material.opacity>0;}
  function solidBillboard(material){
   // Transparent particles/halos have no solid surface. Their texture alpha is
   // not CPU-readable in general; do not turn their billboard into an occluder.
   return drawnMaterial(material)&&!material.transparent&&material.blending===T.NormalBlending;
  }
  function pointHits(object,cssPoint,ray){
   if(!solidBillboard(object.material))return [];
   const gl=r.getContext(),limits=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE),buffer=r.getDrawingBufferSize(new T.Vector2()),ratio=r.getPixelRatio();
   if(!limits||!Number.isFinite(limits[0])||!Number.isFinite(limits[1])||limits[0]<=0||limits[1]<limits[0]||buffer.x<=0||buffer.y<=0)throw new Error('Point picking requires actual drawing-buffer and point-size limits.');
   const geometry=object.geometry,positions=geometry.attributes.position,index=geometry.index,available=index?index.count:positions.count,range=geometry.drawRange;
   const start=Math.max(0,range.start),end=Math.min(available,start+range.count),direction=ray.ray.direction.clone().transformDirection(camera.matrixWorldInverse),hits=[];
   for(let i=start;i<end;i++){
    const vertex=index?index.getX(i):i,world=new T.Vector3().fromBufferAttribute(positions,vertex).applyMatrix4(object.matrixWorld),eye=world.clone().applyMatrix4(camera.matrixWorldInverse),depth=-eye.z;
    if(M.sliceIndex(depth)<0)continue;
    const projected=M.projectEye(eye.toArray(),frame.fov,frame.aspect,frame.width,frame.height);if(!projected.visible)continue;
    // Match r128 point-size attenuation and hardware clamping in framebuffer
    // pixels, then convert to CSS. Never use Raycaster's world-distance radius.
    const requested=object.material.sizeAttenuation?object.material.size*buffer.y/(2*depth):object.material.size*ratio;
    const pixels=T.MathUtils.clamp(requested,limits[0],limits[1]);
    if(Math.abs(cssPoint[0]-projected.x)>pixels*frame.width/buffer.x/2||Math.abs(cssPoint[1]-projected.y)>pixels*frame.height/buffer.y/2)continue;
    const distance=depth/-direction.z;hits.push({object,index:vertex,distance,point:ray.ray.at(distance,new T.Vector3())});
   }
   return hits;
  }
  function pick(cssPoint){
   alive();if(!frame||!finiteArray(cssPoint,2))throw new TypeError('Valid frame/CSS point required.');
   if(cssPoint[0]<0||cssPoint[0]>frame.width||cssPoint[1]<0||cssPoint[1]>frame.height)return null;
   const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(cssPoint[0]/frame.width*2-1,1-cssPoint[1]/frame.height*2),fullCamera());
   // Lines are non-solid orbit/route annotations, not filled occluders. This
   // bounded native picker does not promise fragment/alpha-texture exactness.
   const surfaces=[],particles=[];
   roots.forEach(entry=>{if(entry.special==='backdrop'||entry.special==='light')return;entry.proxy.traverse(object=>{
    if(!effectiveVisible(object)||!object.layers.test(ray.layers))return;
    if(object.isPoints)particles.push(object);
    else if(object.isMesh||(object.isSprite&&solidBillboard(object.material)))surfaces.push(object);
   });});
   const hits=ray.intersectObjects(surfaces,false);particles.forEach(object=>hits.push(...pointHits(object,cssPoint,ray)));hits.sort((a,b)=>a.distance-b.distance);
   // Identity is deliberately checked AFTER the first drawn surface: unknown
   // opaque geometry (including belt instances) blocks the registered body behind.
   // Mesh/opaque-billboard hits are geometric, not alpha-texture-exact samples.
   const hit=hits.find(h=>drawnMaterial(hitMaterial(h))&&M.sliceIndex(-h.point.clone().applyMatrix4(camera.matrixWorldInverse).z)>=0);
   return hit?(reverse.get(hit.object)??null):null;
  }
  function diagnostics(){
   const physicalBoxes=roots.filter(e=>e.ignoreRootScale).map(e=>{const box=new T.Box3(),v=new T.Vector3();function walk(node,role){role=node.userData.expanseRole||role;if(role==='effect')return;if(node.geometry){if(role!=='physical')throw new Error('Hull physical role missing.');const p=node.geometry.attributes.position;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(node.matrixWorld);box.expandByPoint(v);}}node.children.forEach(child=>walk(child,role));}walk(e.proxy);return {id:e.id,min:box.min.toArray(),max:box.max.toArray()};});
   return {frame,drawStats,roots:roots.length,materials:ownedMaterials.size,ownedGeometries:ownedGeometries.size,physicalBoxes,boxes:roots.filter(e=>!e.special).map(e=>({id:e.id,min:e.box.min.toArray(),max:e.box.max.toArray()})),disposed};
  }
  function dispose(){if(!disposed){clearSource();disposed=true;}}
  return Object.freeze({setSource,snapshot,capabilities,render,projectAuthored,pick,diagnostics,dispose});
 }
 return Object.freeze({patchShader,capabilityErrors,create});
});
