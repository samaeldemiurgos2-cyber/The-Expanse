async (page)=>{
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return page.evaluate(async()=>{
    let quality='high',paused=false,failRollback=false,applyCalls=0;
    const checks=[];const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
    const adapter={stable:()=>!paused,capture:()=>({preferences:{quality}}),pause:v=>{paused=v;},validate:async()=>{},apply:async value=>{applyCalls++;if(failRollback&&applyCalls===2)throw Error('Injected rollback failure');quality=value.preferences.quality;}};
    const session=await ExpanseSave.start({view:'chart',baseURL:new URL('/tests/replacement-'+Date.now()+'/',location.href),adapter});await session.checkpoint();
    quality='low';const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Injected quota fault','QuotaExceededError');};
    try{await session.newJourney();}catch(_){}
    IDBObjectStore.prototype.put=put;
    check('replacement rollback restores just-captured unsaved live state',quality==='low');
    await session.retry();quality='low';applyCalls=0;failRollback=true;
    IDBObjectStore.prototype.put=function(){throw new DOMException('Injected quota fault','QuotaExceededError');};
    try{await session.newJourney();}catch(_){}finally{IDBObjectStore.prototype.put=put;}
    check('failed replacement rollback leaves input paused and autosave blocked',paused&&session.status().code==='error');
    return {passed:checks.length,checks};
  });
}
