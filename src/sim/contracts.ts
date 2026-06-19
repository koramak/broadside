// Tavern contracts & bounties — the living job board. Factions post work that
// turns the systems you already have (rep, trade, the map, combat) into endless
// replayable content: carry cargo, run a blockade, hunt a named ship — by a
// deadline. ZERO Three.js. Deterministic generation seeded per port + day.

import { CLASSES } from './constants';
import type { ShipClass } from './constants';
import { GOODS } from './economy';
import type { GoodKey } from './economy';
import { clamp } from './math';
import { Rng } from './rng';
import { FACTIONS, PORTS, knownPorts } from './worldgen';
import type { FactionKey, PortDef } from './worldgen';
import type { EventQueue } from './events';
import type { RunState } from './types';

export type ContractType = 'delivery' | 'smuggle' | 'bounty';

export interface Contract {
  id: number;
  type: ContractType;
  /** the flag that posted the work; completing it pleases them */
  faction: FactionKey;
  title: string;
  desc: string;
  payout: number; // stores on completion
  repReward: number; // standing with the poster on completion
  /** absolute world-day the job lapses; miss it and your name is mud */
  deadlineDay: number;
  // cargo jobs (delivery / smuggle):
  good?: GoodKey;
  qty?: number;
  destPortId?: string;
  contraband?: boolean; // smuggle: the Crown must not be the finder
  // bounty:
  bountyName?: string;
  bountyCls?: ShipClass;
  bountyFaction?: FactionKey; // the flag the quarry flies
}

/** How many jobs you can carry at once — a captain only has so much attention. */
export const MAX_ACTIVE = 3;

const BOUNTY_PAY: Record<ShipClass, number> = { sloop: 40, brig: 60, frigate: 95 };
const BOUNTY_NAMES = [
  'Black Iago', 'The Widow Ash', 'Cutlass Coromande', 'Red Esquival', 'One-Glass Pell',
  'The Heron', 'Salt-Tongue Maro', 'Dauphine the Lesser', 'Grin Halloran', 'The Tax-Collector',
];

const factionName = (k: FactionKey): string => FACTIONS.find((f) => f.key === k)!.name;
const dist2 = (a: PortDef, b: PortDef): number => Math.hypot(a.x - b.x, a.y - b.y);
const repBump = (run: RunState, k: FactionKey, d: number): void => {
  run.rep[k] = clamp(run.rep[k] + d, -100, 100);
};

/** Rough sailing days between two ports (a "day" ≈ 75s of map sailing). */
function deadlineDays(a: PortDef, b: PortDef, buffer: number): number {
  return clamp(Math.ceil(dist2(a, b) / 4200) + buffer, buffer, 20);
}

/* ============ generation ============ */

function deliveryContract(run: RunState, here: PortDef, ports: PortDef[], day: number, id: number, rng: Rng): Contract | null {
  const dests = ports.filter((p) => p.id !== here.id && run.rep[p.faction] > -50);
  if (!dests.length) return null;
  const dest = rng.pick(dests);
  // a good that's cheap HERE, so "buy here, carry there" reads at a glance
  const good = [...GOODS].sort((x, y) => here.bias[x.key] - here.bias[y.key])[rng.int(2)];
  const qty = 4 + rng.int(5); // 4..8
  const days = deadlineDays(here, dest, 5);
  const payout = Math.round(good.base * qty * 1.7) + Math.round(dist2(here, dest) / 600);
  return {
    id, type: 'delivery', faction: here.faction, payout, repReward: 6, deadlineDay: day + days,
    good: good.key, qty, destPortId: dest.id,
    title: 'CARGO RUN — ' + good.name.toUpperCase() + ' TO ' + dest.name.toUpperCase(),
    desc: factionName(here.faction) + ' wants ' + qty + ' ' + good.name.toLowerCase() + ' carried to ' +
      dest.name + ' inside ' + days + ' days. ' + payout + ' stores on delivery — bring your own cargo.',
  };
}

function smuggleContract(run: RunState, here: PortDef, ports: PortDef[], day: number, id: number, rng: Rng): Contract | null {
  const dests = ports.filter((p) => p.id !== here.id && run.rep[p.faction] > -50);
  if (!dests.length) return null;
  const dest = rng.pick(dests);
  const contraband = [GOODS.find((g) => g.key === 'powder')!, GOODS.find((g) => g.key === 'rum')!, GOODS.find((g) => g.key === 'silk')!];
  const good = rng.pick(contraband);
  const qty = 4 + rng.int(5);
  const days = deadlineDays(here, dest, 4); // tighter than honest work
  const payout = Math.round(good.base * qty * 2.3) + Math.round(dist2(here, dest) / 500);
  return {
    id, type: 'smuggle', faction: here.faction, payout, repReward: 7, deadlineDay: day + days,
    good: good.key, qty, destPortId: dest.id, contraband: true,
    title: 'RUN THE BLOCKADE — ' + good.name.toUpperCase() + ' TO ' + dest.name.toUpperCase(),
    desc: 'Quiet cargo, no manifest. ' + qty + ' ' + good.name.toLowerCase() + ' to ' + dest.name + ' in ' +
      days + ' days. ' + payout + ' stores — and the Crown must not be the one to find it.',
  };
}

