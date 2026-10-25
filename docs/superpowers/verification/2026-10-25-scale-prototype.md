# Scale and distance — isolated prototype verification

Corrected runtime: `a83b21abb681488a39db56d2a639c80af86de06a` on `codex/scale-distance`. The full suite recorded unchanged runtime/test hashes, no stale evidence and no unexpected driver errors. This report is a separate documentation checkpoint.

The bounded A/B scale prototype is accepted locally. The original main app, walkthrough, save/session/storage modules, canonical catalogs, all 30 original models and texture bytes remain unchanged. No main integration, push or publication occurred.

## Acceptance

- **303/303 Node tests pass.**
- **498/498 browser checks pass**, zero failures, zero driver errors, no source/test hash drift.
- 8 original data/model/engine invariants and 4 original texture checks pass.
- Independent internal specification/quality readbacks found no remaining Important issue in their scopes.
- Claude Code Opus 5.5 Low completed the owner-authorized corrective static review: no Critical or Important findings. Claude did not run tests or independently certify runtime measurements.

| Browser group | Passing checks |
|---|---:|
| scale-depth | 302 |
| scale-source | 2 |
| scale-render-state | 9 |
| scale-hull-occlusion | 8 |
| scale-picking | 64 |
| scale-controls | 20 |
| scale-camera-bounds | 5 |
| scale-journey | 9 |
| scale-journey-high | 9 |
| scale-context | 4 |
| scale-residency | 1 |
| scale-transition-residency | 1 |
| scale-performance | 4 |
| scale-touch-matrix | 60 |

## Audit corrections

The initial static review found two Important issues. Picking skipped unknown foreground surfaces and detached belt instances; it now finds the nearest eligible drawn surface before returning its stable identity or null. Material visibility also synchronizes from source to proxy. Opaque point footprints follow r128 sizing and hardware limits. Actual GPU tests cover foreground geometry, instances, hidden ancestors, axial clipping, point footprints and additive history at both qualities, DPR 1/2 and shifted origins.

Picking is geometric rather than alpha-texture-exact. Lines are non-solid route/orbit annotations; transparent/additive particle and halo billboards do not claim solid occlusion. Transparent atmosphere/corona meshes inherit their body identity in this proof. Classification of other systems, especially unregistered translucent meshes, remains Gate C work.

Flight unnecessarily demanded an extra press after known-neutral Start, Resume, regime selection and camera transitions. Those paths now observe neutral only when the physical state is known and all tracked keyboard/touch controls are released. Command resets never clear physical holds. Blur, cancellation and context loss mark input unknown; an actual release/neutral and fresh non-repeat thrust are still required. The browser controls checks exercise the first fresh press, held keyboard/touch, combined inputs, transition-time input, blur and paused context recovery.

Initial and corrective packets/verdicts are preserved under coordination/scale-tools/review/. Corrective runtime evidence is audit-corrective-suite.json and audit-corrective-node.tap. Earlier final-suite.json remains evidence of runtime 2d91ec90, not the corrected runtime.

The first corrective full run at a9045b6 passed 496/498 checks; two high hull comparisons exposed an incomplete CPU edge witness. Physical wing parts 13/14 share exactly the same nearest distance (659.0634246663177 m), but one ends within one pixel. Choosing only Raycaster hits[0] hid that edge. The witness now compares sorted sets of all co-nearest opaque IDs within 64×EPS×max(1,d), approximately 9.37×10^-12 m there. Interior coplanar sets stay unchanged and do not qualify. Four additional unit checks include actual r128 boundary/interior rays, distinct farther surfaces, roundoff, invalid inputs and order independence. Pixel comparison, tolerance, colour coherence, isolation, recurrence limits and the renderer remain unchanged. Both internal reviewers and the final static audit cleared this bounded witness correction. The failed JSON/progress and independent closest-hit diagnostic are retained.

## Scale and rendering

Actual physical vertex extent: **1.092993660317263 raw units**; uniform conversion **285.4545376863722 metres/raw unit**; resulting hull length **312.000000 m**. The approved 312 m working exterior reference excludes 9 tagged effects and measures 86 physical geometry nodes. It removes the legacy outer 0.62 once while preserving origin/forward axis. Existing 252 m and approximately 261 m interior references remain unchanged; this is not an independently verified canon measurement.

