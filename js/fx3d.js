// 3D effect primitives for capture battles and flips: neon shards, slash arcs, beams, plasma orbs,
// chain lightning, afterimages, and an impact light (single pre-allocated PointLight — no shader recompiles).
import * as THREE from 'three';
import { T } from './holo.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
export class FX3D {
  constructor(scene) {
    this.scene = scene;
    // shards
    this.maxShards = 520;
    this.shardMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.075), new THREE.MeshBasicMaterial({ toneMapped: false }), this.maxShards);
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.shardMesh.frustumCulled = false;
    this.shardMesh.setColorAt(0, new THREE.Color()); this.shards = []; this.shardMesh.count = 0; scene.add(this.shardMesh);
    this.items = [];          // generic timed effects { obj, t, dur, update(k, dt), dispose }
    this.light = new THREE.PointLight(0xffffff, 0, 7, 1.6); this.light.position.set(0, 1, 0); scene.add(this.light); this.lightK = 0;
  }
  /** neon shards exploding from a volume (victim shatter) */
  shatter(pos, color, { count = 60, height = 0.8, radius = 0.35, speed = 4.5, up = 3, color2 = null, dir = null } = {}) {
    const c1 = new THREE.Color(color), c2 = color2 ? new THREE.Color(color2) : new THREE.Color(1, 1, 1);
    for (let i = 0; i < count; i++) {
      if (this.shards.length >= this.maxShards) this.shards.shift();
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius, y = Math.random() * height;
      const p = new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y + y, pos.z + Math.sin(a) * r);
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(speed * (0.4 + Math.random())); v.y = up * (0.3 + Math.random());
      if (dir) v.addScaledVector(dir, speed * 0.6);
      const col = (Math.random() < 0.25 ? c2 : c1).clone().multiplyScalar(1.6 + Math.random() * 1.8);
      this.shards.push({ p, v, axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), ang: Math.random() * 6, spin: 6 + Math.random() * 14, life: 0, max: 1.1 + Math.random() * 0.9, size: 0.6 + Math.random() * 1.3, col });
    }
  }
  /** arc slash: ring sector sweeping around `center`, in a plane given by normal; radius r */
  slash(center, normal, color, { r = 0.6, width = 0.16, dur = 0.28, arc = Math.PI * 1.4, start = 0, dirSign = 1 } = {}) {
    const geo = new THREE.RingGeometry(r - width, r + width * 0.3, 64, 1, 0, arc);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(color) }, uHead: { value: 0 }, uArc: { value: arc }, uFade: { value: 1 }, uR: { value: r }, uW: { value: width } },
      vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uHead, uArc, uFade, uR, uW; varying vec2 vP;
        void main(){ float a = atan(vP.y, vP.x); if (a < 0.0) a += 6.2831853; float head = uHead * uArc; float d = head - a;
          if (d < 0.0) discard; float tail = exp(-d * 2.6); float rr = length(vP); float edge = smoothstep(uR - uW, uR + uW * 0.3, rr);
          vec3 col = mix(uColor, vec3(1.0), edge * edge * 0.8) * (0.5 + 2.4 * edge) * tail;
          gl_FragColor = vec4(col * uFade, 1.0); }`,
    });
    const m = new THREE.Mesh(geo, mat); m.position.copy(center);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize()); m.rotateZ(start); if (dirSign < 0) m.scale.x = -1;
    this.scene.add(m);
    this.add(m, dur + 0.25, (k, t) => { mat.uniforms.uHead.value = Math.min(1, t / dur); mat.uniforms.uFade.value = t < dur ? 1 : 1 - (t - dur) / 0.25; });
    return m;
  }
  /** straight energy beam from a to b */
  beam(a, b, color, { width = 0.07, dur = 0.35, grow = 0.08 } = {}) {
    const len = a.distanceTo(b); const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const m = new THREE.Mesh(geo, mat); m.add(core); core.scale.set(0.35, 0.35, 1);
    m.position.copy(a); m.lookAt(b); this.scene.add(m);
    this.add(m, dur, (k, t) => { const g = Math.min(1, t / grow); m.scale.set(width * (1 - k * 0.7) * (1 + Math.sin(t * 80) * 0.15), width * (1 - k * 0.7), len * g); mat.opacity = 1 - k * k; core.material.opacity = 1 - k; }, () => { core.material.dispose(); });
    return m;
  }
  /** glowing orb (plasma shot) — caller moves it; returns handle with .obj and .kill() */
  orb(pos, color, r = 0.16) {
    const g = new THREE.Group(); g.position.copy(pos);
    const core = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5), toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    g.add(core, halo); this.scene.add(g);
    const h = { obj: g, alive: true, kill: () => { if (!h.alive) return; h.alive = false; g.removeFromParent(); g.traverse((o) => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); } };
    this.items.push({ obj: g, t: 0, dur: 9, update: (k, t) => { halo.scale.setScalar(1 + Math.sin(t * 40) * 0.15); }, manual: h });
    return h;
  }
  /** jagged lightning bolt a → b */
  lightning(a, b, color, { dur = 0.3, jag = 0.22, width = 0.022, segs = 9 } = {}) {
    const pts = []; const dir = b.clone().sub(a);
    for (let i = 0; i <= segs; i++) { const p = a.clone().addScaledVector(dir, i / segs); if (i > 0 && i < segs) { p.x += (Math.random() - 0.5) * jag; p.y += Math.random() * jag * 0.8; p.z += (Math.random() - 0.5) * jag; } pts.push(p); }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), segs * 3, width, 4, false);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(geo, mat); this.scene.add(m);
    this.add(m, dur, (k, t) => { mat.opacity = (1 - k) * (0.6 + 0.4 * Math.sin(t * 90)); });
    return m;
  }
  /** fading ghost copy of an object (afterimage) */
  ghost(src, color, dur = 0.35) {
    const g = new THREE.Group(); src.updateWorldMatrix(true, true);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    src.traverse((o) => { if (o.isMesh && o.geometry && o.visible) { const c = new THREE.Mesh(o.geometry, mat); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); g.add(c); } });
    this.scene.add(g);
    this.add(g, dur, (k) => { mat.opacity = 0.6 * (1 - k); }, () => {}, true);
  }
  /** column of light (corner capture, home arrival) */
  pillar(pos, color, { h = 6, r = 0.45, dur = 0.9 } = {}) {
    const geo = new THREE.CylinderGeometry(r, r * 1.3, h, 24, 1, true); geo.translate(0, h / 2, 0);
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(color) }, uA: { value: 1 }, uTime: T },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uA, uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * uA; a *= 0.7 + 0.3 * sin(vUv.y * 40.0 - uTime * 20.0); gl_FragColor = vec4(uColor * a * 3.0, 1.0); }` });
    const m = new THREE.Mesh(geo, mat); m.position.copy(pos); this.scene.add(m);
    this.add(m, dur, (k) => { mat.uniforms.uA.value = (1 - k) * (k < 0.1 ? k * 10 : 1); m.scale.set(1 + k * 0.8, 1, 1 + k * 0.8); });
  }
  flashLight(pos, color, k = 1) { this.light.position.copy(pos).add(_v.set(0, 0.6, 0)); this.light.color.set(color); this.lightK = Math.max(this.lightK, k); }
  add(obj, dur, update, onDispose, shareGeo = false) { this.items.push({ obj, t: 0, dur, update, onDispose, shareGeo }); }
  clear() { for (const it of this.items) this.kill(it); this.items.length = 0; }
  kill(it) { if (it.manual) { it.manual.kill(); return; } it.obj.removeFromParent(); it.obj.traverse((o) => { if (!it.shareGeo && o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); it.onDispose && it.onDispose(); }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.manual && !it.manual.alive) { this.items.splice(i, 1); continue; }
      it.t += dt; const k = Math.min(1, it.t / it.dur); it.update(k, it.t, dt);
      if (k >= 1 && !it.manual) { this.kill(it); this.items.splice(i, 1); }
    }
    // shards
    const sh = this.shards; let n = 0;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i]; s.life += dt; if (s.life >= s.max) { sh.splice(i, 1); continue; }
      s.v.y -= 9.5 * dt; s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.03 && s.v.y < 0) { s.p.y = 0.03; s.v.y *= -0.38; s.v.x *= 0.62; s.v.z *= 0.62; s.spin *= 0.7; }
      s.ang += s.spin * dt;
    }
    for (const s of sh) {
      const k = 1 - s.life / s.max; _q.setFromAxisAngle(s.axis, s.ang); _s.setScalar(s.size * Math.sqrt(k));
      _m.compose(s.p, _q, _s); this.shardMesh.setMatrixAt(n, _m); _c.copy(s.col).multiplyScalar(0.4 + k * 0.8); this.shardMesh.setColorAt(n, _c); n++;
    }
    this.shardMesh.count = n; this.shardMesh.instanceMatrix.needsUpdate = true; if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
    this.lightK = Math.max(0, this.lightK - dt * 5); this.light.intensity = this.lightK * 40;
  }
}
