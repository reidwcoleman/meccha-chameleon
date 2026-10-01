// Seeker pump shotgun: procedural model (splotch-painted like the reference), first-person view-model
// with sway / bob / recoil / pump animation, muzzle flash, 8-pellet hitscan, spark streaks and fading
// bullet-hole decals. Shared FX live in ShotgunFX (one per engine). Owner: F.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const CYCLE = 0.9;          // seconds between shots
export const PELLETS = 8;
export const SPREAD = 0.052;       // cone half-angle (rad)
export const RANGE = 70;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ textures
let _splotch = null;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Canvas texture: red / green / orange paint splotches over dark gunmetal, like the reference gun. */
export function splotchTexture() {
  if (_splotch) return _splotch;
  const W = 512, c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d');
  const r = rng(7);
  g.fillStyle = '#2a2320'; g.fillRect(0, 0, W, W);
  // grime
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${40 + r() * 40},${30 + r() * 30},${25 + r() * 20},${0.25 * r()})`; g.fillRect(r() * W, r() * W, 2 + r() * 6, 2 + r() * 6); }
  const cols = ['#b4221b', '#c62a1f', '#8e1712', '#2f8f3a', '#3aa543', '#1f6d2e', '#e0701f', '#f08a2a', '#1f5c5a', '#79c64a', '#d23c24'];
  const weights = [3, 3, 2, 3, 3, 2, 1.4, 1, 0.8, 0.9, 1.6];
  const tot = weights.reduce((a, b) => a + b, 0);
  const pick = () => { let x = r() * tot; for (let i = 0; i < cols.length; i++) { x -= weights[i]; if (x <= 0) return cols[i]; } return cols[0]; };
  const blob = (x, y, s, col) => {
    g.fillStyle = col;
    for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2, d = r() * s * 0.7;
      const rr = s * (0.35 + r() * 0.55);
      for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) { g.beginPath(); g.ellipse(x + Math.cos(a) * d + ox, y + Math.sin(a) * d + oy, rr, rr * (0.55 + r() * 0.6), r() * 3, 0, Math.PI * 2); g.fill(); }
    }
  };
  for (let i = 0; i < 60; i++) blob(r() * W, r() * W, 18 + r() * 44, pick());
  for (let i = 0; i < 90; i++) blob(r() * W, r() * W, 5 + r() * 12, pick());
  // speckles + paint drips
  for (let i = 0; i < 500; i++) { g.fillStyle = pick(); g.beginPath(); g.arc(r() * W, r() * W, 0.8 + r() * 2.2, 0, 7); g.fill(); }
  // worn edges: a few dark scratches
  g.strokeStyle = 'rgba(20,16,14,0.55)'; g.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) { g.beginPath(); const x = r() * W, y = r() * W; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 12); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _splotch = t;
  return t;
}

function starTexture() {
  const W = 128, c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.15, 'rgba(255,230,120,0.9)'); grd.addColorStop(0.45, 'rgba(255,150,40,0.25)'); grd.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, W);
  g.translate(W / 2, W / 2);
  const r = rng(3);
  for (let i = 0; i < 11; i++) {
    g.rotate((Math.PI * 2) / 11 + r() * 0.2);
    const len = W * (0.28 + r() * 0.22);
    const lg = g.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,220,1)'); lg.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(0, -3); g.lineTo(len, 0); g.lineTo(0, 3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function holeTexture() {
  const W = 64, c = document.createElement('canvas');
  c.width = c.height = W;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, W);
  const grd = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  grd.addColorStop(0, 'rgb(12,10,9)'); grd.addColorStop(0.22, 'rgb(25,20,18)'); grd.addColorStop(0.36, 'rgb(90,80,74)'); grd.addColorStop(0.62, 'rgb(190,185,180)'); grd.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = grd; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ model
function scaleUV(geo, su, sv, ou = 0, ov = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return geo;
}

/**
 * Build the pump shotgun. Units = metres, forward = -Z, origin at the trigger. Returns a Group with
 * userData { pump: Object3D (slides +Z when racked), muzzle: Object3D (barrel tip) }.
 */
export function buildShotgunModel({ detail = 1 } = {}) {
  const seg = detail > 0.5 ? 20 : 10;
  const tex = splotchTexture();
  const paintMetal = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.35, name: 'shotgun-paint' });
  const paintWood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.58, metalness: 0.05, name: 'shotgun-wood' });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 0.35, metalness: 0.8, name: 'shotgun-dark' });
  const gun = new THREE.Group();
  gun.name = 'shotgun';
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, parent = gun) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cylZ = (r, len, s = seg, rt = r) => new THREE.CylinderGeometry(rt, r, len, s).rotateX(Math.PI / 2);

  // receiver
  add(scaleUV(new RoundedBoxGeometry(0.046, 0.074, 0.25, 3, 0.012), 0.6, 1.6, 0.1, 0.3), paintMetal, 0, 0.034, -0.055);
  // ejection port (right side)
  add(new THREE.BoxGeometry(0.004, 0.024, 0.07), dark, 0.0235, 0.046, -0.07);
  // barrel
  add(scaleUV(cylZ(0.0118, 0.56), 1, 2.4, 0.3, 0), paintMetal, 0, 0.056, -0.455);
  add(cylZ(0.0085, 0.01, seg), dark, 0, 0.056, -0.736);                // bore
  add(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8d0c0, metalness: 0.9, roughness: 0.2 }), 0, 0.071, -0.72); // bead
  // magazine tube + cap + barrel clamp
  add(scaleUV(cylZ(0.0128, 0.46), 1, 2, 0.55, 0.2), paintMetal, 0, 0.022, -0.405);
  add(cylZ(0.0145, 0.03), dark, 0, 0.022, -0.64);
  add(new RoundedBoxGeometry(0.03, 0.052, 0.022, 2, 0.006), paintMetal, 0, 0.04, -0.6);
  // pump fore-end with grip ridges (lathe profile)
  const pump = new THREE.Group();
  pump.position.set(0, 0.021, -0.35);
  gun.add(pump);
  const prof = [];
  const L = 0.2;
  prof.push(new THREE.Vector2(0.0, -L / 2));
  prof.push(new THREE.Vector2(0.021, -L / 2));
  for (let i = 0; i <= 14; i++) {
    const z = -L / 2 + 0.012 + (i / 14) * (L - 0.024);
    prof.push(new THREE.Vector2(i % 2 ? 0.0275 : 0.0245, z));
  }
  prof.push(new THREE.Vector2(0.021, L / 2));
  prof.push(new THREE.Vector2(0.0, L / 2));
  const lathe = new THREE.LatheGeometry(prof, seg).rotateX(Math.PI / 2);
  lathe.scale(1.12, 1.0, 1);
  add(scaleUV(lathe, 1.6, 1.2, 0.12, 0.6), paintWood, 0, 0, 0, 0, 0, 0, pump);
  // trigger guard + trigger
  add(new THREE.TorusGeometry(0.024, 0.0042, 6, 16, Math.PI), paintMetal, 0, -0.004, 0.012, 0, Math.PI / 2, Math.PI);
  add(new THREE.BoxGeometry(0.006, 0.026, 0.008), dark, 0, -0.012, 0.006, 0.3);
  // stock: extruded side profile (pistol-grip-less classic stock)
  const s = new THREE.Shape();
  s.moveTo(0.0, 0.066); s.lineTo(0.08, 0.058); s.bezierCurveTo(0.2, 0.052, 0.3, 0.06, 0.395, 0.068);
  s.lineTo(0.405, 0.06); s.lineTo(0.41, -0.085); s.lineTo(0.395, -0.1);
  s.bezierCurveTo(0.28, -0.07, 0.16, -0.035, 0.07, -0.025);
  s.bezierCurveTo(0.045, -0.03, 0.03, -0.05, 0.018, -0.045);
  s.lineTo(0.0, 0.0); s.lineTo(0.0, 0.066);
  const sg = new THREE.ExtrudeGeometry(s, { depth: 0.036, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: detail > 0.5 ? 10 : 5 });
  sg.translate(0, 0, -0.018);
  sg.rotateY(-Math.PI / 2); // profile x -> +Z (backwards)
  scaleUV(sg, 2.2, 2.2, 0.4, 0.1);
  add(sg, paintWood, 0, 0.0, 0.07);
  // butt pad
  add(new RoundedBoxGeometry(0.044, 0.17, 0.018, 2, 0.006), dark, 0, -0.012, 0.485);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.056, -0.745);
  gun.add(muzzle);
  gun.userData.pump = pump;
  gun.userData.pumpRest = pump.position.z;
  gun.userData.muzzle = muzzle;
  return gun;
}

/** White mannequin hand + forearm for the view model (matches the mannequin's vinyl look). */
function buildArm() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.55, metalness: 0, name: 'vm-arm' });
  const g = new THREE.Group();
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), mat);
  hand.scale.set(0.95, 1.1, 1.25);
  hand.position.set(0.005, -0.022, 0.065);
  g.add(hand);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.3, 8, 18), mat);
  fore.position.set(0.07, -0.07, 0.22);
  fore.rotation.set(-1.1, 0.0, 0.62);
  g.add(fore);
  const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.05, 6, 10), mat);
  fingers.position.set(-0.018, -0.018, 0.035);
  fingers.rotation.set(0.2, 0, 1.4);
  g.add(fingers);
  // left hand on the pump
  const lh = new THREE.Mesh(new THREE.SphereGeometry(0.042, 18, 12), mat);
  lh.scale.set(1.05, 0.9, 1.5);
  lh.position.set(-0.012, -0.018, 0);
  lh.name = 'leftHand';
  g.userData.leftHand = lh;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return g;
}

// ------------------------------------------------------------------ shared FX
/** Sparks, bullet holes, muzzle flashes and light bursts. One per engine: ShotgunFX.get(engine). */
export class ShotgunFX {
  static get(engine) {
    if (!engine.__shotgunFX) engine.__shotgunFX = new ShotgunFX(engine);
    return engine.__shotgunFX;
  }

  constructor(engine) {
    this.engine = engine;
    const scene = engine.scene;
    // sparks: line streaks, additive, HDR colours so they bloom
    this.maxSparks = 320;
    const pos = new Float32Array(this.maxSparks * 6);
    const col = new Float32Array(this.maxSparks * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.sparkLines.frustumCulled = false;
    this.sparkLines.renderOrder = 10;
    this.sparkLines.userData.noProbe = true;
    scene.add(this.sparkLines);
    this.sparks = [];
    for (let i = 0; i < this.maxSparks; i++) this.sparks.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, heat: 1 });
    this._sparkIdx = 0;
    // decals: instanced multiply-blended quads
    this.maxDecals = 96;
    const dm = new THREE.MeshBasicMaterial({ map: holeTexture(), blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), dm, this.maxDecals);
    this.decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.decals.setColorAt(0, new THREE.Color(1, 1, 1));
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 2;
    this.decals.userData.noProbe = true;
    scene.add(this.decals);
    this.decalData = [];
    this._decalIdx = 0;
    // flash sprites (world-space, for third-person shots and impacts)
    this.star = starTexture();
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, color: new THREE.Color(3, 2.5, 1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      s.visible = false;
      s.userData.noProbe = true;
      scene.add(s);
      this.flashes.push({ s, life: 0, max: 0.06, size: 0.5 });
    }
    this._flashIdx = 0;
    // light bursts (always in the scene so adding a flash never recompiles shaders)
    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 7, 2);
      l.userData.noProbe = true;
      scene.add(l);
      this.lights.push({ l, peak: 0, t: 1 });
    }
    this._lightIdx = 0;
    this._tmpM = new THREE.Matrix4();
    this._tmpC = new THREE.Color();
    this.unsub = engine.onUpdate((dt) => this.update(dt), 900);
  }

  burstLight(pos, peak = 26) {
    const L = this.lights[this._lightIdx++ % this.lights.length];
    L.l.position.copy(pos); L.peak = peak; L.t = 0;
  }

  flash(pos, size = 0.5, life = 0.06) {
    const f = this.flashes[this._flashIdx++ % this.flashes.length];
    f.s.position.copy(pos); f.life = life; f.max = life; f.size = size;
    f.s.material.rotation = Math.random() * Math.PI * 2;
    f.s.visible = true;
    f.s.scale.setScalar(size);
  }

  sparksAt(point, normal, n = 7, speed = 4, heat = 1) {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this._sparkIdx++ % this.maxSparks];
      s.p.copy(point).addScaledVector(normal, 0.01);
      s.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.6).add(normal).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      s.max = s.life = 0.18 + Math.random() * 0.3;
      s.heat = heat * (0.7 + Math.random() * 0.6);
    }
  }

  sparksDir(point, dir, n = 6, speed = 9) {
    for (let i = 0; i < n; i++) {
      const s = this.sparks[this._sparkIdx++ % this.maxSparks];
      s.p.copy(point);
      s.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9).add(dir).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      s.max = s.life = 0.06 + Math.random() * 0.12;
      s.heat = 1.4;
    }
  }

  decal(point, normal, size = 0.045) {
    const i = this._decalIdx++ % this.maxDecals;
    _q.setFromUnitVectors(Z, normal);
    const rot = new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * Math.PI * 2);
    _q.multiply(rot);
    const s = size * (0.8 + Math.random() * 0.4);
    this._tmpM.compose(_v.copy(point).addScaledVector(normal, 0.002), _q, _v2.set(s, s, s));
    this.decals.setMatrixAt(i, this._tmpM);
    this.decals.setColorAt(i, this._tmpC.setRGB(1, 1, 1));
    this.decalData[i] = { age: 0 };
    this.decals.count = Math.min(this.maxDecals, Math.max(this.decals.count, i + 1));
    this.decals.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    // sparks
    const P = this.sparkLines.geometry.attributes.position.array;
    const C = this.sparkLines.geometry.attributes.color.array;
    const g = 9.8;
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparks[i];
      const j = i * 6;
      if (s.life <= 0) { if (C[j] !== 0 || C[j + 3] !== 0) { C.fill(0, j, j + 6); } continue; }
      s.life -= dt;
      s.v.y -= g * dt;
      s.v.multiplyScalar(Math.exp(-2.5 * dt));
      s.p.addScaledVector(s.v, dt);
      const k = Math.max(0, s.life / s.max);
      const tail = 0.012 + s.v.length() * 0.012;
      const vl = s.v.length() || 1;
      P[j] = s.p.x; P[j + 1] = s.p.y; P[j + 2] = s.p.z;
      P[j + 3] = s.p.x - (s.v.x / vl) * tail; P[j + 4] = s.p.y - (s.v.y / vl) * tail; P[j + 5] = s.p.z - (s.v.z / vl) * tail;
      const h = s.heat * k;
      C[j] = 4 * h; C[j + 1] = 3.0 * h * (0.4 + 0.6 * k); C[j + 2] = 0.9 * h * k;
      C[j + 3] = 1.2 * h; C[j + 4] = 0.5 * h; C[j + 5] = 0.05 * h;
    }
    this.sparkLines.geometry.attributes.position.needsUpdate = true;
    this.sparkLines.geometry.attributes.color.needsUpdate = true;
    // decals fade after 7 s over 3 s
    let dirty = false;
    for (let i = 0; i < this.decals.count; i++) {
      const d = this.decalData[i];
      if (!d) continue;
      d.age += dt;
      if (d.age > 7) {
        const f = Math.min(1, (d.age - 7) / 3);
        this.decals.setColorAt(i, this._tmpC.setRGB(f, f, f));
        dirty = true;
      }
    }
    if (dirty && this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true;
    // flashes
    for (const f of this.flashes) {
      if (!f.s.visible) continue;
      f.life -= dt;
      if (f.life <= 0) { f.s.visible = false; continue; }
      const k = f.life / f.max;
      f.s.material.opacity = k;
      f.s.scale.setScalar(f.size * (0.7 + 0.5 * (1 - k)));
    }
    // light bursts
    for (const L of this.lights) {
      if (L.t >= 1) { if (L.l.intensity) L.l.intensity = 0; continue; }
      L.t += dt / 0.09;
      L.l.intensity = L.peak * Math.max(0, 1 - L.t) ** 2;
    }
  }
}

// ------------------------------------------------------------------ hitscan
/**
 * Fire PELLETS rays in a cone from origin along dir. Static hits get sparks + decals; actor hits are
 * returned (first point per actor). opts: { ignore: [actorIds], fx, pellets, spread, rng }
 * -> { hits: [{ actorId, point, actor }], impacts: [{ point, normal }] }
 */
export function firePellets(physics, origin, dir, opts = {}) {
  const fx = opts.fx;
  const n = opts.pellets ?? PELLETS;
  const spread = opts.spread ?? SPREAD;
  const rnd = opts.rng || Math.random;
  const d = _v.copy(dir).normalize().clone();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  a.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
  b.crossVectors(d, a);
  const hits = new Map();
  const impacts = [];
  for (let i = 0; i < n; i++) {
    // stratified disc sample: one pellet in the centre ring, the rest around
    const ang = (i / n) * Math.PI * 2 + rnd() * 0.8;
    const rad = spread * Math.sqrt(i === 0 ? rnd() * 0.15 : 0.25 + rnd() * 0.75);
    const pd = d.clone().addScaledVector(a, Math.cos(ang) * Math.tan(rad)).addScaledVector(b, Math.sin(ang) * Math.tan(rad)).normalize();
    const h = physics.raycast(origin, pd, opts.range ?? RANGE, { ignore: opts.ignore });
    if (!h) continue;
    if (h.actorId != null) {
      if (!hits.has(h.actorId)) hits.set(h.actorId, { actorId: h.actorId, point: h.point.clone(), actor: h.actor });
      fx?.sparksAt(h.point, h.normal, 3, 2.5, 0.6);
      continue;
    }
    impacts.push({ point: h.point.clone(), normal: h.normal.clone() });
    if (fx) {
      fx.sparksAt(h.point, h.normal, 5 + ((rnd() * 4) | 0), 3.5);
      fx.decal(h.point, h.normal);
      if (i % 3 === 0) fx.flash(h.point.clone().addScaledVector(h.normal, 0.02), 0.16, 0.05);
    }
  }
  return { hits: [...hits.values()], impacts };
}

// ------------------------------------------------------------------ first-person view model
/**
 * First-person shotgun, parented to the camera. update(dt, state) each frame; fire(origin, dir, opts)
 * shoots (if ready) and returns the firePellets result (or null when still cycling).
 */
export class Shotgun {
  constructor({ engine, physics, camera }) {
    this.engine = engine;
    this.physics = physics;
    this.camera = camera;
    this.fx = ShotgunFX.get(engine);
    this.cooldown = 0;
    this.t = 10;                // time since last shot
    this.root = new THREE.Group();   // sway / bob / recoil
    this.root.name = 'viewmodel';
    this.gun = buildShotgunModel({ detail: 1 });
    this.arm = buildArm();
    this.gun.add(this.arm);
    this.gun.userData.pump.add(this.arm.userData.leftHand);
    this.root.add(this.gun);
    // view-model scale trick: the whole rig is shrunk and pulled in, so it never pokes into walls
    this.scale = 0.34;
    this.root.scale.setScalar(this.scale);
    this.hip = new THREE.Vector3(0.118, -0.083, -0.2);
    this.aimPos = new THREE.Vector3(0.0, -0.047, -0.17);
    this.root.position.copy(this.hip);
    this.gun.rotation.set(0.035, 0.02, 0);
    // muzzle flash sprite (view-model space)
    const fm = new THREE.SpriteMaterial({ map: this.fx.star, color: new THREE.Color(3.2, 2.6, 1.5), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false });
    this.flash = new THREE.Sprite(fm);
    this.flash.visible = false;
    this.flash.renderOrder = 20;
    this.gun.userData.muzzle.add(this.flash);
    this.flash.position.set(0, 0, -0.08);
    this.flashT = 1;
    this.camera.add(this.root);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.userData.noProbe = true; o.frustumCulled = false; } });
    // springs
    this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.kick = 0; this.kickV = 0;
    this.aimK = 0;
    this.bobPhase = 0;
    this.visible = true;
    this.onPump = null;
  }

  get ready() { return this.t >= CYCLE; }
  setVisible(v) { this.visible = v; this.root.visible = v; }

  /** World position of the muzzle. */
  muzzleWorld(out = new THREE.Vector3()) { this.root.updateWorldMatrix(true, true); return this.gun.userData.muzzle.getWorldPosition(out); }

  fire(origin, dir, opts = {}) {
    if (!this.ready) return null;
    this.t = 0;
    this._pumped = false;
    this.kickV += 7.5;
    this.flashT = 0;
    this.flash.visible = true;
    this.flash.material.rotation = Math.random() * Math.PI * 2;
    const mw = this.muzzleWorld(new THREE.Vector3());
    this.fx.burstLight(mw, 30);
    this.fx.sparksDir(mw, dir, 8, 10);
    return firePellets(this.physics, origin, dir, { ...opts, fx: this.fx });
  }

  update(dt, { lookDX = 0, lookDY = 0, speed = 0, grounded = true, aim = false, bob = 0, bobX = 0 } = {}) {
    this.t += dt;
    // sway: gun lags behind mouse motion
    this.swayV.x += (-this.sway.x * 90 - this.swayV.x * 13) * dt - lookDX * 0.9;
    this.swayV.y += (-this.sway.y * 90 - this.swayV.y * 13) * dt + lookDY * 0.9;
    this.sway.x += this.swayV.x * dt; this.sway.y += this.swayV.y * dt;
    this.sway.clampScalar(-0.06, 0.06);
    // recoil spring
    this.kickV += (-this.kick * 220 - this.kickV * 20) * dt;
    this.kick += this.kickV * dt;
    this.aimK += ((aim ? 1 : 0) - this.aimK) * (1 - Math.exp(-12 * dt));
    // pump animation
    const pump = this.gun.userData.pump;
    let pk = 0;
    const t = this.t;
    if (t > 0.26 && t < 0.62) {
      const u = (t - 0.26) / 0.36;
      pk = u < 0.45 ? Math.sin((u / 0.45) * Math.PI / 2) : Math.cos(((u - 0.45) / 0.55) * Math.PI / 2);
      if (!this._pumped && u > 0.1) { this._pumped = true; this.onPump?.(); }
    }
    pump.position.z = this.gun.userData.pumpRest + pk * 0.09;
    // walking bob (in addition to the camera bob)
    const moving = grounded ? Math.min(speed / 4.2, 1.2) : 0;
    this.bobPhase += dt * (5.2 + speed * 1.15);
    const bx = Math.cos(this.bobPhase) * 0.006 * moving;
    const by = Math.abs(Math.sin(this.bobPhase)) * 0.005 * moving;
    const base = _v.copy(this.hip).lerp(this.aimPos, this.aimK);
    this.root.position.set(base.x + this.sway.x * 0.25 + bx, base.y + this.sway.y * 0.25 - by - bob * 0.2, base.z + this.kick * 0.028);
    this.root.rotation.set(this.kick * 0.16 + pk * 0.05 + this.sway.y * 0.8, this.sway.x * 0.9, -pk * 0.12 + this.sway.x * 0.6 - this.aimK * 0.02);
    // muzzle flash sprite
    if (this.flash.visible) {
      this.flashT += dt;
      const k = 1 - this.flashT / 0.055;
      if (k <= 0) this.flash.visible = false;
      else { this.flash.material.opacity = k; this.flash.scale.setScalar(0.34 * (0.8 + 0.6 * (1 - k))); }
    }
  }

  dispose() {
    this.camera.remove(this.root);
  }
}

/** Third-person shotgun for hunter mannequins (attach to the body; bots use this). */
export function buildThirdPersonGun() {
  const g = buildShotgunModel({ detail: 0.4 });
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noProbe = true; } });
  return g;
}
