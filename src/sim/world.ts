// The sea map simulation: open sailing between islands, ports, contacts,
// story markers, floating salvage, and the Mist boundary. Same wind, same
// physics, same committed turning as the battle arena — the map IS the game.

import { CLASSES, ESCALATION } from './constants';
import type { ShipClass } from './constants';
import { dist, normAng, TAU } from './math';
import { stepShipPhysics } from './physics';
import { EventQueue } from './events';
import { Rng } from './rng';
import { makeShip } from './battle';
import { flagStats } from './run';
import type { RunState, Ship } from './types';
import {
  CONTACT_TABLES, ISLANDS, MIST_CONTACT, MIST_ESCALATION, MIST_FEED, PORTS,
  STORY_ACTIONS, WORLD, regionAt,
} from './worldgen';
import type { ContactSpec, FactionKey, PortDef } from './worldgen';
import { currentObjective, objectivePos, onStoryWon, tutorialActive } from './objectives';
import type { GoodKey } from './economy';

export interface Contact {
  id: number;
  spec: ContactSpec;
  ship: Ship;
  wpX: number;
  wpY: number;
  gone: boolean;
}

export interface Crate {
  id: number;
  x: number;
  y: number;
  kind: 'stores' | GoodKey;
  amount: number;
  taken: boolean;
}

export interface EncounterSpec {
  ships: ShipClass[];
  desc: string;
  faction?: FactionKey;
  plate?: boolean;
  loot: number;
  story?: number; // story action number if this is a spine battle
  ghost?: boolean;
  names?: string[];
  x: number;
  y: number;
}

const ENGAGE_RANGE = 130;
const STORY_RANGE = 170;

const clampDrift = (v: number, m: number): number => (v > m ? m : v < -m ? -m : v);
const DOCK_RANGE = 230;
const SPAWN_BUBBLE = 2600;
const DESPAWN_RANGE = 3600;

export class World {
  events = new EventQueue();
  rng: Rng;
  wind = { dir: 0, drift: 0 };
  player: Ship;
  contacts: Contact[] = [];
  crates: Crate[] = [];
  day = 0;
  private dayT = 0;
  private nextId = 1;
  private spawnT = 4;
  private mistWarned = false;
  private mistFeedT = 14;
  private mistFeedIdx = 0;
  private blockedPortWarned = new Set<string>();

  playerRudder = 0;
  /** set each step: port you could dock at, encounter you just triggered */
  canDock: PortDef | null = null;
  pendingEncounter: EncounterSpec | null = null;

  constructor(run: RunState, seed: number) {
    this.rng = new Rng(seed);
    this.wind.dir = this.rng.rnd(TAU);
    this.wind.drift = this.rng.rnd(-0.008, 0.008);
    const fs = flagStats(run);
    this.player = makeShip(run.flag.cls, 'p', PORTS[0].x + 500, PORTS[0].y + 420, 0.2, fs);
    this.syncPlayerFromRun(run);
    // a few crates seeded around the world
    for (let i = 0; i < 10; i++) this.spawnCrate();
  }

  /** Map-ship condition mirrors the persistent flagship. */
  syncPlayerFromRun(run: RunState): void {
    const fs = flagStats(run);
    this.player.maxSpd = fs.maxSpd;
    this.player.sailHP = run.flag.sailHP;
    this.player.rudderHP = run.flag.rudderHP;
    this.player.hull = Math.max(8, Math.round(fs.hull * run.flag.hullPct));
    this.player.maxHull = fs.hull;
  }

  private spawnCrate(): void {
    const rng = this.rng;
    const kinds: (Crate['kind'])[] = ['stores', 'stores', 'rum', 'powder', 'silk', 'spice', 'sugar', 'timber'];
    this.crates.push({
      id: this.nextId++,
      x: rng.rnd(-WORLD.width / 2 + 800, WORLD.mistX - 400),
      y: rng.rnd(-WORLD.height / 2 + 500, WORLD.height / 2 - 500),
      kind: rng.pick(kinds),
      amount: Math.round(rng.rnd(4, 12)),
      taken: false,
    });
  }

