// Chess evaluation (white-positive centipawns). Formula-built piece-square terms, written from scratch.
import { ALL_SQ, fileOf, rankOf, P, N, B, R, Q, K } from '../rules/chess.js';
const MAT = [0, 100, 315, 330, 500, 920, 0];
const centre = (f, r) => 3.5 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));   // 0 edge .. 3 centre
// PST[type][sq] from white's view; black mirrors rank
const PST = [];
for (let t = 1; t <= 6; t++) {
  PST[t] = new Int16Array(120);
  for (const s of ALL_SQ) {
    const f = fileOf(s), r = rankOf(s), c = centre(f, r);
    let v = 0;
    if (t === P) v = [0, 0, 6, 14, 24, 42, 70, 0][r] + (f >= 2 && f <= 5 ? [0, 0, 2, 8, 12, 6, 0, 0][r] : 0) - (r === 1 && (f === 3 || f === 4) ? 12 : 0);
    else if (t === N) v = c * 11 - 18 + (r === 0 ? -8 : 0);
    else if (t === B) v = c * 6 - 8 + (r === 0 ? -6 : 0);
    else if (t === R) v = (r === 6 ? 18 : 0) + (f === 3 || f === 4 ? 4 : 0);
    else if (t === Q) v = c * 3 - 4;
    else if (t === K) v = (r === 0 ? (f <= 2 || f >= 6 ? 22 : 0) : -12 * r);
    PST[t][s] = v;
  }
}
const KING_END = new Int16Array(120); for (const s of ALL_SQ) KING_END[s] = centre(fileOf(s), rankOf(s)) * 12 - 18;
const mirror = (s) => { const f = fileOf(s), r = rankOf(s); return 21 + f + r * 10; };   // rank r -> 7-r

export function evalChess(pos, pers = {}) {
  const b = pos.b; const greed = pers.greed ?? 1, aggro = pers.aggro ?? 0, defence = pers.defence ?? 0;
  let mat = 0, ps = 0, phase = 0, wb = 0, bb = 0;
  const wk = pos.kings[1], bk = pos.kings[-1];
  const pawnFiles = [new Int8Array(8), new Int8Array(8)];
  for (const s of ALL_SQ) {
    const p = b[s]; if (!p) continue;
    const t = Math.abs(p), white = p > 0;
    if (t === N || t === B) phase += 1; else if (t === R) phase += 2; else if (t === Q) phase += 4;
    if (t === B) { if (white) wb++; else bb++; }
    if (t === P) pawnFiles[white ? 0 : 1][fileOf(s)]++;
    const sqv = white ? s : mirror(s);
    let v = t === K ? 0 : PST[t][sqv];
    if (aggro && t !== K && t !== P) {
      // reward pieces close to the enemy king
      const ek = white ? bk : wk; const d = Math.max(Math.abs(fileOf(s) - fileOf(ek)), Math.abs(rankOf(s) - rankOf(ek)));
      v += (7 - d) * 3 * aggro;
    }
    if (white) { mat += MAT[t]; ps += v; } else { mat -= MAT[t]; ps -= v; }
  }
  const mg = Math.min(24, phase) / 24;
  // kings: blend middlegame shelter and endgame centralisation
  ps += Math.round(PST[K][wk] * mg + KING_END[wk] * (1 - mg)) - Math.round(PST[K][mirror(bk)] * mg + KING_END[mirror(bk)] * (1 - mg));
  if (wb >= 2) ps += 30; if (bb >= 2) ps -= 30;
  // pawn structure: doubled / isolated
  for (let side = 0; side < 2; side++) {
    let pen = 0; const pf = pawnFiles[side];
    for (let f = 0; f < 8; f++) { if (pf[f] > 1) pen += 12 * (pf[f] - 1); if (pf[f] && !(f > 0 && pf[f - 1]) && !(f < 7 && pf[f + 1])) pen += 10; }
    ps += side === 0 ? -pen : pen;
  }
  // king shelter (defensive personalities care more)
  if (mg > 0.3) {
    const shelter = (k, side) => { let n = 0; const fwd = side === 1 ? -10 : 10; for (const o of [fwd - 1, fwd, fwd + 1]) if (b[k + o] === P * side) n++; return n; };
    const ks = (shelter(wk, 1) - shelter(bk, -1)) * (8 + 10 * defence) * mg;
    ps += ks;
  }
  return Math.round(mat * greed + ps);
}
