'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../assets/save-core.js');

const TARGET = 'karna-vex:moon:micqui-nobara';
const observedAt = '2026-10-24T00:00:00.000Z';
const observation = () => ({targetId:TARGET, observedAt});
const camera = () => ({mode:'chase',zoom:1,orbitAz:.2,orbitEl:.3,orbitR:10,pan:[1,2,3]});
const pose = () => ({position:[7600,2,590],yaw:.4,pitch:.1});

function legacyFixture() {
  const value = Core.fresh();
  value.schemaVersion = 1;
  delete value.survey;
  value.revision = 17;
  value.savedAt = '2026-10-23T18:01:02.345Z';
  value.lastView = 'interior';
  value.navigation = {frame:'system-1000km',systemId:'karna-vex',pose:pose(),camera:camera(),selection:TARGET,
    phases:[{id:TARGET,angle:.5},{id:'karna-vex:featured:117',angle:-.25}],
    chartReturn:{pose:pose(),camera:camera(),selection:'karna-vex'}};
  value.interior = {deckId:'gas-ripley/deck-1',x:-3,z:461,yaw:-Math.PI,pitch:.2,roomId:'bridge_pod'};
  value.preferences = {quality:'low',sensitivity:1.25};
  return value;
}

function v2Fixture(survey = null) {
  return {...legacyFixture(),schemaVersion:2,survey};
}

test('valid v1 normalizes to schema2 with an empty survey without changing journey or checkpoint metadata', () => {
  const legacy = legacyFixture(), original = structuredClone(legacy);
  const normalized = Core.validate(legacy);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.runtimeCatalogVersion, 1);
  assert.equal(normalized.survey, null);
  assert.deepEqual(normalized.navigation, {...legacy.navigation,phases:legacy.navigation.phases.slice().sort((a,b)=>a.id.localeCompare(b.id))});
  for (const key of ['interior','preferences','lastView','revision','savedAt']) assert.deepEqual(normalized[key], legacy[key], key);
  assert.deepEqual(legacy, original, 'normalization must not rewrite its raw input');
  assert.notEqual(normalized.navigation, legacy.navigation);
  assert.notEqual(normalized.interior, legacy.interior);
});

test('an empty legacy journey normalizes without inventing a checkpoint or survey', () => {
  const legacy = {...Core.fresh(),schemaVersion:1};
  delete legacy.survey;
  const normalized = Core.validate(legacy);
  assert.equal(normalized.schemaVersion, 2);
  assert.equal(normalized.survey, null);
  assert.equal(normalized.navigation, null);
  assert.equal(normalized.interior, null);
  assert.equal(normalized.revision, 0);
  assert.equal(normalized.savedAt, null);
});

test('formerly unknown v1 survey data never grants a completed observation', () => {
  for (const survey of [observation(),{targetId:'ignored'},'unrecognized legacy value',false,null]) {
    const legacy = {...legacyFixture(),survey};
    assert.equal(Core.validate(legacy).survey, null);
    assert.equal(legacy.survey, survey, 'the ignored property must not be mutated');
  }
});

test('v1 normalization is idempotent through validate and JSON roundtrip', () => {
  const once = Core.validate(legacyFixture());
  assert.equal(once.schemaVersion, 2);
  assert.deepEqual(Core.validate(once), once);
  assert.deepEqual(Core.parse(Core.stringify(once)), once);
});

test('legacy normalization still rejects empty, malformed and prototype-unsafe saves', () => {
  assert.throws(()=>Core.validate({}), {code:'INVALID'});
  assert.throws(()=>Core.parse('{'), {code:'INVALID'});
  assert.throws(()=>Core.validate({...legacyFixture(),preferences:{quality:'low',sensitivity:2.01}}), {code:'INVALID'});
  const inherited = Object.create({survey:observation()});
  Object.assign(inherited, legacyFixture());
  assert.throws(()=>Core.validate(inherited), {code:'INVALID'});
  const unsafe = {...legacyFixture(),survey:JSON.parse('{"constructor":{"polluted":true}}')};
  assert.throws(()=>Core.validate(unsafe), {code:'INVALID'}, 'ignored legacy data must still pass safeTree');
  assert.equal({}.polluted, undefined);
});

test('schema3 and unsupported catalog versions fail VERSION rather than migrating', () => {
  assert.throws(()=>Core.validate({...v2Fixture(),schemaVersion:3}), {code:'VERSION'});
  assert.throws(()=>Core.validate({...v2Fixture(),runtimeCatalogVersion:2}), {code:'VERSION'});
});

