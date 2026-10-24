(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpanseNavigationConsole = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BLOCKED_CODES = new Set(['error', 'conflict']);
  const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
  const PROMPT_TITLE = 'Press E or tap to open Navigation';
  const text = (doc, tag, value, id) => {
    const node = doc.createElement(tag);
    if (id) node.id = id;
    node.textContent = value;
    return node;
  };
  function setText(node, value) {
    const next = String(value);
    if (node.textContent !== next) node.textContent = next;
  }
  function setValue(node, value) {
    const next = String(value);
    if (node.value !== next) node.value = next;
  }

  function mount(options) {
    if (!options || !options.session || typeof options.session.openNavigationConsole !== 'function') {
      throw new TypeError('A navigation session is required.');
    }
    if (!options.host || typeof options.host.append !== 'function') throw new TypeError('A navigation host is required.');
    if (typeof options.eligible !== 'function' || typeof options.identity !== 'function') {
      throw new TypeError('Navigation eligibility and identity providers are required.');
    }
    const doc = document;
    const session = options.session;
    const host = options.host;
    const eligible = options.eligible;
    const identity = options.identity;
    let controller = null;
    let model = null;
    let worldsSignature = '';
    let draftWorld = '';
    let draftChanged = false;
    let pending = '';
    let retrying = false;
    let localError = null;
    let generation = 0;
    let disposed = false;
    let closeAfterPending = null;
    let closingController = null;
    let closePromise = null;

    const prompt = doc.createElement('button');
    prompt.type = 'button';
    prompt.id = 'navigation-control';
    prompt.className = 'expanse-navigation-control';
    prompt.textContent = 'E — Navigation console';
    prompt.setAttribute('aria-label', 'Open bridge navigation console');
    prompt.setAttribute('aria-haspopup', 'dialog');
    prompt.setAttribute('aria-keyshortcuts', 'E');
    prompt.title = PROMPT_TITLE;

    const dialog = doc.createElement('dialog');
    dialog.id = 'navigation-panel';
    dialog.className = 'expanse-navigation-panel';
    const nativeShowModal = dialog.showModal.bind(dialog);
    const nativeClose = dialog.close.bind(dialog);
    let showingOwnedModal = false;
    let closingOwnedModal = false;
    dialog.setAttribute('aria-labelledby', 'navigation-heading');
    dialog.setAttribute('aria-describedby', 'navigation-explanation navigation-status');
    const heading = text(doc, 'h2', 'Bridge navigation', 'navigation-heading');
    const identityLine = text(doc, 'p', '', 'navigation-identity');
    const locationLine = text(doc, 'p', '', 'navigation-location');
    const interiorLine = text(doc, 'p', '', 'navigation-interior-position');
    const targetLine = text(doc, 'p', '', 'navigation-target-current');
    const systemLine = text(doc, 'p', '', 'navigation-system-current');
    const bodyLine = text(doc, 'p', '', 'navigation-body-current');
    const checkpointLine = text(doc, 'p', '', 'navigation-checkpoint');
    const explanation = text(doc, 'p', 'Selecting a destination replaces the chart target and dossier focus. It does not start travel.', 'navigation-explanation');
    const frameHint = text(doc, 'p', '', 'navigation-frame-hint');
    const memoryLine = text(doc, 'p', 'Browser-local navigation, not cloud sync. Export JSON before leaving for a portable backup.', 'navigation-memory-note');
    const status = text(doc, 'p', 'Loading chart worlds…', 'navigation-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const label = text(doc, 'label', 'Destination world');
    label.htmlFor = 'navigation-world';
    const picker = doc.createElement('select');
    picker.id = 'navigation-world';
    picker.name = 'navigation-world';
    picker.setAttribute('aria-label', 'Destination world');
    label.append(picker);

    const actions = doc.createElement('div');
    actions.className = 'expanse-navigation-actions';
    const setButton = doc.createElement('button');
    setButton.id = 'navigation-set';
    setButton.type = 'button';
    setButton.textContent = 'Set destination';
    const closeButton = doc.createElement('button');
    closeButton.id = 'navigation-close';
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    const retryButton = doc.createElement('button');
    retryButton.id = 'navigation-retry';
    retryButton.type = 'button';
    retryButton.textContent = 'Retry chart catalog';
    retryButton.hidden = true;
    actions.append(setButton, retryButton, closeButton);
    dialog.append(heading, identityLine, locationLine, interiorLine, targetLine, systemLine, bodyLine,
      checkpointLine, explanation, frameHint, memoryLine, label, status, actions);
    host.append(prompt);
    doc.body.append(dialog);

    function currentIdentity() {
      try { return identity() || {}; }
      catch (_) { return {}; }
    }
    function isEligible() {
      try {
        const result = eligible();
        return typeof result === 'object' && result !== null ? result.eligible === true : result === true;
      } catch (_) { return false; }
    }
    function resetUnavailablePrompt() {
      if (prompt.title !== PROMPT_TITLE) prompt.title = PROMPT_TITLE;
      if (prompt.dataset.state === 'unavailable') delete prompt.dataset.state;
    }
    function current(controllerRef = controller) {
      return !disposed && !!controllerRef && controller === controllerRef;
    }
    function hasOtherOpenDialog() {
      try {
        const openDialogs = typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('dialog[open]') : [];
        for (const openDialog of openDialogs) if (openDialog !== dialog) return true;
        const openDialog = typeof doc.querySelector === 'function' ? doc.querySelector('dialog[open]') : null;
        return !!openDialog && openDialog !== dialog;
      } catch (_) { return true; }
    }
    function hasValidOwnedController() {
      const expected = controller;
      if (!expected || !current(expected) || typeof expected.readModel !== 'function') return false;
      let latest;
      try { latest = expected.readModel(); }
      catch (_) { return false; }
      if (!current(expected) || !latest || typeof latest !== 'object' ||
          !latest.snapshot || typeof latest.snapshot !== 'object' ||
          !latest.status || typeof latest.status !== 'object' ||
          !latest.catalog || typeof latest.catalog !== 'object') return false;
      const code = String(latest.status.code || '').toLowerCase();
      return !latest.busy && !['loading', 'saving', 'validating'].includes(code);
    }
    dialog.showModal = function (...args) {
      if (!showingOwnedModal || !hasValidOwnedController() || hasOtherOpenDialog()) return false;
      return nativeShowModal(...args);
    };
    dialog.close = function (...args) {
      if (!closingOwnedModal || controller || pending) return false;
      return nativeClose(...args);
    };
    function showOwnedModal() {
      if (!hasValidOwnedController() || hasOtherOpenDialog()) {
        throw new Error('Navigation console requires its active session lease and no other modal.');
      }
      showingOwnedModal = true;
      try {
        dialog.showModal();
        if (!dialog.open) throw new Error('Navigation console could not claim the modal surface.');
      } finally { showingOwnedModal = false; }
    }
    function closeOwnedModal() {
      if (controller || pending) throw new Error('Navigation console cannot close before its session lease is released.');
      closingOwnedModal = true;
      try {
        if (dialog.open) dialog.close();
        if (dialog.open) throw new Error('Navigation console did not release its native modal surface.');
      } finally { closingOwnedModal = false; }
    }
    function readModel() {
      try { return controller ? controller.readModel() : null; }
      catch (error) { localError = error; return null; }
    }
    function catalogWorlds(value) {
      return value && value.catalog && Array.isArray(value.catalog.worlds) ? value.catalog.worlds : [];
    }
    function isBlocked(value) {
      return BLOCKED_CODES.has(String(value && value.status && value.status.code || '').toLowerCase()) ||
        !!(localError && BLOCKED_CODES.has(String(localError.code || '').toUpperCase().toLowerCase()));
    }
    function optionId(value) {
      const nav = value && value.snapshot && value.snapshot.navigation;
      const identityValue = value && value.readableIdentities && value.readableIdentities.chartTarget;
      return identityValue && typeof identityValue.id === 'string' ? identityValue.id :
        nav && nav.frame === 'chart-mly' && typeof nav.selection === 'string' ? nav.selection : '';
    }
    function formatPose(position, units) {
      if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) return 'unavailable';
      return `[${position.map(value => Number(value.toFixed(3))).join(', ')}] ${units}`;
    }
    function formatFeet(value) {
      return Number.isFinite(value) ? Number(value.toFixed(3)) : 'unavailable';
    }
    function formatTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
    }
    function render(value) {
      model = value;
      const identityValue = currentIdentity();
      const station = identityValue.station || {};
      const stationName = station.name || 'Navigation';
      const shipName = identityValue.shipName || 'Ship identity unavailable';
      const deckName = identityValue.deckName || 'Deck identity unavailable';
      setText(identityLine, `${stationName} · ${shipName} · ${deckName}`);

      const snapshot = value && value.snapshot || {};
      const nav = snapshot.navigation || null;
      const pose = nav && nav.pose;
      const interior = snapshot.interior;
      if (!nav) setText(locationLine, 'Exterior location: unavailable — visit the exterior chart first to establish a ship location.');
      else if (nav.frame === 'chart-mly') setText(locationLine, `Exterior location: ${formatPose(pose && pose.position, 'Mly')}.`);
      else if (nav.frame === 'system-1000km') setText(locationLine, `Exterior location: ${formatPose(pose && pose.position, '1000 km')}.`);
      else setText(locationLine, `Exterior location: ${String(nav.frame)}.`);
      setText(interiorLine, interior && Number.isFinite(interior.x) && Number.isFinite(interior.z) ?
        `Aboard position: ${formatFeet(interior.x)}, ${formatFeet(interior.z)} ft.` : 'Aboard position: unavailable.');

      const readable = value && value.readableIdentities || {};
      const target = readable.chartTarget;
      const system = readable.system;
      const body = readable.localBody;
      setText(targetLine, target ? `Current chart target: ${target.name} (${target.id})` :
        nav ? 'Current chart target: none selected.' : 'Current chart target: none — visit the exterior chart first.');
      setText(systemLine, system ? `Current system: ${system.name} (${system.id})` : 'Current system: none');
      setText(bodyLine, body ? `Current local body: ${body.label} (${body.id})` : 'Current local body: none');
      const systemFrame = nav && nav.frame === 'system-1000km';
      setText(frameHint, systemFrame ?
        'Target staged for the supercluster chart. Return to the supercluster chart before using Jump.' :
        '');
      frameHint.hidden = !systemFrame;

      const checkpoint = value && value.checkpoint;
      setText(checkpointLine, checkpoint && Number.isSafeInteger(checkpoint.revision) ?
        `Completed local checkpoint: revision ${checkpoint.revision}, saved ${formatTime(checkpoint.savedAt)}.` :
        'No completed local checkpoint exists yet.');

      const worlds = catalogWorlds(value);
      const targetId = optionId(value);
      const hasListedTarget = worlds.some(world => world.id === targetId);
      const nextSignature = `${hasListedTarget ? 'target' : 'choose'}\u0002` + worlds.map(item => `${item.id}\u0000${item.name}`).join('\u0001');
      if (nextSignature !== worldsSignature) {
        worldsSignature = nextSignature;
        picker.replaceChildren();
        if (!hasListedTarget) {
          const placeholder = doc.createElement('option');
          placeholder.value = '';
          placeholder.disabled = true;
          placeholder.textContent = 'Choose a world';
          picker.append(placeholder);
        }
        for (const world of worlds) {
          const option = doc.createElement('option');
          option.value = world.id;
          option.textContent = `${world.name} (${world.id})`;
          picker.append(option);
        }
        if (!draftChanged) draftWorld = hasListedTarget ? targetId : '';
      }
      if (!draftChanged) draftWorld = hasListedTarget ? targetId : '';
      if (draftWorld && worlds.some(world => world.id === draftWorld)) setValue(picker, draftWorld);
      else if (!draftChanged && !hasListedTarget) setValue(picker, '');

      const code = String(value && value.status && value.status.code || 'unknown').toLowerCase();
      const message = value && value.status && value.status.message;
      const identityNow = currentIdentity();
      const fileMode = identityNow.fileMode === true;
      const blocked = isBlocked(value);
      const noOrigin = !nav;
      const busy = !!pending || !!retrying || !!(value && value.busy) || ['validating', 'saving', 'loading'].includes(code);
      const catalogStatus = value && value.catalog && value.catalog.status || 'loading';
      const catalogError = value && value.catalog && value.catalog.error;

      if (blocked) {
        setText(status, `Save recovery required${message ? `: ${message}` : ''}. Close this console and use the existing Save recovery controls.`);
      } else if (localError && !busy) {
        setText(status, localError.message || 'Navigation update failed.');
      } else if (fileMode) {
        setText(status, 'File mode: navigation edits are unavailable. Open this walkthrough through the local server to use the console.');
      } else if (catalogStatus === 'loading') {
        setText(status, 'Loading chart worlds…');
      } else if (catalogStatus === 'error') {
        setText(status, `Chart catalog unavailable${catalogError ? `: ${catalogError}` : ''}. Retry or Close.`);
      } else if (noOrigin) {
        setText(status, 'Visit the exterior chart first to establish a ship location; no destination can be set yet.');
      } else if (busy) {
        setText(status, 'Validating destination and completing the local save…');
      } else if (code === 'memory') {
        setText(status, message || 'This page only — export JSON before leaving.');
      } else {
        setText(status, message || 'Choose a destination, then explicitly set the chart target.');
      }
      const nextStatusState = blocked ? String(localError && localError.code || value && value.status && value.status.code || 'error').toLowerCase() : code;
      if (status.dataset.state !== nextStatusState) status.dataset.state = nextStatusState;

      const ready = catalogStatus === 'ready' && worlds.length > 0;
      const selectedExists = worlds.some(world => world.id === picker.value);
      const editable = ready && selectedExists && !noOrigin && !fileMode && !blocked && !busy;
      picker.disabled = !ready || fileMode || blocked || busy || noOrigin;
      setButton.disabled = !editable;
      closeButton.disabled = !!pending || !!(value && value.busy) || ['validating', 'saving'].includes(code);
      retryButton.hidden = catalogStatus !== 'error';
      retryButton.disabled = fileMode || blocked || busy;
      setText(retryButton, retrying ? 'Retrying…' : 'Retry chart catalog');
      setText(memoryLine, code === 'memory' ? 'This page only — export JSON before leaving.' :
        'Browser-local navigation, not cloud sync. Export JSON before leaving for a portable backup.');
    }
    function update() {
      if (disposed) return;
      const eligibleNow = isEligible();
      prompt.hidden = !!controller || !eligibleNow;
      if (!controller && eligibleNow) resetUnavailablePrompt();
      if (!controller) return;
      const next = readModel();
      if (next) render(next);
      else {
        prompt.hidden = true;
        setText(status, 'Navigation state is unavailable. Close this console and use Save recovery if needed.');
        picker.disabled = true;
        setButton.disabled = true;
      }
    }
    function closeCurrent(expected = controller) {
      if (!current(expected) || pending) return Promise.resolve(false);
      if (closingController === expected) return closePromise;
      closeAfterPending = null;
      const closingGeneration = generation;
      closingController = expected;
      let operation;
      operation = Promise.resolve().then(() => expected.close()).then(() => {
        if (!current(expected) || generation !== closingGeneration) return false;
        const recoveryRequired = isBlocked(model);
        controller = null;
        model = null;
        draftChanged = false;
        draftWorld = '';
        localError = null;
        generation += 1;
        closeOwnedModal();
        update();
        if (recoveryRequired) {
          const saveControl = doc.getElementById('save-control');
          if (saveControl) saveControl.focus();
        } else if (!prompt.hidden) prompt.focus();
        return true;
      }).catch(error => {
        if (current(expected)) {
          localError = error;
          setText(status, `Could not close navigation: ${error.message || 'session is still busy'}.`);
          update();
        }
        return false;
      }).finally(() => {
        if (closingController === expected && closePromise === operation) {
          closingController = null;
          closePromise = null;
        }
      });
      closePromise = operation;
      return operation;
    }
    function open() {
      if (disposed || controller || !isEligible()) return false;
      resetUnavailablePrompt();
      closeAfterPending = null;
      let opened;
      try { opened = session.openNavigationConsole(); }
      catch (error) {
        prompt.title = `Navigation unavailable: ${error.message || 'wait for the ship to settle.'}`;
        prompt.dataset.state = 'unavailable';
        return false;
      }
      if (!opened || typeof opened.readModel !== 'function' || typeof opened.close !== 'function' ||
          typeof opened.setChartTarget !== 'function' || typeof opened.retryCatalog !== 'function') {
        prompt.title = 'Navigation unavailable: the session did not return a valid console lease.';
        prompt.dataset.state = 'unavailable';
        return false;
      }
      controller = opened;
      generation += 1;
      localError = null;
      pending = '';
      retrying = false;
      draftWorld = '';
      draftChanged = false;
      try {
        const initial = controller.readModel();
        if (initial) render(initial);
        showOwnedModal();
        update();
        picker.focus();
        return true;
      } catch (error) {
        localError = error;
        const failedController = controller;
        controller = null;
        generation += 1;
        Promise.resolve().then(() => failedController.close()).catch(() => {});
        prompt.title = `Navigation could not open: ${error.message || 'try again.'}`;
        prompt.dataset.state = 'unavailable';
        return false;
      }
    }
    async function setTarget() {
      const expected = controller;
      if (!current(expected) || pending || retrying) return;
      let latest;
      try { latest = expected.readModel(); }
      catch (error) { localError = error; update(); return; }
      const worlds = catalogWorlds(latest);
      const selected = picker.value;
      const identityNow = currentIdentity();
      if (!latest || isBlocked(latest) || identityNow.fileMode || latest.busy ||
          !latest.snapshot || !latest.snapshot.navigation ||
          !latest.catalog || latest.catalog.status !== 'ready' || !worlds.some(world => world.id === selected)) {
        render(latest || model || {});
        return;
      }
      const token = generation;
      pending = 'set';
      draftWorld = selected;
      draftChanged = true;
      render(latest);
      try {
        await expected.setChartTarget(selected);
        if (!current(expected) || token !== generation) return;
        draftChanged = false;
        localError = null;
      } catch (error) {
        if (!current(expected) || token !== generation) return;
        localError = error;
      } finally {
        if (current(expected) && token === generation) {
          pending = '';
          const refreshed = readModel();
          if (refreshed) render(refreshed);
          const closeRequested = closeAfterPending && closeAfterPending.controller === expected &&
            closeAfterPending.generation === token;
          closeAfterPending = null;
          if (closeRequested || !dialog.open) await closeCurrent(expected);
        }
      }
    }
    async function retryCatalog() {
      const expected = controller;
      if (!current(expected) || retrying || pending) return;
      const identityNow = currentIdentity();
      if (identityNow.fileMode || isBlocked(model)) return;
      const token = generation;
      retrying = true;
      render(model || {});
      try {
        await expected.retryCatalog();
        if (!current(expected) || token !== generation) return;
        localError = null;
      } catch (error) {
        if (!current(expected) || token !== generation) return;
        localError = error;
      } finally {
        if (current(expected) && token === generation) {
          retrying = false;
          const refreshed = readModel();
          if (refreshed) render(refreshed);
        }
      }
    }
    function editableTarget(target) {
      if (!target) return false;
      if (EDITABLE_TAGS.has(String(target.tagName || '').toUpperCase()) || target.isContentEditable) return true;
      return typeof target.closest === 'function' && !!target.closest('input,textarea,select,[contenteditable="true"]');
    }

    prompt.addEventListener('pointerdown', event => { event.stopPropagation(); });
    prompt.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); open(); });
    picker.addEventListener('change', () => { draftWorld = picker.value; draftChanged = true; });
    picker.addEventListener('input', () => { draftWorld = picker.value; draftChanged = true; });
    setButton.addEventListener('click', event => { event.preventDefault(); void setTarget(); });
    retryButton.addEventListener('click', event => { event.preventDefault(); void retryCatalog(); });
    closeButton.addEventListener('click', event => { event.preventDefault(); void closeCurrent(); });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (!pending) void closeCurrent();
    });
    dialog.addEventListener('close', () => {
      const expected = controller;
      if (!expected) return;
      if (pending) {
        closeAfterPending = {controller:expected,generation};
        return;
      }
      void closeCurrent(expected);
    });
    doc.addEventListener('keydown', event => {
      if (String(event.key || '').toLowerCase() !== 'e' || event.repeat || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || editableTarget(event.target) || !isEligible()) return;
      event.preventDefault();
      event.stopPropagation();
      open();
    }, true);

    const api = Object.freeze({
      update,
      open,
      close: () => closeCurrent(),
      isOpen: () => !!controller && dialog.open,
    });
    update();
    return api;
  }

  return Object.freeze({mount});
});
