// BOARDING — the tap-timing station game (LOCKED design, 2026-06-12).
// One rule everywhere: TAP arms a station, its ring fills, a GOLD WINDOW
// opens, tap inside it to succeed; let it pass and the station FOULS.
// Underneath, the melee grinds on raw numbers — the stations are how you
// cheat the arithmetic. No movement, no carrying, no holds.
// Constants live in boardingConfig.ts; this module is pure sim (no DOM).

import { BOARD_CFG as C } from './boardingConfig';
import { EventQueue } from './events';
import { Rng } from './rng';
import type { Ship } from './types';

export type StationId =
  | 'swivel' | 'swivel2' | 'pistols'
  | 'line0' | 'line1' | 'line2'
  | 'surgeon' | 'reserve' | 'helm';

export type StationPhase = 'idle' | 'priming' | 'window' | 'fouled' | 'spent';

export interface Station {
  id: StationId;
  phase: StationPhase;
  /** seconds spent in the current phase */
  t: number;
  /** durations for the running recipe (set when armed) */
  primeT: number;
  windowT: number;
  foulT: number;
}

export interface Wounded {
  /** seconds left on the bleed-out bar */
  t: number;
  max: number;
}

export type BoardingEnd = 'taken' | 'repelled' | 'cutaway' | 'stranded';

export interface BoardingState {
  foe: Ship;
  /** hands actually trading steel (your reserve waits in the hatch) */
  myHands: number;
  theirHands: number;
  myStart: number;
  theirStart: number;
  reserve: number;
  skeleton: number;
  /** the front: -1 = your quarterdeck (loss), +1 = through theirs (win) */
  front: number;
  /** pistol courage — additive power boost, decays */
  myBoost: number;
  /** swivel suppression — seconds their power stays halved */
  theirHalvedT: number;
  /** unfed surge — seconds of hard enemy push remaining */
  pushT: number;
  stations: Station[];
  /** rope health per line, 0..1; null entry = line PARTED */
  lineHealth: [number, number, number];
  wounded: Wounded[];
  woundedCarry: number;
  /** active enemy demands */
  surge: { t: number } | null;
  axe: { line: number; t: number } | null;
  nextEventT: number;
  /* naval-state modifiers, fixed at grapple */
  eventGapMul: number;
  windowMul: number;
  frayMul: number;
  surgeonsMate: boolean;
  helmLocked: boolean;
  clock: number;
  done: BoardingEnd | null;
}

export interface BoardingOpts {
  gauge: boolean;
  rakedRecently: boolean;
  secondSwivel: boolean; // GUNS refit ≥ 1
  toughLines: boolean; // TIMBERS refit ≥ 1
  surgeonsMate: boolean; // future crew-quality refit
}

const mk = (id: StationId): Station => ({ id, phase: 'idle', t: 0, primeT: 0, windowT: 0, foulT: 0 });

export function startBoarding(me: Ship, foe: Ship, opts: BoardingOpts): BoardingState {
  const total = Math.round(me.crew);
  const skeleton = Math.max(2, Math.round(total * C.skeletonFrac));
  const boarders = total - skeleton;
  const reserve = Math.round(boarders * C.reserve.frac);
  const stations: Station[] = [mk('swivel')];
  if (opts.secondSwivel) stations.push(mk('swivel2'));
  stations.push(mk('pistols'), mk('line0'), mk('line1'), mk('line2'), mk('surgeon'), mk('reserve'), mk('helm'));
  return {
    foe,
    myHands: boarders - reserve,
    theirHands: Math.round(foe.crew),
    myStart: boarders - reserve,
    theirStart: Math.max(1, Math.round(foe.crew)),
    reserve,
    skeleton,
    front: 0,
    myBoost: 0,
    theirHalvedT: 0,
    pushT: 0,
    stations,
    lineHealth: [1, 1, 1],
    wounded: [],
    woundedCarry: 0,
    surge: null,
    axe: null,
    nextEventT: 4.5, // first demand comes early; outnumbered = clock from second one
    eventGapMul: opts.rakedRecently ? C.rakeCadenceMul : 1,
    windowMul: (opts.gauge ? C.gaugeWindowMul : 1) * C.windowScale,
    frayMul: opts.toughLines ? C.timbersFrayMul : 1,
    surgeonsMate: opts.surgeonsMate,
    helmLocked: false,
    clock: 0,
    done: null,
  };
}

