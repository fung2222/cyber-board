// CYBER BOARD — SKY RACE 飛行棋 (race-to-home dice game in the 飛行棋 family). Pure rules, no DOM. Written from scratch.
// Rules (kept simple, see docs/HANDOFF.md):
//  * 2–4 colours (0 cyan, 1 magenta, 2 yellow, 3 green); 2 players use colours 0 and 2. 2 or 4 planes each.
//  * Shared loop of 52 squares; colour c starts at loop square c*13. A plane's progress `rel`:
//    -1 hangar · 0..50 loop (relative to own start) · 51..55 own home lane · 56 = home (finished).
//  * Roll 6 to launch a plane from the hangar onto rel 0. A 6 also grants another roll; three 6s in a row end the turn.
//  * Exact roll needed to reach home (overshoot = that plane cannot move).
//  * BOOST: landing on a loop square of your own colour (loop square % 4 === colour) jumps 4 squares ahead to the next one
//    (once per move, only if the jump stays on the loop, rel ≤ 50).
//  * CAPTURE: landing on a loop square holding enemy planes sends them back to their hangar — except on the four
//    start squares (safe). Checked where the plane lands and again after a boost.
//  * First player with every plane home wins.
export const LOOP = 52, LANE_START = 51, HOME = 56, HANGAR = -1;
export const START = [0, 13, 26, 39];
export const SAFE = new Set(START);
export const loopColour = (abs) => abs % 4;
export const absOf = (colour, rel) => (START[colour] + rel) % LOOP;

export class SkyRace {
  /** @param {{players?: number, planes?: number, rng?: () => number}} o */
  constructor({ players = 4, planes = 4, rng = Math.random } = {}) {
    this.colours = players === 2 ? [0, 2] : players === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    this.planes = planes; this.rng = rng;
    this.pos = {}; for (const c of this.colours) this.pos[c] = new Array(planes).fill(HANGAR);
    this.turn = 0; this.dice = 0; this.sixes = 0; this.phase = 'roll'; this.winner = null; this.log = [];
  }
  get colour() { return this.colours[this.turn]; }
  roll(forced) {
    if (this.phase !== 'roll' || this.winner !== null) return null;
    const d = forced || 1 + Math.floor(this.rng() * 6);
    this.dice = d;
    if (d === 6) this.sixes++; else this.sixes = 0;
    if (this.sixes >= 3) { this.sixes = 0; this.phase = 'roll'; const c = this.colour; this.nextTurn(); return { dice: d, forfeit: true, colour: c }; }
    const moves = this.moves();
    if (!moves.length) { const c = this.colour; if (d !== 6) this.nextTurn(); return { dice: d, noMove: true, colour: c }; }
    this.phase = 'move';
    return { dice: d, moves };
  }
  nextTurn() { this.turn = (this.turn + 1) % this.colours.length; this.sixes = 0; this.phase = 'roll'; }
  /** legal moves for the current colour & dice: [{ plane, from, to }] */
  moves(colour = this.colour, d = this.dice) {
    const out = [];
    this.pos[colour].forEach((rel, i) => {
      if (rel === HOME) return;
      if (rel === HANGAR) { if (d === 6) out.push({ plane: i, from: HANGAR, to: 0 }); return; }
      const to = rel + d; if (to <= HOME) out.push({ plane: i, from: rel, to });
    });
    return out;
  }
  /** planes of other colours sitting on loop square abs */
  occupants(abs, exceptColour) {
    const out = [];
    for (const c of this.colours) { if (c === exceptColour) continue; this.pos[c].forEach((rel, i) => { if (rel >= 0 && rel <= 50 && absOf(c, rel) === abs) out.push({ colour: c, plane: i }); }); }
    return out;
  }
  /** preview what a move would do without applying it: { to, boost, captures: [{colour, plane, at}] } */
  preview(colour, mv) {
    let to = mv.to, boost = false; const captures = [];
    const capAt = (rel) => { if (rel > 50) return; const abs = absOf(colour, rel); if (SAFE.has(abs)) return; for (const o of this.occupants(abs, colour)) captures.push({ ...o, at: rel }); };
    if (mv.from === HANGAR) { capAt(0); return { to: 0, boost: false, captures }; }
    capAt(to);
    if (to <= 50 && loopColour(absOf(colour, to)) === colour && to + 4 <= 50) { boost = true; const mid = to; to += 4; capAt(to); return { to, boost, mid, captures }; }
    return { to, boost, captures };
  }
  /** apply move index or move object for current colour. returns event { colour, plane, from, to, boost, mid, captures, home, extra, win } */
  move(mv) {
    if (this.phase !== 'move') return null;
    const colour = this.colour, legal = this.moves();
    const m = legal.find((x) => x.plane === mv.plane); if (!m) return null;
    const pv = this.preview(colour, m);
    for (const c of pv.captures) this.pos[c.colour][c.plane] = HANGAR;
    this.pos[colour][m.plane] = pv.to;
    const ev = { colour, plane: m.plane, from: m.from, to: pv.to, boost: pv.boost, mid: pv.mid, captures: pv.captures, home: pv.to === HOME, dice: this.dice };
    if (this.pos[colour].every((r) => r === HOME)) { this.winner = colour; ev.win = true; this.phase = 'over'; return ev; }
    ev.extra = this.dice === 6;
    if (ev.extra) this.phase = 'roll'; else this.nextTurn();
    this.log.push(ev);
    return ev;
  }
  progress(colour) { return this.pos[colour].reduce((s, r) => s + (r < 0 ? 0 : r), 0) / (this.planes * HOME); }
  snapshot() { return JSON.stringify({ pos: this.pos, turn: this.turn, dice: this.dice, sixes: this.sixes, phase: this.phase, winner: this.winner }); }
  restore(s) { const o = JSON.parse(s); Object.assign(this, o); }
}
