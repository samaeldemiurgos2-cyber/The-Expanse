async function(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.waitForFunction(()=>window.__scalePrototype);
 const result=await page.evaluate(()=>window.__scalePrototype.stateProof());return {...result,failed:result.failed+errors.length,errors};
}
