# Sensors and persistent survey implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development with test-driven-development and verification-before-completion. Reuse the owner's retained workers. Disjoint foundation modules may run concurrently under dispatching-parallel-agents; all integration and Git writes are serialized by Main. Spec review precedes independent quality review for each batch.

**Goal:** Record one durable Micqui-Nobara survey at Ops only after actual close approach, preserving old journeys and all Navigation/Save controls, then commit, push and verify the public release.

**Architecture:** A shared pure orbital asset and bounded survey domain feed one session-owned command. Schema2 adds one nullable record in the existing IndexedDB scope/version2 fence. Sensors reuses the existing visual theme, nearest-station eligibility and exclusive modal lease; dossiers read visitor state only.

**Tech Stack:** Classic JavaScript/UMD, native dialog, IndexedDB CAS, Node test runner, existing Playwright CLI and GitHub Pages. No dependencies or new canon/assets.

Approved spec: `docs/superpowers/specs/2026-10-23-sensors-persistent-survey-design.md`. Owner explicitly approved that file and requested implementation, commit, push and live deployment. Base a2c72ee; runtime baseline326f8df.

## Workspace and contracts

Build worktree `D:\The Expanse\worktrees\sensors-persistent-survey`, branch `feat/sensors-persistent-survey`. Main/source and retained bridge preview are not runtime writers. Preview4320 uses an allowlisted server outside source; test artifacts stay in `coordination/survey-tools` on D. No model/canon payload goes to external review.

- Curie owns ONLY `assets/orbital-position.js`, `assets/survey-target.js`, `tests/survey-target.test.cjs`.
- Pasteur owns ONLY `assets/save-core.js`, `assets/save-storage.js`, `tests/save-core.test.cjs`, `tests/survey-core.test.cjs`.
- Main owns shared session, UI, renderer wiring, browser acceptance, other tests, documentation and Git. After both foundations freeze/review, Main may assign a bounded UI task with a new disjoint scope. Workers do not commit while another writer is active; Main stages explicit paths.
- Dirac owns ONLY coordination/CONTEXT-AUDIT.md. Claude is read-only adversarial review after packet-specific disclosure approval if required. MiMo/Antigravity remain standby unless a necessary independent task is assigned.

Exact module interfaces:

```javascript
// ExpanseOrbital (UMD, no Three.js/DOM/storage)
hashSeed(string); mulberry32(integerSeed); moonInclination(moonId);
position(parentXYZ, radius, angle, inclination); // returns [x,y,z]
// ExpanseSurvey (UMD, Core + Orbital)
TARGET_ID = 'karna-vex:moon:micqui-nobara';
parseCatalog(data); // frozen {target:{id,name,lore,biome,radius}}, private validated descriptors
load(baseURL); // fixed same-origin app expanse-data.json, no caller URL
evaluate(navigation, catalog); // {eligible,reason,centerDistance,clearance,radius,maxClearance,units}
patch(snapshot, catalog, observedAt); // only survey changes; returns existing record unchanged
// evaluate: unsupported/null/chart/other system => eligible:false with null distances;
// malformed system context/phases/catalog => coded INVALID. Never fabricate phases.
// Core.validate accepts v1 -> normalized v2 survey:null and valid v2;
// ordinary Core.merge preserves survey, ignoring a survey patch; schema3 fails VERSION.
// Session interior controller (UI receives no arbitrary patch/target/distance API):
openSurveyConsole(); // {readModel,recordSurvey,retryCatalog,close}
// readModel: {snapshot,status,busy,catalog:{status,error},target,range,record,
//             recordDurable,checkpoint:{revision,savedAt}|null}
// recordSurvey() no arguments, session-clock timestamp, private candidate until completed CAS.
```

## Task 0 — Isolate and record approval

- [x] Verify source clean at a2c72ee and inspect retained worktrees/artifacts; create isolated branch/worktree.
- [x] Verify baseline `node --test --test-reporter=dot tests/*.test.cjs` exits0 with129 checks before runtime edits.
- [x] Mark approved spec status in this worktree, record owner release authority in coordination, save/self-review this plan and locally commit only docs.

## Task 1 — Pure orbital and survey domain (Curie)

