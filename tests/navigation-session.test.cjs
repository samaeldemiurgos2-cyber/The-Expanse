'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Core = require('../assets/save-core.js');
const root = path.join(__dirname, '..');
const sourceData = JSON.parse(fs.readFileSync(path.join(root, 'expanse-data.json'), 'utf8'));

function chartNavigation(selection='karna-vex') {
  return {frame:'chart-mly',systemId:null,pose:{position:[3,2,1],yaw:.25,pitch:0},
    camera:{mode:'chase',zoom:1,orbitAz:.5,orbitEl:.2,orbitR:3,pan:[0,0,0]},selection,phases:[],chartReturn:null};
}
function systemNavigation() {
  return {frame:'system-1000km',systemId:'karna-vex',pose:{position:[-3,0,461],yaw:1.1,pitch:.1},
    camera:{mode:'orbit',zoom:1,orbitAz:.5,orbitEl:.2,orbitR:12,pan:[0,0,0]},selection:'karna-vex:featured',
    phases:[{id:'karna-vex:moon:veyra',angle:1.25}],
    chartReturn:{pose:{position:[3,2,1],yaw:.25,pitch:0},camera:{mode:'chase',zoom:1,orbitAz:.5,orbitEl:.2,orbitR:3,pan:[0,0,0]},selection:'karna-vex'}};
}
function savedSnapshot(navigation=chartNavigation(), revision=4, savedAt='2026-10-23T12:00:00.000Z') {
  const value=Core.fresh();
  value.lastView='interior';
  value.interior={deckId:'gas-ripley/deck-1',x:-3,z:453.72,yaw:.4,pitch:.1,roomId:'bridge_pod'};
  value.navigation=navigation;
  value.revision=revision;value.savedAt=savedAt;
  return Core.validate(value);
}
function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function turn() { return new Promise(resolve=>setImmediate(resolve)); }
function plain(value) { return value===undefined?undefined:JSON.parse(JSON.stringify(value)); }

class Element {
  constructor(tag, document) {
    this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.listeners=new Map();this.dataset={};this.attributes={};
    this.open=false;this.hidden=false;this.value='';this.files=[];this.parentNode=null;this._id='';this.textContent='';
  }
  set id(value) { this._id=value;if(value)this.document.ids.set(value,this); }
  get id() { return this._id; }
  append(...nodes) { for(const node of nodes){if(node&&typeof node==='object'){node.parentNode=this;this.children.push(node);}} }
  appendChild(node) { this.append(node);return node; }
  setAttribute(name,value) { this.attributes[name]=String(value); }
  addEventListener(name,callback) { const list=this.listeners.get(name)||[];list.push(callback);this.listeners.set(name,list); }
  dispatch(name,event={}) { for(const callback of this.listeners.get(name)||[])callback({target:this,preventDefault(){this.defaultPrevented=true;},...event}); }
  click() { this.dispatch('click'); }
  focus() { this.document.activeElement=this; }
  showModal() { this.open=true; }
  close() { this.open=false;this.dispatch('close'); }
  querySelector(selector) {
    if(selector==='button'){
      const queue=[...this.children];while(queue.length){const item=queue.shift();if(item.tagName==='BUTTON')return item;queue.push(...item.children);}
    }
    return null;
  }
}
class Document {
  constructor(){this.ids=new Map();this.listeners=new Map();this.visibilityState='visible';this.activeElement=null;this.body=new Element('body',this);}
  createElement(tag){return new Element(tag,this);}
  getElementById(id){return this.ids.get(id)||null;}
  addEventListener(name,callback){const list=this.listeners.get(name)||[];list.push(callback);this.listeners.set(name,list);}
}

