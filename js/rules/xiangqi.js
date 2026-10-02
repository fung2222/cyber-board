// CYBER BOARD — Chinese chess (Xiangqi) rules (pure, no DOM). Written from scratch for this project.
// Board 9 files x 10 ranks, index = rank * 9 + file. Rank 0 = Red's back rank (bottom), rank 9 = Black's.
// Pieces: K=1 帥/將 general, A=2 仕/士 advisor, B=3 相/象 elephant, N=4 傌/馬 horse, R=5 俥/車 chariot,
// C=6 炮/砲 cannon, P=7 兵/卒 soldier. Red > 0 (moves first), Black < 0.
// Rules: palace, river, flying-general rule, cannon screen capture, horse-leg block, elephant-eye block.
// No legal move = loss for the side to move (checkmate AND stalemate). Draws (simplified, documented):
// threefold repetition, 120 plies without capture, or no attacking pieces left on either side.
export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
export const RED = 1, BLACK = -1;
export const VALUE = [0, 10000, 120, 120, 270, 600, 285, 70];
export const NAMES = ['', 'general', 'advisor', 'elephant', 'horse', 'chariot', 'cannon', 'soldier'];
export const GLYPH = { 1: ['帥', '將'], 2: ['仕', '士'], 3: ['相', '象'], 4: ['傌', '馬'], 5: ['俥', '車'], 6: ['炮', '砲'], 7: ['兵', '卒'] };
export const idx = (f, r) => r * 9 + f;
export const fileOf = (s) => s % 9;
export const rankOf = (s) => (s / 9) | 0;
export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
const LETTER = { k: K, a: A, b: B, e: B, n: N, h: N, r: R, c: C, p: P };
const inPalace = (side, f, r) => f >= 3 && f <= 5 && (side === RED ? r >= 0 && r <= 2 : r >= 7 && r <= 9);
const ownHalf = (side, r) => side === RED ? r <= 4 : r >= 5;

// Zobrist
let seed = 0x2545f491;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
const Z = [[], []]; for (let h = 0; h < 2; h++) for (let p = 0; p < 15; p++) { Z[h][p] = new Uint32Array(90); for (let s = 0; s < 90; s++) Z[h][p][s] = rnd(); }
const ZS = [rnd(), rnd()];

