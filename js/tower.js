// ENDLESS TOWER 無盡之塔 — never-ending floors of AI opponents per game. Pure + deterministic per (game, floor).
// strength(floor) rises fast early then saturates; afterwards variety comes from personalities, challenge types
// (RUSH / DUEL / ENDGAME for chess & xiangqi, voids & margins for FLIP, hunter races for SKY RACE) and milestones.
import { CHARACTERS } from './characters.js';
import { Chess, sq as csq, K as CK, Q as CQ, R as CR, B as CB, N as CN, P as CP } from './rules/chess.js';
import { Xiangqi, idx as xidx, K as XK, A as XA, B as XB, N as XN, R as XR, C as XC, P as XP } from './rules/xiangqi.js';
import { randomVoids } from './rules/flip.js';

export const GAMES = ['chess', 'xiangqi', 'flip', 'sky'];
export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const strengthOf = (floor) => Math.min(1, 1 - Math.exp(-(floor - 1) / 9) * 0.95);   // floor 1 ≈ .05 … floor 30 ≈ .97
/** vs-AI difficulty 1..5 → strength */
export const DIFF_STRENGTH = [0, 0.05, 0.3, 0.55, 0.78, 1];

/** AI engine options from a strength (0..1) and character */
export function aiOptions(game, s, ch) {
  const jit = Math.round((1 - s) * (1 - s) * 140 + (ch?.jitter || 0) * (1 - s * 0.6));
  if (game === 'chess' || game === 'xiangqi') return { maxDepth: 1 + Math.round(s * (game === 'chess' ? 7 : 6)), timeMs: Math.round(220 + s * 1300), jitter: jit, blunder: Math.max(0, 0.22 - s * 0.5), pers: ch?.pers || {}, salt: (Math.random() * 1e9) | 0 };
  if (game === 'flip') return { maxDepth: 1 + Math.round(s * 6), timeMs: Math.round(150 + s * 900), jitter: Math.round((1 - s) * (1 - s) * 70), blunder: Math.max(0, 0.25 - s * 0.6), pers: ch?.pers || {} };
  return { pers: { ...(ch?.pers || {}), chaos: Math.max(ch?.pers?.chaos || 0, 1 - s) } };
}

export const isBoss = (floor) => floor % 5 === 0;
export const MILESTONE = 10;
export function floorChips(floor) { return 10 + floor * 2 + (isBoss(floor) ? 25 : 0) + (floor % MILESTONE === 0 ? 100 : 0); }

/** describe a floor: { game, floor, strength, char, type, target, moveLimit, setup… } */
export function floorSpec(game, floor) {
  const rng = mulberry(game.length * 7919 + floor * 104729);
  const s = strengthOf(floor);
  const boss = isBoss(floor);
  const pool = CHARACTERS.filter((c) => !c.boss);
  let ch;
  if (floor % MILESTONE === 0) ch = CHARACTERS.find((c) => c.id === 'zero');
  else if (boss) ch = [pool[3], pool[5], pool[6], pool[4]][(floor / 5) % 4 | 0];
  else ch = floor <= 2 ? pool[floor - 1] : pool[Math.floor(rng() * pool.length)];
  const spec = { game, floor, strength: s, char: ch.id, boss, type: 'duel' };
  if (game === 'chess' || game === 'xiangqi') {
    if (boss) spec.type = 'duel';
    else if (floor >= 4 && floor % 3 === 1) { spec.type = 'endgame'; spec.moveLimit = 18 + Math.floor(rng() * 6); spec.fen = game === 'chess' ? chessEndgame(rng, floor) : xqEndgame(rng, floor); }
    else { spec.type = 'rush'; spec.target = Math.min(3 + Math.floor(floor / 6), 7); spec.moveLimit = 16 + spec.target * 3; }
  } else if (game === 'flip') {
    const nv = floor < 3 ? 0 : Math.min(2 + Math.floor(rng() * 4) * 2, 2 + Math.floor(floor / 4) * 2);
    spec.voids = nv ? randomVoids(nv, rng) : [];
    if (boss) spec.type = 'duel';
    else if (floor % 3 === 0) { spec.type = 'margin'; spec.target = Math.min(4 + floor, 20); }
    else if (floor % 3 === 2 && floor > 3) { spec.type = 'corners'; spec.target = 2; }
    else spec.type = 'duel';
  } else {
    spec.players = floor <= 3 ? 2 : floor <= 8 ? 3 : 4;
    spec.planes = floor <= 5 ? 2 : floor <= 15 ? 3 : 4;
    spec.type = floor % 4 === 3 ? 'hunter' : 'race';
    if (spec.type === 'hunter') spec.target = Math.min(1 + Math.floor(floor / 8), 4);
  }
  return spec;
}

