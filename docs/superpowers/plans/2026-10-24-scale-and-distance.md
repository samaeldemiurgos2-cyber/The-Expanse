# Scale and distance isolated prototype implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the approved scale design with a recoverable, isolated Karna Vex / Micqui-Nobara prototype before changing the released application.

**Architecture:** Logical navigation remains in existing authored units. Pure math and flight modules feed a renderer adapter with observer-relative metre geometry, native depth slices and a single frozen frame. Start with a separately served instrumented proof page using the original source asset builders; widening index integration is conditional on the proof gates.

**Tech Stack:** Existing Three.js r128, classic UMD JavaScript, Node test runner, Chrome/Playwright, existing IndexedDB/save modules. No engine or dependency upgrade.

Authority: owner approved the written design with “Proceed”. Prototype implementation is authorized. This plan does not publish, merge into main or replace the live Sensors release. Main owns Git and integration. Curie and Pasteur retain disjoint file ownership and perform independent cross-review after Main's specification review; Dirac updates context only.

## Files and interfaces

- `assets/scale-math.js`, `tests/scale-math.test.cjs` — Curie. UMD `ExpanseScaleMath`; no DOM, THREE or storage.
- `assets/scale-flight.js`, `tests/scale-flight.test.cjs` — Pasteur. UMD `ExpanseScaleFlight`; no DOM, THREE, storage or navigation. Independent of math module.
- `assets/scale-view.js`, `tests/scale-view.test.cjs` — Main. Adapter creation, owned proxy/material resources, depth capability checks, physical calibration, render passes, common projection/picking and diagnostics.
- `tests/scale-prototype.html`, `tests/scale-prototype.js` — Main. Isolated fixtures and an actual-source system/ship probe; never silently enables prototype in normal entry page.
- `index.html` — Main, only after B passes. Script loading and narrow logical tick/input/renderer/projection/stable-state integration.
- `tools/scale-preview.mjs`, `tools/scale-check.cjs`, `tests/scale-*.browser.js` — Main. Reproducible loopback-only source probe and frozen-file browser evidence, including original bloom, real input, context loss and resource cycles.
- `docs/superpowers/verification/2026-10-25-scale-prototype.md` — Main. Exact tested commit, browser, gates, performance and limitations. External raw browser results under `D:\The Expanse\coordination\scale-tools`.

Math API (arrays of three numbers, finite checks throw TypeError):
```js
const {SYSTEM_METRES,HULL_METRES,SLICE_BOUNDS,relativeMetres,authoredPosition,
  hullScale,sliceIndex,sliceIntervals,markerState,stoppingDistance,cruiseAvailable,
  formatSpeed,projectEye,rulerLength} = ExpanseScaleMath;
// relativeMetres(position, origin) -> (position-origin)*1e6
// authoredPosition(metres, origin) -> origin+metres/1e6
// hullScale(rawLongitudinalExtent) -> 312/extent
// sliceIndex(axialDepth) -> index or -1; final endpoint inclusive
// sliceIntervals() -> [{near,far,clipNear,clipFar,includeFar}]
// markerState(previousHullVisible, cssPixels) -> boolean; thresholds 4/8
// stoppingDistance(speed, brake=.30, reaction=.25, margin=.10) -> authored u
// cruiseAvailable(previous, clearances) -> boolean; invalid/on/inside false,
// strict >1.725 enable, strict <1.475 disable; equality retains previous
// formatSpeed(authoredSpeed) -> nominal m/s below 1km/s, otherwise km/s
// projectEye([x,y,z],fovDegrees,aspect,width,height) -> {x,y,depth,visible}
// rulerLength(metresPerCssPixel) -> {metres,pixels} or null, 1/2/5 series 80..160px
```

Flight API:
```js
const {PROFILES,createState,reset,selectRegime,observeInput,step} = ExpanseScaleFlight;
// immutable returned states, mutable input never retained; vectors are arrays
// state: {velocity,regime,slowing,armed,needsNeutral,available,input}
// createState() -> stationary Maneuver, unavailable, unarmed, needsNeutral=true
// reset(state) -> same reset contract (not a physical neutral observation)
// selectRegime(state,'maneuver'|'cruise',allowed) -> state; Cruise needs allowed
// observeInput(state,vector,{fresh,repeat,neutral}) -> state
// Only an OBSERVED neutral then fresh non-repeat thrust can arm selected Cruise.
// step(state,dt,{brake,boost,blocked,available}) -> state; dt capped .05,
// unavailable prevents ENTRY but does not eject engaged Cruise. blocked resets.
```

## Task 0: isolation and baseline

