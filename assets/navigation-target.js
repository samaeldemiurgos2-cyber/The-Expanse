(function (root, factory) {
  'use strict';
  const core = typeof module === 'object' && module.exports
    ? require('./save-core.js')
    : root.ExpanseSaveCore;
  const api = factory(core, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpanseNavigationTarget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, root) {
  'use strict';
  const MAX_BYTES = 1024 * 1024;
  const MAX_WORLDS = 256;
  const REQUEST_TIMEOUT_MS = 8000;
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,127}$/;
  const catalogData = new WeakMap();
  let activeRequest = null;

  function failure(code, message) {
    return Core && Core.SaveError
      ? new Core.SaveError(code, message)
      : Object.assign(new Error(message), {name:'SaveError', code});
  }
  function ownData(object, key) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
  }
  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }
  function cancelBestEffort(target, method) {
    if (!target) return;
    try {
      const cancel = target[method];
      if (typeof cancel !== 'function') return;
      Promise.resolve(cancel.call(target)).catch(() => {});
    }
    catch (_) {}
  }
  function parseCatalog(data) {
    if (!plain(data)) throw failure('INVALID', 'Catalog must be a plain object.');
    const sourceWorlds = ownData(data, 'worlds');
    if (!Array.isArray(sourceWorlds) || sourceWorlds.length < 1 || sourceWorlds.length > MAX_WORLDS) {
      throw failure('INVALID', 'Catalog world list is missing or outside its allowed size.');
    }
    const ids = new Map();
    const worlds = sourceWorlds.map((entry, index) => {
      if (!plain(entry)) throw failure('INVALID', 'Catalog world ' + index + ' is malformed.');
      const id = ownData(entry, 'id');
      const name = ownData(entry, 'name');
      if (typeof id !== 'string' || !ID_RE.test(id) || ids.has(id)) {
        throw failure('INVALID', 'Catalog world identifiers must be unique existing identifiers.');
      }
      if (typeof name !== 'string' || Array.from(name).length < 1 || Array.from(name).length > 256 || !name.trim()) {
        throw failure('INVALID', 'Catalog world names must contain 1 to 256 characters.');
      }
      ids.set(id, name);
      return Object.freeze({id, name});
    });
    const systemIDs = new Set();
    const systems = ownData(data, 'systems');
    if (systems !== undefined) {
      if (!plain(systems)) throw failure('INVALID', 'Catalog system index is malformed.');
      for (const id of Object.keys(systems)) {
        if (!ID_RE.test(id) || !ids.has(id)) throw failure('INVALID', 'Catalog contains an unknown system identity.');
        const definition = ownData(systems, id);
        if (!plain(definition)) throw failure('INVALID', 'Catalog system definition is malformed.');
        systemIDs.add(id);
      }
    }
    const catalog = Object.freeze({worlds:Object.freeze(worlds)});
    catalogData.set(catalog, {worldIDs:ids, systemIDs});
    return catalog;
  }
  function patch(snapshot, worldId, catalog) {
    const allowed = catalogData.get(catalog);
    if (!allowed) throw failure('INVALID', 'Use a catalog created by parseCatalog().');
    if (typeof worldId !== 'string' || !allowed.worldIDs.has(worldId)) {
      throw failure('INVALID', 'Unknown chart destination.');
    }
    let before;
    try { before = Core.validate(snapshot); }
    catch (error) { throw failure(error.code || 'INVALID', error.message || 'Invalid saved snapshot.'); }
    if (!before.navigation) throw failure('INVALID', 'Visit the exterior chart first to establish a ship location.');
    const nav = before.navigation;
    if (nav.frame === 'system-1000km') {
      if (!allowed.systemIDs.has(nav.systemId)) throw failure('INVALID', 'The current system is not present in the loaded catalog.');
      if (!nav.chartReturn) throw failure('INVALID', 'The current system has no valid chart return state.');
      before.navigation = {...nav, chartReturn:{...nav.chartReturn, selection:worldId}};
    } else if (nav.frame === 'chart-mly') {
      before.navigation = {...nav, selection:worldId};
    } else {
      throw failure('INVALID', 'Unsupported navigation frame.');
    }
    return Core.validate(before);
  }
  function normalizeBase(baseURL) {
    let base;
    try { base = new URL('./', baseURL); }
    catch (_) { throw failure('UNAVAILABLE', 'Catalog requires an HTTP(S) application URL.'); }
    const origin = root.location && root.location.origin;
    if (!['http:', 'https:'].includes(base.protocol) || !origin || origin === 'null' || base.origin !== origin) {
      throw failure('UNAVAILABLE', 'Catalog requires the same-origin application over HTTP(S).');
    }
    return new URL('expanse-data.json', base);
  }
  async function readResponse(response, signal, expectedURL) {
    if (!response || response.ok !== true) throw failure('UNAVAILABLE', 'Catalog request failed.');
    if (response.url) {
      let finalURL;
      try { finalURL = new URL(response.url, expectedURL); }
      catch (_) { throw failure('UNAVAILABLE', 'Catalog response URL is invalid.'); }
      if (finalURL.origin !== expectedURL.origin || !['http:', 'https:'].includes(finalURL.protocol)) {
        throw failure('UNAVAILABLE', 'Catalog response left the application origin.');
      }
    }
    const declared = response.headers && response.headers.get && response.headers.get('content-length');
    if (declared !== null && declared !== undefined && String(declared).trim() !== '') {
      const length = Number(declared);
      if (Number.isFinite(length) && length > MAX_BYTES) {
        cancelBestEffort(response.body, 'cancel');
        throw failure('SIZE', 'Catalog exceeds the 1 MiB limit.');
      }
    }
    if (!response.body || typeof response.body.getReader !== 'function') {
      throw failure('UNAVAILABLE', 'Catalog response does not support bounded streaming.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', {fatal:true});
    let bytes = 0;
    let text = '';
    try {
      while (true) {
        if (signal.aborted) throw failure('TIMEOUT', 'Catalog request timed out.');
        const part = await reader.read();
        if (part.done) break;
        const chunk = part.value;
        if (!(chunk instanceof Uint8Array)) throw failure('INVALID', 'Catalog stream returned invalid bytes.');
        bytes += chunk.byteLength;
        if (bytes > MAX_BYTES) {
          cancelBestEffort(reader, 'cancel');
          throw failure('SIZE', 'Catalog exceeds the 1 MiB limit.');
        }
        try { text += decoder.decode(chunk, {stream:true}); }
        catch (_) { throw failure('INVALID', 'Catalog response is not valid UTF-8.'); }
      }
      try { text += decoder.decode(); }
      catch (_) { throw failure('INVALID', 'Catalog response is not valid UTF-8.'); }
    } catch (error) {
      if (error && error.name === 'AbortError') throw failure('TIMEOUT', 'Catalog request timed out.');
      throw error;
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw failure('INVALID', 'Catalog JSON is malformed.'); }
    return parseCatalog(data);
  }
  function load(baseURL) {
    let url;
    try { url = normalizeBase(baseURL); }
    catch (error) { return Promise.reject(error); }
    if (activeRequest) {
      if (activeRequest.url === url.href) return activeRequest.promise;
      return Promise.reject(failure('BUSY', 'Another catalog request is already active.'));
    }
    if (typeof root.fetch !== 'function' || typeof root.AbortController !== 'function') {
      return Promise.reject(failure('UNAVAILABLE', 'Catalog fetching is unavailable in this browser.'));
    }
    const controller = new root.AbortController();
    let timer;
    const request = Promise.resolve().then(() => root.fetch(url.href, {
      credentials:'same-origin', headers:{Accept:'application/json'}, signal:controller.signal
    })).then(response => readResponse(response, controller.signal, url));
    let timedOut = false;
    const entry = {url:url.href, promise:null};
    const timeout = new Promise((resolve, reject) => {
      timer = root.setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch (_) {}
        if (activeRequest === entry) activeRequest = null;
        reject(failure('TIMEOUT', 'Catalog request timed out.'));
      }, REQUEST_TIMEOUT_MS);
    });
    const promise = Promise.race([request, timeout]).catch(error => {
      if (timedOut || (error && error.name === 'AbortError')) throw failure('TIMEOUT', 'Catalog request timed out.');
      throw error;
    });
    entry.promise = promise;
    activeRequest = entry;
    const cleanup = () => {
      try { root.clearTimeout(timer); } catch (_) {}
      if (activeRequest === entry) activeRequest = null;
    };
    promise.then(cleanup, cleanup);
    return promise;
  }
  return Object.freeze({parseCatalog,patch,load});
});
