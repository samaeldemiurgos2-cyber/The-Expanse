# The Expanse — Virgo Supercluster Chart

> **SOURCE OF TRUTH (private).** Files are automatically mirrored to
> `The-Expanse` through separate public commits. Pages excludes development
> documentation, tests and tools from the website.

A navigable Three.js visualization of **The Expanse**, which *is* the Virgo Supercluster.
Fly the GAS *Ripley* through ~110 million light-years of real cosmic structure,
with the worlds of the Space Adventures / Warbrood canon pinned to it.

## View it

- **Live:** https://samaeldemiurgos2-cyber.github.io/The-Expanse/
- **Scale Preview:** https://samaeldemiurgos2-cyber.github.io/The-Expanse/scale/
- **Local:** open `index.html` in any modern browser. No build step, no server.

The separate Scale Preview demonstrates the 312 m working Ripley reference,
nominal compressed system distances, Maneuver/Cruise, braking and chase/overview
views. It does not save progress or provide boarding. Open it directly or from
the main chart's **?** briefing. The main app retains its existing journey flows.

Keep the repository's `assets/` folder alongside the pages. Direct-file viewing uses
memory-only journey state; serve over HTTP(S) for automatic local save/resume.

## Controls

| Desktop | Phone |
|---|---|
| `W A S D` thrust, mouse-drag look | Left thumb: virtual joystick · Right thumb: drag to steer |
| Click a pin → dossier · `JUMP` button warps to it | Tap a pin → dossier · `JUMP` warps |

Inside Ripley, use `W A S D` / arrows to move. In non-touch desktop layouts, click
the scene for captured-mouse look (`Esc` releases). Hold the primary mouse button
and drag to look in any layout, including when capture is unavailable. On the
LOOK stick, hold off-center to keep turning; release to stop.
Opening Save or the navigation console, losing focus, or reloading clears held
input. Start a new gesture after resuming.

## Local journey saves

**Save** in the chart and interior opens Save now, JSON backup/import and recovery
controls. Reload resumes stationary; settled-system Board and Return preserve the
exterior/interior journey. Saves are browser/profile/origin/base-path local, not
cloud sync. See [local save behavior and recovery](docs/local-saves.md).

## Bridge navigation console

Board from the exterior chart to establish the ship's exterior location. Inside
Ripley, approach the existing Navigation station in the Bridge Pod, then press
`E` or tap **Navigation console**. The prompt appears within six feet of its
footprint, from a collision-valid position inside the bridge.

Inspect exterior coordinates, interior feet, the current chart target and the
last completed local checkpoint. Choose an existing world and press **Set
destination**. Changing the picker alone does nothing. Setting a destination
replaces chart selection/dossier focus; it does not move the ship or start Jump.

Close the console and use the existing **Return to chart** control. If the ship
was in a stellar system, it returns to that same system first; use its existing
Return control to reach the supercluster chart, then activate **Jump** deliberately.
Both saved poses, headings and cameras are retained.

Direct interior starts without exterior navigation are read-only until the chart
has established that location. The catalog requires same-origin HTTP(S), so
direct-file console editing is unavailable. With browser storage unavailable,
an explicit HTTP console change is this-page-only: close the panel and export
JSON before leaving. No automatic memory-only cross-page transfer is promised.

## Sensors and visitor survey

Use the existing Micqui-Nobara dossier to enter Karna Vex, then fly closer with
the ordinary controls. Arrival is outside the survey band. Stop with Space,
board Ripley, and approach **Ops** in the Bridge Pod. Press `E` or tap **Sensors**,
then choose **Record survey**. The closest of Navigation and Ops owns the prompt.

Sensors uses the actual exterior position and orbital phases saved when boarding.
For this first target, permitted surface clearance is greater than zero and no
more than 12 scene units (twice its rendered radius). These are compressed
gameplay distances. Selecting a destination does not grant survey eligibility.

One visitor observation is retained with the journey and shown separately in
Micqui-Nobara's dossier. Reopening or repeating does not replace its original
timestamp. Browser-local storage and JSON backups preserve it; imports, recovery
and New journey replace progress rather than combining records. Existing version1
backups remain importable, with no survey record. See [save boundaries](docs/local-saves.md).

If storage fails, close Sensors and choose **Save → Use memory only** before
recording a page-only observation, or retry storage. An incompatible Karna Vex
catalog disables new recording while preserving existing visitor records.

## Retconning

All content lives in one JSON block — the **RETcon ZONE** — at the top of
`index.html` (`<script type="application/json" id="expanse-data">`).
The chart reads that block for content. The bridge console reads the matching
standalone `expanse-data.json` over same-origin HTTP(S); keep world IDs/names and
the system index synchronized. `tests/navigation-target.test.cjs` checks catalog
parity. Journey saves cannot introduce new canon or catalog identities.

- `expanse-data.json` is a standalone copy of the same block, for convenient
  editing. After editing it, paste it back into the DATA block in `index.html`
  (replacing everything between the script tags) and reload.
- Add worlds, move anchors, change a system to binary, extend lore —
  no code changes needed.

## Data provenance

- **Group centers (17):** published catalog positions (Wikipedia, Atlas of the
  Universe, NED/SIMBAD). Labeled "Catalog group" in the chart.
- **Virgo Cluster core:** 160 real galaxies transcribed from the Atlas of the
  Universe table (J2000 RA/Dec, morphology, magnitude).
- **Remaining member clouds:** illustrative samples around published centers,
  labeled as such in the chart footer and help → Field notes.
- **Worlds, moons, routes:** Samael's canon. Travel times are in-universe
  (Evergreen Planet 3h · Lexor-Aurex Prime 12h · Myxan home world ~1 day ·
  Ugat station run 1h).

Canon pins: **Lexor-Aurex Prime** at the Virgo Cluster core (M87) — seat of the
Galactic Authority. **Karna Vex** peripheral — the throneworld in exile,
"The Ash Cluster," with its seven moons + Micqui-Nobara.

