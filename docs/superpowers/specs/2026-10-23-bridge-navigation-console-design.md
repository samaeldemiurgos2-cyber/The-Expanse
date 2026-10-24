# Ripley bridge navigation-console design

Date: 2026-10-23. Status: **owner approved for implementation planning and build by “do it” in response to the written-spec approval request. Implementation and acceptance are not yet complete. No new publication authorized.**

Baseline: released commit `aa52c7a`. The owner selected the bounded E/tap navigation-console slice, then answered “proceed” to the recommendation that setting a destination leaves Ripley stationary and does not start travel. This approves that behavior; it does not establish acceptance of unimplemented code or approval of the technical details below.

## 1. Outcome and limits

At the existing Navigation station on Ripley Deck 1, the visitor can open a console, inspect the actual saved exterior location and current chart target, choose an existing world, and set it as the chart's Jump target. The visitor remains aboard at the same interior position and heading. Closing the console and using the existing Return to chart control restores the exterior stationary at its remembered position and heading.

The console never starts Jump, enters/exits a system, changes view, moves a camera, or performs a handoff merely because a destination was selected, saved, imported, or restored. Travel requires a later deliberate use of the existing exterior controls.

Scope is one station, the existing world catalog, one target-setting command, and its continuity/error tests. No scanning, discoveries, missions, new canon, new rooms/decks, new models/textures, audio, accounts, cloud saves, route simulation, or new publication is included. Other bridge stations remain non-functional scenery. No image brief is needed.

## 2. Approaches and recommendation

**A — Stage the existing chart target (recommended).** Reuse the target that the current Jump button already consumes. In chart mode, change `navigation.selection`. In a system, change `navigation.chartReturn.selection` and leave the local body selection alone. This fits the approved stationary behavior and keeps save schema/catalog version 1 and the existing IndexedDB scope.

Trade-off: setting the target replaces the prior chart selection/dossier focus. It is not a separate route plan that can coexist with a different selected chart object. The console must say this plainly. Subsequent ordinary chart selection can change the Jump target, exactly as it does today.

**B — Add independent persistent route intent.** Store a destination separately from selection and add explicit rules for priority, completion, clearing, import and old saves. This supports a later route planner, but introduces a schema/compatibility change and more exterior-control behavior. Defer it until independent route intent is actually requested.

Automatic departure is excluded by the owner's behavior choice, not offered as an implementation shortcut.

## 3. Existing-state contract

The setter accepts one existing **world ID** from the same `worlds` list used by the chart. This slice does not add moon/body targeting to the console. A previous chart moon target is displayed honestly and retained until the visitor explicitly chooses a world; it must not be silently mapped to its parent.

| Saved exterior frame | Field changed by Set destination | Fields explicitly preserved |
| --- | --- | --- |
| `chart-mly` | `navigation.selection` | Exterior pose, heading, camera, system context and phases |
| `system-1000km` | `navigation.chartReturn.selection` | Active system ID, local body `selection`, system pose/camera/phases, chart-return pose/camera |
| `navigation:null` | None; Set disabled | The complete existing snapshot; no invented exterior spawn |

The usual revision and checkpoint timestamp may advance after a successful save. Capturing the real current interior pose and sensitivity is allowed; target-setting must not teleport, rotate, or otherwise apply a new interior pose. Saved orbital phases are unchanged by this command; normal exterior simulation resumes after Return, as it already does.

When returning from the interior to a system, the visitor remains in that same system at the remembered system pose. The panel explains: “Target staged for the supercluster chart. Return to the supercluster chart before using Jump.” The visitor explicitly leaves the system through its existing Return control; the existing chart-return restore then selects the staged target while restoring the remembered chart pose/camera. Do not switch scale automatically to make Jump available.

No schema migration or new persistence field is required. Old v1 saves, previous-checkpoint recovery and JSON imports/exports retain their existing format. Selecting a destination does not add URL, command, asset-path or executable authority to a save.

## 4. Physical interaction and panel

Use the existing station ID `st_nav` and its existing `stationWorldRect` transform. The current world-space footprint is x = -9.5..-3.5 feet, z = 444.5..450.5 feet; derive it from DECK at runtime rather than duplicating those numbers in implementation. Preserve DECK and the original model/texture bytes.

Eligibility requires completed prop/collider loading, a playable non-modal walkthrough, a collision-valid player position inside the Bridge Pod, and horizontal distance of at most 6 feet from the Navigation station footprint. Compute distance to the nearest point on the rectangle, not to its center. There is no aim-cone requirement: the prompt itself identifies the station, which also supports keyboard and touch accessibility. Being close to the station through an exterior bridge wall is insufficient because the player must be inside the bridge. Do not introduce a new raycast/occlusion subsystem for this slice.

Show “E — Navigation console” and a labelled tap/click button only while eligible. Opening recomputes eligibility; an old prompt is not permission. E ignores repeat keydown and text-entry focus. The touch button has its own `pointer-events:auto` inside the pointer-transparent HUD and consumes its pointer event so it cannot steer a joystick or request scene capture. A native semantic dialog reuses the current panel styling, with labelled fields, keyboard focus, Escape/Close and a scrollable body on narrow screens.

