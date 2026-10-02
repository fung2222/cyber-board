// CYBER BOARD 賽博棋鬥 — app shell: stage / city / board, camera rig, menus, settings, endless tower, results,
// rewarded helpers, demo autoplay, test hooks. Game rules live in js/rules, controllers in js/games.
import * as THREE from 'three';
import { flags, createStore, createStage, ThemeController, Particles, Shockwaves, FxState, NeonCity, CyberUI, Platform, createAds } from 'cyber-kit';
import { t, tOther, applyI18n, getLang, setLang, bindToggle, onLangChange } from './i18n.js';
import './strings.js';
import { BoardAudio } from './audio.js';
import { Board } from './boards.js';
import { FX3D } from './fx3d.js';
import { BattleDirector } from './battle.js';
import { T } from './holo.js';
import { think, cancelAll } from './ai/client.js';
import { CHARACTERS, charById } from './characters.js';
import { floorSpec, floorChips, DIFF_STRENGTH, MILESTONE } from './tower.js';
import { GridGame } from './games/gridgame.js';
import { FlipGame } from './games/flipgame.js';
import { SkyGame } from './games/skygame.js';
import { ViewInput, VIEW_LIMITS, defaultView, clampView, dampView, isDefaultView } from './view.js';

const GAME_ID = 'cyber-board';
const $ = (id) => document.getElementById(id);
const store = createStore(GAME_ID);
let camDirty = true;
if (flags.reset) store.clear();
const ui = new CyberUI({ screens: ['start', 'mode', 'settings', 'pause', 'result'] });
const stage = createStage({ canvas: $('scene'), bloom: 0.8, bloomRadius: 0.5, bloomThreshold: 0.82, fov: 40, onFatal: (m) => ui.fatal(m) });
const { scene, camera } = stage;
const theme = new ThemeController(); theme.set(1, true);
const city = new NeonCity(stage, { floor: 'plain', floorY: -2.2, innerRadius: 34, buildings: 300, billboard: { zh: '賽博棋鬥', en: 'C Y B E R   B O A R D', pos: [0, 20, -46], width: 28 }, dustArea: 20, dustHeight: 8 });
const particles = new Particles(scene, 3000), waves = new Shockwaves(scene, 10), fx = new FxState();
// accept hex numbers as well as THREE.Color everywhere (kit expects Color objects)
{ const c1 = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color(); const C = (c, tmp) => (c && c.isColor ? c : tmp.set(c));
  const b = particles.burst.bind(particles), e = particles.emit.bind(particles), r = particles.ring.bind(particles), w = waves.spawn.bind(waves);
  particles.burst = (p, c, n, o) => b(p, C(c, c1), n, o && o.color2 != null ? { ...o, color2: C(o.color2, c2) } : o);
  particles.emit = (p, v, c, o) => e(p, v, C(c, c3), o);
  particles.ring = (p, c, n, sp, y) => r(p, C(c, c1), n, sp, y);
  waves.spawn = (p, c, o) => w(p, C(c, c1), o); }
const fx3d = new FX3D(scene);
const board = new Board(stage, scene);
stage.onResize((w, h, pr) => { board.resize(w, h, pr); particles.resize(h, pr); camDirty = true; });
const audio = new BoardAudio(store); ui.setMuted(audio.muted);
const ads = createAds({ gameId: GAME_ID, interstitialCooldownSec: 180, breaksBetweenInterstitials: 3, graceSec: 150, units: { android: {} }, onAdOpen: (on) => audio.duckAll(on) });
const SKINS = [{ c: null, at: 0 }, { c: 0xffd23c, at: 5 }, { c: 0x3bff8a, at: 10 }, { c: 0xffffff, at: 20 }, { c: 0xff8a00, at: 30 }, { c: 0x9d7bff, at: 40 }];

// ---------------------------------------------------------------- settings
const settings = {
  fx: store.get('fx', 'full'), hints: store.getBool('hints', true), rotate: store.getBool('rotate', true), haptics: store.getBool('haptics', true),
  music: store.getBool('music', true), skin: store.getNum('skin', 0),
};
Platform.setHaptics(settings.haptics);
const towers = {}; for (const g of ['chess', 'xiangqi', 'flip', 'sky']) towers[g] = store.getJSON('tower.' + g, { floor: 1, best: 0, checkpoint: 1 });
const saveTower = (g) => store.setJSON('tower.' + g, towers[g]);
const bestOverall = () => Math.max(...Object.values(towers).map((x) => x.best));
let chips = store.getNum('chips', 0);

// ---------------------------------------------------------------- app context shared with controllers
const S = { state: 'menu', game: 'chess', cfg: null, ctrl: null, demo: !!flags.demo, recentBattles: [], freeUndo: 0, freeHint: 0, revived: false, diff: store.getNum('diff', 2), charIdx: store.getNum('char', 0), skyPlayers: store.getNum('skyPlayers', 4), skyHumans: 2, skyPlanes: store.getNum('skyPlanes', 4) };
const tweens = []; const timers = [];
const app = {
  scene, camera, board, fx3d, particles, waves, fx, audio, ui, settings, t: (k, p, l) => t(k, p, l),
  get yawTarget() { return cam.yawTarget; },
  skinColor(def) { const s = SKINS[settings.skin]; return s && s.c && bestOverall() >= s.at ? s.c : def; },
  tween(dur, fn, ease) { return new Promise((resolve) => tweens.push({ t: 0, dur, fn, ease, resolve })); },
  wait(sec) { return new Promise((resolve) => timers.push({ t: sec, fn: resolve })); },
  schedule(sec, fn) { timers.push({ t: sec, fn }); },
  think: (job) => think(job),
  haptic: (k) => Platform.haptic(k),
  setCss(me, foe) { const r = document.documentElement.style; r.setProperty('--me', hex(me)); r.setProperty('--foe', hex(foe)); },
  setPlayers(a, b, ca, cb) {
    ui.setText('pc-a-name', a); ui.setText('pc-b-name', b);
    const ch = S.cfg && (S.cfg.mode === 'ai' || S.cfg.mode === 'endless') ? charById(S.cfg.charId) : null;
    ui.setText('pc-b-sub', ch && S.game !== 'sky' ? (getLang() === 'zh-HK' ? ch.title[0] : ch.title[1]) : '');
    ui.setText('pc-a-sub', S.cfg && S.cfg.mode === 'endless' ? t('floor', { n: S.cfg.spec.floor }) : '');
    const av = $('pc-b-av'); av.textContent = ch && S.game !== 'sky' ? ch.glyph : (S.game === 'sky' ? '✈' : '2P'); av.style.setProperty('--foe', hex(cb));
    $('pc-a-dot').style.background = hex(ca); $('pc-a-dot').style.boxShadow = '0 0 10px ' + hex(ca);
  },
  setScores(a, b) { ui.setText('pc-a-score', a); ui.setText('pc-b-score', b); },
  setTurn(w) { $('pc-a').classList.toggle('turn', w === 'a'); $('pc-b').classList.toggle('turn', w === 'b'); },
  setStatus(text, cls = '') { const e = $('status'); e.className = 'status ' + cls; if (cls === 'think') { e.innerHTML = '<i class="spin"></i>'; e.appendChild(document.createTextNode(text)); } else e.textContent = text; },
  setObjective(text) { ui.setText('hud-obj', text); },
  toolsEnabled(on) { updateTools(on); },
  showRoll(on) { $('btn-roll').classList.toggle('hidden', !on); $('btn-roll').disabled = !on; },
  charName() { const c = charById(S.cfg.charId); return getLang() === 'zh-HK' ? c.zh : c.en; },
  say(event) { if (!event || !S.cfg || (S.cfg.mode !== 'ai' && S.cfg.mode !== 'endless')) return; sayLine(event); },
  popupAt(pos, text, cls = '') { const p = stage.toScreen(new THREE.Vector3(pos.x, (pos.y || 0) + 0.6, pos.z)); ui.popup(p.x, p.y, text, '', cls); },
  setYaw(y) { cam.yawTarget = y; },
  battleMode(info) { return battleMode(info); },
  pickPromotion() { return pickPromotion(); },
  gameOver(r) { onGameOver(r); },
};
const hex = (c) => '#' + new THREE.Color(c).getHexString();
const battle = new BattleDirector({ scene, fx3d, particles, waves, fx, audio, ui, board, haptic: (k) => Platform.haptic(k), popup: (pos, text, cls) => app.popupAt(pos, text, cls), lang: () => getLang() });
app.battle = battle;
const controllers = { chess: new GridGame(app, 'chess'), xiangqi: new GridGame(app, 'xiangqi'), flip: new FlipGame(app), sky: new SkyGame(app) };

