// CYBER BOARD — International chess rules (pure, no DOM). Written from scratch for this project.
// 10x12 mailbox board. Pieces: P=1 N=2 B=3 R=4 Q=5 K=6, white > 0, black < 0, OFF = 99.
// Full rules: castling, en passant, promotion (choice), check / checkmate / stalemate,
// draws by threefold repetition, 50-move rule and insufficient material.
export const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, OFF = 99;
export const WHITE = 1, BLACK = -1;
export const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4, F_PROMO = 8;
export const VALUE = [0, 100, 320, 330, 500, 900, 20000];
export const NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const N_OFF = [-21, -19, -12, -8, 8, 12, 19, 21];
const K_OFF = [-11, -10, -9, -1, 1, 9, 10, 11];
const B_DIR = [-11, -9, 9, 11];
const R_DIR = [-10, -1, 1, 10];

// square helpers: file 0..7 (a..h), rank 0..7 (1..8)
export const sq = (f, r) => 21 + f + (7 - r) * 10;
export const fileOf = (s) => (s - 21) % 10;
export const rankOf = (s) => 7 - Math.floor((s - 21) / 10);
export const onBoard = (s) => s >= 21 && s <= 98 && (s % 10) >= 1 && (s % 10) <= 8;
export const sqName = (s) => 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1);
export const parseSq = (n) => sq(n.charCodeAt(0) - 97, +n[1] - 1);
export const ALL_SQ = []; for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) ALL_SQ.push(sq(f, r));

// castling-rights mask per square (rights kept when neither from nor to touches the square)
const CASTLE_MASK = new Int8Array(120).fill(15);
CASTLE_MASK[sq(4, 0)] = 15 & ~3; CASTLE_MASK[sq(7, 0)] = 15 & ~1; CASTLE_MASK[sq(0, 0)] = 15 & ~2;
CASTLE_MASK[sq(4, 7)] = 15 & ~12; CASTLE_MASK[sq(7, 7)] = 15 & ~4; CASTLE_MASK[sq(0, 7)] = 15 & ~8;

