// node tests/rules.test.mjs — move generation (perft) + rules edge cases for all four games, + AI sanity.
import { Chess, perft as cPerft, parseSq, sqName, F_PROMO, Q, N as CN } from '../js/rules/chess.js';
import { Xiangqi, perft as xPerft, idx } from '../js/rules/xiangqi.js';
import { Flip } from '../js/rules/flip.js';
import { SkyRace, HANGAR, HOME, absOf } from '../js/rules/skyrace.js';
import { search } from '../js/ai/search.js';
import { flipSearch } from '../js/ai/flipai.js';
import { skyChoose } from '../js/ai/skyai.js';
import { floorSpec, GAMES, mulberry } from '../js/tower.js';
let fails = 0, n = 0;
const eq = (a, b, m) => { n++; const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fails++; console.error('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok  ', m); };
const mv = (c, a, b, promo) => c.play({ from: parseSq(a), to: parseSq(b), promo });
const t0 = Date.now();

// ---------------- chess perft
const CP = [
  ['start', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3 (ep/pins)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4 (promo/castle)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [name, fen, exp] of CP) { const c = new Chess(fen); eq(exp.map((_, i) => cPerft(c, i + 1)), exp, `chess perft ${name} 1..${exp.length}`); eq(c.fen(), fen, `chess fen round-trip ${name}`); }

// ---------------- chess rules
let c = new Chess(); mv(c, 'f2', 'f3'); mv(c, 'e7', 'e5'); mv(c, 'g2', 'g4'); mv(c, 'd8', 'h4');
eq(c.status().reason, 'checkmate', "fool's mate = checkmate"); eq(c.status().result, 'black', "fool's mate winner black");
c = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); eq(c.status().reason, 'stalemate', 'stalemate detected');
c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
eq(c.legalFrom(parseSq('e1')).map((m) => sqName(m.to)).sort().includes('g1') && c.legalFrom(parseSq('e1')).map((m) => sqName(m.to)).includes('c1'), true, 'castling both sides available');
mv(c, 'e1', 'g1'); eq([c.b[parseSq('f1')], c.b[parseSq('g1')], c.b[parseSq('h1')]], [4, 6, 0], 'O-O moves rook h1->f1');
c = new Chess('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'); eq(c.legalFrom(parseSq('e1')).some((m) => sqName(m.to) === 'g1'), false, 'cannot castle while in check');
c = new Chess('r3k2r/8/8/8/8/8/8/R3K1r1 w Qkq - 0 1'); eq(c.legalFrom(parseSq('e1')).some((m) => sqName(m.to) === 'c1'), false, 'cannot castle while in check (queen side)');
c = new Chess('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1'); eq(c.legalFrom(parseSq('e1')).some((m) => sqName(m.to) === 'g1'), false, 'cannot castle through attacked f1');
c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); mv(c, 'h1', 'h2'); mv(c, 'a8', 'a7'); eq([c.castle & 1, c.castle & 8], [0, 0], 'rook moves clear castling rights');
c = new Chess('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'); const ep = mv(c, 'e5', 'f6');
eq([!!ep, c.b[parseSq('f5')], ep && ep.san], [true, 0, 'exf6'], 'en passant captures the passed pawn');
c = new Chess('8/8/8/8/k2Pp2Q/8/8/3K4 b - d3 0 1'); eq(c.legalFrom(parseSq('e4')).some((m) => sqName(m.to) === 'd3'), false, 'en passant illegal when it exposes the king (rank pin)');
c = new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1'); eq(c.legalFrom(parseSq('a7')).filter((m) => m.flag & F_PROMO).map((m) => m.promo).sort(), [2, 3, 4, 5], 'promotion offers N/B/R/Q');
mv(c, 'a7', 'a8', CN); eq(c.b[parseSq('a8')], 2, 'under-promotion to knight');
c = new Chess('8/8/8/8/8/8/8/k5BK w - - 0 1'); eq(c.status().reason, 'material', 'K+B vs K insufficient material');
c = new Chess('8/8/8/8/8/8/8/kb4BK w - - 0 1'); eq(c.status().over, false, 'K+B vs K+B on opposite colours is NOT a dead draw by our rule');
c = new Chess('8/8/8/8/8/8/1b6/k5BK w - - 0 1'); eq(c.status().reason, 'material', 'K+B vs K+B same colour = insufficient');
c = new Chess('8/8/8/8/8/8/8/k5RK w - - 99 80'); mv(c, 'g1', 'g2'); eq(c.status().reason, 'fifty', '50-move rule');
c = new Chess(); for (let i = 0; i < 2; i++) { mv(c, 'g1', 'f3'); mv(c, 'g8', 'f6'); mv(c, 'f3', 'g1'); mv(c, 'f6', 'g8'); } eq(c.status().reason, 'repetition', 'threefold repetition');
c = new Chess(); mv(c, 'e2', 'e4'); mv(c, 'e7', 'e5'); c.undo(); eq(c.fen(), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'undo restores position');
// hash consistency through a random game
{ const rng = mulberry(7); const g = new Chess(); let ok = true; for (let i = 0; i < 200; i++) { const ms = g.legal(); if (!ms.length || g.status().over) break; const m = ms[Math.floor(rng() * ms.length)]; g.play(m); const h = [g.h0, g.h1]; g.computeHash(); if (h[0] !== g.h0 || h[1] !== g.h1) ok = false; } eq(ok, true, 'chess incremental zobrist hash == full hash over a random game'); }