/** decide Full / Quick / Off for a capture: respects the setting, auto-quick for rapid exchanges in endless / demo */
function battleMode({ human, value, exchange, game, aiOnly }) {
  if (settings.fx === 'off') return 'off';
  if (settings.fx === 'quick') return 'quick';
  const now = performance.now() / 1000; S.recentBattles = S.recentBattles.filter((x) => now - x < 14);
  const mode = S.cfg ? S.cfg.mode : 'ai';
  let quick = false;
  if ((mode === 'endless' || mode === 'demo') && exchange && game !== 'flip') quick = true;           // recapture flurry
  if (mode === 'endless' && game !== 'flip' && game !== 'sky' && value <= 1 && S.recentBattles.length >= 2) quick = true; // cheap pawns in a busy stretch
  if (game === 'sky' && aiOnly && mode !== 'demo') quick = true;                                      // AI vs AI dogfights
  if (S.recentBattles.length >= 4) quick = true;                                                      // too many in a short time
  if (game === 'flip') return value >= 6 ? 'full' : 'quick';
  if (!quick) S.recentBattles.push(now);
  void human; return quick ? 'quick' : 'full';
}

// ---------------------------------------------------------------- camera rig
// Auto-framed base rig (fitCamera) + the player's view offset (js/view.js: pinch / twist / drag / wheel),
// smoothed every frame and blended with the capture-battle cinematics (battle.camW).
const cam = { yaw: 0, yawTarget: 0, dist: 14, pitch: 0.95, offY: 0, menuT: 0, kind: null, look: new THREE.Vector3(), pos: new THREE.Vector3() };
const view = defaultView(), viewC = defaultView();       // target / smoothed player view
const _p = new THREE.Vector3();
// playing area half-extents (squares / intersections incl. piece radius) and the full board with rim + pylons
const PLAY_EXT = { chess: [4.12, 4.12], xiangqi: [4.5, 5.0], flip: [4.12, 4.12], sky: [4.85, 4.85] };
const RIM_EXT = { chess: [4.6, 4.6], xiangqi: [4.75, 5.25], flip: [4.6, 4.6], sky: [5.1, 5.1] };
const GRID_HALF = { chess: [4, 4], xiangqi: [4, 4.5], flip: [4, 4] };   // for clamping edge taps onto the outer cells
const extOf = (kind) => PLAY_EXT[kind] || PLAY_EXT.chess;
function boardPoints(kind, play) {
  const ext = (play ? PLAY_EXT : RIM_EXT)[kind] || RIM_EXT.chess, ys = play ? [0, 0.45] : [0, 0.9];
  const pts = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of ys) pts.push(new THREE.Vector3(sx * ext[0], y, sz * ext[1]));
  return pts;
}
function fitCamera() {
  const kind = board.kind || 'chess', w = stage.width, h = stage.height, portrait = h > w;
  const playing = S.state === 'play' || S.state === 'paused' || S.state === 'result';
  // portrait play: frame the playing grid edge-to-edge (rim / pylons may bleed off-screen) from a steeper,
  // narrower-FOV camera so the far rows are nearly as big as the near ones. Menus keep the full hero framing.
  const fill = portrait && playing;
  cam.pitch = fill ? 1.2 : portrait ? 1.04 : 0.9;
  const topPx = (S.state === 'play' ? (kind === 'sky' ? 128 : 112) : 40), botPx = S.state === 'play' ? 86 : 30;
  const availY = 2 - 2 * (topPx + botPx) / h, availX = fill ? 1.97 : 1.9;
  camera.clearViewOffset(); cam.fov = fill ? 42 : portrait ? 48 : 40; camera.fov = cam.fov; camera.aspect = w / h; camera.updateProjectionMatrix();
  const pts = boardPoints(kind, fill);
  const proj = (d) => {
    camera.position.set(0, Math.sin(cam.pitch) * d, Math.cos(cam.pitch) * d); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9; for (const p of pts) { _p.copy(p).project(camera); x0 = Math.min(x0, _p.x); x1 = Math.max(x1, _p.x); y0 = Math.min(y0, _p.y); y1 = Math.max(y1, _p.y); }
    return { x0, x1, y0, y1 };
  };
  let lo = 4, hi = 60;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2, b = proj(m); if (b.x1 - b.x0 <= availX && b.y1 - b.y0 <= availY) hi = m; else lo = m; }
  cam.dist = hi; const b = proj(hi);
  const target = 1 - 2 * topPx / h - availY / 2;   // ndc centre of the free area
  cam.offY = (target - (b.y1 + b.y0) / 2) * h / 2;
  cam.kind = kind; camDirty = false;
  clampView(view, cam.pitch, extOf(kind));
}
/** camera pose for the rig + a player view (no battle / shake). Used by the frame update and by anchored gestures. */
function rigPose(v, outPos, outLook) {
  const yaw = cam.yaw + v.az, pitch = cam.pitch + v.el, dist = cam.dist * v.zoom;
  outLook.set(v.px, 0, v.pz);
  outPos.set(v.px + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, v.pz + Math.cos(yaw) * Math.cos(pitch) * dist);
}
function updateCamera(dt, now) {
  if (camDirty) fitCamera();
  let dy = cam.yawTarget - cam.yaw; cam.yaw += dy * Math.min(1, dt * 3.2);
  const playing = S.state === 'play' || S.state === 'paused' || S.state === 'result';
  if (!battle.busy) dampView(viewC, view, dt);           // camera offsets hold still while a battle cinematic runs
  let offY = cam.offY, offX = 0;
  if (playing) rigPose(viewC, cam.pos, cam.look);
  else {
    cam.menuT += dt; let yaw = cam.menuT * 0.08, dist = cam.dist * 1.08; const pitch = cam.pitch - 0.12;
    offY = -stage.height * (stage.height > stage.width ? 0.24 : 0.06); if (stage.width > stage.height * 1.2) { offX = -stage.width * 0.2; dist *= 1.12; }
    cam.pos.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist); cam.look.set(0, 0, 0);
  }
  const w = battle.camW;
  if (w > 0) { cam.pos.lerp(battle.camPos, w); cam.look.lerp(battle.camLook, w); offY *= 1 - w; offX *= 1 - w; }
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  camera.fov = (cam.fov || 40) + battle.fovDelta - fx.fovKick * 3;
  if (Math.abs(offY) > 0.5 || Math.abs(offX) > 0.5) camera.setViewOffset(stage.width, stage.height, offX, offY, stage.width, stage.height); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  fx.shake(camera, now, w > 0 ? 0.5 : 0.35);
  // xiangqi glyphs follow the 2P table rotation
  if (S.ctrl && S.ctrl.applyYaw && Math.abs(dy) > 0.001) S.ctrl.applyYaw(cam.yaw);
  $('btn-view').classList.toggle('on', playing && !isDefaultView(view));
}

