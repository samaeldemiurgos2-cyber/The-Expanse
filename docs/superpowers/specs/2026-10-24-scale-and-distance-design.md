# Scale and distance — technical design

Status: the owner approved the proposal and 312 m working exterior reference with “sounds good” on 2026-10-24. The owner approved this written technical design with “Proceed”; implementation planning and an isolated prototype are authorized. This commit contains documentation only; it does not change the live application or authorize publication of an unverified prototype.

Baseline: source/private main `f316b274886aeffb1fc3d4f412e5d6825b576621`, public mirror `1559429359beeaacb8835d706b11c44fc353ebb2`, tree `67134b3ab84117c56002f11a790443caeaee84c1`. Approved concept: `D:\The Expanse\coordination\SCALE-DISTANCE-PROPOSAL.md`. Existing acceptance was 228 Node tests, 738 local browser checks, 17 deployed-blob checks and 19 production browser checks; those figures describe the baseline, not this unbuilt design.

## 1. Scope and authority

Deliver convincing scale on the existing chart → Karna Vex → Micqui-Nobara → GAS Ripley → Deck 1 route. The ship becomes a cartographic locator in the atlas and a uniformly calibrated hull in system chase view. System orbit view remains an overview. Camera changes, distance feedback, movement pacing and illustrative orbital playback are treated together.

Use 312 m as the accepted working exterior display length, attributed to the current exterior annotation. This is not independent verification of the hero sheet. Keep the 252 m interior-canon reference and approximately 855 ft / 261 m transcribed plan separate; neither is silently reconciled or rewritten. Deck 1 geometry and feet-based coordinates remain unchanged.

No new target, survey log, canonical body/orbit measurements, terrain, landing, comprehensive collision system, close-orbit hull inspector, seamless airlock walk, live bridge-window renderer, account/cloud service or engine upgrade. Preserve original DATA, standalone catalogs, DECK, the 30 embedded models and texture bytes. New runtime visual-role tags and derived renderer state are permitted; new lore is not.

The first implementation gate is an isolated, instrumented prototype. Integration is conditional on its depth, compatibility, appearance and performance evidence. A failed gate requires correction within this design or a revised design; it does not permit an engine migration, a hull-on-top overlay shortcut or changed save-unit meanings.

## 2. Experience and controls

| Context | Representation and controls |
|---|---|
| Chart (`chart-mly`) | Existing catalog/illustrative atlas with a distinct ship location/heading symbol. Hide the enlarged solid ship. Preserve existing chart selection, navigation and deliberate Jump semantics. |
| System overview (`system-1000km`, orbit) | Existing body layout, nominal/compressed distance disclosure, selected-body information and a vessel locator. Retain overview orbit/pan meanings and bounds. |
| Local flight (same system frame, chase) | Calibrated physical hull, close follow camera, correct projection/depth, explicit Maneuver/Cruise control and readable distance/speed feedback. |
| Interior | Existing walkthrough, Navigation, Sensors, Save, Board/Return and human-scale geometry. |

Retain `C` for chase/orbit. Add a system-only accessible Maneuver/Cruise toggle with `aria-pressed` and keyboard `V`; filter repeat, editable targets, modifiers and already-consumed events before updating movement state. Keep a touch-visible Brake action and desktop Space. Existing touch MOVE/LOOK remain functional. Help must distinguish camera view from movement regime. View selection, target focus, a ruler or a marker must never arm Cruise or initiate travel.

Chart mode has no physical hull representation regardless of saved chase/orbit preference. System chase is local flight; system orbit is the legacy overview. A close hull orbit with a new interpretation of `orbitR` is excluded. Free camera remains a clearly identified transient inspection camera, cannot arm Cruise, and cannot change the vessel's authored pose.

## 3. Three kinds of state

**Authored state:** the existing saved navigation, body identities/descriptors, orbital phases, interior and visitor survey. It remains the only authority for navigation, range, capture/restore and durability. Keep `chart-mly`, `system-1000km`, radians and interior feet. The system scale is nominal: one authored system unit `u` corresponds to `10^6` displayed metres, with compressed orbital layout. Do not turn those authored radii/orbits into new astronomical canon.

**Presentation state:** observer-relative roots, draw proxies, projection, slice cameras, marker visibility, ruler, interpolation and material-unit adapters. It is derived, transient and never merged into a save.

