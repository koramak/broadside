# CLAUDE.md — BROADSIDE (working title)

This file is the project memory: locked design canon + turn-1 orientation. Read it fully before any work. The pillars / art / locked mechanics here are LOCKED unless the human explicitly reopens them. Live design *state* (what's working, what's next, open decisions) lives in **DESIGN.md** — read that too. The reference prototypes in /reference are the source of truth for ported sim feel and tuning.

## Orientation (read first)

One-liner: wind-driven naval-combat + armada-building roguelite in a hand-carved diorama sea; historical pirates early, ghosts/monsters in the Mist late. Web-first (Vite + TS + Three.js).

**LIVE:** https://koramak.github.io/broadside/ (GitHub Pages, repo `koramak/broadside`). Every push to `main` auto-deploys (~50s via Actions).

**Run / build (Node is NOT on PATH):**
```
export PATH="$HOME/.local/node-toolchain/node-v22.16.0-darwin-arm64/bin:$PATH"
npm run dev      # Vite dev server, port 5173
npm run build    # tsc --noEmit + vite build  (the only "test" — there is no test suite)
```
(`.claude/settings.json` sets this PATH for future sessions; `PLAY.command` is a double-click launcher for the non-coder human. `gh` CLI lives at `~/.local/gh-cli/gh_2.94.0_macOS_arm64/bin/gh`, authed with `workflow` scope.)

**Debug handle:** `window.__broadside` exposes `{ run, world, battle, mode, freeze(b), stepMany(n), stepMap(n), startRun(), handleBattleOutcome() }` for headless verification. The preview throttles rAF when hidden — take a screenshot to pump frames. Corsair-doctrine AI beats naive test bots; that's the game's teeth, not a regression.

