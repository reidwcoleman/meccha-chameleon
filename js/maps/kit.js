// Shared map-construction kit. Every map builds through this. See SPEC.md §Map kit.
//
// Conventions (read SPEC.md for the full list):
//  - Units are metres, +Y up. Floors at y=0 unless a map has storeys.
//  - kit.box/wall/floor produce WORLD-SCALED UVs: 1 UV unit = `uvScale` metres (default 1), so a
//    texture repeats at the same density on every surface regardless of the box size.
//  - mesh.userData.collide === false  -> physics ignores it (decor, hanging lamps, rugs).
//    Invisible collider-only meshes: visible=false, userData.colliderOnly=true.
//  - Static kit geometry is merged per-material in kit.finish() (called by the engine after build).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v = new THREE.Vector3();

/** BoxGeometry whose UVs are in metres/uvScale on every face. */
export function worldBox(w, h, d, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    let su, sv;
    if (nx > 0.5) { su = d; sv = h; } else if (ny > 0.5) { su = w; sv = d; } else { su = w; sv = h; }
    uv.setXY(i, (uv.getX(i) * su) / uvScale, (uv.getY(i) * sv) / uvScale);
  }
  return g;
}

export class Kit {
  constructor(root, assets, engine) {
    this.root = root;
    this.assets = assets;
    this.engine = engine;
    this.spawns = { hider: [], seeker: [] };
    this.hideSpots = [];
    this.lights = [];
    this._statics = [];
    this.shadowLights = 0;
  }

  // ---------- primitives ----------

  /** Solid box. o: { pos:[x,y,z] (centre), rot:[x,y,z], uv=1, collide=true, cast=true, receive=true, merge=true, parent } */
  box(w, h, d, mat, o = {}) {
    const m = new THREE.Mesh(worldBox(w, h, d, o.uv ?? 1), mat);
    return this._add(m, o);
  }

  /** Box by min/max corners (handy for architecture). */
  boxAB(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    return this.box(w, h, d, mat, { ...o, pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
  }

  /** Cylinder. o as box plus radialSegments, radiusTop. */
  cyl(r, h, mat, o = {}) {
    const g = new THREE.CylinderGeometry(o.radiusTop ?? r, r, h, o.segments ?? 24, 1, !!o.open);
    if (o.uv) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / o.uv, (uv.getY(i) * h) / o.uv); }
    return this._add(new THREE.Mesh(g, mat), o);
  }

  sphere(r, mat, o = {}) {
    return this._add(new THREE.Mesh(new THREE.SphereGeometry(r, o.segments ?? 24, Math.max(8, (o.segments ?? 24) >> 1)), mat), o);
  }

  /** Any geometry. */
  mesh(geometry, mat, o = {}) { return this._add(new THREE.Mesh(geometry, mat), o); }

  /** Horizontal slab (floor/ceiling) from x0,z0 to x1,z1 at top height y, thickness t. */
  floor(x0, z0, x1, z1, y, mat, o = {}) {
    const t = o.t ?? 0.2;
    return this.boxAB(x0, y - t, z0, x1, y, z1, mat, o);
  }
  ceiling(x0, z0, x1, z1, y, mat, o = {}) {
    const t = o.t ?? 0.2;
    return this.boxAB(x0, y, z0, x1, y + t, z1, mat, o);
  }

