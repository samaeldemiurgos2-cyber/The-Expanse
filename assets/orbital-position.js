(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpanseOrbital = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function hashSeed(str) {
    if (typeof str !== 'string') throw new TypeError('Expected a seed string.');
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    if (!Number.isSafeInteger(seed)) throw new TypeError('Expected an integer seed.');
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function moonInclination(moonId) {
    if (typeof moonId !== 'string') throw new TypeError('Expected a moon identifier.');
    // Keep the renderer's operation order, including its final floating-point bit.
    return (mulberry32(hashSeed(moonId + 'incl'))() * 2 - 1) * 0.22;
  }
  function position(parent, radius, angle, inclination) {
    if (!Array.isArray(parent) || parent.length !== 3 || !Array.from(parent).every(Number.isFinite) ||
        ![radius, angle, inclination].every(Number.isFinite) || radius < 0) {
      throw new TypeError('Invalid orbital position.');
    }
    const s = Math.sin(angle);
    const result = [parent[0] + Math.cos(angle) * radius,
      parent[1] + s * radius * Math.sin(inclination), parent[2] + s * radius * Math.cos(inclination)];
    if (!result.every(Number.isFinite)) throw new TypeError('Invalid orbital position.');
    return result;
  }
  return Object.freeze({hashSeed, mulberry32, moonInclination, position});
});