test('fresh journeys use schema2 with exactly one nullable survey field', () => {
  const fresh = Core.fresh({quality:'low',sensitivity:.5});
  assert.equal(fresh.schemaVersion, 2);
  assert.equal(fresh.runtimeCatalogVersion, 1);
  assert.equal(fresh.survey, null);
  assert.equal(fresh.revision, 0);
  assert.equal(fresh.savedAt, null);
  assert.deepEqual(fresh.preferences, {quality:'low',sensitivity:.5});
});

test('schema2 reconstructs only the fixed survey target and canonical observation timestamp', () => {
  const input = v2Fixture({...observation(),facts:'untrusted visitor text',distance:0});
  const normalized = Core.validate(input);
  assert.deepEqual(normalized.survey, observation());
  assert.notEqual(normalized.survey, input.survey);
  assert.deepEqual(Core.validate(normalized), normalized);
});

test('schema2 requires an explicit survey field but accepts null', () => {
  const missing = v2Fixture();
  delete missing.survey;
  assert.throws(()=>Core.validate(missing), {code:'INVALID'});
  assert.equal(Core.validate(v2Fixture()).survey, null);
});

for (const [name,survey] of [
  ['primitive',true], ['list',[observation()]], ['missing target',{observedAt}],
  ['short target',{targetId:'micqui-nobara',observedAt}],
  ['another moon',{targetId:'karna-vex:moon:veyra',observedAt}],
  ['missing time',{targetId:TARGET}], ['null time',{targetId:TARGET,observedAt:null}],
  ['numeric time',{targetId:TARGET,observedAt:0}],
  ['unparseable time',{targetId:TARGET,observedAt:'yesterday'}],
  ['noncanonical time',{targetId:TARGET,observedAt:'2026-10-24T00:00:00Z'}],
  ['timezone alias',{targetId:TARGET,observedAt:'2026-10-24T00:00:00.000+00:00'}],
  ['impossible date',{targetId:TARGET,observedAt:'2026-02-30T00:00:00.000Z'}],
  ['overlong time',{targetId:TARGET,observedAt:'x'.repeat(33)}],
]) test('schema2 rejects survey '+name, () => {
  assert.throws(()=>Core.validate(v2Fixture(survey)), {code:'INVALID'});
});

test('survey validation retains recursive forbidden-key and plain-object protection', () => {
  for (const key of ['__proto__','constructor','prototype']) {
    const survey = JSON.parse(JSON.stringify(observation()).replace(/}$/,',"'+key+'":{"polluted":true}}'));
    assert.throws(()=>Core.validate(v2Fixture(survey)), {code:'INVALID'});
  }
  assert.throws(()=>Core.validate(v2Fixture(Object.assign(Object.create(null), observation()))), {code:'INVALID'});
  assert.equal({}.polluted, undefined);
});

test('canonical observation time is visitor metadata independent of checkpoint time', () => {
  const value = v2Fixture({targetId:TARGET,observedAt:'+010000-01-01T00:00:00.000Z'});
  const normalized = Core.validate(value);
  assert.deepEqual(normalized.survey, value.survey);
  assert.equal(normalized.savedAt, value.savedAt);
});

test('a historical survey remains valid after moving away or removing exterior navigation', () => {
  const value = v2Fixture(observation());
  value.navigation = {frame:'chart-mly',systemId:null,pose:pose(),camera:camera(),selection:'pallas',phases:[],chartReturn:null};
  assert.deepEqual(Core.validate(value).survey, observation());
  value.navigation = null;
  assert.deepEqual(Core.validate(value).survey, observation());
});

test('ordinary merge preserves a survey while ignoring attempted survey replacements', () => {
  const before = v2Fixture(observation()), original = structuredClone(before);
  for (const survey of [null,{targetId:'other',observedAt:'bad'},observation()]) {
    const next = Core.merge(before, {survey,preferences:{sensitivity:1.5}});
    assert.deepEqual(next.survey, observation());
    assert.equal(next.preferences.sensitivity, 1.5);
    assert.equal(next.revision, before.revision);
    assert.equal(next.savedAt, before.savedAt);
  }
  assert.deepEqual(before, original);
  assert.equal(Core.merge(v2Fixture(), {survey:observation()}).survey, null, 'adapter patches cannot create a survey');
});

test('stringify emits schema2 including the record and migrates legacy export to an empty survey', () => {
  const value = v2Fixture(observation()), serialized = JSON.parse(Core.stringify(value));
  assert.equal(serialized.schemaVersion, 2);
  assert.deepEqual(serialized.survey, observation());
  assert.deepEqual(Core.parse(JSON.stringify(serialized)), Core.validate(value));
  const legacyExport = JSON.parse(Core.stringify({...legacyFixture(),survey:observation()}));
  assert.equal(legacyExport.schemaVersion, 2);
  assert.equal(legacyExport.survey, null);
});

