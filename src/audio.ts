// Procedural audio: the prototype's boom() synth plus a quiet sea-wash bed,
// and a small tavern-band music player (CC-BY tracks, see ASSETS.md).

let AC: AudioContext | null = null;
let ambientOn = false;

const TRACKS = [
  'assets/music/folk-round.mp3',
  'assets/music/master-of-the-feast.mp3',
];
let musicEl: HTMLAudioElement | null = null;
let musicIdx = 0;
let musicWanted = true;

/** MUSIC dial in the pause menu. */
export function setMusic(on: boolean): void {
  musicWanted = on;
  if (!on && musicEl) musicEl.pause();
  if (on && musicEl) void musicEl.play().catch(() => {});
  if (on && !musicEl) startMusic();
}

function startMusic(): void {
  if (musicEl || !musicWanted) return;
  musicEl = new Audio();
  musicEl.volume = 0.22;
  musicEl.src = TRACKS[musicIdx];
  musicEl.addEventListener('ended', () => {
    musicIdx = (musicIdx + 1) % TRACKS.length;
    if (musicEl && musicWanted) {
      musicEl.src = TRACKS[musicIdx];
      void musicEl.play().catch(() => {});
    }
  });
  void musicEl.play().catch(() => {
    // autoplay refused — the next user gesture will retry via audio()
    musicEl = null;
  });
}

export function audio(): void {
  if (!AC) {
    try {
      AC = new AudioContext();
    } catch {
      /* no audio — fine */
    }
  }
  if (AC && AC.state === 'suspended') void AC.resume();
  if (AC && !ambientOn) {
    ambientOn = true;
    startAmbient(AC);
  }
  startMusic();
}

/** Endless filtered-noise wash with a slow swell — the model sea, humming. */
function startAmbient(ac: AudioContext): void {
  const len = 4;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    // cheap pink-ish noise: integrate white, leak to stay bounded
    last = last * 0.97 + (Math.random() * 2 - 1) * 0.04;
    d[i] = last;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 420;
  const g = ac.createGain();
  g.gain.value = 0.05;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.09;
  const lfoG = ac.createGain();
  lfoG.gain.value = 0.022;
  lfo.connect(lfoG);
  lfoG.connect(g.gain);
  src.connect(f);
  f.connect(g);
  g.connect(ac.destination);
  src.start();
  lfo.start();
}

// Distinct percussion pitch per station, so a practiced captain can run the
// deck partly by ear. Tuned to a rough pentatonic so overlapping ticks chime
// rather than clash. (THE most important boarding juice item.)
const STATION_PITCH: Record<string, number> = {
  swivel: 196, swivel2: 233, pistols: 294,
  line0: 392, line1: 440, line2: 523,
  surgeon: 330, reserve: 147, helm: 175,
};

/** A station's gold window just opened — pitched wooden tick. */
export function boardTick(stationId: string): void {
  if (!AC) return;
  const t = AC.currentTime;
  const freq = STATION_PITCH[stationId] ?? 300;
  const osc = AC.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq * 2, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  // a touch of click body
  const click = AC.createBufferSource();
  const b = AC.createBuffer(1, AC.sampleRate * 0.03, AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  click.buffer = b;
  const cg = AC.createGain();
  cg.gain.value = 0.06;
  osc.connect(g);
  g.connect(AC.destination);
  click.connect(cg);
  cg.connect(AC.destination);
  osc.start(t);
  osc.stop(t + 0.24);
  click.start(t);
}

/** A station fouled — dry rattle. */
export function boardFoul(): void {
  if (!AC) return;
  const b = AC.createBuffer(1, AC.sampleRate * 0.14, AC.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = Math.pow(1 - i / d.length, 1.6);
    d[i] = (Math.random() * 2 - 1) * env * (Math.sin(i * 0.5) > 0 ? 1 : 0.3);
  }
  const src = AC.createBufferSource();
  src.buffer = b;
  const f = AC.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 240;
  const g = AC.createGain();
  g.gain.value = 0.22;
  src.connect(f);
  f.connect(g);
  g.connect(AC.destination);
  src.start();
}

export function boom(vol = 0.5, len = 0.35, freq = 300): void {
  if (!AC) return;
  const t = AC.currentTime;
  const buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
  const src = AC.createBufferSource();
  src.buffer = buf;
  const f = AC.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = AC.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f);
  f.connect(g);
  g.connect(AC.destination);
  src.start();
}
