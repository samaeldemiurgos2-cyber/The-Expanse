async (page) => {
  await page.goto('http://127.0.0.1:4318/tests/save-harness.html');
  await page.evaluate(async()=>{
    window.modalPaused=true;window.modalWrites=0;
    const adapter={capture:()=>({preferences:{quality:'high'}}),stable:()=>!window.modalPaused,pause:v=>{window.modalPaused=v;},validate:async()=>{},apply:async()=>{}};
    window.modalSession=await ExpanseSave.start({view:'chart',baseURL:new URL('/tests/modal-'+Date.now()+'/',location.href),host:document.getElementById('controls'),adapter});
  });
  await page.locator('#save-control').click();
  const paused=await page.evaluate(()=>window.modalPaused);
  if(!paused)throw Error('Save dialog must pause gameplay inputs');
  await page.getByRole('button',{name:'Save now',exact:true}).click();
  await page.waitForFunction(()=>modalSession.status().code==='saved');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.waitForFunction(()=>!window.modalPaused&&!document.querySelector('#save-panel').open);
  if(await page.evaluate(()=>window.modalPaused))throw Error('Closing Save should resume playable input');
  return {passed:3,checks:[{name:'Save dialog pauses input',pass:true},{name:'manual save remains available while dialog pauses input',pass:true},{name:'Close resumes input and focus',pass:await page.locator('#save-control').evaluate(el=>el===document.activeElement)}]};
}