// ---------------------------------------------------------------- player view gestures (pinch / twist / drag / wheel)
const scratchCam = new THREE.PerspectiveCamera(40, 1, 0.1, 400), _sp = new THREE.Vector3(), _sl = new THREE.Vector3();
function groundUnder(c, sx, sy) {
  ndc.set(sx / stage.width * 2 - 1, -(sy / stage.height) * 2 + 1); ray.setFromCamera(ndc, c);
  const out = new THREE.Vector3(); return ray.ray.intersectPlane(plane, out) ? out : null;
}
/** a camera posed at the *target* view, so anchoring is exact even while the smoothed camera is still catching up */
function targetCam() {
  rigPose(view, _sp, _sl); const c = scratchCam;
  c.fov = cam.fov || 40; c.aspect = stage.width / stage.height; c.position.copy(_sp); c.lookAt(_sl);
  if (Math.abs(cam.offY) > 0.5) c.setViewOffset(stage.width, stage.height, 0, cam.offY, stage.width, stage.height); else c.clearViewOffset();
  c.updateProjectionMatrix(); c.updateMatrixWorld(true); return c;
}
/** apply a view change keeping the board point under (sx, sy) under the fingers (zoom / twist toward the fingers) */
function anchored(sx, sy, mutate) {
  const ext = extOf(board.kind || 'chess');
  const a = groundUnder(targetCam(), sx, sy);
  mutate(); clampView(view, cam.pitch, ext);
  if (!a) return;
  const b = groundUnder(targetCam(), sx, sy);
  if (b) { view.px += a.x - b.x; view.pz += a.z - b.z; clampView(view, cam.pitch, ext); }
}
const gesturesOn = () => S.state === 'play' && !battle.busy && !!S.ctrl;
function resetView(instant = false) { Object.assign(view, defaultView()); if (instant) Object.assign(viewC, defaultView()); }
const viewInput = new ViewInput($('scene'), {
  enabled: gesturesOn,
  down: () => { audio.init(); if (settings.music) audio.startMusic(); },
  zoom: (f, x, y) => anchored(x, y, () => { view.zoom *= f; }),
  twist: (d, x, y) => anchored(x, y, () => { view.az += d; }),
  pan: (x0, y0, x1, y1) => {            // two-finger drag: the board point under the fingers follows them (only while zoomed in)
    const c = targetCam(), a = groundUnder(c, x0, y0), b = groundUnder(c, x1, y1);
    if (a && b) { view.px += a.x - b.x; view.pz += a.z - b.z; clampView(view, cam.pitch, extOf(board.kind || 'chess')); }
  },
  orbit: (dAz, dEl) => { view.az += dAz; view.el += dEl; clampView(view, cam.pitch, extOf(board.kind || 'chess')); },
  gesture: (on) => { if (on) hideEmotes(); },
  tap: (x, y) => {
    if (battle.busy) { battle.skip(); return; }
    if (S.state !== 'play' || !S.ctrl || S.demo) return;
    hideEmotes();
    S.ctrl.tap(pickPoint(x, y));
  },
});
// capture battles: the player's view is saved when a cinematic starts and restored when it ends, whatever happens
{ const play = battle.play.bind(battle);
  battle.play = (o) => { const saved = { ...view }; return play(o).then((r) => { Object.assign(view, saved); return r; }); }; }

// ---------------------------------------------------------------- picking (generous hit areas)
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
/** ray vs upright cylinder (axis through (cx, cz), y in [0, h]); returns distance along the ray or Infinity */
function rayCylinder(o, d, cx, cz, r, h) {
  let best = Infinity; const ox = o.x - cx, oz = o.z - cz;
  const A = d.x * d.x + d.z * d.z, B = 2 * (ox * d.x + oz * d.z), C = ox * ox + oz * oz - r * r, disc = B * B - 4 * A * C;
  if (A > 1e-9 && disc >= 0) { const t = (-B - Math.sqrt(disc)) / (2 * A); const y = o.y + d.y * t; if (t > 0 && y >= 0 && y <= h) best = t; }
  if (Math.abs(d.y) > 1e-9) { const t = (h - o.y) / d.y; if (t > 0 && t < best) { const x = ox + d.x * t, z = oz + d.z * t; if (x * x + z * z <= r * r) best = t; } }
  return best;
}
/** invisible tap targets: an upright cylinder per piece (r 0.46 cells, piece height + 0.12; chess / xiangqi pieces and
 *  selectable Sky Race jets) so tapping a tall piece's head picks *its* square instead of the square behind it; the board plane
 *  covers the rest, where every square / intersection owns its whole cell (no dead gaps) and taps up to 0.45 outside the grid
 *  snap onto the edge cells. When several targets overlap on screen (low camera, tall pieces) the one whose projected
 *  silhouette axis (ground → top) is nearest to the finger wins, so both the crown of the front piece and the body of the
 *  piece behind it stay tappable. */
