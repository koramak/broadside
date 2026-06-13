import type { Captain, DoctrineKey, RefitKey, ShipClass } from './constants';
import type { GoodKey } from './economy';
import type { FactionKey } from './worldgen';
import type { Contract } from './contracts';

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
  /** 0..100 morale for a consort under your flag; seeded from the armada
   *  entry at battle start, drifts during the fight, written back at its end.
   *  undefined for the flagship and all enemies. */
  loyalty?: number;
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
  /** 0..100 morale. High → fights harder, obeys instantly. Low → hesitates,
   *  ignores orders. Rock-bottom → she sails off with the hull. See captains.ts. */
  loyalty: number;
}

export interface Prize {
  cls: ShipClass;
  name: string;
  crew: number;
}

export interface Rumor {
  text: string;
  good: string;
  portId: string;
  /** run-day the rumor was heard; tavern tips go stale after ~12 days */
  day: number;
  /** 'tavern' tips expire/refresh on docking; 'log' tips persist until used */
  source?: 'tavern' | 'log';
}

export interface RunState {
  battle: number;
  /** position in the guided objective chain (sim/objectives.ts) */
  objIdx: number;
  /** tavern intelligence — real price spreads, irreverently worded */
  rumors: Rumor[];
  /** persistent feed history for the Captain's Log (newest pushed last, capped) */
  chronicle: string[];
  /** notable intel pulled from captured logs (charted ports, marked wrecks) */
  discoveries: string[];
  /** ids of secret settlements a captured log has revealed */
  revealedSecrets: string[];
  /** floating-salvage sites marked by captured logs, waiting to materialize */
  shipwrecks: { x: number; y: number }[];
  /** chandler gear: bolt-on historical upgrades */
  gear: { swivels: boolean; pumps: boolean };
  stores: number;
  pool: number;
  up: Record<RefitKey, number>;
  flag: FlagshipState;
  armada: ArmadaEntry[];
  pendingPrizes: Prize[];
  stats: { prizes: number; sunk: number };
  cargo: Record<GoodKey, number>;
  rep: Record<FactionKey, number>;
  /** contracts you've taken on — escort/deliver/smuggle/hunt, with deadlines */
  contracts: Contract[];
  /** work posted at the port you're docked in (regenerated each visit) */
  jobBoard: Contract[];
  /** monotonic id source for contracts (ties a bounty to its quarry) */
  nextContractId: number;
}
