// 3D holographic pieces: chess (lathe silhouettes + crowns/crenels/horse head), xiangqi (neon discs with glyphs),
// FLIP discs (two-tone), SKY RACE jets, and the holo die. Every piece = root (board position) → body (animated) → meshes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeos, at, lathe, holoShell, holoCore, glowMat, glyphTexture, T } from './holo.js';
import { GLYPH } from './rules/xiangqi.js';

const S = 0.86; // chess piece scale
const geoCache = {};
function chessGeo(type) {
  if (geoCache[type]) return geoCache[type];
  let parts;
  switch (type) {
    case 1: parts = [lathe([[0, 0], [0.34, 0], [0.34, 0.06], [0.28, 0.09], [0.22, 0.13], [0.14, 0.28], [0.11, 0.36], [0.18, 0.38], [0.18, 0.41], [0.1, 0.44], [0.15, 0.48], [0.175, 0.54], [0.155, 0.61], [0.09, 0.66], [0, 0.67]])]; break;
    case 2: {
      const sh = new THREE.Shape();
      const pts = [[-0.2, 0.18], [0.19, 0.18], [0.13, 0.36], [0.09, 0.45], [0.25, 0.54], [0.3, 0.62], [0.24, 0.71], [0.07, 0.79], [0.03, 0.9], [-0.04, 0.82], [-0.1, 0.88], [-0.15, 0.76], [-0.21, 0.6], [-0.23, 0.42]];
      sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]); sh.closePath();
      const head = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
      head.translate(0, 0, -0.08);
      parts = [lathe([[0, 0], [0.35, 0], [0.35, 0.07], [0.28, 0.1], [0.24, 0.14], [0.22, 0.22], [0, 0.22]]), head];
      break;
    }
    case 3: parts = [lathe([[0, 0], [0.34, 0], [0.34, 0.06], [0.27, 0.1], [0.22, 0.14], [0.13, 0.4], [0.11, 0.5], [0.18, 0.52], [0.18, 0.55], [0.11, 0.57], [0.16, 0.63], [0.19, 0.72], [0.15, 0.82], [0.07, 0.89], [0, 0.9]]), at(new THREE.SphereGeometry(0.055, 12, 8), 0, 0.94, 0)]; break;
    case 4: {
      parts = [lathe([[0, 0], [0.36, 0], [0.36, 0.07], [0.3, 0.1], [0.26, 0.14], [0.21, 0.3], [0.2, 0.56], [0.27, 0.6], [0.28, 0.72], [0.21, 0.72], [0.21, 0.69], [0, 0.69]])];
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; parts.push(at(new THREE.BoxGeometry(0.13, 0.1, 0.09), Math.cos(a) * 0.235, 0.77, Math.sin(a) * 0.235, 0, -a, 0)); }
      break;
    }
    case 5: {
      parts = [lathe([[0, 0], [0.37, 0], [0.37, 0.07], [0.3, 0.11], [0.24, 0.15], [0.13, 0.5], [0.11, 0.62], [0.2, 0.65], [0.2, 0.68], [0.12, 0.7], [0.17, 0.8], [0.23, 0.92], [0.17, 0.94], [0.09, 0.97], [0, 0.98]])];
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; parts.push(at(new THREE.SphereGeometry(0.04, 8, 6), Math.cos(a) * 0.215, 0.95, Math.sin(a) * 0.215)); }
      parts.push(at(new THREE.SphereGeometry(0.065, 12, 8), 0, 1.04, 0));
      break;
    }
    case 6: parts = [lathe([[0, 0], [0.38, 0], [0.38, 0.07], [0.31, 0.11], [0.25, 0.16], [0.14, 0.55], [0.12, 0.66], [0.21, 0.69], [0.21, 0.72], [0.13, 0.74], [0.18, 0.86], [0.2, 0.96], [0.13, 1.0], [0, 1.01]]),
      at(new THREE.BoxGeometry(0.06, 0.24, 0.06), 0, 1.12, 0), at(new THREE.BoxGeometry(0.18, 0.06, 0.06), 0, 1.15, 0)]; break;
  }
  const g = mergeGeos(parts); g.scale(S, S, S); g.computeBoundingBox();
  return (geoCache[type] = g);
}
const discGeo = lathe([[0, 0], [0.38, 0], [0.42, 0.025], [0.44, 0.08], [0.43, 0.14], [0.39, 0.175], [0, 0.175]], 48);
const ringGeo = new THREE.TorusGeometry(0.34, 0.018, 6, 48).rotateX(Math.PI / 2);

