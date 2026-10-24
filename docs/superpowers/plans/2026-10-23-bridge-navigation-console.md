# Bridge navigation-console implementation plan

> For agentic workers: use superpowers:subagent-driven-development, test-driven-development and verification-before-completion. Retain the owner's named workers; implementation tasks run sequentially with disjoint ownership and two-stage review. Track checkboxes here. No push.

**Goal:** At existing st_nav, inspect real journey state and stage an existing chart world target without movement, view change or travel.

**Architecture:** A bounded catalog/pure patch asset, a narrow session-owned transaction/controller and a small interior dialog asset. Reuse schema v1, existing CAS repository, station transform, Save styling and Return/Jump controls. Candidate stays private until persistence completes; memory mode is explicitly page-only. No canon/payload edits.

**Tech Stack:** Classic JavaScript, native dialog, IndexedDB, Node test runner, existing Playwright CLI. No dependencies/build system added.

---

## Workspace and ownership

- Build: D:\The Expanse\worktrees\bridge-navigation-console, feat/bridge-navigation-console, base 2032a46. Source main and released 4318 preview are not edited.
- Curie task 1: assets/navigation-target.js, assets/save-session.js, tests/navigation-target.test.cjs, tests/navigation-session.test.cjs. No renderer, storage schema or core changes.
- Pasteur task 2 (after task 1 review): assets/navigation-console.js, assets/navigation-console.css, walkthrough/index.html, tests/navigation-interior.test.cjs. Only narrow script/CSS wiring and station adapter in embedded HTML; no payload edits.
- Main: index.html script wiring if needed, test harness wiring, browser acceptance scripts outside source, preview server at 4319, docs/evidence/integration/Git. Main independently verifies source and spec compliance. Workers cross-review in read-only scopes, spec first then quality. Dirac: coordination/CONTEXT-AUDIT.md only.
- Browser plugin not available; use existing Playwright CLI. Any bounded external bridge review packet needs its own disclosure authority if blocked; do not assume old save packet approval.

## Task 0 — Approved spec and baseline

- [x] Verify clean source/main at 2032a46; create isolated feature worktree.
- [x] Record direct owner approval and update build spec status (not acceptance).
- [x] Run `node --test tests/*.test.cjs`; require all 73 baseline checks before runtime edits.
- [x] Commit approved spec and this plan locally.

## Task 1 — Target and owned atomic command (Curie)

- [x] Write target tests first: chart selection-only and system chartReturn-selection-only deep equality; input remains unchanged; null nav, unknown IDs/system, pollution names, malformed pose reject; 14-world ID/name parity against embedded chart; malformed/duplicate/oversized catalogs reject. Confirm RED for missing behavior.
- [x] Implement `ExpanseNavigationTarget` UMD: strict parsed catalog with world allowlist and known system IDs from existing data; `parseCatalog(data)`, `patch(snapshot, worldId, catalog)`, `load(baseURL)` with fixed same-origin application-relative expanse-data.json. 8s abort, streaming byte limit 1MiB before JSON.parse, max256 worlds, bounded IDs/names, one in-flight request per fixed app catalog. No caller catalog URL. Use Map/own properties. Reject file scheme clearly.
- [x] Write real session behavior tests in Node vm with minimal DOM boundary doubles and real save-core/target code: interior-only open; stable pre-pause ownership; Save/console exclusion; stale close/read/set; busy before deferred validation; concurrent Set; Close BUSY throughout validation/write; failure/CAS rollback and durable old target; captured interior progress retained; tick/checkpoint/import/handoff/recovery/memory route actions blocked while leased; combined pause; memory-only success not Saved; checkpoint metadata distinct from imported savedAt. Confirm RED before session edits.
- [x] Add `openNavigationConsole()` before Object.freeze. It returns frozen `readModel()`, `setChartTarget(worldId)`, `close()`. Session loads/caches target catalog internally. `readModel()` returns snapshot, status, busy, catalog/loading/error and actual local checkpoint metadata; panel must not provide allowlists or arbitrary patches. Add explicit catalog retry on controller only if needed for the required Retry action, with no arbitrary URL.
- [x] Capture real current interior progress before mutation; synchronously claim busy, validate pure candidate then awaited adapter validation, recheck lease before persist. Never route setter through checkpoint/import/tick. Publish candidate only after completed commit; retain old target and captured progress on failure. No adapter.apply, navigation or direct travel. In memory mode explicitly update current-page target only and preserve durable metadata. Close clears input via adapter.pause(true) before invalidating lease and combined release; error paths cannot unpause under lease.
- [x] Guard Save opener (including programmatic showModal attempt), generic mutations, autosave and route escape methods against console ownership. Guard opening console against unresolved error, busy, unstable or Save. Keep existing Save behavior regressions passing.
- [x] Run Node tests and exact RED/GREEN evidence; self-review; commit only owned files. Main independently checks spec compliance, then Pasteur performs read-only quality review. Fix/re-review Important issues before task 2.

