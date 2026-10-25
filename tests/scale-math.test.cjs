'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const file = path.join(__dirname, '../assets/scale-math.js');
function math() {
  assert.ok(fs.existsSync(file), 'scale-math domain asset is missing');
  return require(file);
}
function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('scale math is available as a standalone CommonJS domain asset', () => {
  assert.ok(fs.existsSync(file), 'scale-math domain asset is missing');
  assert.equal(typeof math().relativeMetres, 'function');
});

test('browser UMD loads without DOM, THREE, storage or CommonJS', () => {
  math();
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  assert.equal(context.ExpanseScaleMath.HULL_METRES, 312);
  assert.equal(context.ExpanseScaleMath.sliceIndex(10), 1);
});

test('physical constants and the six slice boundaries cannot be mutated', () => {
  const M = math();
  assert.equal(M.SYSTEM_METRES, 1e6);
  assert.equal(M.HULL_METRES, 312);
  assert.deepEqual(M.SLICE_BOUNDS, [.1, 10, 1e3, 1e5, 1e7, 1e9, 2e11]);
  assert.ok(Object.isFrozen(M.SLICE_BOUNDS));
  assert.throws(() => { M.SLICE_BOUNDS[1] = 11; }, TypeError);
});

test('relative conversion subtracts a large authored origin before multiplying', () => {
  const M = math();
  const position = Object.freeze([1e8 + .001, 2.000001, -3]);
  const origin = Object.freeze([1e8, 2, -3]);
  assert.deepEqual(M.relativeMetres(position, origin),
    [(1e8 + .001 - 1e8) * 1e6, (2.000001 - 2) * 1e6, 0]);
});

test('metre and authored conversion round trips preserve frame coordinates', () => {
  const M = math();
  const origin = Object.freeze([100, -200, 300]);
  const position = Object.freeze([100.125, -202.5, 300.000312]);
  assert.deepEqual(M.authoredPosition(M.relativeMetres(position, origin), origin), position);
  assert.deepEqual(M.authoredPosition([312, -1000, 0], [0, 0, 0]), [.000312, -.001, 0]);
});

test('coordinate conversions reject malformed, sparse and nonfinite vectors', () => {
  const M = math();
  const inherited = new Array(3);
  Object.setPrototypeOf(inherited, {0: 1, 1: 2, 2: 3});
  for (const bad of [null, {}, '123', [1, 2], [1, 2, 3, 4], [, 2, 3], inherited,
    [NaN, 0, 0], [0, Infinity, 0], ['1', 2, 3], [undefined, 2, 3]]) {
    for (const fn of [M.relativeMetres, M.authoredPosition]) {
      assert.throws(() => fn(bad, [0, 0, 0]), TypeError);
      assert.throws(() => fn([0, 0, 0], bad), TypeError);
    }
  }
});

test('coordinate conversions reject finite inputs whose result overflows', () => {
  const M = math();
  assert.throws(() => M.relativeMetres([1e308, 0, 0], [-1e308, 0, 0]), TypeError);
  assert.throws(() => M.relativeMetres([1e308, 0, 0], [0, 0, 0]), TypeError);
  assert.throws(() => M.authoredPosition([1e308, 0, 0], [Number.MAX_VALUE, 0, 0]), TypeError);
});

test('hull calibration measures 312 metres without retaining the old draw scale', () => {
  const M = math();
  assert.equal(M.hullScale(1.2) * 1.2, 312);
  assert.equal(M.hullScale(312), 1);
  for (const bad of [0, -1, NaN, Infinity, '1', Number.MIN_VALUE]) {
    assert.throws(() => M.hullScale(bad), TypeError);
  }
});

test('logical slices own shared boundaries once and include the final endpoint', () => {
  const M = math();
  const bounds = [.1, 10, 1e3, 1e5, 1e7, 1e9, 2e11];
  bounds.forEach((b, i) => assert.equal(M.sliceIndex(b), Math.min(i, 5)));
  for (let i = 1; i < bounds.length - 1; i++) {
    assert.equal(M.sliceIndex(bounds[i] * (1 - 1e-12)), i - 1);
    assert.equal(M.sliceIndex(bounds[i] * (1 + 1e-12)), i);
  }
  assert.equal(M.sliceIndex(.1 - 1e-12), -1);
  assert.equal(M.sliceIndex(2e11 + 1), -1);
  assert.equal(M.sliceIndex(-1), -1);
  for (const bad of [NaN, Infinity, undefined, '10']) assert.throws(() => M.sliceIndex(bad), TypeError);
});