**Control state:** velocity, held controls, movement regime, arming/interlock flags and pending mode deceleration. It is transient. Restore is stationary in Maneuver with fresh input required; no Cruise or held gesture is restored from a backup.

Take one logical frame snapshot after the once-per-frame authored/visual update. Every depth slice, marker, projection and pick for that displayed frame uses it. Rendering must not advance physics, phases, spins, shader clocks or effects a second time. Never let a render proxy or an intermediate camera become navigation authority.

## 4. Hull calibration and observer-relative presentation

Let `Hraw` be the raw physical hull's longitudinal extent in its original local coordinate system, measured before the legacy outer `.62` scale. Include physical engine casings; exclude plumes, glows, labels, strobes and selection decorations. Tag roles explicitly during construction rather than guessing from opacity or material class. The measured physical geometry must be finite and have positive extent.

Apply a single uniform draw scale `312/Hraw` in metres about the original model origin and forward axis. Do not recenter the logical vessel onto an AABB midpoint, apply `.62` again, resize individual parts or change its authored position. The physical longitudinal extent must measure 312 m ± 0.01 m after normalization. Effect attachment points inherit the same local normalization; symbols remain separate annotations.

Keep the logical scene/body transforms in authored units. Build presentation proxies that reference existing geometry/textures and preserve real 3D silhouette, orientation and surface depth. Do not substitute opaque body billboards. For a body root with authored world position `p` and frame origin `O`, derive `p_draw = 10^6 × (p − O)` in JavaScript number precision before conversion to GPU floats. `O` is the current vessel position for the system frame. Root orientation and source hierarchy are preserved; child transforms receive the appropriate unit scale exactly once. The ship draw root uses the calibrated raw-hull scale rather than the old enlarged draw scale.

Use explicit source→proxy identity maps. Stable body IDs are returned by picking; no proxy coordinate may be used by the save adapter or Sensors. Preserve source-side `getWorldPosition` behavior for existing authored consumers until each render/projection consumer is deliberately adapted. Do not mutate/reparent the logical scene temporarily around a draw call.

Keep `activeScene`/`sysBodies` tied to the logical scene/body map so existing stable-state checks can still identify a ready chart/system. The renderer adapter chooses presentation objects internally; replacing `activeScene` with an untracked draw scene must not leave Save/Board permanently busy. The old enlarged hull is excluded from atlas draws through presentation-role filtering; a shared chart-hidden flag must not accidentally suppress the calibrated system proxy.

Audit all embedded world coordinates, including comet-tail buffers and belt instance matrices. Subtract the origin before writing their presentation float buffers, using retained high-precision source history/descriptors. Root translation cannot recover bits already lost in an instance/buffer attribute. No per-frame material/geometry cloning.

Unit adapters cover point-light cutoff distances and attenuation, fog lengths/densities if present, point-size attenuation, sprite sizes, directional-light targets, and custom atmosphere/corona world-position calculations. Hull-subtree lengths use hull calibration; system-subtree lengths use the system conversion. Preserve authored values and unitless visual intent, not an invented photometric claim. Cache adapted uniforms/materials and dispose owned copies without disposing shared source textures/geometries. An unclassified length-dependent shader or object is a prototype failure, not permission to pass mixed units to the GPU.

## 5. Camera and projection

Retain a settled base FOV of 60°. Existing intentional Jump/scale-transition widening may change the effective FOV; every world slice and projection helper must share that frame's effective FOV as well as the same physical eye, orientation and aspect. For local chase, use the initial offset `(0, 0.5L, 2.2L) × zoom`, in the vessel's orientation, with `L=312 m`, and look ahead `4L` along the unchanged forward axis. Existing transient LOOK offsets rotate the rig. The prototype may tune the offset within 2–4L behind and 0.4–0.8L above, recording the selected constants before integration. This is camera calibration, not ship motion.

Transport the eye with the vessel's current translation immediately. Smooth only the relative rig orientation/radius using real frame delta (initial orientation response `1−exp(−7dt)`), not absolute world camera position. Otherwise Cruise would create kilometre-scale follow lag. Use quaternion/directional interpolation plus bounded radius rather than linearly interpolating a rig vector through the hull on a large turn. Keep the eye at least 10 m beyond the measured physical hull bounding sphere; this is a derived camera clamp, not a rewrite of saved zoom. Snap the relative rig on restore, Return and accepted endpoint changes. During settled chase, acceleration/Cruise/braking must not increase its radius beyond the calibrated zoom radius plus 1%; transitions are tested separately.

