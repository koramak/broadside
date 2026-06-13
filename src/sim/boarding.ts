// Real-time boarding, adapted from reference/broadside-boarding-test-2.html
// ("Never Leave the Ship") and compressed to keep the pace of the gun fight:
// three deck sections, committed crew streams, a swivel gun, morale cascades.
// DESIGN NOTE: this implements the real-time direction of the two boarding
// prototypes, per the project goal ("boarding must not feel like a pause").
// The turn-based grid prototype remains in reference/ should that verdict change.

import { EventQueue } from './events';
import { Rng } from './rng';
import type { Ship } from './types';
import { EASY } from './easing';

export const SECTION_NAMES = ['BOW', 'WAIST', 'QUARTERDECK'] as const;

const K = 0.045; // attrition constant per combat tick, from the prototype's family
const TICK = 0.5;
const FOOTHOLD_CAP = 14; // only so many hands fit a contested deck section
const TRANSIT_TIME = 1.4;
const SWIVEL_CD = 8;
const SWIVEL_TELEGRAPH = 1.0;

export interface Transit {
  section: number;
  n: number;
  t: number;
}

export interface BoardingState {
  foe: Ship;
  /** hands fighting in each section, attacker (p) and defender (e) */
  secP: [number, number, number];
  secE: [number, number, number];
  pReserve: number;
  eReserve: number;
  transits: Transit[];
  swivelCd: number;
  swivelTarget: { section: number; t: number } | null;
  press: boolean;
  done: 'taken' | 'repelled' | null;
  /** swivel guns mounted on the rails (chandler gear): hits +25% */
  swivels: boolean;
  /** defenders who broke and ran below rather than die — captives if you win */
  fled: number;
  private_tickT: number;
  private_aiT: number;
}

export function startBoarding(me: Ship, foe: Ship, swivels = false): BoardingState {
  const pTotal = Math.round(me.crew);
  const eTotal = Math.round(foe.crew);
  const wave = Math.round(pTotal * 0.4);
  const per = Math.floor(wave / 3);
  const defend = Math.round(eTotal * 0.7);
  const dper = Math.floor(defend / 3);
  return {
    foe,
    secP: [per, wave - 2 * per, per],
    secE: [dper, defend - 2 * dper, dper],
    pReserve: pTotal - wave,
    eReserve: eTotal - defend,
    transits: [],
    swivelCd: 0,
    swivelTarget: null,
    press: false,
    done: null,
    swivels,
    fled: 0,
    private_tickT: 0,
    private_aiT: 2.0,
  };
}

export function totalP(b: BoardingState): number {
  return b.secP[0] + b.secP[1] + b.secP[2] + b.pReserve + b.transits.reduce((t, tr) => t + tr.n, 0);
}

export function totalE(b: BoardingState): number {
  return b.secE[0] + b.secE[1] + b.secE[2] + b.eReserve;
}

/** Send ten hands across to a section. Committed: they're nobody's until they land. */
export function sendHands(b: BoardingState, section: number): boolean {
  if (b.done || b.pReserve < 1) return false;
  const n = Math.min(10, b.pReserve);
  b.pReserve -= n;
  b.transits.push({ section, n, t: TRANSIT_TIME });
  return true;
}

/** Swivel gun: telegraphed scatter into the thickest enemy section. */
export function fireSwivel(b: BoardingState): boolean {
  if (b.done || b.swivelCd > 0 || b.swivelTarget) return false;
  let best = 0;
  for (let i = 1; i < 3; i++) if (b.secE[i] > b.secE[best]) best = i;
  b.swivelTarget = { section: best, t: SWIVEL_TELEGRAPH };
  b.swivelCd = SWIVEL_CD;
  return true;
}

export function togglePress(b: BoardingState): void {
  b.press = !b.press;
}