**File map**
- `src/main.ts` — entry: fixed-timestep loop, mode machine (`map`/`battle`/`port`/`aftermath`), input wiring, sim-event drain, overlay toggles (Captain's Log `L`, big map `M`).
- `src/input/input.ts` — keyboard + touch → high-level actions.
- `src/audio.ts` — procedural synth (cannon/woodHit/splash + per-station boarding ticks) + music player + optional CC0 sample slot (`public/assets/sfx/`).
- `src/sim/` — **deterministic, ZERO Three.js imports, seeded RNG, fixed 60 Hz.** Portable/testable core.
  - `constants.ts` locked tuning (classes, ammo, doctrines, ESCALATION, prize values) · `types.ts` RunState/Ship/Rumor · `math.ts` + `rng.ts` (mulberry32) pure helpers
  - `physics.ts` shared sailing (wind curve, committed turn, rowing floor, pace amp) — used by battle AND map
  - `battle.ts` arena sim (gunnery, straddle aim, AI doctrines, damage/rake, boarding entry, battleWon, rep + ship's-log calls)
  - `boarding.ts` tap-timing station deck-fight · `boardingConfig.ts` ALL boarding FEEL dials
  - `run.ts` meta-layer: flagship persistence, stores, armada (+replaceConsort), prizes, `applyKillRep`, `rollPrizeLog`, `chronicle`, harbor ops, chandler
  - `economy.ts` goods/pricing/`refreshRumors` · `world.ts` sea-map sim (contacts, crates, docking, encounters, shipwrecks, consort formation)
  - `worldgen.ts` authored archipelago (islands, 6 ports + 2 secret, factions, story marks, Mist waves, `knownPorts`) · `objectives.ts` guided tutorial chain + tutorial-wind rig
  - `events.ts` sim→frontend queue · `easing.ts` testing-difficulty switch · `tuning.ts` pause-menu combat dials
- `src/render/` — reads sim, owns Three.js. `renderer.ts` SceneShell (oblique camera + boarding focus-glide, GPU sea shader, Mist mood) · `shipView.ts` per-ship meshes/damage/rings (×2 visual scale) · `worldView.ts` map scene (islands, ports+nameplates, objective marker, contacts, consorts, crates, Mist wall) · `models.ts` Kenney GLB loader + name mapping · `effects.ts` smoke/impact/splash/wake/ball tracers.
- `src/ui/` — HTML overlay. `hud.ts` battle+map HUD, boarding station panel, Captain's Log render · `harbor.ts` between-action prize/refit/swap screen · `port.ts` docked screen (market/yard/chandler/tavern) · `minimap.ts` small chart + `BigMap` · `ui.css` parchment/ink/gold/rust.
- `index.html` — all DOM overlays. `reference/` — original HTML prototypes (slice = sim port source).

**Conventions** — see Working agreements at the bottom. Most important: `sim/` never imports Three; any tuning/input change is a `FEEL:` commit + tell the human; `main` stays playable; no localStorage without an export path.

## What this game is

A naval combat and armada-building roguelite. Spiritual ancestor: Sid Meier's Pirates! ship combat, rebuilt with the fleet game it never had. Player starts grounded and historical; late-game rare ships break the rules of the wind system the player has internalized. Targets: web first, then Steam (Tauri/Electron), iOS/Android (Capacitor).

## Pillars (test every feature against these)

1. Wind is the whole game. Every system routes through point of sail and positioning.
2. Committed decisions, readable consequences. Committed turns, shot that lands where aimed, telegraphed enemy intent. Skill = reading and timing. Never twitch.
3. The armada is the progression. Captured hulls + a roster of captains with personalities ("build a team that fits your system").
4. Realism that earns its magic. Supernatural arrives late, rare, and rule-breaking.

## Art direction: THE DIORAMA COME TO LIFE

A craftsman's miniature world made playable. Materials language: carved painted wood hulls, cloth sails, sculpted resin sea with ridged swells, cotton-wool smoke, cellophane fire. Damage = a damaged model (chipped paint, snapped dowel masts). Rare ships are made of the wrong materials (driftwood and bone, bottle glass, black pearl).

Camera: oblique Pirates!-style angle, roughly 50–60 degrees from horizontal, slight perspective, gentle follow of the player ship. NOT top-down, NOT horizon-level.

Primary asset source: Kenney Pirate Kit (kenney.nl/assets/pirate-kit) — 70 3D models, CC0. Also useful: Kenney Watercraft Pack, Kenney Pirate Pack (2D, for UI icons), Kenney fonts/UI packs, KayKit and Quaternius (CC0 3D), ambientCG (CC0 textures). Everything must be CC0 or equivalently safe for commercial use; log every asset source in ASSETS.md.

## Tech stack

- Vite + TypeScript + Three.js. No heavy framework for game logic.
- Strict sim/render separation: the simulation is deterministic, fixed-timestep, and has zero Three.js imports. Render layer reads sim state. This is non-negotiable — it is what makes the codebase portable and testable.
- The sim logic already exists in JavaScript inside /reference/broadside-slice.html (ship physics, gunnery, AI, damage, run meta-layer). Port it, don't reinvent it. Keep the tuning constants identical at first.
- UI overlay: plain HTML/CSS over the canvas (the prototypes' approach worked well). Game UI aesthetic: parchment/ink/gold/rust palette already established in prototypes.
- Deploy: GitHub Pages via Actions on every push to main. The game must be playable at the public URL at all times.

## Locked mechanics (port faithfully from /reference/broadside-slice.html)

- Wind model: speed = class max × sail setting × point-of-sail curve × sail health. Curve points (angle off downwind → efficiency): 0°→0.80, 45°→0.95, 90°→1.00, 135°→0.45, 170°→0.08, 180°→0.05.
- Committed turning: turn rate × (0.35 + 0.65 × speed fraction), rudder factor degraded by rudder damage (×0.7 below 50, ×0.3 at 0).
- Straddle aiming: volleys aim at target's range at moment of fire; shot lands where aimed after travel time; fall-of-shot rings telegraph landings for both sides; AI dodges ~60% of volleys.
- Tuning: gun range 300 units, ball speed 270, reload 5.5s base, arc ±0.62 rad, classes: Sloop 135/1.55/75/60/4, Brig 112/1.15/115/100/6, Frigate 96/0.85/170/150/9 (spd/turn/hull/crew/guns).
- Ammo: round (hull, 1.0 range), chain (sails, 0.72), grape (crew, 0.5). Crew losses slow reload (0.55 + 0.45 × crew fraction).
- Raking: stern ×2.2, bow ×1.7. Subsystems: rudder, dismountable guns (18%/round-shot hit amidships), mast stages. Weather gauge: upwind holder gets +12% reload, tighter spread.
- Armada: captains with doctrines (Bulldog/Surgeon/Corsair), two in-battle verbs only — signal gun (rolling fleet volley) and engage/form-on-me toggle. Possession (take any helm). Max 2 consorts for now.
- Run structure (vertical slice): 6 escalating battles to the Plate Ship. Prizes: crew her / strip her (sloop→canvas, brig→guns, frigate→timbers, stack ×3) / sell her. Persistent flagship damage, stores economy, pressed hands pool. Keep this loop intact.
- Double-shotting was tested and CUT. Do not reintroduce.
- Boarding (LOCKED 2026-06-13): tap-timing station game, chosen over the deck-push,
  stream, and grid-tactics prototypes. ONE rule per station: TAP arms it → ring fills
  (white) → GOLD WINDOW opens → tap inside to succeed → miss it and it FOULS (red, dead
  time). No movement/carrying/holds. Skill = staggering timers so windows arrive in
  sequence while the melee underneath drifts on raw crew numbers. Stations: swivel
  (+swivel2 if GUNS≥1), pistols, 3 lines (fray; PARTED = long re-rig; all 3 parted =
  stranded), surgeon (wounded bleed-out queue), reserve (commits all, locks helm), helm
  (cut & run, 15s re-grapple cd). Enemy demands: SURGE (patience bar, fed by any
  swivel/pistol hit) and AXE (one line frays ~7×). Naval hooks: defenders = real crew at
  grapple, boarders = crew −10% skeleton, reserve = 25%; raked-recently slows enemy
  cadence; weather gauge widens your windows 20%; TIMBERS≥1 slows fray; surgeon's-mate
  hook reserved for a future crew-quality refit. Win = struck ship → existing prize flow.
  ALL constants live in src/sim/boardingConfig.ts (window.__broadside-exposed), FEEL dials.
  NOTE: spec's FRONT_K 0.045 forces a ~22s skilled floor that fights the spec's own
  45–90s target; target won, FRONT_K tuned to 0.024. The 4d-tapping.html reference was
  never committed to /reference, so the spec text + feel are the source of truth. Audio:
  distinct pitched percussion tick per station when its window opens (the key juice item).

## Open questions (do NOT resolve unilaterally)

- Combat dials pending playtests: ball speed 220/270/360, reload 4.5/5.5/7, rake full/reduced.
  (Dials are now live in the pause menu; defaults remain the locked values.)
- (RESOLVED 2026-06-13 — see Locked Mechanics) Boarding is the tap-timing station game.
- Rare-ship rule-break taxonomy: designed in conversation with the human, not in code. (One enemy-only rule-breaker shipped as the late-game antagonist: the Drowned ignore the point-of-sail curve. Player-ownable rule-breakers remain undesigned, as agreed.)
- Title: BROADSIDE is a placeholder.

## Playtest easing (2026-06-12 directive)

Testing-phase difficulty lives behind one switch: src/sim/easing.ts (EASY.on),
exposed in the pause menu as FAIR WINDS & MERCY. While on: player damage ×0.8
(gunnery + boarding), prize hands ×0.66 with stores covering shortfalls 1:1,
pressed hands 45% + auto-muster after victories, repair +50% for 8, starting
stores 30, map wind never against the current objective, carpenter trickle-
repairs hull to 35% at sea. Locked constants in constants.ts are untouched;
flipping EASY.on off restores prototype-true balance. These feel changes are
PERMANENT and OUTSIDE the gate (in physics.ts, not easing.ts): sweeps — a
furled ship rows at ROW_EFF 0.075 ≈ 1.5× sailing dead into the wind, scaled by
crew; accel/decel rates 0.7/1.4; the pace amp (all ships speed ×1.15, turn ×1.2,
class ratios preserved). Ship visuals draw at ×2 sim scale (render only).

## Current state

Live and playable end to end. For the live status of each system, what's in
progress, open decisions, and the next feature, see **DESIGN.md** (kept current;
this section intentionally stays short to avoid drift). Ghost/Mist tuning (new
system, not locked values): wind-eff floor 0.85, half guns, chain ×0.5 / grape
×0.3 vs ghosts, never strike, cannot be boarded; endgame is 3 ghost actions
ending at THE HARROW.

## Working agreements

- Small commits, conventional messages. main is always deployable and playable.
- After every milestone: run the build, open it, verify the loop end-to-end before reporting done.
- Mobile is a target: touch input parity from milestone 1 (the prototypes' on-screen controls are the floor, not the ceiling).
- Never use localStorage for anything that matters without an export path; runs may later sync elsewhere.
- When a change would alter game feel (any tuning constant, any input behavior), flag it in the commit message with FEEL: prefix and tell the human.
- Throwaway prototypes were cheap on purpose; this codebase is not. Prefer boring, readable TypeScript. No premature abstraction.
