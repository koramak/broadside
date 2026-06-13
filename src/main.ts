// BROADSIDE — game shell. Owns the fixed-timestep loop and the
// map ⇄ battle ⇄ port flow. The sim is deterministic and renderer-free;
// this file is the only place the two meet.

import './ui/ui.css';
import { Battle } from './sim/battle';
import type { BattleSpec } from './sim/battle';
import { SIM_DT } from './sim/constants';
import { newRun, topUpCrew, chronicle, desertionSweep } from './sim/run';
import { bark } from './sim/captains';
import { clampCargo } from './sim/economy';
import { Rng } from './sim/rng';
import type { RunState } from './sim/types';
import { World } from './sim/world';
import type { EncounterSpec } from './sim/world';
import { SceneShell } from './render/renderer';
import { ShipView } from './render/shipView';
import { Effects } from './render/effects';
import { ModelLibrary, PROP_MODEL_NAMES, SHIP_MODEL_NAMES } from './render/models';
import { WorldView } from './render/worldView';
import { Hud, $ } from './ui/hud';
import { HarborScreen } from './ui/harbor';
import { PortScreen } from './ui/port';
import { Input } from './input/input';
import { Minimap, BigMap } from './ui/minimap';
import { audio, boom, setMusic, boardTick, boardFoul, woodHit, splash } from './audio';
import { currentObjective, objectivePos, onDocked } from './sim/objectives';
import { refreshRumors } from './sim/economy';
import { PORTS } from './sim/worldgen';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const shell = new SceneShell(canvas);
const effects = new Effects(shell.scene);
const hud = new Hud();
const harbor = new HarborScreen();
const portScreen = new PortScreen();
const lib = new ModelLibrary();
let worldView: WorldView | null = null;
let minimap: Minimap | null = null;
let bigmap: BigMap | null = null;

type Mode = 'map' | 'battle' | 'aftermath' | 'port' | 'over';

let run: RunState = newRun();
let masterRng = new Rng(Date.now() >>> 0);
let world: World | null = null;
let playerMapView: ShipView | null = null;
let battle: Battle | null = null;
let currentEnc: EncounterSpec | null = null;
let shipViews: ShipView[] = [];
let paused = false;
let logOpen = false;
let mode: Mode = 'map';

function toggleLog(v?: boolean): void {
  logOpen = v === undefined ? !logOpen : v;
  if (logOpen) hud.syncLog(run);
  $('log').style.display = logOpen ? 'flex' : 'none';
}

let mapOpen = false;
function toggleMap(v?: boolean): void {
  // the big chart only makes sense on the sea map
  if (mode !== 'map' && v !== false) return;
  mapOpen = v === undefined ? !mapOpen : v;
  $('bigmap').style.display = mapOpen ? 'flex' : 'none';
}

function setPaused(v: boolean): void {
  if (v && battle && battle.phase === 'end') return;
  paused = v;
  $('pausemenu').style.display = v ? 'flex' : 'none';
}

/* ============ mode transitions ============ */

function enterMap(): void {
  mode = 'map';
  hud.setMode('map');
  harbor.hide();
  portScreen.hide();
  $('overlay').style.display = 'none';
  worldView?.setVisible(true);
  if (world) {
    // a flagship trade-up changes the hull class: rebuild the chart ship + mesh
    if (world.player.cls !== run.flag.cls) {
      world.rebuildPlayer(run);
      if (playerMapView) playerMapView.dispose(shell.scene);
      playerMapView = new ShipView(world.player, lib);
      shell.scene.add(playerMapView.group);
    }
    world.syncPlayerFromRun(run);
    if (playerMapView) playerMapView.group.visible = true;
    shell.snapTo(world.player.x, world.player.y);
  }
  hud.hideArrows();
}

