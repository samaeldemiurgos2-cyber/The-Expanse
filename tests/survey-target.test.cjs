'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Core = require('../assets/save-core.js');
const root = path.join(__dirname, '..');
const orbitalFile = path.join(root, 'assets/orbital-position.js');
const surveyFile = path.join(root, 'assets/survey-target.js');

test('the orbital and fixed survey domain assets are installed', () => {
  assert.ok(fs.existsSync(orbitalFile), 'orbital domain missing');
  assert.ok(fs.existsSync(surveyFile), 'survey domain missing');
});

const data = JSON.parse(fs.readFileSync(path.join(root, 'expanse-data.json'), 'utf8'));
const TARGET = 'karna-vex:moon:micqui-nobara';
const clone = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));
function modules() {
  assert.ok(fs.existsSync(orbitalFile), 'orbital domain missing');
  assert.ok(fs.existsSync(surveyFile), 'survey domain missing');
  return {Orbital:require(orbitalFile), Survey:require(surveyFile)};
}
function phaseIDs() {
  const world = data.worlds.find(world => world.id === 'karna-vex');
  const def = data.systems['karna-vex'];
  return ['karna-vex:featured:' + def.featured.seed,
    ...world.moons.map(moon => 'karna-vex:moon:' + moon.id),
    ...def.planets.map(planet => 'karna-vex:planet:' + planet.seed)];
}
function center(a=0, b=0) {
  const i = -0.05851929216645658;
  return [7600*Math.cos(a)+590*Math.cos(b),590*Math.sin(b)*Math.sin(i),
    7600*Math.sin(a)+590*Math.sin(b)*Math.cos(i)];
}
function navigation(distance=10, a=0, b=0) {
  const moon = center(a,b);
  const camera = {mode:'chase',zoom:1,orbitAz:0,orbitEl:0,orbitR:10,pan:[0,0,0]};
  return {frame:'system-1000km',systemId:'karna-vex',
    pose:{position:[moon[0]+distance,moon[1],moon[2]],yaw:.25,pitch:0},camera,
    selection:'karna-vex:moon:veyra',phases:phaseIDs().map(id => ({id,angle:id.includes(':featured:')?a:id===TARGET?b:.5})),
    chartReturn:{pose:{position:[1,2,3],yaw:.2,pitch:0},camera:clone(camera),selection:'calavra'}};
}
function snapshot(nav=navigation()) {
  const value = Core.fresh();
  value.navigation=nav;value.lastView='interior';
  value.interior={deckId:'gas-ripley/deck-1',x:-6,z:455.25,yaw:.4,pitch:.1,roomId:'bridge_pod'};
  return value;
}
function invalid(action) { assert.throws(action,{code:'INVALID'}); }
function browserSurvey(overrides={}) {
  modules();
  const context = vm.createContext({URL,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,
    location:{origin:'https://expanse.test'},...overrides});
  for(const file of ['assets/save-core.js','assets/orbital-position.js','assets/survey-target.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  }
  return {Survey:context.ExpanseSurvey,Orbital:context.ExpanseOrbital};
}
function response(bytes=new TextEncoder().encode(JSON.stringify(data)), options={}) {
  let index=0;
  const calls={reads:0,cancels:0,locks:0};
  const chunks=options.chunks||[bytes];
  const body={
    cancel(){calls.cancels++;return options.cancel?options.cancel():undefined;},
    getReader(){calls.locks++;return {
      async read(){calls.reads++;return index<chunks.length?{value:chunks[index++],done:false}:{done:true};},
      cancel(){calls.cancels++;return options.cancel?options.cancel():undefined;},releaseLock(){}
    };}
  };
  return {ok:options.ok!==false,url:options.url||'https://expanse.test/app/expanse-data.json',redirected:options.redirected||false,
    headers:{get:()=>options.length===undefined?String(bytes.byteLength):options.length},body,calls};
}

test('orbital hash and PRNG retain source goldens and UMD globals have the fixed interface', () => {
  const {Orbital,Survey}=modules();
  assert.deepEqual(['','micqui-nobara','micqui-nobaraincl','🌙'].map(Orbital.hashSeed),
    [2166136261,3517077319,1894786115,3626983110]);
  assert.deepEqual(Array.from({length:4},Orbital.mulberry32(207)),
    [0.11709302384406328,0.9002171577885747,0.8337381505407393,0.7499755152966827]);
  assert.equal(Orbital.moonInclination('micqui-nobara'),-0.05851929216645658);
  assert.deepEqual(Object.keys(Orbital).sort(),['hashSeed','moonInclination','mulberry32','position'].sort());
  assert.deepEqual(Object.keys(Survey).sort(),['TARGET_ID','parseCatalog','load','evaluate','patch'].sort());
  const browser=browserSurvey();
  assert.equal(browser.Survey.TARGET_ID,TARGET);
  assert.equal(browser.Orbital.hashSeed('micqui-nobara'),Orbital.hashSeed('micqui-nobara'));
});

test('orbital position matches the actual renderer orbital loop at varied phases and translated parents', () => {
  const {Orbital}=modules();
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const loop=html.match(/for \(i = 0; i < A\.orbiters\.length; i\+\+\)\{[\s\S]*?\n  \}/);
  assert.ok(loop,'existing renderer orbital loop must remain testable');
  for(const quality of ['high','low'])for(const a of [0,.7,-2.4])for(const b of [0,1.2,-.8]) {
    const parent=[7600*Math.cos(a),0,7600*Math.sin(a)],incl=Orbital.moonInclination('micqui-nobara');
    let actual;
    const o={ang:b,r:590,incl,speed:.1,parent:{getWorldPosition(p){[p.x,p.y,p.z]=parent;}},
      node:{position:{set(...value){actual=value;}}}};
    const context={quality,ExpanseOrbital:Orbital,A:{orbiters:[o]},i:0,o:null,dt:0,
      _lp:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}}};
    vm.runInNewContext(loop[0],context);
    assert.deepEqual(Orbital.position(parent,590,b,incl),actual);
  }
});

