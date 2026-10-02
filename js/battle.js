// CAPTURE BATTLES — short cinematic mini-fights when a piece captures another.
// Beat structure (game-feel research: anticipation → contact → hit-stop → follow-through):
//   0.00  camera swoops in, letterbox + name card, attacker squashes & charges (anticipation, riser SFX)
//   0.38  dash with stretch + trail (whoosh)
//   ~0.6  type-specific move; every contact frame fires flash + sparks + shake + SFX + hit-stop together
//   fin   finisher: long hit-stop, white flash, victim shatters into neon shards, slow-mo, board ripple
//   end   follow-through: attacker lands on the square with a bounce, camera returns (≈1.8–2.3 s total)
// Modes: 'full' (cinematic), 'quick' (≈0.6 s strike, no camera move), 'off' (handled by caller). Tap = skip.
import * as THREE from 'three';
import { easeOut, easeIn, easeInOut, backOut, clamp01 } from './holo.js';

/** move catalogue per game/piece type: [zh, en, script] */
export const MOVES = {
  chess: { 1: ['旋風刃', 'SPIN BLADE', 'spin'], 2: ['流星踏', 'METEOR STOMP', 'stomp'], 3: ['稜光貫', 'PRISM LANCE', 'lance'], 4: ['攻城衝', 'SIEGE RAM', 'ram'], 5: ['霓虹風暴', 'NEON TEMPEST', 'tempest'], 6: ['王者震', 'ROYAL QUAKE', 'quake'] },
  xiangqi: { 1: ['帥令震', 'COMMAND SLAM', 'quake'], 2: ['雙針刺', 'TWIN NEEDLES', 'needles'], 3: ['象踏', 'TUSK TRAMPLE', 'trample'], 4: ['躍馬踏', 'LEAPING STOMP', 'stomp'], 5: ['鐵騎衝', 'CHARIOT RAM', 'ram'], 6: ['電漿砲', 'PLASMA MORTAR', 'mortar'], 7: ['旋風刃', 'SPIN BLADE', 'spin'] },
  sky: { 0: ['空戰', 'DOGFIGHT', 'dogfight'] },
};

class TL {
  constructor() { this.spans = []; this.events = []; }
  span(t0, t1, fn) { this.spans.push({ t0, t1, fn, ended: false }); return this; }
  at(t, fn) { this.events.push({ t, fn, done: false }); return this; }
  run(bt) {
    for (const s of this.spans) { if (s.ended || bt < s.t0) continue; s.fn(clamp01((bt - s.t0) / Math.max(1e-4, s.t1 - s.t0))); if (bt >= s.t1) s.ended = true; }
    for (const e of this.events) if (!e.done && bt >= e.t) { e.done = true; e.fn(); }
  }
}
const UP = new THREE.Vector3(0, 1, 0);

export class BattleDirector {
  /** ctx: { scene, fx3d, particles, waves, fx (FxState), audio, ui, board, haptic(kind), lang() } */
  constructor(ctx) { this.c = ctx; this.active = null; this.camW = 0; this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.fovDelta = 0; this.frozen = false; this.timeScale = 1; }
  get busy() { return !!this.active; }
  /**
   * @param {{game, attacker, victim, from: THREE.Vector3, to: THREE.Vector3, aType, vType, aColor, vColor, mode, aName:[zh,en], vName:[zh,en], cam: THREE.Camera}} o
   * @returns {Promise<void>}
   */
  play(o) {
    if (this.active) this.finish(true);
    return new Promise((resolve) => {
      const game = o.game, mv = (MOVES[game] && (MOVES[game][o.aType] || MOVES[game][0])) || MOVES.chess[1];
      const B = { o, resolve, bt: 0, hitstop: 0, slow: 0, tl: new TL(), dur: 2, mode: o.mode, combo: 0, move: mv, victimShake: 0, done: false };
      this.active = B;
      const A = o.attacker, V = o.victim;
      A.cinematic = true; V.cinematic = true;
      B.P0 = o.from.clone(); B.PV = o.to.clone(); B.portrait = o.cam.aspect < 0.9;
      B.dir = B.PV.clone().sub(B.P0).setY(0); if (B.dir.lengthSq() < 1e-6) B.dir.set(0, 0, -1); B.dir.normalize();
      // side vector pointing roughly toward the camera so the action reads from the swoop angle
      B.side = new THREE.Vector3(B.dir.z, 0, -B.dir.x);
      const camFlat = o.cam.position.clone().sub(B.PV).setY(0).normalize();
      if (B.side.dot(camFlat) < 0) B.side.negate();
      B.aYaw0 = A.body.rotation.y;
      A.root.position.copy(B.P0); A.body.position.set(0, 0, 0); A.body.rotation.set(0, 0, 0); A.body.scale.set(1, 1, 1);
      V.body.position.set(0, 0, 0); V.body.rotation.set(0, 0, 0);
      if (B.mode === 'quick') this.buildQuick(B); else this.buildFull(B, mv[2]);
      if (B.mode !== 'quick') this.card(true, o, mv);
    });
  }
  /** skip to the end (tap) */
  skip() { if (this.active && !this.active.done && this.active.bt > 0.05) this.finish(true); }