function startBattle(spec: BattleSpec): void {
  for (const sv of shipViews) sv.dispose(shell.scene);
  shipViews = [];
  effects.clearTransient();

  battle = new Battle(run, masterRng.int(2 ** 31), spec);
  for (const s of battle.ships) {
    const sv = new ShipView(s, lib);
    shell.scene.add(sv.group);
    shipViews.push(sv);
  }
  shell.snapTo(battle.P().x, battle.P().y);
  hud.clearFeed();
  hud.setMode('battle');
  hud.applyHelmUI(battle);
  hud.syncOrderBtn(battle);
  $('battleno').textContent = spec.story
    ? spec.story <= 6
      ? 'ACTION ' + spec.story + ' OF 6'
      : 'THE MIST — ' + (spec.story - 6) + ' OF 3'
    : 'ENGAGEMENT';
  worldView?.setVisible(false);
  if (playerMapView) playerMapView.group.visible = false;
  mode = 'battle';
  setPaused(false);
}

function endBattleCleanup(): void {
  for (const sv of shipViews) sv.dispose(shell.scene);
  shipViews = [];
  effects.clearTransient();
  hud.syncBoarding(null);
  battle = null;
}

function startRun(): void {
  run = newRun();
  masterRng = new Rng(Date.now() >>> 0);
  world = new World(run, masterRng.int(2 ** 31));
  worldView?.clearDynamic();
  if (playerMapView) playerMapView.dispose(shell.scene);
  playerMapView = new ShipView(world.player, lib);
  shell.scene.add(playerMapView.group);
  endBattleCleanup();
  hud.clearFeed();
  hud.feed('The Plate Fleet is forming up somewhere east. Your chart marks the first of six actions.');
  hud.feed('Wind, guns, and arithmetic. Everything else is decoration.');
  shell.snapTo(world.player.x, world.player.y);
  enterMap();
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
  $('otitle').textContent = 'WHAT THE MIST WANTED';
  $('otext').textContent =
    'The Harrow comes apart like a bad argument. The Mist holds for one breath — then rolls back east, ' +
    'unhurried, the way a creditor leaves a paid house. The sea is just water again. ' +
    'You took the richest hull afloat and then you took the thing that was collecting it. ' +
    'Somewhere west, taverns are already getting the story wrong.';
  $('runstats').textContent =
    'Prizes: ' + run.stats.prizes + ' · Sunk: ' + run.stats.sunk + ' · Stores: ' + run.stores;
  $('overlay').style.display = 'flex';
}

/* ============ wiring ============ */

const input = new Input({
  setAmmo: (i) => {
    if (mode === 'battle' && battle && !paused && battle.phase === 'sail') {
      battle.setAmmo(i);
      hud.setAmmoUI(i);
    }
  },
  boardStation: (n) => {
    if (mode === 'battle' && battle && !paused && battle.phase === 'board') {
      battle.boardTapIndex(n);
    }
  },
  fire: (side) => {
    if (mode === 'battle' && battle && !paused && battle.phase === 'sail') {
      battle.fire(battle.P(), side);
    }
  },
  sailUp: () => {
    if (paused) return;
    if (mode === 'battle' && battle) battle.setSail(battle.P().sailIdx + 1);
    if (mode === 'map' && world) world.player.sailIdx = Math.min(2, world.player.sailIdx + 1);
  },
  sailDown: () => {
    if (paused) return;
    if (mode === 'battle' && battle) battle.setSail(battle.P().sailIdx - 1);
    if (mode === 'map' && world) world.player.sailIdx = Math.max(0, world.player.sailIdx - 1);
  },
  signal: () => {
    if (mode === 'battle' && battle && !paused) battle.signal();
  },
  toggleOrder: () => {
    if (mode === 'battle' && battle && !paused && battle.phase === 'sail') {
      battle.toggleOrder();
      hud.syncOrderBtn(battle);
    }
  },
  board: () => {
    if (paused) return;
    if (mode === 'battle' && battle) battle.startBoarding();
    if (mode === 'map' && world && world.canDock) enterPort(world.canDock);
  },
  nextHelm: () => {
    if (mode === 'battle' && battle && !paused) {
      battle.nextHelm();
      hud.applyHelmUI(battle);
    }
  },
  togglePause: () => {
    if (mode === 'battle' || mode === 'map') setPaused(!paused);
  },
  toggleLog: () => {
    if (!paused) toggleLog();
  },
  toggleMap: () => {
    if (!paused) toggleMap();
  },
});

