async (page) => {
  const context=await page.context().browser().newContext();const a=await context.newPage(),b=await context.newPage();const checks=[];
  const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
  const base='http://127.0.0.1:4318/tests/tabs-'+Date.now()+'/';
  async function setup(p){await p.goto('http://127.0.0.1:4318/tests/save-harness.html');await p.evaluate(async base=>{window.q='high';window.testSession=await ExpanseSave.start({view:'chart',baseURL:new URL(base),host:document.getElementById('controls'),adapter:{stable:()=>true,capture:()=>({preferences:{quality:window.q}}),pause:()=>{},validate:async()=>{},apply:async s=>{window.q=s.preferences.quality;}}});},base);}
  try{
    await setup(a);await a.evaluate(()=>testSession.checkpoint());await setup(b);
    await b.evaluate(()=>{window.q='low';return testSession.checkpoint();});
    const conflict=await a.evaluate(async()=>{try{await testSession.checkpoint();return false;}catch(e){return e.code==='CONFLICT'&&testSession.status().code==='conflict';}});
    check('actual stale tab cannot replace newer tab',conflict);
    await a.close();await b.close();const reopened=await context.newPage();await setup(reopened);
    check('new page after both tabs close restores browser checkpoint',await reopened.evaluate(()=>testSession.snapshot().revision>=2&&window.q==='low'));
    const before=reopened.url();const handoff=await reopened.evaluate(async()=>{
      const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Injected quota fault','QuotaExceededError');};
      try{await testSession.handoff('interior');return false;}catch(e){return e.code==='UNAVAILABLE'&&testSession.status().code==='memory';}finally{IDBObjectStore.prototype.put=put;}
    });
    check('failed handoff remains current page and never claims saved',handoff&&reopened.url()===before);
    await reopened.locator('#save-control').click();check('failed handoff offers explicit warned continuation',await reopened.getByRole('button',{name:'Continue without saving',exact:true}).isVisible());
    return {passed:checks.length,checks};
  }finally{await context.close();}
}
