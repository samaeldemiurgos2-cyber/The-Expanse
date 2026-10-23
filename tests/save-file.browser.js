async (page) => {
  const fileBase=await page.evaluate(()=>{const value=new URL(location.href).searchParams.get('fileBase');if(!value)throw Error('Open save-harness.html?fileBase=<checkout file URL> before running the file-mode test.');const url=new URL(value);if(url.protocol!=='file:')throw Error('fileBase must be a file URL for the checkout directory.');return url.href.endsWith('/')?url.href:url.href+'/';});
  const context=await page.context().browser().newContext(),p=await context.newPage(),checks=[],errors=[];
  p.on('pageerror',e=>errors.push(e.message.slice(0,200)));
  const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
  const ready=()=>p.waitForFunction(()=>window.__expanseSave&&__expanseSave.status().code!=='loading',null,{timeout:30000});
  try{
    await p.goto(fileBase+'index.html');await ready();
    check('direct-file chart is labelled memory-only',await p.evaluate(()=>__expanseSave.status().code==='memory'));
    const imported=await p.evaluate(async()=>{const v=JSON.parse(__expanseSave.exportJSON());v.navigation.pose.position=[22,3,-1];await __expanseSave.importJSON(JSON.stringify(v));return JSON.parse(__expanseSave.exportJSON());});
    check('file chart supports current-page JSON import/export',imported.navigation.pose.position[0]===22);
    const before=p.url();await p.locator('#btn-board').click();check('file boarding does not imply automatic continuity',p.url()===before&&await p.evaluate(()=>__expanseSave.status().code==='memory'));
    await p.goto(fileBase+'walkthrough/index.html');await ready();
    check('direct-file interior renders after prop readiness',await p.evaluate(()=>__expanseSave.status().code==='memory'&&document.querySelector('#loading').classList.contains('done')));
    const valid=await p.evaluate(async()=>{const json=__expanseSave.exportJSON();await __expanseSave.importJSON(json);return ExpanseSaveCore.parse(__expanseSave.exportJSON()).interior.deckId;});
    check('file interior current-page backup roundtrip',valid==='gas-ripley/deck-1');
    check('file fallback has no JavaScript errors',errors.length===0);return {passed:checks.length,checks};
  }finally{await context.close();}
}