test('raster guards are relative while fragment ownership remains unexpanded', () => {
  const M = math();
  const intervals = M.sliceIntervals();
  assert.equal(intervals.length, 6);
  intervals.forEach((band, i) => {
    assert.deepEqual(band, {near: M.SLICE_BOUNDS[i], far: M.SLICE_BOUNDS[i + 1],
      clipNear: M.SLICE_BOUNDS[i] * (1 - 1e-4),
      clipFar: M.SLICE_BOUNDS[i + 1] * (1 + 1e-4), includeFar: i === 5});
    assert.equal(M.sliceIndex(band.near), i);
  });
  try { intervals[0].near = 7; intervals.pop(); } catch (e) { assert.ok(e instanceof TypeError); }
  assert.equal(M.sliceIntervals().length, 6);
  assert.equal(M.sliceIntervals()[0].near, .1);
});

test('hull visibility uses strict 4/8 CSS pixel hysteresis', () => {
  const M = math();
  assert.equal(M.markerState(true, 3.999), false);
  assert.equal(M.markerState(true, 4), true);
  assert.equal(M.markerState(false, 4), false);
  assert.equal(M.markerState(false, 8), false);
  assert.equal(M.markerState(true, 8), true);
  assert.equal(M.markerState(false, 8.001), true);
  assert.equal(M.markerState(true, 0), false);
  for (const bad of [-1, NaN, Infinity, '8']) assert.throws(() => M.markerState(false, bad), TypeError);
});

test('stopping envelope includes braking, reaction and margin in authored units', () => {
  const M = math();
  close(M.stoppingDistance(.75), 1.225);
  close(M.stoppingDistance(2, 1, .5, .25), 3.25);
  assert.equal(M.stoppingDistance(0), .10);
  assert.equal(M.stoppingDistance(0, 1, 0, 0), 0);
});

test('stopping envelope rejects invalid physical parameters and overflow', () => {
  const M = math();
  for (const args of [[-1], [NaN], [Infinity], ['1'], [1, 0], [1, -1], [1, NaN],
    [1, .3, -1], [1, .3, Infinity], [1, .3, .25, -1], [1, .3, .25, NaN], [1e308]]) {
    assert.throws(() => M.stoppingDistance(...args), TypeError);
  }
  close(M.stoppingDistance(1e200, 1e200, 0, 0) / 1e200, .5);
});

test('braking retains a finite envelope when speed divided by brake overflows', () => {
  const M = math();
  // v^2 remains representable here: this is an independent finite reference.
  const expected = (1e-10 * 1e-10 / 2) / Number.MIN_VALUE;
  close(M.stoppingDistance(1e-10, Number.MIN_VALUE, 0, 0) / expected, 1);
});

test('Cruise engagement thresholds are strict with equality retaining state', () => {
  const M = math();
  assert.equal(M.cruiseAvailable(false, [1.725]), false);
  assert.equal(M.cruiseAvailable(true, [1.725]), true);
  assert.equal(M.cruiseAvailable(false, [1.7250001]), true);
  assert.equal(M.cruiseAvailable(true, [1.475]), true);
  assert.equal(M.cruiseAvailable(false, [1.475]), false);
  assert.equal(M.cruiseAvailable(true, [1.4749999]), false);
  assert.equal(M.cruiseAvailable(true, [1.6]), true);
  assert.equal(M.cruiseAvailable(false, [1.6]), false);
});

test('Cruise checks every body before considering nearest positive clearance', () => {
  const M = math();
  for (const bad of [[-1, 100], [100, 0], [2, NaN], [Infinity, 2], ['2'], [, 3], [], null]) {
    assert.equal(M.cruiseAvailable(true, bad), false);
    assert.equal(M.cruiseAvailable(false, bad), false);
  }
  assert.equal(M.cruiseAvailable(false, [100, 1.6, 200]), false);
  assert.equal(M.cruiseAvailable(false, Object.freeze([100, 2, 200])), true);
});