export const station = (b: BoardingState, id: StationId): Station | undefined =>
  b.stations.find((s) => s.id === id);

const lineIdx = (id: StationId): number =>
  id === 'line0' ? 0 : id === 'line1' ? 1 : 2;

export const isLine = (id: StationId): boolean => id.startsWith('line');

/** Effective melee powers — what the front and the attrition read. */
export function powers(b: BoardingState): { mine: number; theirs: number } {
  const mine = b.myHands * (1 + b.myBoost);
  const theirs = b.theirHands * (b.theirHalvedT > 0 ? 0.5 : 1);
  return { mine, theirs };
}

/** TAP. The whole interface. Returns what happened so the UI can react. */
export function tap(
  b: BoardingState,
  id: StationId,
  rng: Rng,
  events: EventQueue,
): 'armed' | 'hit' | 'dead' | null {
  if (b.done) return null;
  const s = station(b, id);
  if (!s || s.phase === 'spent') return null;
  const pace = C.paceScale;

  if (s.phase === 'idle') {
    // arm the station — pick the recipe
    if (id === 'swivel' || id === 'swivel2') {
      s.primeT = C.swivel.prime / pace;
      s.windowT = (C.swivel.window * b.windowMul) / pace;
      s.foulT = C.swivel.foul / pace;
    } else if (id === 'pistols') {
      s.primeT = C.pistols.load / pace;
      s.windowT = (C.pistols.window * b.windowMul) / pace;
      s.foulT = C.pistols.foul / pace;
    } else if (isLine(id)) {
      const parted = b.lineHealth[lineIdx(id)] <= 0;
      s.primeT = (parted ? C.lines.rerig : C.lines.heave) / pace;
      s.windowT = ((parted ? C.lines.rerigWindow : C.lines.heaveWindow) * b.windowMul) / pace;
      s.foulT = (parted ? C.lines.rerigFoul : C.lines.heaveFoul) / pace;
    } else if (id === 'surgeon') {
      if (!b.wounded.length) return null; // empty table
      const t = b.surgeonsMate ? C.surgeonsMate : C.surgeon;
      s.primeT = t.surgery / pace;
      s.windowT = (t.window * b.windowMul) / pace;
      s.foulT = C.surgeon.foul / pace;
    } else if (id === 'reserve') {
      if (b.reserve <= 0) return null;
      s.primeT = C.reserve.arm / pace;
      s.windowT = (C.reserve.window * b.windowMul) / pace;
      s.foulT = C.reserve.foul / pace;
    } else if (id === 'helm') {
      if (b.helmLocked) return null;
      s.primeT = C.helm.arm / pace;
      s.windowT = (C.helm.window * b.windowMul) / pace;
      s.foulT = C.helm.foul / pace;
    }
    s.phase = 'priming';
    s.t = 0;
    return 'armed';
  }

  if (s.phase === 'window') {
    s.phase = 'idle';
    s.t = 0;
    applyHit(b, id, rng, events);
    return 'hit';
  }

  // tapping during the white fill is too early — it FOULS the station (red dead
  // time, same as missing the gold window). Patience is the skill.
  if (s.phase === 'priming' && C.earlyTapFouls) {
    s.phase = 'fouled';
    s.t = 0;
    events.emit({ kind: 'boardFoul', station: id });
    return 'dead';
  }

  // priming (penalty off) or already fouled: nothing happens
  return 'dead';
}

