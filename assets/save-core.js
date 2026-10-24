(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpanseSaveCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_BYTES = 262144;
  class SaveError extends Error {
    constructor(code, message) { super(message); this.name = 'SaveError'; this.code = code; }
  }
  function fail(message, code) { throw new SaveError(code || 'INVALID', message); }
  function object(value, label) {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail(label + ' must be a plain object');
    return value;
  }
  function safeTree(value, depth) {
    if (depth > 20) fail('Snapshot is too deeply nested');
    if (value && typeof value === 'object') {
      if (!Array.isArray(value)) object(value, 'Field');
      for (const key of Object.keys(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('Forbidden property');
        safeTree(value[key], depth + 1);
      }
    }
  }
  function number(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label + ' is outside its allowed range');
    return value;
  }
  function choice(value, choices, label) {
    if (!choices.includes(value)) fail('Unknown ' + label);
    return value;
  }
  function id(value, nullable) {
    if (value === null && nullable) return null;
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,127}$/.test(value)) fail('Invalid runtime identifier');
    return value;
  }
  function angle(value) {
    number(value, -1e9, 1e9, 'Angle');
    const result = ((value + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    // Do not round on each serialization: this representation is idempotent.
    return value >= -Math.PI && value < Math.PI ? value : result;
  }
  function vector(value) {
    if (!Array.isArray(value) || value.length !== 3) fail('Expected three-component vector');
    return Array.from(value, n => number(n, -1e9, 1e9, 'Coordinate'));
  }
  function pose(value) {
    object(value, 'Pose');
    return { position: vector(value.position), yaw: angle(value.yaw), pitch: number(value.pitch, -Math.PI / 2, Math.PI / 2, 'Pitch') };
  }
  function camera(value, frame) {
    object(value, 'Camera');
    return {
      mode: choice(value.mode, ['chase', 'orbit'], 'camera mode'),
      zoom: number(value.zoom, .45, 4, 'Chase zoom'), orbitAz: angle(value.orbitAz),
      orbitEl: number(value.orbitEl, -1.4, 1.4, 'Orbit elevation'),
      orbitR: number(value.orbitR, frame === 'chart-mly' ? 1.2 : 1.5, frame === 'chart-mly' ? 60 : 900, 'Orbit radius'),
      pan: vector(value.pan)
    };
  }
  function navigation(value) {
    if (value === null) return null;
    object(value, 'Navigation');
    const frame = choice(value.frame, ['chart-mly', 'system-1000km'], 'coordinate frame');
    if (!Array.isArray(value.phases) || value.phases.length > 128) fail('Invalid orbital phase list');
    const seen = new Set();
    const phases = Array.from(value.phases, entry => {
      object(entry, 'Orbital phase');
      const key = id(entry.id);
      if (seen.has(key)) fail('Duplicate orbital identity'); seen.add(key);
      return {id: key, angle: angle(entry.angle)};
    }).sort((a,b) => a.id.localeCompare(b.id));
    let chartReturn = null;
    if (frame === 'chart-mly') {
      if (value.systemId !== null || value.chartReturn !== null || phases.length) fail('Chart contains system-frame context');
    } else {
      id(value.systemId);
      object(value.chartReturn, 'Chart return');
      chartReturn = {pose: pose(value.chartReturn.pose), camera: camera(value.chartReturn.camera, 'chart-mly'), selection: id(value.chartReturn.selection, true)};
    }
    return { frame, systemId: frame === 'chart-mly' ? null : value.systemId,
      pose: pose(value.pose), camera: camera(value.camera, frame), selection: id(value.selection, true), phases, chartReturn };
  }
  function interior(value) {
    if (value === null) return null;
    object(value, 'Interior');
    if (value.deckId !== 'gas-ripley/deck-1') fail('Unknown deck');
    return {deckId: value.deckId, x: number(value.x, -1e9, 1e9, 'Interior x'), z: number(value.z, -1e9, 1e9, 'Interior z'),
      yaw: angle(value.yaw), pitch: number(value.pitch, -1.43, 1.43, 'Interior pitch'), roomId: id(value.roomId, true)};
  }
  function survey(value) {
    if (value === null) return null;
    object(value, 'Survey');
    if (value.targetId !== 'karna-vex:moon:micqui-nobara') fail('Unknown survey target');
    if (typeof value.observedAt !== 'string' || value.observedAt.length > 32 || !Number.isFinite(Date.parse(value.observedAt)) || new Date(value.observedAt).toISOString() !== value.observedAt) fail('Invalid survey timestamp');
    return {targetId: value.targetId, observedAt: value.observedAt};
  }
  function bytes(text) { return new TextEncoder().encode(text).byteLength; }
  function validate(value) {
    object(value, 'Save'); safeTree(value, 0);
    if (value.format !== 'the-expanse/save') fail('Not a The Expanse save');
    if (![1,2].includes(value.schemaVersion) || value.runtimeCatalogVersion !== 1) fail('Unsupported save/catalog version; original data retained', 'VERSION');
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) fail('Invalid revision');
    if (value.savedAt !== null && (typeof value.savedAt !== 'string' || value.savedAt.length > 32 || !Number.isFinite(Date.parse(value.savedAt)) || new Date(value.savedAt).toISOString() !== value.savedAt)) fail('Invalid checkpoint timestamp');
    object(value.preferences, 'Preferences');
    const result = {format: value.format, schemaVersion: 2, runtimeCatalogVersion: 1,
      revision: value.revision, savedAt: value.savedAt, lastView: choice(value.lastView, ['chart','interior'], 'view'),
      navigation: navigation(value.navigation), interior: interior(value.interior), survey: value.schemaVersion === 1 ? null : survey(value.survey),
      preferences: {quality: choice(value.preferences.quality, ['high','low'], 'quality'), sensitivity: number(value.preferences.sensitivity, .5, 2, 'Sensitivity')} };
    if (bytes(JSON.stringify(result)) > MAX_BYTES) fail('Snapshot exceeds 256 KiB', 'SIZE');
    return result;
  }
  function fresh(preferences) {
    return validate({format:'the-expanse/save',schemaVersion:2,runtimeCatalogVersion:1,revision:0,savedAt:null,lastView:'chart',navigation:null,interior:null,survey:null,
      preferences:{quality: preferences && preferences.quality || 'high', sensitivity: preferences && preferences.sensitivity !== undefined ? preferences.sensitivity : 1}});
  }
  function parse(text) {
    if (typeof text !== 'string') fail('Expected JSON text');
    if (bytes(text) > MAX_BYTES) fail('Import exceeds 256 KiB', 'SIZE');
    let value; try { value = JSON.parse(text); } catch (_) { fail('Malformed save JSON'); }
    return validate(value);
  }
  function stringify(value) { return JSON.stringify(validate(value), null, 2); }
  function merge(value, patch) {
    const next = validate(value); object(patch, 'State patch'); safeTree(patch, 0);
    for (const key of ['navigation','interior','lastView']) if (Object.hasOwn(patch,key)) next[key] = patch[key];
    if (Object.hasOwn(patch,'preferences')) {
      object(patch.preferences, 'Preferences patch');
      for (const key of ['quality','sensitivity']) if (Object.hasOwn(patch.preferences,key)) next.preferences[key] = patch.preferences[key];
    }
    return validate(next);
  }
  return Object.freeze({MAX_BYTES,SaveError,fresh,validate,parse,stringify,merge});
});