- [x] Create `tests/survey-target.test.cjs` first. Use existing canonical JSON and real Core; assert missing module with `assert.ok(fs.existsSync(path),'survey domain missing')` before requiring it, so RED is a behavior assertion rather than an accidental module-resolution error. Run `node --test tests/survey-target.test.cjs`; capture expected RED.
- [x] Implement `orbital-position.js` with exact existing hash and PRNG algorithms, shared moon inclination, and validated translation-only position:

```javascript
function position(parent, r, a, i) {
  if (!Array.isArray(parent) || parent.length!==3 || !parent.every(Number.isFinite) ||
      ![r,a,i].every(Number.isFinite) || r<0) throw new TypeError('Invalid orbital position');
  const s=Math.sin(a);
  return [parent[0]+Math.cos(a)*r,parent[1]+s*r*Math.sin(i),parent[2]+s*r*Math.cos(i)];
}
```

- [x] Implement survey catalog strict parsing: fixed world/moon/explicit-system relationship; expected parent/planet/moon phase IDs from current canonical definitions, no overview offsets. Finite positive radii/orbits, integer seeds, bounded IDs/names/lore, Map/own lookup, duplicate/prototype rejection. Fixed HTTP(S) same-origin load; reject redirects;8s abort;1MiB streaming/fatal UTF8; one logical flight and stale-cleanup guard. No file fetch workaround.
- [x] Implement `evaluate`: validate complete expected phase set; reconstruct parent and moon centers through shared math, not saved certificates. Wrong frame/system is read-only; invalid phase semantics throws. Eligibility is `0 < clearance && clearance <= 2*radius`, current center `(6,18]`. A selected/staged target never grants eligibility. `patch` clones validated state, returns unchanged existing record without range recheck, otherwise range-checks and validates `{...before,survey:{targetId:TARGET_ID,observedAt}}`.
- [x] Tests cover exact position goldens, seeded inclination, inside/surface/just-outside/inclusive-upper/beyond/default45 ranges, moving parent, wrong frame, unrelated selection still eligible, all malformed/duplicate/missing phases, catalog bounds/redirects/timeout/late callbacks, input immutability, timestamp validation and idempotent existing record. Run focused tests GREEN. Full suite may await the independent schema task; report that explicitly, never weaken assertions.
- [x] Freeze files/self-review/report exact RED/GREEN and concerns. Main independently reads spec compliance; Pasteur later reads quality without edits. Fix/re-review Important findings before integration.

## Task 2 — Save schema and storage fence (Pasteur)

- [x] Add `tests/survey-core.test.cjs` first with a real legacy fixture from `Core.fresh()` converted to schema1. Example required assertion:

```javascript
const normalized=C.validate({...legacy,schemaVersion:1,survey:{targetId:'ignored'}});
assert.equal(normalized.schemaVersion,2);
assert.equal(normalized.survey,null);
assert.deepEqual(normalized.navigation,legacy.navigation);
assert.equal(normalized.revision,legacy.revision);
assert.equal(normalized.savedAt,legacy.savedAt);
```

- [x] Run `node --test tests/survey-core.test.cjs` and observe RED for current schema1, then implement pure v1 normalization and strict v2 nullable fixed record/ISO date. Preserve256KiB bounds, safeTree and existing fields. Fresh=>schema2/null; merge preserves record but cannot patch it; stringify=>v2. Update former future-schema2 rejection to schema3, do not weaken rejection. Add survey to expected fresh-state assertions only where necessary.
- [x] Open the SAME legacy database name at version2, keep snapshots store/keys and payloads unchanged in upgrade. Preserve existing versionchange/timeout/late-success closure. Normal writes validate raw predecessor but rotate the RAW valid predecessor to previous, then commit stamped v2 via CAS. Invalid/current-future payload is not silently erased; explicit recovery retains confirmation/session safeguards owned by Main.
- [x] Focused tests cover v1 idempotency/metadata preservation/ignored unknown survey, v2 fixed target/time shape, malformed/future, ordinary merge preservation, schema2 serialization, older record restores after moving away. Browser version-fence/real transaction checks are Main's integration gate, not claimed by mocks. Run `node --test tests/save-core.test.cjs tests/survey-core.test.cjs` GREEN.
- [x] Freeze/self-review/report. Main spec review then Curie independent quality. No session/renderer/UI edits or commits across Main/Curie scopes.

