'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'assets/navigation-console.js');
const Console = fs.existsSync(modulePath) ? require(modulePath) : null;
const sourceWorlds = JSON.parse(fs.readFileSync(path.join(root, 'expanse-data.json'), 'utf8')).worlds;

function assertConsole() {
  assert.ok(Console && typeof Console.mount === 'function', 'navigation console mount module is not implemented');
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.parentNode = null;
    this._id = '';
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => name && !names.includes(name)).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name),
    };
  }
  set id(value) { this._id = value; if (value) this.ownerDocument.elements.set(value, this); }
  get id() { return this._id; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...elements) { for (const element of elements) { element.parentNode = this; this.children.push(element); } }
  replaceChildren(...elements) { this.children = []; this.append(...elements); }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  dispatch(type, values = {}) {
    const event = {type, target: this, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...values};
    let current = this;
    while (current) {
      event.currentTarget = current;
      for (const listener of current.listeners.get(type) || []) listener(event);
      if (event.propagationStopped) break;
      current = current.parentNode;
    }
    return event;
  }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; this.ownerDocument.modalOrder.push('showModal'); }
  close() { if (!this.open) return; this.open = false; this.dispatch('close'); }
  querySelector(selector) {
    if (selector === 'button') return this.children.find(item => item.tagName === 'BUTTON') || null;
    return null;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.listeners = new Map();
    this.activeElement = null;
    this.modalOrder = [];
    this.body = new FakeElement('body', this);
  }
  createElement(tag) { return new FakeElement(tag, this); }
  getElementById(id) { return this.elements.get(id) || null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) || []; list.push(listener); this.listeners.set(type, list); }
  dispatch(type, values = {}) {
    const event = {type, target: this.body, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...values};
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  querySelector(selector) {
    if (selector === 'dialog[open]') return this.querySelectorAll(selector)[0] || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector !== 'dialog[open]') return [];
    const found = [];
    function visit(node) {
      if (node.tagName === 'DIALOG' && node.open) found.push(node);
      for (const child of node.children) visit(child);
    }
    visit(this.body);
    return found;
  }
}

function withDocument(document, action) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {configurable: true, writable: true, value: document});
  try { return action(); }
  finally { if (prior) Object.defineProperty(globalThis, 'document', prior); else delete globalThis.document; }
}

function baseModel(overrides = {}) {
  return {
    snapshot: {
      navigation: {frame:'system-1000km', systemId:'karna-vex', selection:'karna-vex:moon:veyra',
        chartReturn:{selection:'karna-vex'}},
      interior: {deckId:'gas-ripley/deck-1', x:-3, z:453.72},
    },
    status: {code:'saved', message:'Saved at 9:30 AM'},
    busy: false,
    catalog: {status:'ready', error:null, worlds:[{id:'karna-vex', name:'Karna Vex'}, {id:'pallas', name:'Pallas'}]},
    readableIdentities: {
      chartTarget:{id:'karna-vex',name:'Karna Vex'},
      system:{id:'karna-vex',name:'Karna Vex'},
      localBody:{id:'karna-vex:moon:veyra',label:'Veyra'},
    },
    checkpoint: {revision:7, savedAt:'2026-10-23T16:30:00.000Z'},
    ...overrides,
  };
}

function makeHarness({eligible = true, model = baseModel(), setChartTarget = async () => model.snapshot,
  retryCatalog = async () => model.catalog.worlds, close = async () => {}, beforeLease = () => {}} = {}) {
  const document = new FakeDocument();
  const host = document.createElement('div');
  document.body.append(host);
  const order = [];
  const controller = {
    readModel: () => model,
    setChartTarget: (...args) => setChartTarget(...args),
    retryCatalog: (...args) => retryCatalog(...args),
    close: (...args) => close(...args),
  };
  const session = {openNavigationConsole() {
    order.push('lease');
    document.modalOrder.push('lease');
    beforeLease(document);
    return controller;
  }};
  const ui = withDocument(document, () => Console.mount({session, host, eligible:() => eligible,
    identity:() => ({station:{id:'st_nav',name:'Navigation'}, shipName:'GAS Ripley', deckName:'1st Deck (Main / Bridge Deck)', fileMode:false})}));
  return {document, host, ui, model, controller, order, session};
}