hud.onDismissRumor = (i) => {
  run.rumors.splice(i, 1);
  hud.syncLog(run);
};
$('logbtn').addEventListener('click', () => {
  audio();
  if (!paused) toggleLog();
});
$('logclose').addEventListener('click', () => {
  audio();
  toggleLog(false);
});
$('minimap').addEventListener('click', () => {
  audio();
  if (!paused) toggleMap(true);
});
$('bigmapclose').addEventListener('click', () => {
  audio();
  toggleMap(false);
});

hud.onTakeHelm = (idx) => {
  if (mode === 'battle' && battle && !paused && battle.takeHelm(idx)) hud.applyHelmUI(battle);
};
hud.onBoardTap = (id) => {
  if (mode === 'battle' && battle && !paused) battle.boardTap(id);
};

harbor.bind();
harbor.onFeed = (m) => {
  hud.feed(m);
  chronicle(run, m);
};
harbor.onSetSail = () => {
  if (mode !== 'aftermath') return;
  // aftermath dismissed — back to the chart (or, after the Harrow, the end)
  if (currentEnc && currentEnc.story === 9) {
    showVictory();
    return;
  }
  if (currentEnc && currentEnc.story === 6) {
    hud.clearFeed();
    hud.feed('The Plate Ship is yours. And east of the Tessellate, the Mist just... opened.');
    hud.feed('Three more marks on a chart that no longer believes in itself.');
  }
  currentEnc = null;
  enterMap();
};

portScreen.bind();
portScreen.onLeave = () => {
  enterMap();
};
portScreen.onShipChanged = () => {
  if (world) world.syncPlayerFromRun(run);
};

function enterPort(port: NonNullable<World['canDock']>): void {
  mode = 'port';
  if (world) {
    onDocked(run, port.id, world.events);
    // the tavern talks the moment you tie up
    refreshRumors(run, PORTS, port.id, world.day);
    // pool hands walk aboard free — replenishing crew at port is automatic
    const before = run.pool;
    if (topUpCrew(run)) {
      const joined = before - run.pool;
      if (joined > 0) world.events.feed(joined + ' hands from your pool walk aboard — muster made good');
      world.syncPlayerFromRun(run);
    }
  }
  portScreen.show(port, run, world ? world.day : 0);
}

$('dockbtn').addEventListener('click', () => {
  audio();
  if (mode === 'map' && world && world.canDock && !paused) enterPort(world.canDock);
});

// playtest dials (pause menu) — explicit tester action, defaults stay canon
import { TUNING, setRake } from './sim/tuning';
import { EASY } from './sim/easing';
document.querySelectorAll<HTMLButtonElement>('[data-dial]').forEach((b) => {
  b.addEventListener('click', () => {
    audio();
    const dial = b.dataset.dial!;
    const v = b.dataset.v!;
    if (dial === 'ball') TUNING.ballSpd = Number(v);
    if (dial === 'reload') TUNING.reloadBase = Number(v);
    if (dial === 'rake') setRake(v as 'full' | 'reduced');
    if (dial === 'easy') EASY.on = v === 'on';
    if (dial === 'music') setMusic(v === 'on');
    document
      .querySelectorAll<HTMLButtonElement>(`[data-dial="${dial}"]`)
      .forEach((x) => x.classList.toggle('on', x === b));
    hud.feed('FEEL dial — ' + dial + ' set to ' + v);
  });
});

$('orestart').addEventListener('click', () => {
  audio();
  startRun();
});
$('presume').addEventListener('click', () => setPaused(false));
$('pabandon').addEventListener('click', () => {
  audio();
  setPaused(false);
  showRunOver('RUN ABANDONED', 'You turn for home with what you have. The sea shrugs.');
});

