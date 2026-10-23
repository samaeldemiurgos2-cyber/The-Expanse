async (page) => {
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return await page.evaluate(async()=>{
    const checks=[];const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw new Error(name);};
    const C=ExpanseSaveCore,S=ExpanseSaveStorage;let quality='high',paused=true,stable=true;
    const adapter={capture:()=>({preferences:{quality}}),stable:()=>stable,pause:v=>{paused=v;},validate:async v=>{if(v.interior&&v.interior.x===123)throw new Error('Unsafe position');},apply:async v=>{quality=v.preferences.quality;}};
    const base=new URL('/tests/failure-'+Date.now()+'/',location.href),repo=await S.open(base);
    const first=await repo.commit(C.fresh(),0);const second=await repo.commit(C.merge(first,{preferences:{quality:'low'}}),1);repo.close();
    async function rawPut(value){await new Promise((resolve,reject)=>{const request=indexedDB.open(S.scope(base),1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(value,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});}
    const corrupt={...second,schemaVersion:99};await rawPut(corrupt);
    const session=await ExpanseSave.start({view:'chart',baseURL:base,host:document.getElementById('controls'),adapter});
    check('future checkpoint pauses input without replacing record',paused&&session.status().code==='error');
    session.tick();const inspect=await S.open(base);check('startup makes no default overwrite',(await inspect.read()).current.schemaVersion===99);
    check('raw unsupported record export retained',JSON.parse(session.exportOriginal()).schemaVersion===99);
    await session.recoverPrevious();const modal=document.querySelector('dialog[open]');if(modal)await new Promise(resolve=>{modal.addEventListener('close',resolve,{once:true});modal.close();});check('explicit previous recovery resumes input after recovery dialog closes',!paused&&session.snapshot().revision===3);
    quality='low';await session.checkpoint();const saved=session.snapshot();
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(){throw new DOMException('Injected quota fault','QuotaExceededError');};
    quality='high';let failed=false;try{await session.checkpoint();}catch(e){failed=e.code==='UNAVAILABLE';}
    IDBObjectStore.prototype.put=put;
    check('injected write failure is not Saved',failed&&session.status().code==='memory');
    check('failed transaction preserves prior durable state',(await inspect.read()).current.revision===saved.revision);
    const invalid=C.fresh();invalid.interior={deckId:'gas-ripley/deck-1',x:123,z:0,yaw:0,pitch:0,roomId:null};
    let unsafe=false;try{await session.importJSON(C.stringify(invalid));}catch(e){unsafe=true;}
    check('spatial validation rejection precedes live apply',unsafe&&quality==='high');
    check('memory backup captures unsaved live preferences',C.parse(session.exportJSON()).preferences.quality==='high');
    inspect.close();return {passed:checks.length,checks};
  });
}