  /** Is the player past the wall (only possible once it opens)? */
  inMist(): boolean {
    return this.player.x > WORLD.mistX;
  }

  private spawnContact(run: RunState): void {
    const rng = this.rng;
    if (this.inMist()) {
      // only the Drowned wander here
      const a = rng.rnd(TAU);
      const x = this.player.x + Math.cos(a) * SPAWN_BUBBLE;
      const y = this.player.y + Math.sin(a) * SPAWN_BUBBLE;
      if (x < WORLD.mistX + 100 || Math.abs(y) > WORLD.height / 2 - 300 || x > WORLD.width / 2 - 200) return;
      const ship = makeShip(MIST_CONTACT.ships[0], 'e', x, y, rng.rnd(TAU));
      ship.ghost = true;
      const c: Contact = { id: this.nextId++, spec: MIST_CONTACT, ship, wpX: x, wpY: y, gone: false };
      this.pickWaypoint(c);
      this.contacts.push(c);
      return;
    }
    const region = regionAt(this.player.x);
    const table = CONTACT_TABLES[region];
    let spec = rng.pick(table);
    // notoriety draws hunters
    const notoriety = Math.max(0, -run.rep.crown);
    if (region !== 'home' && notoriety > 40 && rng.random() < 0.35) {
      const hunters = CONTACT_TABLES.reefs.filter((c) => c.kind === 'hunter');
      if (hunters.length) spec = hunters[0];
    }
    const a = rng.rnd(TAU);
    const x = this.player.x + Math.cos(a) * SPAWN_BUBBLE;
    const y = this.player.y + Math.sin(a) * SPAWN_BUBBLE;
    if (Math.abs(x) > WORLD.width / 2 - 300 || Math.abs(y) > WORLD.height / 2 - 300 || x > WORLD.mistX - 300) return;
    const ship = makeShip(spec.ships[0], 'e', x, y, rng.rnd(TAU));
    ship.faction = spec.faction;
    const c: Contact = { id: this.nextId++, spec, ship, wpX: x, wpY: y, gone: false };
    this.pickWaypoint(c);
    this.contacts.push(c);
  }

  private pickWaypoint(c: Contact): void {
    const rng = this.rng;
    if (c.spec.behavior === 'lane' || c.spec.behavior === 'flee') {
      const p = rng.pick(PORTS);
      c.wpX = p.x + rng.rnd(-300, 300);
      c.wpY = p.y + rng.rnd(-300, 300);
    } else {
      c.wpX = c.ship.x + rng.rnd(-1600, 1600);
      c.wpY = c.ship.y + rng.rnd(-1600, 1600);
    }
  }

  private steerContact(c: Contact, dt: number): void {
    const s = c.ship;
    const toPlayer = dist(s, this.player);
    let tx = c.wpX;
    let ty = c.wpY;
    if (c.spec.behavior === 'flee' && toPlayer < 700) {
      tx = s.x + (s.x - this.player.x);
      ty = s.y + (s.y - this.player.y);
    } else if (c.spec.behavior === 'hunt' && toPlayer < 1500) {
      tx = this.player.x;
      ty = this.player.y;
    } else if (dist(s, { x: c.wpX, y: c.wpY }) < 250) {
      this.pickWaypoint(c);
    }
    const want = Math.atan2(ty - s.y, tx - s.x);
    const err = normAng(want - s.heading);
    s.rudder = Math.abs(err) < 0.07 ? 0 : err > 0 ? 1 : -1;
    s.sailIdx = 2;
    stepShipPhysics(s, this.wind.dir, dt);
    this.collideIslands(s);
  }

  private collideIslands(s: Ship): void {
    for (const isl of ISLANDS) {
      const d = Math.hypot(s.x - isl.x, s.y - isl.y);
      const minD = isl.r + 40;
      if (d < minD && d > 0.01) {
        const k = (minD - d) / d;
        s.x += (s.x - isl.x) * k;
        s.y += (s.y - isl.y) * k;
        s.speed *= 0.86;
      }
    }
  }

