async function(page){
 await page.waitForFunction(()=>window.ExpanseScaleView&&window.ExpanseScaleMath&&window.THREE);
 return page.evaluate(()=>{
  const T=window.THREE,V=window.ExpanseScaleView,M=window.ExpanseScaleMath;
  const renderer=new T.WebGLRenderer({antialias:true,precision:'highp'}),width=128,height=128;
  renderer.outputEncoding=T.LinearEncoding;renderer.setSize(width,height);document.body.appendChild(renderer.domElement);
  const adapter=V.create({THREE:T,renderer,math:M}),target=new T.WebGLRenderTarget(width,height,{depthBuffer:true,stencilBuffer:true});
  const checks=[],bodyID='karna-vex:planet:117',origins=[[0,0,0],[1e8,-2,3]];
  const cases=['unknown-foreground','hidden-ancestor','outside-near-slice','opaque-belt','selectable-front-body','opaque-history','outside-point-footprint','additive-history'];
  let world=null;
  function disposeWorld(){
   adapter.setSource([]);
   if(world){world.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)o.geometry.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});world=null;}
  }
  try{
   for(const dpr of [1,2])for(const quality of ['low','high'])for(const origin of origins)for(const kind of cases){
    disposeWorld();renderer.setPixelRatio(dpr);const buffer=renderer.getDrawingBufferSize(new T.Vector2());target.setSize(buffer.x,buffer.y);
    world=new T.Scene();const body=new T.Mesh(new T.PlaneGeometry(.0004,.0004),new T.MeshBasicMaterial({color:0x00ff00,side:T.DoubleSide}));
    body.position.fromArray(origin).z-=.001;world.add(body);
    const identities=new Map([[body,bodyID]]);let expected=bodyID,red=false,additive=false,css=[width/2+.5,height/2+.5];
    function foreground(){const mesh=new T.Mesh(new T.PlaneGeometry(.0003,.0003),new T.MeshBasicMaterial({color:0xff0000,side:T.DoubleSide}));mesh.position.fromArray(origin).z-=.0005;return mesh;}
    if(kind==='unknown-foreground'){world.add(foreground());expected=null;red=true;}
    if(kind==='hidden-ancestor'){const parent=new T.Group();parent.visible=false;parent.add(foreground());world.add(parent);}
    if(kind==='outside-near-slice'){const mesh=foreground();mesh.position.z=origin[2]-.00000005;world.add(mesh);}
    if(kind==='opaque-belt'||kind==='selectable-front-body'){
     const belt=new T.InstancedMesh(new T.BoxGeometry(.0003,.0003,.00002),new T.MeshBasicMaterial({color:0xff0000}),1);
     const matrix=new T.Matrix4().makeTranslation(origin[0],origin[1],origin[2]-.0005);belt.setMatrixAt(0,matrix);belt.userData.expanseMatrices=[matrix.elements.slice()];world.add(belt);
     if(kind==='selectable-front-body')body.position.z=origin[2]-.0002;else{expected=null;red=true;}
    }
    if(['opaque-history','outside-point-footprint','additive-history'].includes(kind)){
     additive=kind==='additive-history';const material=new T.PointsMaterial({size:8,sizeAttenuation:false,color:0xff0000,transparent:additive,depthWrite:!additive,opacity:additive?.5:1,blending:additive?T.AdditiveBlending:T.NormalBlending});
     const points=new T.Points(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0],3)),material);points.userData.expanseHistory=[[origin[0],origin[1],origin[2]-.0005]];world.add(points);
     if(kind==='opaque-history'){expected=null;red=true;}if(kind==='outside-point-footprint')css[0]+=10;
    }
    adapter.setSource([{id:'system',source:world,metresPerUnit:1e6,identities}]);
    adapter.snapshot({origin,eye:[0,0,0],quaternion:[0,0,0,1],fov:60,aspect:width/height,width,height});
    const output=quality==='high'?target:null;adapter.render({target:output});const picked=adapter.pick(css),pixel=new Uint8Array(4),x=Math.floor(css[0]*dpr),y=Math.floor((height-css[1])*dpr);
    if(output)renderer.readRenderTargetPixels(output,x,y,1,1,pixel);else{const gl=renderer.getContext();gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);}
    const visible=red?pixel[0]>240&&pixel[1]<10: additive?pixel[0]>80&&pixel[1]>240:pixel[1]>240&&pixel[0]<10;
    checks.push({kind,quality,dpr,origin,expected,picked,pixel:Array.from(pixel),pass:picked===expected&&visible});
   }
  }finally{disposeWorld();adapter.dispose();renderer.setRenderTarget(null);target.dispose();renderer.dispose();renderer.domElement.remove();}
  return {passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks,semantics:'Nearest drawn mesh/opaque billboard geometry; unknown IDs block. Lines and transparent particle/halo effects are non-solid. Point sizes follow r128 with hardware clamping; no alpha-texture-exact claim.'};
 });
}
