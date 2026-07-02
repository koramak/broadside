// HERE BE MONSTERS — the three off-chart horrors, one per edge of the map.
// The art canon promises rare ships "made of the wrong materials: driftwood
// and bone, bottle glass, black pearl" — these are them. Each is enemy-only,
// once per run, late-run gated, and each breaks a DIFFERENT rule the player
// has spent the whole game internalizing (the Drowned keep wind-immunity as
// the Mist's own brand):
//   THE SCRIMSHANDER (bone, west)  — pivots at any speed; committed turning
//                                    does not apply to a thing with a spine.
//   THE GREENGLASS  (glass, south) — her volleys show NO fall-of-shot rings;
//                                    you read her gunports, not the water.
//   THE NACRE       (pearl, north) — her hull re-layers itself; damage is
//                                    not permanent unless you overwhelm it.
// All numbers here are FEEL dials (new system, nothing locked).

import type { ShipClass } from './constants';

export type MonsterId = 'scrimshander' | 'greenglass' | 'nacre';

export interface MonsterDef {
  id: MonsterId;
  name: string;
  desc: string; // encounter line ("To quarters — ...")
  warn: string; // fed once when the player nears the zone
  rise: string; // fed as the fight begins
  slain: string; // fed on the kill
  trophy: { label: string; desc: string };
  /** off-chart water where she keeps: axis-aligned box in sim coordinates */
  zone: { x1: number; y1: number; x2: number; y2: number };
  base: ShipClass;
  hullMul: number;
  crewMul: number;
  spdMul: number;
  turnMul: number;
  /** stores paid by what she was carrying / made of */
  purse: number;
}

/** Monsters only rise this late in the run — endgame challenges, not ambushes. */
export const MONSTER_GATE_BATTLE = 5;

/** The Nacre re-lays hull this fast (points/second) while she floats. */
export const NACRE_REGEN = 2.6;

export const MONSTERS: MonsterDef[] = [
  {
    id: 'scrimshander',
    name: 'THE SCRIMSHANDER',
    desc: 'a hull of lashed whalebone, turning to face you without turning at all',
    warn: 'West of here the charts go quiet. Whalers used to work this water. Used to.',
    rise: 'Bone rises off the beam — lashed ribs, scrimshawed teeth, and gunports where the eyes should be.',
    slain: 'The Scrimshander comes apart into a white slick of bone. The sea takes it back an ounce at a time.',
    trophy: {
      label: 'SCRIMSHAW CHARMS',
      desc: 'carved teeth for every hand — boarding windows open 15% wider',
    },
    zone: { x1: -7000, y1: -800, x2: -6350, y2: 4800 },
    base: 'frigate',
    hullMul: 2.2,
    crewMul: 2,
    spdMul: 0.55,
    turnMul: 1.0,
    purse: 90,
  },
  {
    id: 'greenglass',
    name: 'THE GREENGLASS',
    desc: 'a ship of bottle glass — you will not see her shot until it lands',
    warn: 'South of here sailors report a green light under the swells. The reports stop there.',
    rise: 'The swell goes the color of old bottles. Something transparent is standing in toward you, and her guns are already out.',
    slain: 'The Greenglass shatters — a reef of bright wrong-colored sand, falling forever.',
    trophy: {
      label: 'GREENGLASS LENS',
      desc: 'ground from her hull — your broadsides land tight, as if you always held the gauge',
    },
    zone: { x1: -5000, y1: 4150, x2: 4000, y2: 4800 },
    base: 'frigate',
    hullMul: 1.25,
    crewMul: 1.5,
    spdMul: 1.05,
    turnMul: 1.15,
    purse: 80,
  },
  {
    id: 'nacre',
    name: 'THE NACRE',
    desc: 'black pearl over black timber — her wounds close while you watch',
    warn: 'North of here the water is deep past argument. Things grow slowly down there. Some of them finished growing.',
    rise: 'She comes up glossy and whole, black pearl laid over black timber, and the sea smooths itself behind her.',
    slain: 'The Nacre cracks along a seam no gunner aimed for and goes down shining.',
    trophy: {
      label: 'NACRE PLATING',
      desc: 'pearl-laid strakes — your flagship takes 15% less hull damage',
    },
    zone: { x1: -2000, y1: -4800, x2: 5000, y2: -4150 },
    base: 'frigate',
    hullMul: 1.6,
    crewMul: 1.8,
    spdMul: 0.85,
    turnMul: 0.9,
    purse: 100,
  },
];

export function monsterById(id: string | undefined): MonsterDef | null {
  return MONSTERS.find((m) => m.id === id) ?? null;
}

/** Which monster's water is this point in? `margin` grows (+) or shrinks (−)
 *  the zone: + for the warning ring, − for the deep trigger. */
export function monsterZoneAt(x: number, y: number, margin: number): MonsterDef | null {
  for (const m of MONSTERS) {
    const z = m.zone;
    if (x >= z.x1 - margin && x <= z.x2 + margin && y >= z.y1 - margin && y <= z.y2 + margin) return m;
  }
  return null;
}
