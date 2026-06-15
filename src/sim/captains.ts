// Consort captains as CHARACTERS. The armada pillar's missing half: a fleet
// that feels like a crew of people, not a stack of competent units.
//
// Each captain has a TEMPERAMENT (carried by their doctrine) — what they love,
// what they resent — and a LOYALTY that drifts with how you use them. High
// loyalty fights harder and obeys signals instantly; low loyalty hesitates and
// ignores orders; rock-bottom and she sails off with your hull.
//
// This is also the home for the Disco-Elysium voice: captains with opinions,
// barked in character. ZERO Three.js, all FEEL constants live here.

import type { Captain, DoctrineKey, ShipClass } from './constants';
import { Rng } from './rng';
import { PORTS } from './worldgen';
import type { FactionKey, PortDef } from './worldgen';
import type { RunState } from './types';

/* ============ loyalty model (FEEL dials) ============ */

export const LOYALTY = {
  start: 55, // a fresh recruit chose your flag, but hasn't bled for it yet
  min: 0,
  max: 100,
  /** band thresholds (inclusive lower bound) */
  devoted: 80,
  steady: 45,
  wary: 20,
  // below `wary` is mutinous
  desertAt: 6, // at/below this in harbor, she's gone by morning

  /** one-shot drifts (rate-limited where they fire on a toggle/event) */
  orderWith: 4, // you gave an order that suits her temperament
  orderAgainst: -6, // …or one that grates against it
  signalUsed: 1, // you folded her into a fleet volley she could make
  victory: 8, // you led her to a win and brought her home
  mauled: -10, // ended the fight under 25% hull (the Surgeon never forgives this)
  bulldogMauled: 5, // …unless she's a Bulldog, who calls that a good afternoon
  corsairPrize: 5, // a hull taken, not sunk — the Corsair's whole religion
  corsairWaste: -4, // everything sent to the bottom, nothing kept

  /** continuous contentment: sampled every `sampleS` seconds in a fight */
  sampleS: 3.5,
  contentStep: 0.8, // toward content / discontent per sample

  /** harbor lever: buy her goodwill back */
  carouseGain: 18,
  carouseCost: 10,
} as const;

export type LoyaltyBand = 'devoted' | 'steady' | 'wary' | 'mutinous';

export function loyaltyBand(v: number): LoyaltyBand {
  if (v >= LOYALTY.devoted) return 'devoted';
  if (v >= LOYALTY.steady) return 'steady';
  if (v >= LOYALTY.wary) return 'wary';
  return 'mutinous';
}

export function loyaltyWord(v: number): string {
  return { devoted: 'devoted', steady: 'steady', wary: 'wary', mutinous: 'mutinous' }[loyaltyBand(v)];
}

export const clampLoyalty = (v: number): number => Math.max(LOYALTY.min, Math.min(LOYALTY.max, v));

/** Combat consequences of a consort's morale, read by the battle sim. */
export interface LoyaltyEffect {
  /** scales how eagerly she lets fly (AI fire probability) */
  fireMul: number;
  /** scales her reload clock (lower = faster) */
  reloadMul: number;
  /** seconds of hesitation added before she answers a signal */
  signalDelay: number;
  /** mutinous crews may simply not answer the signal at all */
  mayRefuseSignal: boolean;
  /** mutinous crews won't break off to form on you */
  obeysFormUp: boolean;
}

export function loyaltyEffect(v: number): LoyaltyEffect {
  switch (loyaltyBand(v)) {
    case 'devoted':
      return { fireMul: 1.25, reloadMul: 0.88, signalDelay: 0, mayRefuseSignal: false, obeysFormUp: true };
    case 'steady':
      return { fireMul: 1.0, reloadMul: 1.0, signalDelay: 0.15, mayRefuseSignal: false, obeysFormUp: true };
    case 'wary':
      return { fireMul: 0.8, reloadMul: 1.12, signalDelay: 0.6, mayRefuseSignal: false, obeysFormUp: true };
    default:
      return { fireMul: 0.55, reloadMul: 1.3, signalDelay: 1.0, mayRefuseSignal: true, obeysFormUp: false };
  }
}

