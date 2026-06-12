// Run meta-layer: persistent flagship, stores economy, pressed hands pool,
// armada roster, prize decisions. Ported faithfully from the slice.

import { CAPTAINS, CLASSES, CREW_COST, PRIZE_VALUE, STRIP_LOOT } from './constants';
import type { ClassDef, ShipClass } from './constants';
import { clamp } from './math';
import { Rng } from './rng';
import type { RunState } from './types';
import { EASY } from './easing';

export function newRun(): RunState {
  return {
    battle: 1,
    objIdx: 0,
    stores: EASY.on ? EASY.startingStores : 20,
    pool: 0,
    up: { canvas: 0, guns: 0, timbers: 0 },
    flag: { cls: 'brig', hullPct: 1, sailHP: 100, crewPct: 1, rudderHP: 100, gunDef: [0, 0] },
    armada: [],
    pendingPrizes: [],
    stats: { prizes: 0, sunk: 0 },
    cargo: { sugar: 0, rum: 0, powder: 0, timber: 0, silk: 0, spice: 0 },
    // you fly no colors the Crown recognizes; the Brethren half-trust you
    rep: { crown: -10, compania: 0, brethren: 15 },
  };
}

/** Flagship stats with refits applied — identical math to the prototype. */
export function flagStats(run: RunState): ClassDef {
  const c = CLASSES[run.flag.cls];
  return {
    name: c.name,
    maxSpd: c.maxSpd * Math.pow(1.08, run.up.canvas),
    turn: c.turn,
    hull: Math.round(c.hull * Math.pow(1.2, run.up.timbers)),
    crew: c.crew,
    guns: Math.min(12, c.guns + run.up.guns),
    len: c.len,
    beam: c.beam,
  };
}

/* ============ harbor actions ============ */
/* Each returns true if it went through (so the UI can re-render). */

export const REPAIR_COST = (): number => (EASY.on ? EASY.repairCost : 12);
export const REPAIR_AMT = (): number => (EASY.on ? EASY.repairAmt : 0.35);

export function repairHull(run: RunState): boolean {
  if (run.flag.hullPct >= 1 || run.stores < REPAIR_COST()) return false;
  run.stores -= REPAIR_COST();
  run.flag.hullPct = clamp(run.flag.hullPct + REPAIR_AMT(), 0, 1);
  return true;
}

export function mendSails(run: RunState): boolean {
  if (run.flag.sailHP >= 100 || run.stores < 8) return false;
  run.stores -= 8;
  run.flag.sailHP = 100;
  return true;
}

export function remountGuns(run: RunState): boolean {
  const fixed = run.flag.gunDef[0] + run.flag.gunDef[1] === 0 && run.flag.rudderHP >= 100;
  if (fixed || run.stores < 8) return false;
  run.stores -= 8;
  run.flag.gunDef = [0, 0];
  run.flag.rudderHP = 100;
  return true;
}

/** Pool hands transfer to the flagship free (used after battles too). */
export function topUpCrew(run: RunState): boolean {
  if (run.flag.crewPct >= 1 || run.pool <= 0) return false;
  const fc = CLASSES[run.flag.cls];
  const need = Math.round((1 - run.flag.crewPct) * fc.crew);
  const take = Math.min(need, run.pool);
  run.pool -= take;
  run.flag.crewPct = clamp(run.flag.crewPct + take / fc.crew, 0, 1);
  return true;
}

/** One simple action at a port: fill the flagship's crew. Pressed hands in
 *  the pool join free; the rest are hired at 1 store a head. Replaces the
 *  old two-step hire-then-top-up dance (2026-06-12 playtest feedback). */
export function musterCost(run: RunState): { need: number; cost: number } {
  const fc = CLASSES[run.flag.cls];
  const need = Math.round((1 - run.flag.crewPct) * fc.crew);
  return { need, cost: Math.max(0, need - run.pool) };
}

export function musterCrew(run: RunState): boolean {
  const { need, cost } = musterCost(run);
  if (need <= 0 || run.stores < cost) return false;
  const fc = CLASSES[run.flag.cls];
  run.pool = Math.max(0, run.pool - need);
  run.stores -= cost;
  run.flag.crewPct = clamp(run.flag.crewPct + need / fc.crew, 0, 1);
  return true;
}

/* ============ prize decisions ============ */

/** Hands a prize needs; eased during testing. */
export function prizeHands(cls: ShipClass): number {
  return Math.round(CREW_COST[cls] * (EASY.on ? EASY.crewCostMul : 1));
}

/** Stores the player must add to the pool's hands to crew this prize. */
export function prizeShortfall(run: RunState, cls: ShipClass): number {
  return Math.max(0, prizeHands(cls) - run.pool);
}

/** Crew a prize into the armada. Pool hands go first; shortfall is hired
 *  with stores at 1 a head, so the option is reachable early. */
export function crewPrize(run: RunState, i: number, rng: Rng): boolean {
  const p = run.pendingPrizes[i];
  if (!p) return false;
  const hands = prizeHands(p.cls);
  const buy = prizeShortfall(run, p.cls);
  if (run.armada.length >= 2 || run.stores < buy) return false;
  run.pool = Math.max(0, run.pool - hands);
  run.stores -= buy;
  const cap = CAPTAINS[Math.floor(rng.rnd(CAPTAINS.length))];
  run.armada.push({ cls: p.cls, name: p.name, captain: cap });
  run.pendingPrizes.splice(i, 1);
  return true;
}

export function stripPrize(run: RunState, i: number): boolean {
  const p = run.pendingPrizes[i];
  if (!p) return false;
  const loot = STRIP_LOOT[p.cls];
  if (run.up[loot[0]] >= 3) return false;
  run.up[loot[0]]++;
  run.stores += 12;
  run.pendingPrizes.splice(i, 1);
  return true;
}

export function sellPrize(run: RunState, i: number): boolean {
  const p = run.pendingPrizes[i];
  if (!p) return false;
  run.stores += PRIZE_VALUE[p.cls];
  run.pendingPrizes.splice(i, 1);
  return true;
}