function button(document, id) { return document.getElementById(id); }

function watchPropertyWrites(element, property) {
  let value = element[property], writes = 0;
  Object.defineProperty(element, property, {configurable:true,
    get() { return value; },
    set(next) { writes++; value = next; },
  });
  return {get count() { return writes; }};
}

test('mount provides a visible-only-when-eligible prompt and an accessible native console', () => {
  assertConsole();
  const h = makeHarness({eligible:false});
  const prompt = button(h.document, 'navigation-control');
  const dialog = button(h.document, 'navigation-panel');
  assert.ok(prompt && dialog, 'prompt and native dialog should be mounted');
  assert.equal(prompt.tagName, 'BUTTON');
  assert.equal(prompt.textContent, 'E — Navigation console');
  assert.equal(prompt.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(dialog.tagName, 'DIALOG');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'navigation-heading');
  assert.equal(prompt.hidden, true, 'ineligible bridge positions must not show the action');
  h.ui.update();
  assert.equal(prompt.hidden, true);
});

test('native showModal cannot open without an active navigation lease, even when Save is already modal', () => {
  assertConsole();
  const h = makeHarness();
  const panel = button(h.document, 'navigation-panel');
  panel.showModal();
  assert.equal(panel.open, false, 'direct native opening without a controller must be rejected');
  assert.deepEqual(h.order, [], 'showModal must not implicitly acquire a navigation lease');

  panel.close();
  const saveDialog = h.document.createElement('dialog');
  saveDialog.id = 'save-panel';
  h.document.body.append(saveDialog);
  saveDialog.showModal();
  panel.showModal();
  assert.equal(saveDialog.open, true);
  assert.equal(panel.open, false, 'navigation must not open alongside an existing Save modal');
  assert.deepEqual(h.order, [], 'the native modal guard must not acquire a lease around Save');
});

test('owned showModal refuses a competing native modal at the show boundary and releases its lease', async () => {
  assertConsole();
  let saveDialog;
  let releases = 0;
  const h = makeHarness({beforeLease:document => {
    saveDialog = document.createElement('dialog');
    saveDialog.id = 'save-panel';
    document.body.append(saveDialog);
    saveDialog.showModal();
  }, close:async () => { releases += 1; }});
  assert.equal(h.ui.open(), false, 'a modal opened during lease acquisition must prevent navigation display');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saveDialog.open, true);
  assert.equal(button(h.document, 'navigation-panel').open, false);
  assert.equal(releases, 1, 'failed display releases the lease that the UI explicitly acquired');
});

test('walkthrough loads the navigation style and modules before its app code', () => {
  const html = fs.readFileSync(path.join(root, 'walkthrough/index.html'), 'utf8');
  const appTag = /<script>\s*'use strict';/.exec(html);
  const appAt = appTag ? appTag.index : -1;
  const css = html.indexOf('assets/navigation-console.css');
  const target = html.indexOf('assets/navigation-target.js');
  const session = html.indexOf('assets/save-session.js');
  const ui = html.indexOf('assets/navigation-console.js');
  assert.ok(css >= 0 && css < appAt);
  assert.ok(target >= 0 && target < session && session < ui && ui < appAt);
});

test('E ignores repeat and text entry, then acquires the session lease before opening the modal', () => {
  assertConsole();
  const h = makeHarness();
  h.ui.update();
  assert.equal(button(h.document, 'navigation-control').hidden, false);
  h.document.dispatch('keydown', {key:'e', repeat:true});
  h.document.dispatch('keydown', {key:'e', target:{tagName:'INPUT'}});
  assert.equal(button(h.document, 'navigation-panel').open, false);
  h.document.dispatch('keydown', {key:'e', repeat:false, target:h.document.body});
  assert.equal(button(h.document, 'navigation-panel').open, true);
  assert.deepEqual(h.document.modalOrder.slice(-2), ['lease','showModal']);
  assert.equal(h.document.activeElement.id, 'navigation-world');
});

test('E and a stale hidden prompt do nothing when the live eligibility gate is false', () => {
  assertConsole();
  const h = makeHarness({eligible:false});
  h.document.dispatch('keydown', {key:'e', repeat:false, target:h.document.body});
  button(h.document, 'navigation-control').dispatch('click');
  assert.equal(button(h.document, 'navigation-panel').open, false);
  assert.equal(h.document.modalOrder.length, 0);
});

