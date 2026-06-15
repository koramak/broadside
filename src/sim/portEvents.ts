// Port events — the small dramas that greet you at the quay, so ports feel
// inhabited rather than vended. Deterministic per port + day; some just happen
// (a press-gang, a fire), some put a choice in front of you (bribe the customs
// man, or don't). ZERO Three.js. Effects use existing run fields.

import { CLASSES } from './constants';
import { GOODS, cargoLoad } from './economy';
import { clamp } from './math';
import { Rng } from './rng';
import { clampLoyalty } from './captains';
import { PORTS } from './worldgen';
import type { FactionKey, PortDef } from './worldgen';
import type { RunState } from './types';

/** What the UI shows: a banner, and optionally a choice. Data-only (no fns). */
export interface PortEventChoice {
  key: string;
  label: string;
}
export interface PortEventView {
  id: string;
  title: string;
  text: string;
  choices?: PortEventChoice[];
}

type Feed = (msg: string) => void;

const repBump = (run: RunState, k: FactionKey, d: number): void => {
  run.rep[k] = clamp(run.rep[k] + d, -100, 100);
};
const heldGood = (run: RunState): (typeof GOODS)[number] | null =>
  GOODS.find((g) => (run.cargo[g.key] || 0) > 0) ?? null;
const hasContraband = (run: RunState): boolean =>
  run.contracts.some((c) => c.type === 'smuggle') || (run.cargo.powder || 0) > 0 || (run.cargo.rum || 0) > 0;

interface EventDef {
  id: string;
  weight: number;
  title: string;
  eligible?: (run: RunState, port: PortDef) => boolean;
  /** passive: mutate run now, return the narration line shown in the banner */
  passive?: (run: RunState, port: PortDef, rng: Rng) => string;
  /** choice: the prompt + buttons; resolve applies the picked outcome */
  prompt?: (run: RunState, port: PortDef) => string;
  choices?: PortEventChoice[];
  resolve?: (run: RunState, port: PortDef, key: string, feed: Feed) => void;
}

