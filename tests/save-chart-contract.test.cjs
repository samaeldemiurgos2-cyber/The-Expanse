const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
for(const inherited of ['constructor','toString','hasOwnProperty']) test('save selection rejects inherited map property '+inherited,()=>{
  const core=require('../assets/save-core.js'),vm=require('node:vm');
  const validate=vm.runInNewContext('('+functionBlock('validateChartSnapshot')+')',{ExpanseSaveCore:core,worldById:()=>null,moons:{},chartKnownRuntimeIds:()=>null});
  const value=core.fresh();value.navigation={frame:'chart-mly',systemId:null,pose:{position:[0,0,0],yaw:0,pitch:0},camera:{mode:'chase',zoom:1,orbitAz:0,orbitEl:0,orbitR:3,pan:[0,0,0]},selection:inherited,phases:[],chartReturn:null};
  assert.throws(()=>validate(value),/Unknown chart selection/);
});

function functionBlock(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(html);
  assert.ok(match, `missing function ${name}`);
  const end = html.indexOf('\n}', match.index);
  assert.notEqual(end, -1, `could not find end of function ${name}`);
  return html.slice(match.index, end + 2);
}

function between(startText, endText) {
  const start = html.indexOf(startText);
  assert.notEqual(start, -1, `missing source anchor ${startText}`);
  const end = html.indexOf(endText, start + startText.length);
  assert.notEqual(end, -1, `missing source anchor ${endText}`);
  return html.slice(start, end);
}

function assertInOrder(text, markers, label) {
  let previous = -1;
  for (const marker of markers) {
    const next = text.indexOf(marker);
    assert.ok(next > previous, `${label}: expected ${marker} after prior restore step`);
    previous = next;
  }
}

function assertSourceMatch(pattern, message) {
  assert.ok(pattern.test(html), message);
}

function assertSourceNoMatch(pattern, message) {
  assert.equal(pattern.test(html), false, message);
}