function hitTargets() {
  const c = S.ctrl, k = S.game, out = [];
  if (!c) return out;
  if (c.pieces && (k === 'chess' || k === 'xiangqi')) for (const [sq, pc] of c.pieces) { if (!pc.root.visible) continue; const p = board.cellPos(k, sq); out.push({ sq, x: p.x, z: p.z, r: 0.46, h: Math.max(0.32, (pc.height || 0.3) + 0.12), top: pc.height || 0.3 }); }
  if (k === 'sky' && c.jets) for (const cc in c.jets) for (const j of c.jets[cc]) if (j.selectable && j.root.visible) out.push({ x: j.root.position.x, z: j.root.position.z, r: 0.34, h: 0.6, top: 0.5 });
  return out;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function screenOf(v) { _p.copy(v).project(camera); return [(_p.x + 1) / 2 * stage.width, (1 - _p.y) / 2 * stage.height]; }
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L > 1e-9 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L)) : 0;
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
function pickPoint(cx, cy) {
  ndc.set(cx / stage.width * 2 - 1, -(cy / stage.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  const ground = new THREE.Vector3(); const onPlane = !!ray.ray.intersectPlane(plane, ground);
  if (onPlane) {
    const g = GRID_HALF[S.game];
    if (g) for (const [ax, half] of [['x', g[0]], ['z', g[1]]]) {
      const v = ground[ax]; if (Math.abs(v) > half && Math.abs(v) <= half + 0.45) ground[ax] = Math.sign(v) * (S.game === 'xiangqi' ? half : half - 0.001);
    }
  }
  const gsq = onPlane && S.game !== 'sky' ? board.cellAt(S.game, ground.x, ground.z) : -1;
  // a piece is a candidate if the ray crosses its volume or the ground point lies in its own cell
  const hits = hitTargets().filter((tg) => tg.sq === gsq && gsq >= 0 || rayCylinder(o, d, tg.x, tg.z, tg.r, tg.h) < Infinity);
  if (!hits.length) return onPlane ? ground : null;
  if (S.game === 'sky') { const tg = hits[0]; return new THREE.Vector3(tg.x, 0, tg.z); }
  // candidates: every piece whose volume the ray crosses + the ground cell itself (if it is empty)
  const occupied = new Set(hits.map((tg) => tg.sq));
  let best = null, bd = Infinity;
  for (const tg of hits) {
    const dd = segDist(cx, cy, screenOf(_a.set(tg.x, 0, tg.z)), screenOf(_b.set(tg.x, tg.top, tg.z)));
    if (dd < bd) { bd = dd; best = tg; }
  }
  if (gsq >= 0 && !occupied.has(gsq)) {          // the tapped ground cell is empty: it competes by its centre
    const sc = screenOf(board.cellPos(S.game, gsq)), dd = Math.hypot(cx - sc[0], cy - sc[1]);
    if (dd < bd) return ground;
  }
  return new THREE.Vector3(best.x, 0, best.z);
}
document.addEventListener('pointerdown', (e) => { if (battle.busy && e.target.id !== 'scene' && !e.target.closest('button')) battle.skip(); }, true);

// ---------------------------------------------------------------- AI chatter
let bubbleT = 0, lastSay = 0;
function sayLine(ev) {
  const ch = charById(S.cfg.charId); const lines = ch.lines[ev]; if (!lines || !lines.length) return;
  const now = performance.now(); if (now - lastSay < 2500 && ev !== 'win' && ev !== 'lose' && ev !== 'start') return; lastSay = now;
  const l = lines[Math.floor(Math.random() * lines.length)];
  const b = $('bubble'); b.textContent = getLang() === 'zh-HK' ? l[0] : l[1]; b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  bubbleT = 2.6; audio.emote();
}
let meBubbleT = 0;
function emote(key) {
  const b = $('bubble-me'); b.textContent = t(key); b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; meBubbleT = 2;
  audio.emote(); hideEmotes();
  if (S.cfg && (S.cfg.mode === 'ai' || S.cfg.mode === 'endless')) setTimeout(() => { if (S.state === 'play') sayLine(key === 'e.ez' || key === 'e.gg' ? 'captured' : 'capture'); }, 900);
}
function hideEmotes() { $('emotes').classList.add('hidden'); }

// ---------------------------------------------------------------- tools (undo / hint / pause)
function updateTools(on = true) {
  const c = S.ctrl; const ok = on && S.state === 'play' && !S.demo;
  $('btn-undo').disabled = !(ok && c && c.canUndo()); $('btn-hint').disabled = !(ok && c && c.humanTurn && c.humanTurn());
  $('btn-undo').classList.toggle('hidden', S.game === 'sky');
}
async function rewardedGate(kind) {
  // casual & 2P: free. Endless: first use per floor free, afterwards an opt-in rewarded ad (web build: granted free).
  if (!S.cfg || S.cfg.mode !== 'endless') return true;
  if (kind === 'undo' && S.freeUndo > 0) { S.freeUndo--; return true; }
  if (kind === 'hint' && S.freeHint > 0) { S.freeHint--; return true; }
  if (!ads.isNative) return true;
  if (!ads.rewardedAvailable()) { ui.toast(t('kit.rewardOffline')); return false; }
  const ok = await ui.confirm({ title: t(kind === 'undo' ? 'undoAsk' : 'hintAsk'), ok: t('watchAd'), cancel: t('noThanks') });
  if (!ok) return false;
  const r = await ads.rewarded(kind); return r.rewarded;
}
async function doUndo() { if (!S.ctrl || !S.ctrl.canUndo()) return; if (!(await rewardedGate('undo'))) return; audio.back(); S.ctrl.undo(); updateTools(); }
async function doHint() { if (!S.ctrl || !S.ctrl.humanTurn()) return; if (!(await rewardedGate('hint'))) return; audio.confirm(); S.ctrl.hint(); }

// ---------------------------------------------------------------- menus
const GAME_THEME = { chess: 1, xiangqi: 5, flip: 2, sky: 4 };
function previewBoard(game) {
  if (S.ctrl) S.ctrl.dispose();
  S.game = game; S.ctrl = controllers[game]; S.cfg = { mode: 'preview', spec: null };
  S.ctrl.start({ mode: 'preview', players: 4, planes: 4 }); camDirty = true; theme.set(GAME_THEME[game]);
  document.body.classList.toggle('sky', game === 'sky');
}
function showMenu() {
  S.state = 'menu'; cancelAll(); battle.skip(); fx3d.clear(); ui.hud(false); ui.show('start'); document.body.classList.remove('playing');
  $('promo').classList.add('hidden'); cam.yawTarget = 0; cam.yaw = 0; resetView(true);
  paintStart(); previewBoard(S.game || 'chess'); camDirty = true;
}
function paintStart() {
  ui.setText('chips', chips);
  document.querySelectorAll('[data-best]').forEach((e) => { const tw = towers[e.dataset.best]; e.textContent = tw.best ? t('bestFloor', { n: tw.best }) : t('noFloor'); });
}
function openMode(game) {
  audio.click(); S.state = 'mode'; previewBoard(game); ui.show('mode');
  $('screen-mode').classList.toggle('sky', game === 'sky');
  const title = $('mode-title'); title.textContent = t('g.' + game); title.dataset.text = t('g.' + game);
  ui.setText('mode-kicker', tOther('g.' + game)); ui.setText('mode-rules', t('rules.' + game));
  const tw = towers[game]; ui.setText('endless-sub', t('endlessSub', { n: tw.floor, b: tw.best }));
  paintModeOpts();
}
function charPool() { return CHARACTERS.filter((c) => !c.boss || bestOverall() >= MILESTONE); }
function paintModeOpts() {
  segSelect('seg-diff', S.diff); segSelect('seg-players', S.skyPlayers); segSelect('seg-planes', S.skyPlanes);
  S.skyHumans = Math.min(S.skyHumans, S.skyPlayers); segSelect('seg-humans', S.skyHumans);
  document.querySelectorAll('#seg-humans button').forEach((b) => { b.disabled = +b.dataset.v > S.skyPlayers; });
  const pool = charPool(); const ch = pool[S.charIdx % pool.length];
  const av = $('cp-av'); av.textContent = ch.glyph; av.style.setProperty('--foe', hex(ch.color));
  ui.setText('cp-name', getLang() === 'zh-HK' ? ch.zh : ch.en); ui.setText('cp-title', getLang() === 'zh-HK' ? ch.title[0] : ch.title[1]);
  $('char-pick').parentElement.classList.toggle('hidden', S.game === 'sky');
}
function segSelect(id, v) { document.querySelectorAll('#' + id + ' button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); }
function bindSeg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); audio.init(); audio.tick(); fn(b.dataset.v); b.blur(); })); }