const EVENTS: EventDef[] = [
  {
    id: 'pressgang', weight: 3, title: 'A PRESS-GANG ON THE QUAY',
    eligible: (_r, p) => p.faction === 'crown',
    passive: (run, _p, rng) => {
      const n = 2 + rng.int(3);
      run.pool += n;
      return 'A Crown press-gang frog-marches ' + n + ' sullen recruits down the quay. They are yours now — ' + n + ' to the pool.';
    },
  },
  {
    id: 'deserters', weight: 3, title: 'DESERTERS SEEKING A BERTH',
    passive: (run, _p, rng) => {
      const n = 2 + rng.int(3);
      run.pool += n;
      return 'Deserters from a captain who met the rope ask for a berth. ' + n + ' hands join the pool, asking no questions.';
    },
  },
  {
    id: 'fire', weight: 2, title: 'FIRE ON THE WATERFRONT',
    passive: (run, _p, rng) => {
      const n = Math.min(run.stores, 4 + rng.int(6));
      run.stores -= n;
      return 'A warehouse fire jumps the quay; the harbormaster levies a “contribution” for the buckets. ' + n + ' stores, gone like smoke.';
    },
  },
  {
    id: 'festival', weight: 2, title: 'A SAINT’S-DAY FESTIVAL',
    eligible: (run) => run.armada.length > 0,
    passive: (run) => {
      for (const a of run.armada) a.loyalty = clampLoyalty(a.loyalty + 6);
      return 'A saint’s-day festival — your captains drink the town dry and remember, fondly, whose flag they drink under.';
    },
  },
  {
    id: 'gratitude', weight: 2, title: 'AN OLD DEBT REPAID',
    eligible: (_r, p) => p.faction === 'compania',
    passive: (run, _p, rng) => {
      const n = 6 + rng.int(9);
      run.stores += n;
      return 'A Compañía factor you once chose not to rob remembers it — ' + n + ' stores, and a nod that costs him nothing.';
    },
  },
  {
    id: 'spoilage', weight: 2, title: 'ROT IN THE HOLD',
    eligible: (run) => cargoLoad(run) > 0,
    passive: (run, _p, rng) => {
      const g = heldGood(run)!;
      const n = Math.min(run.cargo[g.key], 1 + rng.int(3));
      run.cargo[g.key] -= n;
      return 'Bilge water and rats get into the hold. ' + n + ' ' + g.name.toLowerCase() + ' spoiled past selling.';
    },
  },
  {
    id: 'fever', weight: 2, title: 'FEVER IN THE FO’C’SLE',
    passive: (run, _p, rng) => {
      const before = run.flag.crewPct;
      run.flag.crewPct = clamp(run.flag.crewPct - (0.07 + rng.rnd(0.06)), 0.3, 1);
      const lost = Math.round((before - run.flag.crewPct) * CLASSES[run.flag.cls].crew);
      return 'Ship’s fever runs through the fo’c’sle. You bury ' + Math.max(1, lost) + ' and muster fewer at the rail.';
    },
  },
  {
    id: 'customs', weight: 3, title: 'CUSTOMS WANT YOUR HOLD',
    eligible: (_r, p) => p.faction === 'crown' || p.faction === 'compania',
    prompt: (run) =>
      'Customs officers in stiff coats want to search your hold' +
      (hasContraband(run) ? ' — and you are carrying things best left unmanifested.' : '. Routine, they say. Nothing is routine.'),
    choices: [
      { key: 'bribe', label: 'GREASE A PALM — 8 stores' },
      { key: 'submit', label: 'OPEN THE HOLD' },
    ],
    resolve: (run, _p, key, feed) => {
      if (key === 'bribe') {
        const n = Math.min(run.stores, 8);
        run.stores -= n;
        repBump(run, 'crown', 2);
        feed('A coin finds the right pocket. The search “finds nothing.” ' + n + ' stores well spent.');
      } else {
        if (hasContraband(run)) {
          const g = heldGood(run);
          if (g) {
            const n = Math.min(run.cargo[g.key], 3);
            run.cargo[g.key] -= n;
            feed('They find what you hoped they wouldn’t — ' + n + ' ' + g.name.toLowerCase() + ' seized, and your name in their book.');
          } else {
            feed('They tear the hold apart and find only your bad attitude. They write it down anyway.');
          }
          repBump(run, 'crown', -5);
        } else {
          repBump(run, 'crown', 1);
          feed('Clean as a chapel. The officers leave almost disappointed — the Crown notes a cooperative captain.');
        }
      }
    },
  },
  {
    id: 'duel', weight: 2, title: 'AN INSULT ON THE DOCKS',
    eligible: (run) => run.armada.length > 0,
    prompt: (run) => 'A harbor bravo spits at the boots of Capt. ' + run.armada[0].captain[0] + ' and grins, waiting.',
    choices: [
      { key: 'back', label: 'BACK YOUR CAPTAIN — 6 stores in damages' },
      { key: 'lie', label: 'ORDER HER TO LET IT LIE' },
    ],
    resolve: (run, _p, key, feed) => {
      const a = run.armada[0];
      if (!a) return;
      if (key === 'back') {
        const n = Math.min(run.stores, 6);
        run.stores -= n;
        a.loyalty = clampLoyalty(a.loyalty + 8);
        feed('Steel, a broken table, and ' + n + ' stores in damages. Capt. ' + a.captain[0] + ' will not forget who stood with her.');
      } else {
        a.loyalty = clampLoyalty(a.loyalty - 6);
        feed('Capt. ' + a.captain[0] + ' swallows it and walks away. She remembers that too.');
      }
    },
  },
  {
    id: 'stowaway', weight: 2, title: 'A STOWAWAY AT THE RAIL',
    prompt: () => 'A half-starved stowaway begs passage east, swearing they can hand, reef, and steer.',
    choices: [
      { key: 'take', label: 'TAKE THEM ABOARD' },
      { key: 'turn', label: 'TURN THEM OUT' },
    ],
    resolve: (run, _p, key, feed) => {
      if (key === 'take') {
        run.pool += 2;
        feed('Another mouth, another pair of hands. Two for the pool, and a story you’ll never get straight.');
      } else {
        feed('The quay swallows them again. You tell yourself it was the right call until you’re past the heads.');
      }
    },
  },
];

const byId = (id: string): EventDef | undefined => EVENTS.find((e) => e.id === id);

/**
 * Roll the event waiting at this port today (≈55% of visits), deterministic per
 * port + day, applying passive effects immediately. Guarded so re-docking the
 * same port on the same day can't farm it. Returns the view (and stores it on
 * run.portEvent), or null for an uneventful call.
 */
export function rollPortEvent(run: RunState, port: PortDef, day: number, feed: Feed): PortEventView | null {
  const key = port.id + ':' + day;
  if (run.lastPortEventKey === key) return run.portEvent; // already happened this visit
  run.lastPortEventKey = key;
  const rng = new Rng((PORTS.indexOf(port) + 1) * 9181 + day * 6151 + 17);
  if (rng.random() > 0.55) {
    run.portEvent = null;
    return null;
  }
  const pool = EVENTS.filter((e) => !e.eligible || e.eligible(run, port));
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rng.rnd(total);
  let def = pool[0];
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) { def = e; break; }
  }
  let view: PortEventView;
  if (def.passive) {
    const text = def.passive(run, port, rng);
    feed(text);
    view = { id: def.id, title: def.title, text };
  } else {
    view = { id: def.id, title: def.title, text: def.prompt!(run, port), choices: def.choices };
  }
  run.portEvent = view;
  return view;
}

/** Apply a choice-event outcome and clear the banner. */
export function resolvePortEventChoice(run: RunState, port: PortDef, eventId: string, choiceKey: string, feed: Feed): void {
  const def = byId(eventId);
  if (def?.resolve) def.resolve(run, port, choiceKey, feed);
  run.portEvent = null;
}
