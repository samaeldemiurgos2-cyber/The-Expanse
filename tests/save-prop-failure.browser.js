async (page)=>{
  const context=await page.context().browser().newContext(),p=await context.newPage();
  await p.addInitScript(()=>{
    let Loader,failed=false;
    Object.defineProperty(window,'GLTFLoader',{configurable:true,get:()=>Loader,set(value){
      const load=value.prototype.load;value.prototype.load=function(url,onLoad,onProgress,onError){
        if(!failed){failed=true;window.__injectedMissingProp=true;queueMicrotask(()=>onError(new Error('Injected one required prop load failure')));return;}
        return load.call(this,url,onLoad,onProgress,onError);
      };Loader=value;
    }});
  });
  try{
    await p.goto('http://127.0.0.1:4318/walkthrough/index.html');
    await p.waitForFunction(()=>/paused/i.test(document.querySelector('#loading').textContent),null,{timeout:30000});
    const value=await p.evaluate(()=>({injected:!!window.__injectedMissingProp,noSession:!window.__expanseSave,roomDisabled:document.querySelector('#roomJump').disabled,visible:!document.querySelector('#loading').classList.contains('done')}));
    if(!value.injected||!value.noSession||!value.roomDisabled||!value.visible)throw Error('One missing prop must block collider-dependent restore visibly');
    return {passed:2,checks:[{name:'one missing manifest prop prevents incomplete-collider restore',pass:true},{name:'failed collider startup remains visibly paused',pass:true}]};
  }finally{await context.close();}
}