test('chart loads the shared save assets and starts the fixed chart session', () => {
  for (const asset of ['save-core.js', 'save-storage.js', 'save-session.js']) {
    assertSourceMatch(new RegExp(`<script[^>]+src=["']\\./assets/${asset.replaceAll('.', '\\.')}`), `${asset} is not loaded`);
  }
  assertSourceMatch(/href=["']\.\/assets\/save\.css["']/i, 'shared save styles are not loaded');

  const start = functionBlock('startChartSaveSession');
  assert.match(start, /ExpanseSave\.start\s*\(/);
  assert.match(start, /view:\s*['"]chart['"]/);
  assert.match(start, /baseURL:\s*new URL\(['"]\.\/['"],\s*location\.href\)/);
  assert.match(start, /host:\s*document\.getElementById\(['"]topbtns['"]\)/);
  assert.match(start, /adapter:\s*chartSaveAdapter/);
});

test('chart adapter exposes capture, validation, apply and pause boundaries', () => {
  assertSourceMatch(/stable:\s*chartSaveStable/);
  assertSourceMatch(/capture:\s*captureChartSnapshot/);
  assertSourceMatch(/validate:\s*validateChartSnapshot/);
  assertSourceMatch(/apply:\s*applyChartSnapshot/);
  assertSourceMatch(/pause:\s*setChartInputPaused/);
  assert.match(functionBlock('captureChartSnapshot'), /navigation:\s*captureChartNavigation\(\)/);
  assert.match(functionBlock('captureChartSnapshot'), /preferences:\s*\{\s*quality:\s*quality\s*\}/);
  assertSourceMatch(/var\s+chartInputPaused\s*=\s*true/);
});

test('capture uses the v1 navigation shape and preserves orbital phase records', () => {
  const capture = functionBlock('captureChartNavigation');
  for (const field of ['frame:', 'systemId:', 'pose:', 'camera:', 'selection:', 'phases:', 'chartReturn:']) {
    assert.ok(capture.includes(field), `navigation capture omits ${field}`);
  }
  assert.match(capture, /captureOrbitalPhases\(/);
  assert.match(capture, /captureChartReturnState\(/);

  const pose = functionBlock('captureChartPose');
  assert.match(pose, /position:\s*ship_state\.pos\.toArray\(\)/);
  assert.match(pose, /yaw:\s*ship_state\.yaw/);
  assert.match(pose, /pitch:\s*ship_state\.pitch/);

  const phases = functionBlock('captureOrbitalPhases');
  assert.match(phases, /anim\.orbiters/);
  assert.match(phases, /chartRuntimeBodyId\(/);
  assert.match(phases, /angle:/);
});

test('runtime body identities are parent-qualified and never persist p-array indexes', () => {
  const identity = functionBlock('chartRuntimeBodyId');
  assert.match(identity, /worldId\s*\+\s*['"]:star:['"]\s*\+\s*B\.def\.star\.seed/);
  assert.match(identity, /worldId\s*\+\s*['"]:featured:['"]\s*\+\s*body\.def\.seed/);
  assert.match(identity, /worldId\s*\+\s*['"]:moon:['"]\s*\+/);
  assert.match(identity, /worldId\s*\+\s*['"]:planet:['"]\s*\+\s*body\.def\.seed/);
  assert.match(identity, /worldId\s*\+\s*['"]:blackhole:['"]\s*\+\s*B\.def\.blackhole\.seed/);
  assert.match(identity, /body\.def\.kind\s*===\s*['"]bh['"]/);
  assert.doesNotMatch(identity, /:planet:[^\n]*(?:pi|index|bodyMapKey)/i);
  assert.match(functionBlock('resolveChartRuntimeBody'), /chartRuntimeBodyId\(/);
  assert.match(functionBlock('chartKnownRuntimeIds'), /blackhole:[\s\S]*phase:\s*true/);
});

test('validation is pure and resolves every saved system/body/phase ID before apply', () => {
  const validate = functionBlock('validateChartSnapshot');
  assert.match(validate, /ExpanseSaveCore\.validate\(/);
  assert.match(validate, /chartRuntimeBodyId|chartKnownRuntimeIds/);
  assert.match(validate, /phases/);
  assert.match(validate, /selection/);
  assert.doesNotMatch(validate, /chartInputPaused|chartSaveStable|applyChartSnapshot|enterSystemScene/,
    'validation must remain usable while paused and must not mutate/build a scene');
});

test('restore orders quality, scene, phases, return snapshot, pose/camera, then selection', () => {
  const apply = functionBlock('applyChartSnapshot');
  assert.match(apply, /await\s+validateChartSnapshot\(snapshot\)/);
  assertInOrder(apply, [
    'quality = snapshot.preferences.quality',
    'applyQuality()',
    'installChartSaveScene(nav)',
    'applyOrbitalPhases(nav)',
    'restoreChartReturnState(nav.chartReturn)',
    'applySavedPose(nav.pose)',
    'applySavedCamera(nav.camera)',
    'restoreChartSelection(nav)'
  ], 'chart restore');
  assert.match(functionBlock('installChartSaveScene'), /enterSystemScene\(/);
  assert.match(functionBlock('applyOrbitalPhases'), /resolveChartRuntimeBody\(/);
});

test('ordinary system return captures and restores camera while returning stationary', () => {
  const capture = functionBlock('captureChartReturnState');
  assert.match(capture, /camera:\s*captureSavedCamera\(\)/);
  assert.match(capture, /selection:/);
  const exit = functionBlock('exitSystemScene');
  assert.match(exit, /sysReturn\.camera/);
  assert.match(exit, /ship_state\.vel\.set\(0,\s*0,\s*0\)/);
  assert.match(exit, /applySavedCamera\(/);
  assert.doesNotMatch(exit, /ship_state\.vel\.copy\(sysReturn\.vel\)/);
});

test('stable predicate rejects pause, warp, transit and an uninstalled system scene', () => {
  const stable = functionBlock('chartSaveStable');
  assert.match(stable, /!chartInputPaused/);
  assert.match(stable, /!chartRestoreBusy/);
  assert.match(stable, /!ship_state\.warping/);
  assert.match(stable, /!sysTransit/);
  assert.match(stable, /activeScene\s*===\s*scene/);
  assert.match(stable, /sysBodies/);
  assert.doesNotMatch(stable, /camFree/, 'free camera is transient control, not an unsettled scene');
  assert.match(functionBlock('captureSavedCamera'), /mode:\s*ship_state\.camMode/);
  assert.match(functionBlock('applySavedCamera'), /camFree\s*=\s*false/);

  const validate = functionBlock('validateChartSnapshot');
  assert.doesNotMatch(validate, /chartSaveStable|chartInputPaused/,
    'adapter validation must work during start/import while pause is active');
});

test('pause gates movement, steering, keyboard, pointer, wheel and touch controls', () => {
  for (const name of ['updateFlight', 'updateCamFree', 'applyLookStick', 'steer', 'pinchTick']) {
    assert.match(functionBlock(name), /if\s*\(chartInputPaused\)\s*return/,
      `${name} can still mutate navigation while paused`);
  }
  const keydown = between("window.addEventListener('keydown'", "window.addEventListener('keyup'");
  assert.match(keydown, /if\s*\(chartInputPaused\)\s*return/);
  const pointer = between("canvas.addEventListener('pointerdown'", "canvas.addEventListener('contextmenu'");
  assert.match(pointer, /chartInputPaused/);
  const wheel = functionBlock('installChartInputHandlers');
  assert.match(wheel, /chartInputPaused/);
  const sticks = functionBlock('makeTouchStick');
  assert.ok((sticks.match(/chartInputPaused/g) || []).length >= 2, 'touch stick start/move must be gated');

  const clear = functionBlock('clearChartTransientInput');
  for (const token of ['keys = {}', 'stickMove', 'stickLook', 'touchUpDown', 'drag = null', 'camFree = false', 'lookAz', 'lookEl']) {
    assert.ok(clear.includes(token), `pause cleanup omits ${token}`);
  }
});

test('Board is available in settled system mode and uses the awaited shared handoff', () => {
  assertSourceNoMatch(/body\.sysmode\s+#btn-board\s*\{\s*display\s*:\s*none/i, 'Board remains hidden in system mode');
  const allowed = functionBlock('chartBoardAllowed');
  assert.match(allowed, /chartSaveStable\(/);
  assert.match(allowed, /mode\s*===\s*['"]chart['"]|mode\s*===\s*['"]system['"]/);

  const board = functionBlock('boardRipley');
  assert.match(board, /await\s+chartSaveSession\.handoff\(['"]interior['"]\)/);
  assert.match(board, /catch\s*\(/);
  assert.match(board, /toast\(/);
  assert.doesNotMatch(board, /location\.href\s*=/, 'Board must not navigate before durable handoff');

  const keydown = between("window.addEventListener('keydown'", "window.addEventListener('keyup'");
  assert.match(keydown, /k\s*===\s*['"]b['"]\)?[^\n]*boardRipley\(/i);
  assertSourceMatch(/\$\(['"]btn-board['"]\)\.onclick\s*=\s*boardRipley/);
});

test('frame ticks are cheap and completed warps/transits request best-effort checkpoints', () => {
  assert.match(functionBlock('loop'), /chartSaveSession\.tick\(\)/);
  const checkpoint = functionBlock('requestChartCheckpoint');
  assert.match(checkpoint, /chartSaveStable\(/);
  assert.match(checkpoint, /chartSaveSession\.checkpoint\(\)/);
  assert.match(checkpoint, /\.catch\(/);
  assert.match(functionBlock('updateWarp'), /requestChartCheckpoint\(\)/);
  assert.match(functionBlock('updateSysTransit'), /requestChartCheckpoint\(\)/);
});
