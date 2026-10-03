// Holographic materials + small geometry helpers (no BufferGeometryUtils in the kit, so a tiny merge lives here).
import * as THREE from 'three';
export const T = { value: 0 };                        // shared shader time
/**
 * Readability look (v0.3 glow pass). crisp = true while the shared glow setting is LOW (default): piece shells, rings,
 * glyphs and board lines stay below the bloom threshold so they render sharp; effects / capture battles still glow.
 * pick(high, low) returns the value for the current look. Applied when boards / pieces are (re)built.
 */
export const LOOK = { crisp: true };
export const pick = (high, low) => (LOOK.crisp ? low : high);

/** merge non-indexed copies of geometries (position + normal [+ uv]) into one BufferGeometry */
export function mergeGeos(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
export const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s))); return g; };
export const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** additive fresnel + scanline hologram shell */
export function holoShell(color, { rim = 2.2, base = 0.12, scan = 0.22 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: T, uFlash: { value: 0 }, uRim: { value: rim }, uBase: { value: base }, uScan: { value: scan }, uFade: { value: 1 } },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uTime, uFlash, uRim, uBase, uScan, uFade; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        float sc = smoothstep(0.65, 1.0, sin(vW.y * 46.0 - uTime * 5.0)) * uScan;
        float band = smoothstep(0.96, 1.0, sin(vW.y * 3.0 - uTime * 2.2)) * 0.6;
        vec3 col = uColor * (fr * uRim + uBase + sc + band) + vec3(1.0) * uFlash * (0.6 + fr);
        gl_FragColor = vec4(col * uFade, 1.0);
      }`,
  });
}
/** dark glossy core (reflects the scene environment) tinted with the side colour */
export function holoCore(color, { emissive = 0.22, metal = 0.85, rough = 0.24 } = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.18).add(new THREE.Color(0.02, 0.02, 0.04)), metalness: metal, roughness: rough, emissive: c.clone().multiplyScalar(emissive), envMapIntensity: 1.4, fog: false });
}
export function glowMat(color, k = 2.2, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, transparent: opacity < 1, opacity, blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opacity >= 1, fog: false });
}
export function additive(color, k = 1.6, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}
/** canvas glyph texture (xiangqi characters, labels) */
export function glyphTexture(text, color, { size = 256, font = '900 150px "Noto Serif TC","Noto Sans TC","PingFang HK","Microsoft JhengHei",serif', ring = true, glow = 18, bg = null, face = 'rgba(6,3,18,0.9)' } = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = color; g.shadowBlur = glow;
  if (ring && face) { g.fillStyle = face; g.beginPath(); g.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2); g.fill(); }
  if (ring) { g.strokeStyle = color; g.lineWidth = size * 0.035; g.beginPath(); g.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); g.stroke(); g.lineWidth = size * 0.012; g.beginPath(); g.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = color; g.font = font; g.fillText(text, size / 2, size / 2 + size * 0.02);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.globalAlpha = 0.7; g.fillText(text, size / 2, size / 2 + size * 0.02);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const easeIn = (k) => k * k * k;
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const backOut = (k, s = 1.7) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2);
export const clamp01 = (k) => Math.max(0, Math.min(1, k));