test('orbital functions reject malformed and non-finite inputs without mutating their parent', () => {
  const {Orbital}=modules(),parent=[2,3,4];
  Orbital.position(parent,5,.4,.2);assert.deepEqual(parent,[2,3,4]);
  for(const args of [[null,1,0,0],[[1,2],1,0,0],[Array(3),1,0,0],[[0,0,NaN],1,0,0],[[0,0,0],-1,0,0],[[0,0,0],1,Infinity,0],[[0,0,0],1,0,NaN]]) {
    assert.throws(()=>Orbital.position(...args),TypeError);
  }
  assert.throws(()=>Orbital.hashSeed(2),TypeError);
  assert.throws(()=>Orbital.mulberry32(.5),TypeError);
  assert.throws(()=>Orbital.moonInclination(null),TypeError);
});

test('canonical catalog exposes only frozen source facts and retains private copied descriptors', () => {
  const {Survey}=modules(),input=clone(data),before=clone(input),catalog=Survey.parseCatalog(input);
  assert.deepEqual(catalog,{target:{id:TARGET,name:'Micqui-Nobara',lore:'Habitable moon of Karna Vex.',biome:'ocean',radius:6}});
  assert.ok(Object.isFrozen(catalog)&&Object.isFrozen(catalog.target));
  assert.deepEqual(input,before);
  input.systems['karna-vex'].featured.orbit=1;input.systems['karna-vex'].moonStyles['micqui-nobara'].radius=100;
  assert.equal(Survey.evaluate(navigation(),catalog).clearance,4);
  invalid(()=>Survey.evaluate(navigation(),{target:catalog.target}));
});

test('catalog rejects missing relationships, duplicate/prototype identities and invalid bounded descriptors', () => {
  const {Survey}=modules();
  const mutations=[
    d=>d.worlds.push(clone(d.worlds[0])), d=>d.worlds[0].id='constructor',
    d=>d.worlds[0].name='x'.repeat(257), d=>d.worlds[0].id='x'.repeat(129),
    d=>d.worlds=Array(257).fill(d.worlds[0]), d=>delete d.systems['karna-vex'],
    d=>d.systems['karna-vex'].featured.orbit=0, d=>d.systems['karna-vex'].featured.seed=117.5,
    d=>d.systems['karna-vex'].planets[1].seed=d.systems['karna-vex'].planets[0].seed,
    d=>delete d.systems['karna-vex'].moonStyles.veyra,
    d=>d.systems['karna-vex'].moonStyles['micqui-nobara'].radius=Infinity,
    d=>d.systems['karna-vex'].moonStyles['micqui-nobara'].orbit=-1,
    d=>d.systems['karna-vex'].moonStyles['micqui-nobara'].seed=NaN,
    d=>d.systems['karna-vex'].moonStyles['micqui-nobara'].biome='x'.repeat(129),
    d=>d.systems['karna-vex'].moonStyles.unknown=clone(d.systems['karna-vex'].moonStyles.veyra),
    d=>d.worlds.find(w=>w.id==='karna-vex').moons.pop(),
    d=>d.worlds.find(w=>w.id==='karna-vex').moons.push(clone(d.worlds.find(w=>w.id==='karna-vex').moons[0])),
    d=>d.worlds.find(w=>w.id==='karna-vex').moons.find(m=>m.id==='micqui-nobara').class='site',
    d=>d.worlds.find(w=>w.id==='karna-vex').moons.find(m=>m.id==='micqui-nobara').lore='x'.repeat(4097),
    d=>Object.defineProperty(d.systems,'karna-vex',{get(){throw Error('must not invoke catalog getters');}})
  ];
  for(const mutate of mutations){const input=clone(data);mutate(input);invalid(()=>Survey.parseCatalog(input));}
  invalid(()=>Survey.parseCatalog(Object.create(data)));
  const polluted=clone(data);polluted.systems=JSON.parse('{"__proto__":{},"karna-vex":{}}');invalid(()=>Survey.parseCatalog(polluted));
});