export class Piece {
  /** kind: 'chess' | 'xiangqi'; type: piece type; side: 1 / -1; color: hex */
  constructor(kind, type, side, color, opts = {}) {
    this.kind = kind; this.type = type; this.side = side; this.color = new THREE.Color(color);
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.shellMat = holoShell(color, { rim: 2.4, base: kind === 'chess' ? 0.06 : 0.04 });
    this.coreMat = holoCore(color);
    const geo = kind === 'chess' ? chessGeo(type) : discGeo;
    this.core = new THREE.Mesh(geo, this.coreMat); this.body.add(this.core);
    this.shell = new THREE.Mesh(geo, this.shellMat); this.shell.scale.setScalar(1.035); this.body.add(this.shell);
    this.ringMat = glowMat(color, 2.4, 0.9);
    this.ring = new THREE.Mesh(ringGeo, this.ringMat); this.ring.position.y = 0.012; this.root.add(this.ring);
    if (kind === 'chess' && type === 2) {
      const eyeM = glowMat(0xffffff, 3); for (const z of [-0.12, 0.12]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeM); e.position.set(0.14 * S, 0.64 * S, z * S); this.body.add(e); }
    }
    if (kind === 'chess') this.core.rotation.y = this.shell.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
    if (kind === 'xiangqi') {
      const tex = glyphTexture(GLYPH[type][side === 1 ? 0 : 1], '#' + this.color.getHexString());
      this.glyphMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) });
      this.glyph = new THREE.Mesh(new THREE.CircleGeometry(0.39, 40), this.glyphMat); this.glyph.rotation.x = -Math.PI / 2; this.glyph.position.y = 0.181; this.body.add(this.glyph);
      this.ring.scale.setScalar(1.25);
    }
    this.height = kind === 'chess' ? geo.boundingBox.max.y : 0.18;
    this.phase = Math.random() * 6.28; this.selected = false; this.flashK = 0; this.hover = 0;
    this.root.userData.piece = this;
  }
  setGlyphYaw(yaw) { if (this.glyph) this.glyph.rotation.z = yaw; }
  flash(k = 1) { this.flashK = Math.max(this.flashK, k); }
  update(dt, t, frozen = false) {
    if (!frozen) {
      this.flashK = Math.max(0, this.flashK - dt * 4);
      const target = this.selected ? 1 : 0; this.hover += (target - this.hover) * Math.min(1, dt * 10);
    }
    this.shellMat.uniforms.uFlash.value = this.flashK;
    if (this.coreMat) this.coreMat.emissive.copy(this.color).multiplyScalar(0.22 + this.flashK * 2 + this.hover * 0.25);
    if (!this.cinematic) {
      this.body.position.y = 0.03 + Math.sin(t * 1.6 + this.phase) * 0.02 + this.hover * 0.28;
      this.body.rotation.y = this.hover * Math.sin(t * 2) * 0.25;
    }
    this.ringMat.opacity = 0.55 + Math.sin(t * 2.4 + this.phase) * 0.2 + this.hover * 0.4;
  }
  dispose() { this.root.removeFromParent(); this.shellMat.dispose(); this.coreMat.dispose(); this.ringMat.dispose(); if (this.glyphMat) { this.glyphMat.map.dispose(); this.glyphMat.dispose(); } }
}

