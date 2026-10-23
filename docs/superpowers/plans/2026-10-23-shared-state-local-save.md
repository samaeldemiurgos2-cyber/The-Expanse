# Shared state and local save implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve one visitor's chart/system/interior journey across reload and boarding, with safe local checkpoints and portable JSON backups.

**Architecture:** Two existing classic-script renderers use a shared pure validator, IndexedDB repository and session/UI controller. Each renderer captures, validates and applies only its owned domain, preserving the other domain. Transactions compare revisions and retain the preceding valid checkpoint; initialization/import/handoff pause controls and never write half-installed scenes.

**Tech Stack:** Existing Three.js/static HTML, classic JavaScript, native IndexedDB, Node built-in tests, Playwright Chromium. No package install/build or canonical-data changes.

---

Owner approved the written design on 2026-10-23: "Approve the design and proceed". Controlling spec: `docs/superpowers/specs/2026-10-23-shared-state-local-save-design.md`. Worktree branch: `feat/shared-state-local-save`, base `2fb40a9`. Push was not authorized during this implementation plan; the subsequent owner-authorized repair/release supersedes that historical restriction. Reuse owner-requested Curie/Pasteur with disjoint write scopes; Dirac audits context only. Main handles integration and spec review; Claude quality review requires the exact new packet disclosure approval if blocked.

## File map and fixed interface

- `assets/save-core.js`: UMD/CommonJS pure shape/range/size validator, fresh envelope, allowlisted patch merge. No browser or renderer authority.
- `assets/save-storage.js`: IndexedDB open/read/CAS commit/recovery, database scoped by normalized application base. No DOM.
- `assets/save-session.js`: lifecycle/dirty checkpoints/import rollback/handoff/recovery plus compact accessible controls. No renderer internals.
- `assets/save.css`: bounded responsive dialog and control styling, no existing HUD redesign.
- `index.html`: Curie owns chart adapter, script/CSS references, input gate, chart-return camera, settled-system boarding and runtime identity/phase registry.
- `walkthrough/index.html`: Pasteur owns interior adapter, script/CSS references, input gate, prop-ready restore and fixed safe return.
- `tests/save-core.test.cjs`, `tests/save-storage.browser.js`, `tests/save-session.browser.js`, `tests/save-journey.browser.js`: main owns pure and real-browser tests.
- `docs/local-saves.md`: operating limitations, controls, recovery and explicit stationary resume.
- External coordination server/harness/dashboard updates remain outside product Git history.

Envelope (all properties required; null domains permitted before first visit):

```js
{
  format: 'the-expanse/save', schemaVersion: 1, runtimeCatalogVersion: 1,
  revision: 0, savedAt: null, lastView: 'chart',
  navigation: null, interior: null,
  preferences: { quality: 'high', sensitivity: 1 }
}
```

Navigation:

```js
{
  frame: 'chart-mly', systemId: null,
  pose: { position: [6.5, 2.6, 3.5], yaw: 0, pitch: 0 },
  camera: { mode: 'chase', zoom: 1, orbitAz: 0, orbitEl: 0,
    orbitR: 10, pan: [0, 0, 0] },
  selection: null, phases: [], chartReturn: null
}
// system-1000km requires a world systemId and chartReturn {pose,camera,selection}.
// phases: [{id: parentQualifiedRuntimeId, angle: normalizedRadians}].
// system selection uses the SAME runtime IDs as phases, never raw p<index>.
```

Interior: `{deckId:'gas-ripley/deck-1',x,z,yaw,pitch,roomId}`. Room hint uses an existing parent room ID or null, not display/station labels.

Validators reconstruct only these fields. Maximum UTF-8 JSON/input size 262144 bytes; plain objects only; IDs `/^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,127}$/`; forbidden prototype-shaped keys rejected recursively. Coordinates/pan finite absolute <=1e9; position/pan exactly 3 components. Envelope revision nonnegative safe integer, savedAt null or valid ISO timestamp. Pitch <=pi/2 chart, <=1.43 interior; camera zoom .45..4, orbit elevation <=1.4, orbit radius chart1.2..60/system1.5..900. Sensitivity preserves the original slider .5..2. (Review corrected the initial mistaken .3..2.5 plan assumption; no owner-approved range expansion.) Angles normalize to [-pi,pi). Phase entries <=128, unique IDs. Chart cannot carry systemId/phases/chartReturn. Quality high/low; lastView chart/interior. Unknown versions/enums/required fields fail; unknown ordinary properties are discarded, never copied.