/** Station succeeded inside its gold window. */
function applyHit(b: BoardingState, id: StationId, rng: Rng, events: EventQueue): void {
  if (id === 'swivel' || id === 'swivel2') {
    const kill = Math.round(rng.rnd(C.swivel.killMin, C.swivel.killMax));
    b.theirHands = Math.max(0, b.theirHands - kill);
    b.theirHalvedT = C.swivel.halveT;
    feedSurge(b, events);
    events.emit({ kind: 'boardFx', fx: 'swivel', n: kill });
    events.boom(0.34, 0.3, 520);
  } else if (id === 'pistols') {
    const kill = Math.round(rng.rnd(C.pistols.killMin, C.pistols.killMax));
    b.theirHands = Math.max(0, b.theirHands - kill);
    b.front = Math.min(1, b.front + C.pistols.frontPush);
    b.myBoost = Math.min(0.6, b.myBoost + C.pistols.boost);
    feedSurge(b, events);
    events.emit({ kind: 'boardFx', fx: 'pistols', n: kill });
    events.boom(0.22, 0.16, 800);
  } else if (isLine(id)) {
    const i = lineIdx(id);
    const wasParted = b.lineHealth[i] <= 0;
    b.lineHealth[i] = wasParted ? C.lines.rerigHealth : 1;
    events.emit({ kind: 'boardFx', fx: wasParted ? 'rerig' : 'heave', n: i });
    if (wasParted) events.feed('The ' + LINE_NAMES[i].toLowerCase() + ' is re-rigged — hulls breathe together again');
  } else if (id === 'surgeon') {
    if (b.wounded.length) {
      b.wounded.shift();
      b.myHands += 1;
      events.emit({ kind: 'boardFx', fx: 'saved', n: 1 });
      events.feed('The surgeon turns one loose — back to the rail with you');
    }
  } else if (id === 'reserve') {
    b.myHands += b.reserve;
    events.feed(b.reserve + ' from the hatch — everything you have, committed');
    b.reserve = 0;
    b.front = Math.min(1, b.front + C.reserve.frontShove);
    b.helmLocked = true;
    const rs = station(b, 'reserve');
    if (rs) rs.phase = 'spent';
    const hs = station(b, 'helm');
    if (hs) hs.phase = 'spent';
    events.emit({ kind: 'boardFx', fx: 'reserve', n: 0 });
    events.boom(0.3, 0.4, 240);
  } else if (id === 'helm') {
    b.done = 'cutaway';
    events.feed('CUT AND RUN — lines away, the sea takes you back');
  }
}

/** Any swivel or pistol success feeds a waiting surge. */
function feedSurge(b: BoardingState, events: EventQueue): void {
  if (b.surge) {
    b.surge = null;
    events.emit({ kind: 'boardFx', fx: 'surgeFed', n: 0 });
    events.feed('The surge meets grape and pistol smoke — it breaks');
  }
}

export const LINE_NAMES = ['BOW LINE', 'MIDSHIP LINE', 'STERN LINE'];