test('speed labels use nominal units with readable Maneuver values', () => {
  const M = math();
  assert.equal(M.formatSpeed(0), '0 m/s');
  assert.equal(M.formatSpeed(.0000312), '31.2 m/s');
  assert.equal(M.formatSpeed(.000000001), '0.001 m/s');
  assert.equal(M.formatSpeed(.001), '1 km/s');
  assert.equal(M.formatSpeed(.75), '750 km/s');
  assert.equal(M.formatSpeed(1.234567), '1235 km/s');
  assert.notEqual(M.formatSpeed(1e-15), '0 m/s');
  for (const bad of [-1, NaN, Infinity, '1', 1e308]) assert.throws(() => M.formatSpeed(bad), TypeError);
});

test('speed formatting cannot round a finite conversion into an Infinity label', () => {
  assert.throws(() => math().formatSpeed(Number.MAX_VALUE / 1000), TypeError);
});

test('projection maps camera-negative-Z to CSS viewport coordinates', () => {
  const M = math();
  assert.deepEqual(M.projectEye([0, 0, -10], 90, 2, 800, 400), {x: 400, y: 200, depth: 10, visible: true});
  const topRight = M.projectEye([20, 10, -10], 90, 2, 800, 400);
  close(topRight.x, 800); close(topRight.y, 0); assert.equal(topRight.visible, true);
  const lowerLeft = M.projectEye([-10, -5, -10], 90, 2, 800, 400);
  close(lowerLeft.x, 200); close(lowerLeft.y, 300);
});

test('projection visibility distinguishes offscreen from behind-eye positions', () => {
  const M = math();
  const offscreen = M.projectEye([21, 0, -10], 90, 2, 800, 400);
  assert.equal(offscreen.visible, false); assert.ok(offscreen.x > 800);
  assert.deepEqual(M.projectEye([0, 0, 2], 60, 1, 100, 100), {x: null, y: null, depth: -2, visible: false});
  assert.deepEqual(M.projectEye([1, 0, 0], 60, 1, 100, 100), {x: null, y: null, depth: 0, visible: false});
  // This is common-eye projection: logical clipping is separately owned by sliceIndex.
  assert.equal(M.projectEye([0, 0, -.01], 60, 1, 100, 100).visible, true);
});

test('projection rejects invalid camera parameters, vectors and arithmetic overflow', () => {
  const M = math();
  const valid = [[0, 0, -10], 60, 1, 100, 100];
  for (const [index, bad] of [[0, [, 0, -1]], [0, [NaN, 0, -1]], [1, 0], [1, 180], [1, NaN],
    [2, 0], [2, Infinity], [3, 0], [3, -1], [4, 0], [4, Infinity]]) {
    const args = valid.slice(); args[index] = bad;
    assert.throws(() => M.projectEye(...args), TypeError);
  }
  assert.throws(() => M.projectEye([1e308, 0, -Number.MIN_VALUE], 60, 1, 100, 100), TypeError);
});

test('ruler chooses a genuine 1/2/5 length in the requested CSS interval', () => {
  const M = math();
  assert.deepEqual(M.rulerLength(1), {metres: 100, pixels: 100});
  assert.deepEqual(M.rulerLength(.5), {metres: 50, pixels: 100});
  assert.deepEqual(M.rulerLength(2.5), {metres: 200, pixels: 80});
  assert.deepEqual(M.rulerLength(1.25), {metres: 100, pixels: 80});
  assert.equal(M.rulerLength(3), null);
  for (const scale of [1e-200, 1e-6, .015, .7, 2, 7, 1e6, 1e200]) {
    const result = M.rulerLength(scale);
    if (!result) continue;
    assert.ok(result.pixels >= 80 && result.pixels <= 160);
    close(result.metres / scale, result.pixels);
    const power = Math.floor(Math.log10(result.metres));
    const digit = result.metres / 10 ** power;
    assert.ok([1, 2, 5].some(expected => Math.abs(digit - expected) < 1e-10));
  }
});

test('ruler handles unusable and extreme scales without nonfinite output', () => {
  const M = math();
  for (const bad of [0, -1, NaN, Infinity, '1']) assert.throws(() => M.rulerLength(bad), TypeError);
  assert.equal(M.rulerLength(Number.MAX_VALUE), null);
  const tiny = M.rulerLength(Number.MIN_VALUE);
  assert.ok(tiny === null || (Number.isFinite(tiny.metres) && tiny.pixels >= 80 && tiny.pixels <= 160));
});