Opening freezes movement/look, clears held keys/sticks/drag, and exits pointer lock before the dialog accepts input. Closing clears transient input again and restores focus to the interaction control when it remains eligible. It does not reacquire pointer lock or resume held movement/look. Save and console dialogs must not stack; only one session-owned interaction may be active.

The panel contains:

- Station and ship/deck identity from existing records.
- Actual exterior frame/location with explicit units: chart coordinates in Mly or system coordinates in units of 1000 km, with the existing system name/ID where applicable. Interior feet are labelled separately and never substituted for an exterior location.
- Current chart target, distinct from the selected local system body.
- Last completed local checkpoint revision/time and the current saved/unsaved/memory/conflict status. Use session/repository completion metadata, not an imported snapshot's claimed timestamp, as durability evidence. Show “No completed local checkpoint” when appropriate; do not label a stale checkpoint as a new completed save.
- A world picker whose draft choice is local UI state, **Set destination**, and **Close**. Changing the picker alone never changes the journey.

The existing Return control is used after closing the panel. There is no “Depart now” or automatic Return button in this slice.

## 5. Small component boundaries

1. **Target/catalog logic:** load the existing `expanse-data.json` from a fixed application-relative, same-origin URL over HTTP(S). Abort a request after 8 seconds, reject a response above 1 MiB before JSON parsing, and allow at most one active request. Extract at most 256 worlds with unique existing identifier strings of at most 128 characters and nonempty names of at most 256 characters; reject malformed/duplicate entries. Create a strict own-property/Map allowlist and use text content for labels. Do not duplicate or edit canon and do not accept a caller-supplied catalog URL. Check parity of the extracted world ID/name list with the chart's embedded data; other unrelated JSON fields need not be redefined by this feature. Source inspection confirmed both current lists contain the same 14 unique world IDs/names.
2. **Pure target patch:** given a validated snapshot, a world ID and the loaded allowlist, produce a fresh candidate changing only the field in section 3. Reject missing navigation, unsupported/unknown system identity, unknown target IDs and malformed snapshots. Do not normalize an invalid exterior pose into a guessed one. Existing renderer-specific validation of other-domain geometry still runs when that renderer is visited; this setter does not claim to validate unseen exterior geometry.
3. **Shared-session command and interaction ownership:** add `openNavigationConsole()` to the session's public interface at construction, before that interface is frozen. It is interior-only and rejects an existing Save/console interaction, a busy operation, unresolved save errors or unstable renderer state. It returns an opaque, session-owned controller with `readModel()`, `setChartTarget(worldId)` and `close()`; the controller cannot mutate a snapshot arbitrarily or choose a route. Acquire it only from stable/playable state, retain that pre-pause stability privately, and keep the renderer paused while it owns the dialog. The session, not DOM callers, owns serialization and persistence. Do not monkey-patch the frozen session, expose a generic snapshot setter, or use JSON import as an internal command.
4. **Interior adapter/panel:** owns proximity, the eligible prompt and the existing station's dialog presentation. It calls the shared-session operations; it does not write IndexedDB or navigate directly. Keep this logic in a small ordinary asset module where practical rather than adding another large subsystem to the embedded-model HTML.

These are design boundaries, not a mandate to create four new modules. The implementation plan should choose the smallest files/interfaces consistent with the boundaries and current classic-script loading.

## 6. Atomic save, concurrency and pause rules

Opening a console records stability before pausing; “input paused” must not be mistaken for an unsafe world transition or used as a generic bypass. A session-owned interaction lease permits only this console's narrow operations. Autosave and unrelated mutation/handoff/import/recovery operations cannot race it. The Save opener explicitly rejects an active console lease before showing its dialog, including through programmatic calls; a console opener likewise rejects the Save dialog. Closing or losing ownership invalidates the lease; every later controller call rejects that stale ownership. A successful Close clears transient input while the console still owns the pause, invalidates its controller, then releases through the session's combined pause decision. Interior/UI callers never directly unpause the adapter.

Set first claims the session's busy state **before any await**, captures the real current interior state, validates the target and candidate, and commits with the existing expected-revision CAS transaction. Keep the patched candidate private until persistence succeeds: do not run it through generic `checkpoint()`, `tick()` or import, whose existing failure behavior can retain an unsaved candidate. Recheck interaction ownership after awaited validation and immediately before starting persistence; if ownership was lost before a transaction began, discard the candidate without writing. Only a completed transaction publishes the new target as Saved. No renderer apply/teleport is needed because the exterior is not active and the interior pose is unchanged. On failure, keep the prior target and the visitor's pre-command progress; no candidate target may leak into autosave or a later Return after a failed Set. Display the actual error and leave the panel closable once the operation has settled.

