'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, '../assets/scale-flight.js');
const Flight = fs.existsSync(file) ? require(file) : null;

test('the pure flight module exposes the approved UMD API', () => {
  assert.ok(Flight && typeof Flight.createState === 'function', 'scale flight module is not implemented');
  assert.deepEqual(Object.keys(Flight).sort(), ['PROFILES','createState','observeInput','reset','selectRegime','step'].sort());
});

const zero = [0, 0, 0];
const neutral = {fresh:false, repeat:false, neutral:true};
const fresh = {fresh:true, repeat:false, neutral:false};
const held = {fresh:false, repeat:false, neutral:false};
const speed = state => Math.hypot(...state.velocity);
function close(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}
function armed(regime = 'cruise', vector = [1, 0, 0]) {
  let state = Flight.createState();
  if (regime === 'cruise') state = Flight.selectRegime(state, regime, true);
  return Flight.observeInput(Flight.observeInput(state, zero, neutral), vector, fresh);
}
function run(state, seconds, options = {}) {
  for (let i = 0; i < Math.round(seconds / .05); i++) state = Flight.step(state, .05, options);
  return state;
}

test('classic script exposes only a pure UMD global without browser services', () => {
  assert.ok(fs.existsSync(file), 'scale flight module is not implemented');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  assert.equal(typeof context.ExpanseScaleFlight.step, 'function');
  assert.equal(context.ExpanseScaleFlight.createState().regime, 'maneuver');
});

test('profiles contain the exact approved authored-unit constants and are immutable', () => {
  assert.deepEqual(Flight.PROFILES, {
    maneuver:{maxSpeed:.0000312, acceleration:.0001248, damping:2, brake:.000156},
    cruise:{maxSpeed:.75, acceleration:.30, damping:.10, brake:.30}
  });
  assert.ok(Object.isFrozen(Flight.PROFILES));
  assert.ok(Object.isFrozen(Flight.PROFILES.cruise));
});

test('new state and reset are stationary unavailable Maneuver requiring physical neutral', () => {
  const expected = {velocity:[0,0,0], regime:'maneuver', slowing:false, armed:false,
    needsNeutral:true, available:false, input:[0,0,0]};
  const initial = Flight.createState();
  assert.deepEqual(initial, expected);
  const moving = run(armed(), 1);
  assert.deepEqual(Flight.reset(moving), expected);
  assert.ok(Object.isFrozen(initial) && Object.isFrozen(initial.velocity) && Object.isFrozen(initial.input));
  assert.notEqual(Flight.reset(moving).velocity, initial.velocity);
  assert.deepEqual(Flight.step(Flight.observeInput(Flight.reset(moving), [1,0,0], fresh), .05, {}).velocity, zero);
});

test('selecting Cruise never accelerates and held fresh thrust needs observed neutral first', () => {
  let state = Flight.selectRegime(Flight.createState(), 'cruise', true);
  assert.equal(state.regime, 'cruise');
  assert.deepEqual(state.velocity, zero);
  state = Flight.observeInput(state, [1,0,0], fresh);
  assert.deepEqual(Flight.step(state, .05, {}).velocity, zero);
  state = Flight.observeInput(state, zero, neutral);
  state = Flight.observeInput(state, [1,0,0], fresh);
  assert.ok(Flight.step(state, .05, {}).velocity[0] > 0);
});

test('Cruise needs allowed entry but availability loss never ejects engaged Cruise', () => {
  assert.equal(Flight.selectRegime(Flight.createState(), 'cruise', false).regime, 'maneuver');
  const moving = run(armed(), 1);
  const unavailable = Flight.step(moving, .05, {available:false});
  assert.equal(unavailable.regime, 'cruise');
  assert.equal(unavailable.available, false);
  assert.ok(speed(unavailable) > speed(moving));
  assert.equal(Flight.selectRegime(unavailable, 'cruise', false).armed, true);
  assert.equal(Flight.selectRegime(unavailable, 'maneuver', false).regime, 'maneuver');
  assert.ok(speed(Flight.step(unavailable, .05, {brake:true})) < speed(unavailable));
});

test('regime changes preserve velocity but clear thrust and require a new neutral observation', () => {
  const moving = run(armed('maneuver'), .1);
  const selected = Flight.selectRegime(moving, 'cruise', true);
  assert.deepEqual(selected.velocity, moving.velocity);
  assert.deepEqual(selected.input, zero);
  assert.equal(selected.armed, false);
  assert.equal(selected.needsNeutral, true);
});

