async function(page){await page.waitForFunction(()=>window.__scalePrototype);return await page.evaluate(()=>window.__scalePrototype.hullOcclusionProof());}
