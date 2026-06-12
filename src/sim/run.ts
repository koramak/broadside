// Run meta-layer: persistent flagship, stores economy, pressed hands pool,
// armada roster, prize decisions. Ported faithfully from the slice.

import { CAPTAINS, CLASSES, CREW_COST, PRIZE_VALUE, STRIP_LOOT } from './constants';
import type { ClassDef } from './constants';
import { clamp } from './math';
import { Rng } from './rng';
import type { RunState } from './types';

export function newRun(): RunState {
  return {
    battle: 1,
    objIdx: 0,
    stores: 20,
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

export function repairHull(run: RunState): boolean {
  if (run.flag.hullPct >= 1 || run.stores < 12) return false;
  run.stores -= 12;
  run.flag.hullPct = clamp(run.flag.hullPct + 0.35, 0, 1);
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

export function hireHands(run: RunState): boolean {
  if (run.stores < 10) return false;
  run.stores -= 10;
  run.pool += 10;
  return true;
}

export function topUpCrew(run: RunState): boolean {
  if (run.flag.crewPct >= 1 || run.pool <= 0) return false;
  const fc = CLASSES[run.flag.cls];
  const need = Math.round((1 - run.flag.crewPct) * fc.crew);
  const take = Math.min(need, run.pool);
  run.pool -= take;
  run.flag.crewPct = clamp(run.flag.crewPct + take / fc.crew, 0, 1);
  return true;
}

/* ============ prize decisions ============ */

export function crewPrize(run: RunState, i: number, rng: Rng): boolean {
  const p = run.pendingPrizes[i];
  if (!p) return false;
  const cost = CREW_COST[p.cls];
  if (run.armada.length >= 2 || run.pool < cost) return false;
  run.pool -= cost;
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
