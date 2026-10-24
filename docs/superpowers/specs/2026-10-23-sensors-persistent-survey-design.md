# Sensors and one persistent survey record

Status: the owner approved this written specification and explicitly requested “Implement, commit, push, make live.” Implementation planning and the bounded build/release are authorized. Acceptance remains to be demonstrated.

Baseline: source `326f8dfc09daebbe55b3bd1b608abe0c82fff40c`, public mirror `f1ba497194ebf83f89dd7575fbd087bb8c655741`. This document does not change or publish the application. It builds on the shared-state/local-save and bridge-navigation-console designs in this folder.

## 1. Goal, authority and boundaries

The visitor approaches Micqui-Nobara in the Karna Vex system, boards Ripley, opens Sensors at the existing Ops station, and records one survey. The same record remains visible after leaving, reloading and returning. Selecting a target alone never completes the survey.

The owner selected “sensors and one persistent survey record first,” accepted the actual-close-approach recommendation, then approved the presented design for a reviewable specification. Written-spec approval is still required before planning/build. No new push, deployment or external-provider disclosure is inferred from the prior completed bridge release.

Scope is one target, one station access point, one nullable visitor record, its save migration, and the necessary interaction/dossier feedback. No new canon, artifact, anomaly, mission, rewards, inventory, general-purpose journal, additional survey targets, new geometry/decks, images, audio, accounts, cloud sync, offline simulation or sensor-physics model. Existing source identity, models, textures and DECK remain unchanged. No Muse brief is needed.

## 2. User journey and range rule

1. Enter the Karna Vex stellar system and approach Micqui-Nobara using existing flight controls.
2. Get outside its rendered surface and within two rendered moon-radii above that surface. Ordinary arrival placement does not satisfy this band.
3. Board Ripley through the existing settled-state handoff. That handoff's exterior pose and orbital phases define the observation context aboard.
4. Approach Ops, press E or tap its Sensors prompt, inspect range/target/checkpoint feedback, and explicitly press **Record survey**.
5. After a completed save, read the one record in Sensors or the existing Micqui-Nobara dossier. Return, move away, reload, and revisit without losing or duplicating it.

Let `P` be the saved exterior ship position, `M` the reconstructed moon center, `R` the rendered body radius, `d = hypot(P-M)` and `c = d-R`. Eligibility is exactly `0 < c <= 2*R`. Use finite double-precision values; no rounded display value participates in the comparison. Points on/inside the surface are ineligible. The upper boundary is inclusive; tests use controlled phases and points on both sides of each boundary.

Current source parameters are `R=6`, giving center distance `(6,18]` scene units and surface clearance `(0,12]`. Existing moon arrival is center distance 45, so further flight is required. These are visualization/gameplay parameters, not new canonical physical dimensions, real orbital dynamics or hull-clearance certification. The current stellar UI labels its compressed scale as 1 unit = 1000 km; feedback must retain the compression qualification and distinguish center distance from surface clearance. Do not display these parameters as newly established astronomical measurements.

The Sensors panel shows the computed clearance, permitted band, and an understandable reason when a new survey cannot be recorded. For an out-of-range boarding context, tell the visitor to Return, approach the moon, and board again. Existing selected-body distance feedback remains available outside; no new navigation/travel action is introduced.

Eligibility requires an interior session with valid `system-1000km` navigation for `karna-vex`, the fixed target in the approved catalog, and the required valid orbital identities/phases. Direct interior startup without exterior navigation, chart-frame navigation, a different system, malformed phases or unavailable catalog is read-only for recording. A chart selection, dossier, camera framing, prior in-range flag, overview moon offset or client-supplied distance is not evidence of proximity. A different selected body or staged chart destination does not invalidate actual proximity.

An existing historical survey can be read from any later location. Do not require current proximity to restore/export/read it. Only creation of the first record is range-gated.

## 3. One source of orbital position

