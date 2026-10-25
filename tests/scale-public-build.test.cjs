const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('public scale builder and reusable source generator exist',()=>{
 for(const file of ['tools/scale-source.mjs','tools/build-scale-preview.mjs'])assert.ok(fs.existsSync(path.join(root,file)),`Missing publication asset: ${file}`);
});
test('source generator preserves local output except the declared base href',async()=>{
 assert.ok(fs.existsSync(path.join(root,'tools/scale-source.mjs')),'Missing reusable source generator');
 const {generateScaleSource}=await import(pathToFileURL(path.join(root,'tools/scale-source.mjs')));
 const local=generateScaleSource(root),published=generateScaleSource(root,'../');
 assert.equal(published,local.replace('<base href="/">','<base href="../">'));
 assert.match(local,/<script>window.THREE=parent.THREE;<\/script>/);
 assert.match(local,/Isolated source builder: no background render or save loop/);
 assert.ok(!local.includes('requestAnimationFrame(function(now){ _last = now; requestAnimationFrame(loop); });'));
 assert.ok(!local.includes('startChartSaveSession().catch(function(error){'));
});
test('public build is deterministic, bounded to four files, and preserves accepted scripts',async()=>{
 assert.ok(fs.existsSync(path.join(root,'tools/build-scale-preview.mjs')),'Missing static publication builder');
 const {buildScalePreview}=await import(pathToFileURL(path.join(root,'tools/build-scale-preview.mjs')));
 const {generateScaleSource}=await import(pathToFileURL(path.join(root,'tools/scale-source.mjs')));
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'expanse-scale-build-'));
 try{
  buildScalePreview(root,temp);
  const names=['index.html','scale-prototype.js','scale-raster.js','scale-source.html'];
  assert.deepEqual(fs.readdirSync(temp).sort(),names.slice().sort());
  const before=names.map(n=>fs.readFileSync(path.join(temp,n)));
  buildScalePreview(root,temp);
  names.forEach((n,i)=>assert.deepEqual(fs.readFileSync(path.join(temp,n)),before[i]));
  assert.equal(fs.readFileSync(path.join(temp,'scale-prototype.js'),'utf8'),read('tests/scale-prototype.js').replace("iframe.src='/tests/scale-source.html'","iframe.src='./scale-source.html'"));
  assert.deepEqual(fs.readFileSync(path.join(temp,'scale-raster.js')),fs.readFileSync(path.join(root,'tests/scale-raster.js')));
  assert.equal(fs.readFileSync(path.join(temp,'scale-source.html'),'utf8'),generateScaleSource(root,'../'));
  const html=fs.readFileSync(path.join(temp,'index.html'),'utf8');
  assert.match(html,/<base href="\.\/">/);assert.match(html,/Public Scale Preview/);
  assert.match(html,/<a href="\.\.\/" target="_blank" rel="noopener noreferrer">/);
  for(const n of names){const s=fs.readFileSync(path.join(temp,n),'utf8');assert.doesNotMatch(s,/(?<![A-Za-z0-9])[A-Za-z]:[\\/]|file:\/\/|\/(?:Users|home)\/|(?:["'=])\/(?:tests|assets)\//i,n);}
 }finally{
  const resolvedTemp=path.resolve(temp),resolvedTempRoot=path.resolve(os.tmpdir());
  assert.equal(path.dirname(resolvedTemp),resolvedTempRoot,'Refuse cleanup outside the resolved temporary directory');
  assert.ok(path.basename(resolvedTemp).startsWith('expanse-scale-build-'),'Refuse cleanup without the task temporary-directory prefix');
  fs.rmSync(resolvedTemp,{recursive:true,force:true});
 }
});