/* ============ temperament + voice ============ */

export interface Temperament {
  /** how the harbor names her cast of mind */
  title: string;
  /** a one-line character-bible creed, shown on her card */
  creed: string;
  /** plain-language tells so the player learns what she wants */
  loves: string;
  hates: string;
  /** the Disco-Elysium voice: in-character barks, keyed by moment */
  barks: Record<BarkKey, string[]>;
}

export type BarkKey =
  | 'recruit'
  | 'approve' // you used her the way she likes
  | 'resent' // …or the way she doesn't
  | 'content' // occasional flavor when she's in her element
  | 'discontent' // …or being made to fight wrong
  | 'victory'
  | 'wary' // morale slipping — a warning
  | 'mutinous' // the last warning before the boats
  | 'desert'; // she's gone

// Voices are written per TEMPERAMENT (doctrine), so a Bulldog always sounds
// like a Bulldog — but the captain's NAME is woven in, so Holt and Drake are
// still two people sharing a creed. {n} is replaced with her surname.
export const TEMPERAMENT: Record<DoctrineKey, Temperament> = {
  bulldog: {
    title: 'The Bulldog',
    creed: '“Range is a coward’s arithmetic. Put me alongside and I’ll do sums in blood.”',
    loves: 'closing to point-blank, grape, boarding',
    hates: 'holding off, being leashed to your quarter',
    barks: {
      recruit: [
        '{n} spits on her palm and takes your hand. “Point me at someone.”',
        '{n} comes aboard grinning like a dropped knife. “Took you long enough.”',
      ],
      approve: [
        '{n}: “THAT’S it — close the door and let’s have words.”',
        '{n} laughs across the water. “Now we’re talking the right language.”',
        '{n}: “Good. I was getting splinters from doing nothing.”',
      ],
      resent: [
        '{n}: “Hold off? From HERE? Captain, my guns are weeping.”',
        '{n} hauls her wind, sullen. “We could be aboard them by now.”',
        '{n}: “You keep me on a leash, I’ll start chewing it.”',
      ],
      content: [
        '{n} is close enough to read their faces. She likes what she reads.',
        'You can hear {n}’s crew singing something with no survivors in it.',
      ],
      discontent: [
        '{n} paces her own deck like a dog at a fence.',
        '{n}: “This isn’t a battle, it’s a correspondence.”',
      ],
      victory: [
        '{n}, soaked to the elbow: “Again. Find me another. Quickly.”',
        '{n} salutes with a notched cutlass. “THAT’S the work.”',
      ],
      wary: [
        '{n} isn’t laughing now. “I didn’t come out here to watch, captain.”',
        '{n}: “A fighting dog you never fight turns on the hand. Mind that.”',
      ],
      mutinous: [
        '{n}: “One more polite afternoon and I take my hull somewhere it’ll get used.”',
        '{n}’s crew won’t meet your eye. She’s already told them where she’s going.',
      ],
      desert: [
        '{n} bears away without a signal, colors struck to no one. The dog found a hand that fights.',
      ],
    },
  },
  surgeon: {
    title: 'The Surgeon',
    creed: '“Anyone can sink a ship. I take them apart while they still believe they’re winning.”',
    loves: 'holding the range, chain shot, the weather gauge',
    hates: 'being dragged into a brawl, a hull spent like cheap coin',
    barks: {
      recruit: [
        '{n} reviews your damage like a chart of symptoms. “You’ve been lucky. Luck isn’t a method.”',
        '{n} comes aboard with her own ledger. “I keep the books. You keep the promises.”',
      ],
      approve: [
        '{n}, unhurried: “Yes. Stand off. Let the range do the cutting.”',
        '{n}: “Good range. Now we work cleanly.”',
        '{n} dismantles their rig stitch by stitch. “Patience is a caliber.”',
      ],
      resent: [
        '{n}: “Point-blank. Of course. Why operate when you can simply bleed?”',
        '{n}, cold: “You’re spending my ship to save yourself a thought.”',
        '{n}: “Drag me into a knife-fight again and I’ll bill you for the timber.”',
      ],
      content: [
        '{n} holds the gauge to the inch. Their sails come down like a slow diagnosis.',
        '{n} hasn’t raised her voice once. That’s how you know it’s going well.',
      ],
      discontent: [
        '{n} is too close to do anything elegant, and she resents the inelegance.',
        '{n}: “We are improvising. I despise improvising.”',
      ],
      victory: [
        '{n} closes her ledger. “Textbook. Or it will be, once I write it.”',
        '{n}: “Minimal losses. Try to make that a habit and not an accident.”',
      ],
      wary: [
        '{n}: “I’ve patched this ship more than you’ve thanked me. The math is noticed.”',
        '{n} tallies the butcher’s bill you keep handing her. She underlines the total.',
      ],
      mutinous: [
        '{n}: “I did not survive this long to die of your enthusiasm. Mend your ways or I mend elsewhere.”',
        '{n} has quietly transferred her instruments to the boats. A bad sign, read late.',
      ],
      desert: [
        '{n} slips her cable in the night, clean as a closed incision. No note. She felt the note was implied.',
      ],
    },
  },
  corsair: {
    title: 'The Corsair',
    creed: '“The sea is a debt and every fat hull is a payment. Get behind them. Let me collect.”',
    loves: 'the stern rake, the hunt, prizes taken whole',
    hates: 'holding fire, the leash, a prize sent to the bottom',
    barks: {
      recruit: [
        '{n} eyes your armada like a purse. “Lead me to the heavy ones. I’ll forgive the rest.”',
        '{n} comes aboard already counting. “Show me a stern and we’ll get along.”',
      ],
      approve: [
        '{n} slides astern of them like a rumor. “There. Right across the cabin.”',
        '{n}: “Yes — the rake. Open them like a letter.”',
        '{n}, delighted: “A prize, not a wreck. You DO understand.”',
      ],
      resent: [
        '{n}: “Hold fire? I’ve got their stern in my teeth and you say HOLD?”',
        '{n} strains against the order. “A hound on a leash is just a complaint with legs.”',
        '{n} watches a fat hull burn. “That was money, captain. You set fire to money.”',
      ],
      content: [
        '{n} hangs off their quarter, patient as a tax. The hunt is on and she is the hunt.',
        '{n} is already naming the prize she hasn’t taken yet.',
      ],
      discontent: [
        '{n} circles, denied the angle, and mutters about wasted wind.',
        '{n}: “We’re fighting them fair. Fair is for ships with nothing to gain.”',
      ],
      victory: [
        '{n} runs her hand along the new prize. “Hello, beautiful. You’re mine now.”',
        '{n}: “See? Collected, not destroyed. Debt settled. Find me another debtor.”',
      ],
      wary: [
        '{n}: “I follow the man who fills my hold. Lately my hold echoes, captain.”',
        '{n} counts the prizes you let sink. The number is a grudge now.',
      ],
      mutinous: [
        '{n}: “There’s richer flags than yours. Give me a reason to keep flying this one.”',
        '{n}’s gone quiet and her hold is empty. A corsair with an empty hold is a corsair leaving.',
      ],
      desert: [
        '{n} peels off toward a fatter horizon, taking her hull and her appetite with her.',
      ],
    },
  },
};

