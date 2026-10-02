// FLIP 黑白棋 controller: disc drops, chain-lightning flip cascades (each outflanked line flips outward link by link),
// big corner bursts, pass banners, AI via the worker (minimax + positional weights), endless objectives (margin / corners).
import * as THREE from 'three';
import { Flip, corner } from '../rules/flip.js';
import { Disc } from '../pieces.js';
import { aiOptions } from '../tower.js';
import { charById } from '../characters.js';

export class FlipGame {
  constructor(app) { this.app = app; this.kind = 'flip'; this.discs = new Map(); }
  colorOf(side) { return side === 1 ? this.app.skinColor(0x00e5ff) : 0xff2bd6; }
  start(cfg) {
    const a = this.app; this.cfg = cfg; this.token = (this.token || 0) + 1;
    this.voids = (cfg.spec && cfg.spec.voids) || [];
    this.pos = new Flip(this.voids);
    this.humans = cfg.mode === 'local' ? new Set([1, -1]) : (cfg.mode === 'demo' || cfg.mode === 'preview') ? new Set() : new Set([1]);
    this.busy = false; this.over = false; this.last = -1; this.bestChain = 0; this.cornersTaken = 0;
    a.board.build('flip', { voids: this.voids });
    a.setCss(this.colorOf(1), this.colorOf(-1));
    this.sync();
    if (cfg.mode === 'preview') return;
    this.refreshHud(); this.nextTurn();
  }
  sideName(side) { const a = this.app; if (this.cfg.mode === 'local' || this.cfg.mode === 'demo') return a.t(side === 1 ? 'side.cyan' : 'side.magenta'); return side === 1 ? a.t('you') : a.charName(); }
  sync() {
    for (const d of this.discs.values()) d.dispose(); this.discs.clear();
    for (let i = 0; i < 64; i++) { const v = this.pos.b[i]; if (v === 1 || v === -1) this.addDisc(i, v); }
  }
  addDisc(i, side) { const d = new Disc(side, this.colorOf(1), this.colorOf(-1)); d.root.position.copy(this.app.board.cellPos('flip', i)); this.app.scene.add(d.root); this.discs.set(i, d); return d; }
  refreshHud() {
    const a = this.app, c = this.pos.count();
    a.setPlayers(this.sideName(1), this.sideName(-1), this.colorOf(1), this.colorOf(-1));
    a.setScores(c[1], c[-1]);
    if (this.cfg.mode === 'endless') { const s = this.cfg.spec; a.setObjective(a.t('obj.' + s.type, { t: s.target })); }
  }
  humanTurn() { return this.humans.has(this.pos.side) && !this.over; }
  drawMarks(hint = -1) {
    const a = this.app, b = a.board; b.clearMarks();
    if (this.last >= 0) b.mark('tile', b.cellPos('flip', this.last), 0xffd23c);
    if (this.humanTurn() && a.settings.hints) for (const i of this.pos.moves()) b.mark('dot', b.cellPos('flip', i), this.colorOf(this.pos.side));
    if (hint >= 0) b.mark('ring', b.cellPos('flip', hint), 0x3bff8a);
  }
  async nextTurn() {
    const a = this.app, tok = this.token; if (this.over) return;
    a.setTurn(this.pos.side === 1 ? 'a' : 'b');
    const st = this.pos.status();
    if (st.over) return this.end(st);
    if (st.mustPass) {
      this.drawMarks(); a.setStatus(a.t('pass'), 'alert'); a.ui.banner(a.t('pass'), this.sideName(this.pos.side), ''); a.audio.denied();
      await a.wait(1.1); if (tok !== this.token) return;
      this.pos.pass(); return this.nextTurn();
    }
    this.drawMarks();
    if (this.humanTurn()) { a.setStatus(this.cfg.mode === 'local' ? a.t('turnOf', { n: this.sideName(this.pos.side) }) : a.t('yourTurn')); a.toolsEnabled(true); return; }
    this.busy = true; a.toolsEnabled(false); a.setStatus(a.t('thinking', { n: this.sideName(this.pos.side) }), 'think');
    const s = this.cfg.mode === 'demo' ? 0.4 : this.cfg.strength;
    const opts = aiOptions('flip', s, charById(this.cfg.charId)); if (this.cfg.mode === 'demo') opts.timeMs = 200;
    const t0 = performance.now();
    let res = null; try { res = await a.think({ game: 'flip', board: this.pos.b, side: this.pos.side, opts }); } catch (e) { console.warn(e); }
    if (tok !== this.token || this.over) return;
    const w = (performance.now() - t0) / 1000; if (w < 0.5) await a.wait(0.5 - w);
    if (tok !== this.token) return;
    let mv = res && res.move; const legal = this.pos.moves(); if (!legal.includes(mv)) mv = legal[Math.floor(Math.random() * legal.length)];
    await this.perform(mv);
  }
  tap(point) {
    if (this.busy || !this.humanTurn() || !point) return;
    const i = this.app.board.cellAt('flip', point.x, point.z);
    if (i < 0) return;
    if (this.pos.moves().includes(i)) this.perform(i); else { this.app.audio.denied(); }
  }
  async perform(i) {
    const a = this.app, b = a.board, tok = this.token; this.busy = true; a.toolsEnabled(false);
    const side = this.pos.side, human = this.humans.has(side);
    const res = this.pos.play(i); if (!res) { this.busy = false; return; }
    this.last = i; b.clearMarks();
    const fxMode = a.battleMode({ human, value: res.flips.length, exchange: false, game: 'flip' });
    const P = b.cellPos('flip', i);
    // drop the new disc in
    const d = this.addDisc(i, side); d.body.position.y = 1.6; d.flashK = 1.5;
    await a.tween(0.2, (k) => { d.body.position.y = 1.6 * (1 - k * k); });
    if (tok !== this.token) return;
    a.audio.place(); a.particles.ring(P.clone().setY(0.05), d.rimA.material.color, 26, 2.4, 0.05); b.ripple(P.x, P.z, 0.7); a.haptic('light');
    // corner burst
    const isCorner = corner(i);
    if (isCorner) {
      if (human || this.cfg.mode !== 'endless') { /* count below */ }
      const col = this.colorOf(side);
      a.audio.corner(); a.fx.kick({ trauma: 0.4, aberr: 1, glitch: 0.25, slowmo: fxMode === 'full' ? 0.6 : 0 }); a.ui.flash('rgba(255,255,255,0.4)', 220);
      a.fx3d.pillar(P.clone(), col, { h: 7, r: 0.5, dur: 1.1 }); a.fx3d.flashLight(P, col, 2.5);
      for (let k = 0; k < 3; k++) a.waves.spawn(P.clone().setY(0.04), new THREE.Color(k === 1 ? 0xffffff : col), { r0: 0.2, r1: 4 + k * 2, h: 0.8, dur: 0.6 + k * 0.2 });
      a.particles.burst(P.clone().setY(0.4), new THREE.Color(col), 120, { speed: 7, up: 6, life: 1, size: 1.3, color2: new THREE.Color(0xffffff) });
      a.popupAt(P, a.t('corner'), 'big'); b.ripple(P.x, P.z, 2); a.haptic('heavy');
      if (side === 1) this.cornersTaken++;
    }
    // chain-lightning cascade
    const step = fxMode === 'off' ? 0.03 : fxMode === 'quick' ? 0.05 : 0.085;
    let maxDelay = 0, n = 0;
    const col = new THREE.Color(this.colorOf(side));
    for (const line of res.lines) {
      let prev = P;
      line.forEach((f, k) => {
        const disc = this.discs.get(f), Q = b.cellPos('flip', f), delay = 0.04 + k * step, from = prev.clone(), idx = n++;
        if (!disc) return;
        disc.flipTo(side, delay);
        maxDelay = Math.max(maxDelay, delay);
        a.schedule(delay, () => {
          if (tok !== this.token) return;
          if (fxMode !== 'off') a.fx3d.lightning(from.clone().setY(0.25), Q.clone().setY(0.25), col, { dur: 0.22, jag: 0.16 });
          a.audio.flipTick(idx); a.particles.burst(Q.clone().setY(0.2), col, 10, { speed: 2.4, up: 2, life: 0.35, size: 0.6 });
          disc.flashK = 1.2;
        });
        prev = Q;
      });
    }
    const chain = res.flips.length; this.bestChain = Math.max(this.bestChain, side === 1 ? chain : 0);
    if (chain >= 4 && fxMode !== 'off') a.schedule(maxDelay * 0.6, () => { if (tok !== this.token) return; a.popupAt(P, a.t('chain', { n: chain }), chain >= 7 ? 'big' : 'combo'); a.fx.kick({ trauma: Math.min(0.45, chain * 0.04), aberr: 0.5 }); a.audio.zap(chain); });
    await a.wait(maxDelay + 0.48);
    if (tok !== this.token) return;
    this.refreshHud(); this.busy = false;
    if (human) a.say(null); else if (chain >= 5) a.say('capture');
    if (!human && chain >= 6 && this.humans.size === 1) a.say('capture');
    this.nextTurn();
  }
  async end(st) {
    if (this.over) return; this.over = true;
    const a = this.app, c = st.count; this.app.board.clearMarks();
    a.setStatus(`${c[1]} : ${c[-1]}`);
    // victory sweep: winner discs pulse in a wave
    const win = st.result; let k = 0;
    for (const [i, d] of this.discs) if (d.side === win || win === 0) { const r = i >> 3, cc = i & 7; d.flipTo(d.side, (r + cc) * 0.045, 0.5); a.schedule((r + cc) * 0.045, () => { d.flashK = 1.5; }); k++; }
    a.audio.zap(8); await a.wait(1.2);
    let who;
    if (this.cfg.mode === 'local' || this.cfg.mode === 'demo') who = win === 0 ? 'draw' : win === 1 ? 'a' : 'b';
    else {
      who = win === 1 ? 'player' : win === -1 ? 'ai' : 'draw';
      if (this.cfg.mode === 'endless') {
        const s = this.cfg.spec;
        if (who === 'player' && s.type === 'margin' && c[1] - c[-1] < s.target) who = 'ai';
        if (who === 'player' && s.type === 'corners' && this.cornersOwned() < s.target) who = 'ai';
        if (who === 'draw') who = 'ai';
      }
    }
    a.gameOver({ who, reason: 'count', score: [c[1], c[-1]], stats: { discs: c[1], chain: this.bestChain, corners: this.cornersOwned() }, names: [this.sideName(1), this.sideName(-1)] });
  }
  cornersOwned() { return [0, 7, 56, 63].filter((i) => this.pos.b[i] === 1).length; }
  canUndo() { return !this.busy && !this.over && this.pos.history.length > 0 && this.humanTurn(); }
  undo() {
    if (!this.canUndo()) return false;
    if (this.cfg.mode === 'local') this.pos.undo();
    else { do { this.pos.undo(); } while (this.pos.history.length && !this.humans.has(this.pos.side)); }
    this.last = -1; this.sync(); this.refreshHud(); this.nextTurn(); return true;
  }
  async hint() {
    if (!this.humanTurn() || this.busy) return;
    const res = await this.app.think({ game: 'flip', board: this.pos.b, side: this.pos.side, opts: { maxDepth: 5, timeMs: 500 } });
    if (res && res.move >= 0 && !this.over) this.drawMarks(res.move);
  }
  update(dt, t) { for (const d of this.discs.values()) d.update(dt, t); }
  dispose() { this.token++; for (const d of this.discs.values()) d.dispose(); this.discs.clear(); }
}
