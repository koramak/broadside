// In-battle HUD: status panel, fleet/enemy chips, wind rose, feed,
// fire buttons, off-screen enemy indicators. Reads sim state only.

import * as THREE from 'three';
import type { Battle } from '../sim/battle';
import { alive } from '../sim/battle';
import { DOCTRINES, RELOAD_BASE, SAILNAMES } from '../sim/constants';
import { clamp } from '../sim/math';
import { audio } from '../audio';

export const $ = (id: string): HTMLElement => document.getElementById(id)!;

interface FeedItem {
  el: HTMLElement;
  t: number;
}

export class Hud {
  private feedItems: FeedItem[] = [];
  private chipBars = new Map<number, HTMLElement>();
  private chipEls = new Map<number, HTMLElement>();
  private arrowPool: HTMLElement[] = [];
  onTakeHelm: (idx: number) => void = () => {};

  feed(msg: string): void {
    const el = document.createElement('div');
    el.textContent = msg;
    $('feed').appendChild(el);
    this.feedItems.push({ el, t: 4 });
    while (this.feedItems.length > 3) {
      const o = this.feedItems.shift()!;
      o.el.remove();
    }
  }

  clearFeed(): void {
    $('feed').innerHTML = '';
    this.feedItems = [];
  }

  updateFeed(dt: number): void {
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.t -= dt;
      if (f.t < 1) f.el.style.opacity = String(Math.max(0, f.t));
      if (f.t <= 0) {
        f.el.remove();
        this.feedItems.splice(i, 1);
      }
    }
  }

  buildChips(battle: Battle): void {
    this.chipBars.clear();
    this.chipEls.clear();
    const f = $('fleet');
    f.innerHTML = '';
    battle.ships.forEach((s, i) => {
      if (s.team !== 'p' || i === battle.ctrl) return;
      const doc = s.doctrine ? DOCTRINES[s.doctrine] : null;
      const c = document.createElement('div');
      c.className = 'chip';
      c.innerHTML = `<button data-h="${i}">HELM</button><div class="nm">${s.name}</div>
        <div class="tr">Capt. ${s.captain ? s.captain[0] : '—'} · ${doc ? doc.label : ''}</div>
        <div class="bar hull"><i></i></div>`;
      f.appendChild(c);
      this.chipEls.set(i, c);
      this.chipBars.set(i, c.querySelector('.bar i') as HTMLElement);
    });
    const e = $('estat');
    e.innerHTML = '';
    battle.ships.forEach((s, i) => {
      if (s.team !== 'e') return;
      const c = document.createElement('div');
      c.className = 'chip';
      c.innerHTML = `<div class="nm">${s.name}</div>
        <div class="tr">Capt. ${s.captain ? s.captain[0] : '—'}</div>
        <div class="bar hull"><i></i></div>`;
      e.appendChild(c);
      this.chipEls.set(i, c);
      this.chipBars.set(i, c.querySelector('.bar i') as HTMLElement);
    });
    document.querySelectorAll<HTMLElement>('[data-h]').forEach((b) =>
      b.addEventListener('click', () => {
        audio();
        this.onTakeHelm(+b.dataset.h!);
      }),
    );
  }

  applyHelmUI(battle: Battle): void {
    const s = battle.P();
    $('pname').textContent = s.name;
    this.setAmmoUI(s.ammo);
    $('sailset').textContent = SAILNAMES[s.sailIdx];
    this.buildChips(battle);
  }

  setAmmoUI(i: number): void {
    for (let j = 0; j < 3; j++) $('a' + j).classList.toggle('on', j === i);
  }

  syncOrderBtn(battle: Battle): void {
    $('orderbtn').textContent = 'ORDER: ' + (battle.formUp ? 'FORM ON ME' : 'ENGAGE') + ' (G)';
    $('orderbtn').classList.toggle('on', battle.formUp);
  }

  setBattleNo(n: number, of: number): void {
    $('battleno').textContent = 'ACTION ' + n + ' OF ' + of;
  }

  private rudderWord(rudderHP: number): string {
    return rudderHP <= 0 ? 'Rudder shot away' : rudderHP < 50 ? 'Rudder damaged' : 'Rudder sound';
  }

  sync(battle: Battle, paused: boolean): void {
    const s = battle.P();
    const foe = battle.nearestEnemy(s);
    $('ph').style.width = (s.hull / s.maxHull) * 100 + '%';
    $('ps').style.width = s.sailHP + '%';
    $('pc').style.width = (s.crew / s.maxCrew) * 100 + '%';
    $('prud').textContent = this.rudderWord(s.rudderHP);
    $('prud').style.color = s.rudderHP < 50 ? '#c4583a' : '';
    $('sailset').textContent = SAILNAMES[s.sailIdx];
    this.setAmmoUI(s.ammo);

    $('rosearrow').setAttribute(
      'transform',
      `rotate(${((battle.wind.dir * 180) / Math.PI + 90).toFixed(1)} 27 27)`,
    );
    $('knots').textContent = (s.speed / 14).toFixed(1) + ' kn';

    for (let i = 0; i < 2; i++) {
      const btn = $(i ? 'fstbd' : 'fport') as HTMLButtonElement;
      const cd = $(i ? 'cdstbd' : 'cdport');
      const lbl = $(i ? 'lblstbd' : 'lblport');
      const ready = s.reload[i] <= 0;
      cd.style.width = clamp(100 - (s.reload[i] / RELOAD_BASE) * 100, 0, 100) + '%';
      lbl.textContent = (i ? 'STBD ' : 'PORT ') + s.gunsLeft[i];
      btn.classList.toggle('ready', ready);
      btn.classList.toggle('aim', ready && battle.inArc(s, foe, i));
      btn.disabled = !ready || s.gunsLeft[i] <= 0 || battle.phase !== 'sail';
    }

    const hasFleet = battle.living('p').length > 1;
    $('sigbtn').style.display = hasFleet ? 'block' : 'none';
    $('orderbtn').style.display = hasFleet ? 'block' : 'none';
    $('boardbtn').style.display = battle.boardTarget() && !paused ? 'block' : 'none';

    // chips
    battle.ships.forEach((s2, i) => {
      const bar = this.chipBars.get(i);
      if (bar) bar.style.width = (s2.hull / s2.maxHull) * 100 + '%';
      const el = this.chipEls.get(i);
      if (el) el.classList.toggle('dead', !alive(s2));
    });
  }

  /** DOM edge arrows pointing at enemies outside the view. */
  syncOffscreen(battle: Battle, camera: THREE.PerspectiveCamera): void {
    const enemies = battle.living('e');
    while (this.arrowPool.length < enemies.length) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;' +
        'border-bottom:14px solid rgba(196,88,58,.85);pointer-events:none;z-index:4;display:none';
      document.body.appendChild(el);
      this.arrowPool.push(el);
    }
    const v = new THREE.Vector3();
    const margin = 30;
    for (let i = 0; i < this.arrowPool.length; i++) {
      const el = this.arrowPool[i];
      const e = enemies[i];
      if (!e) {
        el.style.display = 'none';
        continue;
      }
      v.set(e.x, 10, e.y).project(camera);
      const sx = (v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const onScreen = v.z < 1 && sx > -20 && sx < innerWidth + 20 && sy > -20 && sy < innerHeight + 20;
      if (onScreen) {
        el.style.display = 'none';
        continue;
      }
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      let dx = sx - cx;
      let dy = sy - cy;
      if (v.z >= 1) {
        dx = -dx;
        dy = -dy;
      } // behind the camera: flip
      const ang = Math.atan2(dy, dx);
      const ex = cx + Math.cos(ang) * (cx - margin) * 0.92;
      const ey = cy + Math.sin(ang) * (cy - margin) * 0.92;
      el.style.display = 'block';
      el.style.left = ex - 7 + 'px';
      el.style.top = ey - 7 + 'px';
      el.style.transform = `rotate(${ang + Math.PI / 2}rad)`;
    }
  }

  hideArrows(): void {
    for (const el of this.arrowPool) el.style.display = 'none';
  }
}
