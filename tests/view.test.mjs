// node tests/view.test.mjs — camera clamp / damping maths (js/view.js, THREE-free)
import { VIEW_LIMITS as L, clampView, dampView, defaultView, isDefaultView } from '../js/view.js';
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
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
