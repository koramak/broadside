# DESIGN.md — BROADSIDE live design state

Companion to CLAUDE.md (which holds locked canon + the file map / how-to-run).
This file tracks what's actually built, what's in flight, and what's undecided.
Keep it honest: describe what the code does, not what it's meant to do.

_Last updated: 2026-06-18, end of the "playtest-feedback fixes" batch (ledger→log + active missions, salvage chart marks, enemy crew bar, contract-paid toast + chime, boarding early-tap foul). Working tree clean; everything below is committed + deployed._

## System status

| System | State | Notes |
|---|---|---|
| Wind / sailing physics | **working** | `physics.ts`, shared by battle + map. Locked point-of-sail curve; committed turning; pace amp ×1.15 spd / ×1.2 turn (permanent); rowing floor ROW_EFF 0.075 ≈ 1.5× dead-into-wind. |
| Gunnery (straddle aim, ammo, rake, subsystems, weather gauge) | **working** | Ported from the slice, constants in `constants.ts`. Pause-menu dials (ball speed / reload / rake) live in `tuning.ts`. Fleet/enemy chips now carry a **crew bar + live hand-count** under the hull bar, so grape attrition reads at a glance. |
| Enemy AI (Bulldog/Surgeon/Corsair doctrines) | **working** | In `battle.ts`. Corsair stern-rake hunting is the skill check. |
| Armada (2 consorts, signal gun, engage/form-on-me, possession) | **working** | Cap stays 2. `replaceConsort` swaps when full (pay one off for ½ value). Consorts also sail the chart in formation. |
| Consort captains as characters (temperament + loyalty + voice) | **working** | `captains.ts`. Each consort has a doctrine-borne TEMPERAMENT (creed/loves/hates) and a LOYALTY that drifts with use: orders for/against type, signal use, a contentment sample, battle-end verdict. High → fights harder + obeys instantly; mutinous → refuses signals, ignores form-up, deserts (≤6) with her hull. CAROUSE buys goodwill back. Disco-Elysium barks in the feed; mood on chips + harbor cards. |
| Flagship trade-up (HOIST YOUR FLAG) | **working** | `run.hoistFlag`. Any prize can become your flagship; crew + refits carry, she comes worn (hull 60%), old hull sold for prize value. Chart ship + mesh rebuild on class change. The Plate Ship is now sailable. |
| Tavern contracts & bounties (job board) | **working** | `contracts.ts`. Per-port board (faction-shaped): delivery, smuggle (draws Crown hunters + rep swing), bounty (named quarry spawns + hunts). Deadlines on the day clock; lapse costs standing. Active articles on port/chart HUD + cyan dest marks. Escort NOT yet shipped (needs friendly-NPC protection AI). |
| Legendary recruitable captains | **working** | `captains.ts` LEGENDS (6). Named characters with personal creed + signature hull + a QUIRK (steadfast/deadeye/ironhide/bloodthirsty), drinking in their flag's ports (deterministic per port+day), hired once each via the tavern. Personal barks over the temperament voice; ★ on cards/chips. |
| Port events | **working** | `portEvents.ts`. Banner on docking (≈55%, deterministic per port+day, same-day re-roll guarded): passive (press-gang, fire, fever, festival, debt, rot) + choices (customs bribe/open, dockside duel, stowaway). Contraband makes customs bite. |
| Boarding melee crowds | **working** | `render/boardingCrowd.ts`. Instanced miniature crew at the rail seam, gold vs rust, boundary slides with `board.front`, density tracks hand counts. The deferred "wow", now shipped. |
| 6-action story → Plate Ship → 3 Mist actions → THE HARROW | **working** | `worldgen.ESCALATION` (locked) + Mist waves. Ghosts ignore the wind curve (the one shipped rule-breaker). |
| Sea map (real-time wind sailing, contacts flee/hunt/lane, pursuit give-up, crates) | **working** | `world.ts`. Mortals won't enter the Mist; ghosts won't leave it. |
| Trading economy (6 goods, port bias, day wobble) | **working** | `economy.ts`. Sinking now also drops floating cargo + rescued men. |
| Factions + reputation | **working** | 3 factions; rep starts crown −10 / compañía 0 / brethren 15; `applyKillRep` moves it (sink ≈ 2× take; Brethren admire no-quarter, Crown abhors it); ports lock out at ≤ −50. |
| Tutorial (guided fight→port→fight chain + favorable tutorial wind) | **working** | `objectives.ts`. Wind rig is EASY-gated. |
| Ship's logs / discovery | **working** | `rollPrizeLog` on take (55% price tip / 30% shipwreck site / 15% secret port); fragment on sink. 2 secret ports hidden until charted. A logged wreck now drops a persistent **⚓ salvage mark** (`run.salvageMarks`) on the minimap, the big chart, and as a ring on the 3D sea; it clears once its crate cluster is gathered (`world.pruneSalvageMarks`) — the "a salvage site is on your chart" promise is now real (was logged but never drawn). |
| Captain's Log journal (L) | **working** | Now the single home for the old left-hand ledger: **SHIP'S LEDGER** (stores/hold/cargo) + **ACTIVE ARTICLES** (contracts — what to carry, where, days left, payout) + **STANDING** (faction rep), alongside dismissable rumors (✕), Discoveries, and the persistent Chronicle. The persistent left-side `#cargo`/`#rep` panels were removed (decluttered map view). Contract completion now also fires a prominent center **toast + chime** so you can't miss being paid. |
| Big chart (M / click minimap) + port nameplates | **working** | Names live on the big map only; minimap stays nameless; nameplates fade in within ~900u. |
| Diorama render (oblique cam, GPU sea, Kenney kit, damage materials, ×2 ship scale) | **working** | `render/`. Boarding camera glides in (focus blend). |
| Audio | **working (synth only)** | Procedural cannon + **distinct hit (woody crack `woodHit`) vs miss (splash)** + per-station boarding ticks + a reward **`chime`** (contracts paid) + 2 CC0 music tracks. Real SFX **slot empty** — see Partial below. |
| Easing / "Fair Winds & Mercy" | **working** | `easing.ts`, pause-menu toggle. 20%-kinder testing layer; off = prototype-true. |