// ---------------------------------------------------------------- starting matches
function startMatch(cfg) {
  if (S.ctrl) S.ctrl.dispose();
  cancelAll(); fx3d.clear(); battle.skip(); tweens.length = 0; timers.length = 0;
  S.cfg = cfg; S.game = cfg.game; S.ctrl = controllers[cfg.game]; S.state = 'play'; S.recentBattles = []; S.revived = cfg.revived || false;
  S.freeUndo = 1; S.freeHint = 1;
  ui.show(null); ui.hud(true); document.body.classList.add('playing'); document.body.classList.toggle('sky', cfg.game === 'sky');
  $('sky-roster').classList.toggle('hidden', cfg.game !== 'sky'); $('btn-roll').classList.add('hidden');
  $('bubble').classList.add('hidden'); $('bubble-me').classList.add('hidden'); hideEmotes();
  $('demo-tag').classList.toggle('hidden', cfg.mode !== 'demo');
  theme.set(GAME_THEME[cfg.game]);
  cam.yawTarget = 0; cam.yaw = 0; resetView(true); camDirty = true;
  const ft = $('hud-floor');
  if (cfg.mode === 'endless') { ft.textContent = (cfg.spec.boss ? t('boss') + ' · ' : '') + t('floor', { n: cfg.spec.floor }); ft.classList.toggle('boss', !!cfg.spec.boss); }
  else { ft.textContent = cfg.mode === 'local' ? t('local2p') : cfg.mode === 'demo' ? 'DEMO' : t('vsAi') + ' · ' + 'Lv' + (cfg.diff || 1); ft.classList.remove('boss'); }
  ui.setText('hud-obj', '');
  app.setStatus('');
  S.ctrl.start(cfg); camDirty = true;
  updateTools();
  if (cfg.mode === 'endless') { const sp = cfg.spec; ui.banner(t('floor', { n: sp.floor }), sp.boss ? t('boss') : tOther('floor', { n: sp.floor }), objectiveText(sp)); if (sp.boss) { audio.levelUp(); fx.kick({ glitch: 0.4 }); } }
  else if (cfg.mode === 'ai' && cfg.game !== 'sky') ui.banner(t('g.' + cfg.game), tOther('g.' + cfg.game), '');
  if (cfg.mode === 'ai' || cfg.mode === 'endless') setTimeout(() => { if (S.state === 'play' && S.cfg === cfg) sayLine('start'); }, 900);
  // one-time gesture tip (touch devices)
  if (cfg.mode !== 'demo' && !store.getBool('viewTip', false) && matchMedia('(pointer: coarse)').matches) { store.setBool('viewTip', true); setTimeout(() => { if (S.state === 'play') ui.toast(t('viewTip'), 3400); }, 2600); }
}
function objectiveText(sp) {
  if (sp.type === 'rush') return t('obj.rush', { t: sp.target, m: sp.moveLimit });
  if (sp.type === 'endgame') return t('obj.endgame', { m: sp.moveLimit });
  if (sp.type === 'margin' || sp.type === 'corners' || sp.type === 'hunter') return t('obj.' + sp.type, { t: sp.target });
  if (sp.type === 'race') return t('obj.race');
  return t('obj.duel');
}
function startEndless(game, revived = false) {
  const tw = towers[game]; const spec = floorSpec(game, tw.floor);
  startMatch({ game, mode: 'endless', spec, strength: spec.strength, charId: spec.char, players: spec.players, planes: spec.planes, revived });
}
function startVsAi(game) {
  const pool = charPool(); const ch = pool[S.charIdx % pool.length];
  startMatch({ game, mode: 'ai', diff: S.diff, strength: DIFF_STRENGTH[S.diff], charId: game === 'sky' ? 'bit' : ch.id, players: S.skyPlayers, planes: S.skyPlanes, humans: 1 });
}
function startLocal(game) { startMatch({ game, mode: 'local', strength: 0.5, charId: 'bit', players: S.skyPlayers, planes: S.skyPlanes, humans: game === 'sky' ? Math.max(2, S.skyHumans) : 2 }); }