## Task 2 — Physical station and native panel (Pasteur)

- [x] Write interaction contract tests first, run RED: st_nav-derived footprint and nearest point <=6ft; bridge membership, collision validity, props ready, non-modal/playable; E ignores repeat/text input and doesn't affect chart; touch consumes pointers; movement clears before lease release; immutable DECK/models. Use extracted real functions where useful, not string assertions alone.
- [x] Implement small classic asset `ExpanseNavigationConsole.mount({session,host,eligible,identity})` returning `update()` and no global arbitrary navigation/state setter. One focusable prompt `#navigation-control`, native dialog `#navigation-panel`, textContent fields, picker `#navigation-world`, `#navigation-set`, `#navigation-close`, `#navigation-retry`, live `#navigation-status`. Render readModel and catalog state. Close disposes late async updates using generation token; Retry requests the fixed session catalog operation only.
- [x] Wire script before shared session in walkthrough as needed, add tiny station adapter using stationWorldRect(st_nav), actual bridge rectangle and interiorPositionIsValid; call update from frame. Derive station/ship identity from existing records. Do not hardcode production world footprint. Create no new QA-only production controls.
- [x] Open only after fresh eligibility check, clear input/exit lock via owned session lease before showModal. Save exclusion must hold programmatically. E text/repeat filtering, actual tap hit target pointer-events:auto and stopPropagation/preventDefault. Use labelled native dialog, initial focus, Escape/native cancel through controller, disable Close+cancel from Set acceptance until settled. Don't call adapter.pause(false) from UI. Recheck eligibility for focus restoration.
- [x] Display exterior units (Mly or 1000km), interior feet separately, local system body separately, chart target including prior moon ID honestly, actual completed checkpoint metadata/status. Local draft never changes journey. System hint requires explicit system Return before Jump. Null nav disables Set; catalog error Retry; memory label says page-only/export; file unsupported is read-only. Responsive scrolling at390px; use existing panel theme.
- [x] Run own contracts/full Node; self-review and commit only owned files. Main independently verifies spec, then Curie read-only quality review. Fix/re-review Important issues before final QA.

## Task 3 — Integration and rendered acceptance (Main)

- [x] Wire navigation-target classic script into chart/test harness before save-session as needed. No chart travel/restore logic changes unless a failing actual flow proves necessary.
- [x] Run isolated allowlisted preview4319, preserving4318. Browser script base derived from runner URL for new tests; existing hardcoded4318 suites run through request rerouting to4319 or bounded external adapted copies, never edit released server.
- [x] Capture missing-feature browser RED before UI implementation: load interior, dismiss onboarding after fade; ordinary room chooser Bridge and movement to reachable safe station approach; E should show console but does not on baseline. Never teleport into collider. Record actual safe path/pose.
- [x] Actual keyboard E and touch tap; range/outside/loading/repeat/text focus; Save mutual exclusion; held mouse/key/stick clearing and fresh input after Close; draft/cancel no mutation; narrow scroll/focus/Escape/Return controls; no page errors.
- [x] Real IndexedDB chart snapshot: explicit target Set; compare exact allowed-field diffs; reopen durable storage and reload, interior stationary; Return chart same pose/heading/camera and staged selection, no warp. Existing deliberate Jump still works only after activation.
- [x] Real system snapshot: local body/phases and both poses/cameras preserved; Return same system; explicit system Return restores chart selection; no automatic warp. Export/import/previous remain v1.
- [x] Inject failures at actual validator/storage boundaries: held deferred validation + Escape/Close; concurrent Set; failed tx and stale CAS verify reopened durable old target and precommand interior progress, no false Saved or unpause. Late catalog close, bounded/duplicate/oversize/abort, null/file/memory/denied. All14 worlds selectable. No invented nav.
- [x] Run current129Node including new tests; existing save/journey/catalog/input/repair regressions; invariants8 and textures4 with EXPANSE_TEST_ROOT override; compare30GLBs/DECK/canon. Separate prior-release evidence from new-run results.
- [x] Run desktop and390px actual browser screenshots, inspect with view_image; collect identity/content/overlay/console/interaction proof. No physical-phone/Safari/Firefox/comprehensive-collision claims.
- [x] Spec compliance review first, quality/adversarial review second. Exact bounded Claude packet includes small code/diff/spec/test results, omits model/PNG/canon payloads. If blocked, ask approval; do not bypass. Fix/review then rerun affected and final regressions.
- [x] Update plan/coordination/evidence, invoke Dirac context audit. Commit verified work locally. Keep branch and preview available; no new push or automatic merge/publication. Report actual checks and any remaining limits.

## Checkpoint after Task1 internal review

