'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const file of ['index.html','tests/save-harness.html'])test(file+' loads target command dependency before save session',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const target=html.indexOf('assets/navigation-target.js'),session=html.indexOf('assets/save-session.js');
  assert.ok(target>=0,'navigation target module must load');
  assert.ok(session>target,'target module must load before frozen session API is constructed');
});