/* ============ the bark machine ============ */

function surname(captain: Captain): string {
  return captain[0];
}

/** Pick an in-character line for this captain at this moment. A legend's own
 *  lines take precedence over her temperament's; she falls back to the
 *  temperament for any moment she has nothing personal to say. Returns null if
 *  there's nothing to say (so callers can stay quiet). Deterministic via rng. */
export function bark(captain: Captain, key: BarkKey, rng: Rng, legendId?: string): string | null {
  const legend = legendById(legendId);
  const lines = legend?.barks?.[key] ?? TEMPERAMENT[captain[1]]?.barks[key];
  if (!lines || !lines.length) return null;
  const line = lines[rng.int(lines.length)];
  return line.replace(/\{n\}/g, surname(captain));
}

/* ============ temperament → reaction mapping ============ */

/** How a captain feels about a fleet order. +/- loyalty and which bark fits.
 *  formUp=true is "FORM ON ME" (the leash); false is "ENGAGE THE ENEMY". */
export function orderReaction(doctrine: DoctrineKey, formUp: boolean): { d: number; key: BarkKey } | null {
  if (formUp) {
    // the leash: fighters chafe, the Surgeon approves of order
    if (doctrine === 'surgeon') return { d: LOYALTY.orderWith, key: 'approve' };
    return { d: LOYALTY.orderAgainst, key: 'resent' };
  }
  // unleashed to engage: the hunters love it, the Surgeon shrugs
  if (doctrine === 'surgeon') return null;
  return { d: LOYALTY.orderWith, key: 'approve' };
}

