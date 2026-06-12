// LOCKED tuning constants, ported verbatim from reference/broadside-slice.html.
// Do not change without a FEEL: commit and telling the human. See CLAUDE.md.

export interface ClassDef {
  name: string;
  maxSpd: number;
  turn: number;
  hull: number;
  crew: number;
  guns: number;
  len: number;
  beam: number;
}

export type ShipClass = 'sloop' | 'brig' | 'frigate';

export const CLASSES: Record<ShipClass, ClassDef> = {
  sloop: { name: 'Sloop', maxSpd: 135, turn: 1.55, hull: 75, crew: 60, guns: 4, len: 54, beam: 16 },
  brig: { name: 'Brig', maxSpd: 112, turn: 1.15, hull: 115, crew: 100, guns: 6, len: 68, beam: 20 },
  frigate: { name: 'Frigate', maxSpd: 96, turn: 0.85, hull: 170, crew: 150, guns: 9, len: 84, beam: 25 },
};

export const SHIP_NAMES = [
  'Esperanza', 'Triton', 'Vengador', 'Cormorant', 'Santa Rosa', 'Harrier',
  'Dunkirk', 'Marisol', 'Pelican', 'Alba', 'Reprisal', 'Cardenal',
];

export type DoctrineKey = 'bulldog' | 'surgeon' | 'corsair';

export interface DoctrineDef {
  label: string;
  range: number;
  astern: boolean;
}

export const DOCTRINES: Record<DoctrineKey, DoctrineDef> = {
  bulldog: { label: 'THE BULLDOG · closes to point blank', range: 95, astern: false },
  surgeon: { label: 'THE SURGEON · holds 200 yds, shreds sails', range: 210, astern: false },
  corsair: { label: 'THE CORSAIR · hunts the stern rake', range: 150, astern: true },
};

export type Captain = [name: string, doctrine: DoctrineKey];

export const CAPTAINS: Captain[] = [
  ['Ibarra', 'bulldog'], ['Quist', 'surgeon'], ['Mosquera', 'corsair'], ['Renard', 'corsair'],
  ['Holt', 'bulldog'], ['Ife', 'surgeon'], ['Drake', 'bulldog'], ['Sayer', 'surgeon'],
];

export const SAILS = [0, 0.5, 1] as const;
export const SAILNAMES = ['FURLED', 'HALF SAIL', 'FULL SAIL'] as const;

export interface AmmoDef {
  name: string;
  rangeMul: number;
  hull: number;
  sail: number;
  crew: number;
}

export const AMMO: AmmoDef[] = [
  { name: 'Round', rangeMul: 1.0, hull: 7, sail: 1, crew: 1 },
  { name: 'Chain', rangeMul: 0.72, hull: 2, sail: 9, crew: 0.5 },
  { name: 'Grape', rangeMul: 0.5, hull: 1, sail: 0, crew: 6 },
];

export const GUN_RANGE = 300;
export const BALL_SPD = 270;
export const RELOAD_BASE = 5.5;
export const ARC = 0.62;
export const ARENA_R = 1700;

/** Fixed simulation timestep (s). The prototype ran variable dt clamped to 0.05;
 *  the port runs deterministic 60 Hz with the same dt-scaled formulas. */
export const SIM_DT = 1 / 60;

/* ============ run structure (vertical slice) ============ */

export interface Wave {
  ships: ShipClass[];
  desc: string;
}

export const ESCALATION: Wave[] = [
  { ships: ['sloop'], desc: 'a lone sloop, easy prey' },
  { ships: ['brig'], desc: 'a merchant brig with teeth' },
  { ships: ['sloop', 'sloop'], desc: 'two sloops hunting as a pair' },
  { ships: ['frigate'], desc: 'a patrol frigate' },
  { ships: ['brig', 'brig'], desc: 'an escorted convoy — two brigs' },
  { ships: ['frigate', 'brig'], desc: 'THE PLATE SHIP and her escort' },
];

export const PRIZE_VALUE: Record<ShipClass, number> = { sloop: 30, brig: 50, frigate: 80 };
export const CREW_COST: Record<ShipClass, number> = { sloop: 30, brig: 45, frigate: 70 };

export type RefitKey = 'canvas' | 'guns' | 'timbers';

export const STRIP_LOOT: Record<ShipClass, [RefitKey, string]> = {
  sloop: ['canvas', 'CANVAS — +8% speed'],
  brig: ['guns', 'GUNS — +1 cannon per side'],
  frigate: ['timbers', 'TIMBERS — +20% hull'],
};