async function harness({navigation=chartNavigation(),current=null,storageUnavailable=false,stable=true,validateHook,commitHook}={}) {
  const document=new Document(),hooks={stable:()=>stable,pauseLog:[],applyCount:0,validateCalls:0,fetches:[],validateHook,commitHook,fetchGate:null,fetchError:null};
  hooks.pause=value=>hooks.pauseLog.push(value);
  hooks.validate=snapshot=>{hooks.validateCalls++;return hooks.validateCalls>1&&hooks.validateHook?hooks.validateHook(snapshot):undefined;};
  hooks.apply=()=>{hooks.applyCount++;return undefined;};
  const context={console,document,URL,TextEncoder,TextDecoder,Uint8Array,AbortController,performance:{now:()=>1000},
    location:{origin:'https://expanse.test',href:'https://expanse.test/app/walkthrough/index.html',assigned:[],assign(url){this.assigned.push(url);}},
    setTimeout,clearTimeout,addEventListener(){},confirm:()=>true};
  context.globalThis=context;context.__hooks=hooks;context.__catalogJSON=JSON.stringify(sourceData);
  context.MutationObserver=class {constructor(callback){this.callback=callback;}observe(){}disconnect(){}};
  const vmContext=vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/save-core.js'),'utf8'),vmContext,{filename:'save-core.js'});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/navigation-target.js'),'utf8'),vmContext,{filename:'navigation-target.js'});
  vm.runInContext(`
    globalThis.fetch=async function(url, options){
      __hooks.fetches.push({url,options});
      if(__hooks.fetchGate) await __hooks.fetchGate;
      if(__hooks.fetchError) throw __hooks.fetchError;
      const bytes=new TextEncoder().encode(__catalogJSON);let sent=false;
      return {ok:true,status:200,url,headers:{get(){return String(bytes.byteLength);}},body:{getReader(){return {
        async read(){if(sent)return {done:true};sent=true;return {done:false,value:bytes};},
        async cancel(){return undefined;},releaseLock(){}
      };}}};
    };
  `,vmContext);
  const durable={current:current===null?null:JSON.stringify(current),previous:null};
  const calls={commits:[],writes:0};
  function fromJSON(json){vmContext.__serialized=json;return vm.runInContext('JSON.parse(__serialized)',vmContext);}
  function saveError(code,message){vmContext.__errorCode=code;vmContext.__errorMessage=message;return vm.runInContext('new ExpanseSaveCore.SaveError(__errorCode,__errorMessage)',vmContext);}
  const repo={
    async read(){return {current:durable.current===null?null:fromJSON(durable.current),previous:durable.previous===null?null:fromJSON(durable.previous)};},
    async commit(candidate,expected){
      calls.writes++;calls.commits.push({candidate:JSON.parse(JSON.stringify(candidate)),expected});
      if(hooks.commitHook)await hooks.commitHook(candidate,expected);
      const actual=durable.current===null?0:JSON.parse(durable.current).revision;
      if(actual!==expected)throw saveError('CONFLICT','Another tab changed this save.');
      const next={...JSON.parse(JSON.stringify(candidate)),revision:actual+1,savedAt:'2026-10-23T13:00:00.000Z'};
      durable.previous=durable.current;durable.current=JSON.stringify(next);return fromJSON(durable.current);
    },
    async replace(candidate,expected){return this.commit(candidate,expected);},close(){}
  };
  context.ExpanseSaveStorage=Object.freeze({async open(){if(storageUnavailable)throw saveError('UNAVAILABLE','Storage unavailable.');return repo;}});
  vm.runInContext(fs.readFileSync(path.join(root,'assets/save-session.js'),'utf8'),vmContext,{filename:'save-session.js'});
  const initial=savedSnapshot(navigation,0,null);
  vmContext.__initialJSON=JSON.stringify(initial);
  vm.runInContext(`
    globalThis.__adapterState=JSON.parse(__initialJSON);
    globalThis.__adapter={
      capture(){return JSON.parse(JSON.stringify(__adapterState));},
      stable(){return __hooks.stable();},
      pause(value){__hooks.pause(value);},
      validate(snapshot){return __hooks.validate(snapshot);},
      apply(snapshot){return __hooks.apply(snapshot);}
    };
    globalThis.__setProgress=(x,z,yaw)=>{__adapterState.interior.x=x;__adapterState.interior.z=z;__adapterState.interior.yaw=yaw;};
    globalThis.__setNavigation=nav=>{__adapterState.navigation=nav?JSON.parse(JSON.stringify(nav)):null;};
  `,vmContext);
  const session=await vm.runInContext(`ExpanseSave.start({view:'interior',baseURL:'https://expanse.test/app/walkthrough/',host:document.body,adapter:__adapter})`,vmContext);
  return {session,document,context:vmContext,hooks,durable,calls,repo,fromJSON};
}