test('prompt pointer input is consumed and opens the same console without reaching movement controls', () => {
  assertConsole();
  const h = makeHarness();
  const prompt = button(h.document, 'navigation-control');
  let bubbled = false;
  h.host.addEventListener('pointerdown', () => { bubbled = true; });
  const pointer = prompt.dispatch('pointerdown', {pointerType:'touch'});
  assert.equal(pointer.propagationStopped, true);
  assert.equal(bubbled, false, 'the prompt must stop the pointerdown before joystick/look handlers');
  prompt.dispatch('click');
  assert.equal(button(h.document, 'navigation-panel').open, true);
});

test('the picker is only a draft; Set explicitly stages a world and reports factual identities', async () => {
  assertConsole();
  const calls = [];
  const h = makeHarness({model:baseModel({status:{code:'memory',message:'This page only — export JSON before leaving.'}}),
    setChartTarget: async id => { calls.push(id); return h.model.snapshot; }});
  h.ui.open();
  const panel = button(h.document, 'navigation-panel');
  const picker = button(h.document, 'navigation-world');
  assert.equal(panel.open, true);
  assert.equal(picker.tagName, 'SELECT');
  assert.equal(button(h.document, 'navigation-set').textContent, 'Set destination');
  picker.value = 'pallas';
  picker.dispatch('change');
  assert.deepEqual(calls, [], 'changing the local draft must not write shared state');
  const text = panel.children.map(child => child.textContent).join('\n');
  for (const fact of ['Navigation','GAS Ripley','1st Deck (Main / Bridge Deck)','karna-vex:moon:veyra','Veyra','Karna Vex','This page only',
    'Selecting a destination replaces the chart target and dossier focus. It does not start travel.',
    'Target staged for the supercluster chart. Return to the supercluster chart before using Jump.']) {
    assert.ok(text.includes(fact), `console should show ${fact}`);
  }
  assert.doesNotMatch(text, /later Return-to-chart jump/i);
  button(h.document, 'navigation-set').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['pallas']);
});

test('a valid exterior pose with no selected destination requires an explicit first world choice', () => {
  assertConsole();
  const model = baseModel({
    snapshot:{navigation:{frame:'chart-mly',systemId:null,selection:null,pose:{position:[1,2,3]}},interior:{deckId:'gas-ripley/deck-1',x:-3,z:453.72}},
    readableIdentities:{chartTarget:null,system:null,localBody:null},
  });
  const h = makeHarness({model});
  h.ui.open();
  assert.equal(button(h.document, 'navigation-set').disabled, true, 'an established exterior pose does not fabricate a picker choice');
  assert.equal(button(h.document, 'navigation-target-current').textContent, 'Current chart target: none selected.');
  assert.doesNotMatch(button(h.document, 'navigation-status').textContent, /visit the exterior chart first/i);
  assert.equal(button(h.document, 'navigation-frame-hint').hidden, true, 'chart mode avoids repeating the no-travel explanation');
  const picker = button(h.document, 'navigation-world');
  assert.equal(picker.children[0].textContent, 'Choose a world');
  picker.value = 'pallas';
  picker.dispatch('change');
  h.ui.update();
  assert.equal(button(h.document, 'navigation-set').disabled, false, 'a real world choice enables the explicit Set action');
  assert.equal(button(h.document, 'navigation-target-current').textContent, 'Current chart target: none selected.');
});

test('without exterior navigation, interior feet remain visible and destination editing is read-only', () => {
  assertConsole();
  const model = baseModel({snapshot:{navigation:null,interior:{deckId:'gas-ripley/deck-1',x:-3.2567,z:453.13972}},
    readableIdentities:{chartTarget:null,system:null,localBody:null}});
  const h = makeHarness({model});
  h.ui.open();
  assert.equal(button(h.document, 'navigation-set').disabled, true);
  assert.match(button(h.document, 'navigation-interior-position').textContent, /-3\.257, 453\.14 ft/);
  assert.match(button(h.document, 'navigation-status').textContent, /visit the exterior chart first/i);
});