Use one shared pure descriptor/position helper for the chart's existing orbital placement and survey reconstruction. Extract only the relevant deterministic orbital/seed math; no broad renderer refactor or canonical parameter edits. The helper accepts validated numeric descriptors/phases and returns derived positions, with no DOM, clock, fetch, rendering or storage authority.

Fixed survey target ID is `karna-vex:moon:micqui-nobara`. Read its name/lore from the canonical moon entry and its rendering classification/radius/orbit/seed from the existing system definition. Current parent identity is `karna-vex:featured:117`; derive the expected parent seed identity from the catalog rather than accepting arbitrary input IDs.

For the current source, parent orbit radius is 7600 and moon orbit radius is 590. With saved parent phase `a`, moon phase `b` and the existing deterministic inclination `i`:

```text
parent = [7600*cos(a), 0, 7600*sin(a)]
moon   = parent + [590*cos(b), 590*sin(b)*sin(i), 590*sin(b)*cos(i)]
```

Derive `i` through the same existing hash/seeded generator; its current diagnostic value is approximately -0.05851929216645658 radians, not a new hard-coded source of truth. Moon root groups use parent translation, not the parent's visual axial tilt. Missing phases must fail rather than silently use initial angles. Validate the complete expected Karna Vex phase identity set against the approved catalog, including uniqueness and no unknown bodies, before authorizing a new record.

Use the exact navigation candidate captured by `handoff()` after controls are paused and before its save. Orbital animation can continue while that asynchronous save is pending; do not remeasure the later live scene or substitute an earlier autosave. The interior already preserves the saved exterior navigation. Reconstruction aboard and after reload uses those same phases, with no elapsed-wall-clock advancement.

Parity tests compare the helper against actual rendered body centers at varied phases and both quality settings, including parent movement. Existing other orbiter placements must remain equivalent. This helper does not certify collision safety or simulate instrument precision.

## 4. Catalog boundary

Read only the fixed same-origin, application-relative `expanse-data.json` over HTTP(S), rejecting redirects rather than following a catalog elsewhere. Reuse the established catalog transport bounds or a shared transport that preserves them: one logical in-flight request per fixed app catalog, 8-second timeout, 1 MiB streaming cap before parse, fatal UTF-8 decoding and explicit Retry. Rejected/oversized streams cancel best-effort without delaying an already known error; late completions cannot clear a newer request. No caller-controlled URL, foreign origin or file-scheme workaround.

Retain bounded world/ID/name checks and Map/own-property identity lookup. Reject duplicate/prototype-shaped identities. Survey resolution additionally validates the current fixed world/moon/explicit-system relationship, positive finite radius/orbit, integer seeds and required body/phase identities. Resolve only the fields needed by this feature; do not expose arbitrary catalog objects as mutation authority. Missing or incompatible definitions disable recording rather than synthesizing facts or silently granting range.

Read-only source facts and visitor observations are separate. “Ocean” is the current rendering classification and “Habitable moon of Karna Vex” is existing catalog lore. Label such facts as catalog information, not instrument measurements or newly discovered canon. Do not infer atmosphere, life, composition, artifacts or hidden history.

## 5. Save format and migration

Use the existing save envelope with `schemaVersion:2`, retain `runtimeCatalogVersion:1`, and add exactly one field:

```json
"survey": null
```

After the first recorded observation:

```json
"survey": {
  "targetId": "karna-vex:moon:micqui-nobara",
  "observedAt": "2026-10-24T00:00:00.000Z"
}
```

The timestamp above illustrates the encoding only; it is not an observation or acceptance result. The record contains only that fixed target ID and a valid canonical ISO timestamp of at most 32 characters. No free text, facts copied from lore, arbitrary targets, duplicate list, position certificate or general discovery API. `observedAt` is device-clock visitor metadata, including when restored from a backup; it is not a server-attested event, durable checkpoint time or canonical history. Backups are editable visitor data, not cryptographic proof that the gameplay rule was followed.

