// Procedural audio, ported from the prototype's boom() synth.

let AC: AudioContext | null = null;

export function audio(): void {
  if (!AC) {
    try {
      AC = new AudioContext();
    } catch {
      /* no audio — fine */
    }
  }
  if (AC && AC.state === 'suspended') void AC.resume();
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
