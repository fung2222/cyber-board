// CYBER BOARD sounds — all synthesised live (cyber-kit SynthAudio + 'chill' music). Layered impacts:
// transient (noise click) + body (pitched thump) + tail (filtered noise / delay send), all fired on the contact frame.
import { SynthAudio, mtof } from 'cyber-kit/audio/synth.js';
export class BoardAudio extends SynthAudio {
  constructor(store) { super({ store, music: 'chill' }); this.musicOn = store.getBool('music', true); }
  startMusic() { if (this.musicOn) super.startMusic(); }
  setMusic(on) { this.musicOn = on; if (on) super.startMusic(); else this.stopMusic(); }
  select() { this.osc({ type: 'triangle', f: 880, f2: 1320, dur: 0.06, vol: 0.05 }); }
  place() { this.osc({ type: 'sine', f: 260, f2: 120, dur: 0.12, vol: 0.18 }); this.noiseHit({ dur: 0.05, vol: 0.06, type: 'bandpass', f: 2400, q: 2 }); }
  move() { this.noiseHit({ dur: 0.12, vol: 0.04, type: 'bandpass', f: 700, f2: 2400, q: 1.5, a: 0.03 }); this.osc({ type: 'sine', f: 330, f2: 220, t: 0.1, dur: 0.1, vol: 0.12 }); }
  riser(dur = 0.4, big = false) { this.osc({ type: 'sawtooth', f: big ? 70 : 110, f2: big ? 420 : 660, dur, vol: 0.05, lp: 1800, a: dur * 0.8, send: 0.3 }); this.noiseHit({ dur, vol: 0.05, type: 'bandpass', f: 400, f2: 5000, q: 2, a: dur * 0.9 }); }
  dash() { this.noiseHit({ dur: 0.18, vol: 0.1, type: 'bandpass', f: 600, f2: 5200, q: 1.1, a: 0.02 }); }
  slash(pitch = 0) { this.noiseHit({ dur: 0.14, vol: 0.12, type: 'highpass', f: 2500 + pitch * 400, f2: 7000, a: 0.004 }); this.osc({ type: 'triangle', f: 1900 + pitch * 220, f2: 2600, dur: 0.12, vol: 0.05, send: 0.25 }); }
  hit(s = 0.5) { this.noiseHit({ dur: 0.05 + s * 0.12, vol: 0.12 + s * 0.12, type: 'lowpass', f: 4200, f2: 300, a: 0.001 }); this.osc({ type: 'sine', f: 190 - s * 60, f2: 45, dur: 0.12 + s * 0.2, vol: 0.2 + s * 0.2 }); this.osc({ type: 'square', f: 90, f2: 40, dur: 0.06, vol: 0.05 * s, lp: 600 }); }
  finisher() { this.osc({ type: 'sine', f: 110, f2: 28, dur: 0.8, vol: 0.45 }); this.noiseHit({ dur: 0.6, vol: 0.22, type: 'lowpass', f: 5200, f2: 120, a: 0.001 }); this.osc({ type: 'sawtooth', f: 220, f2: 55, dur: 0.35, vol: 0.06, lp: 1500 }); }
  shatter() { for (let i = 0; i < 7; i++) this.osc({ type: 'triangle', f: 2200 + Math.random() * 3200, t: 0.03 + i * 0.035 + Math.random() * 0.02, dur: 0.18, vol: 0.035, send: 0.4 }); this.noiseHit({ t: 0.02, dur: 0.45, vol: 0.09, type: 'highpass', f: 4000, f2: 9000 }); }
  beam() { this.osc({ type: 'sawtooth', f: 1400, f2: 180, dur: 0.32, vol: 0.07, lp: 4000, send: 0.3 }); this.osc({ type: 'square', f: 2800, f2: 400, dur: 0.18, vol: 0.03, lp: 6000 }); }
  charge(dur = 0.3) { this.osc({ type: 'sine', f: 300, f2: 1800, dur, vol: 0.06, a: dur * 0.7 }); }
  launch() { this.osc({ type: 'square', f: 600, f2: 90, dur: 0.25, vol: 0.08, lp: 2200 }); this.noiseHit({ dur: 0.3, vol: 0.12, type: 'lowpass', f: 1500, f2: 200 }); }
  boom() { this.osc({ type: 'sine', f: 80, f2: 25, dur: 1, vol: 0.5 }); this.noiseHit({ dur: 0.9, vol: 0.25, type: 'lowpass', f: 2500, f2: 80, a: 0.002 }); }
  stomp() { this.osc({ type: 'sine', f: 140, f2: 32, dur: 0.5, vol: 0.45 }); this.noiseHit({ dur: 0.35, vol: 0.18, type: 'lowpass', f: 900, f2: 60 }); }
  zap(i = 0) { this.noiseHit({ dur: 0.07, vol: 0.07, type: 'highpass', f: 3000 + i * 300, f2: 9000 }); this.osc({ type: 'square', f: mtof(76 + (i % 12) * 1), dur: 0.07, vol: 0.035, lp: 5000, send: 0.2 }); }
  flipTick(i = 0) { const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; this.osc({ type: 'triangle', f: mtof(72 + scale[Math.min(i, scale.length - 1)]), dur: 0.12, vol: 0.06, send: 0.35 }); }
  corner() { [0, 7, 12, 16, 19].forEach((n, i) => this.osc({ type: 'sawtooth', f: mtof(48 + n), t: i * 0.03, dur: 0.9, vol: 0.06, lp: 2600, send: 0.4 })); this.osc({ type: 'sine', f: 70, f2: 30, dur: 0.9, vol: 0.45 }); this.noiseHit({ dur: 0.8, vol: 0.12, type: 'bandpass', f: 300, f2: 6000, q: 1 }); }
  dice(n = 6) { for (let i = 0; i < n; i++) this.noiseHit({ t: i * 0.09 + Math.random() * 0.03, dur: 0.03, vol: 0.06, type: 'bandpass', f: 1800 + Math.random() * 1500, q: 3 }); }
  diceLand(six = false) { this.osc({ type: 'sine', f: 200, f2: 90, dur: 0.15, vol: 0.2 }); if (six) [0, 4, 7, 12].forEach((n, i) => this.osc({ type: 'square', f: mtof(76 + n), t: 0.05 + i * 0.06, dur: 0.14, vol: 0.05, lp: 5000, send: 0.4 })); }
  engine() { this.noiseHit({ dur: 0.5, vol: 0.06, type: 'bandpass', f: 300, f2: 1800, q: 2, a: 0.15 }); this.osc({ type: 'sawtooth', f: 90, f2: 160, dur: 0.5, vol: 0.04, lp: 800 }); }
  laser() { this.osc({ type: 'square', f: 2400, f2: 300, dur: 0.12, vol: 0.06, lp: 6000, send: 0.2 }); }
  boost() { this.osc({ type: 'sawtooth', f: 300, f2: 1200, dur: 0.25, vol: 0.06, lp: 3000, send: 0.3 }); }
  home() { [0, 4, 7, 12, 16].forEach((n, i) => this.osc({ type: 'triangle', f: mtof(72 + n), t: i * 0.06, dur: 0.3, vol: 0.06, send: 0.4 })); }
  check() { for (let i = 0; i < 2; i++) this.osc({ type: 'square', f: 880, f2: 660, t: i * 0.16, dur: 0.12, vol: 0.06, lp: 3000 }); }
  mate() { this.osc({ type: 'sawtooth', f: 55, f2: 40, dur: 1.6, vol: 0.12, lp: 900 }); [0, 3, 7, 10].forEach((n, i) => this.osc({ type: 'sawtooth', f: mtof(45 + n), t: 0.1 + i * 0.12, dur: 1.4, vol: 0.05, lp: 1800, send: 0.5 })); this.noiseHit({ dur: 1.2, vol: 0.12, type: 'lowpass', f: 3000, f2: 100 }); }
  win() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.osc({ type: 'square', f: mtof(64 + n), t: i * 0.08, dur: 0.3, vol: 0.05, lp: 4200, send: 0.4 })); }
  lose() { [0, -3, -5, -8, -12].forEach((n, i) => this.osc({ type: 'sawtooth', f: mtof(60 + n), t: i * 0.15, dur: 0.35, vol: 0.05, lp: 1400 })); }
  emote() { this.osc({ type: 'sine', f: 660, f2: 990, dur: 0.1, vol: 0.06 }); this.osc({ type: 'sine', f: 990, f2: 1320, t: 0.08, dur: 0.1, vol: 0.05 }); }
}
