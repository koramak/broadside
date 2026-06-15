// In-battle HUD: status panel, fleet/enemy chips, wind rose, feed,
// fire buttons, off-screen enemy indicators. Reads sim state only.

import * as THREE from 'three';
import type { Battle } from '../sim/battle';
import { alive } from '../sim/battle';
import { DOCTRINES, SAILNAMES } from '../sim/constants';
import { loyaltyBand, loyaltyWord } from '../sim/captains';
import { TUNING } from '../sim/tuning';
import { GOODS, cargoLoad, fleetCargoCap } from '../sim/economy';
import { FACTIONS } from '../sim/worldgen';
import { clamp, dist as distLike } from '../sim/math';
import type { RunState } from '../sim/types';
import { LINE_NAMES, station as boardStation } from '../sim/boarding';
import type { BoardingState, Station, StationId } from '../sim/boarding';
import { BOARD_CFG } from '../sim/boardingConfig';
import { currentObjective } from '../sim/objectives';
import { daysLeft } from '../sim/contracts';
import { audio } from '../audio';

export const $ = (id: string): HTMLElement => document.getElementById(id)!;

/** consort morale → chip colour (mirrors the harbor palette) */
const HUD_MOOD_COLOR: Record<string, string> = {
  devoted: 'var(--gold)', steady: 'var(--parch-dim)', wary: '#d8915a', mutinous: 'var(--rust)',
};

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
    this.feedItems.push({ el, t: 9 });
    while (this.feedItems.length > 4) {
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
      const docShort = s.doctrine ? DOCTRINES[s.doctrine].label.split(' · ')[0] : '';
      const mood = s.loyalty !== undefined
        ? ` · <span style="color:${HUD_MOOD_COLOR[loyaltyBand(s.loyalty)]}">${loyaltyWord(s.loyalty)}</span>`
        : '';
      const c = document.createElement('div');
      c.className = 'chip';
      c.innerHTML = `<button data-h="${i}">HELM</button><div class="nm">${s.legend ? '★ ' : ''}${s.name}</div>
        <div class="tr">Capt. ${s.captain ? s.captain[0] : '—'} · ${docShort}${mood}</div>
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

    // during a boarding deck-fight the sailing controls give way to the
    // station deck — hide the helm/guns/ammo so nothing bleeds through
    const boarding = battle.phase === 'board';
    $('ammo').style.display = boarding ? 'none' : 'flex';
    $('helm').style.display = boarding ? 'none' : 'flex';
    $('guns').style.display = boarding ? 'none' : 'flex';
    if (boarding) {
      $('sigbtn').style.display = 'none';
      $('orderbtn').style.display = 'none';
      $('boardbtn').style.display = 'none';
      $('hint').style.display = 'none';
      return; // the station deck (syncBoarding) carries the rest
    }
    $('hint').style.display = '';
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
    // boarding button teaches its own conditions: visible whenever a real
    // target is near, label/state says what's missing
    const bc = battle.boardCheck();
    const bb = $('boardbtn') as HTMLButtonElement;
    const foeNear = bc.foe && !bc.foe.ghost && distLike(s, bc.foe) < 240;
    if (!paused && (bc.ok || (foeNear && (bc.reason === 'far' || bc.reason === 'fast')))) {
      bb.style.display = 'block';
      bb.disabled = !bc.ok;
      bb.textContent = bc.ok
        ? '⚓ GRAPPLE & BOARD'
        : bc.reason === 'far'
          ? '⚓ BOARD — get alongside'
          : '⚓ BOARD — match her speed';
    } else {
      bb.style.display = 'none';
    }

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

  /* ============ boarding: the tap-timing station deck ============ */

  onBoardTap: (id: StationId) => void = () => {};
  private builtFor = '';
  private ringC = 2 * Math.PI * 26; // ring circumference for the SVG timers
  private cards = new Map<StationId, { el: HTMLElement; arc: SVGCircleElement; sub: HTMLElement }>();

  private static LABELS: Record<string, string> = {
    swivel: 'SWIVEL', swivel2: 'SWIVEL II', pistols: 'PISTOLS',
    line0: 'BOW LINE', line1: 'MIDSHIP LINE', line2: 'STERN LINE',
    surgeon: 'SURGEON', reserve: 'RESERVE', helm: 'HELM',
  };

  /** Build a card per station the first time we see this fight's roster. */
  private buildStations(board: BoardingState): void {
    const key = board.stations.map((s) => s.id).join(',');
    if (this.builtFor === key) return;
    this.builtFor = key;
    const wrap = $('bstations');
    wrap.innerHTML = '';
    this.cards.clear();
    board.stations.forEach((st, i) => {
      const card = document.createElement('div');
      card.className = 'bstation';
      card.innerHTML =
        `<svg class="bring" viewBox="0 0 60 60">` +
        `<circle class="btrack" cx="30" cy="30" r="26"/>` +
        `<circle class="barc" cx="30" cy="30" r="26" transform="rotate(-90 30 30)"` +
        ` stroke-dasharray="${this.ringC.toFixed(1)}" stroke-dashoffset="${this.ringC.toFixed(1)}"/></svg>` +
        `<div class="bkey">${i + 1}</div>` +
        `<div class="blabel">${Hud.LABELS[st.id]}</div>` +
        `<div class="bsub"></div>`;
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio();
        this.onBoardTap(st.id);
      });
      wrap.appendChild(card);
      this.cards.set(st.id, {
        el: card,
        arc: card.querySelector('.barc') as SVGCircleElement,
        sub: card.querySelector('.bsub') as HTMLElement,
      });
    });
  }

  /** Per-station ring fraction (0..1) and the phase class. */
  private ringFor(st: Station): { frac: number; phase: string } {
    if (st.phase === 'priming') return { frac: st.primeT ? st.t / st.primeT : 0, phase: 'priming' };
    // window + fouled drain (full → empty) to read as urgency
    if (st.phase === 'window') return { frac: st.windowT ? 1 - st.t / st.windowT : 0, phase: 'window' };
    if (st.phase === 'fouled') return { frac: st.foulT ? 1 - st.t / st.foulT : 0, phase: 'fouled' };
    if (st.phase === 'spent') return { frac: 0, phase: 'spent' };
    return { frac: 0, phase: 'idle' };
  }

  private subFor(st: Station, board: BoardingState): string {
    if (st.id === 'surgeon') {
      const n = board.wounded.length;
      return n ? n + ' on the table' : 'no wounded';
    }
    if (st.id === 'reserve') return st.phase === 'spent' ? 'committed' : board.reserve + ' in the hatch';
    if (st.id === 'helm') return st.phase === 'spent' ? 'lashed in' : 'cut & run';
    if (st.id.startsWith('line')) {
      const i = st.id === 'line0' ? 0 : st.id === 'line1' ? 1 : 2;
      const h = board.lineHealth[i];
      if (h <= 0) return 'PARTED — re-rig';
      if (board.axe && board.axe.line === i) return '🪓 AXE — ' + Math.round(h * 100) + '%';
      return Math.round(h * 100) + '%';
    }
    return '';
  }

  syncBoarding(board: BoardingState | null): void {
    const panel = $('boarding');
    if (!board) {
      panel.style.display = 'none';
      return;
    }
    this.buildStations(board);
    panel.style.display = 'flex';
    $('btitle').textContent = 'BOARDING — ' + board.foe.name.toUpperCase();

    // each station ring
    for (const st of board.stations) {
      const c = this.cards.get(st.id);
      if (!c) continue;
      const { frac, phase } = this.ringFor(st);
      c.arc.style.strokeDashoffset = String(this.ringC * (1 - Math.max(0, Math.min(1, frac))));
      c.el.className = 'bstation phase-' + phase;
      // lines under an axe flash even while idle
      if (st.id.startsWith('line')) {
        const i = st.id === 'line0' ? 0 : st.id === 'line1' ? 1 : 2;
        if (board.lineHealth[i] <= 0) c.el.classList.add('parted');
        if (board.axe && board.axe.line === i) c.el.classList.add('axe');
      }
      c.sub.textContent = this.subFor(st, board);
    }

    // the front bar — drift in one glance, no numbers needed
    const fr = (board.front + 1) / 2; // 0 = your deck, 1 = their quarterdeck
    ($('bfrontmine') as HTMLElement).style.width = (fr * 100).toFixed(1) + '%';
    ($('bfronttheirs') as HTMLElement).style.width = ((1 - fr) * 100).toFixed(1) + '%';
    ($('bfrontmarker') as HTMLElement).style.left = (fr * 100).toFixed(1) + '%';
    $('bmine').textContent = Math.round(board.myHands) + (board.reserve ? ' +' + board.reserve : '') + ' hands';
    $('btheirs').textContent = Math.round(board.theirHands) + ' hands';

    // enemy demand banner
    const dem = $('bdemand');
    if (board.surge) {
      const k = Math.max(0, board.surge.t / BOARD_CFG.surge.patience);
      dem.className = 'surge';
      dem.innerHTML = '⚔ THEY MASS AT THE RAIL — answer with shot' +
        `<div class="bpatience"><i style="width:${(k * 100).toFixed(0)}%"></i></div>`;
    } else if (board.axe) {
      const i = board.axe.line;
      dem.className = 'axe';
      dem.innerHTML = '🪓 AN AXE AT THE ' + LINE_NAMES[i] + ' — heave it taut';
    } else if (board.pushT > 0) {
      dem.className = 'surge';
      dem.innerHTML = 'THEY HAVE THE RAIL — the front buckles';
    } else {
      dem.className = '';
      dem.innerHTML = '';
    }
  }

  /** Read a station's live phase for audio cue routing (main loop helper). */
  stationPhase(board: BoardingState, id: StationId): string {
    return boardStation(board, id)?.phase ?? 'idle';
  }

  /* ============ the Captain's Log ============ */

  onDismissRumor: (i: number) => void = () => {};

  syncLog(run: RunState): void {
    const rumors = $('logrumors');
    rumors.innerHTML = '';
    if (!run.rumors.length) {
      rumors.innerHTML = '<div class="logempty">No word worth keeping yet. Drink and listen.</div>';
    } else {
      run.rumors.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'logrow';
        const t = document.createElement('div');
        t.className = 'rtext';
        t.textContent = (r.source === 'log' ? '⚓ ' : '» ') + r.text;
        const x = document.createElement('div');
        x.className = 'rx';
        x.textContent = '✕';
        x.title = 'cross it off';
        x.addEventListener('click', () => {
          audio();
          this.onDismissRumor(i);
        });
        row.appendChild(t);
        row.appendChild(x);
        rumors.appendChild(row);
      });
    }

    const disc = $('logdisc');
    disc.innerHTML = run.discoveries.length
      ? run.discoveries.map((d) => '<div class="logdisc">' + d + '</div>').join('')
      : '<div class="logempty">Nothing charted from a dead man’s papers — yet.</div>';

    const chron = $('logchron');
    chron.innerHTML = run.chronicle.length
      ? run.chronicle.slice().reverse().map((c) => '<div class="logchron">' + c + '</div>').join('')
      : '<div class="logempty">The voyage has barely begun.</div>';
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
    $('minimap').style.display = battle ? 'none' : 'block';
    $('logbtn').style.display = battle ? 'none' : 'block';
    if (!battle) $('boardbtn').style.display = 'none';
    if (battle) $('dockbtn').style.display = 'none';
    $('hint').textContent = battle
      ? 'A/D steer · W/S sails · 1-3 shot · Q/E fire · F signal · G order · Tab take helm · B board · L log · Esc menu'
      : 'A/D steer · W/S sails · B make port · M chart · L log · sail the gold mark · Esc menu';
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
    const obj = currentObjective(run);
    $('battleno').textContent = obj ? obj.label : 'THE SEA REMEMBERS YOU';

    const dock = $('dockbtn');
    if (world.canDock) {
      dock.style.display = 'block';
      dock.textContent = '⚓ MAKE PORT — ' + world.canDock.name.toUpperCase() + ' (B)';
    } else {
      dock.style.display = 'none';
    }

    $('cargolist').innerHTML =
      'STORES ' + run.stores + ' · HOLD ' + cargoLoad(run) + '/' + fleetCargoCap(run) + '<br>' +
      (GOODS.filter((g) => (run.cargo[g.key] || 0) > 0)
        .map((g) => g.name + ' × ' + run.cargo[g.key])
        .join(' · ') || '') +
      (run.contracts.length
        ? '<br><span class="rumorhead">SIGNED ARTICLES</span><br>' +
          run.contracts.map((c) => '• ' + c.title + ' (' + daysLeft(c, world.day) + 'd)').join('<br>')
        : '') +
      (run.rumors.length
        ? '<br><span class="rumorhead">HEARD IN THE TAVERNS</span><br>' +
          run.rumors.map((r) => '«' + r.text + '»').join('<br>')
        : '');

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
  day: number;
}
