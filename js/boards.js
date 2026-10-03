// Reflective neon boards for the four games: a Reflector surface (mirror of pieces + city) mixed with a canvas-drawn
// emissive layout, a floating metal slab with neon edges, holo pylons, impact ripples, and move markers.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { T, glowMat, additive, pick } from './holo.js';

export const SKY_CELL = 0.64;
const COLS = ['#00e5ff', '#ff2bd6', '#ffd23c', '#3bff8a'];
export const SKY_COLORS = [0x00e5ff, 0xff2bd6, 0xffd23c, 0x3bff8a];

// ---------------------------------------------------------------- SKY RACE layout (15x15 grid, rotated so colour 0 sits bottom-left)
const RAW_PATH = [];
{ const seg = (pts) => RAW_PATH.push(...pts);
  for (let c = 1; c <= 5; c++) RAW_PATH.push([c, 6]); for (let r = 5; r >= 0; r--) RAW_PATH.push([6, r]); seg([[7, 0], [8, 0]]);
  for (let r = 1; r <= 5; r++) RAW_PATH.push([8, r]); for (let c = 9; c <= 14; c++) RAW_PATH.push([c, 6]); seg([[14, 7], [14, 8]]);
  for (let c = 13; c >= 9; c--) RAW_PATH.push([c, 8]); for (let r = 9; r <= 14; r++) RAW_PATH.push([8, r]); seg([[7, 14], [6, 14]]);
  for (let r = 13; r >= 9; r--) RAW_PATH.push([6, r]); for (let c = 5; c >= 0; c--) RAW_PATH.push([c, 8]); seg([[0, 7], [0, 6]]); }