test('file mode states that local destination editing is unavailable and disables mutations', () => {
  assertConsole();
  const doc = new FakeDocument(), host = doc.createElement('div');
  const model = baseModel();
  const controller = {readModel:()=>model, setChartTarget:async()=>{}, retryCatalog:async()=>[], close:async()=>{}};
  withDocument(doc, () => {
    const ui = Console.mount({session:{openNavigationConsole:()=>controller},host,eligible:()=>true,
      identity:()=>({station:{id:'st_nav',name:'Navigation'},shipName:'GAS Ripley',deckName:'Deck 1',fileMode:true})});
    ui.open();
  });
  assert.equal(button(doc, 'navigation-set').disabled, true);
  assert.match(button(doc, 'navigation-status').textContent, /file mode.*navigation edits are unavailable/i);
});

test('Set owns the modal through asynchronous validation and save, including native cancel', async () => {
  assertConsole();
  let resolveSet;
  const h = makeHarness({setChartTarget: () => new Promise(resolve => { resolveSet = resolve; })});
  h.ui.open();
  button(h.document, 'navigation-world').value = 'pallas';
  button(h.document, 'navigation-set').dispatch('click');
  assert.equal(button(h.document, 'navigation-world').disabled, true);
  assert.equal(button(h.document, 'navigation-set').disabled, true);
  assert.equal(button(h.document, 'navigation-close').disabled, true);
  const cancel = button(h.document, 'navigation-panel').dispatch('cancel');
  assert.equal(cancel.defaultPrevented, true, 'Escape/native cancel cannot release a busy lease');
  resolveSet(h.model.snapshot);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button(h.document, 'navigation-close').disabled, false);
});

test('native close cannot dismiss the console during a deferred Set or orphan its pause lease', async () => {
  assertConsole();
  let finishWrite;
  const deferredWrite = new Promise(resolve => { finishWrite = resolve; });
  let releases = 0;
  const h = makeHarness({setChartTarget:() => deferredWrite, close:() => { releases += 1; }});
  h.ui.open();
  const panel = button(h.document, 'navigation-panel');
  const picker = button(h.document, 'navigation-world');
  picker.value = 'pallas';
  picker.dispatch('change');
  button(h.document, 'navigation-set').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.open, true);

  panel.close();
  assert.equal(panel.open, true, 'direct close cannot hide the native modal while Set owns it');
  assert.equal(releases, 0, 'only the owned Close path may release the session lease');

  finishWrite();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.open, true);
  await h.ui.close();
  assert.equal(releases, 1);
  assert.equal(panel.open, false);
});

test('a forced native close event during Set defers lease release until the command outcome settles', async () => {
  assertConsole();
  let finishWrite;
  const deferredWrite = new Promise(resolve => { finishWrite = resolve; });
  let releases = 0, committedTarget = 'karna-vex';
  let h;
  h = makeHarness({setChartTarget:async worldId => {
    await deferredWrite;
    committedTarget = worldId;
    h.model.snapshot.navigation.chartReturn.selection = worldId;
    h.model.readableIdentities.chartTarget = {id:worldId,name:'Pallas'};
    h.model.status = {code:'saved',message:'Saved successfully'};
    return h.model.snapshot;
  }, close:() => { releases++; }});
  h.ui.open();
  const panel = button(h.document, 'navigation-panel');
  const picker = button(h.document, 'navigation-world');
  picker.value = 'pallas';
  picker.dispatch('change');
  button(h.document, 'navigation-set').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.open, true);

  // Invoke the fake native dialog method directly, bypassing the guarded instance.close wrapper.
  Object.getPrototypeOf(panel).close.call(panel);
  assert.equal(panel.open, false, 'the browser may force a native close despite the instance guard');
  assert.equal(releases, 0, 'the pending transaction still owns its pause lease');

  finishWrite();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(committedTarget, 'pallas', 'native dismissal must not turn a committed Set into cancellation');
  assert.equal(releases, 1, 'settlement performs exactly one owned lease release');
  assert.equal(h.ui.isOpen(), false);
  assert.equal(button(h.document, 'navigation-control').hidden, false);
  assert.strictEqual(h.document.activeElement, button(h.document, 'navigation-control'));
  assert.match(button(h.document, 'navigation-status').textContent, /Saved successfully/);
});