  step(dt: number, run: RunState): void {
    // FEEL (testing phase): the map wind is rigged in the player's favor.
    // During the tutorial it settles onto a beam reach toward the gold mark —
    // the fastest point of sail. After the tutorial it drifts freely BUT is
    // hard-clamped so the course to the current objective is never worse
    // than a broad reach (~0.7 efficiency). Battle wind stays honest.
    const obj = currentObjective(run);
    if (obj && tutorialActive(run)) {
      const t = objectivePos(obj);
      const bearing = Math.atan2(t.y - this.player.y, t.x - this.player.x);
      const a = normAng(bearing + Math.PI / 2);
      const b = normAng(bearing - Math.PI / 2);
      const want = Math.abs(normAng(a - this.wind.dir)) < Math.abs(normAng(b - this.wind.dir)) ? a : b;
      const err = normAng(want - this.wind.dir);
      this.wind.dir = normAng(this.wind.dir + clampDrift(err, 0.12 * dt));
    } else {
      this.wind.dir = normAng(this.wind.dir + this.wind.drift * dt);
      if (obj) {
        // never let the objective sit upwind: keep the bearing within 2.0 rad
        // of downwind (point-of-sail eff ≥ ~0.7 on the locked curve)
        const t = objectivePos(obj);
        const bearing = Math.atan2(t.y - this.player.y, t.x - this.player.x);
        const off = normAng(bearing - this.wind.dir);
        const MAXOFF = 2.0;
        if (Math.abs(off) > MAXOFF) {
          this.wind.dir = normAng(bearing - Math.sign(off) * MAXOFF);
        }
      }
    }
    this.dayT += dt;
    if (this.dayT > 75) {
      this.dayT = 0;
      this.day++;
    }

    // player sailing
    const p = this.player;
    p.rudder = this.playerRudder;
    stepShipPhysics(p, this.wind.dir, dt);
    this.collideIslands(p);
    // world bounds + the Mist
    const hw = WORLD.width / 2;
    const hh = WORLD.height / 2;
    if (p.x < -hw) { p.x = -hw; p.speed *= 0.9; }
    if (p.x > hw) { p.x = hw; p.speed *= 0.9; }
    if (p.y < -hh) { p.y = -hh; p.speed *= 0.9; }
    if (p.y > hh) { p.y = hh; p.speed *= 0.9; }
    const mistOpen = run.battle > 6;
    if (!mistOpen && p.x > WORLD.mistX) {
      p.x = WORLD.mistX;
      p.speed *= 0.8;
      if (!this.mistWarned) {
        this.mistWarned = true;
        this.events.feed('The Mist stands like a wall. Whatever is in there is not ready for you. Or is saving you for later.');
      }
    }
    if (mistOpen && this.inMist()) {
      this.mistFeedT -= dt;
      if (this.mistFeedT <= 0) {
        this.mistFeedT = 22;
        this.events.feed(MIST_FEED[this.mistFeedIdx % MIST_FEED.length]);
        this.mistFeedIdx++;
      }
    }
    p.wakeT -= dt;
    if (p.speed > 15 && p.wakeT <= 0) {
      p.wakeT = 0.07;
      this.events.emit({
        kind: 'wake',
        x: p.x - Math.cos(p.heading) * p.len * 0.45,
        y: p.y - Math.sin(p.heading) * p.len * 0.45,
      });
    }

    // contacts
    this.spawnT -= dt;
    const nearby = this.contacts.filter((c) => !c.gone).length;
    if (this.spawnT <= 0 && nearby < 6) {
      this.spawnT = this.rng.rnd(6, 14);
      this.spawnContact(run);
    }
    for (const c of this.contacts) {
      if (c.gone) continue;
      this.steerContact(c, dt);
      if (dist(c.ship, p) > DESPAWN_RANGE) c.gone = true;
    }
    this.contacts = this.contacts.filter((c) => !c.gone);

    // crates
    for (const cr of this.crates) {
      if (cr.taken) continue;
      if (Math.hypot(cr.x - p.x, cr.y - p.y) < 70) {
        cr.taken = true;
        if (cr.kind === 'stores') {
          run.stores += cr.amount;
          this.events.feed('Flotsam: +' + cr.amount + ' stores. The sea provides. The sea also took it from someone.');
        } else {
          run.cargo[cr.kind] = (run.cargo[cr.kind] || 0) + Math.min(cr.amount, 8);
          this.events.feed('Fished a crate of ' + cr.kind + ' from the water. Salt-stained. Sellable.');
        }
        this.events.boom(0.2, 0.15, 500);
      }
    }
    if (this.crates.filter((c) => !c.taken).length < 6 && this.rng.random() < dt * 0.05) this.spawnCrate();

    // docking prompt
    this.canDock = null;
    for (const port of PORTS) {
      if (Math.hypot(port.x - p.x, port.y - p.y) < DOCK_RANGE) {
        if (run.rep[port.faction] <= -50) {
          if (!this.blockedPortWarned.has(port.id)) {
            this.blockedPortWarned.add(port.id);
            this.events.feed(port.name + ' flies the no-quarter signal. Your reputation arrived first.');
          }
        } else {
          this.canDock = port;
        }
        break;
      }
    }

    // encounters: run down a contact
    this.pendingEncounter = null;
    for (const c of this.contacts) {
      if (!c.gone && dist(c.ship, p) < ENGAGE_RANGE) {
        this.pendingEncounter = {
          ships: c.spec.ships,
          desc: c.spec.desc,
          faction: c.spec.faction,
          loot: c.spec.loot,
          ghost: c.spec.ghost,
          names: c.spec.names,
          x: p.x,
          y: p.y,
        };
        c.gone = true;
        break;
      }
    }

    // story marker — only live while it IS the current objective, so the
    // tutorial's port calls get the player's full attention
    const curObj = currentObjective(run);
    if (!this.pendingEncounter && curObj && curObj.kind === 'fight' && run.battle <= STORY_ACTIONS.length) {
      const m = STORY_ACTIONS[run.battle - 1];
      if (Math.hypot(m.x - p.x, m.y - p.y) < STORY_RANGE) {
        if (run.battle <= 6) {
          const wave = ESCALATION[run.battle - 1];
          this.pendingEncounter = {
            ships: wave.ships,
            desc: wave.desc,
            faction: 'crown',
            plate: run.battle === 6,
            loot: 0,
            story: run.battle,
            x: p.x,
            y: p.y,
          };
        } else {
          const wave = MIST_ESCALATION[run.battle - 7];
          this.pendingEncounter = {
            ships: wave.ships,
            desc: wave.desc,
            ghost: true,
            names: wave.names,
            loot: 30,
            story: run.battle,
            x: p.x,
            y: p.y,
          };
        }
      }
    }
  }

