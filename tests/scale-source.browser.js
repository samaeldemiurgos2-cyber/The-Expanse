async function(page){
 const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>window.__scalePrototype);
 const results=[];
 for(const quality of ['high','low']){await page.selectOption('#quality',quality);const value=await page.evaluate(()=>window.__scalePrototype.actual());results.push({quality,...value});if(globalThis.__scaleArtifactPath)await page.screenshot({path:globalThis.__scaleArtifactPath('actual-'+quality+'.png')});}
 return {passed:results.filter(r=>!r.error&&r.brightPixels>200&&Math.abs(r.calibration.length-312)<.01).length,failed:errors.length+results.filter(r=>r.error||r.brightPixels<=200||Math.abs(r.calibration.length-312)>=.01).length,results,errors};
}
