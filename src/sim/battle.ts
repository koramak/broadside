// The battle simulation, ported faithfully from reference/broadside-slice.html.
// Deterministic: all randomness flows through the injected Rng. No DOM, no Three.js.

import {
  AMMO, ARC, ARENA_R, CAPTAINS, CLASSES, DOCTRINES,
  GUN_RANGE, SHIP_NAMES,
} from './constants';
import { TUNING } from './tuning';
import type { Captain, ShipClass } from './constants';
import type { FactionKey } from './worldgen';
import { clamp, dist, normAng, TAU } from './math';
import { stepShipPhysics, windEff } from './physics';
import { EventQueue } from './events';
import { Rng } from './rng';
import type {
  Ball, BattlePhase, PendingFire, Ship, Team, Wind,
} from './types';
import * as boarding from './boarding';
import { BOARD_CFG } from './boardingConfig';
import type { BoardingState } from './boarding';
import type { RunState } from './types';
import { applyKillRep, flagStats, rollPrizeLog, topUpCrew } from './run';
import { GOODS, cargoLoad, fleetCargoCap } from './economy';
import { EASY } from './easing';
import {
  LOYALTY, bark, clampLoyalty, loyaltyBand, loyaltyEffect, orderReaction, tacticalContent,
} from './captains';
import type { BarkKey } from './captains';

export type BattleOutcome =
  | { result: 'won'; salvage: number; pressed: number }
  | { result: 'lost' };

/** What the player is fighting and why — built by the world map (or, for
 *  story actions, straight from the locked ESCALATION table). */
export interface BattleSpec {
  ships: ShipClass[];
  desc: string;
  faction?: FactionKey;
  plate?: boolean;
  story?: number;
  /** the Drowned: wind-immune, never strike, cannot be boarded or taken */
  ghost?: boolean;
  names?: string[];
}

export function makeShip(
  cls: ShipClass,
  team: Team,
  x: number,
  y: number,
  heading: number,
  statsOverride?: ReturnType<typeof flagStats>,
): Ship {
  const c = statsOverride || CLASSES[cls];
  return {
    cls, team, x, y, heading, speed: 0, rudder: 0, sailIdx: 2,
    maxSpd: c.maxSpd, turn: c.turn, len: c.len, beam: c.beam,
    gunsMax: c.guns, gunsLeft: [c.guns, c.guns],
    hull: c.hull, maxHull: c.hull, sailHP: 100, crew: c.crew, maxCrew: c.crew,
    rudderHP: 100, mastStage: 0, reload: [0, 0], ammo: 0,
    sinking: 0, struck: false, gauge: false,
    name: CLASSES[cls].name, captain: null, doctrine: null,
    evade: 0, evadeDir: 1, wakeT: 0, dead: false,
  };
}

export const alive = (s: Ship): boolean => !s.dead && !s.struck && s.sinking === 0;

export class Battle {
  rng: Rng;
  events = new EventQueue();

  wind: Wind;
  ships: Ship[] = [];
  ctrl = 0;
  balls: Ball[] = [];
  pendingFires: PendingFire[] = [];
  phase: BattlePhase = 'sail';
  board: BoardingState | null = null;
  formUp = false;

  private volleyRakeLogged = new Set<number>();
  private volleyCounter = 0;
  /** seconds since the last consort-contentment sample (loyalty drift) */
  private loyaltyT = 0;

  /** Player steering input, set by the front end each frame. */
  playerRudder = 0;

  /** Counts down after the fight ends before the outcome is reported (the
   *  prototype used setTimeout(1100); we keep it inside the sim clock). */
  private endTimer = -1;
  private endOutcome: BattleOutcome | null = null;
  outcome: BattleOutcome | null = null;