  /** Rep + loot bookkeeping after a battle the player won. */
  applyVictory(run: RunState, enc: EncounterSpec): void {
    if (enc.loot > 0) {
      run.stores += enc.loot;
      this.events.feed('Her papers, strongbox and dignity are yours: +' + enc.loot + ' stores.');
    }
    if (enc.faction) {
      run.rep[enc.faction] = Math.max(-100, run.rep[enc.faction] - 22);
      if (enc.faction === 'crown') run.rep.brethren = Math.min(100, run.rep.brethren + 8);
      if (enc.faction === 'compania') run.rep.brethren = Math.min(100, run.rep.brethren + 6);
      if (enc.faction === 'brethren') run.rep.crown = Math.min(100, run.rep.crown + 7);
    }
    if (enc.ghost) {
      this.events.feed('What it was carrying glints like coin and smells like low tide. Salt-silver spends fine.');
    }
    if (enc.story) {
      run.battle++;
      onStoryWon(run, enc.story, this.events);
      if (run.battle <= 6) {
        this.events.feed('The trail leads on. Action ' + run.battle + ' is marked on your chart.');
      } else if (run.battle === 7) {
        this.events.feed('East of the Tessellate, the Mist is... folding back. It looks like an invitation. It is not a kind one.');
      } else if (run.battle <= 9) {
        this.events.feed('Deeper. The next mark is past where charts apologize and stop.');
      }
    }
  }

  shipClassName(cls: ShipClass): string {
    return CLASSES[cls].name;
  }
}