  // ---------------------------------------------------------------- shared beats
  hit(B, pos, s = 0.5, label = null) {
    const c = this.c, V = B.o.victim;
    B.combo++; V.flash(1); B.victimShake = 0.08 + s * 0.12;
    c.particles.burst(pos, B.o.aColor, 14 + Math.round(s * 22), { speed: 3 + s * 4, up: 1.4, life: 0.4, size: 0.5 + s * 0.35, bright: 2.2, color2: new THREE.Color(1, 1, 1) });
    c.fx3d.flashLight(pos, B.o.aColor, 0.6 + s);
    c.fx.kick({ trauma: 0.12 + s * 0.25, aberr: 0.3 + s * 0.5, fovKick: s * 0.3 });
    c.audio.hit(s); c.haptic(s > 0.6 ? 'medium' : 'light');
    B.hitstop = Math.max(B.hitstop, 0.045 + s * 0.05);
    if (B.mode !== 'quick') c.popup(pos, label || (B.combo > 1 ? `${B.combo} HIT` : 'HIT'), B.combo > 2 ? 'combo' : '');
  }
  finisher(B, pos, s = 1, color2 = null) {
    const c = this.c, V = B.o.victim;
    const full = B.mode !== 'quick';
    V.flash(1.5);
    c.fx3d.shatter(V.root.position.clone().add(new THREE.Vector3(0, 0.05, 0)), B.o.vColor, { count: full ? 70 : 40, height: Math.max(0.25, V.height || 0.6), color2: color2 || B.o.aColor, dir: B.dir, speed: full ? 4.8 : 3.6 });
    V.root.visible = false;
    c.particles.burst(pos, B.o.aColor, full ? 64 : 34, { speed: 7 * s, up: 3, life: 0.7, size: 0.8, bright: 2.2, color2: new THREE.Color(B.o.vColor) });
    c.waves.spawn(new THREE.Vector3(pos.x, 0.03, pos.z), new THREE.Color(B.o.aColor), { r0: 0.2, r1: full ? 3.4 : 2, h: 0.5, dur: 0.55 });
    c.board.ripple(pos.x, pos.z, full ? 1.8 : 1);
    c.fx3d.flashLight(pos, 0xffffff, 2);
    c.fx.kick({ trauma: full ? 0.5 * s : 0.25, aberr: full ? 1.1 : 0.5, glitch: full ? 0.35 : 0.1, fovKick: full ? 0.6 : 0.2 });
    c.audio.finisher(); c.audio.shatter(); c.haptic('heavy');
    c.ui.flash('rgba(255,255,255,0.32)', full ? 200 : 100);
    B.hitstop = Math.max(B.hitstop, full ? 0.16 : 0.08);
    if (full) { B.slow = 0.42; c.popup(pos, B.combo >= 3 ? `${B.combo + 1} HIT COMBO!` : 'K.O.!', 'big'); }
    B.finished = true;
  }
  /** attacker glides to the captured square with a landing bounce */
  land(B, t0, t1) {
    const A = B.o.attacker; let from = null;
    B.tl.span(t0, t1, (k) => {
      if (!from) from = A.root.position.clone();
      const e = easeInOut(k);
      A.root.position.lerpVectors(from, B.PV, e);
      A.body.position.y = Math.max(A.body.position.y * (1 - k), 0) + Math.sin(k * Math.PI) * 0.35;
      A.body.rotation.x *= 1 - k; A.body.rotation.z *= 1 - k;
      const sq = k > 0.85 ? 1 - Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.18 : 1; A.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    });
    B.tl.at(t1, () => { this.c.audio.place(); this.c.particles.ring(B.PV.clone().setY(0.05), B.o.aColor, 30, 3, 0.05); });
  }
  anticipation(B, t1 = 0.38, big = false) {
    const A = B.o.attacker, c = this.c;
    B.tl.at(0, () => { c.audio.riser(t1 + 0.1, big); });
    B.tl.span(0, t1, (k) => {
      const sq = 1 - Math.sin(k * Math.PI * 0.5) * 0.22; A.body.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
      A.flash(k * 0.6);
      if (Math.random() < 0.6) { const a = Math.random() * 6.28, p = A.root.position.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, 0.2 + Math.random() * 0.8, Math.sin(a) * 0.9)); c.particles.emit(p, A.root.position.clone().add(new THREE.Vector3(0, 0.4, 0)).sub(p).multiplyScalar(2.2), B.o.aColor, { life: 0.4, size: 0.6 }); }
    });
  }
  dash(B, t0, t1, to) {
    const A = B.o.attacker, c = this.c; let from = null;
    B.tl.at(t0, () => { c.audio.dash(); });
    B.tl.span(t0, t1, (k) => {
      if (!from) from = A.root.position.clone();
      A.root.position.lerpVectors(from, to, easeIn(k) * 0.7 + k * 0.3);
      const st = 1 + Math.sin(k * Math.PI) * 0.35; A.body.scale.set(1 / Math.sqrt(st), 1, 1 / Math.sqrt(st)); A.body.scale.y = 1 / st * 1.1;
      c.particles.emit(A.root.position.clone().add(new THREE.Vector3(0, 0.3, 0)), B.dir.clone().multiplyScalar(-2).add(new THREE.Vector3(0, 0.4, 0)), B.o.aColor, { life: 0.35, size: 0.9 });
    });
    B.tl.at(t1, () => { A.body.scale.set(1, 1, 1); });
  }

  // ---------------------------------------------------------------- full scripts
  buildFull(B, script) {
    const A = B.o.attacker, V = B.o.victim, c = this.c, tl = B.tl, PV = B.PV, dir = B.dir, side = B.side;
    const vTop = () => V.root.position.clone().add(new THREE.Vector3(0, Math.max(0.3, (V.height || 0.6) * 0.6), 0));
    const S = PV.clone().addScaledVector(dir, -0.7);
    let end = 2.0;
    switch (script) {
      case 'spin': {   // pawn / soldier: dash beside the victim, triple spinning blade, burst finisher
        const beside = B.portrait ? PV.clone().addScaledVector(dir, -0.3).addScaledVector(side, 0.6) : PV.clone().addScaledVector(dir, -0.62).addScaledVector(side, 0.12);
        this.anticipation(B); this.dash(B, 0.38, 0.56, beside);
        tl.span(0.56, 1.2, (k) => { A.body.rotation.y = easeInOut(k) * Math.PI * 6; A.body.position.y = Math.sin(k * Math.PI) * 0.28; });
        [0.66, 0.82, 0.98].forEach((t, i) => tl.at(t, () => { const ctr = A.root.position.clone().setY(0.38 + i * 0.06); c.fx3d.slash(ctr, UP, B.o.aColor, { r: 0.72, width: 0.14, dur: 0.16, arc: Math.PI * 1.7, start: Math.random() * 6 }); c.audio.slash(i); this.hit(B, vTop(), 0.35 + i * 0.1, i === 2 ? 'SLASH!' : null); }));
        tl.at(1.14, () => { const ctr = A.root.position.clone().setY(0.4); c.fx3d.slash(ctr, UP, 0xffffff, { r: 1.0, width: 0.25, dur: 0.14, arc: Math.PI * 2 }); c.waves.spawn(ctr.clone().setY(0.05), new THREE.Color(B.o.aColor), { r0: 0.2, r1: 2.6, h: 0.4, dur: 0.4 }); this.finisher(B, vTop(), 1); });
        this.land(B, 1.45, 1.8); end = 1.95; break;
      }
      case 'stomp': {  // knight / horse: big leap, flip at the apex, meteor slam
        this.anticipation(B, 0.32);
        const p0 = B.P0.clone(); const apex = PV.clone().addScaledVector(dir, -0.3).setY(2.3);
        tl.at(0.32, () => { c.audio.dash(); });
        tl.span(0.32, 0.86, (k) => { const e = easeOut(k); A.root.position.set(p0.x + (apex.x - p0.x) * e, 0, p0.z + (apex.z - p0.z) * e); A.body.position.y = Math.sin(k * Math.PI * 0.5) * 2.3; A.body.scale.set(1, 1, 1); A.body.rotation.x = 0; });
        tl.span(0.86, 1.0, (k) => { A.body.position.y = 2.3 + Math.sin(k * Math.PI) * 0.12; A.body.rotation.z = k * Math.PI * 2 * (dir.x >= 0 ? -1 : 1); A.flash(0.8); });
        tl.span(1.0, 1.1, (k) => { A.root.position.lerpVectors(apex.clone().setY(0), PV.clone().addScaledVector(dir, -0.05), k); A.body.position.y = 2.3 * (1 - easeIn(k)) + 0.1; A.body.rotation.z = 0; const st = 1 + k * 0.4; A.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st)); if (Math.random() < 0.9) c.particles.emit(A.root.position.clone().setY(A.body.position.y + 0.3), new THREE.Vector3(0, 3, 0), B.o.aColor, { life: 0.3, size: 1 }); });
        tl.at(1.1, () => { A.body.scale.set(1.35, 0.6, 1.35); c.audio.stomp(); for (let i = 0; i < 2; i++) c.waves.spawn(PV.clone().setY(0.04), new THREE.Color(i ? 0xffffff : B.o.aColor), { r0: 0.3, r1: 3.8 + i, h: 0.7, dur: 0.6 + i * 0.2 }); c.particles.ring(PV.clone().setY(0.05), B.o.aColor, 70, 6, 0.05); this.finisher(B, vTop(), 1.2); });
        tl.span(1.12, 1.5, (k) => { const sq = 0.6 + 0.4 * backOut(k); A.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); A.body.position.y = Math.sin(k * Math.PI) * 0.4; });
        this.land(B, 1.5, 1.8); end = 1.95; break;
      }
      case 'lance': {  // bishop: stand off, charge a light lance, pierce, beam explosion
        const stand = PV.clone().addScaledVector(dir, -1.15);
        this.anticipation(B); this.dash(B, 0.38, 0.54, stand);
        tl.at(0.56, () => { c.audio.charge(0.26); });
        tl.span(0.56, 0.8, (k) => { A.body.rotation.x = -k * 0.25; A.flash(k); c.particles.emit(stand.clone().addScaledVector(dir, 0.4).setY(0.55), new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2), B.o.aColor, { life: 0.3, size: 0.7 }); });
        tl.at(0.82, () => { const a = stand.clone().addScaledVector(dir, 0.3).setY(0.55), b = PV.clone().addScaledVector(dir, 1.6).setY(0.45); c.fx3d.beam(a, b, B.o.aColor, { width: 0.09, dur: 0.5 }); c.audio.beam(); A.root.position.addScaledVector(dir, -0.12); this.hit(B, vTop(), 0.55, 'PIERCE!'); });
        tl.at(0.96, () => { this.hit(B, vTop(), 0.6); });
        tl.at(1.12, () => { const a = stand.clone().addScaledVector(dir, 0.3).setY(0.55), b = PV.clone().addScaledVector(dir, 2.4).setY(0.45); c.fx3d.beam(a, b, 0xffffff, { width: 0.22, dur: 0.45 }); this.finisher(B, vTop(), 1); });
        this.land(B, 1.4, 1.78); end = 1.92; break;
      }
      case 'ram': {    // rook / chariot: rev back, charge, double impact
        const back = B.P0.clone().addScaledVector(dir, -0.45);
        this.anticipation(B, 0.4, true);
        tl.span(0, 0.4, (k) => { A.root.position.lerpVectors(B.P0, back, easeOut(k)); A.body.rotation.x = Math.sin(k * 30) * 0.03; A.body.position.x = Math.sin(k * 60) * 0.02; });
        tl.at(0.4, () => { c.audio.dash(); c.audio.engine && c.audio.engine(); });
        tl.span(0.4, 0.62, (k) => { A.root.position.lerpVectors(back, S, easeIn(k)); A.body.rotation.x = 0; tiltToward(A, dir, 0.25 * k); c.particles.emit(A.root.position.clone().setY(0.1), dir.clone().multiplyScalar(-4).add(new THREE.Vector3(0, 1, 0)), 0xffffff, { life: 0.3, size: 0.8 }); c.particles.emit(A.root.position.clone().setY(0.5), dir.clone().multiplyScalar(-3), B.o.aColor, { life: 0.3, size: 1 }); });
        tl.at(0.62, () => { this.hit(B, vTop(), 0.9, 'RAM!'); c.audio.stomp(); c.waves.spawn(PV.clone().setY(0.05), new THREE.Color(B.o.aColor), { r0: 0.2, r1: 2.2, h: 0.5, dur: 0.4 }); });
        tl.span(0.64, 0.92, (k) => { V.root.position.copy(PV).addScaledVector(dir, easeOut(k) * 0.55); V.body.position.y = Math.sin(k * Math.PI) * 0.45; V.body.rotation.x = k * 0.6; A.root.position.copy(S).addScaledVector(dir, easeOut(k) * 0.55); });
        tl.at(0.94, () => { tiltToward(A, dir, 0); this.finisher(B, vTop(), 1.1); });
        this.land(B, 1.25, 1.65); end = 1.8; break;
      }
      case 'tempest': { // queen: blink combo from five angles + overhead strike
        this.anticipation(B, 0.34); this.dash(B, 0.34, 0.5, S);
        const angs = [0.2, 2.4, 4.4, 1.3, 3.5];
        angs.forEach((a, i) => tl.at(0.58 + i * 0.12, () => {
          c.fx3d.ghost(A.body, B.o.aColor, 0.3);
          const off = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.7);
          A.root.position.copy(PV).add(off);
          const n = new THREE.Vector3(Math.sin(a), 0.6 * (i % 2 ? 1 : -1), -Math.cos(a)).normalize();
          c.fx3d.slash(vTop(), n, i % 2 ? 0xffffff : B.o.aColor, { r: 0.55, width: 0.12, dur: 0.12, arc: Math.PI * 1.2, start: a });
          c.audio.slash(i + 2); this.hit(B, vTop(), 0.3 + i * 0.06);
        }));
        tl.at(1.2, () => { c.fx3d.ghost(A.body, B.o.aColor, 0.3); A.root.position.copy(PV).addScaledVector(dir, -0.15); A.body.position.y = 1.6; A.flash(1); c.audio.riser(0.12); });
        tl.span(1.2, 1.3, (k) => { A.body.position.y = 1.6 * (1 - easeIn(k)) + 0.1; });
        tl.at(1.3, () => { c.fx3d.slash(vTop().setY(0.5), new THREE.Vector3(side.x, 0, side.z), 0xffffff, { r: 0.9, width: 0.22, dur: 0.12, arc: Math.PI, start: Math.PI / 2 }); this.finisher(B, vTop(), 1.15); });
        this.land(B, 1.55, 1.85); end = 2.0; break;
      }
      case 'quake': {  // king / general: rise with aura, heavy slam, triple quake rings
        this.anticipation(B, 0.4, true); this.dash(B, 0.4, 0.6, S);
        tl.at(0.62, () => { c.audio.riser(0.36, true); });
        tl.span(0.62, 0.98, (k) => { A.body.position.y = easeOut(k) * 1.7; A.body.rotation.y = k * Math.PI * 2; A.flash(k * 1.2); if (Math.random() < 0.8) { const a = Math.random() * 6.28; c.particles.emit(A.root.position.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, A.body.position.y, Math.sin(a) * 0.5)), new THREE.Vector3(0, -1.5, 0), B.o.aColor, { life: 0.4, size: 0.9 }); } });
        tl.span(0.98, 1.08, (k) => { A.root.position.lerpVectors(S, PV.clone().addScaledVector(dir, -0.2), k); A.body.position.y = 1.7 * (1 - easeIn(k)); const st = 1 + k * 0.5; A.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st)); });
        tl.at(1.08, () => { A.body.scale.set(1.4, 0.55, 1.4); c.audio.stomp(); c.audio.boom(); [0, 0.12, 0.24].forEach((d, i) => setTimeout(() => c.waves.spawn(PV.clone().setY(0.04), new THREE.Color(i === 1 ? 0xffffff : B.o.aColor), { r0: 0.3, r1: 3 + i * 1.6, h: 0.9, dur: 0.7 }), d * 1000)); c.particles.ring(PV.clone().setY(0.05), B.o.aColor, 110, 7, 0.05); this.finisher(B, vTop(), 1.4); c.fx.kick({ trauma: 0.75 }); });
        tl.span(1.1, 1.45, (k) => { const sq = 0.55 + 0.45 * backOut(k); A.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); });
        this.land(B, 1.5, 1.85); end = 2.05; break;
      }
      case 'mortar': { // cannon: recoil + plasma orb lobbed over the screen, explosion
        let orb = null; const top = () => A.root.position.clone().setY(0.55);
        tl.at(0, () => { c.audio.charge(0.45); });
        tl.span(0, 0.45, (k) => { const sq = 1 - k * 0.2; A.body.scale.set(1 + k * 0.12, sq, 1 + k * 0.12); A.flash(k); if (Math.random() < 0.8) c.particles.emit(top().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.2)), new THREE.Vector3(0, 0, 0).sub(new THREE.Vector3((Math.random() - 0.5), 0, (Math.random() - 0.5))), B.o.aColor, { life: 0.3, size: 0.7 }); });
        tl.at(0.45, () => { orb = c.fx3d.orb(top(), B.o.aColor, 0.2); c.audio.launch(); A.body.scale.set(1.25, 0.7, 1.25); A.root.position.addScaledVector(dir, -0.18); c.particles.burst(top(), B.o.aColor, 30, { speed: 3, up: 2, life: 0.4, size: 0.8 }); c.fx.kick({ trauma: 0.2 }); });
        const start = B.P0.clone().setY(0.55);
        tl.span(0.45, 1.0, (k) => { A.body.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2); if (!orb) return; const p = start.clone().lerp(vTop(), k); p.y += Math.sin(k * Math.PI) * 2.6; orb.obj.position.copy(p); c.particles.emit(p, new THREE.Vector3((Math.random() - 0.5), 0.4, (Math.random() - 0.5)), B.o.aColor, { life: 0.45, size: 1.1 }); });
        tl.at(1.0, () => { if (orb) orb.kill(); c.audio.boom(); c.particles.burst(vTop(), 0xffb03c, 80, { speed: 6, up: 4, life: 0.8, size: 1.4, color2: new THREE.Color(B.o.aColor) }); c.fx3d.pillar(PV.clone(), B.o.aColor, { h: 3, r: 0.4, dur: 0.6 }); this.hit(B, vTop(), 1, 'BOOM!'); this.finisher(B, vTop(), 1.2, 0xffb03c); });
        this.land(B, 1.3, 1.75); end = 1.9; break;
      }
      case 'needles': { // advisor: two crossing thrusts → X burst
        this.anticipation(B, 0.34); this.dash(B, 0.34, 0.52, S);
        const n1 = new THREE.Vector3(side.x, 0.9, side.z).normalize(), n2 = new THREE.Vector3(-side.x, 0.9, -side.z).normalize();
        tl.at(0.62, () => { tiltToward(A, dir, 0.3); c.fx3d.slash(vTop(), n1, B.o.aColor, { r: 0.5, width: 0.1, dur: 0.1, arc: Math.PI, start: 0.7 }); c.audio.slash(3); this.hit(B, vTop(), 0.45, 'STAB!'); });
        tl.at(0.8, () => { tiltToward(A, dir, -0.3); c.fx3d.slash(vTop(), n2, 0xffffff, { r: 0.5, width: 0.1, dur: 0.1, arc: Math.PI, start: 2.2 }); c.audio.slash(5); this.hit(B, vTop(), 0.55, 'STAB!'); });
        tl.at(0.98, () => { tiltToward(A, dir, 0); const v = vTop(); const d1 = new THREE.Vector3(side.x + dir.x, 0, side.z + dir.z).normalize(), d2 = new THREE.Vector3(side.x - dir.x, 0, side.z - dir.z).normalize(); c.fx3d.beam(v.clone().addScaledVector(d1, -0.9), v.clone().addScaledVector(d1, 0.9), B.o.aColor, { width: 0.06, dur: 0.4 }); c.fx3d.beam(v.clone().addScaledVector(d2, -0.9), v.clone().addScaledVector(d2, 0.9), 0xffffff, { width: 0.06, dur: 0.4 }); c.audio.beam(); this.finisher(B, v, 1); });
        this.land(B, 1.28, 1.65); end = 1.8; break;
      }
      case 'trample': { // elephant: two heavy hops, quake on each landing
        this.anticipation(B, 0.36);
        const mid = PV.clone().addScaledVector(dir, -0.8); let f1 = null;
        tl.span(0.36, 0.62, (k) => { if (!f1) f1 = A.root.position.clone(); A.root.position.lerpVectors(f1, mid, k); A.body.position.y = Math.sin(k * Math.PI) * 0.9; A.body.scale.set(1, 1, 1); });
        tl.at(0.62, () => { c.audio.stomp(); c.waves.spawn(mid.clone().setY(0.04), new THREE.Color(B.o.aColor), { r0: 0.2, r1: 2.2, h: 0.5, dur: 0.45 }); this.hit(B, vTop(), 0.5, 'STOMP!'); A.body.scale.set(1.25, 0.75, 1.25); });
        tl.span(0.66, 0.96, (k) => { A.root.position.lerpVectors(mid, PV.clone().addScaledVector(dir, -0.1), k); A.body.position.y = Math.sin(k * Math.PI) * 1.4 + (k > 0.9 ? 0 : 0); const s = 1 + Math.sin(k * Math.PI) * 0.1; A.body.scale.set(s, 1 / s, s); });
        tl.at(0.96, () => { c.audio.stomp(); A.body.scale.set(1.4, 0.6, 1.4); c.waves.spawn(PV.clone().setY(0.04), new THREE.Color(0xffffff), { r0: 0.2, r1: 3.5, h: 0.8, dur: 0.6 }); c.particles.ring(PV.clone().setY(0.05), B.o.aColor, 80, 6, 0.05); this.finisher(B, vTop(), 1.2); });
        tl.span(0.98, 1.3, (k) => { const sq = 0.6 + 0.4 * backOut(k); A.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); });
        this.land(B, 1.3, 1.6); end = 1.75; break;
      }
      case 'dogfight': { // sky race: climb, loop behind, three laser bolts, explosion
        const Aj = A; const p0 = B.P0.clone(); const center = PV.clone();
        tl.at(0, () => { c.audio.engine(); });
        tl.span(0, 0.45, (k) => { Aj.root.position.copy(p0).addScaledVector(dir, -0.4 * k); Aj.body.position.y = 0.2 + easeOut(k) * 1.4; Aj.body.rotation.x = -k * 0.7; faceDir(Aj, dir); });
        tl.span(0.45, 1.0, (k) => {
          const a = k * Math.PI * 1.5; const r = 1.6;
          const pos = center.clone().addScaledVector(dir, -Math.cos(a) * r - 0.6).addScaledVector(side, Math.sin(a) * r * 0.8);
          const prev = Aj.root.position.clone(); Aj.root.position.copy(pos); Aj.body.position.y = 1.6 - k * 0.5; Aj.body.rotation.x = 0;
          const v = pos.clone().sub(prev); if (v.lengthSq() > 1e-6) Aj.root.rotation.y = Math.atan2(v.x, v.z); Aj.body.rotation.z = -0.7;
          c.particles.emit(pos.clone().setY(Aj.body.position.y * 0.82), new THREE.Vector3(0, 0.3, 0), B.o.aColor, { life: 0.5, size: 0.9 });
        });
        [1.0, 1.1, 1.2].forEach((t, i) => tl.at(t, () => { const from = Aj.root.position.clone().setY(Aj.body.position.y * 0.82); Aj.root.rotation.y = Math.atan2(center.x - from.x, center.z - from.z); Aj.body.rotation.z = 0; c.fx3d.beam(from, vTop(), B.o.aColor, { width: 0.05, dur: 0.18 }); c.audio.laser(); this.hit(B, vTop(), 0.4 + i * 0.1, i === 2 ? 'LOCKED!' : 'PEW!'); }));
        tl.at(1.32, () => { c.audio.boom(); c.particles.burst(vTop(), 0xffb03c, 90, { speed: 6, up: 4, life: 0.9, size: 1.4, color2: new THREE.Color(B.o.vColor) }); this.finisher(B, vTop(), 1.2, 0xffb03c); });
        tl.span(1.4, 1.9, (k) => { const from = Aj.root.position.clone(); Aj.root.position.lerp(B.PV, easeInOut(k)); Aj.body.position.y = Math.max(0.2, Aj.body.position.y * (1 - k * 0.3)); const v = B.PV.clone().sub(from); if (v.lengthSq() > 1e-5) Aj.root.rotation.y = Math.atan2(v.x, v.z); });
        end = 2.0; break;
      }
    }
    B.dur = end;
    // camera choreography
    const camTarget = () => { const mid = PV.clone().lerp(B.P0, script === 'mortar' || script === 'dogfight' ? 0.45 : 0.18); mid.y = script === 'stomp' || script === 'quake' || script === 'dogfight' ? 0.85 : 0.5; return mid; };
    const look = camTarget();
    // frame both fighters for the current aspect: portrait = over-the-shoulder (fighters stacked in depth),
    // landscape = side-on profile shot. Distance is solved from the real field of view so nothing gets cropped.
    const cam = B.o.cam, DEG = Math.PI / 180, vf = Math.max(20, cam.fov - 6) * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    const big = script === 'mortar' || script === 'dogfight' || script === 'stomp' || script === 'quake';
    let camP;
    if (B.portrait) {
      const need = (script === 'dogfight' ? 3.8 : big ? 2.7 : 2.1) / 2, D = Math.max(3.2, need / Math.tan(hf / 2));
      camP = look.clone().addScaledVector(dir, -D * 0.74).addScaledVector(side, D * 0.4).add(new THREE.Vector3(0, D * (big ? 0.6 : 0.52), 0));
    } else {
      const span = Math.min(PV.distanceTo(B.P0), 3) + (script === 'dogfight' ? 3.6 : big ? 2.6 : 1.9), D = Math.max(3.2, span / 2 / Math.tan(Math.min(hf, vf) / 2));
      camP = look.clone().addScaledVector(side, D * 0.88).addScaledVector(dir, -D * 0.26).add(new THREE.Vector3(0, D * (big ? 0.5 : 0.4), 0));
    }
    this.camLook.copy(look); this.camPos.copy(camP);
    tl.span(0, 0.36, (k) => { this.camW = easeInOut(k); this.fovDelta = -6 * k; });
    tl.span(0.36, end - 0.45, (k) => { this.camPos.copy(camP).addScaledVector(side, -k * 0.5).addScaledVector(dir, k * 0.35); });
    tl.span(end - 0.45, end, (k) => { this.camW = 1 - easeInOut(k); this.fovDelta = -6 * (1 - k); });
    tl.at(0.34, () => this.cardMove(B));
    tl.at(end - 0.42, () => this.card(false));
  }
  buildQuick(B) {
    const A = B.o.attacker, V = B.o.victim, c = this.c, tl = B.tl, PV = B.PV, dir = B.dir;
    const S = PV.clone().addScaledVector(dir, -0.45);
    const vTop = () => V.root.position.clone().add(new THREE.Vector3(0, Math.max(0.3, (V.height || 0.6) * 0.6), 0));
    tl.span(0, 0.1, (k) => { const sq = 1 - k * 0.15; A.body.scale.set(1 + k * 0.1, sq, 1 + k * 0.1); });
    this.dash(B, 0.1, 0.24, S);
    tl.at(0.25, () => { c.fx3d.slash(vTop(), new THREE.Vector3(B.side.x, 0.8, B.side.z).normalize(), B.o.aColor, { r: 0.5, width: 0.12, dur: 0.1, arc: Math.PI * 1.3 }); c.audio.slash(2); this.finisher(B, vTop(), 0.8); });
    this.land(B, 0.36, 0.56); B.dur = 0.62;
  }

  // ---------------------------------------------------------------- DOM: letterbox + name card
  card(on, o, mv) {
    const lb = document.getElementById('letterbox'), card = document.getElementById('battle-card');
    if (!lb || !card) return;
    lb.classList.toggle('on', on); card.classList.toggle('on', on); document.body.classList.toggle('battling', on);
    if (on && o) {
      const zh = this.c.lang() === 'zh-HK';
      card.querySelector('.bc-a').textContent = zh ? o.aName[0] : o.aName[1];
      card.querySelector('.bc-v').textContent = zh ? o.vName[0] : o.vName[1];
      card.querySelector('.bc-a').style.color = '#' + new THREE.Color(o.aColor).getHexString();
      card.querySelector('.bc-v').style.color = '#' + new THREE.Color(o.vColor).getHexString();
      const m = card.querySelector('.bc-move'); m.textContent = ''; m.classList.remove('pop');
      card.querySelector('.bc-move-sub').textContent = '';
      this.cardMv = mv;
    }
  }
  cardMove(B) {
    const card = document.getElementById('battle-card'); if (!card) return;
    const zh = this.c.lang() === 'zh-HK', mv = B.move;
    const m = card.querySelector('.bc-move'); m.textContent = zh ? mv[0] : mv[1]; m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
    card.querySelector('.bc-move-sub').textContent = zh ? mv[1] : mv[0];
  }

  // ---------------------------------------------------------------- frame update (call every frame with real dt)
  update(dt) {
    const B = this.active; this.frozen = false; this.timeScale = 1;
    if (!B) { this.camW = Math.max(0, this.camW - dt * 4); this.fovDelta *= 0.85; return; }
    if (B.hitstop > 0) { B.hitstop -= dt; this.frozen = true; }
    else {
      let k = 1; if (B.slow > 0) { B.slow -= dt; k = 0.32; this.timeScale = 0.35; }
      B.bt += dt * k;
      B.tl.run(B.bt);
    }
    // victim jitter from hits
    const V = B.o.victim;
    if (B.victimShake > 0 && V.root.visible) { B.victimShake = Math.max(0, B.victimShake - dt * 0.6); const s = B.victimShake; V.body.position.x = (Math.random() - 0.5) * s; V.body.position.z = (Math.random() - 0.5) * s; V.body.rotation.z = (Math.random() - 0.5) * s * 2; }
    if (B.bt >= B.dur && !B.done) this.finish(false);
  }
  finish(skipped) {
    const B = this.active; if (!B || B.done) return; B.done = true;
    const A = B.o.attacker, V = B.o.victim, c = this.c;
    if (skipped) {
      if (!B.finished) { c.fx3d.shatter(V.root.position.clone(), B.o.vColor, { count: 30, height: Math.max(0.25, V.height || 0.5) }); c.audio.shatter(); }
      c.fx3d.clear();
    }
    V.root.visible = false;
    A.root.position.copy(B.PV); A.body.position.set(0, 0, 0); A.body.rotation.set(0, 0, 0); A.body.scale.set(1, 1, 1); A.root.rotation.y = A.root.rotation.y;
    A.cinematic = false; V.cinematic = false;
    if (A.restoreYaw) A.restoreYaw();
    this.card(false);
    this.active = null; this.fovDelta = 0;
    B.resolve();
  }
}
function tiltToward(A, dir, amt) { A.body.rotation.x = dir.z * amt; A.body.rotation.z = -dir.x * amt; }
function faceDir(A, dir) { A.root.rotation.y = Math.atan2(dir.x, dir.z); }