- [x] Create `codex/scale-distance` at `3332b5e` outside source checkout. App-managed tool cannot resolve source ref in this chat's unrelated cwd; direct Git fallback uses existing sibling worktree convention.
- [x] Run `node --test --test-reporter=spec tests/*.test.cjs`: expect 228 tests passing before new tests. Set `EXPANSE_TEST_ROOT` to this worktree and run external `repair-tools/invariants.mjs` and `walkthrough-textures.test.mjs`: expect 8 + 4 checks.
- [x] Mark written design approved, commit this plan and status before workers write runtime files.

## Task 1: finite units and scale math (Curie)

- [x] Write behavioral Node tests first, run `node --test tests/scale-math.test.cjs` and record the expected missing-module failure.
```js
assert.deepEqual(relativeMetres([1e8+.001,2,3],[1e8,2,3]),[(1e8+.001-1e8)*1e6,0,0]);
assert.equal(hullScale(1.2)*1.2,312);
assert.equal(sliceIndex(10),1);
assert.equal(sliceIndex(2e11),5);
assert.equal(cruiseAvailable(false,[1.725]),false);
assert.equal(cruiseAvailable(true,[1.475]),true);
assert.equal(cruiseAvailable(true,[-1,100]),false);
assert.throws(()=>relativeMetres([NaN,0,0],[0,0,0]),TypeError);
```
- [x] Implement exports above with frozen constants; subtract origin before metre multiplication. Preserve small fractional authored motion. Handle overflow, nonpositive hull/brake/viewport and behind-eye projection explicitly.
- [x] Test unit round trips, all band endpoints and guards, hysteresis, mixed inside/outside geometry, finite failure, CSS projection, small speed formatting and actual selectable ruler intervals. Run red/green, self-review, report.
- [x] Main reviews against spec; Pasteur independently reviews quality after Main passes. Correct and rerun important findings. Main commits only explicit owned paths.

## Task 2: motion and observed input interlocks (Pasteur)

- [x] Write behavioral Node tests, record red, implement API above, run green. Defaults: Maneuver cap .0000312, acceleration .0001248, damping 2, brake .000156; Cruise cap .75, acceleration .30, damping .10, brake .30. Shift acceleration multiplier 1.5 only.
```js
let state=createState();
state=selectRegime(state,'cruise',true);
state=observeInput(state,[1,0,0],{fresh:true,repeat:false,neutral:false});
assert.deepEqual(step(state,.05,{}).velocity,[0,0,0]); // no observed release
state=observeInput(state,[0,0,0],{fresh:false,repeat:false,neutral:true});
state=observeInput(state,[1,0,0],{fresh:true,repeat:false,neutral:false});
assert.ok(step(state,.05,{}).velocity[0]>0);
```
- [x] Integrate thrust+damping without time-step instability, normalize combined direction, vector cap. Brake linearly overrides thrust without reversal. Lowering cap uses outgoing .30 brake continuously and rejects accelerating thrust while slowing. Buffer clears cannot satisfy physical neutral.
- [x] Test selection does not accelerate, held/repeat input never arms, touch neutral/fresh sequence, reset/blocked/blur equivalent, diagonal cap, coast, brake, dt clipping, lower-cap continuity, unavailable entry versus allowed exit, invalid/overflow inputs, 30–60s analytic fixed-target approach with explicit braking.
- [x] Main spec review, then Curie quality review, corrections and explicit-path commit.

## Task 3: renderer proof seam and real capability gate (Main)

- [x] Read exact r128 source already shipped and existing physical/VFX builders. Inventory every object/material type and length unit before proxy integration. Record raw longitudinal hull extent excluding explicit role-tagged VFX; do not infer physicality from opacity.
- [x] Add separately served `tests/scale-prototype.html` with the same r128 dependency and no persistence writes. Expose fixture selection, full diagnostic JSON and screenshot capture. Use controlled coloured opaque objects, alpha/additive coplanar quads and crossing triangles at every boundary; source `index.html` stays unchanged until B passes.
- [x] Implement UMD `create({THREE,renderer,math})` returning `capabilities(target)`, `setSource(...)`, `snapshot(...)`, `render(...)`, `projectAuthored(...)`, `pick(...)`, `diagnostics()`, `dispose()`. Source transforms remain untouched. Bounds/proxy identities and mutable per-frame arrays stay owned; shared source geometry/textures are never disposed.
- [x] Test capability failures independently, then query ACTUAL bound output and packed-depth world-target framebuffer: depth >=24, complete, vertex/fragment HIGH_FLOAT precision>=23 and adequate exponent range, renderer-selected highp. Abort visibly if unmet. Blur targets have no depth.
- [x] Patch built-ins at complete project transform and custom shaders with a shared explicit highp eye-depth varying. Inject half-open logical discard and relative raster guard via shared uniforms/cache key. Six bands far→near; clear colour once, depth between bands; background once, no automatic scene background. Restore renderer target, viewport and clear settings in finally.
- [x] Compare sliced fixture pixels with tightly clipped single-band references across slow axial camera traversals. Fail on recurring seams, missing/crossing geometry or doubled alpha; permit only <=1 CSS pixel raster-edge differences. Include near/far same-band/cross-band real occlusion. Do not replace real bodies with billboards or render hull over everything.