### Partial / deferred
- **Combat SFX samples** — synthesis only. A drop-in slot exists at `public/assets/sfx/` (`cannon.mp3`/`hit.mp3`/`splash.mp3`) that layers automatically, but no files are bundled — sourcing verified-CC0 cannon by direct fetch was unreliable. Synth is the shipped default.
- **Boarding crowds** are rendered now (above), but they're simple pegs (no separate heads, no animation beyond bob/jostle). Good enough; could be enriched later.

### Nothing currently broken.

## In progress right now: boarding

Boarding is **LOCKED as the tap-timing station game** (the only variant in the build; the deck-push / crew-stream / grid-tactics prototypes were rejected). Implementation: `sim/boarding.ts`, every constant in `sim/boardingConfig.ts` (exposed on `window.__broadside`).

The mechanic, as built: tap a station → ring fills white (prime) → **gold window** → tap inside to land it → miss → red **foul** (dead time). A continuous melee underneath drifts the **front** toward whoever's stronger; win by pushing the front through their quarterdeck or breaking them below 12% crew. Stations: swivel (+2nd if GUNS refit), pistols, 3 lines (fray, can PART → long re-rig; all 3 parted = stranded), surgeon (bleed-out queue), reserve (commits all, locks helm), helm (cut & run). Enemy demands: SURGE (patience bar, fed by any swivel/pistol hit) and AXE (one line frays fast). Naval hooks all wired: rake-recently slows enemy cadence, weather gauge widens windows, TIMBERS slows fray, GUNS adds a swivel. **(2026-06-18 FEEL)** tapping during the white prime — too early, before the gold window — now FOULS the station (red dead time), so jumping the gun is punished instead of ignored; behind the `earlyTapFouls` dial in `boardingConfig.ts`.

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
Six features shipped across two 2026 batches (consort captains, contracts/
bounties, flagship trade-up, legendary captains, port events, boarding crowds).
All TUNING-open, not design-open — playtest verdicts wanted on:
- **Loyalty cadence** — does the slow drift make desertion feel earned? `LOYALTY`
  dials in `captains.ts`. Desert threshold 6.
- **Contract economy** — delivery payouts (×1.7 of base) and deadlines; whether
  the smuggle "blockade" (hunter chance ×0.5) bites. Dials in `contracts.ts`.
- **Trade-up condition** — hoisted hull starts at 60%; sell old flag vs keep as
  consort? (`HOIST_HULL_PCT` / `hoistFlag`.)
- **Legend balance** — quirk strengths + hire costs (55–118) + the 45% per-visit
  presence roll. `LEGENDS` in `captains.ts`.
- **Port-event frequency/severity** — the 55% roll + per-event weights/amounts in
  `portEvents.ts`.

Next from the backlog (human to pick): **escort contracts** (the one contract
type still deferred — needs a friendly NPC that paths to a port and can be
attacked); spyglass enemy-intel; boarding-assist consort order; mid-battle wind
shifts; crew-quality refit (the `surgeonsMate` hook in boardingConfig is reserved
for this); price impact from your own trades; notoriety-driven navy hunts/
blockades; meta-progression between runs; branching route map; weather/day-night;
screen-shake & juice; richer boarding-crowd figures; combat SFX samples (asset
sourcing). Design-gated (need the human): player-ownable rule-breaker ships; the
title.