/** Continuous contentment: is she being fought the way she likes, right now?
 *  +1 content, -1 discontent, 0 neutral. `range` is distance to her foe;
 *  `leashed` is whether you've got her formed up off your quarter. */
export function tacticalContent(
  doctrine: DoctrineKey,
  range: number,
  leashed: boolean,
): number {
  if (doctrine === 'bulldog') {
    if (range < 140) return 1; // in the brawl she craves
    if (range > 320 || leashed) return -1; // kept off the prize
    return 0;
  }
  if (doctrine === 'surgeon') {
    if (range < 120) return -1; // dragged into a knife-fight
    if (range > 150 && range < 300) return 1; // her operating distance
    return 0;
  }
  // corsair: the hunt is the point; the leash is the insult
  if (leashed) return -1;
  if (range > 110 && range < 240) return 1; // hanging off the quarter, hunting
  if (range > 360) return -1; // lost the scent
  return 0;
}

/* ============ legendary captains: named characters you can recruit ============ */

// Each is a person with her own creed and a QUIRK that bends one rule a little
// — the captain-level flavor of "realism that earns its magic". They bring
// their own signature hull and frequent the ports of one flag.
export type LegendQuirk = 'steadfast' | 'deadeye' | 'ironhide' | 'bloodthirsty';

export const QUIRK_DESC: Record<LegendQuirk, string> = {
  steadfast: 'she will never abandon your flag',
  deadeye: 'her gun crews never lose their pace',
  ironhide: 'her hull is built to be hit',
  bloodthirsty: 'morale soars on prizes, sours when idle',
};

export interface Legend {
  id: string;
  name: string;
  doctrine: DoctrineKey;
  /** personal creed, shown on her card in place of the temperament's */
  creed: string;
  ship: { cls: ShipClass; name: string };
  cost: number;
  quirk: LegendQuirk;
  /** which flag's ports she drinks in */
  affinity: FactionKey;
  startLoyalty: number;
  /** personal lines layered over her temperament (any subset of moments) */
  barks?: Partial<Record<BarkKey, string[]>>;
}