  constructor(run: RunState, seed: number, spec: BattleSpec) {
    this.rng = new Rng(seed);
    const rng = this.rng;
    this.wind = { dir: rng.rnd(TAU), drift: rng.rnd(-0.012, 0.012) };

    const caps = rng.shuffle(CAPTAINS.slice());
    const nameBag = rng.shuffle(SHIP_NAMES.slice());
    const shipName = () => nameBag.pop() ?? 'Vane';
    const ph = rng.rnd(TAU);

    // flagship from run state
    const fs = flagStats(run);
    const flag = makeShip(run.flag.cls, 'p', 0, 0, ph, fs);
    flag.hull = Math.max(8, Math.round(flag.maxHull * run.flag.hullPct));
    flag.sailHP = run.flag.sailHP;
    flag.crew = Math.max(8, Math.round(flag.maxCrew * run.flag.crewPct));
    flag.rudderHP = run.flag.rudderHP;
    flag.gunsLeft = [
      Math.max(1, flag.gunsMax - run.flag.gunDef[0]),
      Math.max(1, flag.gunsMax - run.flag.gunDef[1]),
    ];
    flag.name = CLASSES[run.flag.cls].name + ' Persistence';
    flag.captain = ['You', 'bulldog'];
    this.refitGuns = run.up.guns;
    this.refitTimbers = run.up.timbers;
    this.ships.push(flag);
    this.ctrl = 0;

    // consorts from armada
    run.armada.forEach((a, i) => {
      const off = normAng(ph + Math.PI / 2);
      const k = (i === 0 ? 1 : -1) * 110;
      const s = makeShip(a.cls, 'p', Math.cos(off) * k, Math.sin(off) * k, ph);
      s.captain = a.captain;
      s.doctrine = a.captain[1];
      s.name = a.name;
      s.loyalty = a.loyalty; // her morale rides into the fight, drifts, rides back out
      this.ships.push(s);
    });

    // enemies from the encounter spec
    const a0 = rng.rnd(TAU);
    spec.ships.forEach((ecls, i) => {
      const e = makeShip(
        ecls, 'e',
        Math.cos(a0) * 680 + rng.rnd(-120, 120),
        Math.sin(a0) * 680 + rng.rnd(-120, 120),
        rng.rnd(TAU),
      );
      const cap: Captain = caps.pop() || ['Vane', 'bulldog'];
      e.captain = cap;
      e.doctrine = cap[1];
      e.faction = spec.faction;
      const baseName = (spec.plate && i === 0) ? 'THE PLATE SHIP' : CLASSES[ecls].name + ' ' + shipName();
      // a named quarry (bounty) or Mist ship carries her own name
      e.name = spec.names?.[i] ?? baseName;
      if (spec.ghost) {
        e.ghost = true;
        e.doctrine = 'corsair';
        e.captain = ['—', 'corsair'];
        e.name = spec.names?.[i] ?? 'The Nameless';
        // half the gun ports answer; the dead trade broadside weight for the
        // wind-immunity that makes them terrifying anyway
        const g = Math.ceil(e.gunsMax / 2);
        e.gunsLeft = [g, g];
      }
      this.ships.push(e);
    });

    this.events.feed(
      spec.story ? 'Action ' + spec.story + ': ' + spec.desc : 'To quarters — ' + spec.desc,
    );
  }

  P(): Ship {
    return this.ships[this.ctrl];
  }

  fleet(t: Team): Ship[] {
    return this.ships.filter((s) => s.team === t);
  }

  living(t: Team): Ship[] {
    return this.ships.filter((s) => s.team === t && alive(s));
  }

