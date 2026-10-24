# Local journey saves

The chart, stellar systems and Ripley Deck 1 share one browser-local journey. Use **Save** to open the save panel. The existing interior **Export** command still exports geometry as GLB; **Export JSON** in Save exports your journey instead.

## Resume

Automatic checkpoints run no more often than every two seconds while the renderer is stable. Save now requests an immediate checkpoint. Board and Return wait for a completed checkpoint before changing pages. Half-finished warp and scale transitions are not saved. Keep a JSON backup; browser transaction completion is not a guarantee against all power/device failures.

Reload restores the page you opened. Opening the chart deliberately restores the exterior, even if the last visited page was the interior. Exterior navigation remembers chart/system units, ship location and heading, camera framing, selection, orbital phases and the independent chart-return pose. The interior remembers its position, view and sensitivity after prop colliders are ready.

Resume is intentionally stationary. Momentum, held keys, joystick input, pointer lock, temporary look offsets and free-camera control reset. Time spent with the exterior page closed or aboard the ship does not advance its orbital simulation. Visual effects do not promise identical pixels.

## Backups and replacement

Export JSON downloads a versioned data-only backup. Import JSON accepts backups up to 256 KiB, validates their structure and active renderer references/geometry, then asks before replacing progress. Cancel to export your current progress first. Invalid imports must not overwrite a good checkpoint. Import applies only the current page's renderer; other-domain data is retained for its renderer to validate when visited. It cannot choose a URL, asset, command or executable content.

New journey requires confirmation and replaces only this application's save. One previous valid checkpoint is retained for explicit recovery. Export original preserves the raw stored record if it is corrupt or from an unsupported version. Version1 journey payloads normalize to version2 in memory without changing their pose, revision or saved time. The next ordinary checkpoint writes version2; opening the upgraded database does not rewrite its payloads. An older app cannot write through the version2 database fence.

Version2 adds one optional Micqui-Nobara visitor survey. A completed local recording survives ordinary checkpoints, reload and Board/Return. Recording again retains its first timestamp. Import, previous-checkpoint recovery and New journey replace the entire record with the chosen journey's value. Importing a version1 backup therefore clears a current survey, with a warning. Export before replacing progress if you want to keep it.

An unsupported/corrupt restore opens the recovery dialog visibly and keeps movement paused. If non-JSON structured-clone values prevent ordinary JSON export, Export original uses tagged diagnostic JSON; that diagnostic is not an importable journey backup. Before replacing an unreadable original, the confirmation warns that it will be permanently replaced and offers cancellation for export.

## Storage boundaries and failures

Automatic persistence targets HTTP(S), including the local preview. Saves belong to the browser/profile, origin (including port) and application base path. Changing any of those may show a separate journey. Use JSON export/import to transfer between them. This is not cloud sync, an upload, or an account system. Clearing site data/private browsing can discard progress.

Direct `file://` pages use labelled **Memory only** mode. They still render and support current-page JSON backups, but automatic file persistence and cross-page continuity are not promised. If storage is denied, unavailable or full, old durable data is not intentionally erased; export the unsaved progress and use Retry. Failed handoffs stay on the current page. Continue without saving is a separate warned choice that can lose cross-page progress.

Two tabs must not silently overwrite each other: every transaction compares the loaded revision. On Conflict, export the stale tab's progress, then use Retry / reload saved or reload the page before choosing what to keep. There is no automatic last-writer-wins merge.

Conflict backups capture current live progress, including changes since the conflict. Use memory only never changes pages; Continue without saving is a distinct warned action for the current failed handoff. Closing that dialog or completing a checkpoint cancels the stale handoff target.

## Scope

These records are visitor state, not canon. They do not alter world definitions, source documents, model assets or lore. Navigation stages existing destinations, and Sensors at Ops records one explicit Micqui-Nobara observation from an eligible boarding context. Catalog facts remain separate from that observation. Surveys add no new lore, instrument measurements, decks, accounts or cloud service. Initial acceptance is Chromium desktop and mobile emulation; physical devices, Safari/Firefox and comprehensive collision coverage remain separate checks.

Sensors reports whether its specific record is in a completed local checkpoint; an older checkpoint timestamp alone does not prove that a newly imported or page-only record is durable. A failed durable recording retains the preceding record. Storage failure alone does not authorize a page-only survey: close Sensors and choose **Save → Use memory only**, or retry storage. After that explicit memory choice, recording over HTTP can create a page-only record; close Sensors and export JSON before leaving. Direct-file Sensors remains read-only and cannot fetch its catalog or create a record.

A validation error keeps console editing unavailable until existing Save controls resolve it. After closing Sensors, **Save now** can validate and checkpoint the unchanged pose again; **Retry / reload saved** restores the durable journey. Conflicts still require the existing recovery flow before mutation.

## Regression checks

Run pure/contract tests from the repository root:

```powershell
node --test tests/*.test.cjs
```

Browser function files under `tests/` run with Playwright CLI against a static HTTP server at `http://127.0.0.1:4318/`. Start a loopback-only server from the repository root in a separate terminal (requires Python 3; any equivalent static server works):

```powershell
python -m http.server 4318 --bind 127.0.0.1
```

Then, from the repository root in another terminal:

```powershell
npx -y @playwright/cli -s=expanse-qa open http://127.0.0.1:4318/tests/save-harness.html
npx -y @playwright/cli -s=expanse-qa run-code --filename tests/save-journey.browser.js
npx -y @playwright/cli -s=expanse-qa run-code --filename tests/save-catalog.browser.js
```

The direct-file test needs the actual checkout directory as a `fileBase` query parameter on the runner's open page. In PowerShell, generate that URL from the current repository root instead of hard-coding a machine path:

```powershell
$expanseFileBase = ([uri]((Resolve-Path .).Path + [IO.Path]::DirectorySeparatorChar)).AbsoluteUri
$expanseHarness = 'http://127.0.0.1:4318/tests/save-harness.html?fileBase=' + [uri]::EscapeDataString($expanseFileBase)
npx -y @playwright/cli -s=expanse-qa goto $expanseHarness
npx -y @playwright/cli -s=expanse-qa run-code --filename tests/save-file.browser.js
```

Only run these tests against an isolated browser session/profile, not a profile containing a journey you want to keep. The file URL is test-runner input only; the application does not read this parameter or use it as a return destination.

The catalog test covers every current system at both quality levels. Failure tests use isolated app paths/browser contexts and explicit injected storage/prop failures. The profile write/read pair must be separated by a genuine close/reopen of the same isolated persistent test profile; a new incognito context is not a persistence substitute. Keep test profiles outside the repository. Tests do not approve new canon or physical-device compatibility.
