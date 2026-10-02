// SKY RACE heuristic AI: scores each legal move (capture, launch, home, boost, safety, progress) with personality weights.
import { HANGAR, HOME, SAFE, absOf } from '../rules/skyrace.js';
/** danger: how many enemy planes sit 1..6 squares behind loop square `abs` */
function danger(game, colour, rel) {
  if (rel < 0 || rel > 50) return 0;
  const abs = absOf(colour, rel); if (SAFE.has(abs)) return 0;
  let n = 0;
  for (const c of game.colours) {
    if (c === colour) continue;
    game.pos[c].forEach((r) => {
      if (r === HANGAR) { if (abs === absOf(c, 0)) n += 0.4; return; }
      if (r > 50) return;
      const a = absOf(c, r); const dist = (abs - a + 52) % 52;
      if (dist >= 1 && dist <= 6 && r + dist <= 50) n++;
    });
  }
  return n;
}
export function skyChoose(game, pers = {}, rng = Math.random) {
  const moves = game.moves(); if (!moves.length) return null;
  const colour = game.colour, aggro = pers.aggro ?? 0.5, defence = pers.defence ?? 0.5;
  let best = null, bestS = -1e9;
  for (const m of moves) {
    const pv = game.preview(colour, m);
    let s = 0;
    for (const c of pv.captures) s += 60 + 70 * aggro + game.pos[c.colour][c.plane] * 1.2;
    if (m.from === HANGAR) s += 45;
    if (pv.to === HOME) s += 70;
    if (pv.boost) s += 22;
    if (pv.to > 50 && m.from <= 50) s += 30;                          // reached the safe home lane
    const before = m.from === HANGAR ? 0 : danger(game, colour, m.from);
    const after = danger(game, colour, pv.to);
    s += (before - after) * (25 + 30 * defence);
    if (pv.to <= 50 && SAFE.has(absOf(colour, pv.to))) s += 12;
    s += (pv.to - Math.max(0, m.from)) * 0.6;
    s += (pers.chaos ?? 0) * rng() * 40;
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}