Pure API `ExpanseSaveCore` / `require('./assets/save-core.js')`:

```js
fresh({quality:'high',sensitivity:1}) // fresh allowed envelope
validate(value) // returns new whitelisted normalized snapshot or throws SaveError
parse(text) // byte-size before JSON.parse, then validate
stringify(snapshot) // validate then size-bound JSON
merge(snapshot, patch) // only navigation/interior/preferences/lastView; preserve unloaded domain
```

Storage API global `ExpanseSaveStorage`:

```js
const repo = await ExpanseSaveStorage.open(baseURL); // rejects file/unavailable
await repo.read(); // {current: raw|null, previous:raw|null}; never clears on invalid
await repo.commit(snapshot, expectedRevision); // transactional CAS; returns validated stamped next
await repo.replace(snapshot, expectedRevision); // explicit recovery, may replace invalid current
repo.close();
// SaveError.code values include CONFLICT, INVALID, VERSION, SIZE, UNAVAILABLE.
```

Session API, fixed before adapters start:

```js
const session = await ExpanseSave.start({
  view: 'chart', baseURL: new URL('./', location.href),
  host: document.getElementById('topbar'),
  adapter: {
    stable() { return true; },
    capture() { return {navigation: nav, preferences:{quality:quality}}; },
    async validate(snapshot) {}, // active domain + IDs/geometry, no mutation
    async apply(snapshot) {}, // domain null means original safe defaults
    pause(value) {} // no movement/steering while true; rendering can continue
  }
});
session.tick(); // throttled call from frame; only captures when stable/ready
await session.checkpoint(); // rejects busy/blocked/conflicted/failed; never false Saved
await session.handoff('interior'); // freeze, capture+commit, fixed index.html route
session.snapshot(); // cloned authoritative snapshot for diagnostics
await session.importJSON(text); // confirmation handled by UI; transactional reversible apply
session.exportJSON(); // coherent validated live snapshot string
```

`start` keeps adapter paused until load/validation/apply or memory-only resolution. It creates Save button/panel and an aria-live status. Browser test access is `window.__expanseSave = session` on each page. Extra public methods `status()`, `retry()`, `recoverPrevious()`, `newJourney()`, `continueWithoutSaving()` support UI/recovery tests. Session uses its loaded revision, never imported revision for CAS. Session detects JSON domain differences (excluding timestamp/revision) at most every2seconds; immediate transition checkpoint can be requested by adapter. A stable exporter may capture live state; unstable exporter uses preceding coherent snapshot and explains this in status. Repositories are testable separately in real browser contexts.

## Task 1: Pure contract, test first (Main)

- [x] Add `tests/save-core.test.cjs` with valid chart/system/interior fixtures. Example assertion:

```js
test('merge preserves the unloaded interior', () => {
  const before = core.fresh(); before.interior = interiorFixture;
  assert.deepEqual(core.merge(before, {preferences:{quality:'low'}}).interior, interiorFixture);
});
```

- [x] Run `node --test tests/save-core.test.cjs`; record expected missing-core failure before code.
- [x] Implement `assets/save-core.js` UMD exports with the exact API above, fresh-object reconstruction and typed errors. Add independent tests for each validator/range/version/pollution case and roundtrip; implement each after its failing assertion.
- [x] Run all pure tests; ensure malformed input does not mutate fixture or Object.prototype.
- [x] Review against spec sections4/9. Commit only core+tests once green and reviewed.

## Task 2: Transactional storage and session/UI (Main)

- [x] Create real-browser tests that load the scripts and assert `ExpanseSaveStorage` exists; fail before scripts. Exercise actual IndexedDB via separate connections/tabs.
- [x] Implement storage. During one readwrite transaction: get current, compare revision token, validate preceding current before copying previous, stamp candidate revision+time, put previous/current. Abort on mismatch or any request failure; resolve only on transaction completion. Recovery preserves valid prior data and accepts only explicit replace. Keep raw invalid current available.

```js
// Transaction algorithm (all requests queued within request handlers):
const request = store.get('current');
request.onsuccess = function () {
  if (revisionOf(request.result) !== expectedRevision) { conflict = true; tx.abort(); return; }
  // Validate candidate and preceding current; previous is copied only when valid.
  store.put(next, 'current');
};
tx.oncomplete = () => resolve(next);
tx.onabort = () => reject(conflict ? conflictError : tx.error);
```