## Task 3 — Owned survey session and recovery (Main)

- [x] Add `tests/survey-session.test.cjs` before implementation, reusing actual Core/Storage boundary patterns from navigation-session.test.cjs. Assert `typeof session.openSurveyConsole === 'function'` RED. Use deferred validator/repository operations to prove synchronous busy, private candidate and blocked competing actions.
- [x] Generalize the existing navigation lease only as needed with a kind; preserve `openNavigationConsole()` and its controllers unchanged. New `openSurveyConsole()` acquires exclusive interior ownership and fixed survey catalog. Read model derives range and separates durable record from checkpoint metadata. No arbitrary UI target/position/time setter.
- [x] Implement the same private-command structure as destination Set: capture before, synchronously busy, validate domain candidate and adapter, recheck lease, CAS persist, then publish; catch retains before+old record, reports actual failure and holds pause. In explicitly memory mode only, a later accepted action may publish a page-only record. File catalog failure remains read-only. Existing record returns unchanged with no revision/time write.
- [x] Include survey in signature; warn before import/recovery/New journey removes an existing record. Preserve explicit replacement, rollback, Export original and imported metadata honesty. Ordinary capture updates actual progress/lastView but cannot overwrite survey. Tests cover all lease/mutation/handoff guards, stale controller, failures, CAS, repeated scan, different selections, memory imports and replacement warnings. Run focused and full Node GREEN; spec review then independent worker quality.

## Task 4 — Ops Sensors panel and physical arbitration (Main or one sequential worker)

- [x] Add `tests/survey-interior.test.cjs` first: required module/labelled native panel, draft-free explicit record action, readonly range/error/record feedback, pointer/key filtering and late callbacks. Extract real station resolver for executable tests; overlap point(-6,455.25) must choose st_nav on exact tie. Observe RED.
- [x] Implement `assets/survey-console.js` and `.css` in existing style. Expose mount({session,host,eligible,identity}) with open/close/update/isOpen; DOM IDs `survey-control`, `survey-panel`, `survey-record`, `survey-status`, `survey-retry`, `survey-close`. TextContent and stable live text; record action disabled when ineligible/busy, existing record readable regardless of location/catalog. Actual record durability and page-only/export guidance remain explicit.
- [x] Reuse native ownership and forced-close settlement behavior, not an unguarded dialog. Close clears inputs before releasing lease; focus/scroll/Save/Nav mutual exclusion and no pointer recapture. Tests prove double Escape through deferred validation/write releases exactly once after outcome, plus fresh input after close.
- [x] Add a common nearest-footprint resolver for st_nav and st_ops only, derive all rectangles through existing transform;6ft, BridgePod parent, collider valid, propsready, playable/no modal/help/onboarding. Feed only the winner to each panel's eligibility, stable tieNav. No DECK/model changes.
- [x] Wire new classic assets before session/page app. Main owns script wiring, renderer helpers and chart dossier; no overlapping writer. Run focused/full Node; main spec review then independent quality review before browser acceptance.

## Task 5 — Renderer/dossier integration (Main)

- [x] Add `tests/survey-wiring.test.cjs` before changing renderer. Execute extracted original orbit placement and compare shared helper across deterministic phases, inclinations and parents; assert asset ordering and no duplicated authority. Dossier visitor record test must distinguish raw chart moon ID and qualified system identity from unrelated bodies. Observe RED.
- [x] Load Orbital+Survey before consumers in chart, walkthrough and save-harness. Existing hash/PRNG wrappers delegate identical algorithms. Replace only existing orbiter placement calculation with shared helper; moon inclination uses same shared generator. Preserve ordering/phase capture/restore and every existing world position. No art/data modifications.
- [x] Append/update visitor survey metadata in the existing Micqui dossier for chart/system views, never in canonical DATA/lore. Reflect load/import/recovery/New journey and avoid per-frame DOM churn; no writes from selection. Run Node and invariants8/texture4 with `EXPANSE_TEST_ROOT` pointing at this worktree.

## Task 6 — Actual browser acceptance and adversarial review (Main)