Keep saved zoom in `[.45,4]`. Keep system overview `orbitR` in `[1.5,900]u`, chart orbit radius in `[1.2,60]`, and pan in its original frame units. Overview still derives its eye from those values. The system minimum of 1.5u remains nominally 1500 km, not 1.5 m or 1.5 hull lengths. An old chase zoom remains a valid preference, but its calibrated framing intentionally changes from the old release.

For chase↔overview, interpolate derived eye distance logarithmically and orientation continuously over an initial 0.8 s; selected body/ship locator remains identifiable. Preserve authored vessel pose/heading, target, seeds and phase values. Temporarily pause flight and phase advancement during this camera-only interpolation, while visual/UI clocks continue. Clear held input and disarm Cruise. Do not invoke arrival placement, Jump or autopilot. Publish/save only the valid settled camera endpoint. A repeated switch is ignored until settlement; cancellation, apply failure or context loss returns to the preceding valid endpoint without a pose rewrite.

Resize updates every pass and projection helper from one CSS viewport/aspect. `projectAuthored(position)` transforms through the current frame into a common eye-space projection, returning CSS coordinates, positive axial depth and an explicit visibility result. Do not use one slice's normalized Z as a global visibility test. `pick(cssPoint)` uses the same full-view eye/ray and current proxies or their mapped authored geometry, then returns stable IDs. Existing labels, marker hit targets and ruler must register with the drawn geometry.

Enter System, Return and Jump retain their existing intentional navigation/frame changes. The invariant above concerns camera-only transitions within a frame, not those actions.

## 6. Depth and compositing — fixed prototype algorithm

Use native perspective depth slicing in the existing r128 renderer. This avoids assuming reversed-depth extensions or enabling logarithmic depth across unadapted custom shaders. A local-sized hull and distant bodies are real geometry in the same observer-relative metre space.

Initial logical axial-depth boundaries, in metres, are `[0.1, 10, 10^3, 10^5, 10^7, 10^9, 2×10^11]`. Axial depth means `z = −eyePosition.z`, not radial distance. Render non-empty slices far to near, retaining colour and clearing depth between slices. Every physical surface that crosses a boundary is included in every intersecting slice and clipped there. Since the visible depth intervals do not overlap, a nearer slice contains genuinely nearer fragments; the hull is not privileged over a planet surface. Use conservative bounds; uncertain/crossing bounds remain included.

Assign logical half-open ownership `[b_i,b_(i+1))`, with the farthest endpoint inclusive. The raster guard is a dimensionless relative fraction `e=10^-4`: use `nearClip=b_i×(1−e)` and `farClip=b_(i+1)×(1+e)`, with all bounds in metres. Physical fragment shaders still enforce the unexpanded logical interval using the same eye-space-depth varying and encoded bounds. Thus guard-band raster overlap does not produce visible overlap. Built-in material adapters compute the varying after the complete model/instance transform; custom shaders receive an equivalent audited calculation. A common program cache key and per-pass uniforms prevent a new shader program for each band. If exact coplanar transparency, crossing triangles or slow boundary traversal double-blend, disappear or produce a seam, the gate fails. Do not hide failure by undocumented overlapping visible ranges.

Require at least 24 depth bits in both the high-quality world target and low-quality output. The existing high-quality target's default 16-bit renderbuffer is insufficient for this design. Request packed depth/stencil where supported (`stencilBuffer:true`, depth enabled), check framebuffer completeness and query the actual bound depth precision; do not infer it merely from an option. Blur-only targets need no depth. Unsupported precision produces an explicit prototype limitation and blocks integration; no silent 16-bit local-flight fallback.

Depth bits do not establish shader arithmetic precision. Require vertex and fragment `highp` for all sliced physical materials and matching explicit highp eye-depth varyings/uniforms. Check the actual HIGH_FLOAT formats in both stages (at least 23 precision bits and exponent range covering the complete 0.1…2×10^11 m interval), plus r128's selected precision; reject a mediump fallback. Slice bounds, transformed depths and comparisons must stay finite. Failure of either arithmetic or framebuffer precision is an explicit gate failure, including on low quality.

