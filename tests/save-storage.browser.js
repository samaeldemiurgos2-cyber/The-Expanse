async (page) => {
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  return await page.evaluate(async()=>{
    const checks=[];
    const check=(name,condition)=>{checks.push({name,pass:!!condition});if(!condition)throw new Error(name);};
    check('real IndexedDB storage module installed',!!window.ExpanseSaveStorage);
    const C=ExpanseSaveCore,S=ExpanseSaveStorage;
    const base=new URL('/tests/storage-'+Date.now()+'/',location.href);
    const a=await S.open(base),b=await S.open(base);
    check('fresh app path is empty',(await a.read()).current===null);
    const first=await a.commit(C.fresh(),0);
    check('first completed transaction stamps revision',first.revision===1&&!!first.savedAt);
    let conflict=false;try{await b.commit(C.fresh(),0);}catch(e){conflict=e.code==='CONFLICT';}
    check('independent stale connection is rejected',conflict);
    const changed=C.merge(first,{preferences:{quality:'low'}});
    const second=await a.commit(changed,1);
    const records=await b.read();
    check('previous and current committed atomically',records.current.revision===2&&records.previous.revision===1&&records.current.preferences.quality==='low');
    a.close();b.close();const reopened=await S.open(base);
    check('closing and reopening preserves real browser data',(await reopened.read()).current.revision===2);
    const other=await S.open(new URL(base+'other/'));check('other base path is isolated',(await other.read()).current===null);
    let unavailable=false;try{await S.open(new URL('file:///fixture/index.html'));}catch(e){unavailable=e.code==='UNAVAILABLE';}
    check('file mode is explicitly unavailable',unavailable);
    reopened.close();other.close();return {passed:checks.length,checks};
  });
}
