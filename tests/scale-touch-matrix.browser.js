async function(page){
 const callback=eval('('+fs.readFileSync(path.resolve(__dirname,'../tests/scale-controls.browser.js'),'utf8')+'\n)'),results=[];
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:500}]){const context=await page.context().browser().newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2});try{const testPage=await context.newPage();await testPage.goto(new URL('.',page.url()).href);const result=await callback(testPage);results.push({viewport,...result});if(globalThis.__surveyCheck)globalThis.__surveyCheck({viewport,passed:result.passed,failed:result.failed});}finally{await context.close();}}
 return {passed:results.reduce((n,v)=>n+v.passed,0),failed:results.reduce((n,v)=>n+v.failed,0),results};
}
