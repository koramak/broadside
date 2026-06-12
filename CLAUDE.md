# CLAUDE.md — BROADSIDE (working title)

This file is the project memory. Read it fully before any work. The design doc principles here are LOCKED unless the human explicitly reopens them. The reference prototypes in /reference are the source of truth for game feel and tuning values.

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

## Open questions (do NOT resolve unilaterally)

- Combat dials pending playtests: ball speed 220/270/360, reload 4.5/5.5/7, rake full/reduced.
  (Dials are now live in the pause menu; defaults remain the locked values.)
- Boarding: two competing prototypes exist (/reference/broadside-boarding-test-2.html real-time streams, /reference/broadside-boarding-test-3.html turn-based grid). The 2026-06-12 goal directive ("boarding must not feel like a pause") was read as picking the real-time direction, and a compact real-time deck fight (src/sim/boarding.ts) replaced the auto-resolve. HUMAN VERDICT STILL WELCOME — the grid prototype remains in reference/ and the sim module is swappable.
- Rare-ship rule-break taxonomy: designed in conversation with the human, not in code. (One enemy-only rule-breaker shipped as the late-game antagonist: the Drowned ignore the point-of-sail curve. Player-ownable rule-breakers remain undesigned, as agreed.)
- Title: BROADSIDE is a placeholder.

## Current state (2026-06-12, autonomous build session)

Full game playable end to end: 6-action story spine across a hand-authored
archipelago (sea map, 6 ports, 3 factions with reputation, 6-good trading
economy, salvage crates, contacts that flee/patrol/hunt), the locked battle sim
ported deterministically (src/sim/ — zero Three imports, seeded RNG, fixed
60 Hz), Kenney Pirate Kit diorama render (oblique camera, GPU flat-shaded sea),
real-time boarding, and the post-Plate-Ship Mist endgame (3 ghost actions
ending at THE HARROW). Ghost tuning (new system, not locked values): wind-eff
floor 0.85, half guns, chain ×0.5 / grape ×0.3 vs ghosts, never strike, cannot
be boarded. GitHub Pages workflow is committed; needs a git remote + push to go
live. Local toolchain note: Node lives at ~/.local/node-toolchain (not on PATH).

## Working agreements

- Small commits, conventional messages. main is always deployable and playable.
- After every milestone: run the build, open it, verify the loop end-to-end before reporting done.
- Mobile is a target: touch input parity from milestone 1 (the prototypes' on-screen controls are the floor, not the ceiling).
- Never use localStorage for anything that matters without an export path; runs may later sync elsewhere.
- When a change would alter game feel (any tuning constant, any input behavior), flag it in the commit message with FEEL: prefix and tell the human.
- Throwaway prototypes were cheap on purpose; this codebase is not. Prefer boring, readable TypeScript. No premature abstraction.