- [x] Add failing session tests: initialization makes zero writes on bad save; failed write never Saved; stale tabs conflict; import rollback leaves live/durable old snapshot; paused/unstable transition cannot checkpoint; memory mode export works.
- [x] Implement session+UI to the fixed interface. Keep one serialized operation queue; avoid overlapping autosaves/import/handoff; use dirty generation/signature so writes do not lose changes. `tick` is two-second max, not per-frame serialization. Save/restore errors must not leak unhandled promise rejections.
- [x] Panel includes labelled file input, Save now/Export JSON/Import JSON/Export original/Recover previous/New journey/Retry/Continue without saving as applicable, explicit destructive confirmation and backup offer. Focus moves into panel and returns to Save; Escape closes; status text uses textContent.
- [x] For unsupported/corrupt data leave paused and block autosave until explicit recovery. Storage denial alone permits labelled memory gameplay, never erases old records. Handoff failure stays current page, then explicit warned continuation may route. Imports prevalidate active adapter and apply reversibly; on commit error apply prior snapshot and preserve conflict/error state.
- [x] Re-run real IndexedDB/session tests. Review spec3/4/6/7/8/9. Commit green shared modules/UI/tests.

## Task 3: Chart/system adapter (Curie; only index.html and chart-specific test file)

- [x] Write `tests/save-chart-contract.test.cjs` and observe missing adapter/input gate/board capability failure. Main will verify behavior in browser independently.
- [x] Add relative scripts/CSS, initialize a paused gate before interactive frame begins, then call `ExpanseSave.start` after runtime definitions exist. Add only an adapter seam; preserve DATA/Three assets and existing repairs.
- [x] Capture pose/camera/selection/preferences, chartReturn, phases using explicit parent+kind runtime IDs. Companion identity derives existing `def.seed`, not companion array index; resolve current bodyMap through registry. Require all references valid before applying, including stored phases.
- [x] Extend ordinary sysReturn capture/exit to preserve camera and restore stationary. Apply saved quality before system construction, phases before pose, selection after bodies, chartReturn after scene install. Clear velocity/warp/keys/free camera/drag/touch/look inputs. Snap camera/transforms after restoration; no arrival overwrite.
- [x] Save adapter validator checks active world/moon IDs, stable body identities, frame/mode consistency and finite bounds. The chart is freely navigable within numeric bounds, not room-collision geometry.
- [x] Remove chart-only Board hiding/guards; permit settled system Board while blocking warp/transit/restore/handoff. Route through awaited `session.handoff('interior')`. Keyboard B uses same guard. Keep chart-return R functional.
- [x] At frame tick call session.tick only through cheap gate; checkpoint after completed transitions without creating half-scene snapshots.
- [x] Run contract tests, syntax, diffcheck. Report actual changed lines, RED/GREEN evidence and concerns. Main performs spec review and runtime before commit.

## Task 4: Walkthrough adapter (Pasteur; only walkthrough/index.html and walkthrough-specific test)

- [x] Write `tests/save-interior-contract.test.cjs`; fail for missing adapter before changes.
- [x] Add relative scripts/CSS and pause all movement/look while initial props load/restore. Await loadProps collider readiness before start/apply; do not change GLBs, DECK or texture repair.
- [x] Capture feet pose, parent room hint, sensitivity; preserve navigation domain through shared merge. Validate deck, existing room and walkable-union/collision geometry using player radius and all loaded wallBoxes, without silently snapping invalid poses.
- [x] Apply null domain to original safe defaults. Apply valid pose atomically, clear keys/joysticks/pointer lock/jumpOverride, sync lastPos/camera/time, dirty flag. Derive label using geometry. Remember valid interior on reboarding.
- [x] Replace return handler with awaited session.handoff('chart'); ignore unsafe return query and use same-app explicit chart index. Keep existing GLB Export separate.
- [x] Wire session.tick through stable frame. Save control uses same session UI; preserve minimap/help/roomJump.
- [x] Run contract test, syntax and original texture tests. Report RED/GREEN and any default-spawn/collider conflicts, never weaken collision safety to pass.

## Task 5: Integrated browser acceptance, docs and review (Main)

