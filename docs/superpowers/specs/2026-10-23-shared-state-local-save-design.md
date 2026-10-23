# Shared state and local save/resume — approved design

Date: 2026-10-23. Status: approved by owner: "Approve the design and proceed". Implementation planning and build are authorized within the boundaries below; implementation acceptance remains separate.

Repair checkpoint: `f3bac0d8e57e09708ad8870c690837da9af9aad9`. This design continues the owner's approved shared-state/local-save direction, not the whole KV-01 discovery milestone.

## 1. Goal and boundaries

The chart, system view and Ripley Deck1 must preserve one visitor's navigation and interior progress across reloads and boarding/return. Include local automatic checkpoints and portable JSON export/import. Retain the static site/no build architecture and existing artwork, canon data and movement controls.

Not included: accounts/cloud sync, multiplayer, scanning/bridge-console mechanics, new discoveries/lore/missions, offline travel simulation, new decks, public deployment or pushing Git commits. No save may modify canonical definitions. Later discovery work will extend the schema through an explicit migration.

The two pages remain separate renderer adapters. This is not a rewrite into a single-page application.

## 2. Persistence approaches considered

1. **Recommended: one versioned JSON record in IndexedDB.** Native asynchronous transactions allow read/check/write of revisions without stale tabs silently replacing a newer record. More adapter code than Web Storage, but no dependencies/server/accounts.
2. **localStorage JSON.** Simpler for a small snapshot and synchronous handoff writes, but synchronous I/O and no native read-modify-write transaction make concurrency/error handling less clean.
3. **Backend/account saves.** Enables automatic cross-device sync but adds deployment, identity and privacy obligations outside this batch. Defer.

IndexedDB transactions are asynchronous and same-store write transactions can serialize read/check/write work. A transaction completion is the browser API's completion signal, not a guarantee against every device/power/storage failure. Exported backups remain necessary. Sources: [IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

## 3. Supported environments and compatibility

- Reliable automatic cross-page saving targets HTTP(S), including the current loopback preview and the project's hosted subdirectory. Origin and normalized application-base path scope the database, so unrelated apps on the same origin do not share a record.
- `file://` and unavailable/denied storage use an explicitly labelled memory-only mode. Current-page JSON export/import remains available; automatic persistence and cross-page continuity are not promised there. The existing chart/walkthrough still render. Direct-file return/board paths use explicit index.html files rather than directory listings.
- Browser storage is not cloud storage. Changing host, scheme, port, browser/profile or project-base path can expose a different save; manual export/import is the transfer route. Private browsing and site-data removal can lose saves. [Web Storage origin/file behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) is not a portable file-sharing contract.
- Keep script integration compatible with classic scripts: shared state/UI assets loaded relatively by both HTML files, with a Node-testable pure core. No bundler/framework or CDN dependency is introduced.

## 4. One authoritative record, two adapters

One in-memory store owns a validated plain-data snapshot for the loaded page; one transactional durable current record carries it between pages. Adapters project their live renderer state into their owned domain and apply restored data through explicit capture/validate/apply boundaries. An adapter must preserve the unloaded page's domain, not rebuild the entire record from its own defaults.

Storage has one `current` record plus at most one `previous` valid snapshot for recovery. `previous` is a recovery copy, not another authoritative universe. A checkpoint transaction checks the expected revision, preserves the preceding valid current record, writes the new current record, and advances its revision atomically. A stale revision aborts rather than overwriting another tab.

Proposed schema fields:

| Domain | Persisted data |
| --- | --- |
| Envelope | Fixed format `the-expanse/save`, schemaVersion1, independent runtimeCatalogVersion1, revision, savedAt, lastView |
| Navigation | Coordinate frame `chart-mly` or `system-1000km`, current parent-world/system ID, finite ship position/yaw/pitch, selected world/body reference, camera controls |
| Chart return | Separate chart-frame pose, selection and camera controls when navigation is in system mode |
| Active system continuity | Bounded numeric orbital phase records keyed by validated runtime body identity, needed to rebuild the saved spatial situation |
| Interior | Runtime deck ID `gas-ripley/deck-1`, feet-based x/z and yaw/pitch; parent room ID as a validation hint |
| Preferences | Quality high/low and walkthrough sensitivity within its existing range |

No Three.js instances, geometry, GLBs, textures, DOM, input state, source JSON/lore, URL, asset path, arbitrary script or freeform HTML is serialized. Deck/runtime body identifiers are engine identifiers, not newly established canon facts.

World and moon references use current data IDs. Existing `p<index>` companion keys are not promoted into durable canon IDs: a runtime identity registry qualifies companion identity by parent world and existing deterministic seed, and its compatibility version changes if that mapping changes. Stars/featured objects have typed parent-qualified IDs. Resolve IDs through the active catalog before applying state; names are never keys. Existing data IDs and canon content are not rewritten.