  nearestEnemy(s: Ship): Ship | null {
    let best: Ship | null = null;
    let bd = 1e9;
    for (const o of this.ships) {
      if (o.team !== s.team && !o.dead && o.sinking < 2 && !o.struck) {
        const d = dist(s, o);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
    }
    return best;
  }

  /* ============ sailing ============ */

  windEff(heading: number): number {
    return windEff(heading, this.wind.dir);
  }

  private updateShip(s: Ship, dt: number): void {
    if (s.sinking > 0) {
      s.sinking += dt;
      s.speed *= 0.985;
      s.x += Math.cos(s.heading) * s.speed * dt;
      s.y += Math.sin(s.heading) * s.speed * dt;
      if (s.sinking > 3.4 && !s.dead) {
        s.dead = true;
        this.events.feed(s.ghost ? s.name + ' dissolves into the water it came from' : s.name + ' goes down');
        this.events.emit({ kind: 'shipSunk', ship: s });
      }
      return;
    }
    if (s.struck) {
      s.speed *= 0.98;
      s.x += Math.cos(s.heading) * s.speed * dt;
      s.y += Math.sin(s.heading) * s.speed * dt;
      return;
    }
    stepShipPhysics(s, this.wind.dir, dt);
    const d = Math.hypot(s.x, s.y);
    if (d > ARENA_R) {
      const k = (d - ARENA_R) / d;
      s.x -= s.x * k;
      s.y -= s.y * k;
      s.speed *= 0.9;
    }
    let crewFac = 0.55 + 0.45 * (s.crew / s.maxCrew);
    if (s.gauge) crewFac *= 1.12;
    // a consort's morale shows in her gun crew's pace (lower reloadMul = faster)
    if (s.loyalty !== undefined) crewFac /= loyaltyEffect(s.loyalty).reloadMul;
    for (let i = 0; i < 2; i++) s.reload[i] = Math.max(0, s.reload[i] - dt * crewFac);
    s.wakeT -= dt;
    if (s.speed > 15 && s.wakeT <= 0) {
      s.wakeT = 0.07;
      this.events.emit({
        kind: 'wake',
        x: s.x - Math.cos(s.heading) * s.len * 0.45,
        y: s.y - Math.sin(s.heading) * s.len * 0.45,
      });
    }
  }

  /* ============ gunnery ============ */

  inArc(s: Ship, t: Ship | null, side: number): boolean {
    if (!t) return false;
    const ang = Math.atan2(t.y - s.y, t.x - s.x);
    const sideDir = normAng(s.heading + (side ? 1 : -1) * Math.PI / 2);
    const rng = GUN_RANGE * AMMO[s.ammo].rangeMul;
    return Math.abs(normAng(ang - sideDir)) < ARC && dist(s, t) < rng + 40;
  }

  fire(s: Ship, side: number): void {
    if (s.reload[side] > 0 || s.sinking > 0 || s.struck || this.phase !== 'sail') return;
    if (s.gunsLeft[side] <= 0) return;
    const rng = this.rng;
    const a = AMMO[s.ammo];
    const maxR = GUN_RANGE * a.rangeMul;
    const foe = this.nearestEnemy(s);
    const sideDir = normAng(s.heading + (side ? 1 : -1) * Math.PI / 2);
    let aimR = maxR * 0.75;
    if (foe) {
      const bearing = Math.atan2(foe.y - s.y, foe.x - s.x);
      if (Math.abs(normAng(bearing - sideDir)) < ARC) aimR = clamp(dist(s, foe), 36, maxR);
    }
    const n = s.gunsLeft[side];
    const vid = ++this.volleyCounter;
    const jit: [number, number] = s.gauge ? [0.92, 1.08] : [0.86, 1.14];
    const sprd = s.gauge ? 0.10 : 0.14;
    let avgT = 0;
    for (let i = 0; i < n; i++) {
      const along = (n === 1 ? 0 : (i / (n - 1) - 0.5)) * s.len * 0.7;
      const px = s.x + Math.cos(s.heading) * along + Math.cos(sideDir) * s.beam * 0.55;
      const py = s.y + Math.sin(s.heading) * along + Math.sin(sideDir) * s.beam * 0.55;
      const dir = sideDir + (rng.random() - 0.5) * sprd;
      const landR = aimR * rng.rnd(jit[0], jit[1]);
      const lx = px + Math.cos(dir) * landR;
      const ly = py + Math.sin(dir) * landR;
      const T = landR / TUNING.ballSpd;
      avgT += T / n;
      this.balls.push({ sx: px, sy: py, lx, ly, t: 0, T, dir, ammo: s.ammo, team: s.team, vid });
      this.events.emit({ kind: 'muzzle', x: px, y: py, dir });
    }
    s.reload[side] = TUNING.reloadBase;
    this.events.boom(s.team === 'p' ? 0.45 : 0.3, 0.4, 260);
    if (foe && foe !== this.P() && rng.random() < 0.6) {
      foe.evade = avgT * 0.85;
      foe.evadeDir = rng.random() < 0.5 ? -1 : 1;
    }
  }

  private shipLocal(x: number, y: number, s: Ship): { lx: number; ly: number } {
    const dx = x - s.x;
    const dy = y - s.y;
    const c = Math.cos(-s.heading);
    const sn = Math.sin(-s.heading);
    return { lx: dx * c - dy * sn, ly: dx * sn + dy * c };
  }

  private pointInShip(x: number, y: number, s: Ship): boolean {
    const p = this.shipLocal(x, y, s);
    return Math.abs(p.lx) < s.len * 0.5 + 4 && Math.abs(p.ly) < s.beam * 0.5 + 4;
  }

  private applyHit(tgt: Ship, b: Ball): void {
    const rng = this.rng;
    const a = AMMO[b.ammo];
    const loc = this.shipLocal(b.lx, b.ly, tgt);
    const rel = Math.abs(normAng(b.dir - tgt.heading));
    let rake = 0;
    let mult = 1;
    if (rel < 0.6) {
      rake = 1;
      mult = TUNING.rakeStern;
    } else if (rel > Math.PI - 0.6) {
      rake = 2;
      mult = TUNING.rakeBow;
    }
    if (rake && !this.volleyRakeLogged.has(b.vid)) {
      this.volleyRakeLogged.add(b.vid);
      this.events.feed('Raking fire down the deck of ' + tgt.name + '!');
    }
    if (rake && tgt.team === 'e') this.lastEnemyRakeAt = this.simClock;
    // ghosts: round shot breaks the bones fine, but canvas-shredders and
    // man-killers find nothing much to bite
    const ghostSail = tgt.ghost ? 0.5 : 1;
    const ghostCrew = tgt.ghost ? 0.3 : 1;
    // testing-phase easing: the player's fleet bruises 20% less
    const ease = EASY.on && tgt.team === 'p' ? EASY.dmgToPlayer : 1;
    tgt.hull = Math.max(0, tgt.hull - a.hull * rng.rnd(0.7, 1.3) * mult * ease);
    tgt.sailHP = Math.max(0, tgt.sailHP - a.sail * rng.rnd(0.7, 1.3) * (rake ? 1.3 : 1) * ghostSail * ease);
    tgt.crew = Math.max(0, tgt.crew - a.crew * rng.rnd(0.7, 1.3) * (rake ? 1.4 : 1) * ghostCrew * ease);
    if (loc.lx < -tgt.len * 0.25 && (b.ammo === 0 || b.ammo === 1)) {
      const before = tgt.rudderHP;
      tgt.rudderHP = Math.max(0, tgt.rudderHP - (b.ammo === 0 ? 15 : 8));
      if (before >= 50 && tgt.rudderHP < 50) this.events.feed('Rudder damaged — ' + tgt.name);
      if (before > 0 && tgt.rudderHP <= 0) this.events.feed('Rudder shot away — ' + tgt.name);
    }
    if (Math.abs(loc.lx) <= tgt.len * 0.25 && b.ammo === 0) {
      const facing = loc.ly > 0 ? 1 : 0;
      if (tgt.gunsLeft[facing] > 0 && rng.random() < 0.18) {
        tgt.gunsLeft[facing]--;
        this.events.feed('Gun dismounted — ' + tgt.name);
      }
    }
    const stage = tgt.sailHP < 25 ? 2 : tgt.sailHP < 60 ? 1 : 0;
    if (stage > tgt.mastStage) {
      tgt.mastStage = stage;
      this.events.feed(stage === 1 ? 'Topmasts hit — ' + tgt.name : 'Mast down — ' + tgt.name + ' is crawling');
    }
    // the woody hit sound is played off the 'impact' event (audio.woodHit)
    if (tgt.hull <= 0 && !tgt.sinking) tgt.sinking = 0.001;
    if (tgt.crew <= Math.max(6, tgt.maxCrew * 0.08) && !tgt.struck && !tgt.sinking) {
      if (tgt.ghost) {
        // nothing aboard to surrender; what's left just stops pretending
        tgt.sinking = 0.001;
        this.events.feed(tgt.name + ' forgets how to float');
      } else {
        tgt.struck = true;
        this.events.feed(tgt.name + ' strikes her colors!');
        this.events.emit({ kind: 'shipStruck', ship: tgt });
      }
    }
  }

  /* ============ AI ============ */

  private updateAI(s: Ship, dt: number): void {
    if (!alive(s)) return;
    const rng = this.rng;
    const isMyConsort = s.team === 'p';
    const eff = s.loyalty !== undefined ? loyaltyEffect(s.loyalty) : null;
    // a mutinous consort won't break off to form on you — she ignores the order
    if (isMyConsort && this.formUp && (!eff || eff.obeysFormUp)) {
      const lead = this.P();
      const idx = this.ships.indexOf(s);
      const back = normAng(lead.heading + Math.PI);
      const perp = normAng(lead.heading + Math.PI / 2);
      const k = (idx % 2 ? 1 : -1) * 70;
      const txp = lead.x + Math.cos(back) * 110 + Math.cos(perp) * k;
      const typ = lead.y + Math.sin(back) * 110 + Math.sin(perp) * k;
      const want = Math.atan2(typ - s.y, txp - s.x);
      const err = normAng(want - s.heading);
      s.rudder = Math.abs(err) < 0.06 ? 0 : err > 0 ? 1 : -1;
      s.sailIdx = dist(s, { x: txp, y: typ }) < 60 ? 1 : 2;
      return;
    }
    const foe = this.nearestEnemy(s);
    if (!foe) {
      s.rudder = 0;
      return;
    }
    const d = dist(s, foe);
    if (s.evade > 0) {
      s.evade -= dt;
      s.rudder = s.evadeDir;
      s.sailIdx = 2;
    } else {
      const doc = DOCTRINES[s.doctrine ?? 'bulldog'] || DOCTRINES.bulldog;
      let txp: number;
      let typ: number;
      if (s.hull < s.maxHull * 0.20) {
        txp = s.x + Math.cos(this.wind.dir) * 400;
        typ = s.y + Math.sin(this.wind.dir) * 400;
      } else if (d > 420) {
        txp = foe.x;
        typ = foe.y;
      } else if (doc.astern) {
        const astern = normAng(foe.heading + Math.PI);
        txp = foe.x + Math.cos(astern) * doc.range - Math.cos(this.wind.dir) * 50;
        typ = foe.y + Math.sin(astern) * doc.range - Math.sin(this.wind.dir) * 50;
      } else {
        const toMe = Math.atan2(s.y - foe.y, s.x - foe.x);
        const sA = normAng(foe.heading + Math.PI / 2);
        const sB = normAng(foe.heading - Math.PI / 2);
        const side = Math.abs(normAng(toMe - sA)) < Math.abs(normAng(toMe - sB)) ? sA : sB;
        txp = foe.x + Math.cos(side) * doc.range;
        typ = foe.y + Math.sin(side) * doc.range;
      }
      let want = Math.atan2(typ - s.y, txp - s.x);
      const upwind = normAng(this.wind.dir + Math.PI);
      const offUp = normAng(want - upwind);
      if (Math.abs(offUp) < 0.55) want = normAng(upwind + (offUp >= 0 ? 0.8 : -0.8));
      const err = normAng(want - s.heading);
      s.rudder = Math.abs(err) < 0.06 ? 0 : err > 0 ? 1 : -1;
      s.sailIdx = 2;
    }
    if (s.doctrine === 'surgeon') {
      s.ammo = foe.sailHP > 40 && d > 150 ? 1 : 0;
    } else if (s.doctrine === 'bulldog') {
      s.ammo = d < 110 ? 2 : 0;
    } else {
      s.ammo = 0;
    }
    // devoted crews fire eagerly; mutinous ones drag their feet
    const fireRate = dt * 6 * (eff ? eff.fireMul : 1);
    for (let side = 0; side < 2; side++) {
      if (s.reload[side] <= 0 && s.gunsLeft[side] > 0 && this.inArc(s, foe, side) && rng.random() < fireRate) {
        this.fire(s, side);
      }
    }
  }

  /* ============ loyalty: the armada as a crew of people ============ */

  /** Nudge a consort's morale, clamp it, and let her speak. An explicit `key`
   *  barks that reaction; otherwise a slip into a worse band announces itself
   *  (so desertion is always telegraphed, never a surprise). */
  private adjustLoyalty(s: Ship, delta: number, key?: BarkKey): void {
    if (s.loyalty === undefined || !s.captain) return;
    const before = loyaltyBand(s.loyalty);
    s.loyalty = clampLoyalty(s.loyalty + delta);
    const after = loyaltyBand(s.loyalty);
    let line: string | null = null;
    if (key) {
      line = bark(s.captain, key, this.rng);
    } else if (delta < 0 && after !== before && (after === 'wary' || after === 'mutinous')) {
      line = bark(s.captain, after, this.rng);
    }
    if (line) this.events.feed(line);
  }

  /** Every few seconds, ask each consort whether she likes how she's being
   *  fought, and drift her morale. Slow on purpose — loyalty is a relationship. */
  private sampleLoyalty(): void {
    for (const s of this.fleet('p')) {
      if (s === this.P() || !alive(s) || s.loyalty === undefined || !s.doctrine) continue;
      const foe = this.nearestEnemy(s);
      const range = foe ? dist(s, foe) : 9999;
      const c = tacticalContent(s.doctrine, range, this.formUp);
      if (c !== 0) this.adjustLoyalty(s, c * LOYALTY.contentStep);
    }
  }

  /* ============ signal / orders / possession ============ */

  signal(): void {
    if (this.phase !== 'sail') return;
    let k = 0;
    let any = false;
    let refused = false;
    for (const s of this.fleet('p')) {
      if (s === this.P() || !alive(s)) continue;
      const eff = s.loyalty !== undefined ? loyaltyEffect(s.loyalty) : null;
      const foe = this.nearestEnemy(s);
      let firedThis = false;
      for (let side = 0; side < 2; side++) {
        if (s.reload[side] <= 0 && s.gunsLeft[side] > 0 && this.inArc(s, foe, side)) {
          // a mutinous crew may simply not answer the gun
          if (eff && eff.mayRefuseSignal && this.rng.random() < 0.5) {
            if (!refused && s.captain) {
              const line = bark(s.captain, 'resent', this.rng);
              if (line) this.events.feed(line);
              refused = true;
            }
            continue;
          }
          this.pendingFires.push({ ship: s, side, t: 0.18 + k * 0.32 + (eff ? eff.signalDelay : 0) });
          k++;
          any = true;
          firedThis = true;
        }
      }
      if (firedThis && s.loyalty !== undefined) this.adjustLoyalty(s, LOYALTY.signalUsed);
    }
    if (any) {
      this.events.boom(0.35, 0.2, 900);
      this.events.feed('Signal gun — fleet fires!');
    } else if (refused) {
      this.events.feed('Signal — and your fleet pretends not to hear');
    } else {
      this.events.feed('Signal — no consort has a target in arc');
    }
  }

  private updatePending(dt: number): void {
    for (let i = this.pendingFires.length - 1; i >= 0; i--) {
      const p = this.pendingFires[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.fire(p.ship, p.side);
        this.pendingFires.splice(i, 1);
      }
    }
  }

  toggleOrder(): void {
    this.formUp = !this.formUp;
    this.events.feed(this.formUp ? 'Fleet signal — form on me' : 'Fleet signal — engage the enemy');
    // the order lands differently on each temperament; one of them says so
    let spoke = false;
    for (const s of this.fleet('p')) {
      if (s === this.P() || !alive(s) || s.loyalty === undefined || !s.doctrine) continue;
      const r = orderReaction(s.doctrine, this.formUp);
      if (!r) continue;
      this.adjustLoyalty(s, r.d, spoke ? undefined : r.key);
      spoke = true;
    }
  }

  takeHelm(idx: number): boolean {
    const s = this.ships[idx];
    if (!s || s.team !== 'p' || !alive(s)) return false;
    this.ctrl = idx;
    this.events.feed('You take the helm of ' + s.name);
    return true;
  }

  nextHelm(): void {
    const mine = this.ships.map((_, i) => i).filter((i) => this.ships[i].team === 'p' && alive(this.ships[i]));
    if (!mine.length) return;
    const cur = mine.indexOf(this.ctrl);
    this.takeHelm(mine[(cur + 1) % mine.length]);
  }

  setAmmo(i: number): void {
    this.P().ammo = i;
  }

  setSail(i: number): void {
    this.P().sailIdx = clamp(i, 0, 2);
  }

  /* ============ boarding ============ */

  /** Grapple window. FEEL: widened while EASY is on (range 78→100, closing
   *  speed 55→70) — new players kept bouncing off the strict gate. */
  static boardRange(): number {
    return EASY.on ? 100 : 78;
  }

  static boardRelV(): number {
    return EASY.on ? 70 : 55;
  }

  /** Why boarding is/isn't available right now — drives button + feedback. */
  boardCheck(): { ok: boolean; reason: 'none' | 'ghost' | 'far' | 'fast' | 'cooldown'; foe: Ship | null } {
    const s = this.P();
    const foe = this.nearestEnemy(s);
    if (this.phase !== 'sail' || s.sinking > 0) return { ok: false, reason: 'none', foe: null };
    if (!foe) return { ok: false, reason: 'none', foe: null };
    if (foe.ghost) return { ok: false, reason: 'ghost', foe };
    if (this.simClock < this.regrappleUntil) return { ok: false, reason: 'cooldown', foe };
    const d = dist(s, foe);
    if (d >= Battle.boardRange()) return { ok: false, reason: 'far', foe };
    const rv = Math.hypot(
      Math.cos(s.heading) * s.speed - Math.cos(foe.heading) * foe.speed,
      Math.sin(s.heading) * s.speed - Math.sin(foe.heading) * foe.speed,
    );
    if (rv >= Battle.boardRelV()) return { ok: false, reason: 'fast', foe };
    return { ok: true, reason: 'none', foe };
  }

  boardTarget(): Ship | null {
    const c = this.boardCheck();
    return c.ok ? c.foe : null;
  }

  private boardNagAt = -9;
  private simClock = 0;
  /** naval-state hooks for boarding, snapshotted at battle start */
  private refitGuns = 0;
  private refitTimbers = 0;
  /** when the enemy last ate a raking volley (cadence hook) */
  private lastEnemyRakeAt = -999;
  /** after a cut-away or stranding, the grapples need re-rigging */
  private regrappleUntil = -999;

  startBoarding(): void {
    const c = this.boardCheck();
    if (!c.ok) {
      // tell the player WHY the grapples stay coiled (rate-limited)
      if (this.simClock - this.boardNagAt > 1.5) {
        this.boardNagAt = this.simClock;
        if (c.reason === 'far') this.events.feed('Too far to grapple — lay her alongside, under a ship-length');
        else if (c.reason === 'fast') this.events.feed('Too much way on — shorten sail and match her speed to grapple');
        else if (c.reason === 'ghost') this.events.feed('The grapples find nothing to bite on that thing');
        else this.events.feed('No enemy in grappling reach');
      }
      return;
    }
    const foe = c.foe!;
    this.phase = 'board';
    // the fight before the grapple decides the kitchen
    this.board = boarding.startBoarding(this.P(), foe, {
      gauge: this.P().gauge,
      rakedRecently: this.simClock - this.lastEnemyRakeAt < BOARD_CFG.rakeWindowS,
      secondSwivel: this.refitGuns >= 1,
      toughLines: this.refitTimbers >= 1,
      surgeonsMate: false, // crew-quality refit hook — not yet purchasable
    });
    // lash her alongside for the deck fight
    const me = this.P();
    const perp = normAng(me.heading + Math.PI / 2);
    const gap = (me.beam + foe.beam) * 1.1;
    foe.x = me.x + Math.cos(perp) * gap;
    foe.y = me.y + Math.sin(perp) * gap;
    foe.heading = me.heading;
    this.events.feed('GRAPPLES AWAY — boarding ' + foe.name);
    this.events.feed('Tap a station to arm it. Tap again in the GOLD to make it count.');
    this.events.boom(0.4, 0.5, 180);
  }

  /** the whole boarding interface: tap a station */
  boardTap(id: boarding.StationId): void {
    if (this.board && this.phase === 'board') {
      boarding.tap(this.board, id, this.rng, this.events);
    }
  }

  /** keyboard convenience: tap the nth visible station (0-indexed) */
  boardTapIndex(n: number): void {
    const st = this.board?.stations[n];
    if (st) this.boardTap(st.id);
  }

  private updateBoarding(dt: number, run: RunState): void {
    const board = this.board!;
    const me = this.P();
    const foe = board.foe;
    me.speed *= 0.92;
    foe.speed *= 0.92;
    // lashed hulls drift as one
    const perp = normAng(me.heading + Math.PI / 2);
    const gap = (me.beam + foe.beam) * 1.1;
    foe.x = me.x + Math.cos(perp) * gap;
    foe.y = me.y + Math.sin(perp) * gap;
    foe.heading = me.heading;

    boarding.stepBoarding(board, dt, this.rng, this.events);
    if (!board.done) return;

    const myRemain = Math.round(board.myHands);
    const theirRemain = Math.round(board.theirHands);
    switch (board.done) {
      case 'taken': {
        foe.struck = true;
        // those who broke and ran took the better deal: your shilling
        const surrendered = Math.round(theirRemain * 0.5);
        const captured = surrendered + Math.round(board.wounded.length * 0.5);
        foe.crew = Math.max(0, theirRemain - surrendered);
        me.crew = myRemain + board.reserve + board.skeleton;
        if (captured > 0) {
          const room = Math.max(0, Math.round(me.maxCrew - me.crew));
          const aboard = Math.min(captured, room);
          me.crew += aboard;
          run.pool += captured - aboard;
          this.events.feed(
            captured + ' of her people throw down their steel and take your shilling' +
            (aboard > 0 ? ' — ' + aboard + ' fill your own thin ranks' : ''),
          );
        }
        break;
      }
      case 'repelled': {
        me.crew = myRemain + board.skeleton; // reserve died covering the retreat
        foe.crew = theirRemain;
        me.struck = true;
        break;
      }
      case 'cutaway': {
        me.crew = myRemain + board.reserve + board.skeleton;
        foe.crew = theirRemain;
        this.regrappleUntil = this.simClock + BOARD_CFG.helm.regrappleCd;
        break;
      }
      case 'stranded': {
        const saved = Math.round(myRemain * (1 - BOARD_CFG.strandedLossFrac));
        me.crew = saved + board.reserve + board.skeleton;
        foe.crew = theirRemain;
        this.regrappleUntil = this.simClock + BOARD_CFG.helm.regrappleCd;
        this.events.feed('Half the boarding party never made it back across');
        break;
      }
    }
    this.board = null;
    this.phase = 'sail';
  }

  /* ============ outcomes ============ */

  private checkOutcome(run: RunState): void {
    if (this.phase !== 'sail') return;
    const pAlive = this.living('p');
    const eAlive = this.living('e');
    if (!eAlive.length) {
      this.battleWon(run);
    } else if (!pAlive.length) {
      this.phase = 'end';
      this.endTimer = 0.9;
      this.endOutcome = { result: 'lost' };
    } else if (!alive(this.P())) {
      this.nextHelm();
    }
  }

  private battleWon(run: RunState): void {
    this.phase = 'end';
    run.pendingPrizes = [];
    let salvage = 0;
    let pressed = 0;
    let prizesTaken = 0;
    let shipsSunk = 0;
    for (const s of this.ships) {
      if (s.team !== 'e') continue;
      if (s.struck) {
        // taken: a prize (richest path) + her log + restraint with her flag
        run.pendingPrizes.push({ cls: s.cls, name: s.name, crew: Math.round(s.crew) });
        pressed += Math.round(s.crew * (EASY.on ? EASY.pressedFrac : 0.25));
        run.stats.prizes++;
        prizesTaken++;
        if (s.faction) applyKillRep(run, s.faction, 'take');
        rollPrizeLog(run, this.rng, this.events, 'full');
      } else {
        // sunk: a thinner purse, but the chop gives up cargo and a few souls
        const coin = Math.round(this.rng.rnd(5, 10));
        salvage += coin;
        const men = Math.round(this.rng.rnd(2, 5));
        run.pool += men;
        const g = this.rng.pick(GOODS);
        const room = Math.max(0, fleetCargoCap(run) - cargoLoad(run));
        const units = Math.min(room, Math.round(this.rng.rnd(2, 5)));
        if (units > 0) run.cargo[g.key] = (run.cargo[g.key] || 0) + units;
        run.stats.sunk++;
        shipsSunk++;
        if (s.faction) applyKillRep(run, s.faction, 'sink');
        rollPrizeLog(run, this.rng, this.events, 'fragment');
        this.events.feed(
          s.name + ' goes under — ' +
          (units > 0 ? units + ' ' + g.name.toLowerCase() + ' bobbing free, ' : '') +
          men + ' souls fished from the chop',
        );
      }
    }
    run.stores += salvage;
    run.pool += pressed;
    // save flagship state (whatever ship you ended on)
    const f = this.P();
    run.flag = {
      cls: f.cls,
      hullPct: f.hull / f.maxHull,
      sailHP: f.sailHP,
      crewPct: f.crew / f.maxCrew,
      rudderHP: f.rudderHP,
      gunDef: [f.gunsMax - f.gunsLeft[0], f.gunsMax - f.gunsLeft[1]],
    };
    // surviving consorts keep their place — and carry home a verdict on the
    // fight: you led them to a win (+), but did you spend their hull, take
    // prizes or just sink everything?
    const onlySunk = prizesTaken === 0 && shipsSunk > 0;
    const survivors = this.ships.filter((s) => s.team === 'p' && s !== f && alive(s));
    run.armada = survivors.map((s) => {
      let loy = (s.loyalty ?? LOYALTY.start) + LOYALTY.victory;
      if (s.hull < s.maxHull * 0.25) loy += s.doctrine === 'bulldog' ? LOYALTY.bulldogMauled : LOYALTY.mauled;
      if (s.doctrine === 'corsair') loy += prizesTaken > 0 ? LOYALTY.corsairPrize : onlySunk ? LOYALTY.corsairWaste : 0;
      return { cls: s.cls, name: s.name, captain: s.captain!, loyalty: clampLoyalty(loy) };
    });
    // one survivor crows — but a Corsair only brags of a prize if one was taken
    const speakers = prizesTaken > 0 ? survivors : survivors.filter((s) => s.doctrine !== 'corsair');
    if (speakers.length) {
      const v = speakers[this.rng.int(speakers.length)];
      if (v.captain) {
        const line = bark(v.captain, 'victory', this.rng);
        if (line) this.events.feed(line);
      }
    }
    // pressed hands report aboard at once — losses refill themselves first,
    // and whatever's left waits in the pool for prize crews
    if (run.pool > 0 && run.flag.crewPct < 1) {
      const before = run.pool;
      topUpCrew(run);
      const joined = before - run.pool;
      if (joined > 0) this.events.feed(joined + ' pressed hands take your shilling — the muster is made good');
    }
    this.endTimer = 1.1;
    this.endOutcome = { result: 'won', salvage, pressed };
  }

  /* ============ step ============ */

  /** Advance the battle one fixed timestep. Sets this.outcome when decided. */
  step(dt: number, run: RunState): void {
    this.simClock += dt;
    this.wind.dir = normAng(this.wind.dir + this.wind.drift * dt);
    if (this.phase === 'sail') {
      const me = this.P();
      me.rudder = this.playerRudder;
      // weather gauge: computed for the controlled ship, as in the prototype
      const foe = this.nearestEnemy(me);
      if (foe) {
        const ux = -Math.cos(this.wind.dir);
        const uy = -Math.sin(this.wind.dir);
        const proj = (me.x - foe.x) * ux + (me.y - foe.y) * uy;
        me.gauge = proj > 40;
      }
      for (const s of this.ships) if (s !== me) this.updateAI(s, dt);
      for (const s of this.ships) this.updateShip(s, dt);
      this.updatePending(dt);
      // consorts quietly judge how you're fighting them
      this.loyaltyT += dt;
      if (this.loyaltyT >= LOYALTY.sampleS) {
        this.loyaltyT = 0;
        this.sampleLoyalty();
      }
      // collision separation
      for (let i = 0; i < this.ships.length; i++) {
        for (let j = i + 1; j < this.ships.length; j++) {
          const a = this.ships[i];
          const b = this.ships[j];
          if (a.dead || b.dead) continue;
          const d = dist(a, b);
          const minD = (a.beam + b.beam) * 1.1;
          if (d < minD && d > 0.01) {
            const nx = (a.x - b.x) / d;
            const ny = (a.y - b.y) / d;
            const push = (minD - d) * 0.5;
            a.x += nx * push;
            a.y += ny * push;
            b.x -= nx * push;
            b.y -= ny * push;
            a.speed *= 0.97;
            b.speed *= 0.97;
          }
        }
      }
      // shot flight + landings
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        b.t += dt;
        if (b.t >= b.T) {
          let hit: Ship | null = null;
          for (const s of this.ships) {
            if (s.team === b.team || s.dead || s.sinking > 2) continue;
            if (this.pointInShip(b.lx, b.ly, s)) {
              hit = s;
              break;
            }
          }
          if (hit) {
            this.applyHit(hit, b);
            this.events.emit({ kind: 'impact', x: b.lx, y: b.ly });
          } else {
            this.events.emit({ kind: 'splash', x: b.lx, y: b.ly });
          }
          this.balls.splice(i, 1);
        }
      }
      this.checkOutcome(run);
    } else if (this.phase === 'board') {
      this.updateBoarding(dt, run);
      // updateBoarding may resolve the fight and flip us back to 'sail'
      if ((this.phase as BattlePhase) === 'sail') this.checkOutcome(run);
    } else {
      for (const s of this.ships) this.updateShip(s, dt);
      if (this.endTimer > 0) {
        this.endTimer -= dt;
        if (this.endTimer <= 0 && this.endOutcome) {
          this.outcome = this.endOutcome;
        }
      }
    }
  }
}
