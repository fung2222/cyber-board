// FLIP AI: negamax alpha-beta with positional weights + mobility + corner control; exact endgame solve.
import { Flip, VOID } from '../rules/flip.js';
const WEIGHTS = [
  120, -25, 20, 6, 6, 20, -25, 120,
  -25, -45, -4, -4, -4, -4, -45, -25,
  20, -4, 12, 3, 3, 12, -4, 20,
  6, -4, 3, 2, 2, 3, -4, 6,
  6, -4, 3, 2, 2, 3, -4, 6,
  20, -4, 12, 3, 3, 12, -4, 20,
  -25, -45, -4, -4, -4, -4, -45, -25,
  120, -25, 20, 6, 6, 20, -25, 120];
const CORNER_X = { 9: 0, 14: 7, 49: 56, 54: 63, 1: 0, 8: 0, 6: 7, 15: 7, 48: 56, 57: 56, 55: 63, 62: 63 };
function evaluate(g, side, pers) {
  const b = g.b; let pos = 0, mine = 0, theirs = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i]; if (v === 0 || v === VOID) continue;
    let w = WEIGHTS[i];
    if (CORNER_X[i] !== undefined && b[CORNER_X[i]] !== 0) w = 4;     // X/C squares are fine once the corner is taken
    if (v === side) { pos += w; mine++; } else { pos -= w; theirs++; }
  }
  const mob = g.moves(side).length - g.moves(-side).length;
  const empties = 64 - mine - theirs;
  const discW = empties < 14 ? 6 : (pers.greed ?? 1) - 1;
  return pos * (1 + (pers.defence ?? 0) * 0.3) + mob * (8 + (pers.aggro ?? 0) * 4) + (mine - theirs) * discW;
}
function negamax(g, depth, alpha, beta, side, pers, ctx) {
  ctx.nodes++;
  if ((ctx.nodes & 511) === 0 && Date.now() > ctx.deadline) ctx.stop = true;
  if (ctx.stop) return 0;
  const moves = g.moves(side);
  if (!moves.length) {
    if (!g.moves(-side).length) { const c = g.count(); const d = c[side] - c[-side]; return d * 1000; }
    g.history.push({ b: g.b.slice(), side: g.side, passes: g.passes }); g.side = -side;
    const s = -negamax(g, depth, -beta, -alpha, -side, pers, ctx); g.undo(); return s;
  }
  if (depth <= 0) return evaluate(g, side, pers);
  moves.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  let best = -1e9;
  for (const m of moves) {
    g.side = side; g.play(m);
    const s = -negamax(g, depth - 1, -beta, -alpha, -side, pers, ctx);
    g.undo();
    if (s > best) best = s; if (s > alpha) alpha = s; if (alpha >= beta) break;
  }
  return best;
}
/** @returns {{move:number|null, score:number, depth:number}} */
export function flipSearch(board, side, { maxDepth = 4, timeMs = 600, pers = {}, jitter = 0, blunder = 0, rng = Math.random } = {}) {
  const g = new Flip(); g.b = Int8Array.from(board); g.side = side;
  const moves = g.moves(side); if (!moves.length) return { move: null, score: 0, depth: 0 };
  if (moves.length === 1) return { move: moves[0], score: 0, depth: 0 };
  if (blunder && rng() < blunder) return { move: moves[Math.floor(rng() * moves.length)], score: 0, depth: 0, blunder: true };
  const empties = g.count().empty;
  const ctx = { nodes: 0, stop: false, deadline: Date.now() + timeMs };
  const target = empties <= 10 ? Math.max(maxDepth, empties) : maxDepth;
  let best = moves[0], bestScore = -1e9, reached = 0;
  for (let d = 1; d <= target; d++) {
    let cur = null, curScore = -1e9;
    const ordered = [best, ...moves.filter((m) => m !== best)];
    for (const m of ordered) {
      g.side = side; g.play(m);
      let s = -negamax(g, d - 1, -1e9, -curScore, -side, pers, ctx);
      g.undo();
      if (ctx.stop) break;
      if (jitter) s += (rng() * 2 - 1) * jitter;
      if (s > curScore) { curScore = s; cur = m; }
    }
    if (ctx.stop) break;
    best = cur; bestScore = curScore; reached = d;
  }
  return { move: best, score: bestScore, depth: reached };
}