test('a successful open clears stale unavailable prompt state from a prior BUSY attempt', async () => {
  assertConsole();
  const eligibility = {eligible:true};
  const h = makeHarness({eligible:eligibility});
  let attempts = 0;
  h.session.openNavigationConsole = () => {
    if (attempts++ === 0) throw Object.assign(new Error('background save in progress'), {code:'BUSY'});
    return h.controller;
  };
  const prompt = button(h.document, 'navigation-control');
  assert.equal(h.ui.open(), false);
  assert.equal(prompt.dataset.state, 'unavailable');
  assert.match(prompt.title, /Navigation unavailable/);

  eligibility.eligible = false;
  h.ui.update();
  assert.equal(prompt.hidden, true);
  eligibility.eligible = true;
  h.ui.update();
  assert.equal(prompt.hidden, false);
  assert.equal(prompt.title, 'Press E or tap to open Navigation');
  assert.equal(prompt.dataset.state, undefined);

  assert.equal(h.ui.open(), true);
  assert.equal(prompt.title, 'Press E or tap to open Navigation');
  assert.equal(prompt.dataset.state, undefined);
  await h.ui.close();
  assert.equal(prompt.hidden, false);
  assert.equal(prompt.title, 'Press E or tap to open Navigation');
  assert.equal(prompt.dataset.state, undefined);
});

test('background autosave keeps an eligible prompt visible, enabled and focused', () => {
  assertConsole();
  const h = makeHarness({eligible:{eligible:true},model:baseModel({status:{code:'saving',message:'Saving…'}})});
  const prompt = button(h.document, 'navigation-control');
  prompt.focus();
  h.ui.update();
  assert.equal(prompt.hidden, false);
  assert.equal(prompt.disabled, false, 'the prompt must not use native disabled state and lose focus');
  assert.strictEqual(h.document.activeElement, prompt);
});

test('a null chart target shows a disabled placeholder and requires an explicit world choice', () => {
  assertConsole();
  const model = baseModel();
  model.snapshot.navigation.chartReturn.selection = null;
  model.readableIdentities.chartTarget = null;
  model.catalog.worlds = sourceWorlds.map(({id,name}) => ({id,name}));
  const h = makeHarness({model});
  h.ui.open();
  const picker = button(h.document, 'navigation-world');
  const setButton = button(h.document, 'navigation-set');
  assert.equal(picker.children[0].value, '');
  assert.equal(picker.children[0].textContent, 'Choose a world');
  assert.equal(picker.children[0].disabled, true);
  assert.equal(picker.value, '');
  assert.deepEqual(picker.children.filter(option => option.value).map(option => option.value), sourceWorlds.map(world => world.id));
  assert.equal(setButton.disabled, true);
  assert.equal(button(h.document, 'navigation-target-current').textContent, 'Current chart target: none selected.');

  picker.value = sourceWorlds[0].id;
  picker.dispatch('change');
  h.ui.update();
  assert.equal(setButton.disabled, false, 'an explicit catalog choice enables Set without changing the current target');
  assert.equal(button(h.document, 'navigation-target-current').textContent, 'Current chart target: none selected.');
});

test('unchanged frame updates do not rewrite live status text or the selected picker value', () => {
  assertConsole();
  const h = makeHarness();
  h.ui.open();
  const statusWrites = watchPropertyWrites(button(h.document, 'navigation-status'), 'textContent');
  const pickerWrites = watchPropertyWrites(button(h.document, 'navigation-world'), 'value');
  h.ui.update();
  assert.equal(statusWrites.count, 0, 'unchanged aria-live status must not be reassigned every frame');
  assert.equal(pickerWrites.count, 0, 'unchanged picker value must not be reassigned every frame');
});

test('a settled nonblocking error does not alternate aria-live text on each update', async () => {
  assertConsole();
  const h = makeHarness({setChartTarget:async () => { throw new Error('destination write failed'); }});
  h.ui.open();
  button(h.document, 'navigation-world').value = 'pallas';
  button(h.document, 'navigation-set').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  const status = button(h.document, 'navigation-status');
  assert.equal(status.textContent, 'destination write failed');
  const statusWrites = watchPropertyWrites(status, 'textContent');
  h.ui.update();
  assert.equal(statusWrites.count, 0, 'a stable error message must not toggle through a transient suffix');
});

