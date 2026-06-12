// In-battle HUD: status panel, fleet/enemy chips, wind rose, feed,
// fire buttons, off-screen enemy indicators. Reads sim state only.

import * as THREE from 'three';
import type { Battle } from '../sim/battle';
import { alive } from '../sim/battle';
import { DOCTRINES, SAILNAMES } from '../sim/constants';
import { TUNING } from '../sim/tuning';
import { GOODS, cargoLoad, fleetCargoCap } from '../sim/economy';
import { FACTIONS } from '../sim/worldgen';
import { clamp } from '../sim/math';
import type { RunState } from '../sim/types';
import { SECTION_NAMES } from '../sim/boarding';
import type { BoardingState } from '../sim/boarding';
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
      cd.style.width = clamp(100 - (s.reload[i] / TUNING.reloadBase) * 100, 0, 100) + '%';
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

  /** DOM edge arrows pointing at things outside the view. */
  syncOffscreen(camera: THREE.PerspectiveCamera, targets: { x: number; y: number; color: string }[]): void {
    while (this.arrowPool.length < targets.length) {
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
      const e = targets[i];
      if (!e) {
        el.style.display = 'none';
        continue;
      }
      el.style.borderBottomColor = e.color;
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

  /* ============ boarding panel ============ */

  private boardingRows: { bp: HTMLElement; be: HTMLElement; num: HTMLElement; send: HTMLButtonElement }[] = [];
  onBoardSend: (section: number) => void = () => {};
  onBoardSwivel: () => void = () => {};
  onBoardPress: () => void = () => {};

  private buildBoardingRows(): void {
    if (this.boardingRows.length) return;
    const wrap = $('bsections');
    SECTION_NAMES.forEach((name, i) => {
      const row = document.createElement('div');
      row.className = 'bsec';
      row.innerHTML =
        `<span class="bn">${name}</span><div class="bbar"><div class="bp"></div><div class="be"></div></div>` +
        `<span class="bnum"></span>`;
      const send = document.createElement('button');
      send.textContent = 'SEND 10 (' + (i + 1) + ')';
      send.addEventListener('click', () => {
        audio();
        this.onBoardSend(i);
      });
      row.appendChild(send);
      wrap.appendChild(row);
      this.boardingRows.push({
        bp: row.querySelector('.bp') as HTMLElement,
        be: row.querySelector('.be') as HTMLElement,
        num: row.querySelector('.bnum') as HTMLElement,
        send,
      });
    });
    $('bswivel').addEventListener('click', () => {
      audio();
      this.onBoardSwivel();
    });
    $('bpress').addEventListener('click', () => {
      audio();
      this.onBoardPress();
    });
  }

  syncBoarding(board: BoardingState | null): void {
    const panel = $('boarding');
    if (!board) {
      panel.style.display = 'none';
      return;
    }
    this.buildBoardingRows();
    panel.style.display = 'block';
    $('btitle').textContent = 'BOARDING — ' + board.foe.name;
    for (let i = 0; i < 3; i++) {
      const r = this.boardingRows[i];
      const p = board.secP[i];
      const e = board.secE[i];
      const span = Math.max(p + e, 1);
      r.bp.style.width = (p / span) * 48 + '%';
      r.be.style.width = (e / span) * 48 + '%';
      const incoming = board.transits.filter((t) => t.section === i).reduce((t, tr) => t + tr.n, 0);
      r.num.textContent = Math.round(p) + (incoming ? '+' + incoming : '') + ' / ' + Math.round(e);
      r.send.disabled = board.pReserve < 1;
      // swivel telegraph: flash the threatened section
      const tel = board.swivelTarget && board.swivelTarget.section === i;
      r.be.style.opacity = tel ? '0.45' : '0.85';
    }
    $('breserve').textContent =
      'RESERVE ' + Math.round(board.pReserve) + ' · THEIRS ' + Math.round(board.eReserve);
    ($('bswivel') as HTMLButtonElement).disabled = board.swivelCd > 0 || !!board.swivelTarget;
    $('bswivel').textContent = board.swivelCd > 0 ? 'SWIVEL ' + board.swivelCd.toFixed(0) + 's' : 'SWIVEL (Q)';
    $('bpress').classList.toggle('on', board.press);
  }

  /* ============ map mode ============ */

  setMode(mode: 'battle' | 'map'): void {
    const battle = mode === 'battle';
    $('guns').style.display = battle ? 'flex' : 'none';
    $('ammo').style.display = battle ? 'flex' : 'none';
    $('fleet').style.display = battle ? 'flex' : 'none';
    $('estat').style.display = battle ? 'flex' : 'none';
    $('cargo').style.display = battle ? 'none' : 'block';
    $('rep').style.display = battle ? 'none' : 'block';
    if (!battle) $('boardbtn').style.display = 'none';
    if (battle) $('dockbtn').style.display = 'none';
    $('hint').textContent = battle
      ? 'A/D steer · W/S sails · 1-3 shot · Q/E fire · F signal · G order · Tab take helm · B board · Esc menu'
      : 'A/D steer · W/S sails · B make port · sail the gold mark to advance · Esc menu';
  }

  syncMap(world: WorldLike, run: RunState): void {
    const p = world.player;
    $('pname').textContent = 'Persistence';
    $('ph').style.width = run.flag.hullPct * 100 + '%';
    $('ps').style.width = run.flag.sailHP + '%';
    $('pc').style.width = run.flag.crewPct * 100 + '%';
    $('prud').textContent = this.rudderWord(run.flag.rudderHP);
    $('prud').style.color = run.flag.rudderHP < 50 ? '#c4583a' : '';
    $('sailset').textContent = SAILNAMES[p.sailIdx];
    $('rosearrow').setAttribute(
      'transform',
      `rotate(${((world.wind.dir * 180) / Math.PI + 90).toFixed(1)} 27 27)`,
    );
    $('knots').textContent = (p.speed / 14).toFixed(1) + ' kn';
    $('battleno').textContent =
      run.battle <= 6
        ? 'ACTION ' + run.battle + ' — SAIL TO THE GOLD MARK'
        : run.battle <= 9
          ? 'THE MIST — ACTION ' + run.battle + ' OF 9'
          : 'THE SEA REMEMBERS YOU';

    const dock = $('dockbtn');
    if (world.canDock) {
      dock.style.display = 'block';
      dock.textContent = '⚓ MAKE PORT — ' + world.canDock.name.toUpperCase() + ' (B)';
    } else {
      dock.style.display = 'none';
    }

    $('cargolist').innerHTML =
      'STORES ' + run.stores + ' · HOLD ' + cargoLoad(run) + '/' + fleetCargoCap(run) + '<br>' +
      GOODS.filter((g) => (run.cargo[g.key] || 0) > 0)
        .map((g) => g.name + ' × ' + run.cargo[g.key])
        .join(' · ') || '';

    $('replist').innerHTML = FACTIONS.map((f) => {
      const r = run.rep[f.key];
      const word = r > 30 ? 'ally' : r > -20 ? 'wary' : r > -50 ? 'hostile' : 'shoot on sight';
      return f.name + ': ' + r + ' (' + word + ')';
    }).join('<br>');
  }
}

/** the slice of World the HUD needs (avoids a sim import cycle) */
interface WorldLike {
  player: { sailIdx: number; speed: number };
  wind: { dir: number };
  canDock: { name: string } | null;
}