// ---------------------------------------------------------------- promotion picker
function pickPromotion() {
  return new Promise((resolve) => {
    const p = $('promo'); p.classList.remove('hidden'); audio.confirm();
    const btns = p.querySelectorAll('button[data-p]');
    const done = (v) => { p.classList.add('hidden'); btns.forEach((b) => { b.onclick = null; }); resolve(v); };
    btns.forEach((b) => { b.onclick = (e) => { e.stopPropagation(); audio.click(); done(+b.dataset.p); }; });
    S.promoCancel = () => done(0);
  });
}

// ---------------------------------------------------------------- results
function onGameOver(r) {
  if (S.state !== 'play') return;
  const cfg = S.cfg; S.lastResult = r;
  if (cfg.mode === 'demo') { setTimeout(() => { if (S.demo) nextDemo(); }, 1200); return; }
  S.state = 'result'; ui.hud(false); document.body.classList.remove('playing'); $('promo').classList.add('hidden');
  const won = r.who === 'player' || (cfg.mode === 'local');
  let title, sub = '', kicker = t('g.' + cfg.game);
  const stats = [];
  $('res-record').classList.add('hidden'); $('res-reward').classList.add('hidden'); $('btn-revive').classList.add('hidden');
  if (cfg.mode === 'endless') {
    const tw = towers[cfg.game], f = cfg.spec.floor;
    if (r.who === 'player') {
      title = t('floorClear', { n: f }); sub = tOther('floorClear', { n: f });
      const gained = floorChips(f); chips += gained; store.setNum('chips', chips);
      const rec = f > tw.best; if (rec) { tw.best = f; $('res-record').classList.remove('hidden'); }
      if (f % 5 === 0) tw.checkpoint = f + 1;
      tw.floor = f + 1; saveTower(cfg.game);
      let reward = t('chipsGained', { n: gained });
      if (f % 5 === 0) reward += ' · ' + t('checkpoint', { n: f + 1 });
      const sk = SKINS.find((s) => s.at === f && s.at > 0); if (sk && rec && bestOverall() === f) reward += ' · ' + t('milestone');
      $('res-reward').textContent = reward; $('res-reward').classList.remove('hidden');
      audio.win(); sayLine('lose'); fx.kick({ glitch: 0.2 });
      ui.setText('res-main', t('next')); ui.setText('res-main-sub', tOther('next'));
    } else {
      title = t('floorFail'); sub = tOther('floorFail');
      tw.floor = tw.checkpoint; saveTower(cfg.game);
      $('res-reward').textContent = t('checkpoint', { n: tw.checkpoint }); $('res-reward').classList.remove('hidden');
      audio.lose(); sayLine('win');
      ui.setText('res-main', t('retry')); ui.setText('res-main-sub', t('floor', { n: tw.checkpoint }));
      if (!S.revived && ads.rewardedAvailable() && tw.checkpoint < f) { $('btn-revive').classList.remove('hidden'); ui.setText('revive-sub', t('floor', { n: f }) + (ads.isNative ? ' · ' + t('watchAd') : ' · ' + t('free'))); }
    }
    stats.push([t('floor', { n: f }), t('bestFloor', { n: tw.best })]);
  } else if (cfg.mode === 'local') {
    title = r.who === 'draw' ? t('draw') : t('winnerIs', { n: r.who === 'name' ? r.winnerName : r.who === 'a' ? r.names[0] : r.names[1] }); sub = r.reason ? t('r.' + r.reason) : '';
    audio.win(); ui.setText('res-main', t('rematch')); ui.setText('res-main-sub', tOther('rematch'));
  } else {
    title = r.who === 'player' ? t('win') : r.who === 'draw' ? t('draw') : t('lose'); sub = r.who === 'player' ? tOther('win') : r.who === 'draw' ? tOther('draw') : tOther('lose');
    if (r.who === 'player') { audio.win(); sayLine('lose'); chips += 5 * (cfg.diff || 1); store.setNum('chips', chips); $('res-reward').textContent = t('chipsGained', { n: 5 * (cfg.diff || 1) }); $('res-reward').classList.remove('hidden'); }
    else if (r.who === 'ai') { audio.lose(); sayLine('win'); }
    ui.setText('res-main', t('rematch')); ui.setText('res-main-sub', tOther('rematch'));
  }
  if (r.reason && cfg.mode !== 'local') kicker += ' · ' + t('r.' + r.reason, { a: (r.score || [])[0], b: (r.score || [])[1] });
  if (r.score) stats.unshift([t('score'), `${r.score[0]} : ${r.score[1]}`]);
  if (r.stats) for (const [k, v] of Object.entries(r.stats)) stats.push([t('st.' + k), v]);
  ui.setText('res-kicker', kicker); const tt = $('res-title'); tt.textContent = title; tt.dataset.text = title; ui.setText('res-sub', sub);
  $('res-stats').innerHTML = stats.filter((s) => s[1] !== '').map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  setTimeout(() => { if (S.state === 'result') ui.show('result'); }, 350);
}
async function resultMain() {
  if (S.state !== 'result') return; audio.click();
  await ads.naturalBreak('match');
  const cfg = S.cfg;
  if (cfg.mode === 'endless') startEndless(cfg.game); else startMatch({ ...cfg });
}
async function resultMenu() { if (S.state !== 'result') return; audio.back(); await ads.naturalBreak('match'); showMenu(); }
async function revive() {
  if (S.state !== 'result' || S.revived) return;
  let ok = true;
  if (ads.isNative) { ok = await ui.confirm({ title: t('reviveAsk'), ok: t('watchAd'), cancel: t('noThanks') }); if (ok) ok = (await ads.rewarded('revive')).rewarded; }
  if (!ok) return;
  const tw = towers[S.cfg.game]; tw.floor = S.cfg.spec.floor; saveTower(S.cfg.game);
  startEndless(S.cfg.game, true);
}

// ---------------------------------------------------------------- pause
function pause() { if (S.state !== 'play' || S.demo) return; S.state = 'paused'; ui.show('pause'); audio.back(); }
function resume() { if (S.state !== 'paused') return; S.state = 'play'; ui.show(null); audio.click(); }

