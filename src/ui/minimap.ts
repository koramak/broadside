// The chart: a small minimap showing islands, settlements, the player,
// the current gold objective, and nearby contacts. Map mode only.

import type { World } from '../sim/world';
import type { RunState } from '../sim/types';
import { ISLANDS, PORTS, WORLD } from '../sim/worldgen';
import { currentObjective, objectivePos } from '../sim/objectives';
import { $ } from './hud';

const W = 216;
const H = 152;
const PAD = 8;

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = $('mmc') as HTMLCanvasElement;
    this.canvas.width = W * 2;
    this.canvas.height = H * 2;
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(2, 2);
  }

  private sx(x: number): number {
    return PAD + ((x + WORLD.width / 2) / WORLD.width) * (W - PAD * 2);
  }

  private sy(y: number): number {
    return PAD + ((y + WORLD.height / 2) / WORLD.height) * (H - PAD * 2);
  }

  sync(world: World, run: RunState, time: number): void {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);

    // the Mist: shaded east country, thinner once it opens
    const mx = this.sx(WORLD.mistX);
    g.fillStyle = run.battle > 6 ? 'rgba(184,200,200,.08)' : 'rgba(184,200,200,.18)';
    g.fillRect(mx, 0, W - mx, H);

    // islands
    g.fillStyle = 'rgba(201,179,128,.55)';
    for (const isl of ISLANDS) {
      const r = Math.max(2, (isl.r / WORLD.width) * (W - PAD * 2));
      g.beginPath();
      g.arc(this.sx(isl.x), this.sy(isl.y), r, 0, Math.PI * 2);
      g.fill();
    }

    // settlements — gold squares (no names; the big chart carries those).
    // secret coves only after a captured log has charted them.
    for (const p of PORTS) {
      if (p.secret && !run.revealedSecrets.includes(p.id)) continue;
      const locked = run.rep[p.faction] <= -50;
      g.fillStyle = p.secret ? 'rgba(196,88,58,.95)' : locked ? 'rgba(196,88,58,.7)' : 'rgba(217,164,65,.95)';
      g.fillRect(this.sx(p.x) - 2.5, this.sy(p.y) - 2.5, 5, 5);
    }

    // contacts nearby
    g.fillStyle = 'rgba(196,88,58,.7)';
    for (const c of world.contacts) {
      if (c.gone) continue;
      g.beginPath();
      g.arc(this.sx(c.ship.x), this.sy(c.ship.y), 1.4, 0, Math.PI * 2);
      g.fill();
    }

    // your consorts — gold like everything that's yours
    g.fillStyle = 'rgba(217,164,65,.9)';
    for (const s of world.consorts) {
      g.beginPath();
      g.arc(this.sx(s.x), this.sy(s.y), 1.6, 0, Math.PI * 2);
      g.fill();
    }

    // current objective — pulsing gold ring
    const obj = currentObjective(run);
    if (obj) {
      const t = objectivePos(obj);
      const pulse = 3.5 + Math.sin(time * 3) * 1.4;
      g.strokeStyle = 'rgba(217,164,65,.95)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(this.sx(t.x), this.sy(t.y), pulse, 0, Math.PI * 2);
      g.stroke();
    }

    // the player — heading wedge
    const p = world.player;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(
      (Math.sin(p.heading) * (H - PAD * 2)) / WORLD.height,
      (Math.cos(p.heading) * (W - PAD * 2)) / WORLD.width,
    ));
    g.fillStyle = '#e9dcbe';
    g.beginPath();
    g.moveTo(4.5, 0);
    g.lineTo(-3, -2.6);
    g.lineTo(-3, 2.6);
    g.closePath();
    g.fill();
    g.restore();
  }
}

/** The big chart: a full-screen labelled map opened from the minimap. This is
 *  where settlement NAMES live (the minimap stays clean). */
export class BigMap {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private w = 0;
  private h = 0;

  constructor() {
    this.canvas = $('bigmapc') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  private fit(): void {
    const w = Math.min(960, Math.floor(innerWidth * 0.92));
    const h = Math.round(w * (WORLD.height / WORLD.width));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w * 2;
    this.canvas.height = h * 2;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(2, 0, 0, 2, 0, 0);
  }

  private sx(x: number): number {
    return ((x + WORLD.width / 2) / WORLD.width) * this.w;
  }

  private sy(y: number): number {
    return ((y + WORLD.height / 2) / WORLD.height) * this.h;
  }

  draw(world: World, run: RunState, time: number): void {
    this.fit();
    const g = this.ctx;
    const W2 = this.w;
    const H2 = this.h;
    g.clearRect(0, 0, W2, H2);
    g.fillStyle = 'rgba(20,66,78,.35)';
    g.fillRect(0, 0, W2, H2);

    // the Mist
    const mx = this.sx(WORLD.mistX);
    g.fillStyle = run.battle > 6 ? 'rgba(184,200,200,.08)' : 'rgba(184,200,200,.16)';
    g.fillRect(mx, 0, W2 - mx, H2);
    g.fillStyle = 'rgba(184,200,200,.5)';
    g.font = '11px "Courier New",monospace';
    g.save();
    g.translate(mx + (W2 - mx) / 2, H2 - 14);
    g.fillText('THE MIST', -22, 0);
    g.restore();

    // islands
    g.fillStyle = 'rgba(201,179,128,.6)';
    for (const isl of ISLANDS) {
      const r = Math.max(3, (isl.r / WORLD.width) * W2);
      g.beginPath();
      g.arc(this.sx(isl.x), this.sy(isl.y), r, 0, Math.PI * 2);
      g.fill();
    }

    // shipwreck salvage clusters (floating crates)
    g.fillStyle = 'rgba(180,210,215,.8)';
    for (const c of world.crates) {
      if (c.taken) continue;
      g.fillRect(this.sx(c.x) - 1.5, this.sy(c.y) - 1.5, 3, 3);
    }

    // settlements with NAMES
    g.font = '13px Georgia, serif';
    g.textBaseline = 'middle';
    for (const p of PORTS) {
      if (p.secret && !run.revealedSecrets.includes(p.id)) continue;
      const locked = run.rep[p.faction] <= -50;
      const x = this.sx(p.x);
      const y = this.sy(p.y);
      g.fillStyle = p.secret ? '#c4583a' : locked ? 'rgba(196,88,58,.85)' : '#d9a441';
      g.fillRect(x - 4, y - 4, 8, 8);
      g.fillStyle = p.secret ? '#e0a08f' : locked ? 'rgba(233,220,190,.6)' : '#e9dcbe';
      const label = (p.secret ? '☠ ' : '') + p.name + (locked ? ' (closed)' : '');
      g.textAlign = x > W2 * 0.8 ? 'right' : 'left';
      const ox = x > W2 * 0.8 ? -8 : 8;
      g.fillText(label, x + ox, y);
    }

    // current objective ring
    const obj = currentObjective(run);
    if (obj) {
      const t = objectivePos(obj);
      g.strokeStyle = 'rgba(217,164,65,.95)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(this.sx(t.x), this.sy(t.y), 8 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
      g.stroke();
    }

    // the player — heading wedge
    const pl = world.player;
    const px = this.sx(pl.x);
    const py = this.sy(pl.y);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(
      (Math.sin(pl.heading) * H2) / WORLD.height,
      (Math.cos(pl.heading) * W2) / WORLD.width,
    ));
    g.fillStyle = '#e9dcbe';
    g.beginPath();
    g.moveTo(8, 0);
    g.lineTo(-5, -5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
  }
}