// ---------------------------------------------------------------- FLIP disc (top = cyan side 1, bottom = magenta side -1)
const halfDisc = new THREE.CylinderGeometry(0.4, 0.4, 0.06, 40);
export class Disc {
  constructor(side, colA, colB) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.matA = holoCore(colA, { emissive: 0.55, metal: 0.6, rough: 0.3 }); this.matB = holoCore(colB, { emissive: 0.55, metal: 0.6, rough: 0.3 });
    const a = new THREE.Mesh(halfDisc, this.matA); a.position.y = 0.03; const b = new THREE.Mesh(halfDisc, this.matB); b.position.y = -0.03;
    this.flipper = new THREE.Group(); this.flipper.add(a, b); this.body.add(this.flipper);
    this.rimA = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.014, 6, 40).rotateX(Math.PI / 2), glowMat(colA, 2.6)); this.rimA.position.y = 0.062;
    this.rimB = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.014, 6, 40).rotateX(Math.PI / 2), glowMat(colB, 2.6)); this.rimB.position.y = -0.062;
    this.dotA = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 32).rotateX(-Math.PI / 2), glowMat(colA, 2.4)); this.dotA.position.y = 0.062;
    this.dotB = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 32).rotateX(Math.PI / 2), glowMat(colB, 2.4)); this.dotB.position.y = -0.062;
    this.flipper.add(this.rimA, this.rimB, this.dotA, this.dotB);
    this.side = side; this.flipper.rotation.x = side === 1 ? 0 : Math.PI;
    this.anim = null; this.phase = Math.random() * 6.28; this.flashK = 0;
  }
  /** animate a flip to `side` after `delay` seconds */
  flipTo(side, delay = 0, dur = 0.42) { this.anim = { t: -delay, dur, from: this.flipper.rotation.x, to: side === 1 ? 0 : Math.PI * (Math.random() < 0.5 ? 1 : -1), side }; this.side = side; }
  update(dt, t) {
    if (this.anim) {
      const a = this.anim; a.t += dt;
      if (a.t >= 0) {
        const k = Math.min(1, a.t / a.dur);
        this.flipper.rotation.x = a.from + (a.to - a.from) * (1 - Math.pow(1 - k, 3));
        this.body.position.y = Math.sin(k * Math.PI) * 0.55;
        if (k >= 1) { this.flipper.rotation.x = a.side === 1 ? 0 : Math.PI; this.body.position.y = 0; this.anim = null; this.landed = true; }
      }
    } else this.body.position.y = 0.065 + Math.sin(t * 1.4 + this.phase) * 0.012;
    this.flashK = Math.max(0, this.flashK - dt * 3);
    const e = 0.55 + this.flashK * 3; this.matA.emissive.setScalar(0); this.matA.emissive.copy(this.rimA.material.color).multiplyScalar(e / 2.6 * 0.6); this.matB.emissive.copy(this.rimB.material.color).multiplyScalar(e / 2.6 * 0.6);
  }
  dispose() { this.root.removeFromParent(); }
}

// ---------------------------------------------------------------- SKY RACE jet
export class Jet {
  constructor(color) {
    this.color = new THREE.Color(color);
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const fus = lathe([[0, -0.32], [0.05, -0.3], [0.075, -0.12], [0.07, 0.12], [0.035, 0.28], [0, 0.33]], 16); fus.rotateX(Math.PI / 2);
    const wingS = new THREE.Shape(); wingS.moveTo(0, 0.08); wingS.lineTo(0.34, -0.1); wingS.lineTo(0.34, -0.16); wingS.lineTo(0, -0.08); wingS.closePath();
    const wingL = new THREE.ExtrudeGeometry(wingS, { depth: 0.02, bevelEnabled: false }); wingL.rotateX(Math.PI / 2);
    const wingR = wingL.clone(); wingR.scale(-1, 1, 1);
    const tailS = new THREE.Shape(); tailS.moveTo(0, 0); tailS.lineTo(0, 0.17); tailS.lineTo(-0.1, 0.17); tailS.lineTo(-0.16, 0); tailS.closePath();
    const tail = new THREE.ExtrudeGeometry(tailS, { depth: 0.016, bevelEnabled: false }); tail.rotateY(Math.PI / 2); tail.translate(-0.008, 0.02, -0.14);
    const geo = mergeGeos([fus, wingL, wingR, tail]);
    this.coreMat = holoCore(color, { emissive: 0.35 }); this.shellMat = holoShell(color, { rim: 2.6, base: 0.08 });
    this.core = new THREE.Mesh(geo, this.coreMat); this.shell = new THREE.Mesh(geo, this.shellMat); this.shell.scale.setScalar(1.05);
    this.body.add(this.core, this.shell);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 10).rotateX(-Math.PI / 2), glowMat(color, 3, 0.85)); this.flame.position.z = -0.42; this.body.add(this.flame);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.014, 6, 36).rotateX(Math.PI / 2), glowMat(color, 2.2, 0.8)); this.ring.position.y = 0.01; this.root.add(this.ring);
    this.root.scale.setScalar(0.82); this.phase = Math.random() * 6.28; this.flashK = 0; this.selectable = false; this.cinematic = false;
  }
  flash(k = 1) { this.flashK = Math.max(this.flashK, k); }
  update(dt, t) {
    this.flashK = Math.max(0, this.flashK - dt * 4);
    this.shellMat.uniforms.uFlash.value = this.flashK;
    if (!this.cinematic) { this.body.position.y = 0.2 + Math.sin(t * 2 + this.phase) * 0.04 + (this.selectable ? 0.12 + Math.sin(t * 6) * 0.05 : 0); this.body.rotation.z = Math.sin(t * 1.3 + this.phase) * 0.08; }
    this.flame.scale.z = 0.8 + Math.sin(t * 40 + this.phase) * 0.2;
    this.ring.material.opacity = this.selectable ? 0.9 + Math.sin(t * 8) * 0.1 : 0.45;
    this.ring.scale.setScalar(this.selectable ? 1.25 + Math.sin(t * 6) * 0.1 : 1);
  }
}