Task1 a179403 and Main wiring390f2f1:100Node green; real session34/catalog7/backend66 green. Internal spec and quality gates passed, Pasteur actively owns Task2. Claude actual initial review is not final approval: Important generated-system concern disproved for all current14 explicit systems (Main14 and Curie196patch diagnostics); minor loader timeout/stream cancellation/UTF8 and post-conflict setter hardening queued after UI freezes. No overlapping production writers. Owner separately authorized the exact bridge review packet and corrective/final-panel revisions after the first disclosure block. Real disposable profile close/reopen retained exact target snapshot. Final source reruns and full panel acceptance remain unchecked.

## Frozen runtime for final verification

Runtime and tests are frozen at cdf67c9, following core387dd73 and UI9de489f. Main independently ran129Node green; the deterministic forced-native-close regression is3/3green, normal native-ownership and focus regressions2/2each. Earlier complete UI journey101 and interaction68 plus all196system/destination transactions passed; final reruns on these hashes remain pending. Main spec review passes; final independent quality and exact-packet Claude review remain gates, not claimed complete.

C: filled during QA. No user/project/cache cleanup was performed. The cached CLI now uses task-local D: temp,daemon,profile and screenshot output, preserving the released4318preview. Normal C-profile persistence may fail until disk space is freed; do not claim that environment repaired. Final packet must use exact committed source (`git show`), because a prior interim packet overlapped in-progress core changes and was not final core provenance. No push/merge/publication or new assets/canon.

## Completed acceptance — final frozen runtime

Accepted for the bounded feature, not publication. Main independently verified the current runtime and inspected final images; internal spec/quality gates passed. Actual Claude Opus5.5Low final review found no Critical/Important code defects; its sole Important pending-evidence condition was closed by a second actual response after all reruns finished. Reviewer relied on Main-reported evidence, did not execute tests or inspect PNGs.

- Frozen runtime: cdf67c9. All source/test/spec sections in final review came from single docs snapshot759cd5bc575466ac14add233e48863fe27fd4fa0. No concurrent production writers; six runtime SHA256 identities matched before/after acceptance.
- Node:129/129,0skipped; external loader3/3; invariant8/8 and texture4/4. All30GLBs, parsed DECK, canon blocks, data files and original texture atlas unchanged.
- Final browser batch:35suites,677checks passed,0failed, process exit0. Includes previous save/look/repair suites and new console suites.
- Console details: five journeys101, interactions69, catalog9, session41, all14systems x14destinations196, native modal2, focus2, forced-native-close3, touchscroll4, fileconsole7 all green. Old file-mode suite6 also green.
- Real disposable persistent browser process closed/reopened: exact full snapshot equality including revision2, savedAt2026-10-24T00:57:01.502Z, selectedCalavra, poses, camera and preferences.
- Inspected final1440x960 desktop and390x844 touch screenshots: readable existing theme, no panel clipping/control overlap; actual390x500 swipe scroll and Close reachability pass.
- Flow: chart/system -> Board Ripley -> room chooser Bridge -> ordinary safe approach -> E/tap -> draft unchanged -> explicit Set commits target only -> Close -> reload -> Return preserves original exterior pose/camera/local body -> deliberate existing Jump. No new travel/teleport/canon/assets.
- Actual reviewer sessions: final f5b09ea5-8ff6-464f-8e18-3e2c21a40d2f; condition closure cfd63362-08d0-4bbc-8748-b342a5ce5468. Opus5.5Low, read-only authorized packet, no errors/permission denials.
- Evidence outside source: coordination/bridge-tools/final-browser-results.json, profile-final-reopen.json, claude-final-review.md, claude-final-condition-closure.json and screenshots/. Dashboard4317 links this plan and review.

### Remaining limits and non-blocking backlog

Physical phones, Safari/Firefox, screen readers, and comprehensive collision paths were not tested. Test persistence uses disposable D-backed profile, not the owner's normal profile. C: reached0free during QA; later readback931999744bytesfree(~0.93GB), still low. Main deleted no user files and does not attribute the free-space change or claim a disk repair. JSON backups remain recommended.

Reviewer Minor notes retained without acceptance-blocking runtime changes: ordinary validation-error recovery wording and prompt returning after movement; up to the pre-open autosave interval not guaranteed on tab close; Node fake-fetch base-URL assertion gap (real browser catalog tested); non-Latin physical E key (tap/click works); redundant UI code; disabled file Retry/raw local-body ID/memory copy polish; per-frame model capture optimization. No performance/accessibility-hardware guarantee.

Feature branch/worktree and preview4319 are kept. Source/main2032a46 and released preview/worktree4318at aa52c7a remain unchanged. No merge, push, PR, Drive upload or public deployment for this feature. Dirac remains context-only; MiMo standby, Antigravity response unobserved. No Muse task was needed.
