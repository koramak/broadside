// The authored archipelago: islands, ports, factions, story markers, regions.
// Hand-placed, not generated — a small pre-programmed world (CLAUDE.md goal).
// West is home. East is rich, hostile, and eventually wrong.

import type { GoodKey } from './economy';
import type { ShipClass } from './constants';

export type FactionKey = 'crown' | 'compania' | 'brethren';

export interface FactionDef {
  key: FactionKey;
  name: string;
  blurb: string;
}

export const FACTIONS: FactionDef[] = [
  { key: 'crown', name: 'The Crown', blurb: 'Colonial office, navy yards, a gallows with your name misspelled on it.' },
  { key: 'compania', name: 'La Compañía', blurb: 'A trading house so old it considers the sea a junior partner.' },
  { key: 'brethren', name: 'The Free Brethren', blurb: 'No flags, no taxes, no questions. Mostly no teeth, either.' },
];

export interface Island {
  x: number;
  y: number;
  r: number;
  palms?: boolean;
}

export interface PortDef {
  id: string;
  name: string;
  faction: FactionKey;
  x: number;
  y: number;
  islandIdx: number;
  bias: Record<GoodKey, number>;
  tavern: string[];
  /** hidden until a captured ship's log reveals it */
  secret?: boolean;
}

export interface StoryAction {
  n: number;
  x: number;
  y: number;
}

export const WORLD = {
  width: 14000, // x: -7000 .. 7000
  height: 9600, // y: -4800 .. 4800
  /** east of this line lies the Mist (Milestone 4 country) */
  mistX: 6100,
};

export const ISLANDS: Island[] = [
  // western home cluster
  { x: -5400, y: -900, r: 420, palms: true }, // 0 Port Resolve
  { x: -4400, y: 2300, r: 380, palms: true }, // 1 Santa Brígida
  { x: -4900, y: -2900, r: 330 }, // 2 Wreckers' Bay
  { x: -6100, y: 1100, r: 260, palms: true }, // 3
  { x: -3500, y: 300, r: 220 }, // 4
  // middle trades
  { x: -300, y: 2000, r: 430, palms: true }, // 5 Puerto Corona
  { x: 700, y: -2600, r: 390 }, // 6 Fort Albemarle
  { x: -1500, y: -1300, r: 240 }, // 7
  { x: -700, y: -3600, r: 200 }, // 8
  { x: 1500, y: 900, r: 250, palms: true }, // 9
  // far reefs
  { x: 3900, y: -800, r: 360 }, // 10 The Tessellate
  { x: 3100, y: 1900, r: 230 }, // 11
  { x: 4600, y: -3000, r: 260 }, // 12
  { x: 5400, y: 700, r: 200 }, // 13
  { x: 2600, y: -1900, r: 180 }, // 14
  // secret coves — only drawn once a captured log reveals them
  { x: -2050, y: 3650, r: 190, palms: true }, // 15 Graves' Ait
  { x: 5650, y: 2700, r: 170 }, // 16 Port Nones (Mist-edge)
];