/* ============ outcome handling ============ */

function handleBattleOutcome(): void {
  if (!battle || !battle.outcome) return;
  const out = battle.outcome;
  battle.outcome = null;
  if (out.result === 'won') {
    const enc = currentEnc;
    if (world && enc) world.applyVictory(run, enc);
    // any consort whose morale bottomed out slips away with her hull
    for (const d of desertionSweep(run)) {
      const line = bark(d.captain, 'desert', masterRng) ?? d.captain[0] + ' deserts, taking her hull with her.';
      hud.feed(line);
      chronicle(run, line);
    }
    const lost = clampCargo(run);
    if (lost > 0) hud.feed(lost + ' cargo went down with the hull that carried it.');
    endBattleCleanup();
    mode = 'aftermath';
    hud.hideArrows();
    harbor.show(run, masterRng, {
      title: enc && enc.story
        ? enc.story === 6
          ? 'THE PLATE SHIP IS YOURS'
          : enc.story === 9
            ? 'THE HARROW IS BROKEN'
            : enc.story > 6
              ? 'THE MIST GIVES GROUND'
              : 'ACTION ' + enc.story + ' WON'
        : 'THE RECKONING',
      nextLabel: enc && enc.story === 9 ? 'CLAIM YOUR LEGEND' : enc && enc.story === 6 ? 'INTO WHAT COMES NEXT' : 'BACK TO THE CHART',
      atSea: true,
    });
  } else {
    showRunOver(
      'THE RUN ENDS',
      'Every ship under your flag is sunk, struck, or taken. The Plate Ship sails on without you, heavier by exactly one lesson.',
    );
  }
}

/* ============ main loop ============ */

let last = performance.now();
let acc = 0;
let simTime = 0;
let freeze = false;
let frameCount = 0;