test('buffer clearing is not neutral and repeat or merely held thrust cannot arm', () => {
  for (const event of [held, {...fresh, repeat:true}]) {
    const released = Flight.observeInput(Flight.createState(), zero, neutral);
    const input = Flight.observeInput(released, [1,0,0], event);
    assert.equal(input.armed, false);
    assert.deepEqual(Flight.step(input, .05, {}).velocity, zero);
  }
  const cleared = Flight.observeInput(armed(), zero, held);
  assert.equal(cleared.needsNeutral, true);
  assert.deepEqual(Flight.step(Flight.observeInput(cleared, [1,0,0], fresh), .05, {}).velocity, zero);
  const repeatedRelease = Flight.observeInput(Flight.createState(), zero, {...neutral, repeat:true});
  assert.deepEqual(Flight.step(Flight.observeInput(repeatedRelease, [1,0,0], fresh), .05, {}).velocity, zero);
});

test('touch neutral then a new partial stick gesture arms and retains analog demand', () => {
  const state = armed('cruise', [.25,0,0]);
  assert.equal(state.armed, true);
  close(Flight.step(state, .05, {}).velocity[0], Flight.step(armed(), .05, {}).velocity[0] / 4);
  const continued = Flight.observeInput(state, [.5,0,0], held);
  assert.equal(continued.armed, true);
  assert.deepEqual(continued.input, [.5,0,0]);
});

test('all operations detach mutable state vectors including denied and no-op selections', () => {
  const input = [1,0,0];
  const mutable = {...armed(), velocity:[.2,0,0], input};
  for (const state of [Flight.step(mutable, 0, {}), Flight.selectRegime(mutable, 'cruise', false),
    Flight.observeInput(mutable, input, held)]) {
    assert.notEqual(state.input, input);
    assert.notEqual(state.velocity, mutable.velocity);
    assert.ok(Object.isFrozen(state) && Object.isFrozen(state.input) && Object.isFrozen(state.velocity));
  }
  const observed = Flight.observeInput(mutable, input, held);
  input[0] = 0;
  mutable.velocity[0] = 9;
  assert.deepEqual(observed.input, [1,0,0]);
  assert.deepEqual(observed.velocity, [.2,0,0]);
});

test('finite dt clips to .05 and zero dt leaves motion unchanged', () => {
  const state = armed();
  assert.deepEqual(Flight.step(state, 999, {}), Flight.step(state, .05, {}));
  assert.deepEqual(Flight.step(state, 0, {}).velocity, state.velocity);
  assert.equal(Flight.step(state, 0, {available:false}).available, false);
});

test('thrust and damping use stable constant-input integration independent of dt partition', () => {
  const once = Flight.step(armed(), .05, {});
  const twice = Flight.step(Flight.step(armed(), .025, {}), .025, {});
  close(once.velocity[0], 3 * (1 - Math.exp(-.1 * .05)));
  close(once.velocity[0], twice.velocity[0]);
});

test('combined directions normalize without diagonal acceleration or cap advantage', () => {
  const axial = Flight.step(armed(), .05, {});
  const diagonal = Flight.step(armed('cruise', [1,1,1]), .05, {});
  close(speed(axial), speed(diagonal));
  close(diagonal.velocity[0], axial.velocity[0] / Math.sqrt(3));
  close(speed(run(armed('cruise', [1,1,1]), 10)), .75);
  close(speed(run(armed('maneuver', [1,1,0]), 2)), .0000312);
});

test('Shift multiplies acceleration by 1.5 without changing speed cap or brake', () => {
  close(speed(Flight.step(armed(), .05, {boost:true})), speed(Flight.step(armed(), .05, {})) * 1.5);
  close(speed(run(armed(), 10, {boost:true})), .75);
  const capped = run(armed(), 10);
  assert.deepEqual(Flight.step(capped, .05, {boost:true,brake:true}), Flight.step(capped, .05, {brake:true}));
});

test('neutral coasts exponentially without hidden acceleration or numerical reversal', () => {
  const moving = run(armed(), 1);
  const coast = Flight.observeInput(moving, zero, neutral);
  close(speed(run(coast, 1)), speed(moving) * Math.exp(-.1));
  assert.equal(run(coast, 1).regime, 'cruise');
});

test('brake overrides held thrust with linear deceleration and stops without reverse', () => {
  const moving = run(armed(), 10);
  const braking = Flight.step(moving, .05, {brake:true});
  close(speed(braking), .735);
  assert.ok(braking.velocity[0] > 0);
  assert.deepEqual(run(moving, 3, {brake:true}).velocity, zero);
  assert.deepEqual(Flight.step(armed(), .05, {brake:true}).velocity, zero);
});

