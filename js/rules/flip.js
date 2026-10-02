// CYBER BOARD — FLIP 翻轉棋 (reversi-style disc game). Pure rules, no DOM. Written from scratch.
// 8x8 board, index = r * 8 + c. 1 = cyan (moves first), -1 = magenta, 0 = empty, 2 = void (blocked cell, endless variants).
// A move must outflank at least one enemy line; all outflanked discs flip. No move = pass; neither side can move = end.
export const SIZE = 8, VOID = 2;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
export const corner = (i) => i === 0 || i === 7 || i === 56 || i === 63;

export class Flip {
  constructor(voids = []) {
    this.b = new Int8Array(64);
    for (const v of voids) this.b[v] = VOID;
    this.b[27] = -1; this.b[28] = 1; this.b[35] = 1; this.b[36] = -1;
    this.side = 1; this.passes = 0; this.history = []; this.lastMove = null;
  }
  clone() { const f = new Flip(); f.b = this.b.slice(); f.side = this.side; f.passes = this.passes; f.history = this.history.slice(); return f; }
  /** discs flipped if `side` plays at i (empty array = illegal) */
  flipsFor(i, side = this.side) {
    const b = this.b; if (b[i] !== 0) return [];
    const r0 = i >> 3, c0 = i & 7, out = [];
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr, c = c0 + dc; const line = [];
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === -side) { line.push(r * 8 + c); r += dr; c += dc; }
      if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === side) out.push(...line);
    }
    return out;
  }
  /** flips grouped by direction (ordered outward) — used for chain-lightning cascades */
  flipLines(i, side = this.side) {
    const b = this.b, r0 = i >> 3, c0 = i & 7, out = [];
    for (const [dr, dc] of DIRS) {
      let r = r0 + dr, c = c0 + dc; const line = [];
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === -side) { line.push(r * 8 + c); r += dr; c += dc; }
      if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === side) out.push(line);
    }
    return out;
  }
  moves(side = this.side) { const out = []; for (let i = 0; i < 64; i++) if (this.b[i] === 0 && this.flipsFor(i, side).length) out.push(i); return out; }
  /** play at i for side to move; returns { i, flips, lines } or null */
  play(i) {
    const lines = this.flipLines(i); if (!lines.length || this.b[i] !== 0) return null;
    const flips = lines.flat();
    this.history.push({ b: this.b.slice(), side: this.side, passes: this.passes });
    this.b[i] = this.side; for (const f of flips) this.b[f] = this.side;
    this.side = -this.side; this.passes = 0; this.lastMove = i;
    return { i, flips, lines, side: -this.side };
  }
  /** side to move has no move: pass (only legal when moves() is empty) */
  pass() { if (this.moves().length) return false; this.history.push({ b: this.b.slice(), side: this.side, passes: this.passes }); this.side = -this.side; this.passes++; return true; }
  undo() { const h = this.history.pop(); if (!h) return false; this.b = h.b; this.side = h.side; this.passes = h.passes; return true; }
  count() { let a = 0, m = 0, e = 0; for (let i = 0; i < 64; i++) { if (this.b[i] === 1) a++; else if (this.b[i] === -1) m++; else if (this.b[i] === 0) e++; } return { 1: a, '-1': m, empty: e }; }
  status() {
    const mine = this.moves().length, theirs = this.moves(-this.side).length;
    const c = this.count();
    if (!mine && !theirs) return { over: true, result: c[1] > c[-1] ? 1 : c[-1] > c[1] ? -1 : 0, count: c };
    return { over: false, mustPass: !mine, count: c };
  }
}

/** symmetric random voids for endless variants (never touching the centre 4) */
export function randomVoids(n, rng = Math.random) {
  const out = new Set(), centre = new Set([27, 28, 35, 36, 18, 19, 20, 21, 26, 29, 34, 37, 42, 43, 44, 45]);
  let guard = 0;
  while (out.size < n && guard++ < 200) {
    const r = Math.floor(rng() * 8), c = Math.floor(rng() * 8), i = r * 8 + c, j = (7 - r) * 8 + (7 - c);
    if (centre.has(i) || corner(i)) continue;
    out.add(i); out.add(j);
  }
  return [...out];
}