Draw the non-occluding sky/backdrop once. Sliced presentation scenes have no automatic scene background; explicitly control colour/depth clears so r128's scene-background handling cannot erase preceding bands. Render physical opaque and transparent geometry in the correct band, retaining existing within-band transparency limitations. This is not order-independent transparency. Screen-space UI is separate.

In high quality, accumulate all world bands into the world colour target, then run the existing bloom/blur/composite chain once. In low quality, apply the same world-band semantics directly without bloom. Drawing an entire hull last after an unconditional depth clear is forbidden. Keep sky, colour encoding, tone mapping and exposure coherent across both paths.

All bands use one frozen source frame and identical eye/FOV/orientation/aspect. Restore renderer target, viewport, clear policy and temporary material state on every exit. Verify there are no repeated source callbacks, additional simulation ticks, background draws or independent per-band animation clocks.

Performance is a measured gate: six logical bands are a maximum, not a promised low draw count. Keep only conservatively non-empty bands and record crossing draws. If precision, seams, material compatibility or performance cannot pass, stop at the isolated prototype and revise this design. Do not automatically add logarithmic depth, a new engine or approximate opaque occluders.

## 7. Symbolic markers and scale cues

Hide the solid ship in the chart and render a distinct CSS-sized location/heading locator at its authored position. Keep existing chart coordinates, annotations and deliberate navigation semantics.

For system views, compute projected hull size from the calibrated physical bounding extent, common camera and CSS viewport. Below 4 CSS px, hide the physical hull and show a 10 px locator; reveal the hull above 8 px. Retain the previous state between thresholds and crossfade over 0.2 s. The transition never scales the hull geometry to a minimum screen size. Hide behind-eye/out-of-view locators; a symbolic locator may be drawn above scene imagery but is never represented as physical hull light or a proximity certificate.

Show one optional selected-body scale cue: nominal diameter in hull lengths, plus a compact ruler at the explicitly named selected-body center plane. Choose 1/2/5×10^n lengths for approximately 80–160 CSS px. If its reference plane is behind/outside the view or the catalog radius is unavailable, omit the ruler and state unavailability. Never imply a globally valid pixels-per-km ratio across a perspective view. Label the system convention as nominal/compressed, not measured new canon.

## 8. Motion and orbital playback

Chart flight/Jump pacing remains as released. The following are system-only viewer defaults, not canonical engine capabilities. Use the existing real frame delta (capped .05 s), normalized combined movement input, and consistent keyboard/touch integration.

| Parameter | Maneuver | Cruise |
|---|---:|---:|
| Maximum speed | `.0000312u/s` = 31.2 nominal m/s | `.75u/s` = 750 nominal km/s |
| Thrust acceleration | `.0001248u/s²` | `.30u/s²` |
| Damping | `2 s^-1` | `.10 s^-1` |
| Explicit brake deceleration | `.000156u/s²` | `.30u/s²` |

Integrate thrust and damping together, with vector speed limiting. Brake overrides thrust and reduces speed linearly to zero without reversing it. Releasing thrust means coast/damping; it is not an instantaneous stop. Shift multiplies thrust acceleration by 1.5 within the selected cap but does not select Cruise or raise its cap. Reducing a moving speed cap decelerates continuously with the outgoing Cruise brake rate instead of truncating velocity in one frame; indicate the slowing state and do not accept fresh accelerating thrust until it settles.

Engine feedback uses normalized thrust demand and speed/cap ratio rather than legacy absolute acceleration/speed thresholds. Retune feedback so Maneuver visibly responds without reusing thresholds that are larger than its new entire speed range. Feedback remains visual; it does not create a new physical engine-power claim or ordinary-flight warp streaks.

Cruise requires explicit `V`/button selection and subsequent fresh thrust. Selection alone never accelerates. Controls held before selection must return neutral before arming; touch sticks also require neutral. Disable engagement in free camera, a modal, a transition, unstable capture/restore or a blocked save state. Restore, blur/visibility loss, modal pause, Board/Return, frame change and context loss disarm Cruise and clear movement/look gestures. These explicit pause/reset operations may zero transient velocity while preserving position.