  /**
   * Straight wall along a segment (ax,az)->(bx,bz), from y0 to y1, thickness t (centred on the line).
   * gaps: [{ a, b, y0, y1 }] in metres ALONG the wall from point A (door: y0=wall y0, y1=2.3).
   * Doorways must be >= 1.6 m wide for players and bots to pass comfortably.
   */
  wall(ax, az, bx, bz, y0, y1, mat, o = {}) {
    const t = o.t ?? 0.2;
    const len = Math.hypot(bx - ax, bz - az);
    const ang = Math.atan2(bz - az, bx - ax);
    const gaps = (o.gaps || []).map((g) => ({ a: Math.max(0, g.a), b: Math.min(len, g.b), y0: g.y0 ?? y0, y1: g.y1 ?? Math.min(y1, y0 + 2.3) })).sort((p, q) => p.a - q.a);
    // Split into vertical bands, then emit solid rectangles for each band minus its gaps.
    const cuts = new Set([0, len]);
    for (const g of gaps) { cuts.add(g.a); cuts.add(g.b); }
    const xs = [...cuts].sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = xs[i], s1 = xs[i + 1];
      if (s1 - s0 < 1e-4) continue;
      const mid = (s0 + s1) / 2;
      const holes = gaps.filter((g) => mid > g.a && mid < g.b).sort((p, q) => p.y0 - q.y0);
      let cy = y0;
      const spans = [];
      for (const h of holes) { if (h.y0 > cy) spans.push([cy, h.y0]); cy = Math.max(cy, h.y1); }
      if (y1 > cy) spans.push([cy, y1]);
      for (const [sy0, sy1] of spans) {
        if (sy1 - sy0 < 1e-4) continue;
        const cx = ax + Math.cos(ang) * mid, cz = az + Math.sin(ang) * mid;
        out.push(this.box(s1 - s0, sy1 - sy0, t, mat, { ...o, pos: [cx, (sy0 + sy1) / 2, cz], rot: [0, -ang, 0] }));
      }
    }
    return out;
  }

  /**
   * Rectangular room shell. r: { x0, z0, x1, z1, y=0, h=3, floor, wall, ceiling (mat or null),
   *   t=0.2, doors: { n:[{a,b,h}], s:[], e:[], w:[] } } — n is the z0 side, s the z1 side,
   *   w the x0 side, e the x1 side. Door a/b are measured from the room's min x (n/s) or min z (e/w).
   * Walls sit OUTSIDE the floor rectangle so the interior is exactly x0..x1, z0..z1.
   */
  room(r) {
    const y = r.y ?? 0, h = r.h ?? 3, t = r.t ?? 0.2;
    const { x0, z0, x1, z1 } = r;
    const dz = (list) => (list || []).map((d) => ({ a: d.a + t, b: d.b + t, y0: y + (d.y0 ?? 0), y1: y + (d.h ?? 2.3) }));
    const dzs = (list) => (list || []).map((d) => ({ a: d.a, b: d.b, y0: y + (d.y0 ?? 0), y1: y + (d.h ?? 2.3) }));
    if (r.floor) this.floor(x0, z0, x1, z1, y, r.floor, { uv: r.floorUV ?? 1 });
    if (r.ceiling) this.ceiling(x0, z0, x1, z1, y + h, r.ceiling, { uv: r.ceilUV ?? 1 });
    if (r.wall) {
      const o = { t, uv: r.wallUV ?? 1 };
      const d = r.doors || {};
      if (!r.skip?.includes('n')) this.wall(x0 - t, z0 - t / 2, x1 + t, z0 - t / 2, y, y + h, r.wallN ?? r.wall, { ...o, gaps: dz(d.n) });
      if (!r.skip?.includes('s')) this.wall(x0 - t, z1 + t / 2, x1 + t, z1 + t / 2, y, y + h, r.wallS ?? r.wall, { ...o, gaps: dz(d.s) });
      if (!r.skip?.includes('w')) this.wall(x0 - t / 2, z0, x0 - t / 2, z1, y, y + h, r.wallW ?? r.wall, { ...o, gaps: dzs(d.w) });
      if (!r.skip?.includes('e')) this.wall(x1 + t / 2, z0, x1 + t / 2, z1, y, y + h, r.wallE ?? r.wall, { ...o, gaps: dzs(d.e) });
    }
  }

  /** Straight staircase from (x,y,z) climbing `rise` over `run` in direction dir ('+x','-x','+z','-z'), width w. */
  stairs(x, y, z, run, rise, w, dir, mat, o = {}) {
    const steps = o.steps ?? Math.max(2, Math.round(rise / 0.18));
    const sr = rise / steps, sd = run / steps;
    const out = [];
    for (let i = 0; i < steps; i++) {
      const top = y + sr * (i + 1);
      const a = sd * i, b = sd * (i + 1);
      let x0, x1, z0, z1;
      if (dir === '+x') { x0 = x + a; x1 = x + b; z0 = z - w / 2; z1 = z + w / 2; }
      else if (dir === '-x') { x0 = x - b; x1 = x - a; z0 = z - w / 2; z1 = z + w / 2; }
      else if (dir === '+z') { z0 = z + a; z1 = z + b; x0 = x - w / 2; x1 = x + w / 2; }
      else { z0 = z - b; z1 = z - a; x0 = x - w / 2; x1 = x + w / 2; }
      out.push(this.boxAB(x0, o.solid ? y : top - sr, z0, x1, top, z1, mat, o));
    }
    // Invisible ramp collider so characters glide up instead of snagging on every step.
    const len = Math.hypot(run, rise);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(dir.includes('x') ? len : w, 0.05, dir.includes('x') ? w : len), this.assets.mat('collider', { color: 0xff00ff }));
    const ang = Math.atan2(rise, run);
    const cx = dir === '+x' ? x + run / 2 : dir === '-x' ? x - run / 2 : x;
    const cz = dir === '+z' ? z + run / 2 : dir === '-z' ? z - run / 2 : z;
    ramp.position.set(cx, y + rise / 2 + 0.02, cz);
    if (dir === '+x') ramp.rotation.z = ang; else if (dir === '-x') ramp.rotation.z = -ang;
    else if (dir === '+z') ramp.rotation.x = -ang; else ramp.rotation.x = ang;
    ramp.visible = false;
    ramp.userData.colliderOnly = true;
    this.root.add(ramp);
    return out;
  }

  /** Invisible collider box (for props whose render mesh is too detailed to collide). */
  collider(w, h, d, pos, rotY = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.assets.mat('collider', { color: 0xff00ff }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.y = rotY;
    m.visible = false;
    m.userData.colliderOnly = true;
    this.root.add(m);
    return m;
  }

  /**
   * Place a Poly Haven / glTF model. o: { pos, rotY, scale, collide: true|false|'box', fitHeight, parent }
   * collide:'box' (default) adds one invisible box collider from the model's bounds and marks the
   * render meshes collide=false.
   */
  async model(id, o = {}) {
    const obj = await this.assets.gltf(id);
    if (o.fitHeight) {
      const b = new THREE.Box3().setFromObject(obj);
      const h = b.max.y - b.min.y;
      if (h > 0) obj.scale.multiplyScalar(o.fitHeight / h);
    }
    if (o.scale) obj.scale.multiplyScalar(o.scale);
    if (o.pos) obj.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rotY) obj.rotation.y = o.rotY;
    if (o.rot) obj.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    (o.parent || this.root).add(obj);
    obj.updateMatrixWorld(true);
    const mode = o.collide ?? 'box';
    obj.traverse((c) => { if (c.isMesh) { c.userData.collide = mode === true; c.castShadow = o.cast ?? true; c.receiveShadow = true; } });
    if (mode === 'box') {
      // Oriented box in the model's local frame (rotated with rotY).
      const inv = new THREE.Matrix4().makeRotationY(-(obj.rotation.y));
      const lb = new THREE.Box3();
      obj.traverse((c) => {
        if (!c.isMesh) return;
        c.geometry.computeBoundingBox();
        const bb = c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld);
        // bring corners into yaw-free frame around obj position
        const corners = [];
        for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z));
        for (const p of corners) { p.sub(obj.position).applyMatrix4(inv); lb.expandByPoint(p); }
      });
      if (!lb.isEmpty()) {
        const size = lb.getSize(new THREE.Vector3());
        const c = lb.getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().makeRotationY(obj.rotation.y)).add(obj.position);
        const col = this.collider(size.x * (o.colliderScale ?? 1), size.y, size.z * (o.colliderScale ?? 1), [c.x, c.y, c.z], obj.rotation.y);
        obj.userData.collider = col;
      }
    }
    return obj;
  }

  /** Put any Object3D into the map. */
  place(obj, o = {}) {
    if (o.pos) obj.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rotY) obj.rotation.y = o.rotY;
    if (o.scale) obj.scale.setScalar(o.scale);
    (o.parent || this.root).add(obj);
    return obj;
  }

  _add(m, o) {
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale) Array.isArray(o.scale) ? m.scale.set(...o.scale) : m.scale.setScalar(o.scale);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    m.userData.collide = o.collide ?? true;
    if (o.name) m.name = o.name;
    (o.parent || this.root).add(m);
    if (o.merge !== false && !o.parent) this._statics.push(m);
    return m;
  }

  // ---------- lights ----------
  // Budget: at most 2 shadow-casting lights per map (one directional/spot "key" + one optional),
  // any number of non-shadow point lights (keep < ~24 visible). Use emissive meshes + bloom for bulbs.

  point(pos, color = 0xffe0b0, intensity = 8, distance = 10, o = {}) {
    const l = new THREE.PointLight(color, intensity, distance, o.decay ?? 2);
    l.position.set(pos[0], pos[1], pos[2]);
    if (o.shadow && this.shadowLights < 2) { this._shadow(l, o.shadowSize ?? 1024); l.shadow.camera.near = 0.1; l.shadow.camera.far = distance; }
    this.root.add(l);
    this.lights.push(l);
    return l;
  }

  spot(pos, target, color = 0xffffff, intensity = 30, o = {}) {
    const l = new THREE.SpotLight(color, intensity, o.distance ?? 30, o.angle ?? 0.7, o.penumbra ?? 0.6, o.decay ?? 1.6);
    l.position.set(pos[0], pos[1], pos[2]);
    l.target.position.set(target[0], target[1], target[2]);
    if (o.shadow && this.shadowLights < 2) this._shadow(l, o.shadowSize ?? 2048);
    this.root.add(l, l.target);
    this.lights.push(l);
    return l;
  }

  /** Directional key light. `area` is the half-size of the orthographic shadow box. */
  sun(dir, color = 0xffffff, intensity = 3, o = {}) {
    const l = new THREE.DirectionalLight(color, intensity);
    const c = o.center || [0, 0, 0];
    const d = new THREE.Vector3(...dir).normalize();
    l.position.set(c[0] - d.x * 40, c[1] - d.y * 40, c[2] - d.z * 40);
    l.target.position.set(c[0], c[1], c[2]);
    if (o.shadow !== false && this.shadowLights < 2) {
      this._shadow(l, o.shadowSize ?? 4096);
      const a = o.area ?? 30;
      Object.assign(l.shadow.camera, { left: -a, right: a, top: a, bottom: -a, near: 1, far: 120 });
      l.shadow.normalBias = 0.03;
      l.shadow.bias = -0.0004;
    }
    this.root.add(l, l.target);
    this.lights.push(l);
    return l;
  }

  hemi(sky = 0xbfd8ff, ground = 0x3a2a1a, intensity = 0.6) {
    const l = new THREE.HemisphereLight(sky, ground, intensity);
    this.root.add(l);
    return l;
  }

  _shadow(l, size) {
    l.castShadow = true;
    l.shadow.mapSize.set(size, size);
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 4;
    this.shadowLights++;
  }

  /** Glowing bulb mesh (emissive, blooms). */
  bulb(pos, color = 0xfff0c0, r = 0.06, strength = 6) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength) }));
    m.position.set(pos[0], pos[1], pos[2]);
    m.userData.collide = false;
    m.castShadow = false;
    this.root.add(m);
    return m;
  }

  // ---------- gameplay data ----------

  hider(x, y, z) { this.spawns.hider.push(new THREE.Vector3(x, y, z)); }
  seeker(x, y, z) { this.spawns.seeker.push(new THREE.Vector3(x, y, z)); }
  /** A good hiding spot for bots. normal = direction the body faces away from the surface. */
  hideSpot(x, y, z, nx = 0, ny = 1, nz = 0, kind = 'floor') {
    this.hideSpots.push({ pos: new THREE.Vector3(x, y, z), normal: new THREE.Vector3(nx, ny, nz).normalize(), kind });
  }

  /** Assemble MapData. extra overrides/adds fields (environment, seekerWait, update, ...). */
  data(extra = {}) {
    return { root: this.root, spawns: this.spawns, hideSpots: this.hideSpots, lights: this.lights, ...extra };
  }

  // ---------- finish ----------

  /** Merge static kit meshes that share a material (+shadow flags) into single meshes. */
  finish() {
    const groups = new Map();
    for (const m of this._statics) {
      if (!m.parent || m.parent !== this.root || !m.visible) continue;
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.userData.collide}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = [];
      for (const m of list) {
        m.updateMatrix();
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) continue;
        geos.push(g);
      }
      if (geos.length < 2) continue;
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, list[0].material);
      mm.castShadow = list[0].castShadow;
      mm.receiveShadow = list[0].receiveShadow;
      mm.userData.collide = list[0].userData.collide;
      mm.name = `merged:${list[0].material.name}`;
      for (const m of list) { this.root.remove(m); m.geometry.dispose(); }
      this.root.add(mm);
    }
    this._statics = [];
  }
}