test('range uses exact center-distance (6,18] and default moon arrival 45 is outside', () => {
  const {Survey}=modules(),catalog=Survey.parseCatalog(data);
  for(const [distance,eligible] of [[0,false],[5,false],[6,false],[6+1e-7,true],[18,true],[18+1e-7,false],[45,false]]) {
    const nav=navigation(distance),result=Survey.evaluate(nav,catalog);
    const actualInputDistance=Math.abs(nav.pose.position[0]-8190);
    assert.equal(result.eligible,eligible,String(distance));
    assert.equal(result.centerDistance,actualInputDistance);assert.equal(result.clearance,actualInputDistance-6);
    assert.equal(result.radius,6);assert.equal(result.maxClearance,12);assert.equal(result.units,'system-1000km');
    assert.equal(typeof result.reason,'string');assert.ok(result.reason.length);
  }
});

test('range follows the moving parent and moon without overview offsets, selection, or chart target authority', () => {
  const {Survey}=modules(),catalog=Survey.parseCatalog(data);
  for(const [a,b] of [[.7,1.2],[-1.8,-.9],[Math.PI/2,Math.PI/2]]) {
    const nav=navigation(10,a,b),before=clone(nav);
    nav.selection='karna-vex:planet:911';nav.chartReturn.selection='uncharted';
    assert.ok(Survey.evaluate(nav,catalog).eligible);
    assert.deepEqual(nav,{...before,selection:nav.selection,chartReturn:{...before.chartReturn,selection:'uncharted'}});
  }
  const overview=navigation();overview.pose.position=[.05,.1,-.65];overview.selection=TARGET;
  assert.equal(Survey.evaluate(overview,catalog).eligible,false);
});

test('unsupported navigation remains read-only with no fabricated distances', () => {
  const {Survey}=modules(),catalog=Survey.parseCatalog(data);
  for(const nav of [null,{frame:'chart-mly'}, {...navigation(),systemId:'calavra'},{frame:'future'}]) {
    const value=Survey.evaluate(nav,catalog);
    assert.equal(value.eligible,false);assert.equal(value.centerDistance,null);assert.equal(value.clearance,null);
  }
});

test('all twelve Karna orbital phases are required exactly once with no fallback or extra identities', () => {
  const {Survey}=modules(),catalog=Survey.parseCatalog(data);
  assert.equal(phaseIDs().length,12);
  for(const mutate of [n=>n.phases.pop(),n=>n.phases.push(clone(n.phases[0])),n=>n.phases.push({id:'karna-vex:planet:999',angle:0}),
    n=>n.phases[0].id='karna-vex:featured:118',n=>n.phases[0].angle=NaN,n=>n.pose.position[0]=Infinity,
    n=>delete n.chartReturn,n=>n.phases=Array(12)]) {
    const nav=navigation();mutate(nav);invalid(()=>Survey.evaluate(nav,catalog));
  }
});

test('patch changes only survey on the real Core snapshot and validates the timestamp', () => {
  const {Survey}=modules(),catalog=Survey.parseCatalog(data),input=snapshot(),before=structuredClone(input);
  assert.equal(Core.fresh().schemaVersion,2,'independent schema-v2 Core dependency must be present');
  const observedAt='2026-10-24T00:00:00.000Z';
  const result=Survey.patch(input,catalog,observedAt);
  assert.deepEqual(result,{...Core.validate(before),survey:{targetId:TARGET,observedAt}});
  assert.deepEqual(input,before);assert.notStrictEqual(result,input);
  for(const date of [null,'','yesterday','2026-10-24T00:00:00Z'])invalid(()=>Survey.patch(input,catalog,date));
  invalid(()=>Survey.patch(snapshot(navigation(45)),catalog,observedAt));
});