async function waitCatalog(controller) {
  for(let i=0;i<20;i++){
    const model=controller.readModel();
    if(model.catalog.status==='ready'||model.catalog.status==='error')return model;
    await turn();
  }
  throw new Error('catalog did not settle');
}

test('session exposes a bounded interior navigation controller and model contract',async()=>{
  const h=await harness();
  assert.equal(typeof h.session.openNavigationConsole,'function','openNavigationConsole() is missing');
  const controller=h.session.openNavigationConsole();
  assert.equal(typeof controller.readModel,'function');
  assert.equal(typeof controller.setChartTarget,'function');
  assert.equal(typeof controller.close,'function');
  assert.equal(typeof controller.retryCatalog,'function');
  const model=controller.readModel();
  assert.deepEqual(Object.keys(model).sort(),['busy','catalog','checkpoint','readableIdentities','snapshot','status'].sort());
  assert.equal(model.busy,false);
  assert.equal(model.snapshot.interior.x,-3);
  assert.deepEqual(plain(model.checkpoint),null);
  assert.deepEqual(plain(model.catalog),{status:'loading',error:null,worlds:[]});
  assert.deepEqual(Object.keys(model.readableIdentities).sort(),['chartTarget','localBody','system']);
  await assert.rejects(controller.retryCatalog(),{code:'BUSY'});
  assert.equal(h.hooks.pauseLog.at(-1),true);
  await controller.close();
});

test('direct interior opens read-only; chart and system identities are safely serialized',async()=>{
  const h=await harness({navigation:null});
  assert.equal(typeof h.session.openNavigationConsole,'function','openNavigationConsole() is missing');
  const controller=h.session.openNavigationConsole();
  const model=await waitCatalog(controller);
  assert.equal(model.catalog.status,'ready');
  assert.equal(model.readableIdentities.chartTarget,null);
  assert.equal(model.readableIdentities.system,null);
  assert.equal(model.readableIdentities.localBody,null);
  assert.ok(Array.isArray(model.catalog.worlds));
  assert.equal(model.catalog.worlds.length,14);
  assert.equal(await controller.setChartTarget('karna-vex').then(()=>false,e=>e.code==='INVALID'),true);
  assert.equal(h.calls.writes,0);
  await controller.close();
  const system=await harness({navigation:systemNavigation(),current:savedSnapshot(systemNavigation())});
  const systemController=system.session.openNavigationConsole();
  const systemModel=await waitCatalog(systemController);
  assert.deepEqual(plain(systemModel.readableIdentities.chartTarget),{id:'karna-vex',name:'Karna Vex'});
  assert.deepEqual(plain(systemModel.readableIdentities.system),{id:'karna-vex',name:'Karna Vex'});
  assert.deepEqual(plain(systemModel.readableIdentities.localBody),{id:'karna-vex:featured',label:'karna-vex:featured'});
  await systemController.close();
});

test('navigation lease refuses unstable or overlapping Save state',async()=>{
  const unstable=await harness({stable:false});
  assert.equal(typeof unstable.session.openNavigationConsole,'function','openNavigationConsole() is missing');
  assert.throws(()=>unstable.session.openNavigationConsole(),{code:'BUSY'});
  const h=await harness();
  const saveControl=h.document.getElementById('save-control');
  saveControl.click();
  assert.equal(h.document.getElementById('save-panel').open,true);
  assert.throws(()=>h.session.openNavigationConsole(),{code:'BUSY'});
});

test('Set keeps its candidate private until successful CAS and preserves live interior progress',async()=>{
  const gate=deferred();
  const h=await harness({current:savedSnapshot(),validateHook:()=>gate.promise});
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  vm.runInContext('__setProgress(-2.5,449.25,.65)',h.context);
  const pending=controller.setChartTarget('calavra');
  const whileBusy=controller.readModel();
  assert.equal(whileBusy.busy,true);
  assert.equal(whileBusy.snapshot.navigation.selection,'karna-vex');
  assert.equal(whileBusy.snapshot.interior.x,-2.5);
  assert.equal(h.calls.writes,0);
  gate.resolve();await pending;
  const after=controller.readModel();
  assert.equal(after.busy,false);
  assert.equal(after.snapshot.navigation.selection,'calavra');
  assert.equal(after.snapshot.interior.x,-2.5);
  assert.equal(h.calls.writes,1);
  assert.equal(h.calls.commits[0].expected,4);
  assert.equal(h.calls.commits[0].candidate.navigation.selection,'calavra');
  assert.deepEqual(plain(after.checkpoint),{revision:5,savedAt:'2026-10-23T13:00:00.000Z'});
  assert.equal(h.hooks.applyCount,1,'Set must not apply/teleport the exterior candidate');
  await controller.close();
});