export function stepBoarding(
  b: BoardingState,
  dt: number,
  rng: Rng,
  events: EventQueue,
  myName: string,
  myMaxCrew: number,
): void {
  if (b.done) return;

  b.swivelCd = Math.max(0, b.swivelCd - dt);

  // crew streams land
  for (let i = b.transits.length - 1; i >= 0; i--) {
    const tr = b.transits[i];
    tr.t -= dt;
    if (tr.t <= 0) {
      b.secP[tr.section] += tr.n;
      b.transits.splice(i, 1);
    }
  }

  // swivel fires after its telegraph
  if (b.swivelTarget) {
    b.swivelTarget.t -= dt;
    if (b.swivelTarget.t <= 0) {
      const s = b.swivelTarget.section;
      const hit = Math.min(b.secE[s], Math.round(6 + rng.rnd(4)));
      b.secE[s] -= hit;
      events.boom(0.3, 0.25, 600);
      events.feed('Swivel gun sweeps the ' + SECTION_NAMES[s].toLowerCase() + ' — ' + hit + ' down');
      b.swivelTarget = null;
    }
  }

  // combat ticks
  b.private_tickT += dt;
  if (b.private_tickT >= TICK) {
    b.private_tickT = 0;
    const routedE: number[] = [];
    const routedP: number[] = [];
    for (let i = 0; i < 3; i++) {
      const p = b.secP[i];
      const e = b.secE[i];
      if (p <= 0 || e <= 0) continue;
      const pEff = Math.min(p, FOOTHOLD_CAP);
      const eEff = Math.min(e, FOOTHOLD_CAP);
      const pLoss = eEff * K * (b.press ? 1.25 : 0.8) * rng.rnd(0.8, 1.2) * (EASY.on ? EASY.boardLossToPlayer : 1);
      const eLoss = pEff * K * (b.press ? 1.45 : 1.0) * (b.swivels ? 1.25 : 1) * rng.rnd(0.8, 1.2);
      b.secP[i] = Math.max(0, p - pLoss);
      b.secE[i] = Math.max(0, e - eLoss);
      if (e > 0 && b.secE[i] <= 0.5) {
        b.secE[i] = 0;
        routedE.push(i);
      }
      if (p > 0 && b.secP[i] <= 0.5) {
        b.secP[i] = 0;
        routedP.push(i);
      }
    }
    // morale cascade: a cleared section panics its neighbours
    for (const i of routedE) {
      events.feed('Their ' + SECTION_NAMES[i].toLowerCase() + ' breaks!');
      events.boom(0.18, 0.15, 900);
      for (const j of [i - 1, i + 1]) {
        if (j >= 0 && j < 3) {
          // the cascade: neighbors see the rout and some throw down steel —
          // they're not dead, they're captives-in-waiting below decks
          b.fled += b.secE[j] * 0.15;
          b.secE[j] *= 0.85;
        }
      }
    }
    for (const i of routedP) {
      events.feed('Your hands are cleared from the ' + SECTION_NAMES[i].toLowerCase());
      for (const j of [i - 1, i + 1]) {
        if (j >= 0 && j < 3) b.secP[j] *= 0.88;
      }
    }
  }

  // defender AI: plug the weakest hole; surge when ahead
  b.private_aiT -= dt;
  if (b.private_aiT <= 0) {
    b.private_aiT = 2.5;
    if (b.eReserve >= 1) {
      let weakest = 0;
      let worst = Infinity;
      for (let i = 0; i < 3; i++) {
        const deficit = b.secE[i] - b.secP[i];
        if (deficit < worst) {
          worst = deficit;
          weakest = i;
        }
      }
      const n = Math.min(8, b.eReserve);
      b.eReserve -= n;
      b.secE[weakest] += n;
      if (totalE(b) > totalP(b) * 1.3 && b.eReserve >= 5) {
        let strongest = 0;
        for (let i = 1; i < 3; i++) if (b.secE[i] > b.secE[strongest]) strongest = i;
        b.eReserve -= 5;
        b.secE[strongest] += 5;
      }
    }
  }

  // outcome — same surrender thresholds as the placeholder auto-resolve
  const pT = totalP(b);
  const eT = totalE(b);
  if (eT <= Math.max(4, Math.round(b.foe.maxCrew * 0.1))) {
    b.done = 'taken';
    events.feed(b.foe.name + ' is taken!');
    events.boom(0.4, 0.4, 300);
  } else if (pT <= Math.max(4, Math.round(myMaxCrew * 0.1))) {
    b.done = 'repelled';
    events.feed('Boarders repelled — ' + myName + ' is lost');
  }
}
