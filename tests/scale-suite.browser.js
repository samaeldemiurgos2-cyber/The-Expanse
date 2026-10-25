async function(page){
 const results=[];
 for(const name of ['scale-depth','scale-source','scale-render-state','scale-hull-occlusion','scale-picking','scale-controls','scale-camera-bounds','scale-journey','scale-journey-high','scale-context','scale-residency','scale-transition-residency','scale-performance','scale-touch-matrix']){
  const context=await page.context().browser().newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});try{const p=await context.newPage();await p.goto(new URL('.',page.url()).href);const file=name==='scale-journey-high'?'scale-journey':name;globalThis.__scaleJourneyQuality=name==='scale-journey-high'?'high':'low';const callback=eval('('+fs.readFileSync(path.resolve(__dirname,'../tests/'+file+'.browser.js'),'utf8')+'\n)'),result=await callback(p);results.push({name,...result});if(globalThis.__surveyCheck)globalThis.__surveyCheck({suite:name,passed:result.passed,failed:result.failed});}finally{await context.close();}
 }
 return {passed:results.reduce((n,v)=>n+v.passed,0),failed:results.reduce((n,v)=>n+v.failed,0),results};
}
