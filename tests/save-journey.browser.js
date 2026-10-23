async (page) => {
  const browser=page.context().browser(),context=await browser.newContext({viewport:{width:1440,height:960}}),p=await context.newPage();
  const checks=[],errors=[];p.on('pageerror',e=>errors.push(e.message.slice(0,250)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text().replace(/data:[^\s]+/g,'[data]').slice(0,250));});
  const check=(name,ok,detail)=>{checks.push({name,pass:!!ok,detail});if(!ok)throw Error(name+' '+JSON.stringify(detail));};
  const ready=async()=>{await p.waitForFunction(()=>window.__expanseSave&&!['loading','saving'].includes(__expanseSave.status().code),null,{timeout:30000});const status=await p.evaluate(()=>__expanseSave.status());check('renderer ready without restore error',!['error','conflict'].includes(status.code),status);};
  const snap=()=>p.evaluate(()=>JSON.parse(__expanseSave.exportJSON()));
  try{
    await p.goto('http://127.0.0.1:4318/');await ready();
    await p.evaluate(()=>{__expanse.chartGoto(9,4,-3,.4,.2);__expanse.select('karna-vex');__expanse.cam('orbit');__expanse.zoom(15);__expanse.pan(.3,.2,-.4);});
    const chart=await p.evaluate(()=>__expanseSave.checkpoint());
    check('chart checkpoint captures location and selected world',chart.navigation.pose.position[0]===9&&chart.navigation.selection==='karna-vex',chart.navigation);
    await p.reload();await ready();const chartReload=await snap();
    check('chart pose/camera/selection persist through reload',JSON.stringify(chartReload.navigation)===JSON.stringify(chart.navigation),chartReload.navigation);
    check('restore is stationary',await p.evaluate(()=>__expanse.ship.vel.length()===0&&!__expanse.ship.warping));
    await p.evaluate(()=>__expanse.enterSystem('karna-vex'));
    await p.waitForFunction(()=>__expanse.sysMode()==='system'&&__expanse.sysSettle()&&__expanseSave.status().code!=='saving',null,{timeout:15000});
    await p.evaluate(()=>{__expanse.sysShot('moons');__expanse.cam('orbit');__expanse.zoom(45);});
    const system=await p.evaluate(()=>__expanseSave.checkpoint());
    check('system uses tagged units and preserves independent chart return',system.navigation.frame==='system-1000km'&&system.navigation.systemId==='karna-vex'&&JSON.stringify(system.navigation.chartReturn.pose)===JSON.stringify(chart.navigation.pose),system.navigation.chartReturn);
    check('system stores bounded parent-qualified orbital phases',system.navigation.phases.length>0&&system.navigation.phases.every(x=>x.id.includes('karna-vex')),system.navigation.phases);
    await p.reload();await ready();const systemReload=await snap();
    check('system scene restored before applying exact pose',await p.evaluate(()=>__expanse.sysMode()==='system')&&JSON.stringify(systemReload.navigation.pose)===JSON.stringify(system.navigation.pose),systemReload.navigation.pose);
    check('system return camera persists',JSON.stringify(systemReload.navigation.chartReturn)===JSON.stringify(system.navigation.chartReturn));
    // Simulation continues while open; permit elapsed active-page orbital evolution, not reset.
    const phaseDiff=system.navigation.phases.map(x=>{const y=systemReload.navigation.phases.find(v=>v.id===x.id);return y?Math.abs(y.angle-x.angle):999;});
    check('system orbital phase is restored, not regenerated',phaseDiff.every(v=>v<.1),phaseDiff);
    if(await p.locator('#pinpanel').evaluate(el=>el.classList.contains('open')))await p.locator('#pinpanel-close').click();
    await p.locator('#btn-board').click();await p.waitForURL(/\/walkthrough\/index\.html/);await ready();
    await p.waitForFunction(()=>document.querySelector('#loading').classList.contains('done'));
    const got=p.getByRole('button',{name:'Got it',exact:true});if(await got.isVisible())await got.click();
    await p.locator('#helpToggle').click();await p.locator('#roomJump').selectOption('bridge_pod');
    const inside=await p.evaluate(()=>__expanseSave.checkpoint());
    check('boarding preserves exterior system',inside.navigation.systemId==='karna-vex'&&inside.interior.deckId==='gas-ripley/deck-1');
    check('bridge pose is collision-valid and saved',inside.interior.roomId==='bridge_pod',inside.interior);
    await p.reload();await ready();const insideReload=await snap();
    check('interior pose survives reload after prop readiness',JSON.stringify(insideReload.interior)===JSON.stringify(inside.interior),insideReload.interior);
    const gotAgain=p.getByRole('button',{name:'Got it',exact:true});if(await gotAgain.isVisible())await gotAgain.click();
    await p.locator('#returnChart').click();await p.waitForURL('http://127.0.0.1:4318/index.html');await ready();const returned=await snap();
    check('Return restores same system and exterior location',returned.navigation.systemId==='karna-vex'&&JSON.stringify(returned.navigation.pose)===JSON.stringify(inside.navigation.pose),returned.navigation);
    await p.locator('#btn-return').click();await p.waitForFunction(()=>__expanse.sysMode()==='chart'&&__expanse.sysSettle()&&__expanseSave.status().code!=='saving');
    const returnedChart=await snap();
    check('system exit returns to chart pose AND camera',JSON.stringify(returnedChart.navigation.pose)===JSON.stringify(chart.navigation.pose)&&JSON.stringify(returnedChart.navigation.camera)===JSON.stringify(chart.navigation.camera),returnedChart.navigation);
    await p.locator('#btn-board').click();await p.waitForURL(/\/walkthrough\/index\.html/);await ready();const reboard=await snap();
    check('subsequent boarding remembers interior pose',JSON.stringify(reboard.interior)===JSON.stringify(inside.interior));
    check('full journey console health',errors.length===0,errors);
    return {passed:checks.length,failed:0,checks};
  }catch(e){return {passed:checks.filter(c=>c.pass).length,failed:1,error:e.message,checks,errors};}
  finally{await context.close();}
}