## Task 4: actual-source prototype and Gate B

- [x] Build cached source-to-proxy map for actual Karna Vex/Micqui-Nobara/hull. Adapt THREE point lights/cutoffs/targets, Points/sprites, atmosphere/corona world-position shader conventions, belt instance matrices and high-precision comet history. Unknown dimensional types fail visibly.
- [x] Calibrate uniform hull scale 312/Hraw before .62; include engine casings and exclude VFX. Assert 312m±.01, original origin/heading retained. Source logical getWorldPosition and authored values remain unchanged.
- [ ] Use the single frame eye/FOV/aspect for pass cameras/projection/picking. Local offset (0,.5L,2.2L)*zoom, forward look4L, transport translation immediately, smooth only bounded relative quaternion/radius. Clamp outside calibrated sphere+10m. Test Cruise/brake radius <= calibrated zoom radius*1.01. Original zoom .45..4, overview 1.5..900u retained.
- [ ] Prototype 0.8s log-distance camera transition: pause flight/saved phase increments, disarm/clear gestures, UI/VFX continue; no saved intermediate endpoint; repeat ignored and cancelled/context-lost transition restores old endpoint. Snapshot authored pose/heading/phases/selection/survey for fixed-clock invariance comparison.
- [ ] Drive math and flight modules with actual key/touch events, explicit V/button Cruise and observed neutral/fresh controls; Space/touch Brake. Reject freecam/modal/unstable capture; no cap truncation. Phase factor1e-6 applies only registered saved-body angle increments. Engine feedback uses normalized demand and speed ratio. Correct HUD velocity conversion; no normal-flight warp streaks.
- [ ] Chart locator and system 4/8px hysteresis +.2s crossfade never inflate geometry; hide behind/offscreen. Optional body-centre-plane ruler states nominal/compressed convention. Picks return logical stable IDs.
- [x] Record matched baseline and prototype frame p50/p95/draws/bands/resources on actual browser/DPR/hardware. Target desktop60/low30fps and p95<=baseline*1.10. Run ten warm transition/quality cycles without growth. Record selected constants. Failure or absent evidence blocks C; update report with exact limitation and preserve isolated proof.

## Task 5: compatibility integration, conditional on B

- [ ] Narrow index seams only: module scripts; render adapter inside renderFrame (bloom once after world); logical frame after single update; system-only flight; common projection/picking; clear/transitions/stable checks before Save/Board. activeScene/sysBodies remain logical. Never write new save fields.
- [ ] Keep Board capture once before async validation/storage; busy transition rejects before capture. Add delayed handoff test with advancing source phases and verify original private candidate persisted. Test failure retains progress/no survey publication and requires fresh Maneuver input.
- [ ] Run old v1/new v2 replacement/recovery/NewJourney/CAS/fence/denied/quota/memory/export suites; schema2/catalog1/DB2/scope and chartReturn unchanged. Test Sensors exact captured pose/complete phases against original range helper; renderer origin/zoom/ruler never grants eligibility.
- [ ] Actual UI journey Enter→fresh Cruise→Brake→Board→Ops→Record→Return→reload in both qualities, 30–60s live-orbit approach; existing target range unchanged. Exercise desktop1440x960 and touch390x844/844x390/390x500 gestures. Check C/V repeat, editable input, freecam/modal/blur/resize/context-loss. All14 system entry/exit/quality/picking/disposal, original DATA/DECK/30 GLB/textures unchanged.
- [ ] Independent specification and quality review; fix/re-review. Prepare concrete minimal external audit packet if needed, respecting new disclosure authority. Final relevant checks on frozen commit. No push/deploy as a side effect of this prototype.

## Task 6: evidence and handoff

- [x] Report A/B/C separately as PASS/FAIL/NOT RUN with actual command/results, performance and visual evidence. Mark plan checkboxes only after verification. Commit verified increments on codex/scale-distance, preserve baseline preview4320/live release and recoverable context.
- [x] Update coordination/CONTEXT.md and assign context-only audit to Dirac. Main final states concrete completed work, remaining failed/unproven gate, exact local preview/report and publication status.

Review note: all spec sections map to Tasks1–5. Unknown adapters, depth/alpha failures or excessive frame cost stop at B rather than broadening implementation. The source browser evidence is required; unit tests alone cannot pass B.

