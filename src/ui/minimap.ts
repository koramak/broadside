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

    // settlements — gold squares, dimmed if their flag won't have you
    for (const p of PORTS) {
      const locked = run.rep[p.faction] <= -50;
      g.fillStyle = locked ? 'rgba(196,88,58,.8)' : 'rgba(217,164,65,.95)';
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