test('Cruise exit slows continuously at outgoing brake and rejects thrust until settled', () => {
  let state = Flight.selectRegime(run(armed(), 10), 'maneuver', false);
  assert.equal(state.slowing, true);
  close(speed(state), .75);
  state = Flight.observeInput(Flight.observeInput(state, zero, neutral), [1,0,0], fresh);
  state = Flight.step(state, .05, {});
  close(speed(state), .735);
  assert.equal(state.armed, false);
  assert.equal(Flight.selectRegime(state, 'cruise', true).regime, 'maneuver');
  for (let i = 0; i < 60 && state.slowing; i++) state = Flight.step(state, .05, {});
  assert.equal(state.slowing, false);
  close(speed(state), .0000312);
  const before = speed(state);
  assert.ok(speed(Flight.step(state, .05, {})) < before);
  const rearmed = Flight.observeInput(Flight.observeInput(state, zero, neutral), [1,0,0], fresh);
  assert.equal(rearmed.armed, true);
});

test('braking during Cruise exit can cross the lower cap and stop at zero', () => {
  const state = Flight.selectRegime(run(armed(), 10), 'maneuver', false);
  const stopped = run(state, 3, {brake:true});
  assert.equal(stopped.slowing, false);
  assert.deepEqual(stopped.velocity, zero);
});

test('blocked step resets all transient flight state and does not introduce position', () => {
  const original = run(armed(), 1);
  const blocked = Flight.step(original, .05, {blocked:true,available:true});
  assert.deepEqual(blocked, Flight.createState());
  assert.equal(Object.hasOwn(blocked, 'position'), false);
  assert.ok(speed(original) > 0);
});

test('bad finite values, sparse and overflow vectors fail explicitly', () => {
  const state = armed();
  for (const dt of [-1, NaN, Infinity, '0.05', null]) assert.throws(() => Flight.step(state, dt, {}), TypeError);
  for (const vector of [[NaN,0,0], [Infinity,0,0], [1,2], [1,2,3,4], [1,,0],
    [Number.MAX_VALUE,Number.MAX_VALUE,0], {0:1,1:0,2:0,length:3}]) {
    assert.throws(() => Flight.observeInput(state, vector, fresh), TypeError);
  }
  assert.throws(() => Flight.step({...state,velocity:[NaN,0,0]}, .05, {}), TypeError);
  assert.throws(() => Flight.selectRegime(state, 'warp', true), TypeError);
  assert.throws(() => Flight.selectRegime(state, 'cruise', 'yes'), TypeError);
  assert.throws(() => Flight.step(state, .05, {brake:1}), TypeError);
  assert.throws(() => Flight.observeInput(state, [1,0,0], {...fresh,neutral:true}), TypeError);
  assert.throws(() => Flight.observeInput(state, zero, null), TypeError);
});

test('very large finite direction is safely normalized and caller vector is unchanged', () => {
  const vector = [1e300,1e300,0];
  const state = armed('cruise', vector);
  close(Math.hypot(...state.input), 1);
  assert.deepEqual(vector, [1e300,1e300,0]);
  assert.ok(Number.isFinite(speed(Flight.step(state, .05, {}))));
});

test('fixed-target deliberate Cruise approach enters range and brakes in 30–60 seconds', () => {
  // Numerical trajectory around the exact constant-input analytic ramp, not browser/live-orbit evidence.
  const rampTime = -Math.log(1 - .1 * .75 / .3) / .1;
  const rampDistance = 3 * (rampTime - (1 - Math.exp(-.1 * rampTime)) / .1);
  const analyticEntry = rampTime + (27 - rampDistance) / .75;
  close(analyticEntry, 37.36953782644657, 1e-8);
  let state = armed('cruise', [-1,0,0]);
  let x = 45, elapsed = 0, enteredAt = null, braking = false;
  const brakeStart = 16 + .75 * .75 / (2 * .3);
  for (let i = 0; i < 6000; i++) {
    if (x <= brakeStart) braking = true;
    state = Flight.step(state, .01, {brake:braking});
    x += state.velocity[0] * .01;
    elapsed += .01;
    if (x <= 18 && enteredAt === null) enteredAt = elapsed;
    if (braking && speed(state) === 0) break;
  }
  close(enteredAt, analyticEntry, .03);
  assert.ok(elapsed >= 30 && elapsed <= 60, `elapsed ${elapsed}`);
  assert.ok(x > 6 && x <= 18, `final centre distance ${x}`);
  assert.equal(speed(state), 0);
});