Keep all existing bounds and validation: maximum 256 KiB UTF-8 save/import, bounded vectors and phase lists, strict enumerations/IDs, recursive forbidden-key protection and reconstructed allowlisted objects. A malformed schema-2 survey or unsupported future version fails closed before live-state mutation. A v2 record remains valid when current navigation moves elsewhere or is null.

### Legacy normalization

- Valid v1 input normalizes in memory to v2 with `survey:null`. Ignore any formerly unrecognized v1 `survey` property; never invent completion from it.
- Preserve normalized navigation, interior pose, preferences, last view, revision and `savedAt`. Migration alone does not increment revision, stamp a new time or claim a new completed checkpoint. Repeated normalization is idempotent.
- Fresh journeys use v2 and `survey:null`. Ordinary adapter capture/merge preserves the current survey and cannot supply an arbitrary survey patch. Only the narrow session command or explicit whole-save import/recovery changes it. Include the survey in change detection.
- Do not eagerly rewrite payloads while opening storage. Normalize, semantically validate and restore first; the next normal checkpoint or accepted survey transaction persists v2.

### Storage compatibility fence

Keep the SAME database name and base-path scope, including the legacy literal `the-expanse/save/v1:` prefix. Open IndexedDB database version 2, retaining the `snapshots` store and current/previous keys. Creating a new v2-named database would strand the existing save and is forbidden.

Database upgrade creates a missing store for a fresh database but otherwise leaves existing snapshot payloads unchanged. Existing old connections must close through their installed `versionchange` handler. Old code opening database version 1 must not regain durable write/recovery access to the version-2 database. Test this actual old-client path: a schema bump alone would not stop old explicit recovery from replacing a newer payload. A blocked upgrade preserves data, offers close-old-tabs/Retry guidance and does not silently start a separate database. Preserve the bounded open timeout and close late-success connections after timeout.

Normal commit still performs revision compare-and-swap and atomically rotates current/previous in one transaction. A valid raw preceding checkpoint is retained unnormalized as `previous`, including a v1 payload, rather than silently rewriting the recovery copy. An ordinary failed transaction leaves both stored records unchanged. `previous` rotates on later successful checkpoints; it is not an archival migration backup. Recommend a portable JSON backup when upgrading.

Unreadable current/previous payloads must not be erased by opening or normalization. Preserve Export original/diagnostic behavior before any explicitly confirmed replacement. Recovery keeps the established confirmation, rollback and CAS protections; it is not an automatic repair or merge.

### Import, recovery and memory behavior

Exports emit v2 including the survey. A valid v1 import explicitly replaces state with an empty survey; a v2 import restores its record. Recover previous and New journey likewise replace rather than union survey state. Warn when an explicit replacement will remove an existing record. No silent downgrade export.

Imported observation time may be retained, but imported revision/`savedAt` cannot masquerade as new local checkpoint metadata. Only a completed local transaction earns the new envelope revision/time. Historical survey data is not re-gated against the visitor's current ship location.

Over HTTP(S), an explicitly selected memory-only mode can create a current-page record after the same catalog/range checks. Label it “This page only — close Sensors and export JSON before leaving,” never Saved or automatically resumable. A failed durable survey transaction does not silently publish its private candidate as memory progress; it reports failure and retains the old record. A later explicit action in clearly labelled memory mode is distinct.

Direct-file mode cannot fetch the survey catalog and cannot create a new record. It can import/export a v2 backup and display the existing record read-only, without promising cross-page continuity. Storage denial, failed upgrade and file limitations remain visible; no fallback fetch or fabricated exterior context.

## 6. Session command and input ownership

Expose an interior-only Sensors controller with a read model, fixed-target `recordSurvey()` command, fixed-catalog Retry and Close. UI callers cannot submit a target ID, range, eligibility flag, timestamp, arbitrary snapshot or patch. The session derives the observation time and validates its own captured exterior context/catalog.