Track observed physical releases/neutral separately from cleared command buffers. Clearing a key/stick buffer is not evidence that a held control was released. After a held or unknown input state, remain unarmed until release/neutral is observed and a fresh non-repeat thrust action follows; feedback must explain this state. Initialize Cruise availability false after every reset. The geometry update may enable it only under the strict upper-threshold rule below; retain its previous value at either threshold's equality and throughout the hysteresis band. The gate restricts entering Cruise, never the ability to select Maneuver or Brake while already cruising.

Use nearest positive authored opaque-body clearance for an engagement interlock. First reject engagement when the vessel is on/inside any relevant body; do not simply discard non-positive clearances and choose another body. Resolve radii from the existing star/body/black-hole descriptors, excluding glows/atmospheres; invalid/unavailable required geometry disables engagement without relocating the vessel. The cap-speed stopping envelope is `Dcap = .75²/(2×.30) + .75×.25 + .10 = 1.225u`. Offer engagement above `Dcap+.50u`, withhold below `Dcap+.25u`, retaining availability between the thresholds. This is an engagement gate and warning, not steering, automatic braking or a collision guarantee. Once engaged, display an approaching-stop warning using actual unrounded speed/clearance and `Dstop=v²/(2B)+v×.25+.10`; a visitor can still ignore it. Sensor eligibility is independent of this control gate.

At fixed phases, a straight default approach from center distance 45u to the unchanged 18u survey boundary should take 30–60 s of deliberate Cruise. With the starting constants, the analytical estimate is about 37.4 s to enter the band and 41.3 s to brake near clearance 10u. Browser tests must establish actual values with advancing orbits; these estimates are not runtime acceptance. No hidden teleport or automatic survey is permitted.

Apply an initial orbital playback factor `10^-6` only to future increments of registered saved-body orbiters: `angle += sourceSpeed × realDt × factor`. This reduces the current moon tangential rate from about 2u/s to about 2 nominal m/s, with parent motion additional. Do not change saved angles, phase IDs, seeds, radii/orbits, normalization or reconstruction. Do not scale the entire update timestep: preserve existing spin/cloud/corona/light and illustrative comet/belt/disk visual clocks and UI/observation/checkpoint clocks. Camera transitions may temporarily freeze phase advancement as specified above, without reset/reseed.

The prototype may tune Maneuver to .05–.20 hull lengths/s, Cruise to .5–1u/s and orbital factor to `10^-7…10^-5`, provided stopping behavior, source geometry, input safeguards and the 30–60 s approach gate still pass. Recompute braking envelopes from the chosen cap/rate; do not retain the defaults' 1.225u envelope after a numeric change. Record the final profile before integration. Values outside those bounds require a design revision.

## 9. Readouts and save invariants

Derive display quantities from unrounded authored state. Nominal system km = u×1000; nominal km/s = authored speed×1000; metres/s = authored speed×10^6. Existing target u→Mm and position u/1000→Gm conversions remain valid. Format small Maneuver speeds in m/s rather than rounding them to zero; use adaptive precision and finite-value guards. The phase-playback factor must never enter ship-velocity conversion.

Keep schema2/catalog1, database name/scope/version2 fence, existing coordinate bounds, camera enums/bounds, chartReturn and interior feet. Capture never reads scaled root positions, presentation camera matrices, rounded HUD strings or the ruler. Do not serialize Cruise, origin, bands, marker state or interpolation. A rendering-only toggle alone does not create a durable checkpoint; a deliberate settled camera preference change may be saved through the existing path.

v1 normalization still produces an empty survey without changing metadata/poses. v2 restores its chosen record. Import/recovery/New journey keep replacement rather than union semantics and existing warnings. Page-only metadata does not borrow durability from an unrelated checkpoint. Preserve original export, rollback, CAS, raw predecessor, old-client fence and explicit memory-choice behavior.

Sensors continues to evaluate the exact captured authored pose and complete phase set using the existing orbital helper. Retain `0 < centerDistance−R ≤ 2R`, currently `(0,12]u`. This is center-to-rendered-radius gameplay clearance, not hull clearance or collision certification. A presentation origin, a different selected body, physical ship visibility or Cruise state cannot change the result.

