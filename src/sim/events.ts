// Events emitted by the sim each step. The render/UI/audio layers consume
// these; the sim never touches the DOM or the scene graph.

import type { Ship } from './types';

export type SimEvent =
  | { kind: 'feed'; msg: string }
  | { kind: 'boom'; vol: number; len: number; freq: number }
  | { kind: 'muzzle'; x: number; y: number; dir: number } // smoke puff at a gun port
  | { kind: 'impact'; x: number; y: number } // ball struck timber
  | { kind: 'splash'; x: number; y: number } // ball found only sea
  | { kind: 'wake'; x: number; y: number }
  | { kind: 'battleWon' }
  | { kind: 'runOver'; title: string; text: string }
  | { kind: 'shipSunk'; ship: Ship }
  | { kind: 'shipStruck'; ship: Ship };

export class EventQueue {
  events: SimEvent[] = [];

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  feed(msg: string): void {
    this.emit({ kind: 'feed', msg });
  }

  boom(vol = 0.5, len = 0.35, freq = 300): void {
    this.emit({ kind: 'boom', vol, len, freq });
  }

  /** Drain all pending events (consumed once per frame by the front end). */
  drain(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }
}