- [x] Point external allowlisted preview server at the feature worktree; allow exact shared JS/CSS and test harness routes only. Parameterize invariant harness root without changing original baseline identity.
- [x] Add `tests/save-journey.browser.js` assertions for chart reload camera/pose/prefs/selection and zero velocity, system reload phases/body/return, settled system Board, bridge pose+reload, Return same system, chart return camera and remembered interior reboard. Browser helpers may expose adapter capture through session snapshot, not bypass production save flow.
- [x] Test real IndexedDB new context/profile reopen and two-page CAS, denied/write failure, corrupt/future/oversized/pollution/spatially invalid import preservation, previous recovery, confirmation cancellation, handoff failure, warp/transition stability and file memory-only export/import.
- [x] Run old repair suites, all pure tests and canon/30GLB/texture invariants at feature worktree. Inspect fresh desktop/mobile screenshots and collect console/page errors. Do not call all gates green if any remain untested.
- [x] Add `docs/local-saves.md` explaining origin/path scope, stationary resume, file limitation, backup/recovery/conflict workflow and deferred physical/Safari coverage. Update design status approved (content unchanged).
- [x] Spec review first against all eleven design sections; repair any gaps and rerun targeted tests. Prepare bounded new source diff/test packet excluding payloads. Request exact external disclosure approval if blocked, then Claude Opus5.5 Low quality/adversarial review; resolve and rerun findings before acceptance.
- [x] Update coordination/context/dashboard with measured results and outstanding limitations. Commit only reviewed green logical product changes, no push. Offer tested feature preview and actual Git status.

## Self-review

Spec1/2: architecture/boundaries are in header and task5. Spec3: task2+file test. Spec4: fixed schema, task1+task3 runtime registry. Spec5: task3/4+journey tests. Spec6: tasks2/3/4 startup/stability/invalid-geometry gates. Spec7: session handoff and both adapters. Spec8: task2 UI/import/export/autosave. Spec9: task1+2 preservation/conflicts. Spec10: task5 real browser plus old invariants. Spec11: owner approval recorded, prop-collider ordering controls. No discovery, canon rewrite, cloud service or public release added.

## Execution record

Owner approved the design and build. Implementation is committed locally as `17c2500d3c21fd41fdfa88b2c623e85a22791d31` on `feat/shared-state-local-save`. Task-level partial commits were consolidated into this one reviewed atomic feature checkpoint after integration; no incomplete renderer/core subset was published. No push or merge into main occurred.

Final acceptance:65 Node unit/contract checks,8 canon/asset/syntax invariants,4 original-texture checks,155 checks in20 browser suites,28 all-system/both-quality capture/validation checks and1 real browser-restart persistence proof. Total184 functional browser checks; visual desktop/mobile screenshots also inspected. All recorded on the frozen runtime hashes in the external coordination evidence. All30 GLBs, DECK/chartcanon/standalone JSON/Three and originalPNG preserved.

Claude Opus5.5 Low completed three concrete read-only reviews of the owner-authorized bounded packet. All Important findings were reproduced and fixed; final review has no remaining Critical/Important blockers and its exact-source/catalog/journey conditions were met. Main verified worldById is a linear DATA.worlds lookup. Full evidence is retained separately from the product checkout in the project's coordination records.

Preview serves this feature worktree on127.0.0.1:4318; dashboard is4317. Keep the worktree until the owner chooses integration. Physical devices/Safari/comprehensive collision and actual disk-failure testing remain outside acceptance. No cloud/accounts/discovery/canon/publication work added.

## Subsequent owner-authorized input repair and release

The owner subsequently reported that movement worked but looking did not inside Ripley, then explicitly authorized repair, commit and push. The old save suite did not adequately exercise look controls. Reproduced gaps were event-only LOOK-stick updates and capture-only desktop look with no drag fallback. The correction continuously integrates the held stick by frame time, supports primary-mouse dragging in any layout, handles missing/rejected/throwing/event-only capture failures with feedback, and clears transient input on pause, blur, cancellation and release. Reviewer follow-up also prevents a stale off-canvas drag from consuming the next real click. No canon, models, textures, save schema or chart behavior changed.

Final repair verification: 73 Node unit/contract tests; 171 browser checks comprising 43 look, 8 held-input Save safety, 5 reviewer edge cases, 22 complete journey, 28 system/quality catalog, 61 earlier repair regressions and 4 visual checks; 8 asset/canon/syntax invariants and 4 original-texture tests. An isolated browser profile was genuinely closed and reopened, preserving the exact checkpoint. The shared-save failure/conflict/import tests also passed during this repair pass. Claude Opus5.5 Low final corrective review has no Critical/Important findings; its exact-source browser conditions passed. The current test fixtures no longer require the original machine path; historical commits remain unchanged. Physical phones, Safari/Firefox and comprehensive collision remain untested.