test('an existing valid survey is idempotent away from range and does not require catalog or a new timestamp', () => {
  const {Survey}=modules(),input=snapshot(null);
  assert.equal(Core.fresh().schemaVersion,2,'independent schema-v2 Core dependency must be present');
  input.survey={targetId:TARGET,observedAt:'2026-10-24T00:00:00.000Z'};input.revision=7;input.savedAt='2026-10-24T00:01:00.000Z';
  const before=clone(input),result=Survey.patch(input,null,'invalid-new-time');
  assert.deepEqual(result,Core.validate(before));assert.deepEqual(input,before);assert.notStrictEqual(result,input);
});

test('load fixes the HTTP same-origin catalog URL, rejects file/foreign bases and coalesces active requests', async () => {
  let release,calls=0;
  const {Survey}=browserSurvey({fetch:(url,options)=>{calls++;assert.equal(url,'https://expanse.test/app/expanse-data.json');
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'same-origin');return new Promise(resolve=>{release=resolve;});}});
  await assert.rejects(Survey.load('file:///D:/app/'),{code:'UNAVAILABLE'});
  await assert.rejects(Survey.load('https://foreign.test/app/'),{code:'UNAVAILABLE'});
  const first=Survey.load('https://expanse.test/app/'),second=Survey.load('https://expanse.test/app/');
  assert.strictEqual(first,second);
  await assert.rejects(Survey.load('https://expanse.test/other/'),{code:'BUSY'});
  await turn();assert.equal(calls,1);release(response());assert.equal((await first).target.id,TARGET);
});

test('load rejects redirects, HTTP failure, malformed JSON and malformed UTF-8 with coded errors', async () => {
  for(const [received,code] of [[response(undefined,{redirected:true}),'UNAVAILABLE'],
    [response(undefined,{url:'https://expanse.test/other/expanse-data.json'}),'UNAVAILABLE'],
    [response(undefined,{ok:false}),'UNAVAILABLE'],[response(new TextEncoder().encode('{')),'INVALID'],
    [response(Uint8Array.of(0xc3,0x28)),'INVALID'],[response(Uint8Array.of(0xc3)),'INVALID']]) {
    const {Survey}=browserSurvey({fetch:async()=>received});
    await assert.rejects(Survey.load('https://expanse.test/app/'),{code});
  }
});

test('load caps declared and streamed bytes and cancellation cannot delay or replace SIZE', async () => {
  for(const received of [response(undefined,{length:'1048577',cancel:()=>Promise.reject(Error('cancel failed'))}),
    response(new Uint8Array(1048577),{length:null,cancel:()=>new Promise(()=>{})})]) {
    const {Survey}=browserSurvey({fetch:async()=>received});
    const outcome=await Promise.race([Survey.load('https://expanse.test/app/').then(()=>null,error=>error),new Promise(resolve=>setTimeout(()=>resolve('hung'),80))]);
    assert.equal(outcome.code,'SIZE');assert.equal(received.calls.cancels,1);
    if(received.headers.get()==='1048577')assert.equal(received.calls.reads,0);
  }
});

test('timeout aborts and releases the logical slot; a late response cannot clear the newer retry', async () => {
  const timers=[];let firstResolve,secondResolve,firstSignal,calls=0;
  const {Survey}=browserSurvey({setTimeout:(fn,ms)=>{assert.equal(ms,8000);timers.push(fn);return timers.length;},clearTimeout(){},
    fetch:(url,{signal})=>{calls++;if(calls===1){firstSignal=signal;return new Promise(resolve=>{firstResolve=resolve;});}
      return new Promise(resolve=>{secondResolve=resolve;});}});
  const first=Survey.load('https://expanse.test/app/');await turn();timers[0]();
  await assert.rejects(first,{code:'TIMEOUT'});assert.ok(firstSignal.aborted);
  const retry=Survey.load('https://expanse.test/app/');await turn();assert.equal(calls,2);
  const late=response();firstResolve(late);await turn();
  assert.strictEqual(Survey.load('https://expanse.test/app/'),retry);assert.equal(late.calls.reads,0);assert.equal(late.calls.cancels,1);
  secondResolve(response());assert.equal((await retry).target.id,TARGET);
});
