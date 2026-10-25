'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.EXPANSE_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..'),[scriptArg,outArg,url='http://127.0.0.1:4321/']=process.argv.slice(2);
if(!scriptArg||!outArg)throw Error('Usage: node tools/scale-check.cjs callback.browser.js output.json [url]');
const script=path.resolve(scriptArg),out=path.resolve(outArg),artifacts=path.dirname(out),progress=out+'.progress.jsonl';fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(progress,'');
const log=value=>fs.appendFileSync(progress,JSON.stringify({utc:new Date().toISOString(),...value})+'\n');
globalThis.__scaleArtifactPath=name=>path.join(artifacts,path.basename(name));globalThis.__surveyCheck=check=>log({check});
const files=[...new Set(['assets/scale-math.js','assets/scale-flight.js','assets/scale-view.js','assets/three.min.js','index.html','expanse-data.json','tests/scale-prototype.html','tests/scale-prototype.js','tests/scale-raster.js','tools/scale-preview.mjs','tools/scale-source.mjs','tools/build-scale-preview.mjs','tools/scale-check.cjs','scale/index.html','scale/scale-prototype.js','scale/scale-raster.js','scale/scale-source.html',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.browser.js')).map(n=>'tests/'+n),path.relative(root,script)])];
const hashes=()=>Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,name))).digest('hex')]));
(async()=>{
 let browser,timer;const before=hashes(),head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),errors=[];
 try{
  browser=await chromium.launch({executablePath:process.env.EXPANSE_CHROME_EXE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
  const create=browser.newContext.bind(browser);browser.newContext=async options=>{const c=await create(options);c.setDefaultTimeout(12000);c.setDefaultNavigationTimeout(20000);c.on('page',p=>{p.on('pageerror',e=>{errors.push(e.message);log({pageerror:e.message});});p.on('console',m=>{if(m.type()==='error'){errors.push(m.text());log({consoleerror:m.text()});}});});return c;};
  const context=await browser.newContext(),page=await context.newPage();await page.goto(url);const callback=eval('('+fs.readFileSync(script,'utf8')+'\n)');
  const timeout=script.endsWith('scale-suite.browser.js')?300000:180000;
  const result=await Promise.race([callback(page),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('QA callback exceeded '+timeout+' milliseconds')),timeout);})]);
  const after=hashes(),stale=JSON.stringify(before)!==JSON.stringify(after),failed=(result.failed||0)+(stale?1:0)+(errors.length&&!result.failed?errors.length:0);
  fs.writeFileSync(out,JSON.stringify({...result,failed,driverErrors:errors,evidence:{head,before,after,stale,callback:path.relative(root,script),utc:new Date().toISOString()}},null,2));console.log(JSON.stringify({passed:result.passed,failed,head,out}));if(failed)process.exitCode=1;
 }catch(error){fs.writeFileSync(out,JSON.stringify({failed:1,error:error.stack,driverErrors:errors,evidence:{head,before}},null,2));console.log(JSON.stringify({failed:1,error:error.message,out}));process.exitCode=1;}
 finally{clearTimeout(timer);if(browser)await browser.close();}
})();
