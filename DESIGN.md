# DESIGN.md — BROADSIDE live design state

Companion to CLAUDE.md (which holds locked canon + the file map / how-to-run).
This file tracks what's actually built, what's in flight, and what's undecided.
Keep it honest: describe what the code does, not what it's meant to do.

_Last updated: 2026-06-13, end of the "intelligence & consequences" batch. Working tree clean; everything below is committed and deployed._

## System status

| System | State | Notes |
|---|---|---|
| Wind / sailing physics | **working** | `physics.ts`, shared by battle + map. Locked point-of-sail curve; committed turning; pace amp ×1.15 spd / ×1.2 turn (permanent); rowing floor ROW_EFF 0.075 ≈ 1.5× dead-into-wind. |
| Gunnery (straddle aim, ammo, rake, subsystems, weather gauge) | **working** | Ported from the slice, constants in `constants.ts`. Pause-menu dials (ball speed / reload / rake) live in `tuning.ts`. |
| Enemy AI (Bulldog/Surgeon/Corsair doctrines) | **working** | In `battle.ts`. Corsair stern-rake hunting is the skill check. |
| Armada (2 consorts, signal gun, engage/form-on-me, possession) | **working** | Cap stays 2. `replaceConsort` swaps when full (pay one off for ½ value). Consorts also sail the chart in formation. |
| 6-action story → Plate Ship → 3 Mist actions → THE HARROW | **working** | `worldgen.ESCALATION` (locked) + Mist waves. Ghosts ignore the wind curve (the one shipped rule-breaker). |
| Sea map (real-time wind sailing, contacts flee/hunt/lane, pursuit give-up, crates) | **working** | `world.ts`. Mortals won't enter the Mist; ghosts won't leave it. |
| Trading economy (6 goods, port bias, day wobble) | **working** | `economy.ts`. Sinking now also drops floating cargo + rescued men. |
| Factions + reputation | **working** | 3 factions; rep starts crown −10 / compañía 0 / brethren 15; `applyKillRep` moves it (sink ≈ 2× take; Brethren admire no-quarter, Crown abhors it); ports lock out at ≤ −50. |
| Tutorial (guided fight→port→fight chain + favorable tutorial wind) | **working** | `objectives.ts`. Wind rig is EASY-gated. |
| Ship's logs / discovery | **working** | `rollPrizeLog` on take (55% price tip / 30% shipwreck site / 15% secret port); fragment on sink. 2 secret ports hidden until charted. |
| Captain's Log journal (L) | **working** | Dismissable rumors (✕), Discoveries, persistent Chronicle of every feed line. |
| Big chart (M / click minimap) + port nameplates | **working** | Names live on the big map only; minimap stays nameless; nameplates fade in within ~900u. |
| Diorama render (oblique cam, GPU sea, Kenney kit, damage materials, ×2 ship scale) | **working** | `render/`. Boarding camera glides in (focus blend). |
| Audio | **working (synth only)** | Procedural cannon/hit/splash + per-station boarding ticks + 2 CC0 music tracks. Real SFX **slot empty** — see Partial below. |
| Easing / "Fair Winds & Mercy" | **working** | `easing.ts`, pause-menu toggle. 20%-kinder testing layer; off = prototype-true. |

### Partial / deferred
- **Boarding presentation** — the deck fight runs on HTML station rings + camera glide + the two lashed hull meshes. The spec's **miniature melee crowds at the rail seam** (gold sashes vs rust, a visible shoving front) are **not rendered yet**. Biggest remaining "wow" for the scene.
- **Combat SFX samples** — synthesis only. A drop-in slot exists at `public/assets/sfx/` (`cannon.mp3`/`hit.mp3`/`splash.mp3`) that layers automatically, but no files are bundled — sourcing verified-CC0 cannon by direct fetch was unreliable. Synth is the shipped default.

### Nothing currently broken.

## In progress right now: boarding

Boarding is **LOCKED as the tap-timing station game** (the only variant in the build; the deck-push / crew-stream / grid-tactics prototypes were rejected). Implementation: `sim/boarding.ts`, every constant in `sim/boardingConfig.ts` (exposed on `window.__broadside`).

The mechanic, as built: tap a station → ring fills white (prime) → **gold window** → tap inside to land it → miss → red **foul** (dead time). A continuous melee underneath drifts the **front** toward whoever's stronger; win by pushing the front through their quarterdeck or breaking them below 12% crew. Stations: swivel (+2nd if GUNS refit), pistols, 3 lines (fray, can PART → long re-rig; all 3 parted = stranded), surgeon (bleed-out queue), reserve (commits all, locks helm), helm (cut & run). Enemy demands: SURGE (patience bar, fed by any swivel/pistol hit) and AXE (one line frays fast). Naval hooks all wired: rake-recently slows enemy cadence, weather gauge widens windows, TIMBERS slows fray, GUNS adds a swivel.

**What's unsettled = TUNING, not design.** The spec targets 45–90s fights; the human is playtesting whether that holds and whether **outnumbered feels tense from second one**. Key deviation already made (in `boardingConfig.ts`, human-confirmed): spec's `FRONT_K 0.045` forced a ~22s skilled-play floor that fought the spec's own length target, so it's tuned to **0.024**; `attritionScale` 0.1; station kill amounts trimmed below spec so a lone sloop isn't gutted in two volleys. The `4d-tapping.html` reference was never committed, so the spec text + feel are the source of truth (no file to fidelity-check against).

→ **Awaiting the human's playtest verdict on boarding feel** before further tuning.

## Open decisions (don't resolve unilaterally)
- **Boarding tuning** — fight length + outnumbered tension. Human is testing. (above)
- **Next feature** — not chosen yet. See brainstorm shortlist below; awaiting the human's pick.
- **Combat dials** — ball speed / reload / rake remain experiments; defaults stay the locked values.
- **Player-ownable rule-breaker ships** — undesigned, by agreement. Only the enemy Drowned (wind-immune) shipped.
- **Title** — BROADSIDE is a placeholder.
- **Fog-of-war for normal ports** — decided AGAINST for now (all open ports visible from the start; logs reveal only the *secret* ones). Revisit later if discovery should bite harder.

## Immediate next feature
Awaiting the human to pick from the brainstorm (delivered 2026-06-13). My recommendation, in order:
1. **Consort captains as characters** — temperament + loyalty that reacts to how you use them (the uncracked "armada" pillar; home for the Disco-Elysium voice). *Top pick.*
2. **Tavern contracts / bounties** — escort/hunt/smuggle jobs; highest content-per-effort, reuses rep + factions + trade + map.
3. **Flagship trade-up** — move your flag to a captured hull; the missing progression payoff.

Fuller backlog (also raised, not lost): spyglass enemy-intel; boarding-assist consort order; mid-battle wind shifts; crew-quality refit (the `surgeonsMate` hook in boardingConfig is reserved for this); notoriety-driven navy hunts/blockades; contraband & searches; port events; price impact from your own trades; meta-progression between runs; branching route map; legendary recruitable rival captains; interactive port vignettes; **the boarding melee crowds** (deferred presentation piece); weather/day-night, screen-shake.
