async (page) => {
  const context=await page.context().browser().newContext(),p=await context.newPage();
  await p.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{configurable:true,get(){throw new DOMException('Injected storage denial','SecurityError');}});});
  try{
    await p.goto('http://127.0.0.1:4318/');await p.waitForFunction(()=>window.__expanseSave&&__expanseSave.status().code!=='loading');
    const result=await p.evaluate(()=>({memory:__expanseSave.status().code==='memory',valid:ExpanseSaveCore.parse(__expanseSave.exportJSON()).format==='the-expanse/save'}));
    if(!result.memory||!result.valid)throw Error('Denied storage must remain usable with explicit JSON backup');
    return {passed:2,checks:[{name:'injected storage denial enters labelled memory mode',pass:true},{name:'denied storage retains usable JSON backup',pass:true}]};
  }finally{await context.close();}
}