// ---------------------------------------------------------------- holo die
const FACE_VAL = [3, 4, 1, 6, 2, 5];                        // box groups: +x −x +y −y +z −z
const FACE_N = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
function pipTexture(v, color) {
  const s = 128, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  g.strokeStyle = color; g.lineWidth = 5; g.shadowColor = color; g.shadowBlur = 10; g.strokeRect(10, 10, s - 20, s - 20);
  const P = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.26, .26], [.5, .5], [.74, .74]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.26, .26], [.74, .26], [.5, .5], [.26, .74], [.74, .74]], 6: [[.28, .24], [.72, .24], [.28, .5], [.72, .5], [.28, .76], [.72, .76]] }[v];
  g.fillStyle = v === 6 ? '#ffffff' : color; for (const [x, y] of P) { g.beginPath(); g.arc(x * s, y * s, v === 1 ? 15 : 11, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class HoloDie {
  constructor(color = 0x00e5ff) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const css = '#' + new THREE.Color(color).getHexString();
    this.mats = FACE_VAL.map((v) => new THREE.MeshStandardMaterial({ color: 0x0a0618, metalness: 0.5, roughness: 0.35, emissive: 0xffffff, emissiveMap: pipTexture(v, css), emissiveIntensity: 1.6 }));
    this.cube = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.62, 0.62, 3, 0.09), this.mats); this.body.add(this.cube);
    this.shellMat = holoShell(color, { rim: 2.2, base: 0.05 }); this.shell = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.66, 0.66, 3, 0.1), this.shellMat); this.body.add(this.shell);
    this.value = 1; this.anim = null; this.q = new THREE.Quaternion();
    this.setValue(1, true);
  }
  setColor(c) { const css = '#' + new THREE.Color(c).getHexString(); this.mats.forEach((m, i) => { m.emissiveMap.dispose(); m.emissiveMap = pipTexture(FACE_VAL[i], css); m.needsUpdate = true; }); this.shellMat.uniforms.uColor.value.set(c); }
  quatFor(v, yaw = 0) { const i = FACE_VAL.indexOf(v); const q = new THREE.Quaternion().setFromUnitVectors(FACE_N[i], new THREE.Vector3(0, 1, 0)); return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q); }
  setValue(v, instant = false) { this.value = v; this.q.copy(this.quatFor(v, Math.random() * 6.28)); if (instant) this.body.quaternion.copy(this.q); }
  /** tumble then settle on v; dur seconds */
  roll(v, dur = 0.9) {
    this.value = v; const end = this.quatFor(v, (Math.random() - 0.5) * 0.8);
    this.anim = { t: 0, dur, end, axis: new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize(), spin: 14 + Math.random() * 6 };
  }
  get rolling() { return !!this.anim; }
  update(dt, t) {
    if (this.anim) {
      const a = this.anim; a.t += dt; const k = Math.min(1, a.t / a.dur);
      const spinQ = new THREE.Quaternion().setFromAxisAngle(a.axis, a.spin * (1 - k) * (1 - k) * a.dur);
      this.body.quaternion.copy(a.end).premultiply(spinQ);
      this.body.position.y = 0.45 + Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * 1.3;
      if (k >= 1) { this.body.quaternion.copy(a.end); this.anim = null; this.landed = true; }
    } else this.body.position.y = 0.45 + Math.sin(t * 2) * 0.05;
  }
}
export { T };