// ---------------------------------------------------------------- settings screen
let settingsFrom = null;
function openSettings() { audio.init(); audio.click(); settingsFrom = S.state === 'paused' ? 'pause' : ui.current || 'start'; ui.show('settings'); paintSettings(); }
function closeSettings() { audio.back(); ui.show(settingsFrom === 'pause' ? 'pause' : settingsFrom || 'start'); if (settingsFrom === 'start') paintStart(); if (settingsFrom === 'mode') paintModeOpts(); }
function paintSettings() {
  segSelect('set-lang', getLang()); segSelect('set-fx', settings.fx); segSelect('set-sound', audio.muted ? 0 : 1); segSelect('set-music', settings.music ? 1 : 0);
  segSelect('set-haptics', settings.haptics ? 1 : 0); segSelect('set-hints', settings.hints ? 1 : 0); segSelect('set-rotate', settings.rotate ? 1 : 0);
  const sk = $('set-skin'); sk.innerHTML = '';
  SKINS.forEach((s, i) => {
    const b = document.createElement('button'); const locked = bestOverall() < s.at; b.disabled = locked;
    b.title = locked ? t('skinLocked', { n: s.at }) : ''; b.innerHTML = `<i style="background:${hex(s.c || 0x00e5ff)};box-shadow:0 0 8px ${hex(s.c || 0x00e5ff)}"></i>`;
    b.classList.toggle('on', settings.skin === i);
    b.addEventListener('click', (e) => { e.stopPropagation(); settings.skin = i; store.setNum('skin', i); audio.tick(); paintSettings(); });
    sk.appendChild(b);
  });
}

// ---------------------------------------------------------------- demo autoplay (?demo=1): AI vs AI cycling through the games
const DEMO_ORDER = ['chess', 'xiangqi', 'flip', 'sky'];
let demoIdx = Math.max(0, DEMO_ORDER.indexOf(flags.get ? flags.get('game', 'chess') : 'chess'));
function nextDemo() {
  const g = DEMO_ORDER[demoIdx % DEMO_ORDER.length]; demoIdx++;
  startMatch({ game: g, mode: 'demo', strength: 0.35, charId: 'razor', players: 4, planes: 2 });
}

// ---------------------------------------------------------------- wiring
bindToggle($('btn-lang'));
onLangChange(() => { relabel(); });
function relabel() {
  applyI18n(); paintStart();
  if (S.state === 'mode') openMode(S.game);
  if (S.state === 'settings' || ui.current === 'settings') paintSettings();
  if (S.ctrl && S.ctrl.refreshHud && (S.state === 'play' || S.state === 'paused')) S.ctrl.refreshHud();
  if (S.state === 'play' && S.ctrl && S.ctrl.humanTurn && S.ctrl.humanTurn() && !S.ctrl.busy) app.setStatus(t('yourTurn'));
}
document.querySelectorAll('.gcard').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); audio.init(); if (settings.music) audio.startMusic(); openMode(b.dataset.game); b.blur(); }));
ui.on('btn-mode-back', () => { audio.back(); showMenu(); });
ui.on('btn-endless', () => { audio.confirm(); startEndless(S.game); });
ui.on('btn-vsai', () => { audio.confirm(); startVsAi(S.game); });
ui.on('btn-local', () => { audio.confirm(); startLocal(S.game); });
ui.on('char-pick', () => { audio.tick(); S.charIdx = (S.charIdx + 1) % charPool().length; store.setNum('char', S.charIdx); paintModeOpts(); });
bindSeg('seg-diff', (v) => { S.diff = +v; store.setNum('diff', S.diff); paintModeOpts(); });
bindSeg('seg-players', (v) => { S.skyPlayers = +v; store.setNum('skyPlayers', S.skyPlayers); paintModeOpts(); });
bindSeg('seg-humans', (v) => { S.skyHumans = +v; paintModeOpts(); });
bindSeg('seg-planes', (v) => { S.skyPlanes = +v; store.setNum('skyPlanes', S.skyPlanes); paintModeOpts(); });
bindSeg('set-lang', (v) => { setLang(v); paintSettings(); });
bindSeg('set-fx', (v) => { settings.fx = v; store.set('fx', v); paintSettings(); });
bindSeg('set-sound', (v) => { audio.setMuted(v === '0'); ui.setMuted(audio.muted); paintSettings(); });
bindSeg('set-music', (v) => { settings.music = v === '1'; store.setBool('music', settings.music); audio.setMusic(settings.music); paintSettings(); });
bindSeg('set-haptics', (v) => { settings.haptics = v === '1'; store.setBool('haptics', settings.haptics); Platform.setHaptics(settings.haptics); paintSettings(); });
bindSeg('set-hints', (v) => { settings.hints = v === '1'; store.setBool('hints', settings.hints); paintSettings(); });
bindSeg('set-rotate', (v) => { settings.rotate = v === '1'; store.setBool('rotate', settings.rotate); paintSettings(); });
ui.on('btn-settings', openSettings); ui.on('btn-settings-close', closeSettings);
ui.on('btn-mute', () => { audio.init(); ui.setMuted(audio.toggleMute()); });
ui.on('btn-pause', pause); ui.on('btn-resume', resume);
ui.on('btn-restart', () => { if (S.state !== 'paused') return; audio.click(); const c = S.cfg; if (c.mode === 'endless') startEndless(c.game); else startMatch({ ...c }); });
ui.on('btn-quit', () => { if (S.state !== 'paused') return; showMenu(); });
ui.on('btn-undo', doUndo); ui.on('btn-hint', doHint);
ui.on('btn-roll', () => { if (S.state === 'play' && S.game === 'sky' && S.ctrl.humanTurn()) S.ctrl.roll(); });
ui.on('btn-view', () => { audio.back(); resetView(); });
ui.on('btn-emote', () => { audio.tick(); $('emotes').classList.toggle('hidden'); });
document.querySelectorAll('#emotes button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); emote(b.dataset.emote); }));
ui.on('btn-res-main', resultMain); ui.on('btn-res-menu', resultMenu); ui.on('btn-revive', revive);
window.addEventListener('keydown', (e) => {
  audio.init();
  if (e.key === 'Escape' || e.key === 'p') { if (battle.busy) battle.skip(); else if (S.state === 'play') pause(); else if (S.state === 'paused') resume(); return; }
  if (battle.busy && (e.key === ' ' || e.key === 'Enter')) { battle.skip(); e.preventDefault(); return; }
  if (S.state !== 'play') return;
  if ((e.key === ' ' || e.key === 'Enter' || e.key === 'r') && S.game === 'sky' && S.ctrl.humanTurn()) { S.ctrl.roll(); e.preventDefault(); }
  if (e.key === 'u' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) doUndo();
  if (e.key === 'h') doHint();
  if (e.key === 'v' || e.key === '0') resetView();
  if ((e.key === '+' || e.key === '=' || e.key === '-') && gesturesOn()) anchored(stage.width / 2, stage.height / 2, () => { view.zoom *= e.key === '-' ? 1.15 : 1 / 1.15; });
});
Platform.onBack(() => {
  if (ui.closeModal()) return true;
  if (!$('promo').classList.contains('hidden')) { S.promoCancel && S.promoCancel(); return true; }
  if (battle.busy) { battle.skip(); return true; }
  if (ui.current === 'settings') { closeSettings(); return true; }
  if (S.state === 'play') { if (S.demo) { S.demo = false; showMenu(); } else pause(); return true; }
  if (S.state === 'paused') { resume(); return true; }
  if (S.state === 'result') { resultMenu(); return true; }
  if (S.state === 'mode') { showMenu(); return true; }
  return false;
});
Platform.onPause(() => { if (S.state === 'play' && !S.demo) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.state === 'play' && !S.demo) pause(); });

