import type { Captain, DoctrineKey, RefitKey, ShipClass } from './constants';
import type { GoodKey } from './economy';
import type { FactionKey } from './worldgen';

export type Team = 'p' | 'e';

export interface Ship {
  cls: ShipClass;
  team: Team;
  x: number;
  y: number;
  heading: number;
  speed: number;
  rudder: number; // -1..1
  sailIdx: number; // 0..2
  maxSpd: number;
  turn: number;
  len: number;
  beam: number;
  gunsMax: number;
  gunsLeft: [number, number]; // [port, stbd]
  hull: number;
  maxHull: number;
  sailHP: number;
  crew: number;
  maxCrew: number;
  rudderHP: number;
  mastStage: number; // 0 sound, 1 topmasts hit, 2 mast down
  reload: [number, number];
  ammo: number; // index into AMMO
  sinking: number; // 0 = afloat, >0 = seconds spent sinking
  struck: boolean;
  gauge: boolean;
  name: string;
  captain: Captain | null;
  doctrine: DoctrineKey | null;
  evade: number;
  evadeDir: number;
  wakeT: number;
  dead: boolean;
  /** which flag she flies — drives livery and reputation consequences */
  faction?: FactionKey;
  /** the Drowned ignore the wind you spent a whole run learning */
  ghost?: boolean;
}

export interface Ball {
  sx: number;
  sy: number;
  lx: number;
  ly: number;
  t: number;
  T: number;
  dir: number;
  ammo: number;
  team: Team;
  vid: number;
}

export interface Wind {
  dir: number;
  drift: number;
}

export interface PendingFire {
  ship: Ship;
  side: number;
  t: number;
}

export type BattlePhase = 'sail' | 'board' | 'end';

/* ============ run meta-layer ============ */

export interface FlagshipState {
  cls: ShipClass;
  hullPct: number;
  sailHP: number;
  crewPct: number;
  rudderHP: number;
  gunDef: [number, number];
}

export interface ArmadaEntry {
  cls: ShipClass;
  name: string;
  captain: Captain;
}

export interface Prize {
  cls: ShipClass;
  name: string;
  crew: number;
}

export interface RunState {
  battle: number;
  /** position in the guided objective chain (sim/objectives.ts) */
  objIdx: number;
  stores: number;
  pool: number;
  up: Record<RefitKey, number>;
  flag: FlagshipState;
  armada: ArmadaEntry[];
  pendingPrizes: Prize[];
  stats: { prizes: number; sunk: number };
  cargo: Record<GoodKey, number>;
  rep: Record<FactionKey, number>;
}
