async (page)=>{
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return page.evaluate(async()=>{
    const checks=[];const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
    const base=new URL('/tests/nonjson-'+Date.now()+'/',location.href),a=await ExpanseSaveStorage.open(base),b=await ExpanseSaveStorage.open(base);a.close();
    const value={revision:'bad',odd:1n};value.cycle=value;
    await new Promise(resolve=>{const r=indexedDB.open(ExpanseSaveStorage.scope(base),1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots');store.put(value,'current');store.put({invalid:true},'previous');tx.oncomplete=()=>{db.close();resolve();};};});
    const adapter={stable:()=>true,capture:()=>({}),pause:()=>{},validate:async()=>{},apply:async()=>{}};
    const session=await ExpanseSave.start({view:'chart',baseURL:base,adapter});
    let diagnostic;try{diagnostic=JSON.parse(session.exportOriginal());}catch(_){}
    check('non-JSON original remains exportable as tagged diagnostic JSON',!!diagnostic&&JSON.stringify(diagnostic).includes('bigint')&&JSON.stringify(diagnostic).includes('reference'));
    check('invalid previous record is not offered as usable recovery',Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Recover previous').hidden);
    const first=await b.replace(ExpanseSaveCore.fresh(),null);let conflict=false;try{await b.replace(ExpanseSaveCore.fresh(),null);}catch(e){conflict=e.code==='CONFLICT';}
    check('null corrupt revision does not permit a second stale replacement',first.revision===1&&conflict);b.close();return {passed:checks.length,checks};
  });
}