Authored system coordinates retain their existing nominal/compressed units. Rendering subtracts the vessel origin before converting 1 u to 10^6 m. Cached proxies retain original geometry/textures and explicitly adapt instances, comet history, lights, sprites, points and audited atmosphere/corona shaders. Unknown dimensional inputs reject. Native depth bands [0.1, 10, 10^3, 10^5, 10^7, 10^9, 2×10^11] m render far to near with half-open ownership and relative guard 10^-4. Both output paths have 24 depth bits and highp shader precision 23/range 127. Sky draws once; high bloom runs once after the accumulated world.

The 302 depth cases compare actual pixels with tightly clipped single-band references. All 200 transparent/additive/coplanar cases require exact agreement within 2 RGB levels. Only opaque hull/crossing edges may use isolated one-CSS-pixel exceptions backed by independent geometry rays, coherent colour pairs, unchanged eight-neighbours and recurrence limits. Incorrect interior seams, flat-surface errors and wrong occlusion reject. Earlier failed metric runs remain preserved separately. Actual hull occlusion, GPU state restoration, hidden ancestors, lights/targets and resource disposal also pass.

## Flight, camera and resource proof

- scale-journey: first fresh Cruise thrust reached the original survey boundary in **37.643 s**; explicit Brake stopped at **10.063438 u** clearance with source phases advancing.
- scale-journey-high: first fresh Cruise thrust reached the original survey boundary in **37.630 s**; explicit Brake stopped at **10.063363 u** clearance with source phases advancing.

Maneuver cap 31.2 nominal m/s and Cruise cap 750 nominal km/s retain approved acceleration/damping/braking. View changes preserve pose, heading and all 12 saved body phases; they never grant survey eligibility. Chase follows translation immediately, smooths only its relative rig, and clamps outside the calibrated hull. The measured zoom/overview bounds, 4/8 CSS-pixel marker hysteresis, 0.2 s fade and 1/2/5 ruler pass. A lost context pauses progress, restores the prior settled view and requires explicit stationary resume. Ten rebuild/quality cycles and ten camera/quality cycles show no progressive geometry/texture/program growth or disposal of borrowed assets.

## Measured local performance

| Quality / workload | Baseline p95 ms | Prototype p95 ms | Ratio |
|---|---:|---:|---:|
| low / fixed pose | 6.300 | 6.200 | 0.9841 |
| high / fixed pose | 6.300 | 6.300 | 1.0000 |
| low / moving route | 6.400 | 6.400 | 1.0000 |
| high / moving route | 6.300 | 6.300 | 1.0000 |

Profile: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36; ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11). Viewport/rendering buffer 1440×960, DPR 1. Matched fixed and moving routes use two alternating 120-frame runs per path after 25 warm frames with gl.finish instrumentation. The 30/60 fps absolute targets and at most 10% p95 regression passed. Touch input was emulated at 390×844, 844×390 and 390×500; this is not physical-phone, Safari or Firefox evidence.

## Open and reproduce

Open http://127.0.0.1:4321/ and click **Start flight proof**. WASD/QE move, arrows turn, drag/touch LOOK rotates the rig, V selects the regime, Space/touch Brake stops, and C changes view. Known-neutral input accepts its first fresh press; held or unknown input must be released before a fresh press.

The preview servers had stopped and were restored as hidden detached loopback processes. coordination/preview-tools/Start-Previews.ps1 starts missing previews and verifies page identity without duplicating listeners. Ports: 4321 prototype, 4318 current app, 4320 retained Sensors baseline, 4317 dashboard. No automatic login/startup task was installed. Four-page Chrome smoke evidence is in coordination/preview-tools/. CUA failed Windows sandbox initialization; app-open returned queued only.

From the worktree, start only the isolated lab with `node tools/scale-preview.mjs`. For browser reproduction use the existing Playwright Core path in EXPANSE_PLAYWRIGHT_MODULE and run `node tools/scale-check.cjs tests/scale-suite.browser.js "D:/The Expanse/coordination/scale-tools/audit-corrective-suite.json"`. Raw evidence includes the exact frozen runtime commit, all before/after hashes, assertions, screenshots and performance samples.

## Remaining scope

Gate C is not run: main-chart locator, all 14 systems, original Save/Board/Navigation/Sensors wiring, advancing-orbit delayed handoffs and legacy storage/CAS/fence/recovery compatibility remain next. This lab has no persistent save or boarding flow. Gate D release is not run; its bounded static audit is complete, but it does not certify unimplemented integration or authorize publication.

Integration caution: the live logical system scene already includes the ship and warp streaks. Exclude both from system-unit proxies before adding the separately calibrated hull. Keep activeScene/sysBodies tied to logical identities, and reject unstable camera capture before accepting Save/Board. Preserve the exact accepted Board pose/heading/phases across asynchronous validation and storage.
