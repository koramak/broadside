// BROADSIDE — game shell. Owns the fixed-timestep loop and the
// battle → harbor → battle flow. Sim is deterministic and renderer-free;
// this file is the only place the two meet.

import './ui/ui.css';
import { Battle } from './sim/battle';
import { ESCALATION, SIM_DT } from './sim/constants';
import { newRun } from './sim/run';
import { Rng } from './sim/rng';
import type { RunState } from './sim/types';
import { SceneShell } from './render/renderer';
import { ShipView } from './render/shipView';
import { Effects } from './render/effects';
import { Hud, $ } from './ui/hud';
import { HarborScreen } from './ui/harbor';
import { Input } from './input/input';
import { audio, boom } from './audio';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const shell = new SceneShell(canvas);
const effects = new Effects(shell.scene);
const hud = new Hud();
const harbor = new HarborScreen();

let run: RunState = newRun();
// master RNG seeds each battle; reseeded per run so runs differ
let masterRng = new Rng(Date.now() >>> 0);
let battle: Battle | null = null;
let shipViews: ShipView[] = [];
let paused = false;
let mode: 'battle' | 'harbor' | 'over' = 'battle';

function setPaused(v: boolean): void {
  if (v && battle && battle.phase === 'end') return;
  paused = v;
  $('pausemenu').style.display = v ? 'flex' : 'none';
}

function startBattle(): void {
  // tear down old views
  for (const sv of shipViews) sv.dispose(shell.scene);
  shipViews = [];
  effects.clearTransient();

  battle = new Battle(run, masterRng.int(2 ** 31));
  for (const s of battle.ships) {
    const sv = new ShipView(s);
    shell.scene.add(sv.group);
    shipViews.push(sv);
  }
  hud.clearFeed();
  hud.applyHelmUI(battle);
  hud.syncOrderBtn(battle);
  hud.setBattleNo(run.battle, ESCALATION.length);
  harbor.hide();
  $('overlay').style.display = 'none';
  mode = 'battle';
  setPaused(false);
}

function startRun(): void {
  run = newRun();
  masterRng = new Rng(Date.now() >>> 0);
  $('overlay').style.display = 'none';
  startBattle();
}

function showRunOver(title: string, text: string): void {
  mode = 'over';
  $('otitle').textContent = title;
  $('otext').textContent = text;
  $('runstats').textContent =
    'Actions won: ' + (run.battle - 1) + ' · Prizes: ' + run.stats.prizes + ' · Sunk: ' + run.stats.sunk;
  $('overlay').style.display = 'flex';
}

function showVictory(): void {
  mode = 'over';
  $('otitle').textContent = 'THE PLATE SHIP IS YOURS';
  $('otext').textContent =
    'Six actions, and the richest hull on the sea strikes to you. The run is complete.';
  $('runstats').textContent =
    'Prizes: ' + run.stats.prizes + ' · Sunk: ' + run.stats.sunk + ' · Stores: ' + run.stores;
  $('overlay').style.display = 'flex';
}

/* ============ wiring ============ */

const input = new Input({
  setAmmo: (i) => {
    if (battle && !paused) {
      battle.setAmmo(i);
      hud.setAmmoUI(i);
    }
  },
  fire: (side) => {
    if (battle && !paused) battle.fire(battle.P(), side);
  },
  sailUp: () => {
    if (battle && !paused) battle.setSail(battle.P().sailIdx + 1);
  },
  sailDown: () => {
    if (battle && !paused) battle.setSail(battle.P().sailIdx - 1);
  },
  signal: () => {
    if (battle && !paused) battle.signal();
  },
  toggleOrder: () => {
    if (battle && !paused) {
      battle.toggleOrder();
      hud.syncOrderBtn(battle);
    }
  },
  board: () => {
    if (battle && !paused) battle.startBoarding();
  },
  nextHelm: () => {
    if (battle && !paused) {
      battle.nextHelm();
      hud.applyHelmUI(battle);
    }
  },
  togglePause: () => setPaused(!paused),
});

hud.onTakeHelm = (idx) => {
  if (battle && !paused && battle.takeHelm(idx)) hud.applyHelmUI(battle);
};

harbor.bind();
harbor.onSetSail = () => {
  run.battle++;
  startBattle();
};

$('orestart').addEventListener('click', () => {
  audio();
  startRun();
});
$('presume').addEventListener('click', () => setPaused(false));
$('pabandon').addEventListener('click', () => {
  audio();
  setPaused(false);
  showRunOver('RUN ABANDONED', 'You turn for home with what you have.');
});

/* ============ main loop ============ */

let last = performance.now();
let acc = 0;
let simTime = 0;
/** Test hook: when true the main loop renders but never steps the sim. */
let freeze = false;

function frame(now: number): void {
  const dtReal = Math.min((now - last) / 1000, 0.25);
  last = now;

  if (battle && mode === 'battle' && !paused && !freeze) {
    acc += dtReal;
    while (acc >= SIM_DT) {
      acc -= SIM_DT;
      battle.playerRudder = input.rudder();
      battle.step(SIM_DT, run);
      simTime += SIM_DT;
    }

    // outcome?
    if (battle.outcome) {
      const out = battle.outcome;
      battle.outcome = null;
      if (out.result === 'won') {
        if (run.battle >= 6) showVictory();
        else {
          mode = 'harbor';
          hud.hideArrows();
          harbor.show(run, masterRng);
        }
      } else {
        showRunOver(
          'THE RUN ENDS',
          'Every ship under your flag is sunk, struck, or taken. The Plate Ship sails on without you.',
        );
      }
    }
  }

  // drain sim events → feed, audio, effects
  if (battle) {
    for (const e of battle.events.drain()) {
      switch (e.kind) {
        case 'feed':
          hud.feed(e.msg);
          break;
        case 'boom':
          boom(e.vol, e.len, e.freq);
          break;
        case 'muzzle':
          effects.smoke(e.x, e.y, e.dir);
          break;
        case 'impact':
          effects.impact(e.x, e.y);
          break;
        case 'splash':
          effects.splash(e.x, e.y);
          break;
        case 'wake':
          effects.wake(e.x, e.y);
          break;
        default:
          break;
      }
    }
  }

  // render
  if (battle) {
    const p = battle.P();
    shell.follow(p.x, p.y, dtReal);
    shell.updateEnvironment(simTime, battle.wind.dir, paused || mode !== 'battle');
    for (const sv of shipViews) sv.update(sv.ship === p);
    effects.syncBalls(battle.balls, simTime);
    effects.update(paused ? 0 : dtReal);
    if (mode === 'battle') {
      hud.sync(battle, paused);
      hud.syncOffscreen(battle, shell.camera);
      if (!paused) hud.updateFeed(dtReal);
    }
  }
  shell.render();
  requestAnimationFrame(frame);
}

startRun();
requestAnimationFrame(frame);

// Dev/debug handle for automated verification (harmless in production).
declare global {
  interface Window {
    __broadside?: unknown;
  }
}
window.__broadside = {
  get battle() {
    return battle;
  },
  get run() {
    return run;
  },
  get mode() {
    return mode;
  },
  stepMany(n: number) {
    if (!battle || mode !== 'battle') return;
    for (let i = 0; i < n && !battle.outcome; i++) battle.step(SIM_DT, run);
  },
  setSail: () => harbor.onSetSail(),
  freeze(v: boolean) {
    freeze = v;
  },
  nextBattle() {
    run.battle++;
    startBattle();
  },
  startRun,
};