export function stepBoarding(b: BoardingState, dt: number, rng: Rng, events: EventQueue): void {
  if (b.done) return;
  const pace = C.paceScale;
  b.clock += dt;

  /* stations advance */
  for (const s of b.stations) {
    if (s.phase === 'priming') {
      s.t += dt;
      if (s.t >= s.primeT) {
        s.phase = 'window';
        s.t = 0;
        events.emit({ kind: 'boardWindow', station: s.id });
      }
    } else if (s.phase === 'window') {
      s.t += dt;
      if (s.t >= s.windowT) {
        // the window passed unanswered
        s.t = 0;
        if (s.id === 'surgeon') {
          // a missed window kills the man on the table
          if (b.wounded.length) {
            b.wounded.shift();
            events.feed('Lost him on the table. The surgeon doesn’t look up.');
            events.emit({ kind: 'boardFx', fx: 'tableDeath', n: 1 });
          }
          s.phase = 'fouled';
        } else if (isLine(s.id)) {
          // missed heave: the line slips
          const i = lineIdx(s.id);
          if (b.lineHealth[i] > 0) {
            b.lineHealth[i] = Math.max(0, b.lineHealth[i] - C.lines.slipPenalty);
            events.emit({ kind: 'boardFx', fx: 'slip', n: i });
          }
          s.phase = 'fouled';
        } else {
          s.phase = 'fouled';
        }
        events.emit({ kind: 'boardFoul', station: s.id });
      }
    } else if (s.phase === 'fouled') {
      s.t += dt;
      if (s.t >= s.foulT) {
        s.phase = 'idle';
        s.t = 0;
      }
    }
  }

  /* boosts decay */
  b.myBoost = Math.max(0, b.myBoost - C.pistols.boostDecay * dt);
  b.theirHalvedT = Math.max(0, b.theirHalvedT - dt);

  /* lines fray */
  for (let i = 0; i < 3; i++) {
    if (b.lineHealth[i] <= 0) continue;
    const axeHere = b.axe && b.axe.line === i;
    b.lineHealth[i] -= C.lines.frayRate * b.frayMul * (axeHere ? C.lines.axeFrayMul : 1) * dt * pace;
    if (b.lineHealth[i] <= 0) {
      b.lineHealth[i] = 0;
      events.feed(LINE_NAMES[i] + ' PARTS — the hulls grind apart there');
      events.emit({ kind: 'boardFx', fx: 'parted', n: i });
      events.boom(0.3, 0.25, 180);
    }
  }
  if (b.lineHealth[0] <= 0 && b.lineHealth[1] <= 0 && b.lineHealth[2] <= 0) {
    b.done = 'stranded';
    events.feed('All three lines gone — the boarders are stranded as the ships part');
    return;
  }

  /* enemy demands */
  b.nextEventT -= dt * pace;
  if (!b.surge && !b.axe && b.nextEventT <= 0) {
    b.nextEventT = rng.rnd(C.eventGapMin, C.eventGapMax) * b.eventGapMul;
    if (rng.random() < C.surgeChance) {
      b.surge = { t: C.surge.patience };
      events.emit({ kind: 'boardFx', fx: 'surgeUp', n: 0 });
      events.feed('THEY MASS AT THE RAIL — feed them steel before they jump');
    } else {
      const live = [0, 1, 2].filter((i) => b.lineHealth[i] > 0);
      const line = live.length ? live[rng.int(live.length)] : 0;
      b.axe = { line, t: C.axe.duration };
      events.emit({ kind: 'boardFx', fx: 'axeUp', n: line });
      events.feed('An axe at the ' + LINE_NAMES[line].toLowerCase() + '!');
    }
  }
  if (b.surge) {
    b.surge.t -= dt;
    if (b.surge.t <= 0) {
      b.surge = null;
      b.pushT = C.surge.pushT;
      events.feed('The surge comes over the rail unanswered — hold, HOLD—');
      events.boom(0.4, 0.5, 200);
    }
  }
  if (b.axe) {
    b.axe.t -= dt;
    if (b.axe.t <= 0) b.axe = null;
  }

  /* the melee — raw numbers grinding */
  const p = powers(b);
  const myLoss = C.K * C.attritionScale * p.theirs * dt * pace;
  const theirLoss = C.K * C.attritionScale * p.mine * dt * pace;
  b.theirHands = Math.max(0, b.theirHands - theirLoss);
  const before = b.myHands;
  b.myHands = Math.max(0, b.myHands - myLoss);
  // a share of your fallen reach the surgeon alive
  b.woundedCarry += (before - b.myHands) * C.woundedFrac;
  while (b.woundedCarry >= 1 && b.wounded.length < C.woundedMax) {
    b.woundedCarry -= 1;
    b.wounded.push({ t: C.surgeon.bleedOut, max: C.surgeon.bleedOut });
  }

  /* bleed-out bars run regardless */
  for (let i = b.wounded.length - 1; i >= 0; i--) {
    b.wounded[i].t -= dt;
    if (b.wounded[i].t <= 0) {
      b.wounded.splice(i, 1);
      events.emit({ kind: 'boardFx', fx: 'bledOut', n: 1 });
    }
  }

  /* the front drifts toward whoever is weaker */
  const span = Math.max(p.mine, p.theirs, 1);
  b.front += C.FRONT_K * ((p.mine - p.theirs) / span) * dt * pace;
  if (b.pushT > 0) {
    b.pushT -= dt;
    b.front -= C.surge.pushRate * dt;
  }
  b.front = Math.max(-1, Math.min(1, b.front));

  /* resolution */
  if (b.front >= 1 || b.theirHands <= b.theirStart * C.loseCrewFrac) {
    b.done = 'taken';
  } else if (b.front <= -1 || b.myHands <= b.myStart * C.loseCrewFrac) {
    b.done = 'repelled';
  }
}