Navigation, Sensors and Save share one exclusive interaction ownership model. Keep existing Navigation API behavior compatible; acquire the appropriate console lease before opening a modal. Block incompatible save/import/recovery/handoff/autosave and competing console operations while leased. Stale controllers, catalog callbacks and settled async callbacks have no later authority.

For a first record:

1. Synchronously acquire busy ownership before any await; capture actual interior progress while preserving the exterior boarding snapshot.
2. Validate the lease, fixed catalog, complete navigation semantics and range. Derive the candidate privately with the fixed record and observation time.
3. Recheck ownership after asynchronous validation. Do not call the renderer's apply/teleport path or alter navigation, either saved pose/camera, phases, preferences or selected destination relative to the freshly captured pre-command snapshot.
4. Persist through normal CAS. Publish the new record only after transaction completion. The permitted changes from that captured snapshot are `survey` and normal envelope checkpoint metadata. Normal capture may first update actual interior pose/preferences and `lastView:'interior'`; compare against that capture, not a preceding autosave, and never invent progress or preference values.
5. On failure retain the old survey and captured pre-command progress, keep input owned, and report the actual reason. A conflict blocks further mutation until existing recovery resolves it.

If a valid record already exists, return/read it without changing its observation time, checkpoint revision or durable payload. Do not require range for this read. Busy/stale/conflict guards still apply; concurrent first attempts cannot create two records. Dossier selection alone never invokes recording.

While a record operation is pending, Close and normal Escape cannot release the lease. Preserve the bridge console's native-dialog constraint: Chromium can force native dismissal after repeated Escape. Latch that close request, let the accepted operation settle, then clear inputs and release exactly once. Do not claim that every native close can be cancelled. Normal close clears held keyboard/mouse/touch input before lease release; never reacquire pointer lock or resume stale movement.

Read models separate the existing survey, its actual browser durability, current range eligibility, catalog errors and last completed checkpoint. An unsaved pose does not make a previously durable survey fictitious; an imported/page-only survey does not inherit durability merely because an older checkpoint timestamp exists.

## 7. Physical interaction and UI

Reuse `st_ops` and the existing `stationWorldRect` transform; do not rename or move DECK stations. Its current world footprint is x `[-12,-6]`, z `[460,466]` feet. Compute from DECK at runtime. Require Bridge Pod membership through `parentRoomAt`, a collision-valid player position, prop readiness, playable input and no competing modal/onboarding/help state.

Use the existing six-foot nearest-footprint interaction radius for both Ops and Navigation. Resolve the nearest of the two interactive stations; exact ties choose `st_nav` to preserve established Navigation priority. Only the winning eligible prompt consumes E/tap. Do not let all non-interactive decorative stations suppress these two controls. Re-evaluate on activation. For example `(-6,455.25)` is currently 4.75 feet from both footprints and must resolve deterministically.

Retain existing text-entry/repeat/modifier filtering, pointer consumption, focus containment and restore-to-eligible-prompt behavior. Reuse the existing panel theme rather than introducing a new command-screen layout. Label the station access as “Sensors · Ops”; the source station remains Ops.

Sensors is a labelled native dialog showing fixed target identity, catalog facts, range/status and a single-record section. Recording is an explicit action, with no artificial timed minigame or unattended background scan. Show reasons and Return guidance when ineligible. An existing record stays readable when range/catalog is unavailable; unavailable catalog facts are labelled rather than fabricated. Provide fixed-catalog Retry when appropriate and a reachable Close control. Use textContent and bounded strings, skip unchanged live-region writes, and keep the panel scrollable at narrow/short touch sizes.

Append a clearly visitor-state survey section to Micqui-Nobara's existing chart/system dossier, keyed through the same parent-qualified identity. Do not modify canonical lore text or DATA to add a surveyed flag. Selecting another body cannot display this record as belonging to it. Dossier feedback updates after startup/import/recovery/New journey; it does not perform writes or claim a survey exists merely from selection.

## 8. Architecture and rejected alternatives

