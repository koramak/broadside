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

/* The chart is the real WINDWARD PASSAGE, c. 1660s — Jamaica, the eastern
 * end of Cuba, and Hispaniola — with carved-diorama liberties. Landmasses
 * are chains of overlapping circles (the collision and render primitives),
 * laid out from real positions: screen north is -y, ~1200 units per degree
 * of longitude. The Mist swallows everything east of the Mona Passage. */
export const ISLANDS: Island[] = [
  // CUBA — the great wall across the northwest, running off the map edge
  { x: -6900, y: -4200, r: 800 }, // 0
  { x: -6100, y: -3600, r: 700, palms: true }, // 1
  { x: -5300, y: -3050, r: 650 }, // 2
  { x: -4450, y: -2600, r: 620, palms: true }, // 3 Guacanayabo coast
  { x: -3600, y: -2250, r: 600 }, // 4 Sierra Maestra
  { x: -2750, y: -1950, r: 580, palms: true }, // 5
  { x: -1900, y: -1700, r: 560 }, // 6 Santiago de Cuba
  { x: -1050, y: -1550, r: 520, palms: true }, // 7 Guantánamo coast
  { x: -250, y: -1550, r: 470 }, // 8 Punta Maisí — the east tip
  { x: -450, y: -2350, r: 420, palms: true }, // 9 Baracoa (north coast)
  // HISPANIOLA — the north coast (the buccaneer shore)
  { x: 1200, y: -450, r: 320 }, // 10 Môle-Saint-Nicolas
  { x: 1900, y: -380, r: 420, palms: true }, // 11
  { x: 2800, y: -300, r: 480, palms: true }, // 12 Cap-Haïtien
  { x: 3650, y: -250, r: 500 }, // 13
  { x: 4500, y: -200, r: 490, palms: true }, // 14 Puerto Plata
  { x: 5300, y: -100, r: 440 }, // 15 Samaná
  // HISPANIOLA — the mountain spine
  { x: 2500, y: 750, r: 560 }, // 16
  { x: 3400, y: 800, r: 580, palms: true }, // 17
  { x: 4300, y: 850, r: 570 }, // 18
  { x: 5100, y: 850, r: 500, palms: true }, // 19
  // HISPANIOLA — the south coast
  { x: 2300, y: 1750, r: 480, palms: true }, // 20 the Cul-de-Sac plain
  { x: 3200, y: 1850, r: 500 }, // 21
  { x: 4100, y: 1900, r: 490, palms: true }, // 22 Barahona (Neiba bay east of here)
  { x: 5450, y: 1500, r: 430 }, // 23 Santo Domingo coast
  // HISPANIOLA — Tiburon, the long southwest arm (walls the Gulf of Gonâve)
  { x: -100, y: 2250, r: 280, palms: true }, // 24 Cap Carcasse
  { x: 550, y: 2270, r: 320 }, // 25
  { x: 1250, y: 2260, r: 320, palms: true }, // 26 Petit-Goâve shore
  { x: 1900, y: 2130, r: 340 }, // 27 joins the mainland
  // JAMAICA
  { x: -4700, y: 2650, r: 430, palms: true }, // 28
  { x: -3950, y: 2570, r: 470, palms: true }, // 29
  { x: -3200, y: 2520, r: 450, palms: true }, // 30 Port Royal
  { x: -2550, y: 2400, r: 370 }, // 31 Port Antonio
  // the small fry
  { x: 1350, y: 1150, r: 230, palms: true }, // 32 Gonâve, inside the gulf
  { x: -915, y: 2110, r: 130 }, // 33 Navassa — bare rock, no palms
  { x: 1750, y: -1250, r: 190, palms: true }, // 34 Tortuga
  { x: -5250, y: -1800, r: 150 }, // 35 Jardines de la Reina cays
  { x: -4900, y: -1720, r: 170, palms: true }, // 36
  // secret coves — only drawn once a captured log reveals them
  { x: 680, y: 2950, r: 160, palms: true }, // 37 Île-à-Vache
  { x: 5650, y: -1100, r: 160 }, // 38 Cayo Levantado (Mist-edge)
  // the Gonaïves neck — seals the gulf's head to the north coast
  { x: 2050, y: 300, r: 380, palms: true }, // 39
  // HISPANIOLA — interior fill, so the rows read as one solid island
  // (no inland lagoons for a wreck's crates to spawn in, unreachable)
  { x: 2900, y: 250, r: 320 }, // 40
  { x: 3900, y: 300, r: 320, palms: true }, // 41
  { x: 4800, y: 350, r: 300 }, // 42
  { x: 2800, y: 1350, r: 320, palms: true }, // 43
  { x: 3700, y: 1400, r: 320 }, // 44
  { x: 4600, y: 1400, r: 300, palms: true }, // 45
];

