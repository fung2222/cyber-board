// SynthAudio - every sound is synthesised live with the Web Audio API (no audio files -> tiny, offline).
// Subclass it for game-specific SFX:  class FuseAudio extends SynthAudio { merge(v){ this.osc({...}) } }
export const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/** Music presets for the built-in step sequencer. */
export const MUSIC = {
  // driving synthwave (cyber-snake)
  drive: { bpm: 100, bpmPerLevel: 4, bpmMax: 132, roots: [45, 41, 48, 43], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], kick: 'four', hats: true, bass: 'eighths', arp: true, pad: 0.022, gain: 0.42 },
  // relaxed lo-fi synth for puzzle / zen games
  chill: { bpm: 84, bpmPerLevel: 0, bpmMax: 84, roots: [45, 41, 36, 43], chords: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 11], [0, 4, 7, 10]], kick: 'half', hats: 'soft', bass: 'roots', arp: 'sparse', pad: 0.03, gain: 0.34 },
};

export class SynthAudio {
  /**
   * @param {object} [o]
   * @param {object} [o.store]  createStore() instance; mute state persisted as cyber.<game>.muted
   * @param {object|string} [o.music='drive']  preset name or preset object
   */
  constructor(o = {}) {
    this.store = o.store || null;
    this.muted = this.store ? this.store.getBool('muted', false) : false;
    this.ctx = null; this.musicPlaying = false; this.level = 1; this.volume = o.volume ?? 0.85;
    this.preset = typeof o.music === 'object' ? o.music : (MUSIC[o.music || 'drive'] || MUSIC.drive);
    this._hiddenSuspended = false;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) { this.ctx.suspend(); this._hiddenSuspended = true; }
        else if (this._hiddenSuspended) { this.ctx.resume(); this._hiddenSuspended = false; }
      });
    }
  }

  /** Must be called from a user gesture (tap / key). Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // never create the context before a real user gesture (avoids autoplay warnings in demo / attract mode)
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.0; this.music.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.musicFilter.connect(this.music);
    this.delay = ctx.createDelay(1.0); this.delay.delayTime.value = 0.21;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
    this.delayOut = ctx.createGain(); this.delayOut.gain.value = 0.5; dlp.connect(this.delayOut); this.delayOut.connect(this.master);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 1; this.delaySend.connect(this.delay);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.distCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; this.distCurve[i] = Math.tanh(x * 4); }
  }
  get ready() { return !!this.ctx; }

  setMuted(m) {
    this.muted = !!m;
    if (this.store) this.store.setBool('muted', this.muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  /** temporarily silence everything (e.g. while a full-screen ad shows) without changing the saved mute setting */
  duckAll(on) { if (this.ctx) this.master.gain.setTargetAtTime(on || this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05); }

  // ---------- primitives ----------
  osc({ type = 'sine', f = 440, f2 = null, t = 0, dur = 0.1, vol = 0.2, a = 0.005, out = null, send = 0, detune = 0, q = null, lp = null }) {
    const ctx = this.ctx; if (!ctx) return null;
    const now = ctx.currentTime + Math.max(0, t);
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, now); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + a); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = o;
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; if (q) fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g); g.connect(out || this.sfx);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.delaySend); }
    o.start(now); o.stop(now + dur + 0.05);
    return o;
  }
  noiseHit({ t = 0, dur = 0.1, vol = 0.2, type = 'highpass', f = 6000, f2 = null, q = 0.7, out = null, a = 0.002 }) {
    const ctx = this.ctx; if (!ctx) return;
    const now = ctx.currentTime + Math.max(0, t);
    const s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + a); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(fl); fl.connect(g); g.connect(out || this.sfx);
    s.start(now, Math.random() * 1.5); s.stop(now + dur + 0.05);
  }

  // ---------- common UI / game SFX ----------
  click() { this.osc({ type: 'square', f: 1200, f2: 1800, dur: 0.05, vol: 0.06, lp: 5000 }); }
  confirm() { this.osc({ type: 'square', f: mtof(76), dur: 0.06, vol: 0.07, lp: 4000, send: 0.2 }); this.osc({ type: 'square', f: mtof(83), t: 0.06, dur: 0.1, vol: 0.07, lp: 4500, send: 0.3 }); }
  back() { this.osc({ type: 'triangle', f: 900, f2: 500, dur: 0.08, vol: 0.06 }); }
  denied() { this.osc({ type: 'square', f: 140, f2: 90, dur: 0.12, vol: 0.08, lp: 900 }); this.noiseHit({ dur: 0.05, vol: 0.03, f: 3000 }); }
  tick() { this.osc({ type: 'triangle', f: 2100, f2: 1500, dur: 0.03, vol: 0.035 }); this.noiseHit({ dur: 0.025, vol: 0.03, f: 7000 }); }
  whoosh(vol = 0.05) { this.noiseHit({ dur: 0.16, vol, type: 'bandpass', f: 900, f2: 3800, q: 1.2, a: 0.03 }); }
  /** rising arpeggio + chord swell. root = midi note */
  levelUp(root = 57 + ((this.level - 1) % 4) * 2) {
    if (!this.ctx) return;
    [0, 4, 7, 12, 16, 19, 24, 28].forEach((n, i) => {
      this.osc({ type: 'sawtooth', f: mtof(root + n), t: i * 0.065, dur: 0.28, vol: 0.09, lp: 2400 + i * 500, q: 6, send: 0.45 });
      this.osc({ type: 'square', f: mtof(root + n + 12), t: i * 0.065, dur: 0.12, vol: 0.04, lp: 6000, send: 0.3 });
    });
    [0, 7, 12, 16].forEach(n => this.osc({ type: 'sawtooth', f: mtof(root + n), t: 0.52, dur: 1.2, vol: 0.06, a: 0.05, lp: 3000, detune: (Math.random() - .5) * 14, send: 0.35 }));
    this.noiseHit({ t: 0, dur: 0.7, vol: 0.08, type: 'bandpass', f: 500, f2: 9000, q: 1.5, a: 0.4 });
    this.osc({ type: 'sine', f: 55, f2: 40, t: 0.52, dur: 0.6, vol: 0.4 });
  }
  /** distorted crash for game over */
  fail() {
    const ctx = this.ctx; if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now); o.frequency.exponentialRampToValueAtTime(28, now + 0.9);
    const ws = ctx.createWaveShaper(); ws.curve = this.distCurve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2000, now); lp.frequency.exponentialRampToValueAtTime(80, now + 1.0);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    o.connect(ws); ws.connect(lp); lp.connect(g); g.connect(this.sfx); o.start(now); o.stop(now + 1.2);
    this.noiseHit({ dur: 1.1, vol: 0.35, type: 'lowpass', f: 6000, f2: 120, q: 1, a: 0.003 });
    this.osc({ type: 'sine', f: 120, f2: 30, dur: 0.5, vol: 0.5 });
    for (let i = 0; i < 7; i++) this.osc({ type: 'square', f: 200 + Math.random() * 1800, t: 0.05 + i * 0.045, dur: 0.035, vol: 0.05, send: 0.2 });
    this.duckMusic();
  }
  /** soft bell chime; n = scale degree (0..), higher = brighter */
  chime(n = 0, vol = 0.1) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];
    const m = 72 + scale[Math.max(0, Math.min(scale.length - 1, n))];
    this.osc({ type: 'sine', f: mtof(m), dur: 0.6, vol, a: 0.004, send: 0.45 });
    this.osc({ type: 'sine', f: mtof(m + 12), dur: 0.3, vol: vol * 0.35, a: 0.004, send: 0.3 });
    this.osc({ type: 'triangle', f: mtof(m + 19), dur: 0.15, vol: vol * 0.2, send: 0.2 });
  }

  // ---------- step-sequenced music ----------
  setLevel(l) { this.level = l; }
  duckMusic() { if (!this.ctx) return; const t = this.ctx.currentTime; this.musicFilter.frequency.cancelScheduledValues(t); this.musicFilter.frequency.setTargetAtTime(300, t, 0.15); }
  unduckMusic() { if (!this.ctx) return; const t = this.ctx.currentTime; this.musicFilter.frequency.cancelScheduledValues(t); this.musicFilter.frequency.setTargetAtTime(18000, t, 0.2); }
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(this.preset.gain, t, 0.4);
    this.unduckMusic();
    this.step = 0; this.nextTime = t + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic(fade = 0.5) {
    if (!this.ctx || !this.musicPlaying) return;
    this.musicPlaying = false; clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t); this.music.gain.setTargetAtTime(0, t, fade / 3);
  }
  schedule() {
    const ctx = this.ctx, P = this.preset;
    if (ctx.state !== 'running') { this.nextTime = ctx.currentTime + 0.05; return; }
    const bpm = Math.min(P.bpm + (this.level - 1) * P.bpmPerLevel, P.bpmMax);
    const s16 = 60 / bpm / 4;
    this.delay.delayTime.setTargetAtTime(s16 * 3, ctx.currentTime, 0.1);
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextTime, s16);
      this.nextTime += s16; this.step = (this.step + 1) % 64;
    }
  }
  /** override for custom music; default implements MUSIC presets */
  playStep(step, time, s16) {
    const ctx = this.ctx, out = this.musicFilter, P = this.preset;
    const t = time - ctx.currentTime; if (t < -0.01) return;
    const bar = Math.floor(step / 16) % 4, s = step % 16;
    const root = P.roots[bar], chord = P.chords[bar], lvl = this.level;
    const kickOn = P.kick === 'four' ? s % 4 === 0 : (s === 0 || s === 10);
    if (kickOn) { this.osc({ type: 'sine', f: 150, f2: 42, t, dur: 0.28, vol: P.kick === 'four' ? 0.55 : 0.4, out }); this.osc({ type: 'triangle', f: 900, f2: 120, t, dur: 0.02, vol: 0.1, out }); }
    if (s === 4 || s === 12) {
      if (P.kick === 'four') { this.noiseHit({ t, dur: 0.18, vol: 0.2, type: 'bandpass', f: 1900, q: 0.9, out }); this.osc({ type: 'triangle', f: 230, f2: 160, t, dur: 0.09, vol: 0.12, out }); }
      else if (s === 12 || s === 4) this.noiseHit({ t, dur: 0.22, vol: 0.09, type: 'bandpass', f: 1500, q: 0.7, out, a: 0.01 });
    }
    if (P.hats === true) {
      if (s % 2 === 0) this.noiseHit({ t, dur: s % 4 === 2 ? 0.07 : 0.025, vol: s % 4 === 2 ? 0.07 : 0.03, f: 8500, out });
      else if (lvl >= 3) this.noiseHit({ t, dur: 0.02, vol: 0.02, f: 9500, out });
    } else if (P.hats === 'soft' && s % 4 === 2) this.noiseHit({ t, dur: 0.05, vol: 0.025, f: 9000, out });
    if (P.bass === 'eighths' && s % 2 === 0) {
      const oct = (s % 8 === 6) ? 12 : 0;
      this.osc({ type: 'sawtooth', f: mtof(root - 12 + oct), t, dur: s16 * 1.8, vol: 0.16, lp: 520 + (s % 4 === 0 ? 300 : 0), q: 5, a: 0.004, out });
    } else if (P.bass === 'roots' && (s === 0 || s === 8 || s === 14)) {
      this.osc({ type: 'triangle', f: mtof(root - 12), t, dur: s16 * (s === 14 ? 2 : 6), vol: 0.22, a: 0.01, out });
    }
    if (s === 0) chord.forEach(iv => { for (const det of [-9, 9]) this.osc({ type: 'sawtooth', f: mtof(root + 12 + iv), t, dur: s16 * 16, vol: P.pad, a: 0.35, lp: 1100, detune: det, out }); });
    const arpPattern = [0, 1, 2, 1, 0, 2, 1, 2];
    if (P.arp === true) {
      const iv = chord[arpPattern[s % 8]] + (s >= 8 ? 12 : 0);
      this.osc({ type: 'square', f: mtof(root + 24 + iv), t, dur: s16 * 0.9, vol: lvl >= 2 ? 0.045 : 0.025, lp: 2200 + Math.sin(step / 10) * 900, q: 4, out, send: 0.25 });
    } else if (P.arp === 'sparse' && (s % 3 === 0)) {
      const iv = chord[(s / 3 + bar) % chord.length] + 12;
      this.osc({ type: 'sine', f: mtof(root + 24 + iv), t, dur: s16 * 2.5, vol: 0.035, a: 0.01, out, send: 0.5 });
    }
  }
}