The record is small: maximum canonical snapshot/export256KiB; import input256KiB before parsing. IDs have at most128 ASCII identifier characters, orbit-phase maps at most128 entries, general vectors exactly their specified2/3 components, and all numbers must be finite. Coordinate components are limited to absolute1e9 in their tagged native units, then validated for the active renderer/geometry. Capture normalizes periodic angles before encoding; pitch and camera controls must satisfy the existing mode-specific control ranges. No freeform user-content fields are accepted. Field validators reconstruct allowlisted objects rather than copying unknown properties; the implementation plan must enumerate those field-level validators and tests.

## 5. What resume means

- Restore the current URL's renderer. Reloading the interior restores the interior; opening the chart URL intentionally opens the chart with saved navigation. Do not silently redirect a manually opened chart into another page. `lastView` informs explicit resume/import actions, not an automatic startup redirect loop.
- Preserve ship location, heading, selected object and chase/orbit framing. Restore stationary: ship velocity, live controls, free-camera-control mode and temporary look offsets reset to safe neutral values. Do not resume held thrust/warp. This safety normalization is intentional and must be visible in documentation/tests.
- Preserve the chart-return pose **and camera controls**, extending the current narrower sysReturn snapshot, so returning from a saved system restores the right coordinate frame and framing.
- Rebuild scenes from existing definitions; apply saved orbital phases before ship/camera placement. Do not advance the simulation by time spent with the page closed or while the exterior page is unloaded aboard the ship. Shader/particle/spin effects need not reproduce pixel-for-pixel.
- Preserve the interior position and view; derive compartment/station labels using existing geometry rather than trusting an imported display label. Do not persist the temporary room-jump override as a second location authority.
- Preferences persist, while search text, dialogs, toast timers, pointer lock, joystick/key state, map pan/zoom/open state and export-in-progress state reset.

## 6. Capture and restore lifecycle

Chart stable-state predicate requires no `ship_state.warping`, no `sysTransit`, no boarding/restore/import operation, and the expected scene/system identity actually installed. `sysSettle()` alone is insufficient. During transitions retain the preceding stable checkpoint; never save a half-swapped scene.

Startup order:

1. Load/validate the record without writes. No record means normal fresh defaults. Unsupported/corrupt data must not be replaced by autosaving the default spawn.
2. Initialize definitions and the persistence adapter. Keep flight/movement disabled until restore has resolved or explicit fresh/memory-only behavior is chosen; the existing loading UI may cover intermediate renderer setup.
3. Apply quality, establish the requested chart/system scene, resolve stable IDs and rebuild the required system. Restore orbital phases, validated chart-return state, then ship pose and camera controls, then selection/UI. Initialization's normal arrival pose must not overwrite the restored pose.
4. In the walkthrough, wait for geometry **and prop colliders** before validating/applying a saved position. The current frame loop starts before asynchronous loadProps finishes; do not assume early room geometry proves a pose is safe among props.
5. Apply one coherent snapshot, clear inputs/pointer lock/jump overrides, synchronize transforms/lastPos/frame timestamp and mark rendering dirty. Only then enable autosave and interactive movement.

A structurally valid but spatially invalid pose is not silently clamped into a different room or system. Keep the saved data and last valid checkpoint, explain the failure, and offer explicit recovery to the normal safe start or import of a backup. Autosave waits for that recovery choice. Inactive-domain poses are validated by their own adapter before use.

## 7. Boarding and return

Recommended scope addition within this state handoff: enable Board in **settled chart and system views**, still blocked during warp/scale transit/restore. This makes the existing system/interior journey testable without adding a functional bridge console. It is a view handoff, not a new docking simulation.

- Before Board: freeze inputs, capture the full exterior state (including system/return context), update lastView, and await the durable transaction. Then navigate to the project's fixed Deck1 route; the interior preserves the exterior domain and restores its own remembered pose.
- Before Return: capture interior pose/preferences, preserve exterior context, await the durable transaction, then open the fixed chart entry. The chart restores its saved chart/system frame and location rather than spawning at the Milky Way.
- A failed checkpoint does not silently navigate and claim continuity. Remain on the current page with an actionable error; offer export/retry or an explicit continue-without-saving choice that warns cross-page progress may be lost.
- Return targets are resolved against the known application base. An imported save cannot contain a destination. Existing return query values may only resolve to the same app's chart entry; external/other-app destinations fall back safely. Do not put snapshots or private progress into URLs.

## 8. Checkpoints, UI and backups

