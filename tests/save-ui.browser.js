async (page) => {
  const context=await page.context().browser().newContext({viewport:{width:700,height:844},isMobile:true,hasTouch:true}),p=await context.newPage(),checks=[];
  const check=(name,ok)=>{checks.push({name,pass:!!ok});if(!ok)throw Error(name);};
  try{
    await p.goto('http://127.0.0.1:4318/');await p.waitForFunction(()=>window.__expanseSave&&!['loading','saving'].includes(__expanseSave.status().code));
    check('Save joins existing responsive toolbar, not a separate topbar row',await p.locator('#topbtns #save-control').count()===1);
    const before=await p.evaluate(()=>__expanseSave.checkpoint());
    const backup=await p.evaluate(()=>{const v=JSON.parse(__expanseSave.exportJSON());v.navigation.pose.position=[30,5,-2];return JSON.stringify(v);});
    await p.locator('#save-control').click();
    check('dialog fits mobile viewport',await p.locator('#save-panel').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}));
    await p.locator('#save-import-file').setInputFiles({name:'journey.json',mimeType:'application/json',buffer:Buffer.from(backup)});
    const cancelled=p.waitForEvent('dialog');const cancelClick=p.getByRole('button',{name:'Import JSON',exact:true}).click();await (await cancelled).dismiss();await cancelClick;
    check('cancelled import preserves progress',(await p.evaluate(()=>__expanseSave.snapshot().revision))===before.revision);
    const confirmed=p.waitForEvent('dialog');const importClick=p.getByRole('button',{name:'Import JSON',exact:true}).click();await (await confirmed).accept();await importClick;
    await p.waitForFunction(()=>__expanseSave.snapshot().navigation.pose.position[0]===30&&__expanseSave.status().code==='saved');
    check('confirmed file import applies and commits',true);
    const download=p.waitForEvent('download');await p.getByRole('button',{name:'Export JSON',exact:true}).click();const artifact=await download;
    check('JSON backup downloads separately from GLB export',artifact.suggestedFilename()==='the-expanse-save.json');
    await p.keyboard.press('Escape');check('Escape restores focus to Save',await p.locator('#save-control').evaluate(el=>document.activeElement===el));
    return {passed:checks.length,checks};
  }finally{await context.close();}
}