## Local implementation checkpoint — 2026-10-25

Tasks0–3 are implemented and locally checked. Math and flight passed Main specification review and independent cross-review; the renderer passed Pasteur's scoped specification review and Curie's independent quality review after corrections. Main's adapter tests are11/11; ten additional raster-comparison regressions bring the complete Node suite to294/294. Source `index.html`, walkthrough, save modules and canonical/binary assets are unchanged.

Task4 has a working isolated system proof: true-vertex312m calibration, native depth, all existing system material families, observed-input controls, phase-safe chase/overview, CSS locator/ruler and original bloom. Prototype camera bounds and real touch controls have local evidence. Chart representation and Save/Board/Navigation/Survey integration are deliberately still Task5. Final frozen browser evidence is the remaining acceptance step; no prototype release or integration claim is made by this checkpoint.

The Claude packet exists at `D:\The Expanse\coordination\scale-tools\review\review-packet.md`. Automatic review refused its new private payload/destination; owner disclosure approval is pending. No Claude scale review has run. Previous Sensors permissions were not reused, and no Main/private/public push or deployment occurred.

The first frozen run at b70487c passed376/378 checks. The two failures were isolated antialiased hull-reference pixels; the old central-ROI assertion had treated image centre as physical surface interior. The approved one-pixel edge allowance is now verified independently by raycasting the calibrated opaque hull: only actual primitive/silhouette boundary changes qualify. Colour mixtures, recurrence and exception limits further restrict the comparison. Both workers passed the corrected metric after negative ramp/colour/seam tests. All200 transparent/additive/coplanar fixtures require exact RGB agreement within2 levels. Renderer behavior was unchanged by this QA correction. The failed run is retained as external final-suite-b70487c-failed.json.

The second frozen run at6720709 passed363/378: all real-hull cases passed, while15 low-MSAA opaque crossing-triangle cases exposed the same one-pixel silhouette variation. The identical independent geometry witness now applies only to opaque crossing fixtures; it does not qualify an interior slice boundary. Both workers' scoped specification/quality readbacks passed, including CPU rejection of an interior coherent-color seam. The302 depth cases pass under that stricter spec-matched distinction, with zero transparent-case exceptions. Failed second evidence remains final-suite-6720709-failed.json. A fresh full frozen run is required before acceptance.

## Accepted isolated-proof checkpoint — 2026-10-25

Runtime2d91ec90ac58425d30a4834a17a8350f92d30a27 passed the complete frozen378/378 browser checks, no unexpected driver errors, and no before/after source hash drift.294/294 Node checks pass. The original8 invariants and4 texture checks pass. Both permitted opaque-edge exceptions are backed by independent geometry witnesses; every transparent/additive/coplanar case remains exact within RGB tolerance2. Internal specification and quality reviews have no remaining Critical/Important finding in this scope.

Gate A and the bounded Gate B engineering proof are accepted for the recorded local profile. Task5/6 broader application compatibility/release work is not implied: main source/index, all14-system integration, Save/Board/Navigation/Survey handoffs and publication remain separate. See `docs/superpowers/verification/2026-10-25-scale-prototype.md` and the external `final-suite.json` for exact evidence. The pending Claude payload authorization has not been inferred or bypassed.

## Audit corrections and preview recovery — 2026-10-25

The owner explicitly approved the scale packet and corrective revisions. Claude's initial static review found picking through unregistered/detached foreground and an unnecessary first thrust press after known neutral. Local a9045b6 fixes both, synchronizes material visibility and adds actual GPU registration/input regressions. The first full run passed 496/498; the two high hull failures exposed a CPU witness that arbitrarily chose one of two physically co-nearest overlapping wing parts. Local a83b21a compares the co-nearest opaque identity set, retaining strict RGB/coherence/isolation/recurrence checks. Actual r128 tests reject unchanged coplanar interiors and distinct farther surfaces; the renderer is unchanged by the witness correction.

Final frozen runtime a83b21abb681488a39db56d2a639c80af86de06a: **303/303 Node and 498/498 browser checks pass**, no driver errors or hash drift. Eight original invariants and four texture checks pass. Both internal readbacks and the final owner-authorized Opus 5.5 Low static audit report no Critical/Important findings within A/B. Exact sixteen-file review hashes and packet/output provenance are recorded separately; Claude did not run tests. Failed a904 evidence is retained. The current verification report supersedes the original 378/294 checkpoint above.

Stopped local previews were restored as hidden detached loopback processes, and Chrome verified all four pages plus flight/thrust/braking/camera controls. coordination/preview-tools/Start-Previews.ps1 restarts missing servers without duplicates. No login startup action was installed. Broader Gate C integration and Gate D publication remain unrun; source main and the public release are unchanged.
