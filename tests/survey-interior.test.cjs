'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const modulePath = path.join(__dirname, '../assets/survey-console.js');
const SurveyConsole = fs.existsSync(modulePath) ? require(modulePath) : null;

test('the Sensors console provides its UMD mount API', () => {
  assert.ok(SurveyConsole && typeof SurveyConsole.mount === 'function', 'Sensors console mount is not implemented');
});

const TARGET = 'karna-vex:moon:micqui-nobara';
const observedAt = '2026-10-24T00:00:00.000Z';
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve,reject; const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; }

class Element {
  constructor(tag, doc) {
    this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentNode=null;
    this.listeners=new Map();this.attributes=new Map();this.dataset={};this.hidden=false;this.disabled=false;
    this.open=false;this.textContent='';this.className='';this._id='';this.title='';
  }
  set id(value) { this._id=value;this.ownerDocument.ids.set(value,this); }
  get id() { return this._id; }
  setAttribute(name,value) { this.attributes.set(name,String(value)); }
  getAttribute(name) { return this.attributes.get(name)??null; }
  append(...nodes) { for(const node of nodes){node.parentNode=this;this.children.push(node);} }
  addEventListener(type,listener) { const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list); }
  dispatch(type,values={}) {
    const event={type,target:this,defaultPrevented:false,cancelable:true,
      preventDefault(){if(this.cancelable)this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...values};
    let node=this;
    while(node){for(const listener of node.listeners.get(type)||[])listener(event);if(event.propagationStopped)break;node=node.parentNode;}
    return event;
  }
  focus() { this.ownerDocument.activeElement=this; }
  showModal() { this.open=true;this.ownerDocument.order.push('showModal'); }
  close() { if(!this.open)return;this.open=false;this.ownerDocument.order.push('nativeClose');this.dispatch('close'); }
  setPointerCapture() { this.ownerDocument.captureCalls++; }
}
class Document {
  constructor(){this.ids=new Map();this.listeners=new Map();this.order=[];this.captureCalls=0;this.activeElement=null;this.body=new Element('body',this);}
  createElement(tag){return new Element(tag,this);}
  getElementById(id){return this.ids.get(id)||null;}
  addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list);}
  dispatch(type,values={}){
    const event={type,target:this.body,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...values};
    for(const listener of this.listeners.get(type)||[])listener(event);return event;
  }
  querySelectorAll(selector){
    const found=[];function visit(node){if(selector==='dialog[open]'?node.tagName==='DIALOG'&&node.open:node.tagName===selector.toUpperCase())found.push(node);for(const child of node.children)visit(child);}visit(this.body);return found;
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  exitPointerLock(){this.captureCalls++;}
}
function baseModel(overrides={}) {
  return {snapshot:{navigation:{frame:'system-1000km',systemId:'karna-vex'},interior:{x:-3,z:461}},
    status:{code:'saved',message:'Saved at an earlier checkpoint'},busy:false,catalog:{status:'ready',error:null},
    target:{id:TARGET,name:'Micqui-Nobara',lore:'Habitable moon of Karna Vex.',biome:'ocean',radius:6},
    range:{eligible:true,reason:null,centerDistance:14,clearance:8,radius:6,maxClearance:12,units:'system-1000km'},
    record:null,recordDurable:false,memoryChoiceRequired:false,checkpoint:{revision:7,savedAt:'2026-10-23T12:00:00.000Z'},...overrides};
}
function harness({model=baseModel(),eligible=true,fileMode=false,record,retry,close,beforeLease}={}) {
  assert.ok(SurveyConsole&&typeof SurveyConsole.mount==='function','Sensors console mount is not implemented');
  const document=new Document(),host=document.createElement('div');document.body.append(host);
  const calls={opens:0,records:[],retries:0,closes:0};
  const h={document,host,calls,model,eligibility:eligible,openError:null,readError:null};
  h.controller={
    readModel(){if(h.readError)throw h.readError;return h.model;},
    recordSurvey(...args){calls.records.push(args);return record?record(h):Promise.resolve().then(()=>{
      h.model.record={targetId:TARGET,observedAt};h.model.recordDurable=true;h.model.status={code:'saved',message:'Survey checkpoint completed'};
    });},
    retryCatalog(){calls.retries++;return retry?retry(h):Promise.resolve().then(()=>{h.model.catalog={status:'ready',error:null};});},
    close(){calls.closes++;return Promise.resolve().then(()=>close&&close(h)).then(()=>{document.order.push('release');});},
  };
  h.session={openSurveyConsole(){calls.opens++;if(h.openError)throw h.openError;document.order.push('lease');if(beforeLease)beforeLease(h);return h.controller;}};
  h.ui=SurveyConsole.mount({session:h.session,host,eligible:()=>h.eligibility,
    identity:()=>({station:{id:'st_ops',name:'Ops'},shipName:'GAS Ripley',deckName:'1st Deck',fileMode})});
  h.node=id=>document.getElementById(id);
  return h;
}
function allText(node){return [node.textContent,...node.children.map(allText)].join('\n');}
function watchText(node){let value=node.textContent,writes=0;Object.defineProperty(node,'textContent',{configurable:true,get:()=>value,set(next){value=next;writes++;}});return ()=>writes;}

