// Run meta-layer: persistent flagship, stores economy, pressed hands pool,
// armada roster, prize decisions. Ported faithfully from the slice.

import { CAPTAINS, CLASSES, CREW_COST, PRIZE_VALUE, STRIP_LOOT } from './constants';
import type { ClassDef, ShipClass } from './constants';
import type { FactionKey } from './worldgen';
import { clamp } from './math';
import { Rng } from './rng';
import type { RunState } from './types';
import { EASY } from './easing';

export function newRun(): RunState {
  return {
    battle: 1,
    objIdx: 0,
    rumors: [],
    gear: { swivels: false, pumps: false },
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

/* ============ reputation: how the sea remembers your violence ============ */

const repBump = (run: RunState, k: FactionKey, d: number): void => {
  run.rep[k] = clamp(run.rep[k] + d, -100, 100);
};

/**
 * A ship of `faction` was defeated. `mode` is how: 'take' (struck/boarded,
 * prisoners spared — restraint) or 'sink' (no quarter — feared).
 * Sinking costs you ~2× the standing with the faction you sank, and the
 * Brethren admire butchery while the Crown abhors it. Taking is the gentler,
 * more "honorable" path — and it still pays more in goods elsewhere.
 */
export function applyKillRep(run: RunState, faction: FactionKey, mode: 'take' | 'sink'): void {
  const sink = mode === 'sink';
  repBump(run, faction, sink ? -16 : -9); // the victim's flag remembers
  if (faction !== 'brethren') repBump(run, 'brethren', sink ? 6 : 2); // the Brethren respect no quarter
  if (faction !== 'crown') repBump(run, 'crown', sink ? -3 : 0); // the Crown abhors butchery at sea
  if (faction === 'brethren') repBump(run, 'crown', 2); // killing pirates pleases the Crown a little
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

/* ============ the chandler: ship-oriented purchases ============ */
/* Historically grounded bolt-ons. The refit axes (canvas/guns/timbers) share
 * their ×3 caps with prize-stripping; gear is one-time. */

export interface ChandlerItem {
  key: 'guns' | 'canvas' | 'timbers' | 'swivels' | 'pumps';
  label: string;
  desc: string;
  cost: number;
}

export const CHANDLER: ChandlerItem[] = [
  { key: 'guns', label: 'LONG NINES', desc: '+1 cannon per side', cost: 25 },
  { key: 'canvas', label: 'FRESH CANVAS', desc: '+8% speed', cost: 20 },
  { key: 'timbers', label: 'SEASONED OAK', desc: '+20% hull', cost: 30 },
  { key: 'swivels', label: 'SWIVEL GUNS', desc: 'rail guns — boarding hits +25%', cost: 22 },
  { key: 'pumps', label: 'CHAIN PUMPS', desc: 'carpenter patches to 50% at sea', cost: 18 },
];

export function chandlerAvailable(run: RunState, item: ChandlerItem): boolean {
  if (item.key === 'swivels' || item.key === 'pumps') return !run.gear[item.key];
  return run.up[item.key] < 3;
}

export function buyChandler(run: RunState, item: ChandlerItem): boolean {
  if (!chandlerAvailable(run, item) || run.stores < item.cost) return false;
  run.stores -= item.cost;
  if (item.key === 'swivels' || item.key === 'pumps') run.gear[item.key] = true;
  else run.up[item.key]++;
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
