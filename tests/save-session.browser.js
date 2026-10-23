async (page) => {
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return await page.evaluate(async()=>{
    const checks=[];const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw new Error(name);};
    check('session module installed',!!window.ExpanseSave);
    const C=ExpanseSaveCore; const base=new URL('/tests/session-'+Date.now()+'/',location.href);
    let q='high',paused=true,stable=true,failApply=false;
    const adapter={stable:()=>stable,capture:()=>({preferences:{quality:q}}),pause:v=>{paused=v;},validate:async()=>{},apply:async v=>{if(failApply)throw Error('apply failed');q=v.preferences.quality;}};
    const session=await ExpanseSave.start({view:'chart',baseURL:base,host:document.getElementById('controls'),adapter});
    check('startup resolves and resumes input',!paused);
    q='low';const first=await session.checkpoint();check('completed save is truthful',first.revision===1&&session.status().code==='saved');
    stable=false;let busy=false;try{await session.checkpoint();}catch(e){busy=e.code==='BUSY';}check('unstable scene cannot checkpoint',busy);stable=true;
    let invalid=false;try{await session.importJSON('{');}catch(e){invalid=true;}check('invalid import leaves live state unchanged',invalid&&q==='low');
    const importValue=C.fresh({quality:'high'});const before=session.snapshot();
    const repo=await ExpanseSaveStorage.open(base);await repo.commit(before,before.revision);repo.close();
    let conflict=false;try{await session.importJSON(C.stringify(importValue));}catch(e){conflict=e.code==='CONFLICT';}
    check('failed import CAS rolls back live state',conflict&&q==='low'&&session.snapshot().revision===before.revision);
    check('failed import never announces saved',session.status().code==='conflict');
    const memory=await ExpanseSave.start({view:'chart',baseURL:new URL('file:///D:/test/'),host:document.getElementById('controls'),adapter});
    check('file mode labelled and usable',memory.status().code==='memory'&&!paused);
    check('memory export roundtrips',C.parse(memory.exportJSON()).preferences.quality===q);
    return {passed:checks.length,checks};
  });
}