export const LEGENDS: Legend[] = [
  {
    id: 'varga', name: 'Inez Varga', doctrine: 'surgeon', quirk: 'deadeye',
    creed: '“I have buried better captains than you for less. Stand off, and I’ll make their mistakes look like weather.”',
    ship: { cls: 'brig', name: 'Brig Mercy’s Lien' }, cost: 95, affinity: 'compania', startLoyalty: 72,
    barks: {
      recruit: ['Inez Varga reads your ledger of dead and exhales. “Fine. Someone has to keep you alive.”'],
      victory: ['Varga wipes her hands. “Adequate. I’ve watched adequate curdle into legend. Don’t let it.”'],
    },
  },
  {
    id: 'halloran', name: 'Grin Halloran', doctrine: 'bulldog', quirk: 'ironhide',
    creed: '“Hit me. Go on. I’ll be over here, not noticing.”',
    ship: { cls: 'brig', name: 'Brig The Glutton' }, cost: 88, affinity: 'brethren', startLoyalty: 70,
    barks: {
      recruit: ['Grin Halloran cracks his knuckles one at a time. “Heard you start fights you can’t finish. I finish them.”'],
      approve: ['Halloran takes a broadside grinning. “Is that ALL?”'],
    },
  },
  {
    id: 'maro', name: 'Salt-Tongue Maro', doctrine: 'corsair', quirk: 'bloodthirsty',
    creed: '“Every hull afloat owes me. I am simply… aggressive about accounts receivable.”',
    ship: { cls: 'sloop', name: 'Sloop Tithe' }, cost: 56, affinity: 'brethren', startLoyalty: 62,
    barks: {
      recruit: ['Salt-Tongue Maro counts your masts like coins. “Lead me to the fat ones. I’ll forgive the rest. Once.”'],
      mutinous: ['Maro’s hold echoes and so does her patience. “Fill it or I find a captain who will.”'],
    },
  },
  {
    id: 'pell', name: 'One-Glass Pell', doctrine: 'surgeon', quirk: 'steadfast',
    creed: '“One glass of rum a night, one opinion: stay the course. I will not leave it. Or you.”',
    ship: { cls: 'frigate', name: 'Frigate The Long Patience' }, cost: 118, affinity: 'crown', startLoyalty: 74,
    barks: {
      recruit: ['One-Glass Pell shakes your hand exactly once. “I don’t change ships. Disappoint me anyway, and learn what loyalty without warmth looks like.”'],
    },
  },
  {
    id: 'esquival', name: 'Red Esquival', doctrine: 'bulldog', quirk: 'steadfast',
    creed: '“I picked a side the day they hanged my brother. It’s yours now, for reasons that are none of your business.”',
    ship: { cls: 'brig', name: 'Brig Vendetta' }, cost: 84, affinity: 'brethren', startLoyalty: 76,
    barks: {
      recruit: ['Red Esquival doesn’t smile. “I don’t leave. Ask the Crown how that’s gone for them.”'],
    },
  },
  {
    id: 'dauphine', name: 'Dauphine the Lesser', doctrine: 'corsair', quirk: 'deadeye',
    creed: '“They call me the Lesser. They are wrong about the direction.”',
    ship: { cls: 'sloop', name: 'Sloop Lesser Evil' }, cost: 62, affinity: 'compania', startLoyalty: 66,
    barks: {
      recruit: ['Dauphine the Lesser appraises your fleet. “You’ll do. Briefly. Brilliantly. Try to keep up.”'],
    },
  },
];

export function legendById(id?: string): Legend | undefined {
  return id ? LEGENDS.find((l) => l.id === id) : undefined;
}

export function legendQuirk(id?: string): LegendQuirk | undefined {
  return legendById(id)?.quirk;
}

/**
 * The legendary captain (if any) drinking at this port today — deterministic
 * per port + day, drawn from those who haven't signed on yet and whose flag
 * this is. She isn't always ashore; that's what makes finding her a moment.
 */
export function legendAtPort(run: RunState, port: PortDef, day: number): Legend | null {
  const eligible = LEGENDS.filter((l) => !run.legendsHired.includes(l.id) && l.affinity === port.faction);
  if (!eligible.length) return null;
  const rng = new Rng((PORTS.indexOf(port) + 1) * 5779 + day * 3331 + 7);
  if (rng.random() > 0.45) return null; // not every visit
  return eligible[rng.int(eligible.length)];
}
