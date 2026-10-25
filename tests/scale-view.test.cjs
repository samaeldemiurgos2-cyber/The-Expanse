const test=require('node:test'),assert=require('node:assert/strict');
const View=require('../assets/scale-view.js');
test('slice ownership is explicit highp and follows the complete instance transform',()=>{
 const shader={vertexShader:'void main(){\n#include <project_vertex>\n}',fragmentShader:'void main(){ gl_FragColor=vec4(1.); }',uniforms:{}};
 const bounds={near:{value:10},far:{value:1000},last:{value:0}};
 View.patchShader(shader,bounds);
 assert.ok(shader.vertexShader.indexOf('vExpanseDepth = -mvPosition.z')>shader.vertexShader.indexOf('#include <project_vertex>'));
 assert.match(shader.fragmentShader,/varying highp float vExpanseDepth/);
 assert.match(shader.fragmentShader,/vExpanseDepth >= uExpanseFar/);
 assert.equal(shader.uniforms.uExpanseNear,bounds.near);
});
test('unknown custom shader cannot silently bypass the dimensional audit',()=>{
 assert.throws(()=>View.patchShader({vertexShader:'void main(){gl_Position=vec4(0.);}',fragmentShader:'void main(){}',uniforms:{}},{}),/project_vertex/);
});
test('capability gate independently rejects depth and shader arithmetic shortfalls',()=>{
 const valid={depthBits:24,complete:true,vertex:{precision:23,rangeMin:127,rangeMax:127},fragment:{precision:23,rangeMin:127,rangeMax:127},selected:'highp'};
 assert.deepEqual(View.capabilityErrors(valid),[]);
 assert.match(View.capabilityErrors({...valid,depthBits:16}).join(),/24/);
 assert.match(View.capabilityErrors({...valid,fragment:{precision:10,rangeMin:14,rangeMax:14}}).join(),/fragment/);
 assert.match(View.capabilityErrors({...valid,selected:'mediump'}).join(),/highp/);
 assert.match(View.capabilityErrors({...valid,complete:false}).join(),/framebuffer/);
});
const T=require('../assets/three.min.js'),M=require('../assets/scale-math.js');
const frozenFrame={origin:[1e8,2,3],eye:[0,0,1000],quaternion:[0,0,0,1],fov:60,aspect:1,width:512,height:512};
test('actual r128 proxy keeps source geometry/pose and calibrates raw scale once',()=>{
 const source=new T.Mesh(new T.BoxGeometry(1,.2,1.2),new T.MeshBasicMaterial());source.userData.expanseRole='physical';source.position.set(1e8,2,3);source.scale.setScalar(.62);
 const adapter=View.create({THREE:T,renderer:{},math:M});
 adapter.setSource([{id:'hull',source,metresPerUnit:M.hullScale(1.2),ignoreRootScale:true}]);
 adapter.snapshot(frozenFrame);const box=adapter.diagnostics().boxes[0];assert.ok(Math.abs(box.max[2]-box.min[2]-312)<.001);
 assert.deepEqual(source.position.toArray(),[1e8,2,3]);assert.deepEqual(source.scale.toArray(),[.62,.62,.62]);
 assert.equal(adapter.pick([256,256]),'hull');let disposed=0;source.geometry.addEventListener('dispose',()=>disposed++);source.material.addEventListener('dispose',()=>disposed++);adapter.dispose();assert.equal(disposed,0);
});
test('actual r128 rejects unretained instances and disposes after failed registration',()=>{
 const source=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial(),1),adapter=View.create({THREE:T,renderer:{},math:M});
 assert.throws(()=>adapter.setSource([{id:'belt',source,metresPerUnit:1e6}]),/high-precision/);
 assert.equal(adapter.diagnostics().roots,0);adapter.dispose();
});
test('actual r128 accepts retained instance and comet descriptors without source mutations',()=>{
 const belt=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial(),1);belt.userData.expanseMatrices=[new T.Matrix4().makeTranslation(1e8+.001,2,3).elements.slice()];
 const tail=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0],3)),new T.PointsMaterial());tail.userData.expanseHistory=[[1e8+.001,2,3]];
 const scene=new T.Scene();scene.add(belt,tail);const adapter=View.create({THREE:T,renderer:{},math:M});adapter.setSource([{id:'world',source:scene,metresPerUnit:1e6}]);adapter.snapshot(frozenFrame);
 assert.deepEqual(Array.from(tail.geometry.attributes.position.array),[0,0,0]);assert.equal(belt.instanceMatrix.array[12],0);assert.equal(adapter.diagnostics().ownedGeometries,1);adapter.dispose();assert.equal(adapter.diagnostics().ownedGeometries,0);
});
test('frame rejects sparse vectors and nonunit quaternion before deriving camera matrices',()=>{
 const adapter=View.create({THREE:T,renderer:{},math:M});for(const bad of [{eye:[,0,0]},{origin:[,0,0]},{quaternion:[,,,]},{quaternion:[0,0,0,2]}])assert.throws(()=>adapter.snapshot({...frozenFrame,...bad}),TypeError);adapter.dispose();
});
test('standalone directional light requires its target to be registered',()=>{
 const source=new T.DirectionalLight(),adapter=View.create({THREE:T,renderer:{},math:M});assert.throws(()=>adapter.setSource([{id:'sun',source,metresPerUnit:1e6}]),/Directional target/);adapter.dispose();
});
test('projection and picking share global axial bounds and authored ancestor visibility',()=>{
 const hidden=new T.Group(),source=new T.Mesh(new T.PlaneGeometry(1000,1000),new T.MeshBasicMaterial({side:T.DoubleSide}));hidden.add(source);hidden.visible=false;const adapter=View.create({THREE:T,renderer:{},math:M});adapter.setSource([{id:'body',source,metresPerUnit:1}]);const frame={...frozenFrame,origin:[0,0,0]};adapter.snapshot(frame);assert.equal(adapter.pick([256,256]),null);hidden.visible=true;adapter.snapshot(frame);assert.equal(adapter.pick([256,256]),'body');assert.equal(adapter.pick([-1,256]),null);assert.equal(adapter.projectAuthored([0,0,-1e6]).visible,false);source.position.z=-1e6;adapter.snapshot(frame);assert.equal(adapter.pick([256,256]),null);adapter.dispose();
});
test('retained instance collections and matrices reject holes before GPU upload',()=>{
 const source=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial(),1),adapter=View.create({THREE:T,renderer:{},math:M}),matrix=new T.Matrix4().elements.slice();delete matrix[12];for(const bad of [new Array(1),[matrix]]){source.userData.expanseMatrices=bad;assert.throws(()=>adapter.setSource([{id:'belt',source,metresPerUnit:1e6}]),/dense/);}source.userData.expanseMatrices=[new T.Matrix4().elements.slice()];adapter.setSource([{id:'belt',source,metresPerUnit:1e6}]);adapter.snapshot(frozenFrame);delete source.userData.expanseMatrices[0][12];assert.throws(()=>adapter.snapshot(frozenFrame),/dense/);assert.equal(adapter.diagnostics().frame,null);adapter.dispose();
});
test('retained history collections and vectors reject holes both on setup and after mutation',()=>{
 const source=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0],3)),new T.PointsMaterial()),adapter=View.create({THREE:T,renderer:{},math:M});for(const bad of [new Array(1),[[,0,0]]]){source.userData.expanseHistory=bad;assert.throws(()=>adapter.setSource([{id:'tail',source,metresPerUnit:1e6}]),/dense/);}source.userData.expanseHistory=[[0,0,0]];adapter.setSource([{id:'tail',source,metresPerUnit:1e6}]);adapter.snapshot(frozenFrame);delete source.userData.expanseHistory[0][0];assert.throws(()=>adapter.snapshot(frozenFrame),/dense/);assert.equal(adapter.diagnostics().frame,null);adapter.dispose();
});

