(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpanseScaleMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SYSTEM_METRES = 1e6;
  const HULL_METRES = 312;
  const SLICE_BOUNDS = Object.freeze([.1, 10, 1e3, 1e5, 1e7, 1e9, 2e11]);
  const intervals = Object.freeze(SLICE_BOUNDS.slice(0, -1).map((near, i) => {
    const far = SLICE_BOUNDS[i + 1];
    return Object.freeze({near, far, clipNear: near * (1 - 1e-4),
      clipFar: far * (1 + 1e-4), includeFar: i === SLICE_BOUNDS.length - 2});
  }));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function finite(value) {
    if (!Number.isFinite(value)) throw new TypeError('Expected a finite number.');
    return value;
  }
  function positive(value) {
    if (finite(value) <= 0) throw new TypeError('Expected a positive number.');
    return value;
  }
  function nonnegative(value) {
    if (finite(value) < 0) throw new TypeError('Expected a nonnegative number.');
    return value;
  }
  function boolean(value) {
    if (typeof value !== 'boolean') throw new TypeError('Expected a boolean.');
    return value;
  }
  function vector(value) {
    if (!Array.isArray(value) || value.length !== 3) throw new TypeError('Expected a three-number array.');
    for (let i = 0; i < 3; i++) {
      if (!own(value, i)) throw new TypeError('Expected a dense three-number array.');
      finite(value[i]);
    }
    return value;
  }

  function relativeMetres(position, origin) {
    vector(position); vector(origin);
    // Subtract in authored JS-number precision before scaling/uploading GPU floats.
    return [0, 1, 2].map(i => finite((position[i] - origin[i]) * SYSTEM_METRES));
  }
  function authoredPosition(metres, origin) {
    vector(metres); vector(origin);
    return [0, 1, 2].map(i => finite(origin[i] + metres[i] / SYSTEM_METRES));
  }
  function hullScale(rawLongitudinalExtent) {
    return finite(HULL_METRES / positive(rawLongitudinalExtent));
  }
  function sliceIndex(axialDepth) {
    finite(axialDepth);
    if (axialDepth < SLICE_BOUNDS[0] || axialDepth > SLICE_BOUNDS[6]) return -1;
    for (let i = 0; i < intervals.length; i++) {
      if (axialDepth < intervals[i].far || intervals[i].includeFar) return i;
    }
    return -1;
  }
  function sliceIntervals() { return intervals; }

  function markerState(previousHullVisible, cssPixels) {
    boolean(previousHullVisible); nonnegative(cssPixels);
    if (cssPixels < 4) return false;
    if (cssPixels > 8) return true;
    return previousHullVisible;
  }
  function stoppingDistance(speed, brake = .30, reaction = .25, margin = .10) {
    nonnegative(speed); positive(brake); nonnegative(reaction); nonnegative(margin);
    // Avoid both v*v and v/brake overflow when the final envelope is finite.
    const scaledSpeed = speed / Math.sqrt(brake);
    return finite((scaledSpeed / 2) * scaledSpeed + speed * reaction + margin);
  }
  function cruiseAvailable(previous, clearances) {
    boolean(previous);
    if (!Array.isArray(clearances) || clearances.length === 0) return false;
    let nearest = Infinity;
    for (let i = 0; i < clearances.length; i++) {
      if (!own(clearances, i) || !Number.isFinite(clearances[i]) || clearances[i] <= 0) return false;
      nearest = Math.min(nearest, clearances[i]);
    }
    if (nearest > 1.725) return true;
    if (nearest < 1.475) return false;
    return previous;
  }
  function formatSpeed(authoredSpeed) {
    nonnegative(authoredSpeed);
    const small = authoredSpeed < .001;
    const value = finite(authoredSpeed * (small ? SYSTEM_METRES : 1000));
    // Significant figures retain tiny nonzero Maneuver speeds; no locale dependency.
    return finite(Number(value.toPrecision(4))).toString() + (small ? ' m/s' : ' km/s');
  }

  function projectEye(position, fovDegrees, aspect, width, height) {
    vector(position); positive(fovDegrees); positive(aspect); positive(width); positive(height);
    if (fovDegrees >= 180) throw new TypeError('Expected a field of view below 180 degrees.');
    const tangent = positive(Math.tan(fovDegrees * (Math.PI / 360)));
    const depth = position[2] === 0 ? 0 : -position[2];
    if (depth <= 0) return {x: null, y: null, depth, visible: false};
    let nx = finite(position[0] / depth / tangent / aspect);
    let ny = finite(position[1] / depth / tangent);
    // Account only for arithmetic roundoff at an exact lateral frustum edge.
    const edge = 8 * Number.EPSILON;
    if (Math.abs(Math.abs(nx) - 1) <= edge) nx = Math.sign(nx);
    if (Math.abs(Math.abs(ny) - 1) <= edge) ny = Math.sign(ny);
    return {x: finite((nx / 2 + .5) * width), y: finite((.5 - ny / 2) * height), depth,
      visible: Math.abs(nx) <= 1 && Math.abs(ny) <= 1};
  }

  function rulerLength(metresPerCssPixel) {
    positive(metresPerCssPixel);
    const exponent = Math.floor(Math.log10(metresPerCssPixel)) + 2;
    let best = null;
    // All possible 80..160px candidates lie in these adjacent decades.
    for (let power = exponent - 1; power <= exponent + 1; power++) {
      for (const digit of [1, 2, 5]) {
        const metres = digit * 10 ** power;
        const pixels = metres / metresPerCssPixel;
        if (!Number.isFinite(metres) || metres <= 0 || !Number.isFinite(pixels) || pixels < 80 || pixels > 160) continue;
        // Closest to 120px; an exact tie selects the smaller physical length.
        if (!best || Math.abs(pixels - 120) < Math.abs(best.pixels - 120)) best = {metres, pixels};
      }
    }
    return best;
  }

  return Object.freeze({SYSTEM_METRES, HULL_METRES, SLICE_BOUNDS, relativeMetres, authoredPosition,
    hullScale, sliceIndex, sliceIntervals, markerState, stoppingDistance, cruiseAvailable,
    formatSpeed, projectEye, rulerLength});
});