// ---------------------------------------------------------------- frame loop
function tick(dt, now) {
  T.value = now; theme.update(dt); fx.update(dt);
  battle.update(dt);
  const frozen = battle.frozen, ts = frozen ? 0 : battle.timeScale * fx.timeScale;
  const gdt = S.state === 'paused' ? 0 : dt * ts;
  // tweens / timers (game time; paused while paused / during hit-stop)
  if (gdt > 0) {
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; tw.t += gdt; const k = Math.min(1, tw.t / tw.dur); tw.fn(tw.ease === 'inout' ? (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) : k); if (k >= 1) { tweens.splice(i, 1); tw.resolve(); } }
    for (let i = timers.length - 1; i >= 0; i--) { const tm = timers[i]; tm.t -= gdt; if (tm.t <= 0) { timers.splice(i, 1); tm.fn(); } }
  }
  if (S.ctrl) S.ctrl.update(frozen ? 0 : dt * ts, now, frozen);
  board.update(now);
  fx3d.update(frozen ? 0 : dt * ts);
  particles.update(frozen ? dt * 0.05 : dt * ts); waves.update(frozen ? 0 : dt * ts);
  if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) $('bubble').classList.add('hidden'); }
  if (meBubbleT > 0) { meBubbleT -= dt; if (meBubbleT <= 0) $('bubble-me').classList.add('hidden'); }
  city.update(now, dt, camera); updateCamera(dt, now); fx.applyPost(stage, now); ui.tick(dt); stage.render(dt);
}

// ---------------------------------------------------------------- boot
applyI18n(); paintStart();
previewBoard('chess');
if (S.demo) { ui.show(null); nextDemo(); } else ui.show('start');
stage.loop(tick, { isActive: () => S.state === 'play', fpsEl: $('fps') });
if (flags.fps) $('fps').classList.remove('hidden');
ui.loaded(300);
ads.init().catch(() => {});

// ---------------------------------------------------------------- test hook (smoke tests / debugging)
window.__board = {
  get state() { return S.state; }, get game() { return S.game; }, get mode() { return S.cfg && S.cfg.mode; },
  get battle() { return battle.busy; }, get busy() { return !!(S.ctrl && S.ctrl.busy); }, get over() { return !!(S.ctrl && S.ctrl.over); },
  get ctrl() { return S.ctrl; }, get result() { return S.lastResult; }, get towers() { return towers; },
  open: (g) => openMode(g), endless: (g) => startEndless(g), vsAi: (g, diff = 1) => { S.diff = diff; startVsAi(g); }, local: (g) => startLocal(g),
  menu: () => showMenu(), setFx: (m) => { settings.fx = m; }, lang: (l) => setLang(l),
  /** play a move through the controller (chess / xiangqi {from,to,promo}; flip index; sky roll) */
  move: (m) => S.ctrl.perform(m), roll: () => S.ctrl.roll(),
  fen: () => S.ctrl.pos && S.ctrl.pos.fen && S.ctrl.pos.fen(),
  screenOf: (v) => stage.toScreen(v),
  cellScreen: (i) => { const p = board.cellPos(S.game, i); return stage.toScreen(p); },
  battleT: () => battle.active ? battle.active.bt : -1,
  dice: (n) => { app.forceDice = n; },
  skySetup: (list) => { const c = S.ctrl; for (const [col, pl, rel] of list) c.g.pos[col][pl] = rel; c.syncJets(); c.refreshHud(); },
  cam: () => [camera.position.toArray(), camera.fov, battle.camW, battle.camPos.toArray()],
  /** player view: target, smoothed, limits, base pitch / distance, gesture stats */
  view: () => ({ target: { ...view }, cur: { ...viewC }, limits: VIEW_LIMITS, pitch: cam.pitch, dist: cam.dist, absPitch: cam.pitch + viewC.el, camDist: camera.position.distanceTo(cam.look), stats: { ...viewInput.stats } }),
  setView: (v) => { Object.assign(view, v); clampView(view, cam.pitch, extOf(board.kind || 'chess')); }, resetView: (i) => resetView(i),
  pick: (x, y) => { const p = pickPoint(x, y); return p && [p.x, p.z]; },
  /** tap-target matrix for grid games: for every cell, tap its ground centre, and for pieces also the body (½ h) and crown (0.92 h);
   *  returns the misses as [cell, where, picked] */
  pickMatrix: () => {
    const k = S.game, n = k === 'chess' ? 120 : k === 'xiangqi' ? 90 : 64, miss = []; let total = 0;
    for (let i = 0; i < n; i++) {
      const c = board.cellPos(k, i); if (!c || board.cellAt(k, c.x, c.z) !== i) continue;
      const pc = S.ctrl.pieces && S.ctrl.pieces.get(i), spots = [['ground', 0]]; if (pc && pc.root.visible) spots.push(['body', pc.height * 0.5], ['crown', pc.height * 0.92]);
      for (const [w, y] of spots) {
        const sp = stage.toScreen(new THREE.Vector3(c.x, y, c.z)); if (sp.x < 2 || sp.y < 2 || sp.x > stage.width - 2 || sp.y > stage.height - 2) continue;
        total++; const p = pickPoint(sp.x, sp.y); const got = p ? board.cellAt(k, p.x, p.z) : -1; if (got !== i) miss.push([i, w, got]);
      }
    }
    return { total, miss };
  },
  screenAt: (x, y, z) => stage.toScreen(new THREE.Vector3(x, y, z)),
  pieceTop: (sq) => { const pc = S.ctrl.pieces && S.ctrl.pieces.get(sq); const p = board.cellPos(S.game, sq); return stage.toScreen(new THREE.Vector3(p.x, (pc ? pc.height : 0.3) * 0.92, p.z)); },
};