- Autosave at most once every2seconds while dirty and stable, not once per animation frame. Capture changes to the active domain in memory; serialize only at checkpoint. Checkpoint immediately after completed stable transitions and before Board/Return. Page visibility/pagehide is best-effort supplementary handling, not the only save mechanism or a guaranteed async unload flush.
- Add a compact Save control to the chart toolbar and walkthrough controls. It opens a small keyboard/touch-accessible panel with Save now, Export JSON, Import JSON and New journey/recovery actions. Preserve GLB geometry Export as a distinct existing command. No visual redesign is proposed.
- Announce Loading/Saving/Saved at time/Unsaved/Memory only/Conflict/Error through a polite status region; a failed write must never display Saved. The measured HUD clearance already in the repaired chart must handle this additional control.
- Export validates the live coherent snapshot and downloads JSON, never HTML or geometry. It works without durable storage and is the portable backup, not an automatic upload.
- Import: enforce size first, parse as data, whitelist/reconstruct the schema, validate version/IDs/numbers and active-adapter geometry, show an explicit replace confirmation and offer export of the current progress. Pause controls while applying; prepare a reversible live-state apply and rollback it if the durable transaction fails, so failed validation/commit cannot leave a partial replacement. Notify successful resume only after both adapter apply and durable commit succeed. Imported revisions are not trusted as local concurrency tokens.
- With working persistence, explicit Import/resume may use only a fixed whitelisted view route after successful commit. In memory-only/file mode, apply only to the current renderer and clearly explain that cross-page resume is unavailable.
- New journey/recovery requires an explicit confirmation, offers backup first, and affects only this application's save records—not unrelated browser storage.

## 9. Failures and multiple tabs

- Denied/unavailable/full storage: keep the world usable in labelled memory-only mode, preserving old durable data; offer retry/export. Do not present a successful browser API call as a physical-disk durability guarantee.
- Malformed/unsupported record: do not overwrite it, do not guess migrations and do not erase it silently. Offer export of the original stored record and explicit recovery from the previous valid record or new journey. Future schemas fail closed until a tested migration exists.
- Validate and build fresh objects, never merge untrusted properties into prototypes or render imported fields with innerHTML. Imports have no URL/command/asset authority.
- Every write compares a local expected revision inside one IndexedDB readwrite transaction. A stale tab becomes unsaved/conflicted and must reload or export its own progress before an explicit replacement decision. No automatic last-writer-wins. Cross-tab notifications may improve promptness but transaction checks enforce the rule.
- Retain one previous valid checkpoint across normal writes/imports so the most recent replacement can be recovered. Recovery is explicit and revision-checked too.

## 10. Acceptance and regression gates

Test-first implementation plan must cover:

1. Pure schema/ID validation and serialization round trips, finite-number/range checks, malformed/oversized/future-version imports, pollution-shaped properties and invalid enums/IDs. Rejection preserves live and durable states.
2. Real browser IndexedDB persistence across page reload/new context in the same persistent profile, atomic revision conflicts from two tabs, failed/quota/denied storage and correct status messaging. Do not substitute only an in-memory mock for persistence proof.
3. Chart position/heading, quality, selection and chase/orbit controls survive reload. No active input or momentum resumes.
4. Karna Vex system pose, orbital configuration, selected stable body and chart-return state survive reload with no coordinate-frame mixing or default-arrival overwrite.
5. Board from a settled system, move to the bridge, reload the interior, Return to the same system location, then return to the remembered chart pose. Preserve interior state on subsequent boarding.
6. Save during warp/scale transit retains a preceding stable checkpoint; interrupted or failed handoffs do not create half-scene records or success messages.
7. Export/import restores approved v1 progress without adding lore. Invalid/incompatible/spatially unsafe snapshots cannot move the player outside valid geometry or overwrite a good checkpoint without an explicit recovery choice.
8. Existing repair suites remain green: desktop Index/telemetry, responsive toolbar/HUD, map pan/zoom, all original model/texture/canon invariants, walkthrough controls and routing.
9. Current-page export/import and clear memory-only messaging for file/blocked-storage mode; do not claim file cross-page autosaves.

Initial runtime acceptance remains Chromium desktop/mobile emulation plus direct-file fallback checks. Physical-device/Safari/collision-wide acceptance is a separate QA decision, not implied by a passing subset.

## 11. Scope/ambiguity self-review

- Chosen persistence, ownership, routes, save conditions, neutral-velocity policy, stable identity/versioning, storage failures, import confirmation and conflict policy are specified above.
- Companion/deck IDs are runtime identifiers; canon is untouched. No discovery is fabricated to demonstrate a save.
- Prop-collider readiness takes precedence over the walkthrough audit's early-frame restore suggestion. Current browser architecture does not yet implement any of these behaviors.
- The owner must review this written design—particularly IndexedDB, stationary resume, enabling settled-system boarding and the file-mode limitation—before an implementation plan/runtime edits. Then split work into pure state/storage, chart adapter and walkthrough adapter with disjoint write scopes and regression-first verification.
