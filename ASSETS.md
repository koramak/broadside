# ASSETS.md — provenance log

Every asset shipped with the game is listed here with source and license.
Everything must be CC0 or equivalently safe for commercial use (CLAUDE.md).

## 3D models

| Asset | Files | Source | License |
|---|---|---|---|
| Kenney Pirate Kit (complete, GLB format + colormap.png) | `public/assets/pirate-kit/*.glb`, `colormap.png` | [kenney.nl/assets/pirate-kit](https://kenney.nl/assets/pirate-kit) by Kenney (kenney.nl). Retrieved 2026-06-12 via GitHub mirror `daedalus2012/pirate-assets` (file set matches the official kit). | CC0 1.0 Universal |

Notes:
- The Pirate Kit ships used: `ship-small/medium/large` (naval/merchant livery),
  `ship-pirate-small/medium/large` (player livery), `ship-ghost` (late-game),
  `ship-wreck`, plus rocks, palms, flags, towers, and dock pieces for scenery.
- Kenney assets require no attribution, but we credit anyway: "Pirate Kit by Kenney (kenney.nl), CC0".

## Audio

Procedurally synthesized in-engine (WebAudio noise bursts) — no external files yet.
Planned: Kenney audio packs (CC0) in Milestone 6 — log them here when added.

## Fonts

System fonts only (Georgia / Courier New stacks). No bundled font files.

## Music

- **"Folk Round"** and **"Master of the Feast"** — Kevin MacLeod (incompetech.com)
  - Files: `public/assets/music/folk-round.mp3`, `public/assets/music/master-of-the-feast.mp3`
  - License: Creative Commons **CC BY 4.0** (attribution required — keep this credit in any release):
    > "Folk Round", "Master of the Feast" — Kevin MacLeod (incompetech.com).
    > Licensed under Creative Commons: By Attribution 4.0 — http://creativecommons.org/licenses/by/4.0/
  - Downloaded 2026-06-12 from incompetech.com.

## Combat SFX (src/audio.ts)

Cannon fire, timber hits, splashes, and the boarding station ticks are
**procedurally synthesized** (Web Audio) — original, no third-party assets, no
license encumbrance. An optional sample-override slot lives at
`public/assets/sfx/` (`cannon.mp3` / `hit.mp3` / `splash.mp3`): drop genuinely
CC0 files there and they layer over the synth automatically. None are bundled
yet — sourcing verified-CC0 cannon samples by direct fetch wasn't reliable, so
the synth ships as the default. Log any sample added here with its source + CC0
license.