test('schema2 imports retain the 256 KiB UTF-8 limit before dropping unknown fields', () => {
  const value = v2Fixture(observation());
  value.ignored = 'é'.repeat(Core.MAX_BYTES / 2);
  assert.throws(()=>Core.parse(JSON.stringify(value)), {code:'SIZE'});
  assert.equal(Core.MAX_BYTES, 262144);
});

// Drive only the IndexedDB callback boundary; real upgrade/atomicity tests belong to browser acceptance.
function storageBoundary(storeExists = true) {
  const request = {}, opens = [], created = [], transactions = [];
  let closeCount = 0;
  const db = {
    objectStoreNames:{contains:name => name === 'snapshots' && storeExists},
    createObjectStore(name) { created.push(name); },
    close() { closeCount++; },
    transaction(name, mode) {
      const gets = new Map(), puts = [];
      const tx = {abort() { tx.aborted = true; if (tx.onabort) tx.onabort(); }};
      tx.objectStore = () => ({
        get(key) { const get = {}; gets.set(key, get); return get; },
        put(value, key) { puts.push({key,value:structuredClone(value)}); },
      });
      transactions.push({name,mode,tx,gets,puts});
      return tx;
    },
  };
  const root = {ExpanseSaveCore:Core,location:{origin:'https://expanse.test'},
    indexedDB:{open(name, version) { opens.push({name,version}); return request; }}};
  new Function('globalThis', fs.readFileSync(path.join(__dirname, '../assets/save-storage.js'), 'utf8'))(root);
  return {opens,created,transactions,db,get closeCount() { return closeCount; },async connect() {
    const opening = root.ExpanseSaveStorage.open('https://expanse.test/app/index.html');
    request.result = db;
    request.onupgradeneeded();
    request.onsuccess();
    return opening;
  }};
}

test('storage requests database version2 in the legacy scope and performs no payload transaction during upgrade', async () => {
  const h = storageBoundary(), repo = await h.connect();
  assert.deepEqual(h.opens, [{name:'the-expanse/save/v1:/app/',version:2}]);
  assert.equal(repo.name, 'the-expanse/save/v1:/app/');
  assert.deepEqual(h.created, []);
  assert.deepEqual(h.transactions, [], 'an existing store must not trigger a normalization write on open');
  h.db.onversionchange();
  assert.equal(h.closeCount, 1);
});

test('storage upgrade creates only a missing snapshots store', async () => {
  const h = storageBoundary(false), repo = await h.connect();
  assert.deepEqual(h.created, ['snapshots']);
  assert.deepEqual(h.transactions, []);
  repo.close();
});

test('CAS stages schema2 but rotates the valid raw v1 predecessor without normalizing the recovery copy', async () => {
  const h = storageBoundary(), repo = await h.connect(), raw = legacyFixture();
  raw.survey = {targetId:'legacy unknown field'};
  raw.legacyMarker = 'preserve raw recovery data';
  raw.navigation.pose.yaw = 7;
  const original = structuredClone(raw);
  let completed = false;
  const committing = repo.commit(v2Fixture(observation()), raw.revision).then(value => { completed = true; return value; });
  const tx = h.transactions[0];
  tx.gets.get('current').result = raw;
  tx.gets.get('current').onsuccess();
  await Promise.resolve();
  assert.equal(completed, false, 'request success is not transaction completion');
  tx.tx.oncomplete();
  const saved = await committing;
  assert.deepEqual(tx.puts.map(put=>put.key), ['previous','current']);
  assert.deepEqual(tx.puts[0].value, original);
  assert.deepEqual(raw, original);
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(saved.survey, observation());
  assert.equal(saved.revision, raw.revision + 1);
  assert.equal(new Date(saved.savedAt).toISOString(), saved.savedAt);
  assert.deepEqual(tx.puts[1].value, saved);
  repo.close();
});

test('normal CAS refuses a future raw predecessor without staging writes', async () => {
  const h = storageBoundary(), repo = await h.connect(), raw = {...legacyFixture(),schemaVersion:3};
  const committing = repo.commit(v2Fixture(observation()), raw.revision);
  const tx = h.transactions[0];
  tx.gets.get('current').result = raw;
  tx.gets.get('current').onsuccess();
  await assert.rejects(committing, {code:'VERSION'});
  assert.equal(tx.tx.aborted, true);
  assert.deepEqual(tx.puts, []);
  repo.close();
});
