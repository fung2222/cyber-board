// CYBER BOARD — alpha-beta search shared by chess and xiangqi (negamax, iterative deepening, quiescence,
// transposition table, MVV-LVA + killer + history move ordering, check extension, repetition = draw).
// Personalities shape the evaluation (greed / aggression / defence) and add deterministic per-position jitter
// for weaker or "chaotic" opponents. Pure module: runs in the Web Worker or on the main thread as a fallback.
import { Chess } from '../rules/chess.js';
import { Xiangqi } from '../rules/xiangqi.js';
import { evalChess } from './evalchess.js';
import { evalXiangqi } from './evalxq.js';

export const MATE = 100000;
const INF = 1e9;
const CV = [0, 100, 320, 330, 500, 900, 2000];            // chess ordering values
const XV = [0, 2000, 120, 120, 270, 600, 285, 70];         // xiangqi ordering values

export function makePosition(game, fen, hist) {
  const pos = game === 'chess' ? new Chess(fen) : new Xiangqi(fen);
  if (hist) pos.hist = hist.slice();
  return pos;
}

/**
 * @param {Chess|Xiangqi} pos
 * @param {{game:'chess'|'xiangqi', maxDepth?:number, timeMs?:number, pers?:object, jitter?:number, salt?:number, blunder?:number, rng?:()=>number}} o
 */