function pickingFixture(origin=[0,0,0]) {
 const scene=new T.Scene(),body=new T.Mesh(new T.PlaneGeometry(.0004,.0004),new T.MeshBasicMaterial({color:0x00ff00,side:T.DoubleSide}));
 body.position.fromArray(origin).z-=.001;scene.add(body);
 const identities=new Map([[body,'karna-vex:planet:117']]);
 const adapter=View.create({THREE:T,math:M,renderer:{getPixelRatio:()=>1,getDrawingBufferSize:v=>v.set(512,512),getContext:()=>({ALIASED_POINT_SIZE_RANGE:1,getParameter:()=>[1,64]})}});
 const snapshot=()=>adapter.snapshot({origin,eye:[0,0,0],quaternion:[0,0,0,1],fov:60,aspect:1,width:512,height:512});
 const setup=()=>{adapter.setSource([{id:'system',source:scene,metresPerUnit:1e6,identities}]);snapshot();};
 const close=()=>{adapter.dispose();scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});};
 return {scene,body,identities,adapter,setup,snapshot,close};
}

test('nearest unknown drawn surface blocks a registered body instead of being skipped',()=>{
 const f=pickingFixture(),front=new T.Mesh(new T.PlaneGeometry(.0003,.0003),new T.MeshBasicMaterial({color:0xff0000,side:T.DoubleSide}));front.position.z=-.0005;f.scene.add(front);f.setup();
 try{assert.equal(f.adapter.pick([256,256]),null);f.identities.set(front,'karna-vex:moon:micqui-nobara');f.setup();assert.equal(f.adapter.pick([256,256]),'karna-vex:moon:micqui-nobara');}finally{f.close();}
});