export const PORTS: PortDef[] = [
  // PORTS[0] anchors the player's starting berth — Port Royal, of course.
  {
    id: 'portroyal', name: 'Port Royal', faction: 'crown', x: -3200, y: 3030, islandIdx: 30,
    bias: { sugar: 0.7, rum: 0.7, powder: 1.1, timber: 1.0, silk: 1.5, spice: 1.4 },
    tavern: [
      'Half the navy drinks here and the other half is owed money by the first half.',
      'The gallows faces the harbor so the new arrivals understand the schedule.',
      'A clerk swears the Plate Fleet is real, and late, and very heavy.',
    ],
  },
  {
    id: 'santiago', name: 'Santiago de Cuba', faction: 'compania', x: -1900, y: -1080, islandIdx: 6,
    bias: { sugar: 0.8, rum: 0.9, powder: 0.85, timber: 0.9, silk: 1.3, spice: 1.3 },
    tavern: [
      'The Compañía counts its silver twice and its friends once.',
      'Copper hills, green harbor, and a governor who prices forgiveness by the ounce.',
      'They say the Plate Ship will call at no port — she trusts none of us. Sensible.',
    ],
  },
  {
    id: 'tortuga', name: 'Tortuga', faction: 'brethren', x: 1750, y: -1000, islandIdx: 34,
    bias: { sugar: 1.2, rum: 1.2, powder: 1.3, timber: 1.1, silk: 1.15, spice: 1.2 },
    tavern: [
      'No questions asked. One question, maybe: did anyone follow you?',
      'The Brethren toast the Crown nightly — may she keep building ships for us.',
      'Old Marisol says the water east of Samaná has opinions now.',
    ],
  },
  {
    id: 'petitgoave', name: 'Petit-Goâve', faction: 'brethren', x: 1250, y: 1880, islandIdx: 26,
    bias: { sugar: 1.1, rum: 1.35, powder: 1.15, timber: 1.0, silk: 1.2, spice: 1.1 },
    tavern: [
      'Rum comes in from Jamaica and leaves as bad decisions. The margin is excellent.',
      'The Gulf is calm, the Brethren are not, and both are recruiting.',
      'A hunter sells boucan by the yard and sermons about the Mist for free. Nobody laughs anymore.',
    ],
  },
  {
    id: 'antonio', name: 'Port Antonio', faction: 'crown', x: -2210, y: 2130, islandIdx: 31,
    bias: { sugar: 0.7, rum: 0.65, powder: 1.0, timber: 0.8, silk: 1.4, spice: 1.3 },
    tavern: [
      'Timber goes out, orders come in, and nobody asks where the fort’s powder went.',
      'The garrison commander waters the rum and calls it temperance.',
      'Blue mountains, green harbor, thin walls. The walls are being seen to.',
    ],
  },
  {
    id: 'santodomingo', name: 'Santo Domingo', faction: 'compania', x: 5450, y: 1990, islandIdx: 23,
    bias: { sugar: 1.4, rum: 1.3, powder: 1.35, timber: 1.35, silk: 0.85, spice: 0.75 },
    tavern: [
      'The oldest city in the New World, and it remembers being sacked like it was Tuesday.',
      'Last honest port before the water goes strange. Honest is doing some work in that sentence.',
      'Silk comes west from somewhere nobody charts anymore. Ask the silk. It will not say.',
    ],
  },
  {
    id: 'vache', name: 'Île-à-Vache', faction: 'brethren', secret: true, x: 680, y: 3140, islandIdx: 37,
    bias: { sugar: 1.6, rum: 0.5, powder: 1.5, timber: 1.3, silk: 1.7, spice: 1.6 },
    tavern: [
      'Morgan staged here before Panama. The anchorage keeps secrets like a paid witness.',
      'Pay in coin or in silence. Silence is dearer and they prefer it.',
      'Everything sells high here because everything here is already stolen twice.',
    ],
  },
  {
    id: 'levantado', name: 'Cayo Levantado', faction: 'brethren', secret: true, x: 5650, y: -880, islandIdx: 38,
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
  { n: 1, x: -1500, y: 3300 }, // the Jamaica channel, east of Port Royal
  { n: 2, x: -150, y: 1500 }, // off Navassa, at the gulf's mouth
  { n: 3, x: 450, y: -300 }, // the Windward Passage itself
  { n: 4, x: 2700, y: -1550 }, // Tortuga's north water
  { n: 5, x: 4600, y: -1400 }, // the old Bahama channel, off Puerto Plata
  { n: 6, x: 5600, y: 2600 }, // the Santo Domingo roadstead — the Plate Ship
  // beyond the wall — only reachable once the Mist opens (the Mona Passage)
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
