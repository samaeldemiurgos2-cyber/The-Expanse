'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const core = require('../assets/save-core.js');
const targetFile = path.join(__dirname, '../assets/navigation-target.js');
const Target = fs.existsSync(targetFile) ? require(targetFile) : null;
const root = path.join(__dirname, '..');
const sourceData = JSON.parse(fs.readFileSync(path.join(root, 'expanse-data.json'), 'utf8'));

function camera() {
  return {mode:'chase',zoom:1,orbitAz:0.8,orbitEl:0.35,orbitR:3.2,pan:[0,0,0]};
}
function pose() { return {position:[6.5,2.6,3.5],yaw:0.2,pitch:-0.1}; }
function chartSnapshot(selection='karna-vex') {
  const value=core.fresh();
  value.lastView='interior';
  value.interior={deckId:'gas-ripley/deck-1',x:-3,z:453.72,yaw:0.4,pitch:0.1,roomId:'bridge_pod'};
  value.navigation={frame:'chart-mly',systemId:null,pose:pose(),camera:camera(),selection,phases:[],chartReturn:null};
  return core.validate(value);
}
function systemSnapshot() {
  const value=chartSnapshot();
  value.navigation={frame:'system-1000km',systemId:'karna-vex',pose:{position:[-3,0,461],yaw:1.1,pitch:0.1},
    camera:{...camera(),orbitR:12},selection:'karna-vex:featured',phases:[{id:'karna-vex:moon:veyra',angle:1.25}],
    chartReturn:{pose:pose(),camera:camera(),selection:'karna-vex'}};
  return core.validate(value);
}
function response(text, options={}) {
  const bytes=new TextEncoder().encode(text);
  const chunks=options.chunks || [bytes];
  let index=0;
  const readerState={readCount:0,cancelled:false,bodyCancelCount:0};
  const body=options.noBody ? null : {
    cancel(){readerState.bodyCancelCount++;return options.cancelBody?options.cancelBody():undefined;},
    getReader(){return {
      async read(){readerState.readCount++;return index<chunks.length?{done:false,value:typeof chunks[index]==='string'?new TextEncoder().encode(chunks[index++]):chunks[index++]}:{done:true};},
      async cancel(){readerState.cancelled=true;return undefined;},
      releaseLock(){}
    };}
  };
  return {ok:options.ok!==false,status:options.status||200,url:options.url||'https://expanse.test/app/expanse-data.json',
    headers:{get(name){return name.toLowerCase()==='content-length'?(options.contentLength===null?null:(options.contentLength===undefined?String(bytes.byteLength):String(options.contentLength))):null;}},body,readerState};
}
async function withGlobals(values, action) {
  const old=new Map();
  for(const [key,value] of Object.entries(values)){
    old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  try{return await action();}
  finally{
    for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
}

test('navigation target module is installed',()=>{
  assert.ok(Target,'assets/navigation-target.js is not implemented');
  for(const name of ['parseCatalog','patch','load'])assert.equal(typeof Target?.[name],'function',`missing ${name}()`);
});

test('world catalog IDs and names match the chart embedded catalog exactly',()=>{
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const match=html.match(/<script\b[^>]*\bid=["']expanse-data["'][^>]*>([\s\S]*?)<\/script>/i);
    assert.ok(match,'chart embedded catalog script was not found');
    const embedded=JSON.parse(match[1]);
    const actual=Target.parseCatalog(sourceData).worlds;
    assert.deepEqual(actual,embedded.worlds.map(({id,name})=>({id,name})));
    assert.equal(actual.length,14);
});

test('parseCatalog accepts only bounded own world identities and returns a safe array',()=>{
    const catalog=Target.parseCatalog({worlds:[{id:'alpha-1',name:'Alpha'},{id:'beta',name:'Beta'}]});
    assert.deepEqual(catalog.worlds,[{id:'alpha-1',name:'Alpha'},{id:'beta',name:'Beta'}]);
    assert.ok(Object.isFrozen(catalog.worlds));
    assert.ok(catalog.worlds.every(Object.isFrozen));
});

test('parseCatalog rejects missing, malformed, duplicate and oversized identities',()=>{
    const inherited=Object.create({id:'inherited'});inherited.name='Inherited';
    for(const data of [null,{}, {worlds:{}}, {worlds:[]}, {worlds:[inherited]},
      {worlds:[{id:'same',name:'One'},{id:'same',name:'Two'}]},
      {worlds:[{id:'x'.repeat(129),name:'Long ID'}]},
      {worlds:[{id:'bad id',name:'Bad ID'}]},
      {worlds:[{id:'x',name:'  '}]},
      {worlds:[{id:'x',name:'n'.repeat(257)}]},
      {worlds:Array.from({length:257},(_,i)=>({id:'w'+i,name:'World '+i}))}]){
      assert.throws(()=>Target.parseCatalog(data));
    }
});

test('chart patch changes only navigation.selection and does not mutate input',()=>{
    const catalog=Target.parseCatalog(sourceData),before=chartSnapshot();
    const expected=core.validate({...before,navigation:{...before.navigation,selection:'calavra'}});
    const next=Target.patch(before,'calavra',catalog);
    assert.deepEqual(next,expected);
    assert.equal(before.navigation.selection,'karna-vex');
    assert.deepEqual(next.interior,before.interior);
});

test('system patch changes only chartReturn.selection and validates parent system identity',()=>{
    const catalog=Target.parseCatalog(sourceData),before=systemSnapshot();
    const expected=core.validate({...before,navigation:{...before.navigation,
      chartReturn:{...before.navigation.chartReturn,selection:'calavra'}}});
    const next=Target.patch(before,'calavra',catalog);
    assert.deepEqual(next,expected);
    assert.equal(next.navigation.selection,'karna-vex:featured');
    assert.deepEqual(next.navigation.phases,before.navigation.phases);
    assert.deepEqual(next.navigation.pose,before.navigation.pose);
    assert.deepEqual(next.navigation.chartReturn.pose,before.navigation.chartReturn.pose);
    assert.throws(()=>Target.patch({...before,navigation:{...before.navigation,systemId:'unknown-system'}},'calavra',catalog));
});

test('all 14 explicit systems can stage all 14 catalog worlds without changing another field',()=>{
  const catalog=Target.parseCatalog(sourceData);
  const systemIDs=Object.keys(sourceData.systems);
  const worldIDs=sourceData.worlds.map(world=>world.id);
  assert.equal(systemIDs.length,14);
  assert.equal(worldIDs.length,14);
  let cases=0;
  for(const systemId of systemIDs){
    const initial=systemSnapshot();
    const before=core.validate({...initial,navigation:{...initial.navigation,systemId}});
    for(const worldId of worldIDs){
      const expected=core.validate({...before,navigation:{...before.navigation,
        chartReturn:{...before.navigation.chartReturn,selection:worldId}}});
      assert.deepEqual(Target.patch(before,worldId,catalog),expected,`${systemId} -> ${worldId}`);
      cases++;
    }
  }
  assert.equal(cases,196);
});

test('patch rejects null navigation, malformed snapshots and unknown or inherited targets',()=>{
    const catalog=Target.parseCatalog(sourceData),before=chartSnapshot();
    assert.throws(()=>Target.patch(core.fresh(),'karna-vex',catalog));
    assert.throws(()=>Target.patch(before,'toString',catalog));
    assert.throws(()=>Target.patch(before,'not-a-world',catalog));
    assert.throws(()=>Target.patch({...before,navigation:{...before.navigation,pose:{position:[NaN,0,0],yaw:0,pitch:0}},},'calavra',catalog));
});

test('load fetches only fixed same-origin app-relative JSON and coalesces one active request',async()=>{
    let calls=0,release;
    const delayed=new Promise(resolve=>{release=resolve;});
    await withGlobals({location:{origin:'https://expanse.test',href:'https://expanse.test/app/interior/'}},async()=>{
      globalThis.fetch=(url,options)=>{calls++;assert.equal(url,'https://expanse.test/app/interior/expanse-data.json');assert.equal(options.credentials,'same-origin');return delayed;};
      const first=Target.load('https://expanse.test/app/interior/');
      const second=Target.load('https://expanse.test/app/interior/');
      assert.strictEqual(first,second);
      await assert.rejects(Target.load('https://expanse.test/other/'),{code:'BUSY'});
      await Promise.resolve();
      assert.equal(calls,1);
      release(response(JSON.stringify(sourceData)));
      assert.equal((await first).worlds.length,14);
    });
});

test('load refuses file and foreign-origin bases without fetching',async()=>{
    let calls=0;
    await withGlobals({location:{origin:'https://expanse.test',href:'https://expanse.test/app/'}},async()=>{
      globalThis.fetch=()=>{calls++;throw new Error('unexpected fetch');};
      await assert.rejects(Target.load('file:///D:/Expanse/'),{code:'UNAVAILABLE'});
      await assert.rejects(Target.load('https://other.test/app/'),{code:'UNAVAILABLE'});
      assert.equal(calls,0);
    });
});

test('declared oversize is cancelled best-effort before reading and stays a fast SIZE failure',async()=>{
  const rejectedCancellation=response('{}',{contentLength:1048577,url:'https://expanse.test/app/expanse-data.json',
    cancelBody:()=>Promise.reject(new Error('body cancellation failed'))});
  const unsettledCancellation=response('{}',{contentLength:1048577,url:'https://expanse.test/app/expanse-data.json',
    cancelBody:()=>new Promise(()=>{})});
  let fetchIndex=0;
  await withGlobals({location:{origin:'https://expanse.test'},fetch:async()=>[rejectedCancellation,unsettledCancellation][fetchIndex++]},async()=>{
    await assert.rejects(Target.load('https://expanse.test/app/'),{code:'SIZE'});
    assert.equal(rejectedCancellation.readerState.bodyCancelCount,1);
    assert.equal(rejectedCancellation.readerState.readCount,0);
    const result=await Promise.race([
      Target.load('https://expanse.test/app/').then(value=>({value}),error=>({error})),
      new Promise(resolve=>setTimeout(()=>resolve({pending:true}),40))
    ]);
    assert.equal(result.pending,undefined,'a never-settling body cancel must not hold the SIZE result');
    assert.equal(result.error&&result.error.code,'SIZE');
    assert.equal(unsettledCancellation.readerState.bodyCancelCount,1);
    assert.equal(unsettledCancellation.readerState.readCount,0);
  });
});

test('malformed UTF-8 is reported as a coded INVALID catalog error',async()=>{
  const malformed=response('',{url:'https://expanse.test/app/expanse-data.json',chunks:[Uint8Array.of(0xc3,0x28)]});
  await withGlobals({location:{origin:'https://expanse.test'},fetch:async()=>malformed},async()=>{
    await assert.rejects(Target.load('https://expanse.test/app/'),error=>error.code==='INVALID'&&error.name==='SaveError');
  });
});

test('load enforces the byte ceiling while streaming before JSON parsing',async()=>{
    let received;
    await withGlobals({location:{origin:'https://expanse.test'},fetch:async url=>{
      received=response(' '.repeat(1048577),{contentLength:null,url});return received;
    }},async()=>{
      await assert.rejects(Target.load('https://expanse.test/app/'),{code:'SIZE'});
      assert.equal(received.readerState.cancelled,true);
    });
});

test('timeout releases the logical slot despite ignored abort and late old cleanup cannot clear a retry',async()=>{
  const timers=[];let oldResolve,retryResolve,oldSignal,calls=0;
  await withGlobals({location:{origin:'https://expanse.test'},setTimeout:(fn,ms)=>{assert.equal(ms,8000);timers.push(fn);return timers.length;},clearTimeout:()=>{},
    fetch:(url,{signal})=>{
      calls++;
      if(calls===1){oldSignal=signal;return new Promise(resolve=>{oldResolve=resolve;});}
      if(calls===2)return new Promise(resolve=>{retryResolve=resolve;});
      return Promise.resolve(response(JSON.stringify(sourceData),{url:'https://expanse.test/app/expanse-data.json'}));
    }},async()=>{
    const pending=Target.load('https://expanse.test/app/');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,1);
    timers[0]();
    await assert.rejects(pending,{code:'TIMEOUT'});
    assert.equal(oldSignal.aborted,true);
    const retry=Target.load('https://expanse.test/app/');
    retry.catch(()=>{});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls,2,'timeout must release the logical active-request slot immediately');
    oldResolve(response(JSON.stringify(sourceData),{url:'https://expanse.test/app/expanse-data.json'}));
    await new Promise(resolve=>setImmediate(resolve));
    assert.strictEqual(Target.load('https://expanse.test/app/'),retry,'late completion must not clear the newer retry');
    retryResolve(response(JSON.stringify(sourceData),{url:'https://expanse.test/app/expanse-data.json'}));
    assert.equal((await retry).worlds.length,14);
  });
});