function bountyContract(here: PortDef, day: number, id: number, rng: Rng): Contract {
  const targetFaction: FactionKey =
    here.faction === 'crown' ? 'brethren' : here.faction === 'brethren' ? 'crown' : (rng.random() < 0.5 ? 'crown' : 'brethren');
  const cls = rng.pick<ShipClass>(['sloop', 'brig', 'frigate']);
  const name = rng.pick(BOUNTY_NAMES);
  const payout = BOUNTY_PAY[cls] + rng.int(20);
  const days = 10 + rng.int(8);
  return {
    id, type: 'bounty', faction: here.faction, payout, repReward: 8, deadlineDay: day + days,
    bountyName: name, bountyCls: cls, bountyFaction: targetFaction,
    title: 'BOUNTY — ' + name.toUpperCase(),
    desc: name + ', a ' + CLASSES[cls].name.toLowerCase() + ' under ' + factionName(targetFaction) +
      ' colors, is wanted taken or sunk. ' + payout + ' stores. ' + days + ' days before the warrant lapses.',
  };
}

/**
 * The work pinned to the board at `here`, deterministic per port + day. The
 * port's flag shapes the offers: the Crown wants pirates hunted, the Brethren
 * want cargo run quiet, everyone wants something carried somewhere.
 */
export function generateBoard(run: RunState, here: PortDef, day: number): Contract[] {
  const rng = new Rng((PORTS.indexOf(here) + 1) * 7919 + day * 104729 + 1);
  const ports = knownPorts(run.revealedSecrets);
  const out: Contract[] = [];
  const add = (c: Contract | null): void => { if (c) out.push(c); };
  let id = run.nextContractId;

  // every board carries one cargo run
  add(deliveryContract(run, here, ports, day, id++, rng));
  // the port's character decides the rest
  if (here.faction === 'crown') {
    add(bountyContract(here, day, id++, rng));
    if (rng.random() < 0.5) add(deliveryContract(run, here, ports, day, id++, rng));
  } else if (here.faction === 'brethren') {
    add(smuggleContract(run, here, ports, day, id++, rng));
    add(bountyContract(here, day, id++, rng));
  } else {
    // la Compañía: trade and the quiet kind of trade
    add(smuggleContract(run, here, ports, day, id++, rng));
    if (rng.random() < 0.5) add(bountyContract(here, day, id++, rng));
  }
  run.nextContractId = id;
  return out;
}

/* ============ lifecycle ============ */

export function acceptContract(run: RunState, c: Contract): boolean {
  if (run.contracts.length >= MAX_ACTIVE || run.contracts.some((x) => x.id === c.id)) return false;
  run.contracts.push(c);
  run.jobBoard = run.jobBoard.filter((x) => x.id !== c.id);
  return true;
}

function payOut(run: RunState, c: Contract, events: EventQueue): void {
  run.stores += c.payout;
  repBump(run, c.faction, c.repReward);
  if (c.type === 'smuggle') {
    repBump(run, 'brethren', 4); // the quiet trade earns quiet friends
    repBump(run, 'crown', -6); // and the Crown notices the empty blockade
  }
  run.contracts = run.contracts.filter((x) => x.id !== c.id);
  events.feed('Contract paid — ' + c.payout + ' stores, and ' + factionName(c.faction) + ' remembers it.');
  events.emit({
    kind: 'toast',
    title: c.type === 'bounty' ? 'BOUNTY CLAIMED' : c.type === 'smuggle' ? 'CARGO RUN — DELIVERED' : 'CARGO DELIVERED',
    sub: '+' + c.payout + ' stores · ' + factionName(c.faction) + ' remembers it',
    tone: 'gold',
  });
}

/** Try to settle any cargo contracts when you dock at `portId`. */
export function deliverAtPort(run: RunState, portId: string, day: number, events: EventQueue): void {
  for (const c of [...run.contracts]) {
    if ((c.type !== 'delivery' && c.type !== 'smuggle') || c.destPortId !== portId) continue;
    if (day > c.deadlineDay) continue; // expiry sweep handles the failure + feed
    const have = run.cargo[c.good!] || 0;
    if (have < c.qty!) {
      events.feed('Your contact eyes your hold. “' + c.qty + ' ' + GOODS.find((g) => g.key === c.good)!.name.toLowerCase() +
        ' was the deal. Come back with all of it.”');
      continue;
    }
    run.cargo[c.good!] = have - c.qty!;
    payOut(run, c, events);
  }
}

/** Defeating a bounty's quarry (taken or sunk) settles the warrant. */
export function completeBounty(run: RunState, bountyId: number, events: EventQueue): void {
  const c = run.contracts.find((x) => x.id === bountyId && x.type === 'bounty');
  if (!c) return;
  events.feed('“' + c.bountyName + '” will trouble these waters no more.');
  payOut(run, c, events);
}

/** The first active bounty, if any (the world spawns its quarry). */
export function activeBounty(run: RunState): Contract | null {
  return run.contracts.find((c) => c.type === 'bounty') ?? null;
}

/** Sweep lapsed contracts each day — a missed deadline costs you standing. */
export function expireContracts(run: RunState, day: number, events: EventQueue): void {
  const live: Contract[] = [];
  for (const c of run.contracts) {
    if (day > c.deadlineDay) {
      repBump(run, c.faction, -Math.ceil(c.repReward * 0.8));
      events.feed('A contract lapsed — ' + c.title.toLowerCase() + '. ' + factionName(c.faction) + ' will not forget the waste.');
    } else {
      live.push(c);
    }
  }
  run.contracts = live;
}

/** Days left on a contract, for the UI. */
export function daysLeft(c: Contract, day: number): number {
  return Math.max(0, c.deadlineDay - day);
}
