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
