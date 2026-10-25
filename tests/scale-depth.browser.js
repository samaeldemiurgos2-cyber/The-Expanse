async function(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>window.__scalePrototype);
 const results=[];
 for(const quality of ['high','low']){
  await page.selectOption('#quality',quality);
  const value=await page.evaluate(()=>window.__scalePrototype.run());results.push({quality,...value});
  if(globalThis.__scaleArtifactPath)await page.screenshot({path:globalThis.__scaleArtifactPath('depth-'+quality+'.png')});
 }
 const source=await page.evaluate(()=>window.__scalePrototype.sourceAudit());
 return {passed:results.reduce((n,r)=>n+r.passed,0),failed:results.reduce((n,r)=>n+r.failed,0)+errors.length+(source.error?1:0),results,source,errors};
}