test('detached opaque belt instances block through origin shifts and respect hidden ancestors',()=>{
 for(const origin of [[0,0,0],[1e8,-2,3]]){
  const f=pickingFixture(origin),hidden=new T.Group(),belt=new T.InstancedMesh(new T.BoxGeometry(.0003,.0003,.00002),new T.MeshBasicMaterial({color:0xff0000}),1);
  const matrix=new T.Matrix4().makeTranslation(origin[0],origin[1],origin[2]-.0005);belt.setMatrixAt(0,matrix);belt.userData.expanseMatrices=[matrix.elements.slice()];hidden.add(belt);f.scene.add(hidden);f.setup();
  try{assert.equal(f.adapter.pick([256,256]),null);hidden.visible=false;f.snapshot();assert.equal(f.adapter.pick([256,256]),'karna-vex:planet:117');hidden.visible=true;f.body.position.z=origin[2]-.0002;f.snapshot();assert.equal(f.adapter.pick([256,256]),'karna-vex:planet:117');}finally{f.close();}
 }
});

test('unknown surfaces outside global axial clipping do not hide a selectable body',()=>{
 const f=pickingFixture(),front=new T.Mesh(new T.PlaneGeometry(.0003,.0003),new T.MeshBasicMaterial({side:T.DoubleSide}));front.position.z=-.00000005;f.scene.add(front);f.setup();
 try{assert.equal(f.adapter.pick([256,256]),'karna-vex:planet:117');front.position.z=-300000;f.snapshot();assert.equal(f.adapter.pick([256,256]),'karna-vex:planet:117');front.position.z=-.0005;front.material.visible=false;f.snapshot();assert.equal(f.adapter.pick([256,256]),'karna-vex:planet:117');}finally{f.close();}
});

test('opaque retained points block only their rendered screen footprint, not a metre threshold',()=>{
 const f=pickingFixture(),points=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0],3)),new T.PointsMaterial({size:8,sizeAttenuation:false,color:0xff0000}));points.userData.expanseHistory=[[0,0,-.0005]];f.scene.add(points);f.setup();
 try{assert.equal(f.adapter.pick([256,256]),null);assert.equal(f.adapter.pick([266,256]),'karna-vex:planet:117');}finally{f.close();}
});

test('transparent additive history and glow sprites do not claim solid occlusion',()=>{
 const f=pickingFixture(),points=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0],3)),new T.PointsMaterial({size:100,sizeAttenuation:false,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));points.userData.expanseHistory=[[0,0,-.0005]];
 const glow=new T.Sprite(new T.SpriteMaterial({transparent:true,depthWrite:false,blending:T.AdditiveBlending}));glow.position.z=-.0004;glow.scale.set(.001,.001,1);f.scene.add(points,glow);f.setup();
 try{assert.equal(f.adapter.pick([256,256]),'karna-vex:planet:117');}finally{f.close();}
});
