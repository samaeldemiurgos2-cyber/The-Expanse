async (page)=>{
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return page.evaluate(async()=>{
    const checks=[];const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
    let q='high',paused=false;
    const adapter={capture:()=>({preferences:{quality:q}}),stable:()=>!paused,pause:v=>{paused=v;},validate:async()=>{},apply:async v=>{q=v.preferences.quality;}};
    const base=new URL('/tests/review-'+Date.now()+'/',location.href),session=await ExpanseSave.start({view:'chart',baseURL:base,adapter});
    await session.checkpoint();const repo=await ExpanseSaveStorage.open(base);await repo.commit(session.snapshot(),session.snapshot().revision);
    try{await session.checkpoint();}catch(_){}
    q='low';check('I1 conflict backup includes progress made after conflict',ExpanseSaveCore.parse(session.exportJSON()).preferences.quality==='low');
    q='high';try{await session.newJourney();}catch(_){}
    check('conflicted recovery rollback preserves latest live progress',q==='high');
    const file=await ExpanseSave.start({view:'chart',baseURL:new URL('file:///D:/test/'),adapter});
    try{await file.handoff('interior');}catch(_){}
    check('I2 use-memory action is separate from warned navigation',typeof file.useMemoryOnly==='function');
    file.useMemoryOnly();check('I2 choosing memory only cancels stale handoff',file.status().code==='memory'&&location.pathname==='/tests/save-harness.html');
    const badBase=new URL('/tests/review-corrupt-'+Date.now()+'/',location.href),badRepo=await ExpanseSaveStorage.open(badBase);badRepo.close();
    await new Promise((resolve,reject)=>{const r=indexedDB.open(ExpanseSaveStorage.scope(badBase),1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({revision:0,schemaVersion:999},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});
    const bad=await ExpanseSave.start({view:'chart',baseURL:badBase,adapter});
    check('I5 restore failure automatically opens visible recovery dialog',bad.status().code==='error'&&document.querySelectorAll('dialog[open]').length===1);
    bad.exportJSON();let recovered=false;try{await bad.newJourney();recovered=true;}catch(_){}
    check('exporting a fallback cannot remove blocked-save recovery capability',recovered&&bad.status().code==='saved');
    repo.close();return {passed:checks.length,checks};
  });
}