test('memory-only status keeps the checkpoint failure reason and does not churn unchanged live text', async () => {
  assertConsole();
  const reason = 'Checkpoint failed (QuotaExceededError); old data retained';
  const model = baseModel({status:{code:'memory',message:`Memory only — ${reason}`}});
  let rejectSet;
  const h = makeHarness({model, setChartTarget:() => new Promise((resolve, reject) => { rejectSet = reject; })});
  h.ui.open();
  const status = button(h.document, 'navigation-status');
  assert.equal(status.textContent, `Memory only — ${reason}`,
    'the session-provided memory status should retain its concrete failure reason');
  assert.equal(button(h.document, 'navigation-memory-note').textContent,
    'This page only — export JSON before leaving.');

  const statusWrites = watchPropertyWrites(status, 'textContent');
  h.ui.update();
  assert.equal(statusWrites.count, 0, 're-rendering identical memory status must not rewrite the live region');

  button(h.document, 'navigation-world').value = 'pallas';
  button(h.document, 'navigation-set').dispatch('click');
  assert.equal(status.textContent, 'Validating destination and completing the local save…');
  const failureWrites = watchPropertyWrites(status, 'textContent');
  rejectSet(new Error(reason));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(status.textContent, reason, 'a failed Set must expose its concrete local storage error');
  assert.equal(failureWrites.count, 1, 'the failure result should cause only one changed-text write');
  h.ui.update();
  assert.equal(failureWrites.count, 1, 'the settled failure message must remain stable across updates');
});

test('conflict/error blocks another Set and directs Close to existing Save recovery', async () => {
  assertConsole();
  const h = makeHarness({setChartTarget: async () => { const error = new Error('checkpoint conflict'); error.code='CONFLICT'; throw error; }});
  const saveControl=h.document.createElement('button');saveControl.id='save-control';h.document.body.append(saveControl);
  h.ui.open();
  button(h.document, 'navigation-world').value = 'pallas';
  button(h.document, 'navigation-set').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button(h.document, 'navigation-set').disabled, true);
  assert.equal(button(h.document, 'navigation-world').disabled, true);
  assert.equal(button(h.document, 'navigation-close').disabled, false);
  const text = button(h.document, 'navigation-panel').children.map(child => child.textContent).join('\n');
  assert.match(text, /close.*save|save.*recover/i);
  button(h.document, 'navigation-close').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.document.activeElement.id, 'save-control', 'recovery close moves keyboard focus to the existing Save control');
});

test('catalog failure exposes bounded retry and ignores late updates after close', async () => {
  assertConsole();
  let finishRetry;
  const model = baseModel({catalog:{status:'error',error:'offline',worlds:[]}});
  const h = makeHarness({model, retryCatalog: () => new Promise(resolve => { finishRetry = resolve; })});
  h.ui.open();
  assert.equal(button(h.document, 'navigation-set').disabled, true);
  assert.equal(button(h.document, 'navigation-retry').hidden, false);
  button(h.document, 'navigation-retry').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  const close = button(h.document, 'navigation-close');
  assert.equal(close.disabled, false, 'catalog retry does not take ownership away from Close');
  close.dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  finishRetry([{id:'pallas',name:'Pallas'}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button(h.document, 'navigation-panel').open, false);
  assert.equal(button(h.document, 'navigation-control').hidden, false);
});

test('closing releases the owned lease first, returns focus to an eligible prompt, and never captures the pointer', async () => {
  assertConsole();
  let closed = 0;
  const h = makeHarness({close:async () => { closed++; }});
  h.ui.open();
  button(h.document, 'navigation-close').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 1);
  assert.equal(button(h.document, 'navigation-panel').open, false);
  assert.equal(h.document.activeElement.id, 'navigation-control');
  assert.equal(h.ui.isOpen(), false);
});

test('an idle native close event releases the owned lease and restores eligible prompt focus', async () => {
  assertConsole();
  let releases = 0;
  const h = makeHarness({close:() => { releases++; }});
  h.ui.open();
  const panel = button(h.document, 'navigation-panel');
  Object.getPrototypeOf(panel).close.call(panel);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const prompt = button(h.document, 'navigation-control');
  assert.equal(releases, 1);
  assert.equal(h.ui.isOpen(), false);
  assert.equal(prompt.hidden, false);
  assert.strictEqual(h.document.activeElement, prompt);
});

