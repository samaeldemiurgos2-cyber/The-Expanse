async (page)=>{
  const context=await page.context().browser().newContext(),p=await context.newPage(),checks=[];
  try{
    await p.goto('http://127.0.0.1:4318/');await p.waitForFunction(()=>window.__expanseSave&&!['loading','saving'].includes(__expanseSave.status().code));
    const worlds=await p.evaluate(()=>JSON.parse(document.getElementById('expanse-data').textContent).worlds.map(w=>w.id));
    for(const id of worlds){
      await p.evaluate(id=>__expanse.enterSystem(id),id);
      await p.waitForFunction(id=>__expanse.sysMode()==='system'&&__expanse.sysSettle()&&__expanseSave.snapshot().navigation.systemId===id&&__expanseSave.status().code!=='saving',id,{timeout:20000});
      for(let pass=0;pass<2;pass++){
        if(pass===1)await p.locator('#btn-quality').click();
        await p.waitForFunction(()=>__expanseSave.status().code!=='saving');
        const captured=await p.evaluate(()=>__expanseSave.checkpoint());
        const ok=captured.navigation.systemId===id&&captured.navigation.phases.length>0;
        checks.push({name:id+' capture→validate '+captured.preferences.quality,pass:ok,phases:captured.navigation.phases.length});
        if(!ok)throw Error('Catalog system capture mismatch '+id);
      }
    }
    return {passed:checks.length,failed:0,checks};
  }catch(e){return {passed:checks.filter(c=>c.pass).length,failed:1,error:e.message,checks};}
  finally{await context.close();}
}
