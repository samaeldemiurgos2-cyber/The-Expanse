(function (root, factory) {
  'use strict';
  const commonJS = typeof module === 'object' && module.exports;
  const api = factory(commonJS ? require('./save-core.js') : root.ExpanseSaveCore,
    commonJS ? require('./orbital-position.js') : root.ExpanseOrbital, root);
  if (commonJS) module.exports = api;
  else root.ExpanseSurvey = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Orbital, root) {
  'use strict';
  if (!Core || !Orbital) throw new TypeError('Survey requires the save core and orbital modules.');
  const WORLD_ID = 'karna-vex';
  const MOON_ID = 'micqui-nobara';
  const TARGET_ID = WORLD_ID + ':moon:' + MOON_ID;
  const MAX_BYTES = 1024 * 1024;
  const TIMEOUT_MS = 8000;
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,127}$/;
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
  const catalogs = new WeakMap();
  let activeRequest = null;

  function failure(code, message) { return new Core.SaveError(code, message); }
  function invalid(message) { throw failure('INVALID', message); }
  function object(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(label + ' must be a plain object.');
    if (Object.getOwnPropertyNames(value).some(key => FORBIDDEN.has(key))) invalid('Forbidden catalog property.');
    return value;
  }
  function own(value, key, optional) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor && optional) return undefined;
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) invalid('Missing or non-data field: ' + key + '.');
    return descriptor.value;
  }
  function list(value, max, label) {
    if (!Array.isArray(value) || value.length > max) invalid(label + ' exceeds its allowed size.');
    return Array.from({length:value.length}, (_, index) => own(value, String(index)));
  }
  function identifier(value) {
    if (typeof value !== 'string' || !ID_RE.test(value) || FORBIDDEN.has(value)) invalid('Invalid catalog identifier.');
    return value;
  }
  function text(value, max, label, empty) {
    if (typeof value !== 'string' || Array.from(value).length > max || (!empty && !value.trim())) invalid('Invalid ' + label + '.');
    return value;
  }
  function positive(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) invalid('Invalid ' + label + '.');
    return value;
  }
  function descriptor(value) {
    object(value, 'Orbital definition');
    const seed = own(value, 'seed');
    if (!Number.isSafeInteger(seed)) invalid('Invalid orbital seed.');
    return {seed, radius:positive(own(value, 'radius'), 'body radius'),
      orbit:positive(own(value, 'orbit'), 'orbit radius'), biome:identifier(own(value, 'biome'))};
  }
  function parseCatalog(data) {
    object(data, 'Catalog');
    const worlds = list(own(data, 'worlds'), 256, 'World list');
    if (!worlds.length) invalid('The world list is empty.');
    const worldMap = new Map();
    for (const world of worlds) {
      object(world, 'World');
      const id = identifier(own(world, 'id'));
      text(own(world, 'name'), 256, 'world name');
      if (worldMap.has(id)) invalid('Duplicate world identifier.');
      worldMap.set(id, world);
    }
    const world = worldMap.get(WORLD_ID);
    if (!world) invalid('The fixed survey world is absent.');
    const systems = object(own(data, 'systems'), 'System index');
    if (Object.keys(systems).length > 256) invalid('System index exceeds its allowed size.');
    for (const id of Object.keys(systems)) {
      identifier(id);
      if (!worldMap.has(id)) invalid('System definition has no matching world.');
      object(own(systems, id), 'System definition');
    }
    const system = object(own(systems, WORLD_ID), 'Fixed system definition');
    if (own(system, 'blackhole', true) !== undefined) invalid('The fixed survey system has an incompatible extra orbiter.');
    const parent = descriptor(own(system, 'featured'));
    const parentId = identifier(WORLD_ID + ':featured:' + parent.seed);
    const phaseIDs = new Set([parentId]);
    function addPhase(id) {
      identifier(id);
      if (phaseIDs.has(id)) invalid('Duplicate orbital identity.');
      phaseIDs.add(id);
      if (phaseIDs.size > 128) invalid('Too many orbital identities.');
    }
    const moons = list(own(world, 'moons'), 128, 'Moon list');
    const styles = object(own(system, 'moonStyles'), 'Moon definitions');
    const moonMap = new Map();
    let target = null, targetOrbit = null;
    for (const moon of moons) {
      object(moon, 'Moon');
      const id = identifier(own(moon, 'id'));
      const name = text(own(moon, 'name'), 256, 'moon name');
      if (moonMap.has(id)) invalid('Duplicate moon identifier.');
      moonMap.set(id, moon);
      const definition = descriptor(own(styles, id));
      addPhase(WORLD_ID + ':moon:' + id);
      if (id === MOON_ID) {
        if (own(moon, 'class') !== 'moon') invalid('The fixed survey target is not a moon.');
        const lore = text(own(moon, 'lore'), 4096, 'moon lore', true);
        if (!Number.isFinite(definition.radius * 2)) invalid('Invalid survey radius.');
        target = Object.freeze({id:TARGET_ID, name, lore, biome:definition.biome, radius:definition.radius});
        targetOrbit = definition.orbit;
      }
    }
    for (const id of Object.keys(styles)) {
      identifier(id);
      if (!moonMap.has(id)) invalid('Moon definition has no matching moon.');
    }
    if (!target) invalid('The fixed survey moon is absent.');
    for (const planet of list(own(system, 'planets'), 128, 'Planet list')) {
      object(planet, 'Planet');
      text(own(planet, 'name'), 256, 'planet name');
      const definition = descriptor(planet);
      addPhase(WORLD_ID + ':planet:' + definition.seed);
    }
    const catalog = Object.freeze({target});
    catalogs.set(catalog, {parentId, parentOrbit:parent.orbit, targetOrbit,
      inclination:Orbital.moonInclination(MOON_ID), phaseIDs});
    return catalog;
  }
  function evaluate(navigation, catalog) {
    const definition = catalogs.get(catalog);
    if (!definition) invalid('Use a validated survey catalog.');
    const radius = catalog.target.radius;
    function result(eligible, reason, centerDistance, clearance) {
      return {eligible, reason, centerDistance:centerDistance === undefined ? null : centerDistance,
        clearance:clearance === undefined ? null : clearance, radius, maxClearance:2*radius, units:'system-1000km'};
    }
    if (navigation === null) return result(false, 'Visit the exterior chart, approach Micqui-Nobara and board again.');
    object(navigation, 'Navigation');
    if (own(navigation, 'frame') !== 'system-1000km') return result(false, 'Enter the Karna Vex system, approach Micqui-Nobara and board again.');
    if (own(navigation, 'systemId') !== WORLD_ID) return result(false, 'Return to Karna Vex, approach Micqui-Nobara and board again.');
    let nav;
    try { nav = Core.validate({...Core.fresh(), navigation}).navigation; }
    catch (error) { invalid(error.message || 'Invalid exterior context.'); }
    if (nav.phases.length !== definition.phaseIDs.size) invalid('The complete Karna Vex orbital phase set is required.');
    const phases = new Map();
    for (const phase of nav.phases) {
      if (!definition.phaseIDs.has(phase.id) || phases.has(phase.id)) invalid('Unknown or duplicate orbital phase.');
      phases.set(phase.id, phase.angle);
    }
    let parent, moon;
    try {
      parent = Orbital.position([0,0,0], definition.parentOrbit, phases.get(definition.parentId), 0);
      moon = Orbital.position(parent, definition.targetOrbit, phases.get(TARGET_ID), definition.inclination);
    } catch (_) { invalid('Invalid reconstructed orbital position.'); }
    const distance = Math.hypot(...nav.pose.position.map((coordinate, index) => coordinate - moon[index]));
    const clearance = distance - radius;
    if (!Number.isFinite(distance) || !Number.isFinite(clearance)) invalid('Invalid reconstructed survey distance.');
    if (clearance <= 0) return result(false, 'The ship must be outside Micqui-Nobara’s rendered surface. Return, approach and board again.', distance, clearance);
    if (clearance > 2*radius) return result(false, 'Outside survey range. Return, approach Micqui-Nobara more closely and board again.', distance, clearance);
    return result(true, 'Within the permitted surface-clearance band.', distance, clearance);
  }
  function patch(snapshot, catalog, observedAt) {
    const before = Core.validate(snapshot);
    if (before.schemaVersion !== 2) throw failure('VERSION', 'Survey requires save schema version 2.');
    if (before.survey !== null) return before;
    const range = evaluate(before.navigation, catalog);
    if (!range.eligible) invalid(range.reason);
    return Core.validate({...before, survey:{targetId:TARGET_ID, observedAt}});
  }
  function cancelBestEffort(target) {
    if (!target) return;
    try { if (typeof target.cancel === 'function') Promise.resolve(target.cancel()).catch(() => {}); }
    catch (_) {}
  }
  function normalizeBase(baseURL) {
    let base;
    try { base = new URL('./', baseURL); }
    catch (_) { throw failure('UNAVAILABLE', 'Survey catalog requires an HTTP(S) application URL.'); }
    const origin = root.location && root.location.origin;
    if (!['http:', 'https:'].includes(base.protocol) || !origin || origin === 'null' || base.origin !== origin) {
      throw failure('UNAVAILABLE', 'Survey catalog requires the same-origin application over HTTP(S).');
    }
    return new URL('expanse-data.json', base);
  }
  async function readResponse(response, signal, url) {
    if (signal.aborted) { cancelBestEffort(response && response.body); throw failure('TIMEOUT', 'Survey catalog request timed out.'); }
    if (!response || response.ok !== true || response.redirected) {
      cancelBestEffort(response && response.body);
      throw failure('UNAVAILABLE', 'Survey catalog request failed or redirected.');
    }
    if (response.url && response.url !== url.href) {
      cancelBestEffort(response.body);
      throw failure('UNAVAILABLE', 'Survey catalog response is not the fixed application catalog.');
    }
    const declared = response.headers && response.headers.get && response.headers.get('content-length');
    if (declared !== null && declared !== undefined && String(declared).trim() !== '' && Number(declared) > MAX_BYTES) {
      cancelBestEffort(response.body);
      throw failure('SIZE', 'Survey catalog exceeds the 1 MiB limit.');
    }
    if (!response.body || typeof response.body.getReader !== 'function') throw failure('UNAVAILABLE', 'Survey catalog requires bounded streaming.');
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', {fatal:true});
    let bytes = 0, source = '';
    function decode(chunk, options) {
      try { return decoder.decode(chunk, options); }
      catch (_) { throw failure('INVALID', 'Survey catalog is not valid UTF-8.'); }
    }
    try {
      while (true) {
        if (signal.aborted) throw failure('TIMEOUT', 'Survey catalog request timed out.');
        const part = await reader.read();
        if (signal.aborted) throw failure('TIMEOUT', 'Survey catalog request timed out.');
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) invalid('Survey catalog stream returned invalid bytes.');
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) throw failure('SIZE', 'Survey catalog exceeds the 1 MiB limit.');
        source += decode(part.value, {stream:true});
      }
      source += decode();
    } catch (error) {
      cancelBestEffort(reader);
      throw error;
    } finally { try { reader.releaseLock(); } catch (_) {} }
    let data;
    try { data = JSON.parse(source); }
    catch (_) { invalid('Survey catalog JSON is malformed.'); }
    return parseCatalog(data);
  }
  function load(baseURL) {
    let url;
    try { url = normalizeBase(baseURL); }
    catch (error) { return Promise.reject(error); }
    if (activeRequest) return activeRequest.url === url.href ? activeRequest.promise :
      Promise.reject(failure('BUSY', 'Another survey catalog request is active.'));
    if (typeof root.fetch !== 'function' || typeof root.AbortController !== 'function') {
      return Promise.reject(failure('UNAVAILABLE', 'Survey catalog fetching is unavailable.'));
    }
    const controller = new root.AbortController(), entry = {url:url.href, promise:null};
    let timer, timedOut = false;
    const request = Promise.resolve().then(() => root.fetch(url.href, {credentials:'same-origin',
      headers:{Accept:'application/json'}, redirect:'error', signal:controller.signal}))
      .then(response => readResponse(response, controller.signal, url));
    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch (_) {}
        if (activeRequest === entry) activeRequest = null;
        reject(failure('TIMEOUT', 'Survey catalog request timed out.'));
      }, TIMEOUT_MS);
    });
    const promise = Promise.race([request, timeout]).catch(error => {
      if (timedOut || (error && error.name === 'AbortError')) throw failure('TIMEOUT', 'Survey catalog request timed out.');
      if (error instanceof Core.SaveError) throw error;
      throw failure('UNAVAILABLE', error && error.message || 'Survey catalog request failed.');
    });
    entry.promise = promise; activeRequest = entry;
    const cleanup = () => {
      try { root.clearTimeout(timer); } catch (_) {}
      if (activeRequest === entry) activeRequest = null;
    };
    promise.then(cleanup, cleanup);
    return promise;
  }
  return Object.freeze({TARGET_ID, parseCatalog, load, evaluate, patch});
});
