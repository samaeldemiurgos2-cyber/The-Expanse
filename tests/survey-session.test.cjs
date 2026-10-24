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
  for(const name of ['orbital-position.js','survey-target.js']) if(fs.existsSync(path.join(root,'assets',name))) vm.runInContext(fs.readFileSync(path.join(root,'assets',name),'utf8'),vmContext,{filename:name});
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
  const session=await vm.runInContext(`ExpanseSave.start({view:'interior',baseURL:'https://expanse.test/app/',host:document.body,adapter:__adapter})`,vmContext);
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


function eligibleNavigation(clearance=8) {
 const world=sourceData.worlds.find(x=>x.id==='karna-vex'),def=sourceData.systems['karna-vex'];
 const nav=systemNavigation();
 nav.pose.position=[def.featured.orbit+def.moonStyles['micqui-nobara'].orbit+def.moonStyles['micqui-nobara'].radius+clearance,0,0];
 nav.selection='karna-vex:moon:veyra';
 nav.phases=[{id:'karna-vex:featured:'+def.featured.seed,angle:0},...world.moons.map(x=>({id:'karna-vex:moon:'+x.id,angle:0})),...def.planets.map(x=>({id:'karna-vex:planet:'+x.seed,angle:0}))];
 return nav;
}
async function sensor(h) {
 assert.equal(typeof h.session.openSurveyConsole,'function','openSurveyConsole() is missing');
 const c=h.session.openSurveyConsole();await waitCatalog(c);return c;
}
test('interior exposes an owned fixed-target survey controller',async()=>{
 const h=await harness({navigation:eligibleNavigation()});const c=await sensor(h),m=c.readModel();
 assert.equal(typeof c.recordSurvey,'function');assert.equal(m.range.eligible,true);assert.equal(m.record,null);
 assert.equal(h.hooks.pauseLog.at(-1),true);
 assert.throws(()=>h.session.openNavigationConsole(),{code:'BUSY'});assert.throws(()=>h.session.openSurveyConsole(),{code:'BUSY'});
 await assert.rejects(h.session.checkpoint(),{code:'BUSY'});assert.throws(()=>h.session.exportJSON(),{code:'BUSY'});
 await c.close();assert.equal(h.hooks.pauseLog.at(-1),false);assert.throws(()=>c.readModel(),{code:'STALE'});
});
test('record publishes only after completed save and preserves navigation and captured progress',async()=>{
 const gate=deferred();const h=await harness({navigation:eligibleNavigation(),commitHook:()=>gate.promise});
 const c=await sensor(h);vm.runInContext('__setProgress(-7,461,.8)',h.context);
 const before=plain(c.readModel().snapshot),p=c.recordSurvey();
 assert.equal(c.readModel().busy,true);await turn();
 assert.equal(h.session.snapshot().survey,null);assert.equal(c.readModel().record,null);assert.equal(h.calls.writes,1);
 await assert.rejects(c.close(),{code:'BUSY'});gate.resolve();const saved=await p;
 assert.deepEqual(plain(saved.navigation),before.navigation);assert.deepEqual(plain(saved.interior),before.interior);
 assert.equal(saved.survey.targetId,'karna-vex:moon:micqui-nobara');assert.ok(saved.survey.observedAt);
 assert.deepEqual(JSON.parse(h.durable.current).survey,plain(saved.survey));assert.equal(c.readModel().recordDurable,true);
 const repeat=await c.recordSurvey();assert.deepEqual(plain(repeat),plain(saved));assert.equal(h.calls.writes,1);await c.close();
});
test('deferred survey validation blocks competing mutation without publishing the record',async()=>{
 const gate=deferred();const h=await harness({navigation:eligibleNavigation(),validateHook:()=>gate.promise});
 const c=await sensor(h),p=c.recordSurvey();assert.equal(c.readModel().busy,true);
 assert.equal(h.calls.writes,0);assert.equal(h.session.snapshot().survey,null);
 await assert.rejects(c.close(),{code:'BUSY'});await assert.rejects(c.recordSurvey(),{code:'BUSY'});
 await assert.rejects(h.session.handoff('chart'),{code:'BUSY'});await assert.rejects(h.session.newJourney(),{code:'BUSY'});
 assert.throws(()=>h.session.useMemoryOnly(),{code:'BUSY'});gate.resolve();await p;await c.close();
});
test('failed survey write retains no record and actual pre-command progress',async()=>{
 const h=await harness({navigation:eligibleNavigation(),commitHook:()=>{throw Object.assign(new Error('QuotaExceededError'),{code:'UNAVAILABLE'});}});
 const c=await sensor(h);vm.runInContext('__setProgress(-8,462,.9)',h.context);const before=plain(c.readModel().snapshot);
 await assert.rejects(c.recordSurvey(),/QuotaExceeded/);assert.equal(h.session.snapshot().survey,null);
 assert.deepEqual(plain(h.session.snapshot().interior),before.interior);assert.equal(h.durable.current,null);
 assert.equal(c.readModel().recordDurable,false);assert.equal(h.hooks.pauseLog.at(-1),true);await c.close();
});
test('stale CAS blocks retries before another write',async()=>{
 const current=savedSnapshot(eligibleNavigation());const h=await harness({current,navigation:eligibleNavigation()});
 const c=await sensor(h);h.durable.current=JSON.stringify({...current,revision:current.revision+1});
 await assert.rejects(c.recordSurvey(),{code:'CONFLICT'});const writes=h.calls.writes;
 await assert.rejects(c.recordSurvey(),{code:'BLOCKED'});assert.equal(h.calls.writes,writes);assert.equal(h.session.snapshot().survey,null);await c.close();
});
test('wrong location or missing exterior is read-only; selected target does not grant range',async()=>{
 for(const nav of [null,chartNavigation(),eligibleNavigation(39)]){
  const h=await harness({navigation:nav});const c=await sensor(h);assert.equal(c.readModel().range.eligible,false);
  await assert.rejects(c.recordSurvey());assert.equal(h.calls.writes,0);assert.equal(h.session.snapshot().survey,null);await c.close();
 }
});
test('explicit memory survey stays page-only and never claims Saved',async()=>{
 const h=await harness({navigation:eligibleNavigation(),storageUnavailable:true});h.session.useMemoryOnly();const c=await sensor(h);
 const saved=await c.recordSurvey();assert.equal(saved.survey.targetId,'karna-vex:moon:micqui-nobara');
 assert.equal(h.calls.writes,0);assert.equal(c.readModel().recordDurable,false);assert.equal(h.session.status().code,'memory');
 await c.close();assert.equal(JSON.parse(h.session.exportJSON()).survey.targetId,saved.survey.targetId);
});