Repeated clicks cannot launch parallel validators/transactions. From Set acceptance through validation and transaction completion/failure, Close is disabled, the controller's Close operation returns BUSY, and Escape/native dialog cancel is prevented. This includes the pre-transaction async-validation interval, not just the write itself. Close/Escape work again when the operation settles. Show a truthful Validating/Saving status during that interval. Do not add a UI-only timeout that reports failure while a storage transaction might still commit. The input-pause decision always includes both Save and console interaction ownership, so existing error handlers cannot accidentally unpause the walkthrough underneath the console.

Implementation clarification from an actual Chromium regression: a second Escape can produce a non-cancelable native close despite the first cancel being prevented. In that platform-forced dismissal case, retain the busy lease until the accepted command completes or fails, then perform the owned close/input-clear/release exactly once. Never claim the transaction was canceled, release it early, or leave an orphaned pause after its outcome. This is a native-visibility exception, not new travel or cancellation authority.

A conflict cannot silently overwrite another tab. Preserve the old durable record, show Conflict, and direct the visitor to close the console and use the existing Save recovery/reload workflow. Do not add a second recovery implementation to the console. Return still uses the existing awaited shared handoff and its explicit failure/continue-without-saving behavior.

## 7. Unsupported and degraded states

- **Fresh/direct interior with no exterior navigation:** the console may open to show interior/checkpoint status, but Set is disabled with “Visit the exterior chart first to establish a ship location.” No fabricated travel state.
- **Catalog loading/failure/malformed data:** keep the console read-only, preserve the old target, show a retry action, and leave movement, saves and Return usable after Close. Only one bounded catalog request may be active; Close prevents a late response from mutating a disposed panel.
- **HTTP(S) with storage denied/memory-only:** if a valid exterior snapshot and catalog exist, an explicit Set may update this page's in-memory target only. Clearly label it “This page only — export JSON before leaving.” Do not announce Saved or promise that Return transfers it. Existing warned memory handoff behavior remains authoritative.
- **Direct `file://`:** the walkthrough and current-page JSON backups remain usable. This slice does not add a file-fetch workaround or embedded duplicate catalog. If the catalog cannot load, target editing is unavailable with a clear explanation; no automatic file persistence or cross-page continuity is promised.
- **Restore errors, unresolved conflicts, warp/transit, missing props or another active modal:** no writable console interaction can be acquired. Resolve the existing error/transition first.

## 8. Acceptance gates

Tests must fail for the missing behavior before implementation and pass afterward. Retain the current look/input fixes and existing save/canon/asset regressions.

1. One real collision-safe approach to `st_nav` is reachable by normal movement from the bridge; E and touch open the same console. Out-of-range, outside-bridge, loading, repeat-key and overlapping-modal attempts do not open it. Do not accept a test that teleports into a collider.
2. Opening/closing and failed Set preserve both poses/headings and do not leak held input. New mouse, keyboard and touch gestures work after Close. Test actual browser interactions, not only source extraction.
3. A draft picker change or cancel makes no saved change. A successful chart-frame Set changes only the permitted selection plus ordinary interior capture/revision/time. It remains stationary aboard and through reload/Return.
4. A successful system-frame Set preserves local body selection, phases, system pose/camera and chart-return pose/camera. Return outside stays in-system; explicit system Return then restores chart framing with the chosen world selected. Only a deliberate existing Jump starts travel.
5. v1 current/previous checkpoints and JSON backups remain compatible. Old saves restore stationary; unknown IDs, pollution-shaped keys and foreign URLs are not accepted as console commands. Export/import includes the staged target in the existing field.
6. Injected write failure, stale-tab CAS conflict, concurrent Set, Close-during-validation/write and catalog failure never publish a false Saved target, lose pre-command progress, navigate, or unpause underneath a dialog. A deferred validator plus Escape/Close test must prove the operation cannot be dismissed before its outcome; a stale/invalidated controller cannot start a later transaction. Verify durable state after reopening storage, not just panel text.
7. Null navigation and file/memory-only behavior match section 7 without hidden state invention or cross-page promises.
8. All current catalog entries are selectable via the same canonical world IDs. No lore/model/texture/DECK changes, no new definitions to resolve the existing Karna moon ambiguity, and no route execution on restore/import.
9. Desktop and 390px touch-emulated panel fits, focus, Escape, scrolling, prompt/Save/Return hit targets and console/page-error checks pass. Physical phones, Safari/Firefox and comprehensive collision remain separate, unclaimed acceptance.

## 9. Approval and release boundary

Main owns the design, integration and evidence. Curie/Pasteur may provide source-only seam audits now; implementation ownership is assigned only after this written spec is approved and a plan exists. Dirac remains context-only. An earlier Claude save-state packet approval is not new bridge source/spec disclosure approval; keep any future external review packet bounded and obtain a specific exception if review is blocked.

Written owner approval is now recorded in coordination/OWNER-DIRECTIONS.md. Create the implementation plan, isolate build changes from the released preview, run test-first and adversarial review, and report the actual resulting commit/runtime state. No automatic push of the new feature is included.