test('classic script exposes ExpanseSurveyConsole without requiring DOM access at load',()=>{
  assert.ok(SurveyConsole,'Sensors console mount is not implemented');
  const context={};vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),context);
  assert.equal(typeof context.ExpanseSurveyConsole.mount,'function');
});
test('mount creates the labelled dialog and the winner-only focusable Ops prompt',()=>{
  const h=harness({eligible:false}),prompt=h.node('survey-control'),panel=h.node('survey-panel');
  assert.equal(prompt.tagName,'BUTTON');assert.equal(prompt.textContent,'E — Sensors · Ops');assert.equal(prompt.hidden,true);
  assert.equal(prompt.disabled,false);assert.equal(prompt.getAttribute('aria-haspopup'),'dialog');
  assert.equal(panel.tagName,'DIALOG');assert.ok(h.node(panel.getAttribute('aria-labelledby')));
  assert.equal(h.node('survey-status').getAttribute('role'),'status');assert.equal(h.node('survey-status').getAttribute('aria-live'),'polite');
  h.eligibility={eligible:true,station:{id:'st_ops'},distance:3};h.ui.update();assert.equal(prompt.hidden,false);
  assert.deepEqual(Object.keys(h.ui).sort(),['close','isOpen','open','update']);
});
test('E filters repeat, modifiers, text entry and already consumed events; opening owns the lease before modal show',()=>{
  const h=harness({beforeLease(h){h.eligibility=false;}});
  for(const values of [{repeat:true},{altKey:true},{ctrlKey:true},{metaKey:true},{shiftKey:true},{defaultPrevented:true},
    ...['input','textarea','select'].map(tag=>({target:h.document.createElement(tag)})),{target:{isContentEditable:true}}]){
    h.document.dispatch('keydown',{key:'e',...values});
  }
  assert.equal(h.calls.opens,0);
  const event=h.document.dispatch('keydown',{key:'e'});
  assert.equal(event.defaultPrevented,true);assert.equal(h.calls.opens,1);assert.equal(h.node('survey-panel').open,true);
  assert.deepEqual(h.document.order,['lease','showModal']);
  assert.equal(h.document.activeElement.id,'survey-record','paused physical eligibility is not rechecked after owning the lease');
});
test('a stale hidden prompt cannot open when live eligibility is false',()=>{
  const h=harness();h.eligibility=false;
  h.node('survey-control').dispatch('click');h.document.dispatch('keydown',{key:'e'});
  assert.equal(h.calls.opens,0);assert.equal(h.ui.open(),false);
});
test('prompt pointer events are consumed and tap opens without any pointer capture',()=>{
  const h=harness();let escaped=0;h.host.addEventListener('pointerdown',()=>escaped++);h.host.addEventListener('click',()=>escaped++);
  const down=h.node('survey-control').dispatch('pointerdown'),click=h.node('survey-control').dispatch('click');
  assert.equal(down.defaultPrevented,true);assert.equal(click.defaultPrevented,true);assert.equal(escaped,0);
  assert.equal(h.ui.isOpen(),true);assert.equal(h.document.captureCalls,0);
});
test('instance showModal cannot open unowned or stack over another native modal',()=>{
  const h=harness({eligible:false}),panel=h.node('survey-panel');panel.showModal();assert.equal(panel.open,false);
  const save=h.document.createElement('dialog');h.document.body.append(save);save.showModal();
  h.eligibility=true;panel.showModal();assert.equal(h.ui.open(),false);assert.equal(panel.open,false);assert.equal(h.calls.opens,0);
});
test('a competing modal appearing during lease acquisition releases the failed opening exactly once',async()=>{
  const h=harness({beforeLease(h){const other=h.document.createElement('dialog');h.document.body.append(other);other.showModal();}});
  assert.equal(h.ui.open(),false);await turn();assert.equal(h.node('survey-panel').open,false);assert.equal(h.calls.closes,1);assert.equal(h.ui.isOpen(),false);
});
test('facts, center distance, surface clearance and gameplay units are explicitly distinguished',()=>{
  const h=harness();h.ui.open();const panel=allText(h.node('survey-panel'));
  for(const fact of ['Micqui-Nobara',TARGET,'Ops','GAS Ripley','1st Deck','Catalog information','ocean','Habitable moon of Karna Vex.'])assert.ok(panel.includes(fact),fact);
  assert.match(h.node('survey-range').textContent,/Center distance: 14.*Surface clearance: 8/);
  assert.match(h.node('survey-band').textContent,/0 < c ≤ 2R.*12/);
  assert.match(h.node('survey-scale').textContent,/1000 km.*compressed/i);
  assert.match(h.node('survey-checkpoint').textContent,/completed local checkpoint.*revision 7/i);
  assert.equal(h.node('survey-record').textContent,'Record survey');assert.equal(h.calls.records.length,0);
});
test('an out-of-range boarding context stays read-only with Return/approach/board guidance and Close focus',()=>{
  const h=harness({model:baseModel({range:{eligible:false,reason:'Outside the approach band',centerDistance:45,clearance:39,radius:6,maxClearance:12}})});
  h.ui.open();assert.equal(h.node('survey-record').disabled,true);assert.equal(h.node('survey-close').disabled,false);
  assert.equal(h.document.activeElement.id,'survey-close');assert.match(h.node('survey-status').textContent,/Outside.*Return.*approach.*board/i);
  h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,0);
});
test('Record rechecks current range before invoking the fixed no-argument command',()=>{
  const h=harness();h.ui.open();h.model.range.eligible=false;h.model.range.reason='Exterior context unavailable';
  h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,0);assert.equal(h.node('survey-record').disabled,true);
});
test('loading catalog is read-only and leaves Close reachable without fabricating range or facts',()=>{
  const h=harness({model:baseModel({catalog:{status:'loading',error:null},target:null,range:{eligible:false,reason:'Wait for catalog'}})});
  h.ui.open();assert.equal(h.node('survey-record').disabled,true);assert.equal(h.node('survey-close').disabled,false);
  assert.match(h.node('survey-facts').textContent,/unavailable/i);assert.match(h.node('survey-range').textContent,/unavailable/i);
  assert.match(h.node('survey-status').textContent,/Loading/i);assert.equal(h.node('survey-retry').hidden,true);
});
test('file mode preserves an imported historical record but never invokes Record or catalog Retry',()=>{
  const model=baseModel({catalog:{status:'error',error:'File catalog unavailable'},target:null,record:{targetId:TARGET,observedAt},recordDurable:false});
  const h=harness({model,fileMode:true});h.ui.open();
  assert.match(h.node('survey-record-view').textContent,/2026-10-24/);assert.match(h.node('survey-status').textContent,/File mode/i);
  assert.equal(h.node('survey-record').disabled,true);assert.equal(h.node('survey-retry').disabled,true);
  h.node('survey-record').dispatch('click');h.node('survey-retry').dispatch('click');assert.equal(h.calls.records.length,0);assert.equal(h.calls.retries,0);
});
test('an existing durable record remains readable outside range and during catalog failure',()=>{
  const model=baseModel({record:{targetId:TARGET,observedAt},recordDurable:true,target:null,catalog:{status:'error',error:'offline'},range:{eligible:false,reason:'Wrong system'}});
  const h=harness({model});h.ui.open();
  assert.match(h.node('survey-record-view').textContent,/Micqui-Nobara.*2026-10-24/);
  assert.match(h.node('survey-record-durability').textContent,/record.*completed local checkpoint/i);
  assert.equal(h.node('survey-record').disabled,true);assert.equal(h.node('survey-record').textContent,'Survey recorded');
  assert.equal(h.node('survey-retry').hidden,false);h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,0);
});
test('recording is explicit, passes no caller data and becomes a disabled historical view on success',async()=>{
  const h=harness();h.ui.open();h.ui.update();assert.equal(h.calls.records.length,0);
  h.node('survey-record').dispatch('click');await turn();assert.deepEqual(h.calls.records,[[]]);
  assert.match(h.node('survey-record-view').textContent,/2026-10-24/);assert.equal(h.node('survey-record').disabled,true);
  h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,1);
});
test('accepted recording blocks all Close paths and repeated actions until settlement',async()=>{
  const gate=deferred(),h=harness({record:()=>gate.promise});h.ui.open();h.node('survey-record').dispatch('click');
  assert.equal(h.node('survey-close').disabled,true);assert.equal(h.node('survey-record').disabled,true);
  assert.equal(h.node('survey-panel').dispatch('cancel').defaultPrevented,true);
  h.node('survey-panel').close();h.node('survey-close').dispatch('click');h.node('survey-record').dispatch('click');h.node('survey-retry').dispatch('click');
  assert.equal(await h.ui.close(),false);assert.equal(h.node('survey-panel').open,true);assert.equal(h.calls.closes,0);assert.equal(h.calls.records.length,1);
  gate.resolve();await turn();assert.equal(h.node('survey-close').disabled,false);assert.equal(h.node('survey-panel').open,true);
  await h.ui.close();assert.ok(h.document.order.indexOf('release')<h.document.order.indexOf('nativeClose'));
});
for(const fails of [false,true])test('forced native close during recording releases exactly once after '+(fails?'failure':'success'),async()=>{
  const gate=deferred();const h=harness({record:async(h)=>{
    try{await gate.promise;h.model.record={targetId:TARGET,observedAt};h.model.recordDurable=true;h.model.status={code:'saved',message:'Survey checkpoint completed'};}
    catch(error){h.model.status={code:'memory',message:'Memory only — '+error.message};throw error;}
  }});
  h.ui.open();h.node('survey-record').dispatch('click');
  assert.equal(h.node('survey-panel').dispatch('cancel').defaultPrevented,true);
  const forced=h.node('survey-panel').dispatch('cancel',{cancelable:false});assert.equal(forced.defaultPrevented,false);
  Element.prototype.close.call(h.node('survey-panel'));
  assert.equal(h.node('survey-panel').open,false);assert.equal(h.ui.isOpen(),true,'the pending lease remains owned despite native dismissal');assert.equal(h.calls.closes,0);
  if(fails)gate.reject(new Error('Checkpoint failed (QuotaExceededError); old data retained'));else gate.resolve();
  await turn();assert.equal(h.calls.closes,1);assert.equal(h.ui.isOpen(),false);assert.equal(h.document.activeElement.id,'survey-control');
  assert.equal(!!h.model.record,!fails);assert.equal(h.document.captureCalls,0);
  assert.equal(h.ui.open(),true,'a new opening must not inherit the forced-close latch');h.ui.update();assert.equal(h.node('survey-panel').open,true);await h.ui.close();
});
test('an idle native close event releases the controller and returns focus without input capture',async()=>{
  const h=harness();h.ui.open();Element.prototype.close.call(h.node('survey-panel'));await turn();
  assert.equal(h.calls.closes,1);assert.equal(h.ui.isOpen(),false);assert.equal(h.document.activeElement.id,'survey-control');assert.equal(h.document.captureCalls,0);
});
test('owned Close waits for release before dismissing native UI and rejects an intervening Record',async()=>{
  const gate=deferred(),h=harness({close:()=>gate.promise});h.ui.open();const closing=h.ui.close();
  h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,0);assert.equal(h.node('survey-panel').open,true);
  gate.resolve();await closing;assert.equal(h.calls.closes,1);assert.equal(h.node('survey-panel').open,false);
});
test('catalog retry can be closed and late rejection cannot alter a reopened generation',async()=>{
  const gate=deferred(),h=harness({model:baseModel({catalog:{status:'error',error:'offline'},target:null}),retry:()=>gate.promise});
  h.ui.open();h.node('survey-retry').dispatch('click');assert.equal(h.calls.retries,1);assert.equal(h.node('survey-close').disabled,false);
  await h.ui.close();h.model=baseModel();h.ui.open();const before=h.node('survey-status').textContent,writes=watchText(h.node('survey-status'));
  gate.reject(new Error('late old catalog failure'));await turn();assert.equal(h.node('survey-status').textContent,before);assert.equal(writes(),0);
  assert.equal(h.node('survey-panel').open,true);await h.ui.close();
});
test('catalog Retry is guarded while loading, blocked or session-busy',()=>{
  for(const patch of [{catalog:{status:'loading',error:null}},{status:{code:'conflict',message:'CAS conflict'}},{busy:true}]){
    const h=harness({model:baseModel(patch)});h.ui.open();h.node('survey-retry').dispatch('click');assert.equal(h.calls.retries,0);
  }
});
test('BUSY opening feedback resets without hiding or disabling a physically eligible background-save prompt',()=>{
  const h=harness(),prompt=h.node('survey-control');h.openError=new Error('Background checkpoint busy');assert.equal(h.ui.open(),false);
  assert.match(prompt.title,/busy/i);assert.equal(prompt.dataset.state,'unavailable');prompt.focus();h.model.status={code:'saving',message:'Saving…'};
  h.ui.update();assert.equal(prompt.hidden,false);assert.equal(prompt.disabled,false);assert.equal(h.document.activeElement,prompt);assert.equal(prompt.dataset.state,undefined);
  assert.doesNotMatch(prompt.title,/busy/i);h.openError=null;h.model.status={code:'saved'};assert.equal(h.ui.open(),true);
});
test('unchanged model updates do not rewrite status, facts, record or checkpoint text',()=>{
  const h=harness();h.ui.open();const writes=['survey-status','survey-facts','survey-record-view','survey-checkpoint'].map(id=>watchText(h.node(id)));
  h.ui.update();h.ui.update();assert.deepEqual(writes.map(count=>count()),[0,0,0,0]);
});
test('a memory failure reason is visible with export guidance and one stable result write',async()=>{
  const reason='Checkpoint failed (QuotaExceededError); old data retained',gate=deferred();
  const h=harness({model:baseModel({checkpoint:null}),record:async(h)=>{try{await gate.promise;}catch(error){h.model.status={code:'memory',message:'Memory only — '+reason};throw error;}}});
  h.ui.open();h.node('survey-record').dispatch('click');const writes=watchText(h.node('survey-status'));
  gate.reject(new Error(reason));await turn();assert.match(h.node('survey-status').textContent,/QuotaExceededError.*old data retained/);assert.equal(writes(),1);
  assert.match(h.node('survey-memory-note').textContent,/This page only.*close Sensors.*export JSON/i);assert.doesNotMatch(allText(h.node('survey-panel')),/\bSaved\b/);
  h.ui.update();assert.equal(writes(),1);assert.equal(h.node('survey-record-view').textContent,'No visitor survey has been recorded.');
});
test('session memory messages are retained and an imported record cannot inherit durability from an older checkpoint',()=>{
  const h=harness({model:baseModel({record:{targetId:TARGET,observedAt},recordDurable:false,
    status:{code:'memory',message:'Memory only — Checkpoint failed (QuotaExceededError); old data retained'}})});
  h.ui.open();assert.match(h.node('survey-status').textContent,/QuotaExceededError/);
  assert.match(h.node('survey-record-durability').textContent,/page only.*export JSON/i);assert.match(h.node('survey-checkpoint').textContent,/revision 7/);
});
test('unselected memory mode disables Record and explains Close then Save choice without hiding the storage reason',async()=>{
  const h=harness({model:baseModel({memoryChoiceRequired:true,
    status:{code:'memory',message:'Memory only — Checkpoint failed (QuotaExceededError); old data retained'}})});
  h.ui.open();
  assert.equal(h.node('survey-record').disabled,true);
  assert.equal(h.node('survey-close').disabled,false);
  assert.equal(h.document.activeElement.id,'survey-close');
  assert.match(h.node('survey-status').textContent,/QuotaExceededError.*old data retained.*Close Sensors.*Save.*Use memory only.*Retry/);
  h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,0);
  await h.ui.close();
  h.model.memoryChoiceRequired=false;h.model.status={code:'memory',message:'Memory only — original browser save retained.'};
  h.ui.open();assert.equal(h.node('survey-record').disabled,false,'the explicit choice permits a later page-only action');
  assert.doesNotMatch(h.node('survey-status').textContent,/choose.*Use memory only/);
  await h.ui.close();
});
test('Record rechecks a newly required memory choice before calling the controller',()=>{
  const h=harness();h.ui.open();assert.equal(h.node('survey-record').disabled,false);
  h.model.memoryChoiceRequired=true;h.model.status={code:'memory',message:'Storage became unavailable'};
  h.node('survey-record').dispatch('click');
  assert.equal(h.calls.records.length,0);assert.equal(h.node('survey-record').disabled,true);
  assert.match(h.node('survey-status').textContent,/Storage became unavailable.*Close Sensors.*Use memory only.*Retry/);
});
test('a failed durable Record requires a memory choice while retaining one stable error-and-guidance write',async()=>{
  const reason='Checkpoint failed (QuotaExceededError); old data retained',gate=deferred();
  const h=harness({record:async(h)=>{try{await gate.promise;}catch(error){
    h.model.memoryChoiceRequired=true;h.model.status={code:'memory',message:'Memory only — '+reason};throw error;
  }}});
  h.ui.open();h.node('survey-record').dispatch('click');const writes=watchText(h.node('survey-status'));
  gate.reject(Object.assign(new Error(reason),{code:'UNAVAILABLE'}));await turn();
  assert.equal(h.node('survey-record').disabled,true);assert.equal(h.node('survey-close').disabled,false);
  assert.match(h.node('survey-status').textContent,/QuotaExceededError.*old data retained.*Close Sensors.*Save.*Use memory only.*Retry/);
  assert.equal(writes(),1);h.ui.update();assert.equal(writes(),1);
  h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,1,'the failed attempt is not retried as memory progress');
  assert.equal(h.model.record,null);await h.ui.close();
});
test('a required memory choice does not obscure an existing historical record during catalog failure',async()=>{
  const h=harness({model:baseModel({memoryChoiceRequired:true,record:{targetId:TARGET,observedAt},recordDurable:true,
    target:null,catalog:{status:'error',error:'Catalog offline'},range:{eligible:false,reason:'Wrong system'},
    status:{code:'memory',message:'Memory only — storage currently unavailable'}})});
  h.ui.open();assert.match(h.node('survey-record-view').textContent,/Micqui-Nobara.*2026-10-24/);
  assert.match(h.node('survey-record-durability').textContent,/present in the last completed local checkpoint/);
  assert.equal(h.node('survey-record').disabled,true);assert.equal(h.node('survey-record').textContent,'Survey recorded');
  assert.equal(h.node('survey-close').disabled,false);h.node('survey-record').dispatch('click');assert.equal(h.calls.records.length,0);
  await h.ui.close();assert.equal(h.calls.closes,1);
});
test('a failed read model disables recording, reports the failure and leaves owned Close usable',async()=>{
  const h=harness();h.ui.open();h.readError=new Error('session state unavailable');h.ui.update();
  assert.match(h.node('survey-status').textContent,/unavailable/i);assert.equal(h.node('survey-record').disabled,true);
  assert.equal(h.node('survey-close').disabled,false);await h.ui.close();assert.equal(h.calls.closes,1);
});
test('sync recording errors and failed Close are caught and permit a fresh Close attempt',async()=>{
  let failClose=true;const h=harness({record(){throw new Error('validation rejected');},close(){if(failClose)throw new Error('lease still busy');}});
  h.ui.open();h.node('survey-record').dispatch('click');await turn();assert.match(h.node('survey-status').textContent,/validation rejected/);
  assert.equal(await h.ui.close(),false);assert.equal(h.node('survey-panel').open,true);assert.match(h.node('survey-status').textContent,/lease still busy/);
  failClose=false;assert.equal(await h.ui.close(),true);
});
test('conflict leaves Close available and restores focus to the existing Save recovery control',async()=>{
  const h=harness({model:baseModel({status:{code:'conflict',message:'Another tab changed the save'}})});
  const save=h.document.createElement('button');save.id='save-control';h.document.body.append(save);h.ui.open();
  assert.equal(h.node('survey-record').disabled,true);assert.match(h.node('survey-status').textContent,/Another tab.*Save recovery/);
  await h.ui.close();assert.equal(h.document.activeElement,save);
});
test('catalog strings are bounded text and cannot add markup to the native dialog',()=>{
  const model=baseModel();model.target.name='<img src=x onerror=alert(1)>';model.target.lore='<script>'+ 'x'.repeat(10000);
  const h=harness({model});h.ui.open();assert.ok(h.node('survey-target').textContent.includes('<img'));
  assert.ok(h.node('survey-facts').textContent.length<2500);assert.equal(h.document.querySelectorAll('img').length,0);
});
