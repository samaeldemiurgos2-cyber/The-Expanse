async (page) => {
  const context=await page.context().browser().newContext(),p=await context.newPage(),checks=[];
  const check=(name,ok,detail)=>{checks.push({name,pass:!!ok,detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
  const ready=()=>p.waitForFunction(()=>window.__expanseSave&&!['loading','saving'].includes(__expanseSave.status().code),null,{timeout:30000});
  try{
    await p.goto('http://127.0.0.1:4318/');await ready();const before=await p.evaluate(()=>__expanseSave.checkpoint());
    const unknown=await p.evaluate(async()=>{const v=JSON.parse(__expanseSave.exportJSON());v.navigation.selection='no-such-world';try{await __expanseSave.importJSON(JSON.stringify(v));return false;}catch(_){return true;}});
    check('chart rejects unknown world before replacing live state',unknown&&(await p.evaluate(()=>__expanseSave.snapshot().revision))===before.revision);
    await p.evaluate(()=>__expanse.jump('karna-vex'));
    const blocked=await p.evaluate(async()=>{try{await __expanseSave.checkpoint();return false;}catch(e){return e.code==='BUSY';}});
    const stable=await p.evaluate(()=>__expanseSave.snapshot());check('warp cannot overwrite preceding stable checkpoint',blocked&&stable.revision===before.revision&&stable.navigation.frame==='chart-mly');
    await p.waitForFunction(()=>__expanse.sysMode()==='system'&&__expanse.sysSettle()&&!__expanse.ship.warping&&__expanseSave.status().code!=='saving',null,{timeout:25000});
    await p.evaluate(async()=>{const v=JSON.parse(__expanseSave.exportJSON());v.navigation.selection='karna-vex:moon:micqui-nobara';v.revision=9999;await __expanseSave.importJSON(JSON.stringify(v));});
    check('system stable body identity resolves through import',await p.locator('#groupchip').innerText().then(s=>/Micqui.Nobara/i.test(s)));
    check('import does not trust foreign concurrency revision',(await p.evaluate(()=>__expanseSave.snapshot().revision))<9999);
    await p.reload();await ready();check('selected stable body survives reload',(await p.evaluate(()=>__expanseSave.snapshot().navigation.selection))==='karna-vex:moon:micqui-nobara');
    const partial=await p.evaluate(async()=>{const v=JSON.parse(__expanseSave.exportJSON());v.navigation.phases.pop();try{await __expanseSave.importJSON(JSON.stringify(v));return false;}catch(e){return /phase|orbital/i.test(e.message);}});
    check('incomplete orbital phase set cannot create a mixed restored system',partial);
    await p.goto('http://127.0.0.1:4318/walkthrough/index.html?return=https%3A%2F%2Fexample.invalid');await ready();
    const saved=await p.evaluate(()=>__expanseSave.checkpoint());
    const reject=await p.evaluate(async()=>{const v=JSON.parse(__expanseSave.exportJSON());v.interior.x=1e8;try{await __expanseSave.importJSON(JSON.stringify(v));return false;}catch(e){return /walkable|position/i.test(e.message);}});
    const after=await p.evaluate(()=>__expanseSave.snapshot());check('real interior rejects outside-geometry pose without clamping/overwrite',reject&&JSON.stringify(after.interior)===JSON.stringify(saved.interior)&&after.revision===saved.revision);
    const got=p.getByRole('button',{name:'Got it',exact:true});if(await got.isVisible())await got.click();
    await p.locator('#returnChart').click();await p.waitForURL('http://127.0.0.1:4318/index.html');check('external return query has no navigation authority',true);
    return {passed:checks.length,checks};
  }finally{await context.close();}
}