Keep focused classic-script modules: pure shared orbital descriptor/position math; a bounded survey catalog/domain evaluator; the session-owned command; and a small Sensors panel/station adapter. Reuse core/storage, existing native modal ownership, dossier surfaces and chart/ship handoff. Implementation planning will fix disjoint file ownership and script ordering. No new framework/build dependency.

The chosen source of proximity is the authoritative saved exterior context plus shared orbital math. A boarding measurement/eligibility certificate duplicates authority and can contradict imported pose/phases, so it does not authorize scans. A separate journal database can diverge from journey replacement, rollback and backups, so the record belongs in the same versioned save transaction. A new freeform/lore-generating discovery service is outside scope.

## 9. Required implementation acceptance

These are future tests, not claims of existing behavior. Baseline source-only checks and the prior bridge release do not accept this feature.

1. Pure orbital parity with actual renderer centers at varied parent/moon phases and high/low quality; reject wrong frame/system, unknown/missing/duplicate phases, malformed catalog and non-finite values. Verify overview offsets/selection cannot grant range.
2. Range tests: inside/on surface rejected; just outside accepted; inclusive upper boundary accepted; just beyond rejected; default arrival rejected. A nearby actual ship with another selected target remains eligible.
3. Old/new save fixtures: v1 normalizes empty idempotently without metadata/pose changes; v2 roundtrips the single record; malformed/future saves fail closed; ordinary captures preserve it; v1 imports and explicit recovery/New journey replace it with appropriate warning.
4. Actual IndexedDB upgrade with v1 current and previous, stale open v1 connection, blocked/late upgrade, old-client reopen and recovery attempt, raw predecessor preservation, quota/abort and stale CAS. No lost raw checkpoint, false new timestamp or durable downgrade.
5. Command ownership: busy before await, private candidate through deferred validation/write, failure preserves old record/pre-command pose, repeat does not change time/revision, multiple tabs cannot duplicate, stale controller cannot mutate, normal and forced-native Close settle safely.
6. Real user flow: enter Karna Vex through existing controls, approach Micqui-Nobara into range with ordinary flight, Board, walk safely to Ops, E/tap, Record survey, reopen IndexedDB and verify one record. A test that teleports directly into eligibility is not sufficient flight acceptance. Initial staging outside the band may support focused regressions but must be labelled.
7. Close/reload/Return preserve original exterior/interior poses, headings, cameras, phases, local body and chart destination. Move away and revisit: same survey time/identity, no duplicate or automatic travel. Dossier and Sensors agree after fresh-process reopen and explicit backup replacement.
8. Ops/Nav nearest-station and exact-tie tests; prop-loading/outside-bridge/collider-invalid/repeat/text-input/modal exclusion; held keyboard/mouse/touch clearing, focus return, new gestures and repeated Escape regression. Navigation and Save remain functional.
9. Memory/storage-denied/file/catalog-failure cases, real timeout/retry and unavailable facts. Existing record retained/readable without false persistence or new canon.
10. Fresh existing Node/save/look/navigation/repair suites plus new tests, unchanged data/DECK/all30models/texture invariants, actual desktop1440x960 and touch390x844 plus short390x500 screenshots inspected. Record runtime hashes and distinguish local acceptance from public deployment. Physical phones, other browsers, screen readers and full collision coverage require their own evidence.

## 10. Review and build gate

Main authored this specification from current source and the two retained workhorses' read-only save/geometry analyses. Those analyses changed no files and ran no browser acceptance. The owner-approved concept is not implementation evidence. Main must self-review this file for incomplete requirements, contradictions, identity/unit errors, migration ambiguity and scope creep, then commit it locally for owner review.

After explicit written-spec approval, use the writing-plans workflow to create the implementation plan and isolate runtime work from the released source. Keep workers' file ownership disjoint and the context auditor context-only. Any new Claude/MiMo/Antigravity disclosure must respect the exact payload authority; prior bridge-packet approval is not approval to send the new survey code/spec elsewhere. No publication is performed by this specification commit.
