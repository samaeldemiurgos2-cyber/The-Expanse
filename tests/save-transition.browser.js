async (page)=>{
  const context=await page.context().browser().newContext(),p=await context.newPage();
  try{
    await p.goto('http://127.0.0.1:4318/');await p.waitForFunction(()=>window.__expanseSave&&!['loading','saving'].includes(__expanseSave.status().code));
    await p.evaluate(()=>__expanseSave.checkpoint());await p.evaluate(()=>__expanse.jump('karna-vex'));
    const results=await p.evaluate(async()=>{
      let reset=false,retry=false;try{await __expanseSave.newJourney();}catch(e){reset=e.code==='BUSY';}
      try{await __expanseSave.retry();}catch(e){retry=e.code==='BUSY';}
      __expanseSave.exportJSON();return {reset,retry,warning:/stable|transition/i.test(__expanseSave.status().message)};
    });
    if(!results.reset||!results.retry)throw Error('Recovery/retry must not apply snapshots during warp or scene transition');
    if(!results.warning)throw Error('Export during transition must explain that it uses preceding stable snapshot');
    return {passed:3,checks:[{name:'new journey cannot race an active warp',pass:true},{name:'retry cannot race an active warp',pass:true},{name:'unstable export explains stable fallback',pass:true}]};
  }finally{await context.close();}
}
