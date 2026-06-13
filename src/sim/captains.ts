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

import type { Captain, DoctrineKey } from './constants';
import type { Rng } from './rng';

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

/** Pick an in-character line for this captain at this moment. Returns null if
 *  there's nothing to say (so callers can stay quiet). Deterministic via rng. */
export function bark(captain: Captain, key: BarkKey, rng: Rng): string | null {
  const t = TEMPERAMENT[captain[1]];
  const lines = t?.barks[key];
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
