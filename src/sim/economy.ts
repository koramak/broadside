// Goods, cargo holds, and port pricing. Buy low in the west, sell high in the
// east — the price gradient pays you to sail toward danger.

import type { ShipClass } from './constants';
import type { RunState } from './types';

export type GoodKey = 'sugar' | 'rum' | 'powder' | 'timber' | 'silk' | 'spice';

export interface GoodDef {
  key: GoodKey;
  name: string;
  base: number; // baseline price in stores
}

export const GOODS: GoodDef[] = [
  { key: 'sugar', name: 'Sugar', base: 8 },
  { key: 'rum', name: 'Rum', base: 14 },
  { key: 'powder', name: 'Powder', base: 18 },
  { key: 'timber', name: 'Timber', base: 10 },
  { key: 'silk', name: 'Silk', base: 30 },
  { key: 'spice', name: 'Spice', base: 24 },
];

/** Hold size per hull. Consorts add theirs — the armada is also a convoy. */
export const CARGO_CAP: Record<ShipClass, number> = { sloop: 20, brig: 40, frigate: 60 };

export function fleetCargoCap(run: RunState): number {
  return CARGO_CAP[run.flag.cls] + run.armada.reduce((t, a) => t + CARGO_CAP[a.cls], 0);
}

export function cargoLoad(run: RunState): number {
  return GOODS.reduce((t, g) => t + (run.cargo[g.key] || 0), 0);
}

/**
 * Price of a good at a port: base × port bias × a slow wobble that drifts
 * with the run's day counter (so prices breathe between visits, deterministically).
 */
export function priceAt(bias: Record<GoodKey, number>, good: GoodDef, day: number, portSeed: number): number {
  const w = Math.sin(day * 0.7 + portSeed * 3.1 + good.base) * 0.12;
  return Math.max(2, Math.round(good.base * bias[good.key] * (1 + w)));
}

/* ============ rumors: tavern intelligence that's actually true ============ */

const RUMOR_SHAPES = [
  (g: string, p: string, n: number) => `${p} pays ${n} for ${g.toLowerCase()} — a wedding, a funeral, don’t ask.`,
  (g: string, p: string, n: number) => `They’re short of ${g.toLowerCase()} at ${p}. ${n} a cask and no questions.`,
  (g: string, p: string, n: number) => `A clerk at ${p} writes ${n} against ${g.toLowerCase()} and weeps doing it.`,
  (g: string, p: string, n: number) => `${g} fetches ${n} at ${p}, if you can get there before everyone in this room.`,
];

export interface PortLike {
  id: string;
  name: string;
  bias: Record<GoodKey, number>;
}

/** Refresh the run's rumor sheet at a tavern: real high prices elsewhere,
 *  phrased like gossip. Keeps up to 3 live tips, 12-day shelf life. */
export function refreshRumors(
  run: RunState,
  ports: readonly PortLike[],
  herePortId: string,
  day: number,
): void {
  run.rumors = run.rumors.filter((r) => day - r.day < 12 && r.portId !== herePortId);
  // best spreads vs base, excluding the port you're standing in
  const tips: { score: number; good: GoodDef; port: PortLike; price: number }[] = [];
  ports.forEach((p, idx) => {
    if (p.id === herePortId) return;
    for (const g of GOODS) {
      const price = priceAt(p.bias, g, day + 2, idx);
      const score = price / g.base;
      if (score > 1.25) tips.push({ score, good: g, port: p, price });
    }
  });
  tips.sort((a, b) => b.score - a.score);
  for (const t of tips) {
    if (run.rumors.length >= 3) break;
    if (run.rumors.some((r) => r.good === t.good.key && r.portId === t.port.id)) continue;
    const shape = RUMOR_SHAPES[(t.good.base + t.port.name.length + day) % RUMOR_SHAPES.length];
    run.rumors.push({
      text: shape(t.good.name, t.port.name, t.price),
      good: t.good.key,
      portId: t.port.id,
      day,
    });
  }
}

/** Jettison overflow when the fleet shrinks. Returns units lost. */
export function clampCargo(run: RunState): number {
  let over = cargoLoad(run) - fleetCargoCap(run);
  let lost = 0;
  if (over <= 0) return 0;
  // dump in reverse value order — the crew saves the silk first
  const order = [...GOODS].sort((a, b) => a.base - b.base);
  for (const g of order) {
    if (over <= 0) break;
    const take = Math.min(run.cargo[g.key] || 0, over);
    run.cargo[g.key] -= take;
    over -= take;
    lost += take;
  }
  return lost;
}