test('system-frame Set changes only chart-return target and preserves current body, phases and pose',async()=>{
  const nav=systemNavigation();
  const h=await harness({navigation:nav,current:savedSnapshot(nav)});
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  await controller.setChartTarget('calavra');
  const saved=JSON.parse(h.durable.current);
  assert.equal(saved.navigation.chartReturn.selection,'calavra');
  assert.equal(saved.navigation.selection,'karna-vex:featured');
  assert.deepEqual(saved.navigation.phases,nav.phases);
  assert.deepEqual(saved.navigation.pose,nav.pose);
  assert.deepEqual(saved.navigation.camera,nav.camera);
  assert.deepEqual(saved.navigation.chartReturn.pose,nav.chartReturn.pose);
  assert.deepEqual(saved.navigation.chartReturn.camera,nav.chartReturn.camera);
  await controller.close();
});

test('Close and every Save entry path remain blocked through deferred validation',async()=>{
  const gate=deferred();
  const h=await harness({validateHook:()=>gate.promise});
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  const pending=controller.setChartTarget('calavra');
  assert.equal(controller.readModel().busy,true,'busy must be synchronous before validation awaits');
  assert.equal(await controller.close().then(()=>false,e=>e.code==='BUSY'),true);
  assert.throws(()=>h.document.getElementById('save-panel').showModal(),{code:'BUSY'});
  for(const operation of [()=>h.session.checkpoint(),()=>h.session.handoff('chart'),()=>h.session.importJSON(Core.stringify(savedSnapshot())),
    ()=>h.session.recoverPrevious(),()=>h.session.newJourney(),()=>h.session.retry(),()=>h.session.useMemoryOnly(),()=>h.session.continueWithoutSaving()]){
    await assert.rejects(Promise.resolve().then(operation),{code:'BUSY'});
  }
  h.session.tick();
  assert.equal(h.calls.writes,0);
  gate.resolve();await pending;
  await controller.close();
});

test('Close and a second Set stay blocked through deferred transaction completion',async()=>{
  const gate=deferred();
  const h=await harness({current:savedSnapshot(),commitHook:()=>gate.promise});
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  const first=controller.setChartTarget('calavra');
  await turn();
  assert.equal(controller.readModel().busy,true);
  assert.equal(h.calls.writes,1);
  assert.equal(await controller.close().then(()=>false,e=>e.code==='BUSY'),true);
  assert.equal(await controller.setChartTarget('lexor-aurex-prime').then(()=>false,e=>e.code==='BUSY'),true);
  gate.resolve();await first;
  await controller.close();
});

test('CAS failure keeps the old target and captured interior progress without candidate leakage',async()=>{
  const h=await harness({current:savedSnapshot()});
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  vm.runInContext('__setProgress(-1.75,448.5,.75)',h.context);
  h.repo.commit=async()=>{h.calls.writes++;throw Object.assign(new Error('Another tab changed this save.'),{code:'CONFLICT'});};
  await assert.rejects(controller.setChartTarget('calavra'));
  let model=controller.readModel();
  assert.equal(model.snapshot.navigation.selection,'karna-vex');
  assert.equal(model.snapshot.interior.x,-1.75);
  assert.equal(model.busy,false);
  assert.equal(model.status.code,'conflict');
  const validationsBefore=h.hooks.validateCalls,writesBefore=h.calls.writes;
  await assert.rejects(controller.setChartTarget('unknown-destination'),{code:'BLOCKED'});
  assert.equal(h.hooks.validateCalls,validationsBefore,'a conflict must block before adapter validation');
  assert.equal(h.calls.writes,writesBefore,'a conflict must block before another transaction');
  assert.equal(controller.readModel().snapshot.navigation.selection,'karna-vex');
  assert.equal(h.hooks.pauseLog.at(-1),true,'the active lease must retain the combined pause after conflict');
  h.session.tick();await turn();
  assert.equal(JSON.parse(h.durable.current).navigation.selection,'karna-vex');
  assert.equal(JSON.parse(h.durable.current).interior.x,-3);
  await controller.close();
});

