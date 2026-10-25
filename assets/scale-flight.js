(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExpanseScaleFlight = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Authored system units per second (and per second squared), not engine limits.
  const PROFILES = Object.freeze({
    maneuver: Object.freeze({maxSpeed:.0000312, acceleration:.0001248, damping:2, brake:.000156}),
    cruise: Object.freeze({maxSpeed:.75, acceleration:.30, damping:.10, brake:.30})
  });

  function vector(value) {
    if (!Array.isArray(value) || value.length !== 3) throw new TypeError('Expected a finite three-vector');
    const copy = Array.from(value);
    if (!copy.every(Number.isFinite) || !Number.isFinite(Math.hypot(...copy))) {
      throw new TypeError('Expected a finite three-vector without magnitude overflow');
    }
    return copy;
  }

  function boolean(value, name) {
    if (typeof value !== 'boolean') throw new TypeError(name + ' must be boolean');
    return value;
  }

  function options(value, names) {
    if (value === undefined) value = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected options');
    for (const name of names) if (value[name] !== undefined) boolean(value[name], name);
    return value;
  }

  function read(state) {
    if (!state || !Object.hasOwn(PROFILES, state.regime)) throw new TypeError('Invalid flight state');
    const copy = {velocity:vector(state.velocity), regime:state.regime,
      slowing:boolean(state.slowing, 'slowing'), armed:boolean(state.armed, 'armed'),
      needsNeutral:boolean(state.needsNeutral, 'needsNeutral'),
      available:boolean(state.available, 'available'), input:vector(state.input)};
    if (Math.hypot(...copy.input) > 1 + 1e-14) throw new TypeError('Flight input exceeds unit magnitude');
    const cap = copy.slowing ? PROFILES.cruise.maxSpeed : PROFILES[copy.regime].maxSpeed;
    if ((copy.slowing && copy.regime !== 'maneuver') || Math.hypot(...copy.velocity) > cap * (1 + 1e-14)) {
      throw new TypeError('Flight velocity exceeds active cap');
    }
    return copy;
  }

  function publish(state) {
    return Object.freeze({...state,
      velocity:Object.freeze(state.velocity.map(n => n === 0 ? 0 : n)),
      input:Object.freeze(state.input.map(n => n === 0 ? 0 : n))});
  }

  function createState() {
    return publish({velocity:[0,0,0], regime:'maneuver', slowing:false, armed:false,
      needsNeutral:true, available:false, input:[0,0,0]});
  }

  function reset(state) {
    read(state);
    // Clearing commands says nothing about physical keys or a still-held stick.
    return createState();
  }

  function selectRegime(state, regime, allowed) {
    const next = read(state);
    if (!Object.hasOwn(PROFILES, regime)) throw new TypeError('Unknown flight regime');
    next.available = boolean(allowed, 'allowed');
    if (regime === next.regime || (regime === 'cruise' && (!allowed || next.slowing))) return publish(next);
    next.regime = regime;
    next.slowing = regime === 'maneuver' && Math.hypot(...next.velocity) > PROFILES.maneuver.maxSpeed;
    next.input = [0,0,0];
    next.armed = false;
    next.needsNeutral = true;
    return publish(next);
  }

  function observeInput(state, value, flags) {
    const next = read(state);
    const input = vector(value);
    const {fresh = false, repeat = false, neutral = false} = options(flags, ['fresh','repeat','neutral']);
    const magnitude = Math.hypot(...input);
    if (neutral && magnitude !== 0) throw new TypeError('Neutral observation must have zero input');
    next.input = magnitude > 1 ? input.map(n => n / magnitude) : input;
    if (magnitude === 0) {
      next.armed = false;
      next.needsNeutral = !(neutral && !repeat);
    } else if (!next.slowing && (next.armed || (!next.needsNeutral && fresh && !repeat))) {
      next.armed = true;
      next.needsNeutral = false;
    } else {
      next.armed = false;
      next.needsNeutral = true;
    }
    return publish(next);
  }

  function atSpeed(velocity, speed) {
    const magnitude = Math.hypot(...velocity);
    return magnitude === 0 || speed <= 0 ? [0,0,0] : velocity.map(n => n / magnitude * speed);
  }

  function step(state, dt, flags) {
    const next = read(state);
    if (!Number.isFinite(dt) || dt < 0) throw new TypeError('dt must be finite and nonnegative');
    const {brake = false, boost = false, blocked = false, available = next.available} =
      options(flags, ['brake','boost','blocked','available']);
    if (blocked) return createState();
    next.available = available;
    const elapsed = Math.min(dt, .05);
    const profile = PROFILES[next.regime];
    if (brake || next.slowing) {
      const outgoing = next.slowing ? PROFILES.cruise : profile;
      const floor = brake ? 0 : profile.maxSpeed;
      const reduced = Math.max(floor, Math.hypot(...next.velocity) - outgoing.brake * elapsed);
      next.velocity = atSpeed(next.velocity, reduced);
      if (next.slowing) {
        next.slowing = reduced > profile.maxSpeed;
        next.armed = false;
      }
    } else {
      // Exact constant-input solution of dv/dt = A*input - D*v; stable at any allowed dt.
      const decay = Math.exp(-profile.damping * elapsed);
      const gain = -Math.expm1(-profile.damping * elapsed) / profile.damping;
      const acceleration = next.armed && !next.needsNeutral ? profile.acceleration * (boost ? 1.5 : 1) : 0;
      next.velocity = next.velocity.map((n, i) => n * decay + next.input[i] * acceleration * gain);
      const magnitude = Math.hypot(...next.velocity);
      if (magnitude > profile.maxSpeed) next.velocity = atSpeed(next.velocity, profile.maxSpeed);
    }
    return publish(next);
  }

  return Object.freeze({PROFILES, createState, reset, selectRegime, observeInput, step});
}));