Board rejects an unsettled camera transition as busy before beginning capture. Once accepted from a settled presentation state, it disarms/pauses controls and captures authored position/heading/phases together exactly once. Preserve that private candidate throughout asynchronous validation/storage even if source orbits later advance. On failure retain the chart and original captured progress, do not publish a survey or navigate, and require fresh Maneuver input. Camera-only interpolation is unstable for new Save/Board/restore mutation; existing fallback-export/recovery semantics remain available and no intermediate camera state is persisted.

## 10. Modules and ownership

Use classic-script/UMD modules compatible with the current loading style:

- `assets/scale-math.js`: finite-checked pure unit conversion, hull normalization, camera projection, slice classification/ownership and stopping-envelope calculations. No DOM/storage/THREE dependency. Callers and tests exercise these public calculations.
- `assets/scale-view.js`: renderer adapter owning presentation proxies, unit-adapted materials, a frozen frame, common camera/bands, markers/projection/picking and disposal. A small interface accepts authored frame state, performs one world render, projects/picks stable identities and reports capability/performance diagnostics. It never mutates source navigation or writes saves.
- `assets/scale-flight.js`: pure motion/profile/arming calculations driven by explicitly supplied real delta and input/control state; no storage or automatic navigation.
- `index.html`: integrate those modules at existing logical update, camera, frame rendering, input, labels/HUD and chart adapter seams. Preserve source data and existing graphics/effect branches. Avoid a wholesale monolithic rewrite.

Preserve the established save-session and survey interfaces. Any necessary stable/pause integration is narrow and independently reviewed. Do not duplicate the range evaluator, phase authority or save repository inside the scale modules. The implementation plan must assign disjoint writable files; Main owns serialized Git/integration, two retained workers perform implementation and independent cross-review, and Dirac remains context-only. New external-review packets require their own applicable authorization; prior Sensors disclosure does not cover this design by default.

## 11. Prototype and integration gates

**Gate A — baseline/calibration:** record the matched baseline browser, viewport, DPR, quality, actual depth bits and GPU-visible resource counts. Inventory physical geometry roles and source-unit adapters. Measure Hraw and demonstrate 312 m normalization without geometry/asset edits. No claim of physical interior reconciliation.

**Gate B — isolated proof:** use an isolated worktree/preview, never the current live checkout as an experimental runtime. Demonstrate real Karna Vex/Micqui-Nobara plus controlled geometry fixtures for opaque occlusion and slice boundaries. Establish native depth precision, clear policy, unit/material registration, hull sizing, symbols, motion/time pacing and actual frame cost before broad integration. No modern extension or analytic body billboard may conceal failure. Record the selected permitted tuning constants and stop the gate if any required evidence is absent.

**Gate C — compatibility/integration:** apply the proven renderer path to existing systems, checking all current system entry/exit and quality switches. Reuse original assets; test label/picking registration, source body reconstruction and disposal. Preserve chartReturn, ship heading, interior, Navigation and Sensors. Existing correctness regressions stay meaningful; only deliberate new appearance/timing expectations may change with documented assertions, not disabled checks.

**Gate D — release:** independent spec and quality reviews plus the appropriately authorized adversarial review; fresh relevant Node/browser/invariant checks on a frozen commit; normal main integration and private/public publication only under release authority. Verify exact public tree, Pages success, served raw-Git-blob bytes and actual public desktop/touch journeys. Keep external evidence and source/prototype/production claims distinct.

## 12. Required evidence

