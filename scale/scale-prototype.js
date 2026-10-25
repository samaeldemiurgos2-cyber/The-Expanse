(function(){
 'use strict';
 const T=THREE,M=ExpanseScaleMath,V=ExpanseScaleView,F=ExpanseScaleFlight,size=512;
 const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,precision:'highp'});r.setPixelRatio(1);r.setSize(size,size);r.outputEncoding=T.LinearEncoding;
 document.getElementById('view').appendChild(r.domElement);
 const target=new T.WebGLRenderTarget(size,size,{depthBuffer:true,stencilBuffer:true,minFilter:T.NearestFilter,magFilter:T.NearestFilter});
 const adapter=V.create({THREE:T,renderer:r,math:M});
 const status=document.getElementById('status'),report=document.getElementById('report');
 let result=null,actualSource=null,actualB=null,calibration=null,baselineScene=null,baselineCamera=null,flight=null,post=null;
 const displayScene=new T.Scene(),displayCamera=new T.OrthographicCamera(-1,1,1,-1,0,1),displayMaterial=new T.MeshBasicMaterial({map:target.texture,depthTest:false,depthWrite:false}),displayQuad=new T.Mesh(new T.PlaneGeometry(2,2),displayMaterial);displayScene.add(displayQuad);
 function postSize(w,h){
  if(!post){const source=actualSource.post;post={composite:source.composite.clone(),h:source.blurH.clone(),v:source.blurV.clone(),rtH:new T.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false}),rtV:new T.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false})};}
  const hw=Math.max(1,Math.floor(w/2)),hh=Math.max(1,Math.floor(h/2));post.rtH.setSize(hw,hh);post.rtV.setSize(hw,hh);post.h.uniforms.uTexel.value.set(1/hw,1/hh);post.v.uniforms.uTexel.value.set(1/hw,1/hh);post.composite.uniforms.uSize.value.set(w,h);post.composite.uniforms.uBoost.value=.50;
 }
 function present(output,bloom=false){if(output){if(bloom){if(!post)postSize(output.width,output.height);displayQuad.material=post.h;post.h.uniforms.tD.value=output.texture;r.setRenderTarget(post.rtH);r.render(displayScene,displayCamera);displayQuad.material=post.v;post.v.uniforms.tD.value=post.rtH.texture;r.setRenderTarget(post.rtV);r.render(displayScene,displayCamera);displayQuad.material=post.composite;post.composite.uniforms.tD.value=output.texture;post.composite.uniforms.tB.value=post.rtV.texture;}else{displayQuad.material=displayMaterial;displayMaterial.map=output.texture;}r.setRenderTarget(null);r.render(displayScene,displayCamera);}}
 const show=x=>{result=x;report.textContent=JSON.stringify(x,null,2);return x;};
 const caps={low:adapter.capabilities(null),high:adapter.capabilities(target)};
 function pixels(output){const a=new Uint8Array(size*size*4);if(output)r.readRenderTargetPixels(output,0,0,size,size,a);else r.getContext().readPixels(0,0,size,size,r.getContext().RGBA,r.getContext().UNSIGNED_BYTE,a);return a;}
 function plane(depth,scale,color,opacity,blending){
  const mesh=new T.Mesh(new T.PlaneGeometry(scale,scale),new T.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1,blending:blending||T.NormalBlending,side:T.DoubleSide}));
  mesh.position.z=-depth/1e6;return mesh;
 }
 function frame(eye=[0,0,0]){adapter.snapshot({origin:[0,0,0],eye,quaternion:[0,0,0,1],fov:60,aspect:1,width:size,height:size});}
 function compare(a,b){let different=0,maxError=0,interior=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const offset=(y*size+x)*4;let err=0;for(let c=0;c<3;c++)err=Math.max(err,Math.abs(a[offset+c]-b[offset+c]));if(err>2){different++;if(x>160&&x<352&&y>160&&y<352)interior++;}maxError=Math.max(maxError,err);}return {different,maxError,interior};}
 function disposeSources(items){items.forEach(e=>{e.source.geometry.dispose();e.source.material.dispose();});}
 function run(){
  stopFlight();
  status.textContent='Checking depth boundaries…';const checks=[];
  try{
   const output=document.getElementById('quality').value==='high'?target:null;
   const boundaries=M.SLICE_BOUNDS.slice(1,-1);
   for(const boundary of boundaries){
    for(const kind of ['opaque','alpha','additive','coplanar-alpha','coplanar-additive','crossing']){
     const d=boundary,items=[];
     const behind=plane(d*1.4,d*.9,0x123862,1);items.push({id:'background',source:behind,metresPerUnit:1});
     const additive=kind.includes('additive');
     const face=plane(d,d*.65,kind==='opaque'?0xef6e35:0x46db99,kind==='opaque'||kind==='crossing'?1:.4,additive?T.AdditiveBlending:T.NormalBlending);
     if(kind==='crossing')face.rotation.y=.6;
     items.push({id:'surface',source:face,metresPerUnit:1});
     if(kind.startsWith('coplanar'))items.push({id:'second-surface',source:plane(d,d*.65,0x46db99,.4,additive?T.AdditiveBlending:T.NormalBlending),metresPerUnit:1});
     adapter.setSource(items);
     // Camera traverses both sides and the exact logical boundary.
     for(const relative of [-.00015,-.00005,0,.00005,.00015]){
      frame([0,0,d*relative]);adapter.render({target:output});const sliced=pixels(output);
      adapter.render({target:output,reference:[d*.4,d*2]});const reference=pixels(output);
      const diff=compare(sliced,reference),center=(Math.floor(size/2)*size+Math.floor(size/2))*4;
      const visible=sliced[center]+sliced[center+1]+sliced[center+2]>15;
      let expected=kind==='opaque'?[239,110,53]:kind==='crossing'?[70,219,153]:[18,56,98];
      if(kind!=='opaque'&&kind!=='crossing')for(let layer=0;layer<(kind.startsWith('coplanar')?2:1);layer++)expected=expected.map((v,c)=>Math.min(255,v*(additive?1:.6)+[70,219,153][c]*.4));
      const actual=Array.from(sliced.slice(center,center+3)),colorCorrect=actual.every((v,c)=>Math.abs(v-expected[c])<=2);
      let raster=null,edgeEvidence=[];if(kind==='crossing'&&diff.different){const initial=ExpanseScaleRaster.compare(sliced,reference,size,size),camera=new T.PerspectiveCamera(60,1,.1,2e11);camera.position.set(0,0,d*relative);camera.updateMatrixWorld(true);const meshes=items.map(entry=>{const proxy=entry.source.clone(true);proxy.position.fromArray(M.relativeMetres(entry.source.position.toArray(),[0,0,0]));proxy.updateMatrixWorld(true);return proxy;}),edges=geometryEdges(initial.samples,meshes,camera);raster=ExpanseScaleRaster.compare(sliced,reference,size,size,edges.mask);edgeEvidence=edges.points;}
      checks.push({boundary,kind,relative,...diff,visible,actual,expected,colorCorrect,raster,edgeEvidence,pass:visible&&colorCorrect&&(diff.different===0||(kind==='crossing'&&raster.invalidDifferences===0))});
     }
     adapter.setSource([]);disposeSources(items);
    }
   }
   const source=new T.Mesh(new T.SphereGeometry(312/2,20,12),new T.MeshBasicMaterial({color:0xf7d78b}));source.position.set(1e8+.001,2,3);
   const original=source.position.toArray();adapter.setSource([{id:'source-vessel',source,metresPerUnit:1}]);
   adapter.snapshot({origin:[1e8,2,3],eye:[1000,0,1000],quaternion:[0,0,0,1],fov:60,aspect:1,width:size,height:size});
   const projected=adapter.projectAuthored(original),picked=adapter.pick([projected.x,projected.y]);
   checks.push({kind:'projection-picking-source-invariance',pass:projected.visible&&picked==='source-vessel'&&original.every((v,i)=>v===source.position.toArray()[i]),projected,picked});
   adapter.render({target:output});present(output);
   const meta={browser:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],canvas:[size,size],quality:output?'high-target':'low-canvas',antialias:r.getContext().getContextAttributes().antialias,samples:r.getContext().getParameter(r.getContext().SAMPLES),gpu:r.getContext().getParameter(r.getContext().RENDERER),caps,draw:adapter.diagnostics().drawStats};
   adapter.setSource([]);source.geometry.dispose();source.material.dispose();
   const failed=checks.filter(c=>!c.pass).length;status.textContent=failed?'Depth gate FAILED · see measurements':'Depth fixtures passed · full system gates pending';return show({passed:checks.length-failed,failed,checks,meta});
  }catch(error){status.textContent='Prototype paused · '+error.message;return show({passed:checks.filter(c=>c.pass).length,failed:1,error:error.stack,checks,caps});}
 }
 async function sourceAudit(){
  status.textContent='Loading exact source builders for isolated audit…';
  let iframe=document.querySelector('iframe');if(!iframe){iframe=document.createElement('iframe');iframe.src='./scale-source.html';document.body.appendChild(iframe);}
  try{
   await new Promise((resolve,reject)=>{const start=performance.now();const timer=setInterval(()=>{if(iframe.contentWindow.__scaleSource){clearInterval(timer);resolve();}else if(performance.now()-start>30000){clearInterval(timer);reject(Error('Source probe timeout'));}},100);});
   const source=iframe.contentWindow.__scaleSource,ship=source.ship;actualSource=source;
   const box=new T.Box3(),point=new T.Vector3(),inverse=new T.Matrix4();ship.updateWorldMatrix(true,true);inverse.copy(ship.matrixWorld).invert();let physical=0,effects=0,unknown=0;
   ship.traverse(o=>{if(!o.geometry)return;let parent=o,role;while(parent&&parent!==ship.parent){if(parent.userData.expanseRole){role=parent.userData.expanseRole;break;}parent=parent.parent;}if(role==='effect'){effects++;return;}if(role!=='physical'){unknown++;return;}
    physical++;const positions=o.geometry.attributes.position,matrix=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld);for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(matrix);box.expandByPoint(point);}
   });
   if(unknown||!physical)throw Error('Physical hull roles must be completely classified.');const raw=box.max.z-box.min.z,scale=M.hullScale(raw),B=actualB||source.build('karna-vex');actualB=B;calibration={scale,raw,bounds:{min:box.min.toArray().map(v=>v*scale),max:box.max.toArray().map(v=>v*scale)}};
   const inventory={objects:0,types:{},materials:{},customShaders:[],instances:0,worldBuffers:[]};
   B.scene.traverse(o=>{inventory.objects++;inventory.types[o.type]=(inventory.types[o.type]||0)+1;if(o.isInstancedMesh)inventory.instances++;if(o.material){const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>{inventory.materials[m.type]=(inventory.materials[m.type]||0)+1;if(m.isShaderMaterial)inventory.customShaders.push({type:m.type,vertex:m.vertexShader,fragment:m.fragmentShader});});}if(o.isPoints||o.isLineSegments)inventory.worldBuffers.push({type:o.type,positions:o.geometry.attributes.position.count});});
   const value={calibration:{physical,effects,unknown,rawExtent:raw,uniformMetresPerRawUnit:scale,normalizedLength:raw*scale,legacyOuterScale:ship.scale.toArray(),rawBounds:{min:box.min.toArray(),max:box.max.toArray()},reference:'312m working exterior; interior unchanged'},inventory};
   status.textContent='Source calibration measured · dimensional adapters pending';return show(value);
  }catch(error){status.textContent='Source audit stopped';return show({error:error.stack});}
 }
 async function actual(options={}){
  if(!options.keepFlight)stopFlight();
  try{
   if(!actualB)await sourceAudit();if(!actualB)throw Error('Source audit unavailable');
   actualSource.tick(actualB,0,0);
   const moon=actualB.bodyMap['mmicqui-nobara']||Object.values(actualB.bodyMap).find(b=>b.def.name.toLowerCase().includes('micqui'));
   if(!moon)throw Error('Actual Micqui-Nobara source body unavailable');
   const p=new T.Vector3();moon.group.getWorldPosition(p);
   const ship=actualSource.ship;ship.position.copy(p).add(new T.Vector3(0,0,45));ship.quaternion.identity();ship.updateMatrixWorld(true);
   const identities=new Map(Object.entries(actualB.bodyMap).map(([id,body])=>[body.group,id]));
   const entries=[{id:'system',source:actualB.scene,metresPerUnit:1e6,identities},{id:'ripley',source:ship,metresPerUnit:calibration.scale,ignoreRootScale:true}];
   adapter.setSource(options.shipOnly?entries.slice(1):entries);
   const origin=ship.position.toArray(),eye=[0,156,686.4],look=new T.Vector3(0,0,-1248),cam=new T.PerspectiveCamera(60,1,.1,2e11);cam.position.fromArray(eye);cam.lookAt(look);cam.updateMatrixWorld(true);
   adapter.snapshot({origin,eye,quaternion:cam.quaternion.toArray(),fov:60,aspect:1,width:size,height:size});
   const output=document.getElementById('quality').value==='high'?target:null,draw=adapter.render({target:output,reference:options.reference});const image=pixels(output);let brightPixels=0;for(let i=0;i<image.length;i+=4)if(Math.max(image[i],image[i+1],image[i+2])>80)brightPixels++;present(output,!!output);
   const hull=adapter.diagnostics().physicalBoxes.find(x=>x.id==='ripley');
   const value={calibration:{...calibration,length:hull.max[2]-hull.min[2]},moon:{id:moon.def.id,radius:moon.def.radius,authoredPosition:p.toArray()},shipAuthoredPosition:ship.position.toArray(),shipProjected:adapter.projectAuthored(ship.position.toArray()),brightPixels,draw,diagnostics:adapter.diagnostics()};
   status.textContent='Actual Ripley · 312 m working length · nominal compressed system · flight integration pending';return show(value);
  }catch(error){status.textContent='Actual-source gate paused · '+error.message;return show({failed:1,error:error.stack});}
 }
 const held=new Set(),physicalHeld=new Set(),moveCodes=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE']),flightStatus=document.getElementById('flight-status'),locator=document.getElementById('locator');
 let touchMove=[0,0],physicalTouch=[0,0],inputUnknown=false;
 let brakeHeld=false,pointer=null;
 function stopFlight(){if(flight){flight.running=false;flight.state=F.reset(flight.state);flight=null;}held.clear();touchMove=[0,0];brakeHeld=false;pointer=null;locator.style.display='none';document.getElementById('flight').textContent='Start flight proof';['regime','brake','camera'].forEach(id=>document.getElementById(id).disabled=true);}
 // Command resets are not physical releases. Retain tracked holds across resets;
 // focus/capture loss makes their neutral state unknown until a release is observed.
 function clearFlight(markUnknown=true){if(markUnknown!==false)inputUnknown=true;if(!flight)return;if(flight.transition){flight.current=flight.transition.from;flight.transition=null;}flight.state=F.reset(flight.state);held.clear();touchMove=[0,0];brakeHeld=false;pointer=null;}
 function vectorInput(){const v=new T.Vector3(Number(held.has('KeyD'))-Number(held.has('KeyA'))+touchMove[0],Number(held.has('KeyE'))-Number(held.has('KeyQ')),Number(held.has('KeyS'))-Number(held.has('KeyW'))+touchMove[1]);v.applyQuaternion(actualSource.ship.quaternion);return v.toArray();}
 function observe(fresh,repeat,neutral){if(flight&&flight.running)flight.state=F.observeInput(flight.state,vectorInput(),{fresh,repeat,neutral});}
 function allPhysicalReleased(){return ![...physicalHeld].some(code=>moveCodes.has(code))&&Math.hypot(...physicalTouch)===0;}
 function physicalNeutral(){return !inputUnknown&&allPhysicalReleased();}
 function clearance(){const out=[],p=actualSource.ship.position;Object.values(actualB.bodyMap).forEach(body=>{let radius=body.def.radius;if(body.def.kind==='bh'&&!(radius>0))radius=actualB.blackhole&&actualB.blackhole.r;if(!Number.isFinite(radius)||radius<=0){out.push(NaN);return;}const c=new T.Vector3();body.group.getWorldPosition(c);out.push(p.distanceTo(c)-radius);});return out;}
 function selectRegime(){if(!flight||!flight.running||flight.transition)return;const available=M.cruiseAvailable(flight.state.available,clearance());flight.state=F.selectRegime(flight.state,flight.state.regime==='cruise'?'maneuver':'cruise',available);if(physicalNeutral())observe(false,false,true);}
 function endpoint(mode){const camera=new T.PerspectiveCamera(60,1,.1,2e11),offset=mode==='chase'?new T.Vector3(0,156,686.4).multiplyScalar(flight.zoom).applyQuaternion(flight.rig):new T.Vector3(0,.25,1).normalize().multiplyScalar(flight.orbitR*1e6).applyQuaternion(new T.Quaternion().setFromEuler(new T.Euler(flight.lookY,flight.lookX,0,'YXZ')));if(mode==='chase'){let radius=0;const b=calibration.bounds;for(let mask=0;mask<8;mask++)radius=Math.max(radius,Math.hypot(mask&1?b.max[0]:b.min[0],mask&2?b.max[1]:b.min[1],mask&4?b.max[2]:b.min[2]));if(offset.length()<radius+10)offset.setLength(radius+10);}const target=mode==='chase'?new T.Vector3(0,0,-1248).applyQuaternion(actualSource.ship.quaternion):new T.Vector3();camera.position.copy(offset);camera.lookAt(target);camera.updateMatrixWorld(true);return {eye:offset,quaternion:camera.quaternion.clone()};}
 function nav(){return {position:actualSource.ship.position.toArray(),heading:actualSource.ship.quaternion.toArray(),phases:actualB.anim.orbiters.map(o=>o.ang)};}
 function switchView(){if(!flight||!flight.running||flight.transition)return;const to=flight.mode==='chase'?'overview':'chase';flight.state=F.reset(flight.state);held.clear();touchMove=[0,0];brakeHeld=false;pointer=null;flight.transition={t:0,from:flight.current,to:endpoint(to),endpoint:to,before:nav()};}
 function drawFlight(dt){
  const ship=actualSource.ship;
  const transitioning=!!flight.transition;
  if(!flight.transition){
   flight.yaw+=(Number(held.has('ArrowLeft'))-Number(held.has('ArrowRight')))*.7*dt;flight.pitch=T.MathUtils.clamp(flight.pitch+(Number(held.has('ArrowUp'))-Number(held.has('ArrowDown')))*.5*dt,-1.1,1.1);ship.quaternion.setFromEuler(new T.Euler(flight.pitch,flight.yaw,0,'YXZ'));
   if([...held].some(code=>moveCodes.has(code))||Math.hypot(...touchMove)>0)observe(false,false,false);
   const available=M.cruiseAvailable(flight.state.available,clearance());flight.state=F.step(flight.state,dt,{brake:brakeHeld||held.has('Space'),boost:held.has('ShiftLeft')||held.has('ShiftRight'),available});ship.position.addScaledVector(new T.Vector3().fromArray(flight.state.velocity),dt);flight.elapsed+=dt;
   const rigTarget=ship.quaternion.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(flight.lookY,flight.lookX,0,'YXZ')));flight.rig.slerp(rigTarget,1-Math.exp(-7*dt));flight.current=endpoint(flight.mode);
  }else{
   const tr=flight.transition;tr.t+=dt;const a=Math.min(1,tr.t/.8),from=tr.from.eye,to=tr.to.eye,qa=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),from.clone().normalize()),qb=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),to.clone().normalize());qa.slerp(qb,a);
   flight.current={eye:new T.Vector3(0,0,1).applyQuaternion(qa).multiplyScalar(Math.exp(Math.log(from.length())*(1-a)+Math.log(to.length())*a)),quaternion:tr.from.quaternion.clone().slerp(tr.to.quaternion,a)};if(a===1){flight.mode=tr.endpoint;flight.history.push({before:tr.before,after:nav()});if(flight.history.length>64)flight.history.shift();flight.transition=null;if(physicalNeutral())observe(false,false,true);}
  }
  actualSource.tick(actualB,dt,performance.now()/1000,transitioning);
  ship.updateMatrixWorld(true);
  const speed=Math.hypot(...flight.state.velocity),profile=F.PROFILES[flight.state.regime],demand=flight.state.armed?Math.hypot(...flight.state.input):0;
  ship.userData.engines.forEach((sprite,i)=>{sprite.material.opacity=(i%2?.25+.65*demand:.5+.4*speed/profile.maxSpeed);});
  if(ship.userData.driveLight)ship.userData.driveLight.intensity=.7+.6*demand+.2*speed/profile.maxSpeed;
  const cssSize=r.domElement.getBoundingClientRect().width,camera=new T.PerspectiveCamera(60,1,.1,2e11);camera.position.copy(flight.current.eye);camera.quaternion.copy(flight.current.quaternion);camera.updateMatrixWorld(true);const projected=M.projectEye(new T.Vector3().applyMatrix4(camera.matrixWorldInverse).toArray(),60,1,cssSize,cssSize),box=calibration.bounds;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let mask=0;mask<8;mask++){const v=new T.Vector3(mask&1?box.max[0]:box.min[0],mask&2?box.max[1]:box.min[1],mask&4?box.max[2]:box.min[2]).applyQuaternion(ship.quaternion).applyMatrix4(camera.matrixWorldInverse),p=M.projectEye(v.toArray(),60,1,cssSize,cssSize);if(p.depth>0){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}}
  const pixelsWide=Number.isFinite(minX)?Math.max(maxX-minX,maxY-minY):0;
  flight.hullVisible=M.markerState(flight.hullVisible,pixelsWide);const goal=flight.hullVisible?1:0;flight.alpha=T.MathUtils.clamp(flight.alpha+Math.sign(goal-flight.alpha)*dt/.2,0,1);
  adapter.snapshot({origin:ship.position.toArray(),eye:flight.current.eye.toArray(),quaternion:flight.current.quaternion.toArray(),fov:60,aspect:1,width:cssSize,height:cssSize,hullAlpha:flight.alpha});
  const output=document.getElementById('quality').value==='high'?target:null;adapter.render({target:output});present(output,!!output);
  locator.style.display=projected.visible&&flight.alpha<1?'block':'none';locator.style.left=projected.x+'px';locator.style.top=projected.y+'px';locator.style.opacity=1-flight.alpha;
  const regime=document.getElementById('regime');regime.textContent=flight.state.slowing?'Slowing':flight.state.regime==='cruise'?'Cruise':'Maneuver';regime.setAttribute('aria-pressed',String(flight.state.regime==='cruise'));regime.disabled=!!flight.transition||(flight.state.regime==='maneuver'&&!flight.state.available);
  const c=clearance(),nearest=Math.min(...c),warning=flight.state.regime==='cruise'&&nearest<M.stoppingDistance(speed)?' · Approaching stopping envelope':'';
  const line=M.formatSpeed(speed)+' · '+(flight.transition?'Changing view':flight.mode)+' · '+(flight.state.needsNeutral?'Release thrust, then press afresh':flight.state.armed?'Thrust active':'Ready for fresh thrust')+warning+' · nominal compressed distances';if(flightStatus.textContent!==line)flightStatus.textContent=line;
  const moon=actualB.bodyMap['mmicqui-nobara'],moonPosition=new T.Vector3();moon.group.getWorldPosition(moonPosition);const plane=adapter.projectAuthored(moonPosition.toArray()),ruler=plane.visible?M.rulerLength(plane.depth*2*Math.tan(Math.PI/6)/cssSize):null,copy=document.getElementById('scale-copy'),rule=document.getElementById('scale-rule');
  const description='Micqui-Nobara · nominal diameter '+Math.round(2*moon.def.radius*1e6/312).toLocaleString('en-US')+' hull lengths · '+(ruler?(ruler.metres/1000).toLocaleString('en-US')+' km at its center plane':'ruler unavailable for this view');if(copy.textContent!==description)copy.textContent=description;rule.style.display=ruler?'block':'none';if(ruler)rule.style.width=ruler.pixels+'px';
 }
 function animateFlight(own){let last=performance.now();function frame(now){if(flight!==own||!own.running)return;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;try{drawFlight(dt);}catch(error){clearFlight();own.running=false;document.getElementById('flight').textContent='Resume flight proof';status.textContent='Flight proof paused · '+error.message;return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);}
 async function startFlight(){if(flight){if(flight.running){stopFlight();return;}if(!flight.contextReady){status.textContent='Graphics context unavailable · progress remains paused';return;}clearFlight(false);flight.running=true;if(physicalNeutral())observe(false,false,true);flight.current=endpoint(flight.mode);document.getElementById('flight').textContent='Stop flight proof';animateFlight(flight);return;}const proof=await actual();if(!actualB||proof.error)return;flight={running:true,contextReady:true,state:F.createState(),mode:'chase',transition:null,history:[],zoom:1,orbitR:90,rig:new T.Quaternion(),yaw:0,pitch:0,lookX:0,lookY:0,elapsed:0,hullVisible:true,alpha:1,current:null};if(physicalNeutral())observe(false,false,true);flight.current=endpoint('chase');document.getElementById('flight').textContent='Stop flight proof';['brake','camera'].forEach(id=>document.getElementById(id).disabled=false);animateFlight(flight);}
 document.getElementById('flight').onclick=startFlight;document.getElementById('regime').onclick=selectRegime;document.getElementById('camera').onclick=switchView;
 const brake=document.getElementById('brake');brake.onpointerdown=e=>{if(!flight||!flight.running)return;brakeHeld=true;brake.setPointerCapture(e.pointerId);};brake.onpointerup=brake.onpointercancel=()=>{brakeHeld=false;};
 addEventListener('keydown',e=>{if(moveCodes.has(e.code))physicalHeld.add(e.code);if(!flight||!flight.running||e.defaultPrevented||e.altKey||e.metaKey||e.ctrlKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||e.repeat)return;if(e.code==='KeyV'){e.preventDefault();selectRegime();return;}if(e.code==='KeyC'){e.preventDefault();switchView();return;}if(moveCodes.has(e.code)||e.code.startsWith('Arrow')||['Space','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();physicalHeld.add(e.code);if(flight.transition){if(moveCodes.has(e.code))observe(false,false,false);return;}held.add(e.code);if(moveCodes.has(e.code))observe(true,false,false);}});
 addEventListener('keyup',e=>{physicalHeld.delete(e.code);if(moveCodes.has(e.code)&&allPhysicalReleased())inputUnknown=false;if(!flight)return;held.delete(e.code);if(moveCodes.has(e.code))observe(false,false,physicalNeutral());});
 r.domElement.addEventListener('pointerdown',e=>{if(!flight||!flight.running||flight.transition)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};r.domElement.setPointerCapture(e.pointerId);});r.domElement.addEventListener('pointermove',e=>{if(!flight||!flight.running||flight.transition||!pointer||e.pointerId!==pointer.id)return;flight.lookX-=(e.clientX-pointer.x)*.004;flight.lookY=T.MathUtils.clamp(flight.lookY-(e.clientY-pointer.y)*.004,-1,1);pointer.x=e.clientX;pointer.y=e.clientY;});r.domElement.addEventListener('pointerup',()=>{pointer=null;});r.domElement.addEventListener('pointercancel',clearFlight);
 r.domElement.addEventListener('wheel',e=>{if(!flight||!flight.running||flight.transition)return;e.preventDefault();if(flight.mode==='overview')flight.orbitR=T.MathUtils.clamp(flight.orbitR*Math.exp(e.deltaY*.001),1.5,900);else flight.zoom=T.MathUtils.clamp(flight.zoom*Math.exp(e.deltaY*.001),.45,4);},{passive:false});
 const stick=document.getElementById('move-stick');let stickPointer=null;
 function moveStick(e){if(stickPointer!==e.pointerId)return;e.stopPropagation();const box=stick.getBoundingClientRect(),old=Math.hypot(...physicalTouch);physicalTouch=[T.MathUtils.clamp((e.clientX-box.left-box.width/2)/40,-1,1),T.MathUtils.clamp((e.clientY-box.top-box.height/2)/40,-1,1)];if(Math.hypot(...physicalTouch)<.12)physicalTouch=[0,0];if(allPhysicalReleased())inputUnknown=false;if(!flight||!flight.running)return;if(flight.transition){observe(false,false,physicalNeutral());return;}touchMove=physicalTouch.slice();observe(old===0&&Math.hypot(...touchMove)>0,false,physicalNeutral());}
 stick.onpointerdown=e=>{stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);};stick.onpointermove=moveStick;stick.onpointerup=e=>{if(stickPointer!==e.pointerId)return;stickPointer=null;touchMove=[0,0];physicalTouch=[0,0];if(allPhysicalReleased())inputUnknown=false;if(flight)observe(false,false,physicalNeutral());};stick.onpointercancel=()=>{stickPointer=null;physicalTouch=[0,0];clearFlight();};
 let contextExtension=null;
 addEventListener('blur',clearFlight);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearFlight();});r.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(flight){const before=nav();clearFlight();flight.running=false;flight.contextReady=false;flight.contextRecovery={before,after:nav(),mode:flight.mode};document.getElementById('flight').textContent='Resume flight proof';}status.textContent='Context lost · prototype progress paused; live save untouched';});
 r.domElement.addEventListener('webglcontextrestored',()=>{try{const errors=adapter.capabilities(null).errors.concat(adapter.capabilities(target).errors);if(errors.length)throw Error(errors.join(' '));if(flight)flight.contextReady=true;status.textContent='Graphics restored · Resume retains stationary Maneuver and the previous view';}catch(error){status.textContent='Graphics unavailable · '+error.message;}});
 async function benchmark(options={}){
  const proof=await actual();if(proof.error)throw Error(proof.error);const ship=actualSource.ship,origin=ship.position.toArray(),eye=[0,22.5e6,90e6],camera=new T.PerspectiveCamera(60,1,.4,200000);camera.position.copy(ship.position).add(new T.Vector3(0,22.5,90));camera.lookAt(ship.position);camera.updateMatrixWorld(true);
  if(baselineScene)baselineScene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});baselineScene=actualB.scene.clone(true);const baselineShip=ship.clone(true);baselineScene.add(baselineShip);baselineCamera=camera;const baselineMap=new Map();function mapBaseline(source,proxy){baselineMap.set(source,proxy);source.children.forEach((child,i)=>mapBaseline(child,proxy.children[i]));}mapBaseline(actualB.scene,baselineScene);mapBaseline(ship,baselineShip);baselineMap.forEach((proxy,source)=>{if(source.isDirectionalLight)proxy.target=baselineMap.get(source.target);});
  const prototypeCamera=new T.PerspectiveCamera(60,1,.1,2e11);prototypeCamera.position.fromArray(eye);prototypeCamera.lookAt(0,0,0);prototypeCamera.updateMatrixWorld(true);adapter.snapshot({origin,eye,quaternion:prototypeCamera.quaternion.toArray(),fov:60,aspect:1,width:size,height:size});
  const width=options.width||size,height=options.height||size,aspect=width/height,high=options.quality==='high';r.setSize(width,height,false);target.setSize(width,height);if(high)postSize(width,height);camera.aspect=aspect;camera.updateProjectionMatrix();adapter.snapshot({origin,eye,quaternion:prototypeCamera.quaternion.toArray(),fov:60,aspect,width,height});const baselineTarget=high?new T.WebGLRenderTarget(width,height):null;
  const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),runs=[],route=[],phaseStart=actualB.anim.orbiters.map(o=>o.ang);let control=F.createState();control=F.selectRegime(control,'cruise',true);control=F.observeInput(control,[0,0,0],{neutral:true});control=F.observeInput(control,[0,0,-1],{fresh:true});let routeTime=0,travel=0;while(travel<27){route.push({time:routeTime,travel});control=F.step(control,.05,{});travel-=control.velocity[2]*.05;routeTime+=.05;}route.push({time:routeTime,travel});
  function syncBaseline(source,proxy){proxy.position.copy(source.position);proxy.quaternion.copy(source.quaternion);proxy.scale.copy(source.scale);source.children.forEach((child,i)=>syncBaseline(child,proxy.children[i]));}
  try{for(const mode of ['baseline','prototype','baseline','prototype']){
   const frameTimes=[],costs=[],counts=[];let prior=null;
   for(let i=0;i<145;i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));const now=performance.now();if(i>=25&&prior!==null)frameTimes.push(now-prior);prior=now;
    const start=performance.now();if(options.route){const sample=route[Math.floor(i/144*(route.length-1))];actualB.anim.orbiters.forEach((o,j)=>o.ang=phaseStart[j]+o.speed*sample.time*1e-6);actualSource.tick(actualB,0,sample.time);ship.position.fromArray(origin);ship.position.z-=sample.travel;camera.position.copy(ship.position).add(new T.Vector3(0,22.5,90));camera.lookAt(ship.position);}
    let calls;if(mode==='baseline'){if(options.route){syncBaseline(actualB.scene,baselineScene);baselineShip.position.copy(ship.position);baselineShip.quaternion.copy(ship.quaternion);}r.setRenderTarget(baselineTarget);r.autoClear=true;r.render(baselineScene,baselineCamera);calls=r.info.render.calls;if(high)present(baselineTarget,true);}else{if(options.route)adapter.snapshot({origin:ship.position.toArray(),eye,quaternion:prototypeCamera.quaternion.toArray(),fov:60,aspect,width,height});const draw=adapter.render({target:high?target:null});calls=draw.draws.reduce((n,b)=>n+b.calls,0)+(draw.backdropCalls||0);if(high)present(target,true);}gl.finish();if(i>=25){costs.push(performance.now()-start);counts.push(calls+(high?3:0));}
   }
   const q=(a,p)=>a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];runs.push({mode,frames:frameTimes.length,frameP50:q(frameTimes,.5),frameP95:q(frameTimes,.95),renderP50:q(costs,.5),renderP95:q(costs,.95),draws:counts[0],resources:{...r.info.memory},programs:r.info.programs.length});
  }}finally{r.setRenderTarget(null);if(baselineTarget)baselineTarget.dispose();r.setSize(size,size,false);target.setSize(size,size);if(post)postSize(size,size);}
  const baseline=runs.filter(v=>v.mode==='baseline'),prototype=runs.filter(v=>v.mode==='prototype'),baselineP95=Math.max(...baseline.map(v=>v.frameP95)),prototypeP95=Math.max(...prototype.map(v=>v.frameP95));
  return show({runs,baselineP95,prototypeP95,ratio:prototypeP95/baselineP95,withinTenPercent:prototypeP95<=baselineP95*1.10,absoluteLowThirtyFps:prototypeP95<=1000/30,absoluteDesktopSixtyFps:prototypeP95<=1000/60,profile:{browser:navigator.userAgent,dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],canvas:[width,height],gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),quality:high?'high bloom once after world':'low direct',scene:'original assets; matched overview eye/pose/phases/FOV',route:options.route?'same authored Cruise approach replay with advancing registered phases and full proxy updates':'fixed pose and phases',sampling:'two alternating120-frame runs each,25warm, gl.finish instrumentation',limits:'Recorded local Chromium desktop profile; emulation does not establish phone GPU performance'}});
 }
 async function stateProof(){
  stopFlight();const checks=[],check=(name,pass,detail)=>checks.push({name,pass,detail});
  const source=plane(500,300,0xff6644,1);adapter.setSource([{id:'fixture',source,metresPerUnit:1}]);frame();
  const other=new T.WebGLRenderTarget(32,32,{depthBuffer:true,stencilBuffer:true}),noDepth=new T.WebGLRenderTarget(32,32,{depthBuffer:false,stencilBuffer:false}),gl=r.getContext();
  const saved={viewport:target.viewport.clone(),scissor:target.scissor.clone(),test:target.scissorTest};
  target.viewport.set(11,12,128,96);target.scissor.set(7,8,90,70);target.scissorTest=true;r.setRenderTarget(target);
  function current(){return {viewport:Array.from(gl.getParameter(gl.VIEWPORT)),currentViewport:r.getCurrentViewport(new T.Vector4()).toArray(),canvasViewport:r.getViewport(new T.Vector4()).toArray(),scissor:Array.from(gl.getParameter(gl.SCISSOR_BOX)),test:gl.isEnabled(gl.SCISSOR_TEST),canvasTest:r.getScissorTest(),bound:r.getRenderTarget()===target,autoClear:r.autoClear,color:r.getClearColor(new T.Color()).getHex(),alpha:r.getClearAlpha()};}
  const before=current();
  try{
   adapter.capabilities(other);check('capability probe restores active target viewport/scissor without changing canvas preferences',JSON.stringify(current())===JSON.stringify(before),{before,after:current()});
   adapter.render({target:other});check('successful draw restores target and full renderer state',JSON.stringify(current())===JSON.stringify(before),{before,after:current()});
   let refused=false;try{adapter.render({target:noDepth});}catch(error){refused=/24 depth/.test(error.message);}check('unsupported depth rejects and restores active state',refused&&JSON.stringify(current())===JSON.stringify(before),current());
   const fault=new T.Scene();fault.onBeforeRender=()=>{throw Error('intentional fixture failure');};let failed=false;try{adapter.render({target:other,backdrop:fault});}catch(error){failed=error.message==='intentional fixture failure';}check('mid-render failure restores active state',failed&&JSON.stringify(current())===JSON.stringify(before),current());
  }finally{target.viewport.copy(saved.viewport);target.scissor.copy(saved.scissor);target.scissorTest=saved.test;r.setRenderTarget(null);other.dispose();noDepth.dispose();adapter.setSource([]);source.geometry.dispose();source.material.dispose();}
  for(const kind of ['light','instances','history','backdrop']){
   const world=new T.Scene(),hidden=new T.Group();hidden.visible=false;world.add(hidden);let receiving=null,object;
   if(kind==='light'){hidden.add(new T.AmbientLight(0xffffff,1));receiving=new T.Mesh(new T.PlaneGeometry(.0005,.0005),new T.MeshLambertMaterial({color:0xffffff}));receiving.position.z=-.0005;world.add(receiving);}
   else if(kind==='instances'){object=new T.InstancedMesh(new T.PlaneGeometry(.0005,.0005),new T.MeshBasicMaterial({color:0xff0000}),1);const matrix=new T.Matrix4().makeTranslation(0,0,-.0005);object.setMatrixAt(0,matrix);object.userData.expanseMatrices=[matrix.elements.slice()];hidden.add(object);}
   else if(kind==='history'){object=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,-.0005],3)),new T.PointsMaterial({color:0xff0000,size:.0002,sizeAttenuation:true}));object.userData.expanseHistory=[[0,0,-.0005]];hidden.add(object);}
   else{object=new T.Mesh(new T.PlaneGeometry(.0005,.0005),new T.MeshBasicMaterial({color:0xff0000}));object.position.z=-.0005;object.userData.expanseRole='backdrop';hidden.add(object);}
   adapter.setSource([{id:'visibility-fixture',source:world,metresPerUnit:1e6}]);frame();adapter.render({target});let image=pixels(target),offset=(size/2*size+size/2)*4,hiddenColor=Array.from(image.slice(offset,offset+3));hidden.visible=true;frame();adapter.render({target});image=pixels(target);const shownColor=Array.from(image.slice(offset,offset+3));check('detached '+kind+' respects authored ancestors on hide and reveal',Math.max(...hiddenColor)<10&&Math.max(...shownColor)>100,{hiddenColor,shownColor});adapter.setSource([]);world.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  }
  const light=new T.DirectionalLight(0xffffff,1),destination=new T.Object3D(),surface=new T.Mesh(new T.PlaneGeometry(.0005,.0005),new T.MeshLambertMaterial({color:0xffffff}));light.position.set(10,0,0);destination.position.set(10,0,-1);light.target=destination;surface.position.set(10,0,-.0005);adapter.setSource([{id:'sun',source:light,metresPerUnit:1e6},{id:'target',source:destination,metresPerUnit:1e6},{id:'surface',source:surface,metresPerUnit:1e6}]);adapter.snapshot({origin:[10,0,0],eye:[0,0,0],quaternion:[0,0,0,1],fov:60,aspect:1,width:size,height:size});adapter.render({target});const lightImage=pixels(target),lightOffset=(size/2*size+size/2)*4,lightColor=Array.from(lightImage.slice(lightOffset,lightOffset+3));check('standalone directional light uses registered target in observer-relative metres',Math.min(...lightColor)>240,lightColor);adapter.setSource([]);surface.geometry.dispose();surface.material.dispose();
  return show({passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks});
 }
 async function residencyProof(){
  stopFlight();document.getElementById('quality').value='high';await actual();const baseline={...r.info.memory,programs:r.info.programs.length},cycles=[];let borrowedDisposals=0;const borrowed=new Set();
  [actualSource.ship,actualB.scene].forEach(root=>root.traverse(o=>{if(o.geometry)borrowed.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>Object.values(m).forEach(v=>{if(v&&v.isTexture)borrowed.add(v);}));}));const disposed=()=>borrowedDisposals++;borrowed.forEach(a=>a.addEventListener('dispose',disposed));
  try{for(let i=0;i<10;i++){document.getElementById('quality').value=i%2?'high':'low';const value=await actual();if(value.error)throw Error(value.error);const stats={...r.info.memory,programs:r.info.programs.length};cycles.push({cycle:i+1,...stats,pass:stats.geometries<=baseline.geometries&&stats.textures<=baseline.textures&&stats.programs<=baseline.programs});}}
  finally{borrowed.forEach(a=>a.removeEventListener('dispose',disposed));}
  const stable=cycles.every(c=>c.pass)&&borrowedDisposals===0;return show({passed:Number(stable),failed:Number(!stable),baseline,cycles,borrowedDisposals,activeDetailedSystems:1,ownedTargets:post?3:1});
 }
 async function hullOcclusionProof(){
  await actual();const checks=[],ship=actualSource.ship,oldPosition=ship.position.clone(),oldHeading=ship.quaternion.clone();ship.position.set(0,0,0);ship.quaternion.identity();
  const ambient=new T.AmbientLight(0xffffff,.8),eye=[0,156,686.4],cam=new T.PerspectiveCamera(60,1,.1,2e11);cam.position.fromArray(eye);cam.lookAt(0,0,-1248);cam.updateMatrixWorld(true);
  try{for(const quality of ['low','high'])for(const depth of [80,400,980,1500]){
   const body=plane(1,depth*3,0x123862,1),front=depth<500;if(front)body.material.color.setHex(0xef6e35);body.quaternion.copy(cam.quaternion);const position=new T.Vector3(0,0,-depth).applyQuaternion(cam.quaternion).add(cam.position);body.position.copy(position).multiplyScalar(1e-6);
   adapter.setSource([{id:'ripley',source:ship,metresPerUnit:calibration.scale,ignoreRootScale:true},{id:'ambient',source:ambient,metresPerUnit:1},{id:'body',source:body,metresPerUnit:1}]);adapter.snapshot({origin:[0,0,0],eye,quaternion:cam.quaternion.toArray(),fov:60,aspect:1,width:size,height:size});const output=quality==='high'?target:null;adapter.render({target:output});const sliced=pixels(output);adapter.render({target:output,reference:[10,2000]});const reference=pixels(output),diff=compare(sliced,reference),raster=ExpanseScaleRaster.compare(sliced,reference,size,size);let foreground=0,bodyPixels=0;for(let i=0;i<sliced.length;i+=4){const expected=front?[239,110,53]:[18,56,98],equal=expected.every((v,c)=>Math.abs(sliced[i+c]-v)<=2);if(equal)bodyPixels++;else foreground++;}
   const edgeEvidence=hullGeometryEdges(raster.samples,ship,cam),qualified=ExpanseScaleRaster.compare(sliced,reference,size,size,edgeEvidence.mask);
   checks.push({quality,depth,front,...diff,foreground,bodyPixels,raster:qualified,edgeEvidence:edgeEvidence.points,pass:qualified.invalidDifferences===0&&(front?bodyPixels===size*size:foreground>1000&&bodyPixels>1000)});adapter.setSource([]);body.geometry.dispose();body.material.dispose();
  }}finally{adapter.setSource([]);ship.position.copy(oldPosition);ship.quaternion.copy(oldHeading);}
  return show({passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks});
 }
 function hullGeometryEdges(points,ship,camera){
  const mask=new Uint8Array(size*size),out=[];if(!points.length)return {mask,points:out};const clone=ship.clone(true);clone.scale.setScalar(calibration.scale);clone.updateMatrixWorld(true);const meshes=[];
  clone.traverse(o=>{let role=null;for(let p=o;p;p=p.parent)if(p.userData.expanseRole){role=p.userData.expanseRole;break;}if(o.isMesh&&role==='physical'&&(Array.isArray(o.material)?o.material:[o.material]).every(m=>!m.transparent))meshes.push(o);});
  return geometryEdges(points,meshes,camera);
 }
 function geometryEdges(points,meshes,camera){
  const mask=new Uint8Array(size*size),out=[];if(!points.length)return {mask,points:out};
  const ray=new T.Raycaster();function surface(x,y){ray.setFromCamera(new T.Vector2((x+.5)/size*2-1,(y+.5)/size*2-1),camera);const hits=ray.intersectObjects(meshes,false),hit=hits[0];if(!hit)return {id:'background',coNearest:[],normal:null};const ids=ExpanseScaleRaster.coNearestIDs(hits.map(h=>({id:h.object.uuid,distance:h.distance}))),normal=hit.face.normal.clone(),attribute=hit.object.geometry.attributes.normal;
   if(attribute&&!hit.object.material.flatShading){const position=hit.object.geometry.attributes.position,local=hit.object.worldToLocal(hit.point.clone()),a=new T.Vector3().fromBufferAttribute(position,hit.face.a),b=new T.Vector3().fromBufferAttribute(position,hit.face.b),c=new T.Vector3().fromBufferAttribute(position,hit.face.c),weights=T.Triangle.getBarycoord(local,a,b,c,new T.Vector3());normal.fromBufferAttribute(attribute,hit.face.a).multiplyScalar(weights.x).addScaledVector(new T.Vector3().fromBufferAttribute(attribute,hit.face.b),weights.y).addScaledVector(new T.Vector3().fromBufferAttribute(attribute,hit.face.c),weights.z);}
   // Equal-depth opaque surfaces have no unique nearest ID. Compare the whole
   // co-nearest set so an overlapping part's real silhouette is not hidden by
   // Raycaster traversal order. Coplanar interiors retain the same set.
   normal.applyMatrix3(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();return {id:JSON.stringify(ids),coNearest:ids,normal:normal.toArray()};}
  for(const point of points){const center=surface(point.x,point.y),nearby=[];let edge=false;for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-Math.SQRT1_2,-Math.SQRT1_2],[Math.SQRT1_2,-Math.SQRT1_2],[-Math.SQRT1_2,Math.SQRT1_2],[Math.SQRT1_2,Math.SQRT1_2]]){const s=surface(point.x+dx,point.y+dy);nearby.push(s);if(s.id!==center.id)edge=true;}if(edge)mask[point.y*size+point.x]=1;out.push({x:point.x,y:point.y,edge,center,nearby});}
  return {mask,points:out};
 }
 document.getElementById('run').onclick=run;document.getElementById('source').onclick=sourceAudit;document.getElementById('actual').onclick=actual;
 function inspect(){const gl=r.getContext();return r.info.programs.map(p=>{const value={};['uExpanseNear','uExpanseFar','uExpanseLast','modelViewMatrix','projectionMatrix','opacity','diffuse'].forEach(name=>{const loc=gl.getUniformLocation(p.program,name);if(loc!==null){const v=gl.getUniform(p.program,loc);value[name]=ArrayBuffer.isView(v)?Array.from(v):v;}});return value;});}
 function flightSample(){if(!flight)return null;const moon=actualB.bodyMap['mmicqui-nobara'],p=new T.Vector3();moon.group.getWorldPosition(p);return {...nav(),state:flight.state,running:flight.running,contextReady:flight.contextReady,contextRecovery:flight.contextRecovery,elapsed:flight.elapsed,mode:flight.mode,zoom:flight.zoom,orbitR:flight.orbitR,transition:!!flight.transition,history:flight.history,eye:flight.current.eye.toArray(),eyeRadius:flight.current.eye.length(),hullAlpha:flight.alpha,look:[flight.lookX,flight.lookY],moonClearance:actualSource.ship.position.distanceTo(p)-moon.def.radius,rendererMemory:{...r.info.memory,programs:r.info.programs.length}};}
 function requestContextLoss(){contextExtension=r.getContext().getExtension('WEBGL_lose_context');if(!contextExtension)return false;contextExtension.loseContext();return true;}
 window.__scalePrototype={run,sourceAudit,actual,stateProof,residencyProof,hullOcclusionProof,benchmark,inspect,flightSample,requestContextLoss,requestContextRestore:()=>contextExtension&&contextExtension.restoreContext(),caps,result:()=>result};const unavailable=caps.low.errors.concat(caps.high.errors);status.textContent=unavailable.length?'Prototype paused · '+unavailable.join(' '):'Ready · fixtures are separate from the released application';if(unavailable.length)['run','actual','flight'].forEach(id=>document.getElementById(id).disabled=true);show({caps});
})();