const rot = ([c, r]) => [r, 14 - c];
export const SKY_PATH = RAW_PATH.map(rot);
const RAW_LANE = [[[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]];
export const SKY_LANE = RAW_LANE.map((l) => l.map(rot));
export const SKY_HOME = [[6.15, 7], [7, 6.15], [7.85, 7], [7, 7.85]].map(rot);
export const SKY_HANGAR = [[2.5, 2.5], [11.5, 2.5], [11.5, 11.5], [2.5, 11.5]].map(rot);
export const skyWorld = ([c, r]) => new THREE.Vector3((c - 7) * SKY_CELL, 0, (r - 7) * SKY_CELL);

// ---------------------------------------------------------------- board canvases
function canvasFor(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; }
// crisp look: much smaller canvas shadow blur so grid lines stay sharp (glow is an accent only)
function glowLine(g, color, width, blur) { g.strokeStyle = color; g.lineWidth = width; g.shadowColor = color; g.shadowBlur = pick(blur, Math.min(blur * 0.25, 3)); }
function drawChess(size, inner) {
  const [cv, g] = canvasFor(size, size); const px = size / inner, o = (inner - 8) / 2 * px;
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const light = (r + f) % 2 === 0;
    const x = o + f * px, y = o + r * px;
    const grd = g.createLinearGradient(x, y, x + px, y + px);
    if (light) { grd.addColorStop(0, 'rgba(40,120,170,0.55)'); grd.addColorStop(1, 'rgba(20,70,120,0.45)'); } else { grd.addColorStop(0, 'rgba(30,8,40,0.65)'); grd.addColorStop(1, 'rgba(14,4,24,0.6)'); }
    g.fillStyle = grd; g.fillRect(x, y, px, px);
    if (light) { g.strokeStyle = 'rgba(120,230,255,0.22)'; g.lineWidth = 2; g.strokeRect(x + 6, y + 6, px - 12, px - 12); }
    else { g.fillStyle = 'rgba(255,43,214,0.08)'; g.fillRect(x + px * 0.42, y + px * 0.42, px * 0.16, px * 0.16); }
  }
  glowLine(g, 'rgba(0,229,255,0.7)', 2, 6); for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(o + i * px, o); g.lineTo(o + i * px, o + 8 * px); g.stroke(); g.beginPath(); g.moveTo(o, o + i * px); g.lineTo(o + 8 * px, o + i * px); g.stroke(); }
  glowLine(g, '#ff2bd6', 5, 18); g.strokeRect(o - 14, o - 14, 8 * px + 28, 8 * px + 28);
  glowLine(g, '#00e5ff', 2, 10); g.strokeRect(o - 26, o - 26, 8 * px + 52, 8 * px + 52);
  g.shadowBlur = 8; g.fillStyle = 'rgba(160,240,255,0.85)'; g.font = `700 ${Math.round(px * 0.2)}px Orbitron, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) { g.fillText('abcdefgh'[i], o + (i + 0.5) * px, o + 8 * px + px * 0.27); g.fillText(String(8 - i), o - px * 0.27, o + (i + 0.5) * px); }
  return cv;
}
function drawXiangqi(w, h, inW, inH) {
  const [cv, g] = canvasFor(w, h); const px = w / inW, ox = (inW - 8) / 2 * px, oy = (inH - 9) / 2 * px;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h * 0.7); gr.addColorStop(0, 'rgba(60,20,70,0.55)'); gr.addColorStop(1, 'rgba(10,4,24,0.3)'); g.fillStyle = gr; g.fillRect(ox, oy, 8 * px, 9 * px);
  const X = (f) => ox + f * px, Y = (r) => oy + (9 - r) * px;
  glowLine(g, 'rgba(120,235,255,0.9)', 3, 8);
  for (let r = 0; r <= 9; r++) { g.beginPath(); g.moveTo(X(0), Y(r)); g.lineTo(X(8), Y(r)); g.stroke(); }
  for (let f = 0; f <= 8; f++) { g.beginPath(); if (f === 0 || f === 8) { g.moveTo(X(f), Y(0)); g.lineTo(X(f), Y(9)); } else { g.moveTo(X(f), Y(0)); g.lineTo(X(f), Y(4)); g.moveTo(X(f), Y(5)); g.lineTo(X(f), Y(9)); } g.stroke(); }
  glowLine(g, 'rgba(255,90,220,0.9)', 3, 10);
  for (const [a, b] of [[0, 2], [7, 9]]) { g.beginPath(); g.moveTo(X(3), Y(a)); g.lineTo(X(5), Y(b)); g.moveTo(X(5), Y(a)); g.lineTo(X(3), Y(b)); g.stroke(); }
  // point markers for soldiers / cannons
  glowLine(g, 'rgba(120,235,255,0.75)', 2, 4);
  const tick = (f, r) => { const x = X(f), y = Y(r), d = px * 0.08, l = px * 0.16; for (const sx of [-1, 1]) for (const sy of [-1, 1]) { if ((f === 0 && sx < 0) || (f === 8 && sx > 0)) continue; g.beginPath(); g.moveTo(x + sx * d, y + sy * (d + l)); g.lineTo(x + sx * d, y + sy * d); g.lineTo(x + sx * (d + l), y + sy * d); g.stroke(); } };
  for (const r of [3, 6]) for (const f of [0, 2, 4, 6, 8]) tick(f, r);
  for (const r of [2, 7]) for (const f of [1, 7]) tick(f, r);
  // river
  const ry = (Y(4) + Y(5)) / 2;
  const rg = g.createLinearGradient(0, Y(5), 0, Y(4)); rg.addColorStop(0, 'rgba(0,229,255,0.0)'); rg.addColorStop(0.5, 'rgba(0,229,255,0.16)'); rg.addColorStop(1, 'rgba(0,229,255,0.0)'); g.fillStyle = rg; g.fillRect(X(0) + 2, Y(5) + 2, 8 * px - 4, px - 4);
  g.font = `900 ${Math.round(px * 0.62)}px "Noto Serif TC","Noto Sans TC","PingFang HK",serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2bd6'; g.shadowBlur = 22; g.fillStyle = '#ff7ae6';
  g.fillText('楚　河', X(2), ry); g.fillText('漢　界', X(6), ry);
  g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillText('楚　河', X(2), ry); g.fillText('漢　界', X(6), ry);
  g.font = `700 ${Math.round(px * 0.13)}px Orbitron, sans-serif`; g.fillStyle = 'rgba(0,229,255,0.7)'; g.fillText('R I V E R   ·   B O R D E R', X(4), ry + px * 0.36);
  glowLine(g, '#ff2bd6', 5, 18); g.strokeRect(X(0) - px * 0.3, Y(9) - px * 0.3, 8 * px + px * 0.6, 9 * px + px * 0.6);
  glowLine(g, '#00e5ff', 2, 10); g.strokeRect(X(0) - px * 0.42, Y(9) - px * 0.42, 8 * px + px * 0.84, 9 * px + px * 0.84);
  return cv;
}
function drawFlip(size, inner, voids = []) {
  const [cv, g] = canvasFor(size, size); const px = size / inner, o = (inner - 8) / 2 * px;
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const x = o + c * px, y = o + r * px;
    if (voids.includes(r * 8 + c)) { g.fillStyle = 'rgba(255,40,80,0.10)'; g.fillRect(x, y, px, px); glowLine(g, 'rgba(255,60,100,0.8)', 3, 10); g.beginPath(); g.moveTo(x + px * 0.25, y + px * 0.25); g.lineTo(x + px * 0.75, y + px * 0.75); g.moveTo(x + px * 0.75, y + px * 0.25); g.lineTo(x + px * 0.25, y + px * 0.75); g.stroke(); continue; }
    const corner = (r === 0 || r === 7) && (c === 0 || c === 7);
    g.shadowBlur = 0; g.fillStyle = corner ? 'rgba(255,210,60,0.16)' : (r + c) % 2 ? 'rgba(10,60,70,0.45)' : 'rgba(14,74,86,0.5)'; g.fillRect(x + 3, y + 3, px - 6, px - 6);
  }
  glowLine(g, 'rgba(0,229,255,0.75)', 2.5, 8); for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(o + i * px, o); g.lineTo(o + i * px, o + 8 * px); g.stroke(); g.beginPath(); g.moveTo(o, o + i * px); g.lineTo(o + 8 * px, o + i * px); g.stroke(); }
  g.fillStyle = '#7ff6ff'; g.shadowColor = '#00e5ff'; g.shadowBlur = 10; for (const [a, b] of [[2, 2], [2, 6], [6, 2], [6, 6]]) { g.beginPath(); g.arc(o + a * px, o + b * px, px * 0.06, 0, Math.PI * 2); g.fill(); }
  glowLine(g, '#ffd23c', 3, 14); for (const [a, b] of [[0, 0], [7, 0], [0, 7], [7, 7]]) g.strokeRect(o + a * px + 8, o + b * px + 8, px - 16, px - 16);
  glowLine(g, '#3bff8a', 5, 18); g.strokeRect(o - 14, o - 14, 8 * px + 28, 8 * px + 28);
  glowLine(g, '#00e5ff', 2, 10); g.strokeRect(o - 26, o - 26, 8 * px + 52, 8 * px + 52);
  return cv;
}
function drawSky(size, inner, colours) {
  const [cv, g] = canvasFor(size, size); const px = size / inner, o = (inner - 15 * SKY_CELL) / 2 * px, cell = SKY_CELL * px;
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  const CX = (c) => o + (c + 0.5) * cell, CY = (r) => o + (r + 0.5) * cell;
  const rect = (c, r, fill, stroke, inset = 4) => { g.shadowBlur = 0; g.fillStyle = fill; g.fillRect(o + c * cell + inset, o + r * cell + inset, cell - inset * 2, cell - inset * 2); if (stroke) { glowLine(g, stroke, 2.5, 8); g.strokeRect(o + c * cell + inset, o + r * cell + inset, cell - inset * 2, cell - inset * 2); } };
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // hangars
  SKY_HANGAR.forEach(([c, r], i) => {
    const active = colours.includes(i), col = COLS[i];
    g.shadowBlur = 0; g.fillStyle = hex(col, active ? 0.10 : 0.03); g.fillRect(CX(c) - 2.7 * cell, CY(r) - 2.7 * cell, 5.4 * cell, 5.4 * cell);
    glowLine(g, hex(col, active ? 0.95 : 0.25), 4, active ? 16 : 0); g.strokeRect(CX(c) - 2.6 * cell, CY(r) - 2.6 * cell, 5.2 * cell, 5.2 * cell);
    glowLine(g, hex(col, active ? 0.6 : 0.15), 2, 6);
    for (const [dx, dy] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) { g.beginPath(); g.arc(CX(c + dx) - 0.5 * cell + 0.5 * cell, CY(r + dy), cell * 0.42, 0, Math.PI * 2); g.stroke(); }
  });
  // loop squares coloured by abs % 4
  SKY_PATH.forEach(([c, r], i) => {
    const col = COLS[i % 4];
    const start = i % 13 === 0;
    rect(c, r, hex(col, start ? 0.42 : 0.2), hex(col, start ? 1 : 0.7));
    if (start) { g.shadowBlur = 10; g.shadowColor = '#fff'; g.fillStyle = '#ffffff'; g.font = `900 ${Math.round(cell * 0.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✦', CX(c), CY(r)); }
  });
  SKY_LANE.forEach((lane, i) => lane.forEach(([c, r], k) => rect(c, r, hex(COLS[i], 0.16 + k * 0.06), hex(COLS[i], colours.includes(i) ? 0.9 : 0.3))));
  // home core
  const cx = CX(7), cy = CY(7), R = cell * 1.5;
  const corners = [[-1, 1], [-1, -1], [1, -1], [1, 1]]; // after rotation colour 0 lane enters from the bottom
  SKY_HOME.forEach(([c, r], i) => {
    const dx = (c - 7), dy = (r - 7);
    g.beginPath(); g.moveTo(cx, cy); const ang = Math.atan2(dy, dx); g.lineTo(cx + Math.cos(ang - Math.PI / 4) * R * 1.41, cy + Math.sin(ang - Math.PI / 4) * R * 1.41); g.lineTo(cx + Math.cos(ang + Math.PI / 4) * R * 1.41, cy + Math.sin(ang + Math.PI / 4) * R * 1.41); g.closePath();
    g.shadowBlur = 0; g.fillStyle = hex(COLS[i], 0.35); g.fill(); glowLine(g, COLS[i], 3, 12); g.stroke();
  });
  void corners;
  g.shadowBlur = 16; g.shadowColor = '#fff'; g.fillStyle = '#fff'; g.font = `900 ${Math.round(cell * 0.42)}px Orbitron, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOME', cx, cy);
  glowLine(g, '#00e5ff', 3, 12); g.strokeRect(o - 8, o - 8, 15 * cell + 16, 15 * cell + 16);
  return cv;
}

// ---------------------------------------------------------------- Board
export class Board {
  constructor(stage, scene) {
    this.stage = stage; this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.kind = null; this.pulse = new THREE.Vector4(0, 0, -100, 0); this.tint = new THREE.Color(0x00e5ff);
    this.markGroup = new THREE.Group(); this.group.add(this.markGroup); this.marks = [];
    this.pylons = [];
  }
  build(kind, opts = {}) {
    this.dispose(); this.kind = kind;
    const dims = { chess: [9.0, 9.0], xiangqi: [9.2, 10.2], flip: [9.0, 9.0], sky: [10.0, 10.0] }[kind];
    const [W, D] = dims; this.W = W; this.D = D;
    let cv;
    if (kind === 'chess') cv = drawChess(1536, W);
    else if (kind === 'xiangqi') cv = drawXiangqi(1380, Math.round(1380 * D / W), W, D);
    else if (kind === 'flip') cv = drawFlip(1536, W, opts.voids || []);
    else cv = drawSky(1600, W, opts.colours || [0, 1, 2, 3]);
    this.tex = new THREE.CanvasTexture(cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.tint.set(kind === 'flip' ? 0x3bff8a : kind === 'xiangqi' ? 0xff2bd6 : 0x00e5ff);
    const uniforms = { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uMap: { value: this.tex }, uTime: T, uPulse: { value: this.pulse }, uTint: { value: this.tint }, uRefl: { value: pick(0.5, 0.26) } };
    const shader = {
      name: 'NeonBoard', uniforms,
      vertexShader: /* glsl */`uniform mat4 textureMatrix; varying vec4 vUvR; varying vec2 vUv; varying vec3 vW;
        #include <common>
        void main(){ vUv = uv; vUvR = textureMatrix * vec4(position, 1.0); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`uniform vec3 color; uniform sampler2D tDiffuse; uniform sampler2D uMap; uniform float uTime, uRefl; uniform vec4 uPulse; uniform vec3 uTint;
        varying vec4 vUvR; varying vec2 vUv; varying vec3 vW;
        void main(){
          vec3 refl = vec3(0.0); float b = 0.004 * vUvR.w;
          refl += textureProj(tDiffuse, vUvR).rgb * 0.4;
          refl += textureProj(tDiffuse, vUvR + vec4(b, 0.0, 0.0, 0.0)).rgb * 0.15; refl += textureProj(tDiffuse, vUvR - vec4(b, 0.0, 0.0, 0.0)).rgb * 0.15;
          refl += textureProj(tDiffuse, vUvR + vec4(0.0, b, 0.0, 0.0)).rgb * 0.15; refl += textureProj(tDiffuse, vUvR - vec4(0.0, b, 0.0, 0.0)).rgb * 0.15;
          vec3 em = texture2D(uMap, vUv).rgb;
          vec3 col = vec3(0.004, 0.003, 0.012) + refl * uRefl * (0.55 + 0.45 * (1.0 - length(em))) + em * 1.25;
          float sweep = exp(-pow((vUv.y - fract(uTime * 0.07)) * 30.0, 2.0)); col += uTint * sweep * 0.05;
          float age = uTime - uPulse.z;
          if (age > 0.0 && age < 1.4) { float d = length(vW.xz - uPulse.xy); float r = age * 7.0; col += uTint * exp(-pow((d - r) * 2.2, 2.0)) * uPulse.w * (1.0 - age / 1.4) * (0.4 + length(em) * 2.0); }
          vec2 e = min(vUv, 1.0 - vUv); col *= 0.55 + 0.45 * smoothstep(0.0, 0.06, min(e.x, e.y));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    };
    const w = this.stage.width, h = this.stage.height, pr = this.stage.pixelRatio;
    const low = this.stage.flags.quality === 'low';
    if (!low) {
      this.surface = new Reflector(new THREE.PlaneGeometry(W, D), { clipBias: 0.003, textureWidth: Math.floor(w * pr * 0.5), textureHeight: Math.floor(h * pr * 0.5), color: 0xffffff, multisample: 0, shader });
    } else {
      uniforms.tDiffuse.value = new THREE.Texture(); uniforms.textureMatrix.value = new THREE.Matrix4();
      this.surface = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.ShaderMaterial({ uniforms, vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader }));
    }
    this.surface.rotation.x = -Math.PI / 2; this.group.add(this.surface);
    // slab + edges
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x0c0a1c, metalness: 0.85, roughness: 0.3, fog: false });
    this.slab = new THREE.Mesh(new RoundedBoxGeometry(W + 0.5, 0.55, D + 0.5, 3, 0.12), slabMat); this.slab.position.y = -0.29; this.group.add(this.slab);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.32, W * 0.42, 6, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x07051a, metalness: 0.7, roughness: 0.5 })); ped.position.y = -3.5; this.group.add(ped);
    this.edgeMat = glowMat(0x00e5ff, pick(2.4, 1.5)); this.edgeMat2 = glowMat(0xff2bd6, pick(2.2, 1.3));
    const e = (w2, d2, x, z, y, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.045, d2), m); b.position.set(x, y, z); this.group.add(b); };
    e(W + 0.52, 0.045, 0, (D + 0.5) / 2, -0.03, this.edgeMat); e(W + 0.52, 0.045, 0, -(D + 0.5) / 2, -0.03, this.edgeMat);
    e(0.045, D + 0.52, (W + 0.5) / 2, 0, -0.03, this.edgeMat); e(0.045, D + 0.52, -(W + 0.5) / 2, 0, -0.03, this.edgeMat);
    e(W + 0.3, 0.03, 0, (D + 0.5) / 2, -0.5, this.edgeMat2); e(W + 0.3, 0.03, 0, -(D + 0.5) / 2, -0.5, this.edgeMat2);
    e(0.03, D + 0.3, (W + 0.5) / 2, 0, -0.5, this.edgeMat2); e(0.03, D + 0.3, -(W + 0.5) / 2, 0, -0.5, this.edgeMat2);
    // corner pylons with spinning rings
    this.pylons = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new THREE.Group(); p.position.set(sx * (W / 2 + 0.25), 0, sz * (D / 2 + 0.25));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 8), slabMat); post.position.y = 0.4; p.add(post);
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), glowMat(sx * sz > 0 ? 0xff2bd6 : 0x00e5ff, 3)); orb.position.y = 0.95; p.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 32), additive(sx * sz > 0 ? 0xff2bd6 : 0x00e5ff, 2, 0.8)); ring.position.y = 0.95; p.add(ring);
      p.userData = { orb, ring }; this.group.add(p); this.pylons.push(p);
    }
    this.group.add(this.markGroup);
  }
  setTint(c) { this.tint.set(c); }
  ripple(x, z, strength = 1) { this.pulse.set(x, z, T.value, strength); }
  resize(w, h, pr) { if (this.surface && this.surface.getRenderTarget) this.surface.getRenderTarget().setSize(Math.floor(w * pr * 0.5), Math.floor(h * pr * 0.5)); }
  update(t) { for (const p of this.pylons) { p.userData.ring.rotation.x = t * 1.3; p.userData.ring.rotation.y = t * 0.9; p.userData.orb.rotation.y = t * 2; p.userData.orb.position.y = 0.95 + Math.sin(t * 2 + p.position.x) * 0.05; } for (const m of this.marks) if (m.visible && m.userData.pulse) { const k = 0.75 + Math.sin(t * 6) * 0.25; m.material.opacity = m.userData.op * k; if (m.userData.spin) m.rotation.z = t * 1.5; } }

  // ---------------- coordinate mapping
  /** world position of a logical cell */
  cellPos(kind, i) {
    if (kind === 'chess') { const f = (i - 21) % 10, r = 7 - Math.floor((i - 21) / 10); return new THREE.Vector3(f - 3.5, 0, 3.5 - r); }
    if (kind === 'xiangqi') { const f = i % 9, r = (i / 9) | 0; return new THREE.Vector3(f - 4, 0, 4.5 - r); }
    if (kind === 'flip') { const r = i >> 3, c = i & 7; return new THREE.Vector3(c - 3.5, 0, r - 3.5); }
    return null;
  }
  /** logical cell from a world point (or -1) */
  cellAt(kind, x, z) {
    if (kind === 'chess') { const f = Math.floor(x + 4), r = 7 - Math.floor(z + 4); if (f < 0 || f > 7 || r < 0 || r > 7) return -1; return 21 + f + (7 - r) * 10; }
    if (kind === 'xiangqi') { const f = Math.round(x + 4), r = Math.round(4.5 - z); if (f < 0 || f > 8 || r < 0 || r > 9) return -1; return r * 9 + f; }
    if (kind === 'flip') { const c = Math.floor(x + 4), r = Math.floor(z + 4); if (c < 0 || c > 7 || r < 0 || r > 7) return -1; return r * 8 + c; }
    return -1;
  }
  // ---------------- markers
  clearMarks() { for (const m of this.marks) m.visible = false; this.markUsed = 0; }
  mark(type, pos, color = 0x00e5ff) {
    this.markUsed = this.markUsed || 0;
    let m = this.marks[this.markUsed];
    if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(0xffffff, 1, 1)); m.rotation.x = -Math.PI / 2; this.markGroup.add(m); this.marks.push(m); }
    this.markUsed++;
    const geoFor = { dot: () => new THREE.CircleGeometry(0.13, 24), ring: () => new THREE.RingGeometry(0.36, 0.45, 40), square: () => sqRing(0.94, 0.07), tile: () => new THREE.PlaneGeometry(0.96, 0.96), big: () => new THREE.RingGeometry(0.42, 0.56, 40), pad: () => new THREE.RingGeometry(0.22, 0.3, 32) };
    if (m.userData.type !== type) { m.geometry.dispose(); m.geometry = geoFor[type](); m.userData.type = type; }
    const op = { dot: 0.9, ring: 0.95, square: 0.9, tile: 0.22, big: 1, pad: 0.9 }[type];
    m.material.color.set(color).multiplyScalar(type === 'tile' ? 1 : 2); m.material.opacity = op; m.userData.op = op; m.userData.pulse = type !== 'tile'; m.userData.spin = false;
    m.position.set(pos.x, 0.02 + this.markUsed * 0.0005, pos.z); m.visible = true; m.rotation.set(-Math.PI / 2, 0, 0);
    return m;
  }
  dispose() {
    this.clearMarks();
    for (const c of [...this.group.children]) { if (c === this.markGroup) continue; this.group.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose && o !== this.surface) o.material.dispose(); }); }
    if (this.surface && this.surface.dispose) this.surface.dispose();
    if (this.tex) this.tex.dispose();
    this.surface = null; this.pylons = [];
  }
}
function sqRing(s, w) {
  const sh = new THREE.Shape(); sh.moveTo(-s / 2, -s / 2); sh.lineTo(s / 2, -s / 2); sh.lineTo(s / 2, s / 2); sh.lineTo(-s / 2, s / 2); sh.closePath();
  const hole = new THREE.Path(); const i = s / 2 - w; hole.moveTo(-i, -i); hole.lineTo(-i, i); hole.lineTo(i, i); hole.lineTo(i, -i); hole.closePath(); sh.holes.push(hole);
  return new THREE.ShapeGeometry(sh);
}