1. Pure finite/unit/normalization roundtrips; near/far and half-open slice ownership, including coplanar boundary values; marker hysteresis in CSS px; vector motion/braking and cap-change continuity. No naive implementation-mirroring tests as substitute for actual rendering.
2. Actual ≥24-bit depth in both output paths; reference opaque surfaces in front of/behind the hull within one band and across boundaries; spanning triangles; coplanar additive/translucent planes; slow camera crossing at every boundary. No doubled blend, gap, black band, incorrect hull overlay or unstable silhouette; compare with a tightly clipped single-band reference at each fixture. Permit at most one CSS px raster-edge difference, not a visible recurring seam.
3. Camera/proxy/screen-pick registration at both qualities, across observer-origin changes and supported zoom/pan bounds. Verify hull length and origin/heading invariance. Inspect custom shaders, point lights, directional targets, point clouds, sprites, comet buffers and belt instances; verify effects update once per frame.
4. Fixed-clock camera-only chase→overview→chase comparisons retain authored pose, heading, phase set, target and survey. Run separate live-clock tests; do not freeze all handoffs. Delayed validation/storage with advancing source orbits must persist the original Board candidate, not a later rendered context.
5. Real UI Enter System → explicit Cruise/fresh thrust → Brake → Board → Ops → Record → Close → Return → reload. Prove default arrival is still out of range, ordinary navigation crosses the same unrounded boundary, phases/range agree in both qualities, repeat recording retains its first timestamp and no view toggle grants completion.
6. Legacy v1/current v2 import/export, previous recovery, New journey, CAS, original retention, quota/abort, denied/blocked storage, old-client fence, explicit memory choice, catalog/read-only states and file limitations. Restore remains stationary with valid old camera numbers; new framing is intentional, not corrupted data.
7. Keyboard and touch MOVE/LOOK, braking, pointer-lock fallback, free camera, text entry, modal overlap, blur/visibility, repeated V/C, resize and interrupted transition. No stale motion or armed Cruise after resume. Desktop 1440×960 and touch 390×844, 844×390 and 390×500; actual touch swipes and reachable controls, not screenshots alone.
8. Original DATA/DECK/30 model/texture invariants and no unintended public/private history changes. No new file or background request outside the approved resource/catalog boundaries.

## 13. Performance and failure rules

Proposed performance targets are 60 fps for the recorded Malfurion desktop profile and 30 fps for the recorded low-quality case, with no more than a 10% p95 frame-time regression against matched baseline reference scenes. Use fixed poses/phases as well as a matched moving route so the slower approach cannot bias the comparison. Record actual browser/DPR/hardware/profile, p50/p95, draw submissions/crossing draws, enabled bands and geometry/texture/target counts. Emulated touch is not a physical-phone performance result. If the baseline misses an absolute target, report both facts and settle the budget before widening integration.

Share source assets; cache per-system proxy structure and rebuild only when its source/quality changes. Baseline and ten repeated transition/quality cycles must show no progressive resource growth after warm-up. Do not duplicate full detailed systems for every slice or upload new float buffers/materials per draw. Cap prototype residency at the active system plus an explicitly bounded incoming/outgoing transition set; cache/disposal changes require regression evidence before integration.

Invalid transforms, unknown dimensional adapters, insufficient depth, shader errors or context loss fail visibly and pause the isolated prototype; keep source progress/export recoverable. Do not mark a prototype live or Saved merely because it draws. Do not silently substitute the old enormous hull, reduce depth precision, change source orbit data or lower scene complexity without recording the changed quality/budget. Renderer failure may disable local flight in the prototype for diagnosis; release acceptance requires the promised supported path to pass.

## 14. Static design basis and review gate

Main inspected current source seams, prior expansion guidance and save/survey contracts. The retained workhorses provided read-only analyses of motion, save compatibility and depth slicing. These are design evidence, not a built prototype or benchmark.

Written-spec review completed before this documentation checkpoint: Curie read back the fixes for relative guard bands, shader arithmetic precision, translation-relative chase smoothing and effective FOV; Pasteur read back the fixes for neutral-input arming and threshold equality. No remaining blocker was reported in their reviewed scopes. Main also resolved inside-body engagement, stable-state identity and accepted-Board capture ordering. No application code, tests or runtime benchmarks were executed as part of these design reviews.

Primary technical references: [r128 renderer source](https://raw.githubusercontent.com/mrdoob/three.js/r128/src/renderers/WebGLRenderer.js) confirms native clear/target and model-view operations; [Cesium's multi-frustum discussion](https://cesium.com/blog/2018/05/24/logarithmic-depth/) documents back-to-front depth partitioning and its draw-cost tradeoff. This design's band sizes, ownership guard, calibration and acceptance budgets are project choices to prove, not capabilities inferred from another engine.

Before implementation planning, self-review and independently check this file for unit, coordinate, depth/boundary, timing, backup-replacement, scope and authority contradictions; fix them and commit the documentation locally. Then obtain owner review of this written technical design. Only the reviewed design proceeds to a bounded implementation plan and isolated prototype. Approval of the concept and 312 m reference is already recorded and must not be requested again.
