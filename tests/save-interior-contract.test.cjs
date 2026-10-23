'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../walkthrough/index.html'), 'utf8');
const appMatch = html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/);
const app = appMatch ? `'use strict';${appMatch[1]}` : '';

function has(source, pattern, message) {
  assert.ok(pattern.test(source), message || `expected source to match ${pattern}`);
}

function extractBlock(source, openIndex) {
  assert.ok(openIndex >= 0 && source[openIndex] === '{', 'expected a block opener');
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}' && --depth === 0) return source.slice(openIndex, i + 1);
  }
  assert.fail('unterminated source block');
}

function namedFunction(name) {
  const marker = `function ${name}(`;
  const start = app.indexOf(marker);
  assert.ok(start >= 0, `missing ${name}()`);
  const brace = app.indexOf('{', start + marker.length);
  return app.slice(start, brace) + extractBlock(app, brace);
}

function methodBlock(source, name) {
  const marker = new RegExp(`(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = marker.exec(source);
  assert.ok(match, `missing adapter method ${name}()`);
  const brace = match.index + match[0].lastIndexOf('{');
  return extractBlock(source, brace);
}

test('walkthrough loads the shared save stylesheet and scripts before its app', () => {
  const css = html.indexOf('<link rel="stylesheet" href="../assets/save.css">');
  const core = html.indexOf('<script src="../assets/save-core.js"></script>');
  const storage = html.indexOf('<script src="../assets/save-storage.js"></script>');
  const session = html.indexOf('<script src="../assets/save-session.js"></script>');
  const appTag = /<script>\s*'use strict';/.exec(html);
  const appAt = appTag ? appTag.index : -1;
  assert.ok(css >= 0 && css < appAt, 'save.css must load before the walkthrough app');
  assert.ok(core >= 0 && storage > core && session > storage && session < appAt,
    'shared scripts must load in core/storage/session order before the walkthrough app');
});

test('startup waits for prop colliders before restore and begins input-paused', () => {
  has(app, /\binputPaused\s*=\s*true\b/, 'movement and look must start paused');
  const boot = namedFunction('startInteriorSession');
  const props = boot.indexOf('await loadProps()');
  const colliderCheck = boot.indexOf('if(!propCollidersReady())');
  const ready = boot.indexOf('propsReady=true');
  const start = boot.indexOf('await ExpanseSave.start(');
  assert.ok(props >= 0 && colliderCheck > props && ready > colliderCheck && start > ready,
    'restore must not start until all placed prop assets and colliders are ready');
  assert.ok(app.indexOf('const safeInteriorSpawn=') < app.indexOf('async function startInteriorSession'),
    'the original safe spawn must be retained before restore starts');
  assert.match(boot, /window\.__expanseSave\s*=\s*session/);
  has(app, /interiorSession\.tick\(\)/, 'the frame loop must tick the shared session');
  has(app, /function setInteriorPaused\(value\)/);
  has(app, /if\s*\(inputPaused\b/, 'movement/look handlers must respect the pause gate');
});

test('a failed manifest GLB cannot pass prop readiness because other placements resolved', () => {
  const readySource = namedFunction('propCollidersReady');
  const context = {
    PROP_MANIFEST: {bridge:[{asset:'chair'},{asset:'computer'}]},
    propCache: {chair:{}},
    resolvedProps: [{asset:'chair'}],
    propCollidersComplete: true,
  };
  const ready = vm.runInNewContext(`(${readySource})`, context);
  assert.equal(ready(), false, 'all declared manifest assets and placements are required');

  context.propCache.computer = {};
  assert.equal(ready(), false, 'cached assets do not prove every manifest placement built its collider');
  context.resolvedProps.push({asset:'computer'});
  assert.equal(ready(), true, 'readiness may pass after the full collision build completes');
  context.propCollidersComplete = false;
  assert.equal(ready(), false, 'cached GLBs alone do not prove collider construction completed');
});

test('missing prop collision data keeps startup paused and displays a loading error', async () => {
  const readySource = namedFunction('propCollidersReady');
  const bootSource = `async ${namedFunction('startInteriorSession')}`;
  const loadMark={textContent:'DECK READY'};
  const pauseCalls=[];
  let sessionStartCalls=0;
  const context={
    PROP_MANIFEST:{bridge:[{asset:'chair'},{asset:'computer'}]},
    propCache:{chair:{}},resolvedProps:[{asset:'chair'}],propCollidersComplete:false,
    propsReady:false,inputPaused:true,
    async loadProps(){},
    setInteriorPaused(value){pauseCalls.push(value);context.inputPaused=Boolean(value);},
    document:{querySelector:selector=>selector==='#loading .loadMark'?loadMark:null},
    ExpanseSave:{start(){sessionStartCalls++;throw new Error('must not start without every prop collider');}},
  };
  const functions=vm.runInNewContext(`({ready:${readySource},start:${bootSource}})`,context);
  context.propCollidersReady=functions.ready;
  await functions.start();
  assert.equal(sessionStartCalls,0,'the shared session must not start with a missing manifest asset');
  assert.equal(context.propsReady,false);
  assert.equal(context.inputPaused,true);
  assert.equal(pauseCalls.at(-1),true);
  assert.match(loadMark.textContent,/Walkthrough paused.*prop collision assets.*Reload to retry/i);
});

test('interior adapter uses the fixed shared-session interface and captures only its domain', () => {
  has(app, /await ExpanseSave\.start\(\{/);
  has(app, /view:\s*'interior'/);
  has(app, /baseURL:\s*new URL\('\.\.\/',\s*location\.href\)/);
  has(app, /host:\s*document\.querySelector\('\.titleBlock'\)/);
  const adapterAt = app.indexOf('adapter: {');
  assert.ok(adapterAt >= 0, 'missing interior adapter');
  const adapterBrace = app.indexOf('{', adapterAt);
  const adapter = extractBlock(app, adapterBrace);
  assert.match(adapter, /stable\(\)/);
  assert.match(adapter, /capture\(\)/);
  assert.match(adapter, /async validate\(snapshot\)/);
  assert.match(adapter, /async apply\(snapshot\)/);
  assert.match(adapter, /pause\(value\)/);

  const capture = methodBlock(adapter, 'capture');
  assert.match(capture, /deckId:\s*'gas-ripley\/deck-1'/);
  assert.match(capture, /x:\s*player\.x/);
  assert.match(capture, /z:\s*player\.z/);
  assert.match(capture, /yaw:\s*player\.yaw/);
  assert.match(capture, /pitch:\s*player\.pitch/);
  assert.match(capture, /roomId:/);
  assert.match(capture, /preferences:\s*\{\s*sensitivity\s*\}/);
});

test('interior position validation checks the walkable union and every wall/prop collider with player radius', () => {
  const validator = namedFunction('interiorPositionIsValid');
  const context = {
    rooms: [{id:'fixture-room', walkable:true, rect:[0,0,10,10]}],
    wallBoxes: [],
    player: {r:1.2},
  };
  const check = vm.runInNewContext(`(${validator})`, context);
  assert.equal(check(5,5), true, 'room interior without a collider should be accepted');
  assert.equal(check(-0.1,5), false, 'position outside the walkable union should be rejected');
  context.wallBoxes.push({minX:5.5,maxX:6.5,minZ:4.5,maxZ:5.5});
  assert.equal(check(4.2,5), true, 'clearance greater than player radius should pass');
  assert.equal(check(4.4,5), false, 'a prop/wall AABB inside player radius should fail');
});

test('the adapter can validate while paused and rejects unsafe imported coordinates without snapping', async () => {
  const adapterAt = app.indexOf('adapter: {');
  assert.ok(adapterAt >= 0, 'missing interior adapter');
  const adapter = extractBlock(app, app.indexOf('{', adapterAt));
  const validateSource = methodBlock(adapter, 'validate');
  const stableSource = methodBlock(adapter, 'stable');
  assert.doesNotMatch(validateSource, /inputPaused|safeRoomJumpPosition|stable\(/,
    'restore validation must be independent of input pause and must not repair imported poses');
  assert.match(stableSource, /inputPaused/);

  const room = {id:'fixture-room', walkable:true, rect:[0,0,10,10]};
  const context = {
    window: {ExpanseSaveCore: {validate: value => value}},
    rooms: [room], wallBoxes: [{minX:5.5,maxX:6.5,minZ:4.5,maxZ:5.5}],
    player: {r:1.2}, safeInteriorSpawn: {x:2,z:2,yaw:0,pitch:0},
    propsReady: true, inputPaused: true, interiorPositionIsValid: (x,z) => x === 4.2 && z === 5,
  };
  const validate = vm.runInNewContext(`(async function validate(snapshot) ${validateSource})`, context);
  await validate({interior:{deckId:'gas-ripley/deck-1',x:4.2,z:5,yaw:0,pitch:0,roomId:'fixture-room'},preferences:{sensitivity:1}});
  await assert.rejects(validate({interior:{deckId:'gas-ripley/deck-1',x:4.4,z:5,yaw:0,pitch:0,roomId:'fixture-room'},preferences:{sensitivity:1}}),
    /collision|walkable|safe/i);
});

test('room jump picks the nearest deterministic collision-safe point inside the requested room', () => {
  const jump = vm.runInNewContext(`(${namedFunction('safeRoomJumpPosition')})`, {
    interiorPositionIsValid: (x, z) => x >= 6,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(jump({rect:[0,0,10,10]}))), {x:6,z:5});
});

test('restore is atomic, null interior returns to the safe spawn, and transient input is reset', () => {
  const apply = namedFunction('applyInteriorSnapshot');
  for (const token of ['safeInteriorSpawn', 'player.x', 'player.z', 'player.yaw', 'player.pitch',
    'camera.position.set', 'camera.rotation.y', 'camera.rotation.x', 'lastPos.set',
    'last=performance.now()', 'jumpOverride=null', 'dirty=true']) {
    assert.ok(apply.includes(token), `restore must synchronize ${token}`);
  }
  const pause = namedFunction('setInteriorPaused');
  for (const token of ['resetInteriorInputs()', 'jumpOverride=null', 'exitPointerLock']) {
    assert.ok(pause.includes(token), `pause must reset ${token}`);
  }

  const readout = {textContent:''};
  let paused=false;
  const context = {
    safeInteriorSpawn: {x:7,z:8,yaw:.4,pitch:-.2},
    player: {x:10,z:11,yaw:2,pitch:1}, sensitivity:1,
    setInteriorPaused(value) { paused=value; },
    sensitivityInput: {value:'1'}, sensitivityValue: {textContent:''},
    camera: {position:{set(x,y,z){this.value=[x,y,z]}},rotation:{}},
    lastPos: {set(x,z){this.value=[x,z]}}, last:0, performance:{now:()=>777},
    jumpOverride:{id:'stale'}, dirty:false, containing:()=>({name:'Geometry room'}),
    document: {querySelector:()=>readout},
  };
  const applySnapshot = vm.runInNewContext(`(${apply})`, context);
  applySnapshot({interior:null,preferences:{sensitivity:1.25}});
  assert.equal(paused,true);
  assert.deepEqual([context.player.x,context.player.z,context.player.yaw,context.player.pitch],[7,8,.4,-.2]);
  assert.deepEqual(context.camera.position.value,[7,5.5,8]);
  assert.equal(context.camera.rotation.y,.4-Math.PI);
  assert.equal(context.camera.rotation.x,-.2);
  assert.deepEqual(context.lastPos.value,[7,8]);
  assert.equal(context.last,777);
  assert.equal(context.jumpOverride,null);
  assert.equal(context.sensitivity,1.25);
  assert.equal(readout.textContent,'Geometry room');
  assert.equal(context.dirty,true);
});

test('unpausing a playable walkthrough does not clear active controls or exit pointer lock', () => {
  const pause = namedFunction('setInteriorPaused');
  let exits=0;
  const moveElement={style:{setProperty(){}},classList:{remove(){}},hasPointerCapture:()=>false,releasePointerCapture(){}};
  const lookElement={style:{setProperty(){}},classList:{remove(){}},hasPointerCapture:()=>false,releasePointerCapture(){}};
  const context={
    inputPaused:false,propsReady:true,keys:{KeyW:true},
    moveJoy:{id:7,x:.5,y:-.4,startX:20,startY:30},
    lookJoy:{id:8,x:.2,y:.3,startX:40,startY:50},
    document:{pointerLockElement:null,getElementById:id=>id==='moveJoy'?moveElement:lookElement,exitPointerLock(){exits++;}},
    canvas:{},roomJump:{disabled:false},jumpOverride:{id:'temporary'},dirty:false,
  };
  const resetSource=namedFunction('resetInteriorInputs');
  context.lookDrag={pointerId:null,lastX:0,lastY:0,moved:false};
  context.suppressedLookClickPointerId=null;
  context.resetMouseLookDrag=vm.runInNewContext(`(${namedFunction('resetMouseLookDrag')})`,context);
  context.resetInteriorInputs=vm.runInNewContext(`(${resetSource})`,context);
  context.document.pointerLockElement=context.canvas;
  const setPaused=vm.runInNewContext(`(${pause})`,context);

  setPaused(false);
  assert.equal(exits,0,'an unpause notification must not drop a live pointer lock');
  assert.equal(context.keys.KeyW,true);
  assert.equal(context.moveJoy.id,7);
  assert.equal(context.lookJoy.id,8);

  setPaused(true);
  assert.equal(exits,1,'entering pause still exits pointer lock');
  assert.equal(context.keys.KeyW,false);
  assert.equal(context.moveJoy.id,null);
  assert.equal(context.lookJoy.id,null);
  assert.equal(context.jumpOverride,null);
  assert.equal(context.roomJump.disabled,true);
});

test('LOOK joystick records its offset and frame integration is time-based', () => {
  const bindSource=namedFunction('bindJoy');
  const handlers=new Map();
  const el={
    style:{setProperty(){}},
    classList:{add(){},remove(){}},
    addEventListener(name,handler){handlers.set(name,handler);},
    setPointerCapture(){},
  };
  const stick={x:0,y:0,id:null,startX:0,startY:0};
  const player={yaw:0,pitch:0};
  const bind=vm.runInNewContext(`(${bindSource})`,{Math,inputPaused:false,propsReady:true,player,dirty:false,BASE_CONTROL_SCALE:.7,sensitivity:1});
  bind(el,stick,true);
  handlers.get('pointerdown')({pointerId:4,clientX:10,clientY:10,preventDefault(){}});
  handlers.get('pointermove')({pointerId:4,clientX:52,clientY:22,preventDefault(){}});
  assert.notEqual(stick.x,0,'LOOK pointer movement should record a sustained horizontal offset');
  assert.equal(player.yaw,0,'pointermove must not apply look once and then stall');
  assert.equal(player.pitch,0,'pointermove must leave look integration to the frame loop');

  const integrateSource=namedFunction('integrateLookInput');
  assert.match(namedFunction('frame'),/integrateLookInput\(dt\)/,
    'the render frame must integrate the held LOOK offset using its elapsed time');
  function run(frames,dt){
    const state={lookJoy:{id:4,x:.65,y:-.3},player:{yaw:0,pitch:0},inputPaused:false,propsReady:true,BASE_CONTROL_SCALE:.7,sensitivity:1.25,dirty:false};
    const integrate=vm.runInNewContext(`(${integrateSource})`,{Math,...state});
    for(let i=0;i<frames;i++)integrate(dt);
    return state.player;
  }
  const at30Hz=run(30,1/30),at60Hz=run(60,1/60);
  assert.ok(at30Hz.yaw<0&&at30Hz.pitch>0,'a held off-center LOOK must keep turning both axes');
  assert.ok(Math.abs(at30Hz.yaw-at60Hz.yaw)<1e-9,'yaw speed must not depend on frame rate');
  assert.ok(Math.abs(at30Hz.pitch-at60Hz.pitch)<1e-9,'pitch speed must not depend on frame rate');
});

test('native mouse deltas preserve sensitivity scaling and pitch limits', () => {
  const applySource=namedFunction('applyMouseLookDelta');
  const context={player:{yaw:0,pitch:0},BASE_CONTROL_SCALE:.7,sensitivity:1.25,dirty:false,Math};
  const apply=vm.runInNewContext(`(${applySource})`,context);
  apply(10,5);
  assert.ok(Math.abs(context.player.yaw-(-10*.0022*.7*1.25))<1e-12);
  assert.ok(Math.abs(context.player.pitch-(-5*.0019*.7*1.25))<1e-12);
  context.player.pitch=1.42;
  apply(0,-1000);
  assert.equal(context.player.pitch,1.43,'native and drag look must share the existing pitch clamp');
});

test('pointer-lock request safely handles missing, throwing, and rejected APIs', async () => {
  const requestSource=namedFunction('requestLookPointerLock');
  async function request(canvas){
    const messages=[];
    const context={canvas,inputPaused:false,propsReady:true,showToast:message=>messages.push(message),document:{body:{classList:{contains:()=>false}}}};
    return {result:await vm.runInNewContext(`(${requestSource})`,context)(),messages};
  }
  const missing=await request({});
  assert.equal(missing.result,false,'missing pointer-lock API should leave drag fallback available');
  assert.match(missing.messages[0],/click and drag to look/i,'an attempted unavailable capture should explain the fallback');
  const thrown=await request({requestPointerLock(){throw new Error('denied synchronously')}});
  assert.equal(thrown.result,false,'a synchronous browser error must be contained');
  assert.match(thrown.messages[0],/click and drag to look/i);
  const rejected=await request({requestPointerLock(){return Promise.reject(new Error('denied asynchronously'))}});
  assert.equal(rejected.result,false,'a rejected browser promise must be contained');
  assert.match(rejected.messages[0],/click and drag to look/i);
});

test('primary mouse drag looks in touch layouts and its click does not request pointer lock', () => {
  const applyCalls=[];let captured=null,released=null,lockRequests=0;
  const canvas={
    setPointerCapture(id){captured=id;},
    hasPointerCapture(id){return captured===id;},
    releasePointerCapture(id){released=id;captured=null;},
    requestPointerLock(){lockRequests++;},
  };
  const context={
    lookDrag:{pointerId:null,lastX:0,lastY:0,moved:false},
    suppressedLookClickPointerId:null,
    inputPaused:false,propsReady:true,canvas,
    document:{pointerLockElement:null,body:{classList:{contains:()=>true}}},
    applyMouseLookDelta(dx,dy){applyCalls.push([dx,dy]);},
    requestLookPointerLock(){lockRequests++;return Promise.resolve(true);},
  };
  context.resetMouseLookDrag=vm.runInNewContext(`(${namedFunction('resetMouseLookDrag')})`,context);
  const begin=vm.runInNewContext(`(${namedFunction('beginMouseLookDrag')})`,context);
  const move=vm.runInNewContext(`(${namedFunction('moveMouseLookDrag')})`,context);
  const end=vm.runInNewContext(`(${namedFunction('endMouseLookDrag')})`,context);
  const click=vm.runInNewContext(`(${namedFunction('handleSceneClick')})`,context);
  const down={pointerType:'mouse',button:0,isPrimary:true,pointerId:9,clientX:20,clientY:30,preventDefault(){}};
  begin(down);
  assert.equal(context.lookDrag.pointerId,9,'touch classification must not disable mouse drag fallback');
  move({pointerId:9,clientX:26,clientY:34,preventDefault(){}});
  assert.deepEqual(applyCalls,[[6,4]]);
  end({pointerId:9});
  assert.equal(released,9);
  click({pointerType:'mouse',pointerId:9,detail:1,preventDefault(){}});
  assert.equal(lockRequests,0,'a drag-generated click must not start a second look path');
  click({pointerType:'mouse',pointerId:10,detail:1,preventDefault(){}});
  assert.equal(lockRequests,0,'touch-classified layouts must keep using drag instead of requesting pointer lock');
  context.document.body.classList.contains=()=>false;
  click({pointerType:'mouse',pointerId:11,detail:1,preventDefault(){}});
  assert.equal(lockRequests,1,'a simple click may still request native pointer lock');

  const cancel=vm.runInNewContext(`(${namedFunction('cancelMouseLookDrag')})`,context);
  begin({...down,pointerId:12});
  cancel({pointerId:12});
  assert.equal(context.lookDrag.pointerId,null,'pointercancel must clear a held drag');
  assert.equal(context.suppressedLookClickPointerId,null,'cancel is not a completed drag click');
  assert.match(app,/addEventListener\(['"]pointercancel['"],\s*cancelMouseLookDrag\)/);
  assert.match(app,/addEventListener\(['"]lostpointercapture['"],\s*cancelMouseLookDrag\)/);
});

test('an off-canvas drag without a generated click does not swallow the next genuine click', () => {
  let lockRequests=0;
  const context={
    lookDrag:{pointerId:null,lastX:0,lastY:0,moved:false},suppressedLookClickPointerId:7,
    inputPaused:false,propsReady:true,
    canvas:{setPointerCapture(){throw Error('capture unavailable');}},
    document:{pointerLockElement:null,body:{classList:{contains:()=>false}}},
    requestLookPointerLock(){lockRequests++;},
  };
  context.resetMouseLookDrag=vm.runInNewContext(`(${namedFunction('resetMouseLookDrag')})`,context);
  const begin=vm.runInNewContext(`(${namedFunction('beginMouseLookDrag')})`,context);
  const end=vm.runInNewContext(`(${namedFunction('endMouseLookDrag')})`,context);
  const click=vm.runInNewContext(`(${namedFunction('handleSceneClick')})`,context);
  begin({pointerType:'mouse',button:0,isPrimary:true,pointerId:7,clientX:10,clientY:20});
  assert.equal(context.suppressedLookClickPointerId,null,'a fresh physical down starts a new click sequence');
  end({pointerId:7});
  click({pointerId:7,preventDefault(){}});
  assert.equal(lockRequests,1,'the first fresh simple click must request capture');
});

test('legacy pointerlockerror events explain drag fallback without resuming paused input', () => {
  assert.ok(/document\.addEventListener\(['"]pointerlockerror['"],\s*handleLookPointerLockError\)/.test(app),
    'event-only mouse capture failures need the same visible fallback feedback');
  const messages=[],context={inputPaused:false,propsReady:true,showToast:message=>messages.push(message)};
  const onError=vm.runInNewContext(`(${namedFunction('handleLookPointerLockError')})`,context);
  onError();assert.match(messages[0],/click and drag to look/i);
  context.inputPaused=true;onError();assert.equal(messages.length,1);
});

test('locked native motion is not double-applied by drag fallback', () => {
  const calls=[];
  const canvas={};
  const context={
    lookDrag:{pointerId:3,lastX:10,lastY:20,moved:false},
    inputPaused:false,propsReady:true,canvas,
    document:{pointerLockElement:canvas},
    applyMouseLookDelta(dx,dy){calls.push([dx,dy]);},
  };
  const move=vm.runInNewContext(`(${namedFunction('moveMouseLookDrag')})`,context);
  move({pointerId:3,clientX:17,clientY:26,preventDefault(){}});
  assert.deepEqual(calls,[],'the native pointer-lock mousemove path is the sole source while locked');
  assert.equal(context.lookDrag.moved,false);
});

test('pause, blur, cancellation, and capture loss clear held inputs without resume drift', () => {
  const appPause=namedFunction('setInteriorPaused');
  const resetSource=namedFunction('resetInteriorInputs');
  assert.match(app,/addEventListener\(['"]blur['"],\s*handleInteriorBlur\)/,
    'window blur must clear transient walkthrough input');
  const pauseContext={
    inputPaused:false,propsReady:true,keys:{KeyW:true},moveJoy:{id:1,x:.5,y:0,startX:0,startY:0},
    lookJoy:{id:2,x:.8,y:.2,startX:0,startY:0},lookDrag:{pointerId:3,lastX:0,lastY:0,moved:true},
    suppressedLookClickPointerId:null,
    document:{pointerLockElement:null,body:{classList:{contains:()=>false}},exitPointerLock(){}},
    canvas:{hasPointerCapture:id=>id===3,releasePointerCapture(){}},roomJump:{disabled:false},dirty:false,
  };
  pauseContext.resetMouseLookDrag=vm.runInNewContext(`(${namedFunction('resetMouseLookDrag')})`,pauseContext);
  const elements={
    moveJoy:{style:{setProperty(){}},classList:{remove(){}},hasPointerCapture:()=>true,releasePointerCapture(){}},
    lookJoy:{style:{setProperty(){}},classList:{remove(){}},hasPointerCapture:()=>true,releasePointerCapture(){}},
  };
  pauseContext.document.getElementById=id=>elements[id];
  pauseContext.resetInteriorInputs=vm.runInNewContext(`(${resetSource})`,pauseContext);
  const setPaused=vm.runInNewContext(`(${appPause})`,pauseContext);
  setPaused(true);
  assert.equal(pauseContext.inputPaused,true);
  assert.equal(pauseContext.keys.KeyW,false);
  assert.deepEqual([pauseContext.moveJoy.id,pauseContext.moveJoy.x,pauseContext.moveJoy.y],[null,0,0]);
  assert.deepEqual([pauseContext.lookJoy.id,pauseContext.lookJoy.x,pauseContext.lookJoy.y],[null,0,0],
    'opening Save while LOOK is held must clear its offset before resume');
  assert.equal(pauseContext.lookDrag.pointerId,null);
  assert.equal(pauseContext.suppressedLookClickPointerId,null);
  setPaused(false);

  const integrateSource=namedFunction('integrateLookInput');
  const player={yaw:1,pitch:.2};
  const integrate=vm.runInNewContext(`(${integrateSource})`,{
    inputPaused:false,propsReady:true,lookJoy:pauseContext.lookJoy,player,
    BASE_CONTROL_SCALE:.7,sensitivity:1,dirty:false,Math,
  });
  integrate(.05);
  assert.deepEqual(player,{yaw:1,pitch:.2},'resuming must not reuse stale LOOK input or drift');
  pauseContext.lookJoy.id=4;pauseContext.lookJoy.x=.5;pauseContext.lookJoy.y=-.25;
  integrate(.05);
  assert.notEqual(player.yaw,1,'a fresh post-resume LOOK gesture must work');

  const blurContext={...pauseContext,inputPaused:false,keys:{KeyA:true},moveJoy:{id:6,x:-1,y:0,startX:1,startY:1},lookJoy:{id:7,x:-.8,y:.4,startX:1,startY:1},lookDrag:{pointerId:8,lastX:0,lastY:0,moved:true},suppressedLookClickPointerId:8};
  blurContext.resetMouseLookDrag=vm.runInNewContext(`(${namedFunction('resetMouseLookDrag')})`,blurContext);
  blurContext.resetInteriorInputs=vm.runInNewContext(`(${resetSource})`,blurContext);
  vm.runInNewContext(`(${namedFunction('handleInteriorBlur')})`,blurContext)();
  assert.equal(blurContext.keys.KeyA,false);
  assert.deepEqual([blurContext.moveJoy.id,blurContext.lookJoy.id,blurContext.lookDrag.pointerId],[null,null,null]);
  assert.equal(blurContext.suppressedLookClickPointerId,null);
});

test('return awaits the shared chart handoff and never trusts the external return query', () => {
  has(app, /await\s+interiorSession\.handoff\('chart'\)/);
  assert.equal(/returnDestination|query\.get\('return'\)|location\.assign\(returnTarget\)/.test(app), false,
    'return navigation must not trust the external return query');
});

test('walkthrough sensitivity limits retain the original control bounds', () => {
  const input = html.match(/<input\b[^>]*\bid="sensitivity"[^>]*>/);
  assert.ok(input, 'missing sensitivity control');
  assert.match(input[0], /\bmin="0\.5"/);
  assert.match(input[0], /\bmax="2"/);
  assert.match(input[0], /aria-label="Control sensitivity, from 0\.5× to 2×"/);
});

test('the existing geometry GLB export remains independent of state backups', () => {
  has(app, /new window\.GLTFExporter\(\)/);
  has(app, /gas-ripley-deck1\.glb/);
});

test('inline walkthrough JavaScript parses without executing page code', () => {
  try {
    new vm.Script(app, {filename:'walkthrough/index.html inline app'});
  } catch (error) {
    throw new Error(`inline app syntax check failed: ${(error.message||'parse error').split('\n')[0]}`);
  }
});