export function search(pos, o = {}) {
  const game = o.game || (pos instanceof Chess ? 'chess' : 'xiangqi');
  const evalFn = game === 'chess' ? evalChess : evalXiangqi;
  const OV = game === 'chess' ? CV : XV;
  const pers = o.pers || {};
  const jitter = o.jitter || 0, salt = (o.salt || 1) >>> 0;
  const deadline = Date.now() + (o.timeMs ?? 800);
  const maxDepth = o.maxDepth ?? 6;
  const rng = o.rng || Math.random;
  const tt = new Map();
  const killers = []; const hist = new Int32Array(game === 'chess' ? 120 * 120 : 90 * 90);
  const W = game === 'chess' ? 120 : 90;
  const gameKeys = new Set(pos.hist ? pos.hist.slice(0, -1) : []);
  const path = [];
  let nodes = 0, stop = false;

  const evaluate = () => {
    let s = evalFn(pos, pers);
    if (jitter) { let h = Math.imul(pos.h0 ^ salt, 2654435761) >>> 0; h ^= h >>> 15; s += (h % (2 * jitter + 1)) - jitter; }
    return pos.side === 1 ? s : -s;
  };
  const scoreMove = (m, ttm, ply) => {
    if (ttm && m.from === ttm.from && m.to === ttm.to && (m.promo || 0) === (ttm.promo || 0)) return 1e7;
    let s = 0;
    if (m.cap) s += 1e6 + OV[Math.abs(m.cap)] * 10 - OV[Math.abs(m.p)];
    if (m.promo) s += 9e5 + m.promo * 10;
    const k = killers[ply]; if (k && !m.cap) { if (k[0] && k[0].from === m.from && k[0].to === m.to) s += 8e5; else if (k[1] && k[1].from === m.from && k[1].to === m.to) s += 7e5; }
    s += hist[m.from * W + m.to];
    return s;
  };
  const order = (moves, ttm, ply) => { for (const m of moves) m._s = scoreMove(m, ttm, ply); moves.sort((a, b) => b._s - a._s); return moves; };

  function quiesce(alpha, beta, ply, qd) {
    nodes++;
    const stand = evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return stand;
    const moves = order(pos.pseudo(true), null, 60);
    for (const m of moves) {
      if (!pos.make(m)) { pos.unmake(); continue; }
      const sc = -quiesce(-beta, -alpha, ply + 1, qd + 1);
      pos.unmake();
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    if (ply > 0) {
      const k = pos.h0;
      if (gameKeys.has(pos.h0 + ':' + pos.h1)) return 0;
      for (let i = path.length - 2; i >= 0; i -= 2) if (path[i] === k) return 0;
      if (game === 'chess' && pos.half >= 100) return 0;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply, 0);
    const entry = tt.get(pos.h0);
    let ttm = null;
    if (entry && entry.h1 === pos.h1) {
      ttm = entry.move;
      if (entry.depth >= depth && ply > 0) {
        if (entry.flag === 0) return entry.score;
        if (entry.flag === 1 && entry.score >= beta) return entry.score;
        if (entry.flag === 2 && entry.score <= alpha) return entry.score;
      }
    }
    const moves = order(pos.pseudo(), ttm, ply);
    let best = -INF, bestMove = null, legal = 0; const a0 = alpha;
    path.push(pos.h0);
    for (const m of moves) {
      if (!pos.make(m)) { pos.unmake(); continue; }
      legal++;
      let sc;
      if (legal === 1) sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
      else {
        // late-move reduction for quiet moves
        const red = depth >= 3 && legal > 4 && !m.cap && !m.promo && !inCheck ? 1 : 0;
        sc = -negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1);
        if (sc > alpha && !stop) sc = -negamax(depth - 1, -beta, -alpha, ply + 1);
      }
      pos.unmake();
      if (stop) { path.pop(); return 0; }
      if (sc > best) { best = sc; bestMove = m; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!m.cap) { const k = killers[ply] || (killers[ply] = [null, null]); if (!k[0] || k[0].from !== m.from || k[0].to !== m.to) { k[1] = k[0]; k[0] = m; } hist[m.from * W + m.to] += depth * depth; }
        break;
      }
    }
    path.pop();
    if (!legal) return game === 'chess' && !inCheck ? 0 : -MATE + ply;   // xiangqi: stalemate loses
    tt.set(pos.h0, { h1: pos.h1, depth, score: best, flag: best <= a0 ? 2 : best >= beta ? 1 : 0, move: bestMove && { from: bestMove.from, to: bestMove.to, promo: bestMove.promo || 0 } });
    if (tt.size > 400000) tt.clear();
    return best;
  }

  // root
  const rootMoves = pos.legal();
  if (!rootMoves.length) return { move: null, score: 0, depth: 0, nodes: 0 };
  if (rootMoves.length === 1) return { move: pick(rootMoves[0]), score: 0, depth: 0, nodes: 0, only: true };
  // occasional "blunder" for the weakest personalities: a random non-losing-looking move
  if (o.blunder && rng() < o.blunder) {
    const m = rootMoves[Math.floor(rng() * rootMoves.length)];
    return { move: pick(m), score: 0, depth: 0, nodes: 0, blunder: true };
  }
  let bestMove = rootMoves[0], bestScore = -INF, reached = 0;
  for (let d = 1; d <= maxDepth; d++) {
    let alpha = -INF, beta = INF, curBest = null, curScore = -INF;
    const ttm = bestMove;
    order(rootMoves, ttm, 0);
    path.length = 0; path.push(pos.h0);
    for (const m of rootMoves) {
      pos.make(m);
      let sc;
      if (!curBest) sc = -negamax(d - 1, -beta, -alpha, 1);
      else { sc = -negamax(d - 1, -alpha - 1, -alpha, 1); if (sc > alpha && !stop) sc = -negamax(d - 1, -beta, -alpha, 1); }
      pos.unmake();
      if (stop) break;
      if (sc > curScore) { curScore = sc; curBest = m; }
      if (sc > alpha) alpha = sc;
    }
    if (stop && !curBest) break;
    if (curBest) { bestMove = curBest; bestScore = curScore; reached = d; }
    if (stop || Math.abs(bestScore) > MATE - 200) break;
    if (Date.now() > deadline - (o.timeMs ?? 800) * 0.45 && d >= 2) break;   // next depth would not finish
  }
  return { move: pick(bestMove), score: bestScore, depth: reached, nodes };
}
const pick = (m) => ({ from: m.from, to: m.to, promo: m.promo || 0 });
