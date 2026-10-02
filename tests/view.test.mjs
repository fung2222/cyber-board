// node tests/view.test.mjs — camera clamp / damping maths (js/view.js, THREE-free)
import { VIEW_LIMITS as L, TAP, clampView, dampView, defaultView, isDefaultView, ViewInput } from '../js/view.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const ext = [4.12, 4.12];
for (const base of [0.9, 1.04, 1.2]) {
  const v = clampView({ zoom: 0.01, az: 9, el: 9, px: 99, pz: -99 }, base, ext);
  ok(near(v.zoom, L.zoomMin) && near(v.az, L.azMax) && near(base + v.el, L.pitchMax), 'upper clamps @' + base);
  ok(near(v.px, 4.12) && near(v.pz, -4.12), 'pan clamps to the board at max zoom');
  const w = clampView({ zoom: 9, az: -9, el: -9, px: 3, pz: 3 }, base, ext);
  ok(near(w.zoom, L.zoomMax) && near(w.az, -L.azMax) && near(base + w.el, L.pitchMin), 'lower clamps @' + base);
  ok(w.px === 0 && w.pz === 0, 'no pan when zoomed out');
}
const half = clampView({ zoom: (1 + L.zoomMin) / 2, az: 0, el: 0, px: 9, pz: 9 }, 1.2, ext);
ok(near(half.px, 2.06) && near(half.pz, 2.06), 'pan limit scales with zoom');
ok(L.pitchMin > 0.35 && L.pitchMax < Math.PI / 2, 'pitch never edge-on / never past top-down');
ok(L.azMax < Math.PI / 2, 'azimuth never reaches the side of the board');
const cur = defaultView(), tgt = { zoom: 0.5, az: 0.6, el: -0.2, px: 1, pz: -1 };
for (let i = 0; i < 60; i++) dampView(cur, tgt, 1 / 60);
ok(Math.abs(cur.zoom - 0.5) < 1e-3 && Math.abs(cur.az - 0.6) < 1e-3, 'damping converges within ~1 s');
const c1 = defaultView(); dampView(c1, tgt, 1 / 60); ok(c1.zoom < 1 && c1.zoom > 0.85, 'damping is smooth (no jump in one frame)');
const c2 = defaultView(); for (let i = 0; i < 6; i++) dampView(c2, tgt, 0.1);
ok(Math.abs(c2.zoom - cur.zoom) < 0.01, 'damping is frame-rate independent');
ok(isDefaultView(defaultView()) && !isDefaultView(tgt), 'isDefaultView');
// ---- tap-vs-gesture classifier (ViewInput) with a fake element and synthetic pointer events
const el = { style: {}, ls: {}, addEventListener(t, f) { this.ls[t] = f; }, setPointerCapture() {} };
const log = []; let enabled = true;
new ViewInput(el, { enabled: () => enabled, tap: (x, y) => log.push(['tap', x, y]), zoom: (f) => log.push(['zoom', f]), twist: (d) => log.push(['twist', d]),
  orbit: (a, e) => log.push(['orbit', a, e]), pan: (...a) => log.push(['pan', ...a]) });
const ev = (type, id, x, y, extra = {}) => el.ls[type]({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch', button: 0, preventDefault() {}, ...extra });
const kinds = () => log.map((l) => l[0]);
const sleep = (ms) => { const t = performance.now() + ms; while (performance.now() < t); };
// quick tap with 10 px jitter → tap
log.length = 0; ev('pointerdown', 1, 100, 100); ev('pointermove', 1, 108, 106); ev('pointerup', 1, 108, 106);
ok(kinds().join() === 'tap', 'tap ≤ 14 px is a tap');
// one-finger drag → orbit only, never a tap; horizontal = azimuth, vertical = tilt
sleep(TAP.afterGestureMs + 20); log.length = 0;
ev('pointerdown', 1, 100, 100); for (let i = 1; i <= 10; i++) ev('pointermove', 1, 100 + i * 8, 100); ev('pointerup', 1, 180, 100);
ok(!kinds().includes('tap') && kinds().includes('orbit') && log.filter((l) => l[0] === 'orbit').every((l) => l[1] < 0 && l[2] === 0), 'horizontal one-finger drag orbits azimuth, no tap');
// tap straight after a drag is blocked, then allowed again
log.length = 0; ev('pointerdown', 2, 50, 50); ev('pointerup', 2, 50, 50);
ok(!kinds().includes('tap'), 'tap right after a rotation drag is blocked');
sleep(TAP.afterGestureMs + 20); log.length = 0; ev('pointerdown', 3, 50, 50); ev('pointerup', 3, 50, 50);
ok(kinds().join() === 'tap', 'taps work again after the block window');
sleep(TAP.afterGestureMs + 20); log.length = 0;
ev('pointerdown', 1, 100, 100); for (let i = 1; i <= 10; i++) ev('pointermove', 1, 100, 100 + i * 8); ev('pointerup', 1, 100, 180);
ok(log.filter((l) => l[0] === 'orbit').every((l) => l[1] === 0 && l[2] > 0) && !kinds().includes('tap'), 'vertical one-finger drag tilts, no tap');
// two fingers: pinch zoom + drag pan, never a tap or orbit
sleep(TAP.afterGestureMs + 20); log.length = 0;
ev('pointerdown', 1, 100, 300); ev('pointerdown', 2, 200, 300);
for (let i = 1; i <= 6; i++) { ev('pointermove', 1, 100 - i * 10, 300); ev('pointermove', 2, 200 + i * 10, 300); }
for (let i = 1; i <= 6; i++) { ev('pointermove', 1, 40, 300 + i * 10); ev('pointermove', 2, 260, 300 + i * 10); }
ev('pointerup', 1, 40, 360); ev('pointermove', 2, 300, 400); ev('pointerup', 2, 300, 400);
ok(kinds().includes('zoom') && kinds().includes('pan') && !kinds().includes('tap') && !kinds().includes('orbit'), 'two fingers = zoom + pan; the last finger never taps or orbits');
ok(log.filter((l) => l[0] === 'zoom').reduce((p, l) => p * l[1], 1) < 0.7, 'spreading fingers zooms in');
// disabled (capture battle running): drags do nothing and are not taps
sleep(TAP.afterGestureMs + 20); log.length = 0; enabled = false;
ev('pointerdown', 1, 100, 100); for (let i = 1; i <= 6; i++) ev('pointermove', 1, 100 + i * 10, 100); ev('pointerup', 1, 160, 100);
ok(log.length === 0, 'drag during a battle: no orbit, no tap');
enabled = true;
// mouse: left-drag orbits, click taps, right-drag orbits
sleep(TAP.afterGestureMs + 20); log.length = 0;
const m = { pointerType: 'mouse' };
ev('pointerdown', 1, 10, 10, m); ev('pointerup', 1, 12, 11, m); ok(kinds().join() === 'tap', 'mouse click taps');
log.length = 0; ev('pointerdown', 1, 10, 10, m); for (let i = 1; i <= 5; i++) ev('pointermove', 1, 10 + i * 6, 10, m); ev('pointerup', 1, 40, 10, m);
ok(kinds().includes('orbit') && !kinds().includes('tap'), 'mouse left-drag orbits, no tap');
sleep(TAP.afterGestureMs + 20); log.length = 0;
ev('pointerdown', 1, 10, 10, { ...m, button: 2 }); for (let i = 1; i <= 5; i++) ev('pointermove', 1, 10 + i * 6, 10, m); ev('pointerup', 1, 40, 10, m);
ok(kinds().includes('orbit') && !kinds().includes('tap'), 'mouse right-drag orbits');
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