export const PORTS: PortDef[] = [
  {
    id: 'resolve', name: 'Port Resolve', faction: 'crown', x: -5400, y: -420, islandIdx: 0,
    bias: { sugar: 1.0, rum: 1.3, powder: 0.8, timber: 0.7, silk: 1.5, spice: 1.4 },
    tavern: [
      'The garrison commander waters the rum and calls it temperance.',
      'They hanged a man last Tuesday for smuggling. The rope was smuggled.',
      'A clerk swears the Plate Fleet is real, and late, and very heavy.',
    ],
  },
  {
    id: 'brigida', name: 'Santa Brígida', faction: 'compania', x: -4400, y: 2700, islandIdx: 1,
    bias: { sugar: 0.6, rum: 0.8, powder: 1.2, timber: 1.0, silk: 1.4, spice: 1.3 },
    tavern: [
      'Sugar is cheaper than the sacks it ships in. The sacks are stolen.',
      'The Compañía pays in promissory notes. The sea pays in salvage.',
      'A planter bought a ghost story off a sailor for two reales. Overpaid, they say.',
    ],
  },
  {
    id: 'wreckers', name: "Wreckers' Bay", faction: 'brethren', x: -4900, y: -2520, islandIdx: 2,
    bias: { sugar: 1.1, rum: 0.7, powder: 1.1, timber: 0.9, silk: 1.2, spice: 1.2 },
    tavern: [
      'No questions asked. One question, maybe: did anyone follow you?',
      'The Brethren toast the Crown nightly — may she keep building ships for us.',
      'Old Marisol says the water east of the reefs has opinions now.',
    ],
  },
  {
    id: 'corona', name: 'Puerto Corona', faction: 'compania', x: -300, y: 2430, islandIdx: 5,
    bias: { sugar: 1.3, rum: 1.2, powder: 1.0, timber: 1.2, silk: 0.9, spice: 1.0 },
    tavern: [
      'Silk in, sugar out, bribes both directions. The harbor master calls it equilibrium.',
      'A navy lieutenant drinks here in plain clothes. The plain clothes are a uniform.',
      'They say the Plate Ship rides so low the fish file complaints.',
    ],
  },
  {
    id: 'albemarle', name: 'Fort Albemarle', faction: 'crown', x: 700, y: -2210, islandIdx: 6,
    bias: { sugar: 1.2, rum: 1.4, powder: 0.6, timber: 0.8, silk: 1.3, spice: 1.3 },
    tavern: [
      'Powder is cheap where everyone is ordered to be brave.',
      'The fort chaplain blesses the guns. The guns remain agnostic.',
      'Patrol charts mark the far reefs in red ink. The ink ran out before the Mist.',
    ],
  },
  {
    id: 'tessellate', name: 'The Tessellate', faction: 'brethren', x: 3900, y: -380, islandIdx: 10,
    bias: { sugar: 1.5, rum: 1.3, powder: 1.4, timber: 1.4, silk: 0.8, spice: 0.7 },
    tavern: [
      'Last honest port before the water goes strange. Honest is doing some work in that sentence.',
      'Spice comes west from somewhere nobody charts. Ask the spice. It will not say.',
      'A woman drank here who claimed she sailed INTO the Mist. She paid with dry coins.',
    ],
  },
  {
    id: 'graves', name: "Graves' Ait", faction: 'brethren', secret: true, x: -2050, y: 4040, islandIdx: 15,
    bias: { sugar: 1.6, rum: 0.5, powder: 1.5, timber: 1.3, silk: 1.7, spice: 1.6 },
    tavern: [
      'Not on any chart drawn by a living hand. That is the entire business model.',
      'Pay in coin or in silence. Silence is dearer and they prefer it.',
      'Everything sells high here because everything here is already stolen twice.',
    ],
  },
  {
    id: 'nones', name: 'Port Nones', faction: 'brethren', secret: true, x: 5650, y: 3060, islandIdx: 16,
    bias: { sugar: 0.4, rum: 0.4, powder: 0.5, timber: 0.5, silk: 2.0, spice: 2.0 },
    tavern: [
      'The harbour master has been dead since the last war and still keeps excellent books.',
      'Prices are wonderful. Do not ask what the buyers do with what they buy.',
      'You will leave before the bell that has no clapper rings. Everyone does. Most of them.',
    ],
  },
];

/** Ports the player can see/use: all the open ones, plus any secret cove a
 *  captured log has revealed. `revealed` is run.revealedSecrets. */
export function knownPorts(revealed: readonly string[]): PortDef[] {
  return PORTS.filter((p) => !p.secret || revealed.includes(p.id));
}

/** The hidden coves not yet revealed (a log can surface one of these). */
export function unrevealedSecrets(revealed: readonly string[]): PortDef[] {
  return PORTS.filter((p) => p.secret && !revealed.includes(p.id));
}

export const STORY_ACTIONS: StoryAction[] = [
  { n: 1, x: -3600, y: -500 },
  { n: 2, x: -2100, y: 1300 },
  { n: 3, x: -800, y: -1600 },
  { n: 4, x: 1600, y: 300 },
  { n: 5, x: 3000, y: -2300 },
  { n: 6, x: 5300, y: 1400 },
  // beyond the wall — only reachable once the Mist opens
  { n: 7, x: 6450, y: -600 },
  { n: 8, x: 6750, y: 1900 },
  { n: 9, x: 6950, y: -2400 },
];