// ---------------- xiangqi perft + rules
{ const x = new Xiangqi(); eq([1, 2, 3].map((d) => xPerft(x, d)), [44, 1920, 79666], 'xiangqi perft start 1..3 = 44/1920/79666'); }
let x = new Xiangqi('4k4/9/9/9/9/9/9/9/9/3K5 w - - 0 1');
eq(x.legalFrom(idx(3, 0)).map((m) => m.to).includes(idx(4, 0)), false, 'flying general: king may not step onto the open file facing the enemy king');
x = new Xiangqi('4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1'); eq(x.legalFrom(idx(4, 5)).every((m) => m.to % 9 === 4), true, 'flying general pin: chariot between kings can only move on the file');
x = new Xiangqi('4k4/9/9/9/9/9/9/9/4A4/4K4 w - - 0 1'); eq(x.legalFrom(idx(4, 1)).some((m) => m.to === idx(5, 2) || m.to === idx(3, 2)), false, 'advisor blocking the kings cannot leave the file');
x = new Xiangqi('3k5/9/9/9/9/9/9/9/1N7/1P2K4 w - - 0 1'); eq(x.legalFrom(idx(1, 1)).map((m) => m.to).sort((a, b) => a - b), [idx(0, 3), idx(2, 3), idx(3, 2), idx(3, 0)].sort((a, b) => a - b), 'horse has its 4 on-board jumps from b1');
x = new Xiangqi('3k5/9/9/9/9/9/9/1P7/1N7/4K4 w - - 0 1'); eq(x.legalFrom(idx(1, 1)).some((m) => m.to === idx(0, 3) || m.to === idx(2, 3)), false, 'horse leg block (piece in front blocks both forward jumps)');
x = new Xiangqi('3k5/9/9/9/9/9/9/9/9/2B1K4 w - - 0 1'); eq(x.legalFrom(idx(2, 0)).length, 2, 'elephant has 2 moves from c0');
x = new Xiangqi('3k5/9/9/9/9/9/9/9/3P5/2B1K4 w - - 0 1'); eq(x.legalFrom(idx(2, 0)).map((m) => m.to), [idx(0, 2)], 'elephant eye blocked at d1');
x = new Xiangqi('4k4/9/9/9/9/9/9/2B6/9/4K4 w - - 0 1'); eq(x.legalFrom(idx(2, 2)).some((m) => (m.to / 9 | 0) > 4), false, 'elephant cannot cross the river');
x = new Xiangqi('4k4/9/9/9/2B6/9/9/9/9/4K4 w - - 0 1'); eq(x.legalFrom(idx(2, 4)).every((m) => (m.to / 9 | 0) <= 4), true, 'elephant on river bank stays home');
x = new Xiangqi('4k4/9/4p4/9/9/9/9/4P4/4C4/3K5 w - - 0 1'); eq(x.legalFrom(idx(4, 1)).some((m) => m.to === idx(4, 7)), true, 'cannon captures over exactly one screen');
x = new Xiangqi('4k4/9/4p4/4p4/9/9/9/4P4/4C4/3K5 w - - 0 1'); eq([x.legalFrom(idx(4, 1)).some((m) => m.to === idx(4, 6)), x.legalFrom(idx(4, 1)).some((m) => m.to === idx(4, 7))], [true, false], 'cannon: captures the first piece after one screen, never over two screens');
x = new Xiangqi('4k4/9/9/9/9/4p4/9/9/4C4/3K5 w - - 0 1'); eq(x.legalFrom(idx(4, 1)).some((m) => m.to === idx(4, 4)), false, 'cannon cannot capture without a screen');
x = new Xiangqi('4k4/9/9/9/9/4P4/9/9/9/3K5 w - - 0 1'); eq(x.legalFrom(idx(4, 4)).map((m) => m.to), [idx(4, 5)], 'soldier before river: forward only');
x = new Xiangqi('4k4/9/9/9/4P4/9/9/9/9/3K5 w - - 0 1'); eq(x.legalFrom(idx(4, 5)).map((m) => m.to).sort((a, b) => a - b), [idx(3, 5), idx(5, 5), idx(4, 6)].sort((a, b) => a - b), 'soldier after river: forward + sideways, never back');
x = new Xiangqi('3k5/9/9/9/9/9/9/9/9/4K4 w - - 0 1'); eq(x.legalFrom(idx(4, 0)).some((m) => m.to === idx(4, 1)), true, 'general moves inside palace');
x = new Xiangqi('9/9/9/9/9/9/9/9/9/3K1k3 w - - 0 1');
x = new Xiangqi('4k4/9/9/9/9/9/9/9/9/5K3 w - - 0 1'); eq(x.legalFrom(idx(5, 0)).some((m) => m.to === idx(6, 0)), false, 'general cannot leave the palace');
x = new Xiangqi('3k5/4R4/3R5/9/9/9/9/9/9/4K4 b - - 0 1'); eq(x.status(), { over: true, result: 'red', reason: 'checkmate' }, 'xiangqi checkmate');
x = new Xiangqi('3k5/R8/9/9/9/9/9/9/9/4K4 b - - 0 1'); const xs = x.status(); eq([xs.over, xs.result, xs.reason], [true, 'red', 'stalemate'], 'xiangqi stalemate = loss for the stalemated side');
x = new Xiangqi('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1');
x = new Xiangqi('3k5/9/9/9/9/9/9/9/9/4K4 w - - 0 1'); eq(x.status().reason, 'material', 'no attackers left = draw');
{ const rng = mulberry(9); const g = new Xiangqi(); let ok = true; for (let i = 0; i < 200; i++) { const ms = g.legal(); if (!ms.length || g.status().over) break; g.play(ms[Math.floor(rng() * ms.length)]); const h = [g.h0, g.h1]; g.computeHash(); if (h[0] !== g.h0 || h[1] !== g.h1) ok = false; } eq(ok, true, 'xiangqi incremental hash == full hash over a random game'); }

