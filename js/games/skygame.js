// SKY RACE 飛行棋 controller: 3D holo die, launches, square-by-square hops, boosts, dogfight capture battles that
// blast the victim back to its hangar, home pillars, AI turns (heuristic personalities), endless race / hunter floors.
import * as THREE from 'three';
import { SkyRace, HANGAR, HOME, absOf } from '../rules/skyrace.js';
import { Jet, HoloDie } from '../pieces.js';
import { SKY_PATH, SKY_LANE, SKY_HOME, SKY_HANGAR, skyWorld, SKY_CELL, SKY_COLORS } from '../boards.js';
import { skyChoose } from '../ai/skyai.js';
import { aiOptions } from '../tower.js';
import { charById } from '../characters.js';

const HANG_OFF = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]];
export class SkyGame {
  constructor(app) { this.app = app; this.kind = 'sky'; this.jets = {}; }
  colorOf(c) { return c === 0 ? this.app.skinColor(SKY_COLORS[0]) : SKY_COLORS[c]; }
  start(cfg) {
    const a = this.app; this.cfg = cfg; this.token = (this.token || 0) + 1;
    const players = cfg.players || (cfg.spec && cfg.spec.players) || 4, planes = cfg.planes || (cfg.spec && cfg.spec.planes) || 4;
    this.g = new SkyRace({ players, planes });
    const hum = cfg.mode === 'demo' || cfg.mode === 'preview' ? 0 : cfg.mode === 'local' ? Math.max(1, Math.min(players, cfg.humans || 2)) : 1;
    this.humans = new Set(this.g.colours.slice(0, hum));
    this.busy = false; this.over = false; this.kills = 0; this.lost = 0;
    a.board.build('sky', { colours: this.g.colours });
    a.setCss(this.colorOf(0), this.colorOf(this.g.colours[1]));
    this.syncJets();
    if (!this.die) { this.die = new HoloDie(this.colorOf(0)); }
    a.scene.add(this.die.root); this.die.root.position.set(0, 0.25, 0); this.die.root.scale.setScalar(1.15);
    if (cfg.mode === 'preview') return;
    this.buildRoster(); this.refreshHud(); this.nextTurn();
  }
  name(c) { const a = this.app; if (this.humans.has(c)) return this.humans.size > 1 ? a.t('player', { n: this.g.colours.indexOf(c) + 1 }) : a.t('you'); return a.t('col.' + c) + (this.cfg.mode === 'local' || this.cfg.mode === 'demo' ? '' : ' · AI'); }
  slotPos(c, rel, plane) {
    if (rel === HANGAR) { const h = skyWorld(SKY_HANGAR[c]); const o = HANG_OFF[plane]; return h.add(new THREE.Vector3(o[0] * SKY_CELL * 1.1, 0, o[1] * SKY_CELL * 1.1)); }
    if (rel === HOME) { const h = skyWorld(SKY_HOME[c]); const o = HANG_OFF[plane]; return h.add(new THREE.Vector3(o[0] * 0.14, 0, o[1] * 0.14)); }
    if (rel > 50) return skyWorld(SKY_LANE[c][rel - 51]);
    return skyWorld(SKY_PATH[absOf(c, rel)]);
  }
  /** small offset when several planes share a square */
  spread(c, plane, rel) {
    const p = this.slotPos(c, rel, plane);
    if (rel === HANGAR || rel === HOME) return p;
    const same = []; for (const cc of this.g.colours) this.g.pos[cc].forEach((r, i) => { if (r === rel && cc === c && r >= 0 && r < HOME) same.push(i); });
    if (same.length > 1) { const k = same.indexOf(plane); p.x += (k - (same.length - 1) / 2) * 0.16; p.z += (k % 2 ? 0.08 : -0.08); }
    return p;
  }
  syncJets() {
    for (const c in this.jets) for (const j of this.jets[c]) j.root.removeFromParent();
    this.jets = {};
    for (const c of this.g.colours) {
      this.jets[c] = this.g.pos[c].map((rel, i) => { const j = new Jet(this.colorOf(c)); j.root.position.copy(this.spread(c, i, rel)); this.face(j, c, rel); this.app.scene.add(j.root); j.colour = c; j.plane = i; return j; });
    }
  }
  face(j, c, rel) {
    // point the nose along the route (towards the next square)
    let a, b;
    if (rel === HANGAR || rel === HOME) { a = this.slotPos(c, rel, 0); b = new THREE.Vector3(0, 0, 0); if (rel === HOME) { b = a.clone().multiplyScalar(2); } }
    else { a = this.slotPos(c, rel, 0); b = this.slotPos(c, Math.min(rel + 1, 55), 0); if (rel === 55) { a = this.slotPos(c, 54, 0); b = this.slotPos(c, 55, 0); } }
    const d = b.sub(a); if (d.lengthSq() > 1e-6) j.root.rotation.y = Math.atan2(d.x, d.z);
  }
  buildRoster() {
    const r = document.getElementById('sky-roster'); r.innerHTML = '';
    for (const c of this.g.colours) { const s = document.createElement('span'); s.dataset.c = c; s.style.color = '#' + new THREE.Color(this.colorOf(c)).getHexString(); r.appendChild(s); }
  }
  refreshHud() {
    const a = this.app, g = this.g;
    document.querySelectorAll('#sky-roster span').forEach((s) => { const c = +s.dataset.c; const home = g.pos[c].filter((x) => x === HOME).length; s.textContent = `${this.name(c)} ${home}/${g.planes}`; s.classList.toggle('turn', c === g.colour && !this.over); });
    const me = g.colours[0], foe = g.colour === me ? g.colours[1] : g.colour;
    a.setPlayers(this.name(me), this.name(foe), this.colorOf(me), this.colorOf(foe));
    a.setScores(g.pos[me].filter((x) => x === HOME).length + '/' + g.planes, g.pos[foe].filter((x) => x === HOME).length + '/' + g.planes);
    a.setTurn(g.colour === me ? 'a' : 'b');
    if (this.cfg.mode === 'endless') { const s = this.cfg.spec; a.setObjective(s.type === 'hunter' ? a.t('hud.hunter', { c: this.kills, t: s.target }) : a.t('obj.race')); }
  }
  humanTurn() { return this.humans.has(this.g.colour) && !this.over; }
  nextTurn() {
    const a = this.app; if (this.over) return;
    const c = this.g.colour; this.refreshHud();
    this.die.setColor(this.colorOf(c)); document.documentElement.style.setProperty('--turn', '#' + new THREE.Color(this.colorOf(c)).getHexString());
    for (const cc in this.jets) for (const j of this.jets[cc]) j.selectable = false;
    a.board.clearMarks();
    if (this.humanTurn()) { a.setStatus(this.humans.size > 1 ? a.t('turnOf', { n: this.name(c) }) : a.t('yourTurn')); a.showRoll(true); this.busy = false; }
    else { a.showRoll(false); a.setStatus(a.t('thinking', { n: this.name(c) }), 'think'); this.busy = true; this.aiRoll(); }
  }
  async aiRoll() { const tok = this.token; await this.app.wait(this.cfg.mode === 'demo' ? 0.35 : 0.6); if (tok !== this.token) return; this.roll(); }
  async roll() {
    const a = this.app, g = this.g, tok = this.token; if (this.over || g.phase !== 'roll' || this.die.rolling) return;
    this.busy = true; a.showRoll(false); a.audio.dice(7);
    const c = g.colour; const r = g.roll(this.app.forceDice || undefined); this.app.forceDice = 0; if (!r) { this.busy = false; return; }
    this.die.roll(r.dice, 0.85); a.haptic('light');
    await a.wait(0.9); if (tok !== this.token) return;
    a.audio.diceLand(r.dice === 6); a.particles.ring(new THREE.Vector3(0, 0.1, 0), new THREE.Color(this.colorOf(c)), 40, 3, 0.1); a.board.ripple(0, 0, 0.8);
    a.popupAt(new THREE.Vector3(0, 1.1, 0), String(r.dice), r.dice === 6 ? 'big' : 'combo');
    if (r.forfeit) { a.setStatus(a.t('threeSix'), 'alert'); a.audio.denied(); await a.wait(1); return this.nextTurn(); }
    if (r.noMove) { a.setStatus(a.t('noMove'), 'alert'); await a.wait(0.8); if (tok !== this.token) return; if (r.dice === 6) a.setStatus(a.t('extraRoll')); return this.nextTurn(); }
    if (r.dice === 6) a.setStatus(a.t('extraRoll'));
    const moves = r.moves;
    if (!this.humans.has(c)) {
      const ch = charById(this.cfg.mode === 'endless' || this.cfg.mode === 'ai' ? this.cfg.charId : 'bit');
      const opts = aiOptions('sky', this.cfg.mode === 'demo' ? 0.6 : this.cfg.strength, ch);
      const mv = skyChoose(g, opts.pers) || moves[0];
      await a.wait(0.3); if (tok !== this.token) return;
      return this.perform(mv);
    }
    if (moves.length === 1) { await a.wait(0.25); if (tok !== this.token) return; return this.perform(moves[0]); }
    // human picks
    this.choices = moves; a.setStatus(a.t('tapPlane'));
    for (const m of moves) { const j = this.jets[c][m.plane]; j.selectable = true; const pv = g.preview(c, m); a.board.mark(pv.captures.length ? 'ring' : 'dot', this.slotPos(c, pv.to, m.plane), pv.captures.length ? 0xff3b5c : this.colorOf(c)); }
    this.busy = false;
  }
  tap(point) {
    if (!point || this.over) return;
    const g = this.g;
    if (!this.humanTurn() || this.busy) return;
    if (g.phase === 'roll') { if (point.length() < 1.1) this.roll(); return; }
    if (g.phase !== 'move' || !this.choices) return;
    const c = g.colour; let best = null, bd = 0.7;   // generous: nearest choice within 0.7 (> one track cell)
    for (const m of this.choices) {
      const j = this.jets[c][m.plane]; const d = Math.hypot(j.root.position.x - point.x, j.root.position.z - point.z); if (d < bd) { bd = d; best = m; }
      const pv = g.preview(c, m), t = this.slotPos(c, pv.to, m.plane); const d2 = Math.hypot(t.x - point.x, t.z - point.z); if (d2 < bd) { bd = d2; best = m; }
    }
    if (best) this.perform(best);
  }
  hop(j, a, b, h = 0.35, dur = 0.13) {
    const app = this.app; const d = b.clone().sub(a); if (d.lengthSq() > 1e-6) j.root.rotation.y = Math.atan2(d.x, d.z);
    j.cinematic = true;
    return app.tween(dur, (k) => { j.root.position.lerpVectors(a, b, k); j.body.position.y = 0.2 + Math.sin(k * Math.PI) * h; j.body.rotation.x = -Math.cos(k * Math.PI) * 0.3; })
      .then(() => { j.cinematic = false; j.body.rotation.x = 0; app.audio.tick(); });
  }
  async perform(mv) {
    const a = this.app, g = this.g, tok = this.token; this.busy = true; this.choices = null; a.board.clearMarks();
    const c = g.colour, human = this.humans.has(c);
    for (const cc in this.jets) for (const j of this.jets[cc]) j.selectable = false;
    const ev = g.move(mv); if (!ev) { this.busy = false; return; }
    const j = this.jets[c][ev.plane];
    const capsAt = (rel) => ev.captures.filter((x) => x.at === rel);
    const fightAt = async (rel) => {
      const caps = capsAt(rel); if (!caps.length) return;
      for (const cp of caps) {
        const vj = this.jets[cp.colour][cp.plane];
        const mode = a.battleMode({ human, value: 3, exchange: false, game: 'sky', aiOnly: !human && !this.humans.has(cp.colour) });
        const to = vj.root.position.clone(), from = j.root.position.clone();
        if (mode === 'off') { await this.hop(j, from, to, 0.3, 0.2); a.fx3d.shatter(to.clone().setY(0.2), vj.color, { count: 30, height: 0.3 }); a.audio.boom(); vj.root.visible = false; }
        else { await a.battle.play({ game: 'sky', attacker: j, victim: vj, from, to, aType: 0, vType: 0, aColor: this.colorOf(c), vColor: this.colorOf(cp.colour), mode, aName: [this.name(c), this.name(c)], vName: [this.name(cp.colour), this.name(cp.colour)], cam: a.camera }); }
        if (tok !== this.token) return;
        if (human) { this.kills++; a.say('captured'); } else if (this.humans.has(cp.colour)) { this.lost++; a.say('capture'); }
        // respawn the victim in its hangar
        const hp = this.slotPos(cp.colour, HANGAR, cp.plane);
        vj.root.position.copy(hp); vj.root.visible = true; vj.cinematic = false; vj.body.position.set(0, 0.2, 0); vj.body.rotation.set(0, 0, 0); vj.body.scale.set(1, 1, 1); this.face(vj, cp.colour, HANGAR); vj.flash(2);
        a.fx3d.pillar(hp.clone(), this.colorOf(cp.colour), { h: 3, r: 0.35, dur: 0.6 }); a.audio.charge(0.25);
        j.root.position.copy(to);
      }
    };
    if (ev.from === HANGAR) {
      const p0 = j.root.position.clone(), p1 = this.slotPos(c, 0, ev.plane);
      a.audio.launch(); a.popupAt(p0, a.t('launch'), 'combo'); a.particles.burst(p0.clone().setY(0.2), new THREE.Color(this.colorOf(c)), 30, { speed: 3, up: 3, life: 0.5 });
      if (capsAt(0).length) { await this.hop(j, p0, p1.clone().lerp(p0, 0.25), 0.9, 0.4); await fightAt(0); }
      else await this.hop(j, p0, p1, 0.9, 0.4);
    } else {
      const last = ev.boost ? ev.mid : ev.to;
      for (let r = ev.from + 1; r <= last; r++) {
        const isLast = r === last; const b = this.slotPos(c, r, ev.plane);
        if (isLast && capsAt(r).length) { await fightAt(r); break; }
        await this.hop(j, j.root.position.clone(), b);
        if (tok !== this.token) return;
      }
      if (ev.boost) {
        a.audio.boost(); a.popupAt(j.root.position.clone(), a.t('boost'), 'combo'); a.fx.kick({ fovKick: 0.3, aberr: 0.4 });
        const p0 = j.root.position.clone(), p1 = this.slotPos(c, ev.to, ev.plane);
        if (capsAt(ev.to).length) { await this.hop(j, p0, p1.clone().lerp(p0, 0.3), 0.5, 0.28); await fightAt(ev.to); }
        else { const col = new THREE.Color(this.colorOf(c)); j.cinematic = true; await a.tween(0.32, (k) => { j.root.position.lerpVectors(p0, p1, k * k); a.particles.emit(j.root.position.clone().setY(0.25), new THREE.Vector3(0, 0.5, 0), col, { life: 0.4, size: 0.9 }); }); j.cinematic = false; }
      }
    }
    if (tok !== this.token) return;
    j.root.position.copy(this.spread(c, ev.plane, ev.to)); this.face(j, c, ev.to); a.board.ripple(j.root.position.x, j.root.position.z, 0.6);
    // tidy other planes on the same square
    for (const cc of g.colours) this.jets[cc].forEach((jj, i) => { if (jj !== j && !jj.cinematic) jj.root.position.copy(this.spread(cc, i, g.pos[cc][i])); });
    if (ev.home) { const hp = j.root.position.clone(); a.audio.home(); a.fx3d.pillar(hp, this.colorOf(c), { h: 5, r: 0.3, dur: 0.9 }); a.popupAt(hp, a.t('home'), 'big'); a.particles.burst(hp.clone().setY(0.3), new THREE.Color(this.colorOf(c)), 60, { speed: 4, up: 5, life: 0.8 }); a.haptic('medium'); }
    this.refreshHud();
    if (this.checkObjective()) return;
    if (ev.win) return this.end(c);
    if (ev.extra) a.setStatus(a.t('extraRoll'));
    await a.wait(0.2); if (tok !== this.token) return;
    this.nextTurn();
  }
  checkObjective() {
    if (this.cfg.mode !== 'endless') return false;
    const s = this.cfg.spec;
    if (s.type === 'hunter' && this.kills >= s.target) { this.end(this.g.colours[0], 'target'); return true; }
    return false;
  }
  async end(c, reason = 'race') {
    if (this.over) return; this.over = true; this.token++;
    const a = this.app; a.showRoll(false); this.refreshHud();
    a.setStatus(a.t('winnerIs', { n: this.name(c) }));
    a.audio.win(); for (const j of this.jets[c]) { a.fx3d.pillar(j.root.position.clone(), this.colorOf(c), { h: 6, r: 0.3, dur: 1.2 }); }
    await a.wait(1.3);
    let who;
    if (this.cfg.mode === 'local' || this.cfg.mode === 'demo') who = 'name';
    else who = this.humans.has(c) ? 'player' : 'ai';
    a.gameOver({ who, winnerName: this.name(c), reason, stats: { kills: this.kills, lost: this.lost }, names: [this.name(this.g.colours[0]), this.name(c)] });
  }
  canUndo() { return false; }
  undo() { return false; }
  async hint() {
    if (!this.humanTurn() || !this.choices) return;
    const mv = skyChoose(this.g, { aggro: 0.6, safety: 0.6 }); if (!mv) return;
    const j = this.jets[this.g.colour][mv.plane]; j.flash(1.5); this.app.board.mark('big', j.root.position, 0x3bff8a);
  }
  update(dt, t) { for (const c in this.jets) for (const j of this.jets[c]) j.update(dt, t); if (this.die) this.die.update(dt, t); }
  dispose() { this.token++; for (const c in this.jets) for (const j of this.jets[c]) j.root.removeFromParent(); this.jets = {}; if (this.die) this.die.root.removeFromParent(); document.getElementById('sky-roster').innerHTML = ''; }
}
