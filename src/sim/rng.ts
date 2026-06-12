// Seeded RNG so the simulation is deterministic for a given seed.
// mulberry32 — small, fast, good enough distribution for game logic.

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). Drop-in for Math.random(). */
  random(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** rnd() → [0,1), rnd(a) → [0,a), rnd(a,b) → [a,b). Same semantics as the prototype. */
  rnd(a = 1, b?: number): number {
    return b === undefined ? this.random() * a : a + this.random() * (b - a);
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.random() * n);
  }

  /** Fisher–Yates shuffle (in place), returns the array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
}
