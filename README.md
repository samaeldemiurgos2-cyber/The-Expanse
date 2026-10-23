# The Expanse — Virgo Supercluster Chart

> **SOURCE OF TRUTH (private).** This repo is auto-mirrored to the public
> `The-Expanse` every few minutes. Push here; the mirror follows.

A navigable Three.js visualization of **The Expanse**, which *is* the Virgo Supercluster.
Fly the GAS *Ripley* through ~110 million light-years of real cosmic structure,
with the worlds of the Space Adventures / Warbrood canon pinned to it.

## View it

- **Live:** https://samaeldemiurgos2-cyber.github.io/The-Expanse/
- **Local:** open `index.html` in any modern browser. No build step, no server.

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
Opening Save, losing focus, or reloading clears held input. Start a new gesture
after resuming.

## Local journey saves

**Save** in the chart and interior opens Save now, JSON backup/import and recovery
controls. Reload resumes stationary; settled-system Board and Return preserve the
exterior/interior journey. Saves are browser/profile/origin/base-path local, not
cloud sync. See [local save behavior and recovery](docs/local-saves.md).

## Retconning

All content lives in one JSON block — the **RETcon ZONE** — at the top of
`index.html` (`<script type="application/json" id="expanse-data">`).
The engine reads that block and nothing else for content.

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