// precomputed step tables
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HORSE = []; // per square: [{to, leg}]
const ELE = [];   // per square: [{to, eye}]
for (let s = 0; s < 90; s++) {
  const f = fileOf(s), r = rankOf(s);
  HORSE[s] = [];
  for (const [df, dr] of [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) {
    const tf = f + df, tr = r + dr; if (tf < 0 || tf > 8 || tr < 0 || tr > 9) continue;
    const leg = Math.abs(dr) === 2 ? idx(f, r + Math.sign(dr)) : idx(f + Math.sign(df), r);
    HORSE[s].push({ to: idx(tf, tr), leg });
  }
  ELE[s] = [];
  for (const [df, dr] of DIAG) {
    const tf = f + 2 * df, tr = r + 2 * dr; if (tf < 0 || tf > 8 || tr < 0 || tr > 9) continue;
    ELE[s].push({ to: idx(tf, tr), eye: idx(f + df, r + dr) });
  }
}

export class Xiangqi {
  constructor(fen = START_FEN) { this.startFen = fen; this.load(fen); }
  load(fen) {
    const b = this.b = new Int8Array(90);
    const [pl, side, , , half, full] = fen.trim().split(/\s+/);
    let r = 9, f = 0;
    for (const ch of pl) {
      if (ch === '/') { r--; f = 0; continue; }
      if (ch >= '1' && ch <= '9') { f += +ch; continue; }
      const t = LETTER[ch.toLowerCase()];
      b[idx(f, r)] = ch === ch.toUpperCase() ? t : -t; f++;
    }
    this.side = side === 'b' ? BLACK : RED;
    this.half = +(half || 0); this.full = +(full || 1);
    this.kings = { 1: -1, '-1': -1 };
    for (let s = 0; s < 90; s++) { if (b[s] === K) this.kings[1] = s; else if (b[s] === -K) this.kings[-1] = s; }
    this.stack = []; this.computeHash();
    this.hist = [this.key]; this.moves = [];
    return this;
  }
  computeHash() { let a = 0, c = 0; for (let s = 0; s < 90; s++) { const p = this.b[s]; if (p) { a ^= Z[0][p + 7][s]; c ^= Z[1][p + 7][s]; } } if (this.side === BLACK) { a ^= ZS[0]; c ^= ZS[1]; } this.h0 = a >>> 0; this.h1 = c >>> 0; }
  get key() { return this.h0 + ':' + this.h1; }
  fen() {
    let out = '';
    for (let r = 9; r >= 0; r--) {
      let e = 0;
      for (let f = 0; f < 9; f++) { const p = this.b[idx(f, r)]; if (!p) { e++; continue; } if (e) { out += e; e = 0; } const ch = ' kabnrcp'[Math.abs(p)]; out += p > 0 ? ch.toUpperCase() : ch; }
      if (e) out += e; if (r) out += '/';
    }
    return `${out} ${this.side === RED ? 'w' : 'b'} - - ${this.half} ${this.full}`;
  }
  clone() { const c = new Xiangqi(this.fen()); c.startFen = this.startFen; c.hist = this.hist.slice(); c.moves = this.moves.slice(); return c; }

  /** is `side`'s general attacked (including the flying-general rule) */
  inCheck(side = this.side) {
    const b = this.b, ks = this.kings[side]; if (ks < 0) return true;
    const them = -side, kf = fileOf(ks), kr = rankOf(ks);
    // rook / cannon / flying general along lines
    for (const [df, dr] of ORTH) {
      let f = kf + df, r = kr + dr, screens = 0;
      while (f >= 0 && f <= 8 && r >= 0 && r <= 9) {
        const p = b[idx(f, r)];
        if (p) {
          if (screens === 0) { if (p === R * them || (p === K * them && df === 0)) return true; screens = 1; }
          else { if (p === C * them) return true; break; }
        }
        f += df; r += dr;
      }
    }
    // horses: attacker at king + (±1,±2)/(±2,±1); its leg is the king's diagonal neighbour in that quadrant
    for (const [df, dr] of [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]) {
      const hf = kf + df, hr = kr + dr; if (hf < 0 || hf > 8 || hr < 0 || hr > 9) continue;
      if (b[idx(hf, hr)] !== N * them) continue;
      if (b[idx(kf + Math.sign(df), kr + Math.sign(dr))] === 0) return true;
    }
    // soldiers: enemy soldier in front of the king or beside it
    const fwdOfEnemy = them === RED ? 1 : -1;  // direction the enemy soldier moves
    const pr = kr - fwdOfEnemy; if (pr >= 0 && pr <= 9 && b[idx(kf, pr)] === P * them) return true;
    if (kf > 0 && b[idx(kf - 1, kr)] === P * them) return true;
    if (kf < 8 && b[idx(kf + 1, kr)] === P * them) return true;
    return false;
  }
  pseudo(capturesOnly = false) {
    const b = this.b, us = this.side, out = [];
    const add = (from, to, p) => { const v = b[to]; if (v && (v > 0) === (us > 0)) return; if (capturesOnly && !v) return; out.push({ from, to, p, cap: v }); };
    for (let s = 0; s < 90; s++) {
      const p = b[s]; if (!p || (p > 0) !== (us > 0)) continue;
      const t = p * us, f = fileOf(s), r = rankOf(s);
      switch (t) {
        case K: for (const [df, dr] of ORTH) { const tf = f + df, tr = r + dr; if (inPalace(us, tf, tr)) add(s, idx(tf, tr), p); } break;
        case A: for (const [df, dr] of DIAG) { const tf = f + df, tr = r + dr; if (inPalace(us, tf, tr)) add(s, idx(tf, tr), p); } break;
        case B: for (const e of ELE[s]) if (ownHalf(us, rankOf(e.to)) && b[e.eye] === 0) add(s, e.to, p); break;
        case N: for (const h of HORSE[s]) if (b[h.leg] === 0) add(s, h.to, p); break;
        case R: case C:
          for (const [df, dr] of ORTH) {
            let tf = f + df, tr = r + dr, jumped = false;
            while (tf >= 0 && tf <= 8 && tr >= 0 && tr <= 9) {
              const to = idx(tf, tr), v = b[to];
              if (!jumped) {
                if (!v) { if (!capturesOnly) out.push({ from: s, to, p, cap: 0 }); }
                else if (t === R) { if ((v > 0) !== (us > 0)) out.push({ from: s, to, p, cap: v }); break; }
                else jumped = true;
              } else if (v) { if ((v > 0) !== (us > 0)) out.push({ from: s, to, p, cap: v }); break; }
              tf += df; tr += dr;
            }
          }
          break;
        case P: {
          const fwd = us === RED ? 1 : -1, tr = r + fwd;
          if (tr >= 0 && tr <= 9) add(s, idx(f, tr), p);
          if (!ownHalf(us, r)) { if (f > 0) add(s, idx(f - 1, r), p); if (f < 8) add(s, idx(f + 1, r), p); }
          break;
        }
      }
    }
    return out;
  }
  make(m) {
    const b = this.b, us = this.side;
    this.stack.push({ half: this.half, h0: this.h0, h1: this.h1, m });
    let h0 = this.h0 ^ Z[0][m.p + 7][m.from] ^ Z[0][m.p + 7][m.to] ^ ZS[0], h1 = this.h1 ^ Z[1][m.p + 7][m.from] ^ Z[1][m.p + 7][m.to] ^ ZS[1];
    if (m.cap) { h0 ^= Z[0][m.cap + 7][m.to]; h1 ^= Z[1][m.cap + 7][m.to]; }
    b[m.from] = 0; b[m.to] = m.p;
    if (m.p * us === K) this.kings[us] = m.to;
    if (m.cap === -us * K) this.kings[-us] = -1;
    this.h0 = h0 >>> 0; this.h1 = h1 >>> 0;
    this.half = m.cap ? 0 : this.half + 1;
    if (us === BLACK) this.full++;
    this.side = -us;
    return !this.inCheck(us);
  }
  unmake() {
    const u = this.stack.pop(), m = u.m, b = this.b;
    this.side = -this.side; const us = this.side;
    if (us === BLACK) this.full--;
    b[m.from] = m.p; b[m.to] = m.cap;
    if (m.p * us === K) this.kings[us] = m.from;
    if (m.cap === -us * K) this.kings[-us] = m.to;
    this.half = u.half; this.h0 = u.h0; this.h1 = u.h1;
  }
  makeNull() { this.stack.push({ half: this.half, h0: this.h0, h1: this.h1, m: null }); this.h0 = (this.h0 ^ ZS[0]) >>> 0; this.h1 = (this.h1 ^ ZS[1]) >>> 0; this.side = -this.side; }
  unmakeNull() { const u = this.stack.pop(); this.side = -this.side; this.half = u.half; this.h0 = u.h0; this.h1 = u.h1; }
  legal() { const out = []; for (const m of this.pseudo()) { if (this.make(m)) out.push(m); this.unmake(); } return out; }
  legalFrom(s) { return this.legal().filter((m) => m.from === s); }
  play(mv) {
    const m = this.legal().find((x) => x.from === mv.from && x.to === mv.to);
    if (!m) return null;
    this.make(m); this.stack.length = 0; this.hist.push(this.key); this.moves.push(m);
    m.check = this.inCheck();
    return m;
  }
  undo() {
    if (!this.moves.length) return null;
    const moves = this.moves.slice(0, -1), last = this.moves[this.moves.length - 1];
    this.load(this.startFen);
    for (const m of moves) this.play(m);
    return last;
  }
  repetitions() { const k = this.key; let n = 0; for (const h of this.hist) if (h === k) n++; return n; }
  noAttackers() { for (let s = 0; s < 90; s++) { const t = Math.abs(this.b[s]); if (t === R || t === N || t === C || t === P) return false; } return true; }
  status() {
    const moves = this.legal();
    if (!moves.length) return { over: true, result: this.side === RED ? 'black' : 'red', reason: this.inCheck() ? 'checkmate' : 'stalemate' };
    if (this.noAttackers()) return { over: true, result: 'draw', reason: 'material' };
    if (this.half >= 120) return { over: true, result: 'draw', reason: 'fifty' };
    if (this.repetitions() >= 3) return { over: true, result: 'draw', reason: 'repetition' };
    return { over: false, check: this.inCheck(), moves };
  }
  pieces() { const out = []; for (let s = 0; s < 90; s++) if (this.b[s]) out.push({ sq: s, p: this.b[s] }); return out; }
}

export function perft(pos, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of pos.pseudo()) { if (pos.make(m)) n += depth === 1 ? 1 : perft(pos, depth - 1); pos.unmake(); }
  return n;
}