test('storage denial cannot create a survey before an explicit memory-mode choice',async()=>{
 const h=await harness({navigation:eligibleNavigation(),storageUnavailable:true}),c=await sensor(h);
 assert.equal(c.readModel().memoryChoiceRequired,true);
 await assert.rejects(c.recordSurvey(),{code:'BLOCKED'});assert.equal(h.session.snapshot().survey,null);assert.equal(h.calls.writes,0);
 await c.close();h.session.useMemoryOnly();const chosen=await sensor(h);
 assert.equal(chosen.readModel().memoryChoiceRequired,false);await chosen.recordSurvey();assert.ok(h.session.snapshot().survey);await chosen.close();
});

test('failed durable recording requires memory consent before a second page-only attempt',async()=>{
 const h=await harness({navigation:eligibleNavigation(),commitHook:()=>{throw Object.assign(new Error('Storage unavailable'),{code:'UNAVAILABLE'});}}),c=await sensor(h);
 await assert.rejects(c.recordSurvey(),{code:'UNAVAILABLE'});const writes=h.calls.writes;
 await assert.rejects(c.recordSurvey(),{code:'BLOCKED'});assert.equal(h.session.snapshot().survey,null);assert.equal(h.calls.writes,writes);
 await c.close();h.session.useMemoryOnly();const chosen=await sensor(h);await chosen.recordSurvey();assert.ok(chosen.readModel().record);assert.equal(chosen.readModel().recordDurable,false);assert.equal(h.calls.writes,writes);await chosen.close();
});
test('historical survey remains readable outside range and repeated command makes no write',async()=>{
 const current=savedSnapshot(eligibleNavigation(39));current.survey={targetId:'karna-vex:moon:micqui-nobara',observedAt:'2026-10-23T10:00:00.000Z'};
 const h=await harness({current,navigation:eligibleNavigation(39)}),c=await sensor(h);
 assert.equal(c.readModel().range.eligible,false);assert.equal(c.readModel().recordDurable,true);
 const old=plain(h.session.snapshot());await c.recordSurvey();assert.deepEqual(plain(h.session.snapshot()),old);assert.equal(h.calls.writes,0);
 await c.close();
});
test('UI-supplied record arguments have no target or timestamp authority',async()=>{
 const h=await harness({navigation:eligibleNavigation()}),c=await sensor(h);
 const result=await c.recordSurvey({targetId:'other',observedAt:'1900-01-01T00:00:00.000Z'});
 assert.equal(result.survey.targetId,'karna-vex:moon:micqui-nobara');
 assert.notEqual(result.survey.observedAt,'1900-01-01T00:00:00.000Z');
 assert.equal(new Date(result.survey.observedAt).toISOString(),result.survey.observedAt);await c.close();
});
test('page-only import cannot borrow durability from an unrelated older checkpoint',async()=>{
 const current=savedSnapshot(eligibleNavigation()),h=await harness({current,navigation:eligibleNavigation()});h.session.useMemoryOnly();
 const imported=structuredClone(current);imported.survey={targetId:'karna-vex:moon:micqui-nobara',observedAt:'2026-10-23T08:00:00.000Z'};
 await h.session.importJSON(JSON.stringify(imported));const c=await sensor(h),model=c.readModel();
 assert.equal(model.recordDurable,false);assert.deepEqual(plain(model.checkpoint),{revision:current.revision,savedAt:current.savedAt});
 assert.deepEqual(JSON.parse(h.durable.current),current);await c.close();
});
