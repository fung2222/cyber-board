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
const cam = { yaw: 0, yawTarget: 0, dist: 14, pitch: 0.95, offY: 0, menuT: 0, kind: null, look: new THREE.Vector3(), pos: new THREE.Vector3() };
const _p = new THREE.Vector3();
function boardPoints(kind) {
  const ext = { chess: [4.6, 4.6], xiangqi: [4.75, 5.25], flip: [4.6, 4.6], sky: [5.1, 5.1] }[kind] || [4.6, 4.6];
  const pts = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 0.9]) pts.push(new THREE.Vector3(sx * ext[0], y, sz * ext[1]));
  return pts;
}
function fitCamera() {
  const kind = board.kind || 'chess', w = stage.width, h = stage.height, portrait = h > w;
  cam.pitch = portrait ? 1.04 : 0.9;
  const topPx = (S.state === 'play' ? (kind === 'sky' ? 128 : 112) : 40), botPx = S.state === 'play' ? 86 : 30;
  const availY = 2 - 2 * (topPx + botPx) / h, availX = 1.9;
  camera.clearViewOffset(); cam.fov = portrait ? 48 : 40; camera.fov = cam.fov; camera.aspect = w / h; camera.updateProjectionMatrix();
  const pts = boardPoints(kind);
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
}
function updateCamera(dt, now) {
  if (camDirty) fitCamera();
  let dy = cam.yawTarget - cam.yaw; cam.yaw += dy * Math.min(1, dt * 3.2);
  let yaw = cam.yaw, dist = cam.dist, pitch = cam.pitch, offY = cam.offY, offX = 0;
  if (S.state !== 'play' && S.state !== 'paused' && S.state !== 'result') { cam.menuT += dt; yaw = cam.menuT * 0.08; dist *= 1.08; pitch = cam.pitch - 0.12; offY = -stage.height * (stage.height > stage.width ? 0.24 : 0.06); if (stage.width > stage.height * 1.2) { offX = -stage.width * 0.2; dist *= 1.12; } }
  const cx = Math.sin(yaw) * Math.cos(pitch) * dist, cy = Math.sin(pitch) * dist, cz = Math.cos(yaw) * Math.cos(pitch) * dist;
  cam.pos.set(cx, cy, cz); cam.look.set(0, 0, 0);
  const w = battle.camW;
  if (w > 0) { cam.pos.lerp(battle.camPos, w); cam.look.lerp(battle.camLook, w); offY *= 1 - w; offX *= 1 - w; }
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  camera.fov = (cam.fov || 40) + battle.fovDelta - fx.fovKick * 3;
  if (Math.abs(offY) > 0.5 || Math.abs(offX) > 0.5) camera.setViewOffset(stage.width, stage.height, offX, offY, stage.width, stage.height); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  fx.shake(camera, now, w > 0 ? 0.5 : 0.35);
  // xiangqi glyphs follow the 2P table rotation
  if (S.ctrl && S.ctrl.applyYaw && Math.abs(dy) > 0.001) S.ctrl.applyYaw(cam.yaw);
}

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
function pickBoard(cx, cy) {
  ndc.set(cx / stage.width * 2 - 1, -(cy / stage.height) * 2 + 1); ray.setFromCamera(ndc, camera);
  const out = new THREE.Vector3(); return ray.ray.intersectPlane(plane, out) ? out : null;
}
let down = null;
$('scene').addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; audio.init(); if (settings.music) audio.startMusic(); });
$('scene').addEventListener('pointerup', (e) => {
  if (!down) return; const d = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
  if (d > 18) return;
  if (battle.busy) { battle.skip(); return; }
  if (S.state !== 'play' || !S.ctrl || S.demo) return;
  hideEmotes();
  S.ctrl.tap(pickBoard(e.clientX, e.clientY));
});
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
  $('promo').classList.add('hidden'); cam.yawTarget = 0; cam.yaw = 0;
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
  cam.yawTarget = 0; cam.yaw = 0; camDirty = true;
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
};