- [x] Use Playwright CLI in D-backed temp/daemon/profile, Browser plugin if available first. Capture baseline missing-Sensors RED and real geometry/collider approach, then GREEN after integration. Server binds127.0.0.1:4320 with file allowlist. QA scripts/screenshots/evidence outside repo, adapt older port assumptions in external copies only.
- [x] Real IndexedDB tests: preserve raw v1 current/previous through DB version2 upgrade; stale open old connection closes; old code open1/recovery cannot write; blocked/late upgrade and quota/abort/CAS preserve records. Import v1 clears with warning, v2 restores, failed import rolls back, unknown/future/corrupt originals export. No false metadata claims.
- [x] Real flight workflow enters Karna Vex and Micqui through existing UI then uses ordinary controls to cross band (no direct eligibility teleport). Board, safe walk Ops, E/tap, record, reopen durable storage, repeat no revision/time changes, close/reload/Return/dossier/leave/revisit exact target and poses. Test out-of-range, wrong system, selection-only, memory/file, catalog retry, fixed counts, existing Nav+Save and native forced close.
- [x] Run all existing Node and browser save/look/repair/navigation suites, adapted for schema2 only where tests intentionally assumed current version1. Keep dedicated actual old-client tests pinned to original326f8df source. Capture1440x960,390x844 and390x500 swipe/close screenshots and inspect; record errors and hashes. No physical-phone/Safari/Firefox/screenreader/fullcollision claims.
- [x] Generate bounded exact-commit review packet from git show with small modules/tests/spec/diff and results, excluding model/PNG/canon payloads. Run actual Claude Opus5.5Low read-only only with authorized payload; if disclosure blocked obtain owner approval and continue unaffected local checks. Final internal quality review remains independent of Main self-review. Fix/retest/re-review Important findings, freeze runtime hashes and repeat final acceptance after changes.

## Task 7 — Commit, publish and verify live (Main)

- [x] Update approved spec/plan/README/local-saves docs and coordination/auditor, preserve evidence and actual review caveats. Commit explicit reviewed paths locally; feature worktree clean. User has authorized release, no additional integration-choice prompt is needed.
- [ ] Fetch authoritative origin, ensure no unexpected divergence/dirty main; normal fast-forward integrate and fresh Node on merged tree, push private main without force. Verify remote SHA.
- [ ] Verify public mirror tree equals source. Existing automatic mirror timing is unverified; if not caught up use only exact approved tree with PUBLIC parent in a normal fast-forward mirror commit, never publish private history or force. Observe GitHub Pages build success.
- [ ] Compare served HTML/new JS/CSS/catalog/atlas against raw committed Git blob SHA256 bytes, not Windows checkout line endings. Run production survey journey with real app base path, inspect deployed desktop/touch images and errors. State live only after exact bytes and actual workflow pass. Store release evidence outside source, update dashboard/context and retain needed worktrees/previews.

## Plan self-review map

Final local acceptance checkpoint: runtime `cee4275`; 228 Node tests, 677 existing browser assertions, 61 survey/storage/profile assertions, 8 canon/asset invariants and 4 texture checks passed. Both workhorses completed independent corrective quality reviews without blockers. Actual flight, high/low renderer parity, durable recording, reload/Return/dossier, explicit memory choice after storage denial/quota failure, replacement/recovery and touch swipes passed. Original asset and canon payloads are unchanged.

The owner authorized the exact Sensors packet and corrective revisions. Two actual Claude Code Opus 5.5 Low reviews completed. The follow-up found no blocking issue: source evidence disproved the RNG/order concerns, existing Save now recovery resolved the conservative error-status concern, and explicit memory choice plus qualified dossier identity were corrected. Its ship condition is satisfied by the fresh corrective browser reruns. Merge, mirror, Pages and deployed-byte/workflow evidence will be recorded in coordination/SENSORS-RELEASE.md outside source after this build checkpoint.

Spec1 scope/authority=>Tasks0/7; Spec2-3 range/sharedmath=>Tasks1/5/6; Spec4 catalog=>Task1/6; Spec5 migration/record=>Tasks2/3/6; Spec6 owned operation=>Task3/4/6; Spec7 physical UI/dossier=>Tasks4/5/6; Spec8 modules=>contracts/ownership above; Spec9 complete acceptance=>Tasks1-7; Spec10 gates=>approved-file status, this plan and exact external-review authority. The original 129-test baseline passed and this plan was committed before implementation. Final local acceptance evidence is recorded above; the remaining release gates require live verification.
