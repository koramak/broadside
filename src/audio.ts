// Procedural audio: the prototype's boom() synth plus a quiet sea-wash bed.

let AC: AudioContext | null = null;
let ambientOn = false;

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