// ---------------- flip
let f = new Flip(); eq(f.moves().sort((a, b) => a - b), [19, 26, 37, 44], 'flip opening has 4 moves');
const r1 = f.play(19); eq([r1.flips, f.count()[1], f.count()[-1]], [[27], 4, 1], 'flip play flips the outflanked disc');
f = new Flip(); f.b.fill(1); f.b[0] = 0; f.b[63] = -1; f.side = -1; eq(f.moves(), [0], 'long diagonal outflank');
f = new Flip(); f.b.fill(0); f.b[0] = 1; f.b[63] = -1; f.side = -1; eq(f.status(), { over: true, result: 0, count: { 1: 1, '-1': 1, empty: 62 } }, 'game ends when neither side can move (draw count)');
f = new Flip(); f.b.fill(0); f.b[0] = 1; f.b[1] = -1; f.b[3] = 1; f.side = -1; eq([f.status().mustPass, f.pass(), f.side], [true, true, 1], 'pass when no move but opponent has one');
f = new Flip(); eq(f.pass(), false, 'pass refused when a move exists');
f = new Flip([0, 63]); eq([f.b[0], f.b[63]], [2, 2], 'voids placed');
{ const rng = mulberry(3); let ok = true; for (let g = 0; g < 30; g++) { const ff = new Flip(); let guard = 0; while (!ff.status().over && guard++ < 100) { const ms = ff.moves(); if (!ms.length) { ff.pass(); continue; } ff.play(ms[Math.floor(rng() * ms.length)]); } const c = ff.count(); if (c[1] + c[-1] + c.empty !== 64 || !ff.status().over) ok = false; } eq(ok, true, 'flip: 30 random games terminate with consistent counts'); }