test('memory-only explicit Set is page-only and does not claim a repository checkpoint',async()=>{
  const h=await harness({storageUnavailable:true});
  assert.equal(h.session.status().code,'memory');
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  await controller.setChartTarget('calavra');
  const model=controller.readModel();
  assert.equal(model.snapshot.navigation.selection,'calavra');
  assert.equal(model.status.code,'memory');
  assert.deepEqual(plain(model.checkpoint),null);
  assert.equal(h.calls.writes,0);
  await controller.close();
});

test('closing clears input while owning the pause, then invalidates all controller calls',async()=>{
  const h=await harness();
  const controller=h.session.openNavigationConsole();await waitCatalog(controller);
  const start=h.hooks.pauseLog.length;
  await controller.close();
  assert.deepEqual(h.hooks.pauseLog.slice(start),[true,false]);
  for(const call of [()=>controller.readModel(),()=>controller.setChartTarget('calavra'),()=>controller.retryCatalog(),()=>controller.close()]){
    await assert.rejects(Promise.resolve().then(call),{code:'STALE'});
  }
});

test('a catalog retry is bounded to the active controller and its error is visible',async()=>{
  const h=await harness();
  const controller=h.session.openNavigationConsole();
  h.hooks.fetchError=Object.assign(new Error('offline'),{name:'TypeError'});
  const failed=await waitCatalog(controller);
  assert.equal(failed.catalog.status,'error');
  assert.match(failed.catalog.error,/catalog|request|offline/i);
  h.hooks.fetchError=null;
  await controller.retryCatalog();
  const retried=await waitCatalog(controller);
  assert.equal(retried.catalog.status,'ready');
  assert.equal(h.hooks.fetches.length,2);
  const currentWorlds=await controller.retryCatalog();
  assert.equal(currentWorlds.length,14);
  assert.equal(h.hooks.fetches.length,2,'retry on a ready controller must not refetch');
  await controller.close();
});

test('closing before catalog response prevents stale publication while a new lease may reuse the bounded fetch',async()=>{
  const gate=deferred(),h=await harness();h.hooks.fetchGate=gate.promise;
  const oldController=h.session.openNavigationConsole();
  await turn();
  assert.equal(oldController.readModel().catalog.status,'loading');
  await oldController.close();
  const nextController=h.session.openNavigationConsole();
  assert.equal(h.hooks.fetches.length,1,'same-origin catalog fetch should remain coalesced');
  gate.resolve();
  await assert.rejects(Promise.resolve().then(()=>oldController.readModel()),{code:'STALE'});
  const model=await waitCatalog(nextController);
  assert.equal(model.catalog.status,'ready');
  assert.equal(model.catalog.worlds.length,14);
  await nextController.close();
});

test('checkpoint model reports repository-observed metadata, never an imported timestamp claim',async()=>{
  const current=savedSnapshot(chartNavigation(),9,'2026-10-20T08:00:00.000Z');
  const h=await harness({current});
  const controller=h.session.openNavigationConsole();
  assert.deepEqual(plain(controller.readModel().checkpoint),{revision:9,savedAt:'2026-10-20T08:00:00.000Z'});
  await waitCatalog(controller);
  await controller.close();
});

test('memory import cannot replace observed checkpoint metadata with imported revision or timestamp claims',async()=>{
  const observed={revision:9,savedAt:'2026-10-20T08:00:00.000Z'};
  const h=await harness({current:savedSnapshot(chartNavigation(),observed.revision,observed.savedAt)});
  h.session.useMemoryOnly();
  const imported=savedSnapshot(chartNavigation('calavra'),2099,'2099-01-01T00:00:00.000Z');
  await h.session.importJSON(Core.stringify(imported));
  const controller=h.session.openNavigationConsole();
  const model=controller.readModel();
  assert.deepEqual(plain(model.checkpoint),observed);
  assert.equal(model.snapshot.navigation.selection,'calavra');
  assert.equal(model.snapshot.revision,observed.revision);
  assert.equal(model.snapshot.savedAt,observed.savedAt);
  assert.notEqual(imported.revision,observed.revision);
  assert.notEqual(imported.savedAt,observed.savedAt);
  await waitCatalog(controller);
  await controller.close();
});