/** The Mist's own escalation. Deliberately NOT in constants.ts — the locked
 *  six-action table stays untouched; this is what waits after it. */
export interface MistWave {
  ships: ShipClass[];
  desc: string;
  names: string[];
}

export const MIST_ESCALATION: MistWave[] = [
  {
    ships: ['sloop'],
    desc: 'something keeping pace upwind. That is not a thing ships do.',
    names: ['The Caulker’s Grief'],
  },
  {
    ships: ['brig', 'brig'],
    desc: 'a procession. They are not sailing the wind. They are remembering it.',
    names: ['Wet Bargain', 'The Unpaid'],
  },
  {
    ships: ['frigate', 'sloop'],
    desc: 'THE HARROW — the thing that has been collecting the sea’s debts',
    names: ['THE HARROW', 'Salt Tithe'],
  },
];

export const MIST_FEED = [
  'The water is the wrong kind of quiet.',
  'Your compass works fine. It just seems reluctant.',
  'The crew have stopped singing. The sea has not.',
];

export type Region = 'home' | 'trades' | 'reefs';

export function regionAt(x: number): Region {
  return x < -2500 ? 'home' : x < 1800 ? 'trades' : 'reefs';
}

/* ============ encounters ============ */

export type ContactBehavior = 'lane' | 'patrol' | 'hunt' | 'flee';

export interface ContactSpec {
  kind: string;
  label: string;
  faction?: FactionKey;
  ships: ShipClass[];
  behavior: ContactBehavior;
  loot: number; // bonus stores if you win
  desc: string;
  ghost?: boolean;
  names?: string[];
}

/** What wanders the Mist once it opens. No faction. No negotiating. */
export const MIST_CONTACT: ContactSpec = {
  kind: 'drowned', label: 'Something pale', ships: ['brig'],
  behavior: 'hunt', loot: 30, ghost: true,
  desc: 'a pale hull with no wake, coming upwind like the wind owes it money',
  names: ['The Refund'],
};

export const CONTACT_TABLES: Record<Region, ContactSpec[]> = {
  home: [
    {
      kind: 'merchant-s', label: 'Coastal trader', faction: 'compania', ships: ['sloop'],
      behavior: 'flee', loot: 14, desc: 'a coastal trader, riding low and praying',
    },
    {
      kind: 'brethren-s', label: 'Brethren cutter', faction: 'brethren', ships: ['sloop'],
      behavior: 'lane', loot: 8, desc: 'a Brethren cutter with opinions about your cargo',
    },
  ],
  trades: [
    {
      kind: 'merchant-m', label: 'Compañía brig', faction: 'compania', ships: ['brig'],
      behavior: 'flee', loot: 26, desc: 'a Compañía brig, fat with coin',
    },
    {
      kind: 'patrol', label: 'Navy patrol', faction: 'crown', ships: ['brig'],
      behavior: 'patrol', loot: 10, desc: 'a Crown patrol with a quota',
    },
    {
      kind: 'convoy', label: 'Escorted convoy', faction: 'compania', ships: ['brig', 'sloop'],
      behavior: 'lane', loot: 34, desc: 'a convoy — merchant and escort',
    },
  ],
  reefs: [
    {
      kind: 'merchant-r', label: 'Silk runner', faction: 'compania', ships: ['brig'],
      behavior: 'flee', loot: 48, desc: 'a silk runner out of the east, deep-laden',
    },
    {
      kind: 'hunter', label: 'Crown hunter', faction: 'crown', ships: ['frigate'],
      behavior: 'hunt', loot: 18, desc: 'a Crown hunter flying your description',
    },
    {
      kind: 'corsair', label: 'Reef corsair', faction: 'brethren', ships: ['brig'],
      behavior: 'hunt', loot: 22, desc: 'a reef corsair who saw you first',
    },
  ],
};