function frame(now: number): void {
  const dtReal = Math.min((now - last) / 1000, 0.25);
  last = now;
  frameCount++;

  if (!paused && !freeze && !logOpen && !mapOpen) {
    acc += dtReal;
    while (acc >= SIM_DT) {
      acc -= SIM_DT;
      simTime += SIM_DT;
      if (mode === 'battle' && battle) {
        battle.playerRudder = input.rudder();
        battle.step(SIM_DT, run);
      } else if (mode === 'map' && world) {
        world.playerRudder = input.rudder();
        world.step(SIM_DT, run);
      }
    }

    if (mode === 'battle') handleBattleOutcome();

    if (mode === 'map' && world && world.pendingEncounter) {
      currentEnc = world.pendingEncounter;
      world.pendingEncounter = null;
      startBattle({
        ships: currentEnc.ships,
        desc: currentEnc.desc,
        faction: currentEnc.faction,
        plate: currentEnc.plate,
        story: currentEnc.story,
        ghost: currentEnc.ghost,
        names: currentEnc.names,
      });
    }
  }

  // drain sim events → feed, audio, effects
  const queues = [];
  if (battle) queues.push(battle.events);
  if (world && (mode === 'map' || mode === 'port' || mode === 'aftermath')) queues.push(world.events);
  for (const q of queues) {
    for (const e of q.drain()) {
      switch (e.kind) {
        case 'feed':
          hud.feed(e.msg);
          chronicle(run, e.msg); // persist into the Captain's Log
          break;
        case 'boom':
          boom(e.vol, e.len, e.freq);
          break;
        case 'muzzle':
          effects.smoke(e.x, e.y, e.dir);
          break;
        case 'impact':
          effects.impact(e.x, e.y);
          woodHit(0.4);
          break;
        case 'splash':
          effects.splash(e.x, e.y);
          splash(0.26);
          break;
        case 'wake':
          effects.wake(e.x, e.y);
          break;
        case 'boardWindow':
          boardTick(e.station); // the pitched percussion cue
          break;
        case 'boardFoul':
          boardFoul();
          break;
        case 'boardFx':
          if (battle && battle.board) {
            const me = battle.P();
            const off = e.fx === 'parted' || e.fx === 'slip' ? 18 : 0;
            if (e.fx === 'swivel' || e.fx === 'pistols' || e.fx === 'parted')
              effects.smoke(me.x + off, me.y, me.heading + Math.PI / 2);
          }
          break;
        default:
          break;
      }
    }
  }

  // palette follows where the flagship actually is, battle or chart
  shell.setMood(world ? world.inMist() : false, dtReal);

  // render
  if (mode === 'battle' && battle) {
    const p = battle.P();
    shell.setFocus(battle.phase === 'board'); // lean in over the grapple
    shell.follow(p.x, p.y, dtReal);
    shell.updateEnvironment(simTime, battle.wind.dir, paused);
    for (const sv of shipViews) sv.update(sv.ship === p, simTime);
    effects.syncBalls(battle.balls, simTime);
    effects.update(paused ? 0 : dtReal);
    hud.sync(battle, paused);
    hud.syncBoarding(battle.phase === 'board' ? battle.board : null);
    hud.syncOffscreen(
      shell.camera,
      battle.living('e').map((e) => ({ x: e.x, y: e.y, color: 'rgba(196,88,58,.85)' })),
    );
    if (!paused) hud.updateFeed(dtReal);
  } else if ((mode === 'map' || mode === 'port' || mode === 'aftermath') && world) {
    const p = world.player;
    shell.setFocus(false);
    shell.follow(p.x, p.y, dtReal);
    shell.updateEnvironment(simTime, world.wind.dir, paused || mode !== 'map');
    playerMapView?.update(true, simTime);
    worldView?.update(world, run, simTime);
    effects.update(paused || mode !== 'map' ? 0 : dtReal);
    if (mode === 'map') {
      world.materializeShipwrecks(run); // log-marked wrecks become floating crates
      hud.syncMap(world, run);
      const targets: { x: number; y: number; color: string }[] = [];
      const obj = currentObjective(run);
      if (obj) {
        const m = objectivePos(obj);
        targets.push({ x: m.x, y: m.y, color: 'rgba(217,164,65,.9)' });
      }
      hud.syncOffscreen(shell.camera, targets);
      minimap?.sync(world, run, simTime);
      if (mapOpen) bigmap?.draw(world, run, simTime);
      if (!paused) hud.updateFeed(dtReal);
    }
  }
  shell.render();
  requestAnimationFrame(frame);
}

// Preload kit models, dress the set, then raise the curtain.
(async () => {
  await lib.preload([...SHIP_MODEL_NAMES, ...PROP_MODEL_NAMES]);
  worldView = new WorldView(shell.scene, lib);
  minimap = new Minimap();
  bigmap = new BigMap();
  startRun();
  requestAnimationFrame(frame);
})().catch((err) => {
  console.error('BROADSIDE failed to start:', err);
  $('otitle').textContent = 'RIGGING FAILURE';
  $('otext').textContent = 'The game could not load its assets: ' + String(err);
  $('overlay').style.display = 'flex';
});

/* ============ debug handle (used by automated verification) ============ */

declare global {
  interface Window {
    __broadside?: unknown;
  }
}
window.__broadside = {
  get battle() {
    return battle;
  },
  get world() {
    return world;
  },
  get run() {
    return run;
  },
  get mode() {
    return mode;
  },
  set mode(m: Mode) {
    mode = m;
  },
  stepMany(n: number) {
    if (!battle || mode !== 'battle') return;
    for (let i = 0; i < n && !battle.outcome; i++) battle.step(SIM_DT, run);
  },
  stepMap(n: number) {
    if (!world || mode !== 'map') return;
    for (let i = 0; i < n; i++) {
      world.step(SIM_DT, run);
      if (world.pendingEncounter) break;
    }
  },
  freeze(v: boolean) {
    freeze = v;
  },
  startRun,
  enterMap,
  handleBattleOutcome,
  get frames() {
    return frameCount;
  },
};
