const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../assets/save-core.js');
test('shared save core is installed', () => assert.ok(fs.existsSync(file), 'save core is not implemented'));
const core = fs.existsSync(file) ? require(file) : null;
const camera = () => ({mode:'chase',zoom:1,orbitAz:0,orbitEl:0,orbitR:10,pan:[0,0,0]});
const pose = () => ({position:[6.5,2.6,3.5],yaw:0,pitch:0});
const nav = () => ({frame:'chart-mly',systemId:null,pose:pose(),camera:camera(),selection:'karna-vex',phases:[],chartReturn:null});
const interior = () => ({deckId:'gas-ripley/deck-1',x:0,z:450,yaw:0,pitch:0,roomId:'bridge_pod'});
if (core) {
  test('fresh envelope roundtrips without references to input', () => {
    const original = core.fresh(); const value = core.parse(core.stringify(original));
    assert.deepEqual(value, original); assert.notEqual(value.preferences, original.preferences);
  });
  test('chart and interior domains survive allowlisted partial preference merge', () => {
    const value = core.fresh(); value.navigation=nav(); value.interior=interior();
    const next=core.merge(value,{preferences:{quality:'low'}});
    assert.deepEqual(next.navigation,value.navigation); assert.deepEqual(next.interior,value.interior);
    assert.deepEqual(next.preferences,{quality:'low',sensitivity:1}); assert.equal(value.preferences.quality,'high');
  });
  test('system record carries independent chart return and normalized phases', () => {
    const value=core.fresh(); value.navigation={...nav(),frame:'system-1000km',systemId:'karna-vex',selection:'karna-vex:featured',phases:[{id:'karna-vex:moon:micqui-nobara',angle:9}],chartReturn:{pose:pose(),camera:camera(),selection:'karna-vex'}};
    const result=core.validate(value); assert.ok(result.navigation.phases[0].angle<Math.PI);
    assert.deepEqual(core.parse(core.stringify(result)),result);
  });
  test('unknown harmless properties are discarded, not given authority', () => {
    const value=core.fresh(); value.url='https://untrusted.invalid'; value.preferences.html='<script>';
    const result=core.validate(value); assert.ok(!('url' in result)); assert.ok(!('html' in result.preferences));
  });
  for (const key of ['__proto__','constructor','prototype']) test('rejects pollution-shaped '+key,()=>{
    const value=JSON.parse(core.stringify(core.fresh())); value.preferences=JSON.parse('{"quality":"high","sensitivity":1,"'+key+'":{"polluted":true}}');
    assert.throws(()=>core.validate(value)); assert.equal({}.polluted,undefined);
  });
  test('size is bounded before parsing',()=>assert.throws(()=>core.parse(' '.repeat(262145)),{code:'SIZE'}));
  test('malformed and future records fail closed',()=>{
    assert.throws(()=>core.parse('{')); assert.throws(()=>core.validate({...core.fresh(),schemaVersion:2}),{code:'VERSION'});
    assert.throws(()=>core.validate({...core.fresh(),runtimeCatalogVersion:2}),{code:'VERSION'});
  });
  const cases = [
    ['nonfinite coordinates',v=>{v.navigation=nav();v.navigation.pose.position[0]=NaN;}],
    ['overlarge coordinates',v=>{v.navigation=nav();v.navigation.pose.position[0]=1e9+1;}],
    ['short vector',v=>{v.navigation=nav();v.navigation.pose.position=[1,2];}],
    ['sparse stored vector',v=>{v.navigation=nav();v.navigation.pose.position=Array(3);}],
    ['invalid frame',v=>{v.navigation=nav();v.navigation.frame='meters';}],
    ['chart with system context',v=>{v.navigation=nav();v.navigation.systemId='karna-vex';}],
    ['system without return',v=>{v.navigation={...nav(),frame:'system-1000km',systemId:'karna-vex'};}],
    ['invalid selection',v=>{v.navigation=nav();v.navigation.selection='<script>';}],
    ['oversized identifier',v=>{v.navigation=nav();v.navigation.selection='x'.repeat(129);}],
    ['camera zoom',v=>{v.navigation=nav();v.navigation.camera.zoom=0;}],
    ['camera orbit chart bounds',v=>{v.navigation=nav();v.navigation.camera.orbitR=61;}],
    ['camera orbit elevation',v=>{v.navigation=nav();v.navigation.camera.orbitEl=2;}],
    ['camera elevation beyond original control bound',v=>{v.navigation=nav();v.navigation.camera.orbitEl=1.41;}],
    ['navigation pitch',v=>{v.navigation=nav();v.navigation.pose.pitch=2;}],
    ['interior pitch',v=>{v.interior=interior();v.interior.pitch=1.44;}],
    ['wrong deck',v=>{v.interior=interior();v.interior.deckId='deck-2';}],
    ['quality enum',v=>{v.preferences.quality='ultra';}],
    ['sensitivity bound',v=>{v.preferences.sensitivity=0;}],
    ['sensitivity below original .5 range',v=>{v.preferences.sensitivity=.49;}],
    ['sensitivity above original 2 range',v=>{v.preferences.sensitivity=2.01;}],
    ['negative revision',v=>{v.revision=-1;}],
    ['unsafe revision',v=>{v.revision=2**53;}],
    ['invalid timestamp',v=>{v.savedAt='yesterday';}],
    ['invalid lastView',v=>{v.lastView='https://evil.invalid';}],
    ['missing envelope field',v=>{delete v.navigation;}]
  ];
  for(const [name,mutate] of cases) test('rejects '+name,()=>{const value=core.fresh();mutate(value);assert.throws(()=>core.validate(value));});
  test('phase maps are bounded and reject duplicate identities',()=>{
    const value=core.fresh();value.navigation={...nav(),frame:'system-1000km',systemId:'karna-vex',chartReturn:{pose:pose(),camera:camera(),selection:null},phases:Array.from({length:129},(_,i)=>({id:'karna-vex:p:'+i,angle:0}))};
    assert.throws(()=>core.validate(value));value.navigation.phases=[{id:'karna-vex:star',angle:0},{id:'karna-vex:star',angle:1}];assert.throws(()=>core.validate(value));
  });
  test('merge cannot inject revision or replace unloaded domain by omission',()=>{
    const value=core.fresh();value.interior=interior();
    const result=core.merge(value,{revision:999,savedAt:'x',preferences:{sensitivity:2}});
    assert.equal(result.revision,0);assert.deepEqual(result.interior,value.interior);
  });
}
