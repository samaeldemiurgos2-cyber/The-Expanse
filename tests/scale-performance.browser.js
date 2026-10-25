async function(page){
 const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.setViewportSize({width:1440,height:960});await page.waitForFunction(()=>window.__scalePrototype);
 for(const route of [false,true])for(const quality of ['low','high']){const value=await page.evaluate(o=>window.__scalePrototype.benchmark({width:1440,height:960,...o}),{quality,route});results.push({quality,route,...value});if(globalThis.__surveyCheck)globalThis.__surveyCheck({quality,route,ratio:value.ratio,p95:value.prototypeP95});}
 return {passed:results.filter(v=>v.withinTenPercent&&(v.quality==='high'?v.absoluteDesktopSixtyFps:v.absoluteLowThirtyFps)).length,failed:errors.length+results.filter(v=>!v.withinTenPercent||!(v.quality==='high'?v.absoluteDesktopSixtyFps:v.absoluteLowThirtyFps)).length,results,errors};
}