// Zobrist keys (two 32-bit halves), deterministic PRNG
let seed = 0x9e3779b9;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const ZP = [[], []]; for (let h = 0; h < 2; h++) for (let p = 0; p < 13; p++) { ZP[h][p] = new Uint32Array(120); for (let s = 0; s < 120; s++) ZP[h][p][s] = rnd(); }
const ZSIDE = [rnd(), rnd()];
const ZC = [new Uint32Array(16), new Uint32Array(16)]; for (let h = 0; h < 2; h++) for (let i = 0; i < 16; i++) ZC[h][i] = rnd();
const ZEP = [new Uint32Array(120), new Uint32Array(120)]; for (let h = 0; h < 2; h++) for (let i = 0; i < 120; i++) ZEP[h][i] = rnd();

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class Chess {
  constructor(fen = START_FEN) { this.startFen = fen; this.load(fen); }
  load(fen) {
    const b = this.b = new Int8Array(120).fill(OFF);
    for (const s of ALL_SQ) b[s] = 0;
    const [pl, side, cas, ep, half, full] = fen.trim().split(/\s+/);
    let r = 7, f = 0;
    for (const ch of pl) {
      if (ch === '/') { r--; f = 0; continue; }
      if (ch >= '1' && ch <= '8') { f += +ch; continue; }
      const t = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
      b[sq(f, r)] = ch === ch.toUpperCase() ? t : -t; f++;
    }
    this.side = side === 'b' ? BLACK : WHITE;
    this.castle = 0;
    if (cas && cas !== '-') { if (cas.includes('K')) this.castle |= 1; if (cas.includes('Q')) this.castle |= 2; if (cas.includes('k')) this.castle |= 4; if (cas.includes('q')) this.castle |= 8; }
    this.ep = ep && ep !== '-' ? parseSq(ep) : 0;
    this.half = +(half || 0); this.full = +(full || 1);
    this.kings = { 1: 0, '-1': 0 };
    for (const s of ALL_SQ) { if (b[s] === K) this.kings[1] = s; else if (b[s] === -K) this.kings[-1] = s; }
    this.stack = [];
    this.computeHash();
    this.hist = [this.h0 + ':' + this.h1];   // position keys since game start (for repetition)
    this.moves = [];                          // played moves (for UI / undo)
    return this;
  }
  computeHash() {
    let a = 0, c = 0;
    for (const s of ALL_SQ) { const p = this.b[s]; if (p) { a ^= ZP[0][p + 6][s]; c ^= ZP[1][p + 6][s]; } }
    if (this.side === BLACK) { a ^= ZSIDE[0]; c ^= ZSIDE[1]; }
    a ^= ZC[0][this.castle]; c ^= ZC[1][this.castle];
    if (this.ep) { a ^= ZEP[0][this.ep]; c ^= ZEP[1][this.ep]; }
    this.h0 = a >>> 0; this.h1 = c >>> 0;
  }
  get key() { return this.h0 + ':' + this.h1; }
  fen() {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.b[sq(f, r)];
        if (!p) { e++; continue; }
        if (e) { out += e; e = 0; }
        const ch = ' pnbrqk'[Math.abs(p)]; out += p > 0 ? ch.toUpperCase() : ch;
      }
      if (e) out += e; if (r) out += '/';
    }
    let cas = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : '');
    return `${out} ${this.side === WHITE ? 'w' : 'b'} ${cas || '-'} ${this.ep ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }
  clone() { const c = new Chess(this.fen()); c.startFen = this.startFen; c.hist = this.hist.slice(); c.moves = this.moves.slice(); return c; }

  /** is square s attacked by side `by` */
  attacked(s, by) {
    const b = this.b;
    // pawns: a white pawn attacks s from s+9 / s+11 (one rank below)
    if (by === WHITE) { if (b[s + 9] === P || b[s + 11] === P) return true; }
    else { if (b[s - 9] === -P || b[s - 11] === -P) return true; }
    const n = N * by, k = K * by, bi = B * by, ro = R * by, q = Q * by;
    for (const o of N_OFF) if (b[s + o] === n) return true;
    for (const o of K_OFF) if (b[s + o] === k) return true;
    for (const d of B_DIR) { let t = s + d; while (b[t] === 0) t += d; if (b[t] === bi || b[t] === q) return true; }
    for (const d of R_DIR) { let t = s + d; while (b[t] === 0) t += d; if (b[t] === ro || b[t] === q) return true; }
    return false;
  }
  inCheck(side = this.side) { return this.attacked(this.kings[side], -side); }

  /** pseudo-legal moves for side to move (capturesOnly for quiescence) */
  pseudo(capturesOnly = false) {
    const b = this.b, us = this.side, out = [];
    const add = (from, to, p, cap, flag = 0, promo = 0) => out.push({ from, to, p, cap, flag, promo });
    for (const s of ALL_SQ) {
      const p = b[s]; if (!p || (p > 0) !== (us > 0)) continue;
      const t = p * us;
      if (t === P) {
        const fwd = us === WHITE ? -10 : 10, r = rankOf(s), startR = us === WHITE ? 1 : 6, promoR = us === WHITE ? 6 : 1;
        const one = s + fwd;
        if (b[one] === 0) {
          if (r === promoR) { for (const pr of [Q, R, B, N]) add(s, one, p, 0, F_PROMO, pr); }
          else if (!capturesOnly) {
            add(s, one, p, 0);
            if (r === startR && b[one + fwd] === 0) add(s, one + fwd, p, 0, F_DOUBLE);
          }
        }
        for (const c of [fwd - 1, fwd + 1]) {
          const to = s + c, v = b[to];
          if (v !== OFF && v !== 0 && (v > 0) !== (us > 0)) {
            if (r === promoR) { for (const pr of [Q, R, B, N]) add(s, to, p, v, F_PROMO, pr); } else add(s, to, p, v);
          } else if (to === this.ep && this.ep) add(s, to, p, -us * P, F_EP);
        }
      } else if (t === N || t === K) {
        for (const o of (t === N ? N_OFF : K_OFF)) {
          const to = s + o, v = b[to];
          if (v === OFF) continue;
          if (v === 0) { if (!capturesOnly) add(s, to, p, 0); }
          else if ((v > 0) !== (us > 0)) add(s, to, p, v);
        }
        if (t === K && !capturesOnly) this.castles(s, add, p);
      } else {
        const dirs = t === B ? B_DIR : t === R ? R_DIR : K_OFF;
        for (const d of dirs) {
          let to = s + d;
          while (b[to] === 0) { if (!capturesOnly) add(s, to, p, 0); to += d; }
          const v = b[to];
          if (v !== OFF && (v > 0) !== (us > 0)) add(s, to, p, v);
        }
      }
    }
    return out;
  }
  castles(s, add, p) {
    const b = this.b, us = this.side, them = -us;
    if (us === WHITE && s === sq(4, 0)) {
      if ((this.castle & 1) && b[sq(5, 0)] === 0 && b[sq(6, 0)] === 0 && b[sq(7, 0)] === R && !this.attacked(s, them) && !this.attacked(sq(5, 0), them) && !this.attacked(sq(6, 0), them)) add(s, sq(6, 0), p, 0, F_CASTLE);
      if ((this.castle & 2) && b[sq(3, 0)] === 0 && b[sq(2, 0)] === 0 && b[sq(1, 0)] === 0 && b[sq(0, 0)] === R && !this.attacked(s, them) && !this.attacked(sq(3, 0), them) && !this.attacked(sq(2, 0), them)) add(s, sq(2, 0), p, 0, F_CASTLE);
    } else if (us === BLACK && s === sq(4, 7)) {
      if ((this.castle & 4) && b[sq(5, 7)] === 0 && b[sq(6, 7)] === 0 && b[sq(7, 7)] === -R && !this.attacked(s, them) && !this.attacked(sq(5, 7), them) && !this.attacked(sq(6, 7), them)) add(s, sq(6, 7), p, 0, F_CASTLE);
      if ((this.castle & 8) && b[sq(3, 7)] === 0 && b[sq(2, 7)] === 0 && b[sq(1, 7)] === 0 && b[sq(0, 7)] === -R && !this.attacked(s, them) && !this.attacked(sq(3, 7), them) && !this.attacked(sq(2, 7), them)) add(s, sq(2, 7), p, 0, F_CASTLE);
    }
  }
  /** make a move (pseudo-legal ok). Returns true if it leaves own king safe; always pushes undo info. */
  make(m) {
    const b = this.b, us = this.side;
    this.stack.push({ castle: this.castle, ep: this.ep, half: this.half, h0: this.h0, h1: this.h1, m });
    let h0 = this.h0, h1 = this.h1;
    const zx = (p, s) => { h0 ^= ZP[0][p + 6][s]; h1 ^= ZP[1][p + 6][s]; };
    if (this.ep) { h0 ^= ZEP[0][this.ep]; h1 ^= ZEP[1][this.ep]; }
    h0 ^= ZC[0][this.castle]; h1 ^= ZC[1][this.castle];
    zx(m.p, m.from); b[m.from] = 0;
    if (m.flag & F_EP) { const cs = m.to + (us === WHITE ? 10 : -10); zx(b[cs], cs); b[cs] = 0; }
    else if (m.cap) zx(b[m.to], m.to);
    const placed = m.flag & F_PROMO ? m.promo * us : m.p;
    b[m.to] = placed; zx(placed, m.to);
    if (m.flag & F_CASTLE) {
      const kside = fileOf(m.to) === 6, r = rankOf(m.to);
      const rf = sq(kside ? 7 : 0, r), rt = sq(kside ? 5 : 3, r);
      zx(b[rf], rf); b[rt] = b[rf]; b[rf] = 0; zx(b[rt], rt);
    }
    if (Math.abs(m.p) === K) this.kings[us] = m.to;
    this.castle &= CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
    this.ep = m.flag & F_DOUBLE ? (m.from + m.to) / 2 : 0;
    if (this.ep) { h0 ^= ZEP[0][this.ep]; h1 ^= ZEP[1][this.ep]; }
    h0 ^= ZC[0][this.castle]; h1 ^= ZC[1][this.castle];
    h0 ^= ZSIDE[0]; h1 ^= ZSIDE[1];
    this.h0 = h0 >>> 0; this.h1 = h1 >>> 0;
    this.half = (Math.abs(m.p) === P || m.cap) ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side = -us;
    return !this.attacked(this.kings[us], -us);
  }
  unmake() {
    const u = this.stack.pop(), m = u.m, b = this.b;
    this.side = -this.side; const us = this.side;
    if (us === BLACK) this.full--;
    b[m.from] = m.p;
    if (m.flag & F_EP) { b[m.to] = 0; b[m.to + (us === WHITE ? 10 : -10)] = -us * P; }
    else b[m.to] = m.cap;
    if (m.flag & F_CASTLE) {
      const kside = fileOf(m.to) === 6, r = rankOf(m.to);
      b[sq(kside ? 7 : 0, r)] = b[sq(kside ? 5 : 3, r)]; b[sq(kside ? 5 : 3, r)] = 0;
    }
    if (Math.abs(m.p) === K) this.kings[us] = m.from;
    this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.h0 = u.h0; this.h1 = u.h1;
  }
  /** null move for search */
  makeNull() { this.stack.push({ castle: this.castle, ep: this.ep, half: this.half, h0: this.h0, h1: this.h1, m: null }); let h0 = this.h0 ^ ZSIDE[0], h1 = this.h1 ^ ZSIDE[1]; if (this.ep) { h0 ^= ZEP[0][this.ep]; h1 ^= ZEP[1][this.ep]; } this.ep = 0; this.h0 = h0 >>> 0; this.h1 = h1 >>> 0; this.side = -this.side; }
  unmakeNull() { const u = this.stack.pop(); this.side = -this.side; this.castle = u.castle; this.ep = u.ep; this.half = u.half; this.h0 = u.h0; this.h1 = u.h1; }

  legal() {
    const out = [];
    for (const m of this.pseudo()) { if (this.make(m)) out.push(m); this.unmake(); }
    return out;
  }
  legalFrom(s) { return this.legal().filter((m) => m.from === s); }
  /** play a legal move in the game (records history for repetition / undo). m may be {from,to,promo} */
  play(mv) {
    const m = this.legal().find((x) => x.from === mv.from && x.to === mv.to && (!(x.flag & F_PROMO) || x.promo === (mv.promo || Q)));
    if (!m) return null;
    m.san = this.san(m);
    this.make(m); this.stack.length = 0;
    this.hist.push(this.key); this.moves.push(m);
    m.check = this.inCheck();
    return m;
  }
  /** undo the last played move (rebuilds from history) */
  undo() {
    if (!this.moves.length) return null;
    const moves = this.moves.slice(0, -1), last = this.moves[this.moves.length - 1];
    const start = this.startFen || START_FEN;
    this.load(start);
    for (const m of moves) this.play({ from: m.from, to: m.to, promo: m.promo });
    return last;
  }
  san(m) {
    const t = Math.abs(m.p);
    if (m.flag & F_CASTLE) return fileOf(m.to) === 6 ? 'O-O' : 'O-O-O';
    let s = '';
    if (t !== P) {
      s += ' NBRQK'[t - 1];
      const others = this.legal().filter((x) => x !== m && Math.abs(x.p) === t && x.to === m.to && x.from !== m.from);
      if (others.length) {
        if (!others.some((x) => fileOf(x.from) === fileOf(m.from))) s += 'abcdefgh'[fileOf(m.from)];
        else if (!others.some((x) => rankOf(x.from) === rankOf(m.from))) s += rankOf(m.from) + 1;
        else s += sqName(m.from);
      }
    } else if (m.cap) s += 'abcdefgh'[fileOf(m.from)];
    if (m.cap) s += 'x';
    s += sqName(m.to);
    if (m.flag & F_PROMO) s += '=' + ' NBRQ'[m.promo - 1];
    return s;
  }
  insufficient() {
    const minors = []; let other = 0;
    for (const s of ALL_SQ) {
      const p = Math.abs(this.b[s]);
      if (!p || p === K) continue;
      if (p === N || p === B) minors.push({ p, s, side: Math.sign(this.b[s]) }); else other++;
    }
    if (other) return false;
    if (minors.length <= 1) return true;
    // only bishops, all on the same square colour
    if (minors.every((x) => x.p === B)) { const c = (fileOf(minors[0].s) + rankOf(minors[0].s)) & 1; return minors.every((x) => ((fileOf(x.s) + rankOf(x.s)) & 1) === c); }
    return false;
  }
  repetitions() { const k = this.key; let n = 0; for (const h of this.hist) if (h === k) n++; return n; }
  /** game status: { over, result: 'white'|'black'|'draw', reason } */
  status() {
    const moves = this.legal();
    if (!moves.length) return this.inCheck() ? { over: true, result: this.side === WHITE ? 'black' : 'white', reason: 'checkmate' } : { over: true, result: 'draw', reason: 'stalemate' };
    if (this.insufficient()) return { over: true, result: 'draw', reason: 'material' };
    if (this.half >= 100) return { over: true, result: 'draw', reason: 'fifty' };
    if (this.repetitions() >= 3) return { over: true, result: 'draw', reason: 'repetition' };
    return { over: false, check: this.inCheck(), moves };
  }
  /** list of {sq, p} for rendering */
  pieces() { const out = []; for (const s of ALL_SQ) if (this.b[s]) out.push({ sq: s, p: this.b[s] }); return out; }
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pos.pseudo()) {
    if (pos.make(m)) n += depth === 1 ? 1 : perft(pos, depth - 1);
    pos.unmake();
  }
  return n;
}