// ---------------------------------------------------------------- procedural endgames (player = white / red, to move)
function chessEndgame(rng, floor) {
  // player material advantage shrinks as floors rise
  const sets = [[[CQ], []], [[CR, CR], [CN]], [[CQ], [CN]], [[CR, CB], [CP]], [[CQ, CP], [CR]], [[CR, CN, CP], [CR]], [[CQ], [CR, CP]]];
  const [mine, theirs] = sets[Math.min(sets.length - 1, Math.floor((floor - 4) / 6) + Math.floor(rng() * 2))];
  for (let tries = 0; tries < 400; tries++) {
    const used = new Set(); const board = {};
    const place = (p, ok = () => true) => { for (let k = 0; k < 60; k++) { const f = Math.floor(rng() * 8), r = Math.floor(rng() * 8); const s = csq(f, r); if (used.has(s) || !ok(f, r)) continue; used.add(s); board[s] = p; return s; } return -1; };
    const wk = place(CK), bk = place(-CK, (f, r) => true);
    if (wk < 0 || bk < 0) continue;
    const kf = (s) => (s - 21) % 10, kr = (s) => 7 - Math.floor((s - 21) / 10);
    if (Math.abs(kf(wk) - kf(bk)) <= 1 && Math.abs(kr(wk) - kr(bk)) <= 1) continue;
    let bad = false;
    for (const t of mine) if (place(t, (f, r) => t !== CP || (r >= 1 && r <= 5)) < 0) bad = true;
    for (const t of theirs) if (place(-t, (f, r) => t !== CP || (r >= 2 && r <= 6)) < 0) bad = true;
    if (bad) continue;
    const fen = boardToFen(board) + ' w - - 0 1';
    const pos = new Chess(fen);
    if (pos.inCheck(1) || pos.inCheck(-1)) continue;
    const st = pos.status(); if (st.over) continue;
    return fen;
  }
  return '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
}
function boardToFen(board) {
  let out = '';
  for (let r = 7; r >= 0; r--) { let e = 0; for (let f = 0; f < 8; f++) { const p = board[csq(f, r)]; if (!p) { e++; continue; } if (e) { out += e; e = 0; } const ch = ' pnbrqk'[Math.abs(p)]; out += p > 0 ? ch.toUpperCase() : ch; } if (e) out += e; if (r) out += '/'; }
  return out;
}
function xqEndgame(rng, floor) {
  const sets = [[[XR, XR], [XA, XA]], [[XR, XN], [XA, XB]], [[XR, XC, XP], [XA, XA, XB]], [[XR, XN, XP], [XR, XA]], [[XR, XC], [XN, XA, XB]], [[XR, XR, XP], [XR, XA, XA]]];
  const [mine, theirs] = sets[Math.min(sets.length - 1, Math.floor((floor - 4) / 6) + Math.floor(rng() * 2))];
  const legalSpot = (t, side, f, r) => {
    const rr = side > 0 ? r : 9 - r;    // relative rank from own side
    if (t === XK) return f >= 3 && f <= 5 && rr <= 2;
    if (t === XA) return [[3, 0], [5, 0], [4, 1], [3, 2], [5, 2]].some(([a, b]) => a === f && b === rr);
    if (t === XB) return [[2, 0], [6, 0], [0, 2], [4, 2], [8, 2], [2, 4], [6, 4]].some(([a, b]) => a === f && b === rr);
    if (t === XP) return rr >= 5 || (rr >= 3 && f % 2 === 0);
    return true;
  };
  for (let tries = 0; tries < 600; tries++) {
    const b = new Array(90).fill(0); let bad = false;
    const place = (t, side) => { for (let k = 0; k < 80; k++) { const f = Math.floor(rng() * 9), r = Math.floor(rng() * 10); const i = xidx(f, r); if (b[i] || !legalSpot(t, side, f, r)) continue; b[i] = t * side; return i; } bad = true; return -1; };
    place(XK, 1); place(XK, -1);
    for (const t of mine) place(t, 1);
    for (const t of theirs) place(t, -1);
    if (bad) continue;
    let fen = '';
    for (let r = 9; r >= 0; r--) { let e = 0; for (let f = 0; f < 9; f++) { const p = b[xidx(f, r)]; if (!p) { e++; continue; } if (e) { fen += e; e = 0; } const ch = ' kabnrcp'[Math.abs(p)]; fen += p > 0 ? ch.toUpperCase() : ch; } if (e) fen += e; if (r) fen += '/'; }
    fen += ' w - - 0 1';
    const pos = new Xiangqi(fen);
    if (pos.inCheck(1) || pos.inCheck(-1)) continue;
    if (pos.status().over) continue;
    return fen;
  }
  return '3k5/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1';
}
