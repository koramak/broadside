// Run meta-layer: persistent flagship, stores economy, pressed hands pool,
// armada roster, prize decisions. Ported faithfully from the slice.

import { CAPTAINS, CLASSES, CREW_COST, PRIZE_VALUE, STRIP_LOOT } from './constants';
import type { ClassDef, ShipClass } from './constants';
import type { FactionKey } from './worldgen';
import { ISLANDS, WORLD, knownPorts, unrevealedSecrets } from './worldgen';
import { GOODS, clampCargo } from './economy';
import { clamp } from './math';
import { Rng } from './rng';
import type { EventQueue } from './events';
import type { ArmadaEntry, RunState } from './types';
import { EASY } from './easing';
import { LOYALTY, clampLoyalty, legendById, legendQuirk } from './captains';

export function newRun(): RunState {
  return {
    battle: 1,
    objIdx: 0,
    rumors: [],
    chronicle: [],
    discoveries: [],
    revealedSecrets: [],
    shipwrecks: [],
    salvageMarks: [],
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
    contracts: [],
    jobBoard: [],
    nextContractId: 1,
    legendsHired: [],
    portEvent: null,
    lastPortEventKey: '',
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

/* ============ the Captain's Log: chronicle + captured intel ============ */

const CHRON_CAP = 150;
const DISC_CAP = 30;

/** Append a line to the run's persistent chronicle (newest last). */
export function chronicle(run: RunState, text: string): void {
  run.chronicle.push(text);
  if (run.chronicle.length > CHRON_CAP) run.chronicle.shift();
}

function discovery(run: RunState, text: string): void {
  run.discoveries.unshift(text);
  if (run.discoveries.length > DISC_CAP) run.discoveries.pop();
}

function addPriceTip(run: RunState, rng: Rng, events: EventQueue, smudged: boolean): void {
  const ports = knownPorts(run.revealedSecrets);
  const g = GOODS[rng.int(GOODS.length)];
  let best = ports[0];
  for (const p of ports) if (p.bias[g.key] > best.bias[g.key]) best = p;
  const price = Math.round(g.base * best.bias[g.key]);
  const text =
    (smudged ? '(water-stained) ' : '') + best.name + ' pays about ' + price + ' for ' + g.name.toLowerCase();
  run.rumors = run.rumors.filter((r) => !(r.good === g.key && r.portId === best.id));
  run.rumors.push({ text, good: g.key, portId: best.id, day: run.battle, source: 'log' });
  events.feed('Her log: ' + text);
}

function markShipwreck(run: RunState, rng: Rng, events: EventQueue): void {
  const cand = ISLANDS.filter((i) => i.x < WORLD.mistX - 300);
  const isl = cand[rng.int(cand.length)];
  const a = rng.rnd(0, Math.PI * 2);
  const d = isl.r + rng.rnd(180, 380);
  const wx = isl.x + Math.cos(a) * d;
  const wy = isl.y + Math.sin(a) * d;
  run.shipwrecks.push({ x: wx, y: wy }); // spawns the floating crates
  run.salvageMarks.push({ x: wx, y: wy }); // and a persistent mark on the chart
  const line = 'Her log marks a wreck off the reefs — cargo still bobbing free.';
  events.feed(line);
  discovery(run, '⚓ ' + line + ' A salvage site is on your chart.');
}

function revealSecret(run: RunState, rng: Rng, events: EventQueue): boolean {
  const hidden = unrevealedSecrets(run.revealedSecrets);
  if (!hidden.length) return false;
  const p = hidden[rng.int(hidden.length)];
  run.revealedSecrets.push(p.id);
  const line = p.name + ' — a port on no honest chart. Now it is on yours.';
  events.feed('A secret in the margins: ' + line);
  discovery(run, '★ ' + line);
  return true;
}

/**
 * Read a captured ship's log. 'full' (a taken prize) rolls richer than
 * 'fragment' (fished from a wreck): a price tip, sometimes a marked shipwreck,
 * rarely a secret settlement. One more reason taking beats sinking.
 */
export function rollPrizeLog(
  run: RunState,
  rng: Rng,
  events: EventQueue,
  quality: 'full' | 'fragment' = 'full',
): void {
  const roll = rng.random();
  if (quality === 'fragment') {
    if (roll < 0.4) addPriceTip(run, rng, events, true);
    return;
  }
  if (roll < 0.55) addPriceTip(run, rng, events, false);
  else if (roll < 0.85) markShipwreck(run, rng, events);
  else if (!revealSecret(run, rng, events)) addPriceTip(run, rng, events, false);
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

/** Max consorts under your flag (3 ships total with the flagship). */
export const ARMADA_CAP = 2;

/** Stores recovered for paying off a consort you release to a lieutenant. */
export function consortPayoff(cls: ShipClass): number {
  return Math.round(PRIZE_VALUE[cls] * 0.5);
}

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
  if (run.armada.length >= ARMADA_CAP || run.stores < buy) return false;
  run.pool = Math.max(0, run.pool - hands);
  run.stores -= buy;
  const cap = CAPTAINS[Math.floor(rng.rnd(CAPTAINS.length))];
  run.armada.push({ cls: p.cls, name: p.name, captain: cap, loyalty: LOYALTY.start });
  run.pendingPrizes.splice(i, 1);
  return true;
}

/** Take a prize into a full armada by paying off the consort at `consortIdx`. */
export function replaceConsort(run: RunState, prizeIdx: number, consortIdx: number, rng: Rng): boolean {
  const p = run.pendingPrizes[prizeIdx];
  const released = run.armada[consortIdx];
  if (!p || !released) return false;
  const buy = prizeShortfall(run, p.cls);
  if (run.stores < buy) return false;
  run.stores += consortPayoff(released.cls); // she's sold off down the coast
  run.armada.splice(consortIdx, 1);
  run.pool = Math.max(0, run.pool - prizeHands(p.cls));
  run.stores -= buy;
  const cap = CAPTAINS[Math.floor(rng.rnd(CAPTAINS.length))];
  run.armada.push({ cls: p.cls, name: p.name, captain: cap, loyalty: LOYALTY.start });
  run.pendingPrizes.splice(prizeIdx, 1);
  return true;
}

/* ============ loyalty: keeping (or losing) the crew of captains ============ */

/** Spend stores to win a consort's goodwill back — a night ashore, a fair
 *  split of the plunder. The harbor lever that closes the loyalty loop. */
export function carouse(run: RunState, idx: number): boolean {
  const a = run.armada[idx];
  if (!a || a.loyalty >= LOYALTY.max || run.stores < LOYALTY.carouseCost) return false;
  run.stores -= LOYALTY.carouseCost;
  a.loyalty = clampLoyalty(a.loyalty + LOYALTY.carouseGain);
  return true;
}

/** Remove any consort whose morale has hit rock bottom — she sails off with
 *  her hull (and whatever was in it). A 'steadfast' legend never leaves, no
 *  matter how low you take her. Returns who left, for the feed/log. */
export function desertionSweep(run: RunState): ArmadaEntry[] {
  const willDesert = (a: ArmadaEntry): boolean =>
    a.loyalty <= LOYALTY.desertAt && legendQuirk(a.legend) !== 'steadfast';
  const gone = run.armada.filter(willDesert);
  if (gone.length) run.armada = run.armada.filter((a) => !willDesert(a));
  return gone;
}

/** Sign a legendary captain drinking at a port — she brings her own hull and
 *  her own opinions, and can only be hired once per run. */
export function recruitLegend(run: RunState, legendId: string): boolean {
  const l = legendById(legendId);
  if (!l || run.legendsHired.includes(l.id)) return false;
  if (run.armada.length >= ARMADA_CAP || run.stores < l.cost) return false;
  run.stores -= l.cost;
  run.legendsHired.push(l.id);
  run.armada.push({
    cls: l.ship.cls, name: l.ship.name, captain: [l.name, l.doctrine], loyalty: l.startLoyalty, legend: l.id,
  });
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

/* ============ flagship trade-up ============ */

/** A freshly struck hull is worn, not pristine — you inherit her condition. */
export const HOIST_HULL_PCT = 0.6;

/**
 * Hoist your flag aboard a captured hull — the climactic trade-up the loop was
 * missing. Your veteran crew rows across (a bigger hull means thinner ranks
 * until you muster) and your hard-won refits re-rig onto her. She comes as she
 * was taken: knocked about, guns intact. The old flagship is paid off down the
 * coast for her prize value — but the name "Persistence" sails on with you.
 * Returns the OLD class so the caller can rebuild the map ship + its mesh.
 */
export function hoistFlag(run: RunState, prizeIdx: number): ShipClass | null {
  const p = run.pendingPrizes[prizeIdx];
  if (!p) return null;
  const oldCls = run.flag.cls;
  const crewAboard = run.flag.crewPct * CLASSES[oldCls].crew;
  const newCrewPct = clamp(crewAboard / CLASSES[p.cls].crew, 0, 1);
  run.stores += PRIZE_VALUE[oldCls]; // the old hull is sold off down the coast
  run.flag = {
    cls: p.cls,
    hullPct: HOIST_HULL_PCT,
    sailHP: 100,
    crewPct: newCrewPct,
    rudderHP: 100,
    gunDef: [0, 0],
  };
  run.pendingPrizes.splice(prizeIdx, 1);
  clampCargo(run); // a smaller hull may have to dump cargo (cap shrank)
  return oldCls;
}
