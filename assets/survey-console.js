(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpanseSurveyConsole = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TARGET = 'karna-vex:moon:micqui-nobara';
  const TITLE = 'Press E or tap to open Sensors at Ops';
  const MEMORY = 'This page only — close Sensors and export JSON before leaving.';
  const MEMORY_CHOICE = 'Close Sensors, then open Save and choose Use memory only or Retry / reload saved before recording.';
  const RETURN_GUIDANCE = 'Return to chart, approach Micqui-Nobara, then board again.';
  const blockedCodes = new Set(['error', 'conflict', 'blocked']);
  const editableTags = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
  const bounded = (value, max = 1800) => String(value == null ? '' : value).slice(0, max);
  const setText = (node, value) => {
    const next = bounded(value);
    if (node.textContent !== next) node.textContent = next;
  };
  const numberText = value => Number.isFinite(value) ? String(Number(value.toFixed(3))) : 'unavailable';
  const message = error => bounded(error && error.message || 'Sensors operation failed.');

  function mount(options) {
    if (!options || !options.session || typeof options.session.openSurveyConsole !== 'function') throw new TypeError('A Sensors session is required.');
    if (!options.host || typeof options.host.append !== 'function') throw new TypeError('A Sensors host is required.');
    if (typeof options.eligible !== 'function' || typeof options.identity !== 'function') throw new TypeError('Sensors eligibility and identity providers are required.');
    const doc = options.host.ownerDocument || document;
    let controller = null, model = null, localError = null;
    let generation = 0, pending = false, retrying = false, closeAfterPending = null;
    let closingController = null, closePromise = null;
    let showingOwned = false, closingOwned = false;
    function text(tag, value, id) {
      const node = doc.createElement(tag);
      if (id) node.id = id;
      setText(node, value);
      return node;
    }
    function button(label, id) {
      const node = text('button', label, id);
      node.type = 'button';
      return node;
    }
    const prompt = button('E — Sensors · Ops', 'survey-control');
    prompt.className = 'expanse-navigation-control expanse-survey-control';
    prompt.title = TITLE;
    prompt.setAttribute('aria-label', 'Open Sensors at Ops');
    prompt.setAttribute('aria-haspopup', 'dialog');
    prompt.setAttribute('aria-keyshortcuts', 'E');
    const dialog = doc.createElement('dialog');
    dialog.id = 'survey-panel';
    dialog.className = 'expanse-navigation-panel expanse-survey-panel';
    dialog.setAttribute('aria-labelledby', 'survey-heading');
    dialog.setAttribute('aria-describedby', 'survey-explanation survey-status');
    const nativeShowModal = dialog.showModal.bind(dialog), nativeClose = dialog.close.bind(dialog);
    const heading = text('h2', 'Sensors · Ops', 'survey-heading');
    const identityLine = text('p', '', 'survey-identity');
    const targetLine = text('p', '', 'survey-target');
    const factsLine = text('p', '', 'survey-facts');
    const rangeLine = text('p', '', 'survey-range');
    const bandLine = text('p', '', 'survey-band');
    const rangeReason = text('p', '', 'survey-range-reason');
    const scaleLine = text('p', 'Scene units use the chart’s nominal 1 unit = 1000 km scale; orbital distances are compressed for flight. This gameplay range is not a new physical measurement or hull-clearance guarantee.', 'survey-scale');
    const recordLine = text('p', '', 'survey-record-view');
    const durabilityLine = text('p', '', 'survey-record-durability');
    const checkpointLine = text('p', '', 'survey-checkpoint');
    const explanation = text('p', 'Record one visitor survey explicitly. Existing catalog information is not a new instrument measurement. Recording does not move the ship or start travel.', 'survey-explanation');
    const memoryLine = text('p', '', 'survey-memory-note');
    const status = text('p', 'Loading survey catalog…', 'survey-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = doc.createElement('div');
    actions.className = 'expanse-navigation-actions';
    const recordButton = button('Record survey', 'survey-record');
    const retryButton = button('Retry survey catalog', 'survey-retry');
    const closeButton = button('Close', 'survey-close');
    retryButton.hidden = true;
    actions.append(recordButton, retryButton, closeButton);
    dialog.append(heading, identityLine, targetLine, factsLine, rangeLine, bandLine, rangeReason, scaleLine,
      recordLine, durabilityLine, checkpointLine, explanation, memoryLine, status, actions);
    options.host.append(prompt);
    doc.body.append(dialog);

    function identity() { try { return options.identity() || {}; } catch (_) { return {}; } }
    function eligible() {
      try {
        const result = options.eligible();
        return result && typeof result === 'object' ? result.eligible === true : result === true;
      } catch (_) { return false; }
    }
    function current(expected = controller, token = generation) { return !!expected && controller === expected && generation === token; }
    function otherModal() {
      try {
        for (const node of doc.querySelectorAll('dialog[open]')) if (node !== dialog) return true;
        return false;
      } catch (_) { return true; }
    }
    function resetPrompt() {
      if (prompt.title !== TITLE) prompt.title = TITLE;
      if (prompt.dataset.state === 'unavailable') delete prompt.dataset.state;
    }
    function code(value) { return String(value && value.status && value.status.code || '').toLowerCase(); }
    function blocked(value) { return blockedCodes.has(code(value)) || blockedCodes.has(String(localError && localError.code || '').toLowerCase()); }
    function recordBusy(value) { return pending || !!(value && value.busy) || ['validating', 'saving', 'loading'].includes(code(value)); }
    function canRecord(value) {
      return !!value && !value.record && value.memoryChoiceRequired !== true && !recordBusy(value) && !retrying && !closingController && !blocked(value) &&
        !identity().fileMode && value.catalog && value.catalog.status === 'ready' &&
        value.target && value.target.id === TARGET && value.range && value.range.eligible === true;
    }
    function readModel() {
      try { return controller ? controller.readModel() : null; }
      catch (error) { localError = error; return null; }
    }
    function validOwnedModel() {
      if (!current()) return false;
      const value = readModel();
      return !!value && !!value.snapshot && !!value.status && !!value.catalog && !recordBusy(value);
    }
    dialog.showModal = function (...args) {
      if (!showingOwned || !validOwnedModel() || otherModal()) return false;
      return nativeShowModal(...args);
    };
    dialog.close = function (...args) {
      if (!closingOwned || controller || pending) return false;
      return nativeClose(...args);
    };
    function showOwnedModal() {
      if (!validOwnedModel() || otherModal()) throw new Error('Sensors requires its active session lease and no other modal.');
      showingOwned = true;
      try { dialog.showModal(); if (!dialog.open) throw new Error('Sensors could not open its modal surface.'); }
      finally { showingOwned = false; }
    }
    function closeOwnedModal() {
      closingOwned = true;
      try { if (dialog.open) dialog.close(); }
      finally { closingOwned = false; }
    }
    function render(value) {
      model = value;
      const info = identity(), station = info.station || {}, target = value.target;
      const catalog = value.catalog || {}, range = value.range || {}, record = value.record;
      const ready = catalog.status === 'ready' && !!target && target.id === TARGET;
      const sessionMessage = bounded(value.status && value.status.message);
      setText(identityLine, `${bounded(station.name || 'Ops', 128)} · ${bounded(info.shipName || 'Ship identity unavailable', 128)} · ${bounded(info.deckName || 'Deck identity unavailable', 128)}`);
      setText(targetLine, `Target: ${bounded(target && target.name || 'Micqui-Nobara', 128)} (${TARGET}).`);
      setText(factsLine, ready ? `Catalog information — rendering classification: ${bounded(target.biome || 'unavailable', 128)}. Existing catalog lore: ${bounded(target.lore || 'unavailable', 1000)}` : 'Catalog information: unavailable. No instrument facts have been inferred.');
      setText(rangeLine, `Center distance: ${numberText(range.centerDistance)} scene units. Surface clearance: ${numberText(range.clearance)} scene units.`);
      const radius = Number.isFinite(range.radius) && range.radius > 0 ? range.radius : ready ? target.radius : null;
      const maxClearance = Number.isFinite(range.maxClearance) ? range.maxClearance : Number.isFinite(radius) ? 2 * radius : null;
      setText(bandLine, `Permitted surface-clearance band: 0 < c ≤ 2R${Number.isFinite(radius) && Number.isFinite(maxClearance) ? ` (0 < c ≤ ${numberText(maxClearance)} scene units; R = ${numberText(radius)})` : ' (catalog radius unavailable)'}.`);
      const guidance = `${bounded(range.reason || 'The saved exterior context is not eligible.')} ${RETURN_GUIDANCE}`;
      setText(rangeReason, record ? 'The historical visitor record remains readable from this location; another recording is unnecessary.' : range.eligible ? 'The saved boarding context is within the gameplay approach band.' : guidance);
      setText(recordLine, record ? `Visitor survey: Micqui-Nobara (${bounded(record.targetId, 128)}) · observed ${bounded(record.observedAt, 32)} (visitor device-clock metadata, including imported backups).` : 'No visitor survey has been recorded.');
      setText(durabilityLine, record ? value.recordDurable ? 'This survey record is present in the last completed local checkpoint.' : `This record is on this page only — close Sensors and export JSON before leaving.` : 'Recording creates one visitor record; catalog lore remains unchanged.');
      const checkpoint = value.checkpoint;
      setText(checkpointLine, checkpoint && Number.isSafeInteger(checkpoint.revision) && typeof checkpoint.savedAt === 'string' ?
        `Last completed local checkpoint: revision ${checkpoint.revision} · ${bounded(checkpoint.savedAt, 32)}.` : 'No completed local checkpoint has been observed.');
      const memory = code(value) === 'memory' || !!record && !value.recordDurable;
      setText(memoryLine, memory ? MEMORY : 'Browser-local journey state, not cloud sync. Export JSON for a portable backup.');

      let statusText;
      if (blocked(value)) statusText = `${localError ? message(localError) : sessionMessage || 'Save recovery required.'} Close Sensors and use the existing Save recovery controls.`;
      else if (recordBusy(value)) statusText = ['validating', 'saving'].includes(code(value)) && sessionMessage ? sessionMessage : 'Recording survey — validation and local save must finish before closing.';
      else if (localError) statusText = message(localError);
      else if (info.fileMode) statusText = 'File mode: new surveys and catalog requests are unavailable. Existing records remain readable; open this walkthrough through the local server to record a survey.';
      else if (retrying || catalog.status === 'loading') statusText = 'Loading survey catalog… Existing records remain readable.';
      else if (code(value) === 'memory') statusText = sessionMessage || MEMORY;
      else if (catalog.status === 'error') statusText = `Survey catalog unavailable${catalog.error ? ': ' + bounded(catalog.error) : ''}. Retry or Close; existing records remain readable.`;
      else if (record) statusText = value.recordDurable ? 'Survey already recorded in the last completed local checkpoint.' : 'The survey record is on this page only. Close Sensors and export JSON before leaving.';
      else if (!range.eligible) statusText = guidance;
      else statusText = 'Ready to record one visitor survey of Micqui-Nobara.';
      if (value.memoryChoiceRequired === true && !record && !info.fileMode && !recordBusy(value)) {
        statusText = `${bounded(statusText, 1400)} ${MEMORY_CHOICE}`;
      }
      setText(status, statusText);
      const state = blocked(value) ? 'error' : code(value);
      if (status.dataset.state !== state) status.dataset.state = state;
      setText(recordButton, record ? 'Survey recorded' : 'Record survey');
      recordButton.disabled = !canRecord(value);
      closeButton.disabled = recordBusy(value) || !!closingController;
      retryButton.hidden = catalog.status !== 'error' && !retrying;
      retryButton.disabled = info.fileMode === true || blocked(value) || recordBusy(value) || retrying || !!closingController || catalog.status !== 'error';
      setText(retryButton, retrying ? 'Retrying…' : 'Retry survey catalog');
    }
    function update() {
      const available = eligible() && !otherModal();
      prompt.hidden = !!controller || !available;
      if (!controller) { if (available) resetPrompt(); return; }
      const value = readModel();
      if (value) render(value);
      else {
        setText(status, `Sensors state unavailable${localError ? ': ' + message(localError) : ''}. Close and use Save recovery if needed.`);
        recordButton.disabled = true;
        retryButton.disabled = true;
        closeButton.disabled = pending || !!closingController;
      }
    }
    function closeCurrent(expected = controller) {
      if (!current(expected) || pending) return Promise.resolve(false);
      if (closingController === expected) return closePromise;
      const token = generation;
      closingController = expected;
      if (model) render(model);
      let operation;
      operation = Promise.resolve().then(() => expected.close()).then(() => {
        if (!current(expected, token)) return false;
        const recovery = blocked(model);
        controller = null;model = null;localError = null;pending = false;retrying = false;closeAfterPending = null;
        generation++;
        closeOwnedModal();update();
        const fallback = recovery || prompt.hidden ? doc.getElementById('save-control') : prompt;
        if (fallback && !fallback.hidden && !fallback.disabled) fallback.focus();
        return true;
      }).catch(error => {
        if (current(expected, token)) {
          localError = error;
          update();
          if (!dialog.open) { try { showOwnedModal(); } catch (_) { /* Another modal may already own focus. */ } }
        }
        return false;
      }).finally(() => {
        if (closingController === expected && closePromise === operation) {
          closingController = null;closePromise = null;
          if (current(expected, token)) update();
        }
      });
      closePromise = operation;
      return operation;
    }
    function open() {
      if (controller || !eligible() || otherModal()) return false;
      resetPrompt();
      let opened;
      try { opened = options.session.openSurveyConsole(); }
      catch (error) { prompt.title = bounded('Sensors unavailable: ' + message(error));prompt.dataset.state = 'unavailable';return false; }
      controller = opened;generation++;localError = null;pending = false;retrying = false;closeAfterPending = null;
      try {
        if (!opened || ['readModel', 'recordSurvey', 'retryCatalog', 'close'].some(key => typeof opened[key] !== 'function')) throw new Error('The session did not return a valid Sensors controller.');
        const value = opened.readModel();
        if (!value || !value.snapshot || !value.status || !value.catalog) throw new Error('Sensors state is unavailable.');
        render(value);showOwnedModal();update();
        (recordButton.disabled ? closeButton : recordButton).focus();
        return true;
      } catch (error) {
        localError = error;prompt.title = bounded('Sensors could not open: ' + message(error));prompt.dataset.state = 'unavailable';
        if (opened && typeof opened.close === 'function') void closeCurrent(opened);
        else { controller = null;generation++; }
        return false;
      }
    }
    async function recordSurvey() {
      const expected = controller, token = generation;
      if (!current(expected, token) || pending || retrying || closingController) return;
      const value = readModel();
      if (!canRecord(value)) { update();return; }
      localError = null;pending = true;render(value);
      try { await expected.recordSurvey(); if (current(expected, token)) localError = null; }
      catch (error) { if (current(expected, token)) localError = error; }
      finally {
        if (current(expected, token)) {
          pending = false;update();
          const forced = closeAfterPending && closeAfterPending.controller === expected && closeAfterPending.generation === token;
          closeAfterPending = null;
          if (forced || !dialog.open) await closeCurrent(expected);
        }
      }
    }
    async function retryCatalog() {
      const expected = controller, token = generation;
      if (!current(expected, token) || pending || retrying || closingController) return;
      const value = readModel();
      if (!value || identity().fileMode || blocked(value) || recordBusy(value) || !value.catalog || value.catalog.status !== 'error') return;
      localError = null;retrying = true;render(value);
      try { await expected.retryCatalog(); if (current(expected, token)) localError = null; }
      catch (error) { if (current(expected, token)) localError = error; }
      finally { if (current(expected, token)) { retrying = false;update(); } }
    }
    function editable(target) {
      return !!target && (editableTags.has(target.tagName) || target.isContentEditable ||
        typeof target.closest === 'function' && !!target.closest('input,textarea,select,[contenteditable="true"]'));
    }
    prompt.addEventListener('pointerdown', event => { event.stopPropagation();event.preventDefault(); });
    prompt.addEventListener('click', event => { event.stopPropagation();event.preventDefault();open(); });
    dialog.addEventListener('pointerdown', event => event.stopPropagation());
    recordButton.addEventListener('click', event => { event.preventDefault();void recordSurvey(); });
    retryButton.addEventListener('click', event => { event.preventDefault();void retryCatalog(); });
    closeButton.addEventListener('click', event => { event.preventDefault();void closeCurrent(); });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!recordBusy(model)) void closeCurrent();
    });
    dialog.addEventListener('close', () => {
      const expected = controller;
      if (!expected) return;
      if (pending) closeAfterPending = {controller:expected,generation};
      else void closeCurrent(expected);
    });
    doc.addEventListener('keydown', event => {
      if (controller || String(event.key || '').toLowerCase() !== 'e' || event.repeat || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || editable(event.target) || !eligible() || otherModal()) return;
      event.preventDefault();event.stopPropagation();open();
    }, true);
    update();
    return Object.freeze({update,open,close:() => closeCurrent(),isOpen:() => !!controller});
  }
  return Object.freeze({mount});
});
