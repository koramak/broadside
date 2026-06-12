# BROADSIDE (working title)

A naval combat and armada-building roguelite in a hand-carved diorama sea.
Spiritual ancestor: Sid Meier's Pirates! ship combat — rebuilt around the
fleet game it never had, with a trading archipelago to cross and something
patient waiting in the east of it.

**Wind is the whole game.** Every system routes through point of sail and
positioning. Committed turns, shot that lands where it was aimed, telegraphed
intent. Late in a run, things arrive that break the rules you have learned.

## Play

- `npm install && npm run dev` — then open the printed URL.
- `npm run build` produces a static `dist/` (deployed to GitHub Pages by
  `.github/workflows/deploy.yml` on every push to main).

Keyboard: A/D steer · W/S sails · 1-3 ammo · Q/E fire · F signal · G order ·
Tab take helm · B board/dock · Esc menu. Touch controls are on-screen.

## The run

Six escalating actions across the chart to THE PLATE SHIP, with free sailing,
trading (buy west, sell east), faction heat, optional prizes, and port calls
between them. Prizes can be crewed into your armada (max 2 consorts), stripped
for refits, or sold. Damage persists; repairs cost stores; death ends the run.
After the Plate Ship strikes, the Mist opens. Bring your whole armada.

## Architecture

- `src/sim/` — deterministic fixed-timestep simulation. Zero Three.js imports,
  seeded RNG, event queue out. This is the contract that keeps the game
  portable (web → Steam → mobile) and testable.
- `src/render/` — Three.js diorama: oblique Pirates! camera, GPU-displaced
  flat-shaded sea, Kenney Pirate Kit hulls (CC0 — see ASSETS.md).
- `src/ui/` — plain HTML/CSS overlay (parchment/ink/gold/rust).
- `reference/` — the original single-file prototypes. The slice is canon for
  tuning; both boarding prototypes live here pending the playtest verdict.

Playtest dials (ball speed / reload / rake) live in the pause menu; their
defaults are the locked slice values.
