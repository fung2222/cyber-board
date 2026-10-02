// Chess + Xiangqi controller: selection, legal-move markers, AI turns (Web Worker), capture battles,
// check / mate drama, promotion picker, endless objectives (RUSH / ENDGAME / DUEL), undo, hints.
import * as THREE from 'three';
import { Chess, START_FEN as CHESS_START, F_CASTLE, F_PROMO, F_EP, fileOf as cFile, rankOf as cRank, sq as csq } from '../rules/chess.js';
import { Xiangqi, START_FEN as XQ_START } from '../rules/xiangqi.js';
import { Piece } from '../pieces.js';
import { aiOptions } from '../tower.js';
import { charById } from '../characters.js';

const CHESS_VAL = [0, 1, 3, 3, 5, 9, 99], XQ_VAL = [0, 99, 2, 2, 4, 9, 4.5, 1];
export class GridGame {
  constructor(app, kind) { this.app = app; this.kind = kind; this.pieces = new Map(); this.sel = -1; this.legal = []; }
  get isChess() { return this.kind === 'chess'; }
  colorOf(side) { const a = this.app; return this.isChess ? (side === 1 ? a.skinColor(0x00e5ff) : 0xff2bd6) : (side === 1 ? a.skinColor(0xff3355) : 0x29e6ff); }
  start(cfg) {
    this.cfg = cfg; const a = this.app;
    const fen = cfg.spec && cfg.spec.fen;
    this.pos = this.isChess ? new Chess(fen || CHESS_START) : new Xiangqi(fen || XQ_START);
    this.humans = cfg.mode === 'local' ? new Set([1, -1]) : (cfg.mode === 'demo' || cfg.mode === 'preview') ? new Set() : new Set([1]);
    this.captures = { 1: 0, '-1': 0 }; this.playerMoves = 0; this.lastCapPly = -9; this.ply = 0;
    this.sel = -1; this.legal = []; this.busy = false; this.over = false; this.lastMove = null; this.token = (this.token || 0) + 1;
    a.board.build(this.kind);
    a.setCss(this.colorOf(1), this.colorOf(-1));
    this.sync();
    if (cfg.mode === 'preview') return;
    this.refreshHud();
    this.nextTurn();
  }
  sideName(side) { const a = this.app; if (this.cfg.mode === 'local' || this.cfg.mode === 'demo') return a.t(this.isChess ? (side === 1 ? 'side.white' : 'side.black') : (side === 1 ? 'side.red' : 'side.blackxq')); return side === 1 ? a.t('you') : a.charName(); }
  pieceName(p) { const t = Math.abs(p); return [this.app.t((this.isChess ? 'p.chess.' : 'p.xq.') + t, null, 'zh-HK'), this.app.t((this.isChess ? 'p.chess.' : 'p.xq.') + t, null, 'en').toUpperCase()]; }
  sync() {
    for (const p of this.pieces.values()) p.dispose();
    this.pieces.clear();
    for (const { sq, p } of this.pos.pieces()) this.addPiece(sq, p);
    this.applyYaw(this.app.yawTarget || 0);
  }
  addPiece(sq, p) {
    const pc = new Piece(this.kind, Math.abs(p), Math.sign(p), this.colorOf(Math.sign(p)));
    pc.root.position.copy(this.app.board.cellPos(this.kind, sq)); this.app.scene.add(pc.root); this.pieces.set(sq, pc);
    if (this.kind === 'xiangqi') pc.setGlyphYaw(this.app.yawTarget || 0);
    return pc;
  }
  applyYaw(yaw) { if (this.kind === 'xiangqi') for (const p of this.pieces.values()) p.setGlyphYaw(yaw); }
  refreshHud() {
    const a = this.app, cfg = this.cfg;
    a.setPlayers(this.sideName(1), this.sideName(-1), this.colorOf(1), this.colorOf(-1));
    const v = this.isChess ? CHESS_VAL : XQ_VAL; let m1 = 0, m2 = 0;
    for (const { p } of this.pos.pieces()) { const val = v[Math.abs(p)]; if (val >= 50) continue; if (p > 0) m1 += val; else m2 += val; }
    a.setScores(m1 - m2 > 0 ? '+' + (m1 - m2) : '', m2 - m1 > 0 ? '+' + (m2 - m1) : '');
    if (cfg.mode === 'endless') {
      const s = cfg.spec;
      if (s.type === 'rush') a.setObjective(a.t('hud.rush', { c: this.captures[1], t: s.target, m: s.moveLimit - this.playerMoves }));
      else if (s.type === 'endgame') a.setObjective(a.t('hud.endgame', { m: s.moveLimit - this.playerMoves }));
      else a.setObjective(a.t('obj.duel'));
    }
  }
  humanTurn() { return this.humans.has(this.pos.side) && !this.over; }
  nextTurn() {
    const a = this.app; if (this.over) return;
    a.setTurn(this.pos.side === 1 ? 'a' : 'b');
    const st = this.pos.status();
    if (st.over) return this.end(st);
    if (this.cfg.mode === 'local' && a.settings.rotate) a.setYaw(this.pos.side === 1 ? 0 : Math.PI, (y) => this.applyYaw(y));
    if (this.humanTurn()) { a.setStatus(st.check ? a.t('check') : (this.cfg.mode === 'local' ? a.t('turnOf', { n: this.sideName(this.pos.side) }) : a.t('yourTurn')), st.check ? 'alert' : ''); a.toolsEnabled(true); }
    else this.aiTurn();
  }
  async aiTurn() {
    const a = this.app, tok = this.token; this.busy = true; a.toolsEnabled(false);
    a.setStatus(a.t('thinking', { n: this.sideName(this.pos.side) }), 'think');
    const s = this.cfg.mode === 'demo' ? 0.35 : this.cfg.strength;
    const ch = charById(this.cfg.charId);
    const opts = aiOptions(this.kind, s, ch);
    if (this.cfg.mode === 'demo') opts.timeMs = 260;
    const t0 = performance.now();
    let res;
    try { res = await a.think({ game: this.kind, fen: this.pos.fen(), hist: this.pos.hist, opts }); } catch (e) { console.warn(e); res = null; }
    if (tok !== this.token || this.over) return;
    const waited = (performance.now() - t0) / 1000; if (waited < 0.45) await a.wait(0.45 - waited);
    if (tok !== this.token || this.over) return;
    let mv = res && res.move;
    if (!mv) { const l = this.pos.legal(); mv = l[Math.floor(Math.random() * l.length)]; }
    await this.perform(mv);
  }
  tap(point) {
    const a = this.app;
    if (this.busy || !this.humanTurn() || !point) return;
    const sq = a.board.cellAt(this.kind, point.x, point.z);
    if (sq < 0) { this.deselect(); return; }
    const target = this.legal.filter((m) => m.to === sq);
    if (this.sel >= 0 && target.length) {
      if (target[0].flag & F_PROMO) { a.pickPromotion().then((pr) => { if (pr) this.perform({ from: this.sel, to: sq, promo: pr }); }); return; }
      this.perform({ from: this.sel, to: sq });
      return;
    }
    const p = this.pos.b[sq];
    if (p && Math.sign(p) === this.pos.side) { this.select(sq); return; }
    this.deselect();
  }
  select(sq) {
    const a = this.app; this.deselect(false);
    this.sel = sq; this.legal = this.pos.legalFrom(sq);
    const pc = this.pieces.get(sq); if (pc) pc.selected = true;
    a.audio.select(); a.haptic('light');
    this.drawMarks();
  }
  deselect(redraw = true) { const pc = this.pieces.get(this.sel); if (pc) pc.selected = false; this.sel = -1; this.legal = []; if (redraw) this.drawMarks(); }
  drawMarks(hint) {
    const a = this.app, b = a.board, k = this.kind; b.clearMarks();
    if (this.lastMove) { b.mark(k === 'chess' ? 'tile' : 'pad', b.cellPos(k, this.lastMove.from), 0xffd23c); b.mark(k === 'chess' ? 'tile' : 'pad', b.cellPos(k, this.lastMove.to), 0xffd23c); }
    if (this.sel >= 0) {
      b.mark(k === 'chess' ? 'square' : 'big', b.cellPos(k, this.sel), 0xffffff);
      if (a.settings.hints) for (const m of this.legal) { const cap = m.cap || (m.flag & F_EP); b.mark(cap ? 'ring' : 'dot', b.cellPos(k, m.to), cap ? 0xff3b5c : this.colorOf(this.pos.side)); }
    }
    if (this.pos.inCheck() && !this.over) { const ks = this.pos.kings[this.pos.side]; if (ks >= 0) b.mark('big', b.cellPos(k, ks), 0xff2040); }
    if (hint) { b.mark(k === 'chess' ? 'square' : 'big', b.cellPos(k, hint.from), 0x3bff8a); b.mark('ring', b.cellPos(k, hint.to), 0x3bff8a); }
  }
  /** play a move with animation + battle */
  async perform(mv) {
    const a = this.app, b = a.board, k = this.kind, tok = this.token;
    this.busy = true; a.toolsEnabled(false);
    const moverSide = this.pos.side; const wasHuman = this.humans.has(moverSide);
    this.deselect(false);
    const m = this.pos.play(mv);
    if (!m) { this.busy = false; this.drawMarks(); return; }
    this.ply++;
    const attacker = this.pieces.get(m.from);
    let capSq = m.cap ? m.to : -1;
    if (this.isChess && (m.flag & F_EP)) capSq = m.to + (moverSide === 1 ? 10 : -10);
    const victim = capSq >= 0 ? this.pieces.get(capSq) : null;
    const from = b.cellPos(k, m.from), to = b.cellPos(k, m.to);
    this.lastMove = m; b.clearMarks();
    if (victim && attacker) {
      const vals = this.isChess ? CHESS_VAL : XQ_VAL;
      const mode = a.battleMode({ human: wasHuman, value: vals[Math.abs(m.cap)], exchange: this.ply - this.lastCapPly <= 2, game: k });
      this.lastCapPly = this.ply; this.captures[moverSide]++;
      if (mode === 'off') {
        await this.slide(attacker, from, to, m);
        a.fx3d.shatter(victim.root.position.clone(), victim.color, { count: 24, height: victim.height }); a.audio.shatter(); a.audio.hit(0.4); victim.root.visible = false; a.board.ripple(to.x, to.z, 0.8);
      } else {
        await a.battle.play({ game: k, attacker, victim, from, to: k === 'chess' && (m.flag & F_EP) ? b.cellPos(k, capSq) : to, aType: Math.abs(m.p), vType: Math.abs(m.cap), aColor: attacker.color.getHex(), vColor: victim.color.getHex(), mode, aName: this.pieceName(m.p), vName: this.pieceName(m.cap), cam: a.camera });
        if (k === 'chess' && (m.flag & F_EP)) await this.slide(attacker, b.cellPos(k, capSq), to, m, 0.18);
      }
      if (tok !== this.token) return;
      if (wasHuman) a.say(this.humans.size === 1 ? 'captured' : null); else a.say('capture');
      victim.dispose(); this.pieces.delete(capSq);
    } else if (attacker) await this.slide(attacker, from, to, m);
    if (tok !== this.token) return;
    this.pieces.delete(m.from); this.pieces.set(m.to, attacker); if (attacker) attacker.root.position.copy(to);
    // castling rook
    if (this.isChess && (m.flag & F_CASTLE)) {
      const kside = cFile(m.to) === 6, r = cRank(m.to), rf = csq(kside ? 7 : 0, r), rt = csq(kside ? 5 : 3, r);
      const rook = this.pieces.get(rf); if (rook) { await this.slide(rook, b.cellPos(k, rf), b.cellPos(k, rt), { p: 4 }, 0.22); this.pieces.delete(rf); this.pieces.set(rt, rook); }
    }
    if (this.isChess && (m.flag & F_PROMO)) {
      attacker.dispose(); const np = this.addPiece(m.to, m.promo * moverSide); np.flash(2);
      a.fx3d.pillar(to.clone(), np.color.getHex(), { h: 4, r: 0.4, dur: 0.8 }); a.particles.burst(to.clone().setY(0.6), np.color, 60, { speed: 4, up: 4, life: 0.8, size: 1 });
      a.audio.levelUp ? a.audio.levelUp(64) : a.audio.home(); a.popupAt(to, a.t('promoted'), 'big');
    }
    if (wasHuman && this.cfg.mode === 'endless') this.playerMoves++;
    this.refreshHud(); this.drawMarks();
    // check / mate
    const st = this.pos.status();
    if (m.check && !st.over) {
      a.audio.check(); a.fx.kick({ trauma: 0.15, aberr: 0.5 }); const ks = this.pos.kings[this.pos.side]; const kp = this.pieces.get(ks); if (kp) kp.flash(1.2);
      a.waves.spawn(b.cellPos(k, ks).setY(0.03), new THREE.Color(0xff2040), { r0: 0.2, r1: 1.6, h: 0.5, dur: 0.5 });
      a.setStatus(a.t('check'), 'alert'); if (!wasHuman) a.say('check');
    }
    this.busy = false;
    if (this.checkObjective(st, wasHuman)) return;
    if (st.over) return this.end(st);
    this.nextTurn();
  }
  slide(pc, from, to, m, dur = 0.3) {
    const a = this.app, t = Math.abs(m.p), jump = (this.isChess && t === 2) || (!this.isChess && (t === 4 || t === 3)) ? 0.75 : 0.22;
    a.audio.move(); pc.cinematic = true;
    return a.tween(dur, (k) => { pc.root.position.lerpVectors(from, to, k); pc.body.position.y = Math.sin(k * Math.PI) * jump; }, 'inout').then(() => {
      pc.cinematic = false; pc.root.position.copy(to); a.audio.place(); a.particles.ring(to.clone().setY(0.04), pc.color, 18, 1.6, 0.04); a.board.ripple(to.x, to.z, 0.5);
    });
  }
  /** endless objectives; returns true when the floor resolved */
  checkObjective(st, wasHuman) {
    if (this.cfg.mode !== 'endless') return false;
    const s = this.cfg.spec, a = this.app;
    if (st.over) return false;    // rules result handled in end()
    if (s.type === 'rush' && this.captures[1] >= s.target) { this.finish('player', 'target'); return true; }
    if (wasHuman && (s.type === 'rush' || s.type === 'endgame') && this.playerMoves >= s.moveLimit) { this.finish('ai', s.type === 'rush' ? 'objective' : 'limit'); return true; }
    void a; void wasHuman; return false;
  }
  async end(st) {
    if (this.over) return; this.over = true;
    const a = this.app, b = a.board, k = this.kind;
    const winSide = st.result === 'draw' ? 0 : (st.result === 'white' || st.result === 'red') ? 1 : -1;
    if (st.reason === 'checkmate' || (st.reason === 'stalemate' && winSide !== 0)) {
      const loser = -winSide, ks = this.pos.kings[loser], kp = this.pieces.get(ks);
      a.setStatus(a.t(st.reason === 'checkmate' ? 'checkmate' : 'stalemate'), 'alert');
      a.audio.mate(); a.fx.kick({ trauma: 0.5, aberr: 1.2, glitch: 0.6, slowmo: 1.2 }); a.ui.flash('rgba(255,30,60,0.35)', 500);
      a.ui.banner(a.t(st.reason === 'checkmate' ? 'checkmate' : 'stalemate'), st.reason === 'checkmate' ? 'CHECKMATE' : 'STALEMATE', '');
      if (kp) { kp.flash(2); await a.wait(0.5); a.fx3d.shatter(kp.root.position.clone(), kp.color, { count: 90, height: kp.height, speed: 5, up: 4 }); a.fx3d.pillar(kp.root.position.clone(), 0xff2040, { h: 6, dur: 1.2 }); a.waves.spawn(b.cellPos(k, ks).setY(0.03), new THREE.Color(0xff2040), { r0: 0.3, r1: 5, h: 1, dur: 0.9 }); a.audio.finisher(); a.audio.shatter(); kp.root.visible = false; }
      await a.wait(1.3);
    } else { a.ui.banner(a.t('draw'), 'DRAW', a.t('r.' + st.reason)); a.setStatus(a.t('draw')); await a.wait(1.2); }
    let who;
    if (this.cfg.mode === 'local' || this.cfg.mode === 'demo') who = winSide === 0 ? 'draw' : winSide === 1 ? 'a' : 'b';
    else who = winSide === 1 ? 'player' : winSide === -1 ? 'ai' : 'draw';
    this.finish(who, st.reason, true);
  }
  finish(who, reason, already) {
    this.over = true; this.token++;
    const a = this.app; a.board.clearMarks();
    a.gameOver({ who, reason, stats: { captures: this.captures[1], moves: Math.ceil(this.ply / 2) }, names: [this.sideName(1), this.sideName(-1)] });
    void already;
  }
  canUndo() { return !this.busy && !this.over && this.pos.moves.length > 0 && this.humanTurn(); }
  undo() {
    if (!this.canUndo()) return false;
    const n = this.cfg.mode === 'local' ? 1 : (this.pos.moves.length >= 2 ? 2 : 1);
    for (let i = 0; i < n; i++) { const m = this.pos.undo(); if (m && this.cfg.mode === 'endless' && this.humans.has(Math.sign(m.p))) this.playerMoves = Math.max(0, this.playerMoves - 1); }
    this.lastMove = this.pos.moves[this.pos.moves.length - 1] || null; this.captures = { 1: 0, '-1': 0 };
    for (const mm of this.pos.moves) if (mm.cap) this.captures[Math.sign(mm.p)]++;
    this.sync(); this.deselect(); this.refreshHud(); this.nextTurn(); return true;
  }
  async hint() {
    if (!this.humanTurn() || this.busy) return;
    const a = this.app; a.setStatus(a.t('thinking', { n: 'AI' }), 'think');
    const res = await a.think({ game: this.kind, fen: this.pos.fen(), hist: this.pos.hist, opts: { maxDepth: 5, timeMs: 700 } });
    if (!res || !res.move || this.over) return;
    this.drawMarks(res.move); a.setStatus(a.t('yourTurn'));
    const pc = this.pieces.get(res.move.from); if (pc) pc.flash(1);
  }
  update(dt, t, frozen) { for (const p of this.pieces.values()) p.update(dt, t, frozen); }
  dispose() { this.token++; for (const p of this.pieces.values()) p.dispose(); this.pieces.clear(); }
}