test('a pre-existing session error also disables destination writes and leaves Close available', () => {
  assertConsole();
  const h = makeHarness({model:baseModel({status:{code:'error',message:'storage error'}})});
  h.ui.open();
  assert.equal(button(h.document, 'navigation-set').disabled, true);
  assert.equal(button(h.document, 'navigation-world').disabled, true);
  assert.equal(button(h.document, 'navigation-close').disabled, false);
  assert.match(button(h.document, 'navigation-status').textContent, /close.*save recovery/i);
});

test('bridge eligibility is computed from the live station rectangle, room, collider, and interaction state', () => {
  const html = fs.readFileSync(path.join(root, 'walkthrough/index.html'), 'utf8');
  const appMatch = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/);
  assert.ok(appMatch, 'walkthrough app script missing');
  const source = `'use strict';${appMatch[1]}`;
  const start = source.indexOf('function bridgeNavigationEligibility(');
  assert.ok(start >= 0, 'live bridge eligibility helper missing');
  const brace = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  let end = -1;
  for (let i=brace;i<source.length;i++) {
    const ch=source[i];
    if (quote) { if (escaped) escaped=false; else if (ch==='\\') escaped=true; else if (ch===quote) quote=null; continue; }
    if (ch==='"'||ch==="'"||ch==='`') { quote=ch; continue; }
    if (ch==='{') depth++;
    else if (ch==='}'&&--depth===0) { end=i+1; break; }
  }
  assert.ok(end>brace, 'eligibility helper must be a complete function');
  const fn = source.slice(start,end);
  const helpElement={classList:{contains:()=>true}},onboardingElement={classList:{contains:()=>true}};
  const fixture = {
    DECK:{bridge_pod_stations:[{id:'st_nav',name:'Navigation',rect:[-9.5,-16.5,6,6]}]},
    propsReady:true,inputPaused:false,player:{x:-5,z:456.5},
    interiorSession:{status:()=>({code:'saved'}), snapshot:()=>({})},
    stationWorldRect:()=>[-9.5,444.5,6,6],
    parentRoomAt:()=>({id:'bridge_pod'}),interiorPositionIsValid:()=>true,
    document:{getElementById:()=>helpElement,querySelector:()=>null},
    helpElement,onboarding:onboardingElement,
  };
  const check = vm.runInNewContext(`(${fn})`, fixture);
  assert.equal(check().eligible, true, 'point within the footprint radius and bridge room may interact');
  fixture.player.z = 456.51;
  assert.equal(check().eligible, false, 'more than six feet from the footprint must be rejected');
  fixture.player.z = 456.5;
  fixture.parentRoomAt = () => ({id:'corr_pp1'});
  assert.equal(check().eligible, false, 'nearby points outside Bridge Pod must be rejected');
  fixture.parentRoomAt = () => ({id:'bridge_pod'});
  fixture.interiorPositionIsValid = () => false;
  assert.equal(check().eligible, false, 'invalid collision positions cannot interact');
  fixture.interiorPositionIsValid = () => true;
  fixture.helpElement.classList.contains = () => false;
  assert.equal(check().eligible, false, 'an open help panel suppresses the interaction');
  fixture.helpElement.classList.contains = () => true;
  fixture.onboarding.classList.contains = () => false;
  assert.equal(check().eligible, false, 'onboarding suppresses the interaction');
  fixture.onboarding.classList.contains = () => true;
  fixture.document.querySelector = () => ({open:true});
  assert.equal(check().eligible, false, 'another native modal suppresses the interaction');
  fixture.document.querySelector = () => null;
  fixture.interiorSession.status = () => ({code:'conflict'});
  assert.equal(check().eligible, false, 'session recovery state suppresses the interaction');
  for (const code of ['saving','validating']) {
    fixture.interiorSession.status = () => ({code});
    assert.equal(check().eligible, true, `background ${code} must not hide a physically eligible prompt`);
  }
  for (const code of ['loading','error','conflict']) {
    fixture.interiorSession.status = () => ({code});
    assert.equal(check().eligible, false, `${code} remains a blocking session state`);
  }
  fixture.interiorSession.status = () => ({code:'saving'});
  fixture.inputPaused = true;
  assert.equal(check().eligible, false, 'real input-paused transitions still suppress the prompt during autosave');
});