// ---------------- sky race
let s = new SkyRace({ players: 4, planes: 4, rng: () => 0 });
eq(s.roll(3).noMove, true, 'no launch without a 6'); eq(s.turn, 1, 'turn passes after no move');
s = new SkyRace({ players: 2, planes: 2 }); let rr = s.roll(6); eq(rr.moves.length, 2, 'six can launch either plane');
let ev = s.move({ plane: 0 }); eq([ev.to, ev.extra, s.phase, s.turn], [0, true, 'roll', 0], 'launch onto start square + extra roll');
s.roll(2); ev = s.move({ plane: 0 }); eq(ev.to, 2, 'move 2'); eq(s.turn, 1, 'turn passes');
s = new SkyRace({ players: 2, planes: 1 }); s.pos[0][0] = 54; s.roll(4); eq(s.moves().length, 0, 'overshoot home is not allowed');
s = new SkyRace({ players: 2, planes: 1 }); s.pos[0][0] = 54; s.roll(2); ev = s.move({ plane: 0 }); eq([ev.home, ev.win, s.winner], [true, true, 0], 'exact roll home wins');
s = new SkyRace({ players: 2, planes: 2 }); s.pos[0] = [11, HANGAR]; s.pos[2] = [(absOf(0, 14) - absOf(2, 0) + 52) % 52, HANGAR];
s.roll(3); ev = s.move({ plane: 0 }); eq([ev.captures.length, s.pos[2][0]], [1, HANGAR], 'landing on an enemy plane sends it to the hangar');
s = new SkyRace({ players: 2, planes: 1 }); s.pos[0] = [22]; s.pos[2] = [0]; s.turn = 0; s.roll(4); ev = s.move({ plane: 0 }); eq([ev.to, ev.captures.length, s.pos[2][0]], [26, 0, 0], 'start squares are safe (cyan lands on yellow start, no capture)');
s = new SkyRace({ players: 2, planes: 1 }); s.pos[0] = [1]; s.roll(3); ev = s.move({ plane: 0 }); eq([ev.boost, ev.to], [true, 8], 'boost: own-colour square jumps 4');
s = new SkyRace({ players: 2, planes: 1 }); s.pos[0] = [44]; s.roll(4); ev = s.move({ plane: 0 }); eq([ev.boost, ev.to], [false, 48], 'no boost past the loop end');
s = new SkyRace({ players: 2, planes: 1 }); s.pos[2] = [0]; s.turn = 1; s.pos[0] = [HANGAR]; s.pos[2] = [(absOf(0, 0) - absOf(2, 0) + 52) % 52 - 0]; // a yellow plane sitting on cyan's start (safe)
s.turn = 0; s.roll(6); ev = s.move({ plane: 0 }); eq(ev.captures.length, 0, 'launch square is safe');
s = new SkyRace({ players: 2, planes: 1 }); for (let i = 0; i < 2; i++) { s.roll(6); if (s.phase === 'move') s.move({ plane: 0 }); } const third = s.roll(6); eq(third.forfeit, true, 'three sixes in a row forfeit the turn');
{ let ok = true; for (let g = 0; g < 40; g++) { const rng = mulberry(100 + g); const sr = new SkyRace({ players: 2 + (g % 3), planes: 2 + (g % 2) * 2, rng }); let guard = 0; while (sr.winner === null && guard++ < 4000) { const r = sr.roll(); if (r && r.moves) { const m = skyChoose(sr, { aggro: 0.5 }, rng); if (!sr.move(m)) { ok = false; break; } } } if (sr.winner === null) ok = false; } eq(ok, true, 'sky race: 40 AI games all finish with a winner'); }

// ---------------- AI sanity
eq(sqName(search(new Chess('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'), { timeMs: 500 }).move.to), 'd8', 'chess AI finds back-rank mate');
eq(sqName(search(new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'), { timeMs: 500 }).move.to), 'f7', 'chess AI finds Qxf7#');
{ const p = new Chess('4k3/8/8/8/8/8/3q4/R3K3 w Q - 0 1'); const m = search(p, { timeMs: 400 }).move; eq(!!p.legal().find((x) => x.from === m.from && x.to === m.to), true, 'chess AI returns a legal move when in check'); }
{ const p = new Xiangqi('3k5/9/9/9/9/9/9/9/4R4/3RK4 w - - 0 1'); const r = search(p, { timeMs: 600 }); const g = p.clone(); g.play(r.move); eq(g.status().over && g.status().result === 'red', true, 'xiangqi AI finds the mate'); }
{ const p = new Xiangqi(); const r = search(p, { timeMs: 300 }); eq(!!p.legal().find((x) => x.from === r.move.from && x.to === r.move.to), true, 'xiangqi AI legal opening move'); }
{ const ff = new Flip(); ff.b.fill(0); ff.b[9] = -1; ff.b[18] = 1; ff.b[1] = -1; ff.b[2] = 1; ff.side = 1; const r = flipSearch(ff.b, 1, { maxDepth: 3 }); eq(r.move, 0, 'flip AI grabs the corner'); }
// ---------------- tower
{ let ok = true; for (const g of GAMES) for (let fl = 1; fl <= 60; fl++) { const sp = floorSpec(g, fl); if (!sp.char || !sp.type) ok = false; if (sp.fen) { const P = g === 'chess' ? new Chess(sp.fen) : new Xiangqi(sp.fen); if (P.status().over || P.inCheck(1) || P.inCheck(-1)) ok = false; } } eq(ok, true, 'tower: floors 1..60 of every game are valid (procedural endgames legal, not over)'); }
eq(JSON.stringify(floorSpec('chess', 37)) === JSON.stringify(floorSpec('chess', 37)), true, 'tower floors are deterministic');

console.log(`\n${n - fails}/${n} passed in ${Date.now() - t0} ms`);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
