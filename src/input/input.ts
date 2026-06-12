// Keyboard + touch input, ported from the prototype. Emits high-level actions;
// the game decides what they do. Holds steer state for the fixed-step sim.

import { audio } from '../audio';
import { $ } from '../ui/hud';

export interface InputActions {
  setAmmo(i: number): void;
  fire(side: number): void;
  sailUp(): void;
  sailDown(): void;
  signal(): void;
  toggleOrder(): void;
  board(): void;
  nextHelm(): void;
  togglePause(): void;
}

export class Input {
  private keys: Record<string, boolean> = {};
  private touchPort = false;
  private touchStbd = false;
  enabled = true;

  constructor(actions: InputActions) {
    addEventListener('keydown', (e) => {
      audio();
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === 'escape' || k === 'p') {
        actions.togglePause();
        return;
      }
      if (k === 'tab') {
        e.preventDefault();
        if (this.enabled) actions.nextHelm();
        return;
      }
      if (k.startsWith('arrow')) e.preventDefault();
      if (!this.enabled) return;
      if (k === '1') actions.setAmmo(0);
      if (k === '2') actions.setAmmo(1);
      if (k === '3') actions.setAmmo(2);
      if (k === 'q') actions.fire(0);
      if (k === 'e') actions.fire(1);
      if (k === 'w' || k === 'arrowup') actions.sailUp();
      if (k === 's' || k === 'arrowdown') actions.sailDown();
      if (k === 'f') actions.signal();
      if (k === 'g') actions.toggleOrder();
      if (k === 'b') actions.board();
    });
    addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    const holdBtn = (id: string, fn: (v: boolean) => void) => {
      const el = $(id);
      const on = (e: Event) => {
        e.preventDefault();
        audio();
        fn(true);
      };
      const off = (e: Event) => {
        e.preventDefault();
        fn(false);
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    };
    holdBtn('bport', (v) => (this.touchPort = v));
    holdBtn('bstbd', (v) => (this.touchStbd = v));

    $('bsailup').addEventListener('click', () => {
      audio();
      actions.sailUp();
    });
    $('bsaildn').addEventListener('click', () => {
      audio();
      actions.sailDown();
    });
    for (let i = 0; i < 3; i++) {
      $('a' + i).addEventListener('click', () => {
        audio();
        actions.setAmmo(i);
      });
    }
    $('fport').addEventListener('click', () => {
      audio();
      actions.fire(0);
    });
    $('fstbd').addEventListener('click', () => {
      audio();
      actions.fire(1);
    });
    $('sigbtn').addEventListener('click', () => {
      audio();
      actions.signal();
    });
    $('orderbtn').addEventListener('click', () => {
      audio();
      actions.toggleOrder();
    });
    $('boardbtn').addEventListener('click', () => {
      audio();
      actions.board();
    });
    $('pausebtn').addEventListener('click', () => {
      audio();
      actions.togglePause();
    });
  }

  /** -1 (hard a-port) .. 1 (hard a-starboard), matching the prototype. */
  rudder(): number {
    return (
      (this.keys['a'] || this.keys['arrowleft'] || this.touchPort ? -1 : 0) +
      (this.keys['d'] || this.keys['arrowright'] || this.touchStbd ? 1 : 0)
    );
  }
}
