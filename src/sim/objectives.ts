// The guided objective chain. The first five steps are a tutorial that walks
// the player through the game's tenets — fight, make port and trade, fight,
// carry goods east, fight — then the chart opens up and the remaining marks
// lead to the Plate Ship and what waits past it. The locked 6-action battle
// spine is unchanged; port calls are threaded between the early fights.

import { PORTS, STORY_ACTIONS } from './worldgen';
import type { RunState } from './types';
import type { EventQueue } from './events';

export type Objective =
  | { kind: 'fight'; n: number; label: string }
  | { kind: 'port'; id: string; label: string; arrival: string };

export const OBJECTIVES: Objective[] = [
  { kind: 'fight', n: 1, label: 'ACTION 1 — SAIL TO THE GOLD MARK' },
  {
    kind: 'port', id: 'antonio',
    label: 'MAKE PORT AT PORT ANTONIO — MEND, HIRE, TRADE',
    arrival: 'Port Antonio. Repair what’s holed, hire hands if you bled, and buy cheap rum — Jamaica makes it, the buccaneers drink it.',
  },
  { kind: 'fight', n: 2, label: 'ACTION 2 — SAIL TO THE GOLD MARK' },
  {
    kind: 'port', id: 'petitgoave',
    label: 'CARRY YOUR GOODS EAST TO PETIT-GOÂVE',
    arrival: 'Petit-Goâve pays Jamaica prices for nothing and buccaneer prices for everything. Sell high. That’s the whole trick.',
  },
  { kind: 'fight', n: 3, label: 'ACTION 3 — TWO SLOOPS. TRY TAKING ONE.' },
  { kind: 'fight', n: 4, label: 'ACTION 4 — SAIL TO THE GOLD MARK' },
  { kind: 'fight', n: 5, label: 'ACTION 5 — SAIL TO THE GOLD MARK' },
  { kind: 'fight', n: 6, label: 'ACTION 6 — THE PLATE SHIP' },
  { kind: 'fight', n: 7, label: 'THE MIST — ACTION 7 OF 9' },
  { kind: 'fight', n: 8, label: 'THE MIST — ACTION 8 OF 9' },
  { kind: 'fight', n: 9, label: 'THE MIST — ACTION 9 OF 9' },
];

/** index after which the hand-holding (and the favorable wind) stops */
const TUTORIAL_LAST_IDX = 4;

export function currentObjective(run: RunState): Objective | null {
  return OBJECTIVES[run.objIdx] ?? null;
}

export function objectivePos(obj: Objective): { x: number; y: number } {
  if (obj.kind === 'fight') {
    const m = STORY_ACTIONS[obj.n - 1];
    return { x: m.x, y: m.y };
  }
  const p = PORTS.find((q) => q.id === obj.id)!;
  return { x: p.x, y: p.y };
}

export function tutorialActive(run: RunState): boolean {
  return run.objIdx <= TUTORIAL_LAST_IDX;
}

/** Called when a story fight is won. */
export function onStoryWon(run: RunState, n: number, events: EventQueue): void {
  const obj = currentObjective(run);
  if (obj && obj.kind === 'fight' && obj.n === n) {
    run.objIdx++;
    const next = currentObjective(run);
    if (next && next.kind === 'port') {
      events.feed('Powder’s spent and the hold smells like prize money. Your chart marks a port.');
    }
    if (n === 3) {
      events.feed('That’s the shape of it — fight, refit, trade, repeat, bigger every time.');
      events.feed('The rest of the marks lead to the Plate Ship. The wind keeps a civil tongue, for now.');
    }
  }
}

/** Called when the player docks anywhere. */
export function onDocked(run: RunState, portId: string, events: EventQueue): void {
  const obj = currentObjective(run);
  if (obj && obj.kind === 'port' && obj.id === portId) {
    run.objIdx++;
    events.feed(obj.arrival);
  }
}
