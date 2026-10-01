// Static-world physics: one merged BVH of every collidable map mesh, a capsule character controller
// (walk / step-up / slopes / jump / crouch / surface climbing on walls + ceilings), ray queries against
// the visible world + actors, line of sight and the "buried" test. See SPEC.md §9. Owner: F.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const WALKABLE = 0.64;          // cos(50°): steeper than this is a wall
const UP = new THREE.Vector3(0, 1, 0);
const EPS = 1e-6;

// scratch
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _triPt = new THREE.Vector3(), _segPt = new THREE.Vector3(), _n = new THREE.Vector3();
const _seg = new THREE.Line3(), _box = new THREE.Box3();
const _ray = new THREE.Ray();
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _inv = new THREE.Matrix4();

function visibleChain(o, stop) {
  for (let p = o; p && p !== stop; p = p.parent) if (!p.visible) return false;
  return true;
}

export class Physics {
  constructor(engine) {
    this.engine = engine;
    this.bvh = null;                 // collision BVH (world space)
    this.visual = [];                // visible map meshes (shots, sight, eyedropper, burial)
    this.actors = new Map();         // id -> actor (anything with .mannequin)
    this.bodies = new Set();         // CharacterBody instances (for body-vs-body pushing)
    this.gravity = 22;
    this.map = null;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this._ranges = [];               // [{start (vertex), mesh}] for triangle -> source mesh
  }

  // ------------------------------------------------------------------ build
  /** Build the static collision BVH from all collidable meshes under map.root. */
  build(map) {
    const t0 = performance.now();
    this.map = map;
    const root = map.root || map;
    root.updateMatrixWorld(true);
    this.visual = [];
    const chunks = [];
    let vCount = 0, iCount = 0;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const colliderOnly = !!o.userData.colliderOnly;
      const vis = visibleChain(o, root.parent);
      if (vis && !colliderOnly && !o.userData.noRay && !o.isSkinnedMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (!mats.every((m) => m && (m.visible === false || (m.transparent && m.opacity < 0.05)))) this.visual.push(o);
      }
      if (o.userData.collide === false || o.isSkinnedMesh) return;
      if (!vis && !colliderOnly) return;
      const g = o.geometry;
      const pos = g.attributes.position;
      const index = g.index;
      const inst = o.isInstancedMesh ? o.count : 1;
      for (let k = 0; k < inst; k++) {
        const mw = new THREE.Matrix4().copy(o.matrixWorld);
        if (o.isInstancedMesh) { o.getMatrixAt(k, _m4); mw.multiply(_m4); }
        chunks.push({ o, pos, index, mw, vStart: vCount });
        vCount += pos.count;
        iCount += index ? index.count : pos.count - (pos.count % 3);
      }
    });
    this._ranges = chunks.map((c) => ({ start: c.vStart, mesh: c.o }));
    const P = new Float32Array(vCount * 3);
    const I = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
    let ii = 0;
    for (const c of chunks) {
      const e = c.mw.elements;
      for (let i = 0; i < c.pos.count; i++) {
        const x = c.pos.getX(i), y = c.pos.getY(i), z = c.pos.getZ(i);
        const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
        const j = (c.vStart + i) * 3;
        P[j] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
        P[j + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
        P[j + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      }
      if (c.index) { const a = c.index.array; for (let i = 0; i < c.index.count; i++) I[ii++] = a[i] + c.vStart; }
      else { const n = c.pos.count - (c.pos.count % 3); for (let i = 0; i < n; i++) I[ii++] = c.vStart + i; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setIndex(new THREE.BufferAttribute(I, 1));
    this.bvh?.geometry?.dispose();
    this.bvh = new MeshBVH(geo, { maxLeafSize: 8, strategy: iCount / 3 < 400000 ? 2 /* SAH */ : 0 /* CENTER */ });
    this.colGeo = geo;
    this.triCount = iCount / 3;
    this.bounds = new THREE.Box3();
    geo.computeBoundingBox();
    this.bounds.copy(geo.boundingBox);
    this.buildMs = performance.now() - t0;
    console.log(`[physics] BVH ${this.triCount | 0} tris from ${chunks.length} meshes, ${this.visual.length} visual meshes, ${this.buildMs.toFixed(0)} ms`);
    return this;
  }

  _meshForVertex(v) {
    const r = this._ranges;
    let lo = 0, hi = r.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (r[mid].start <= v) lo = mid; else hi = mid - 1; }
    return r[lo]?.mesh || null;
  }

  // ------------------------------------------------------------------ actors
  addActor(actor) { if (actor?.id != null) this.actors.set(actor.id, actor); }
  removeActor(actor) { this.actors.delete(actor?.id ?? actor); }

  _actorMeshes(actor) {
    const m = actor.mannequin;
    if (!m) return [];
    if (m.bodyMeshes?.length) return m.bodyMeshes;
    const out = [];
    m.root?.traverse((o) => { if (o.isMesh && o.visible) out.push(o); });
    return out;
  }

  // ------------------------------------------------------------------ queries
  /**
   * Ray against the VISIBLE world (+ actors unless ignoreActors). opts:
   *  { ignoreActors=false, ignore: [actorId...], collision=false (use the collision BVH instead of visuals),
   *    actorsOnly=false }
   * -> { point, normal, distance, object, uv, faceIndex, actorId? } | null
   */
  raycast(origin, dir, far = 200, opts = {}) {
    let best = null;
    if (!opts.actorsOnly) best = opts.collision ? this._rayCollision(origin, dir, far) : this._rayVisual(origin, dir, far);
    if (!opts.ignoreActors && this.actors.size) {
      const a = this._rayActors(origin, dir, best ? best.distance : far, opts.ignore);
      if (a) best = a;
    }
    return best;
  }

  _rayCollision(origin, dir, far) {
    if (!this.bvh) return null;
    _ray.origin.copy(origin); _ray.direction.copy(dir).normalize();
    const h = this.bvh.raycastFirst(_ray, THREE.DoubleSide, 0, far);
    if (!h) return null;
    const idx = this.colGeo.index.array;
    const a = idx[h.faceIndex * 3], b = idx[h.faceIndex * 3 + 1], c = idx[h.faceIndex * 3 + 2];
    const P = this.colGeo.attributes.position;
    const tri = new THREE.Triangle(_v1.fromBufferAttribute(P, a), _v2.fromBufferAttribute(P, b), _v3.fromBufferAttribute(P, c));
    const normal = tri.getNormal(new THREE.Vector3());
    if (normal.dot(_ray.direction) > 0) normal.negate();
    return { point: h.point.clone(), normal, distance: h.distance, object: this._meshForVertex(a), faceIndex: h.faceIndex, uv: null };
  }

  _rayVisual(origin, dir, far) {
    const rc = this.raycaster;
    rc.set(origin, _v4.copy(dir).normalize());
    rc.near = 0; rc.far = far;
    const hits = rc.intersectObjects(this.visual, false);
    const h = hits[0];
    if (!h) return null;
    const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : _v4.clone().negate();
    if (normal.dot(rc.ray.direction) > 0) normal.negate();
    return { point: h.point, normal, distance: h.distance, object: h.object, uv: h.uv || null, faceIndex: h.faceIndex, face: h.face };
  }

  _rayActors(origin, dir, far, ignore) {
    const rc = this.raycaster;
    rc.set(origin, _v4.copy(dir).normalize());
    rc.near = 0; rc.far = far;
    let best = null;
    for (const actor of this.actors.values()) {
      if (ignore && (ignore.includes?.(actor.id) || ignore.has?.(actor.id))) continue;
      const m = actor.mannequin;
      if (!m?.root?.visible) continue;
      // cheap reject: distance from the ray to the body's centre (root is at the feet, maybe tilted)
      m.root.updateWorldMatrix(true, false);
      if (rc.ray.distanceSqToPoint(m.root.localToWorld(_v2.set(0, 0.6, 0))) > 1.5 * 1.5) continue;
      const hits = rc.intersectObjects(this._actorMeshes(actor), false);
      const h = hits[0];
      if (h && (!best || h.distance < best.distance)) {
        const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : rc.ray.direction.clone().negate();
        best = { point: h.point, normal, distance: h.distance, object: h.object, uv: h.uv || null, faceIndex: h.faceIndex, actorId: actor.id, actor };
      }
    }
    return best;
  }

  /** True if nothing visible blocks the segment a->b (actors ignored). */
  lineOfSight(a, b, opts = {}) {
    const d = _v3.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    const h = opts.collision ? this._rayCollision(a, d.divideScalar(len), len - 0.03) : this._rayVisual(a, d.divideScalar(len), len - 0.03);
    return !h;
  }

  /** Distance to the nearest collision surface from p (<= max) -> { point, distance, normal } | null */
  closest(p, max = 1) {
    if (!this.bvh) return null;
    const r = this.bvh.closestPointToPoint(p, {}, 0, max);
    if (!r) return null;
    const idx = this.colGeo.index.array, P = this.colGeo.attributes.position;
    const tri = new THREE.Triangle(new THREE.Vector3().fromBufferAttribute(P, idx[r.faceIndex * 3]), new THREE.Vector3().fromBufferAttribute(P, idx[r.faceIndex * 3 + 1]), new THREE.Vector3().fromBufferAttribute(P, idx[r.faceIndex * 3 + 2]));
    r.normal = tri.getNormal(new THREE.Vector3());
    return r;
  }

  /** True if a capsule (segment a-b, radius r) touches any collision geometry. */
  capsuleBlocked(a, b, r) {
    if (!this.bvh) return false;
    _seg.start.copy(a); _seg.end.copy(b);
    _box.makeEmpty(); _box.expandByPoint(a); _box.expandByPoint(b); _box.expandByScalar(r);
    return this.bvh.shapecast({
      intersectsBounds: (bx) => bx.intersectsBox(_box),
      intersectsTriangle: (tri) => tri.closestPointToSegment(_seg, _triPt, _segPt) < r,
    });
  }

  /**
   * Fraction (0..1) of sample points of the body that sit INSIDE visible geometry.
   * Samples are pulled 35 % toward each limb mesh's centre so merely touching a surface doesn't count.
   */
  buriedRatio(mannequin) {
    const meshes = mannequin?.bodyMeshes?.length ? mannequin.bodyMeshes : [];
    if (!meshes.length && mannequin?.root) mannequin.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) return 0;
    const pts = [];
    const bb = new THREE.Box3();
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const pos = g?.attributes?.position;
      if (!pos) continue;
      mesh.updateWorldMatrix(true, false);
      if (!g.boundingBox) g.computeBoundingBox();
      const cLocal = g.boundingBox.getCenter(new THREE.Vector3());
      const n = Math.max(3, Math.min(14, Math.round(48 / meshes.length)));
      const step = Math.max(1, Math.floor(pos.count / n));
      for (let i = 0, k = 0; i < pos.count && k < n; i += step, k++) {
        const v = new THREE.Vector3();
        if (mesh.getVertexPosition) mesh.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
        v.lerp(cLocal, 0.35).applyMatrix4(mesh.matrixWorld);
        pts.push(v); bb.expandByPoint(v);
      }
    }
    if (!pts.length) return 0;
    bb.expandByScalar(0.3);
    const near = this.visual.filter((m) => {
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      _box.copy(g.boundingBox).applyMatrix4(m.matrixWorld);
      return _box.intersectsBox(bb);
    });
    if (!near.length) return 0;
    let inside = 0;
    const tgt = {};
    for (const p of pts) {
      let bestD = Infinity, bestSign = 1;
      for (const m of near) {
        const bt = m.geometry.boundsTree;
        if (!bt) continue;
        _inv.copy(m.matrixWorld).invert();
        const lp = _v1.copy(p).applyMatrix4(_inv);
        const r = bt.closestPointToPoint(lp, tgt, 0, 1.2);
        if (!r) continue;
        const wp = _v2.copy(r.point).applyMatrix4(m.matrixWorld);
        const d = wp.distanceTo(p);
        if (d < bestD) {
          const g = m.geometry, idx = g.index, P = g.attributes.position;
          const f = r.faceIndex * 3;
          const ia = idx ? idx.getX(f) : f, ib = idx ? idx.getX(f + 1) : f + 1, ic = idx ? idx.getX(f + 2) : f + 2;
          const tri = new THREE.Triangle(new THREE.Vector3().fromBufferAttribute(P, ia).applyMatrix4(m.matrixWorld), new THREE.Vector3().fromBufferAttribute(P, ib).applyMatrix4(m.matrixWorld), new THREE.Vector3().fromBufferAttribute(P, ic).applyMatrix4(m.matrixWorld));
          const nrm = tri.getNormal(_n);
          const mats = Array.isArray(m.material) ? m.material[0] : m.material;
          const dbl = mats?.side === THREE.DoubleSide;
          bestD = d;
          bestSign = dbl ? 1 : Math.sign(_v3.subVectors(p, wp).dot(nrm)) || 1;
        }
      }
      if (bestSign < 0 && bestD > 0.015) inside++;
    }
    return inside / pts.length;
  }

  // ------------------------------------------------------------------ character bodies
  createBody(opts) { const b = new CharacterBody(this, opts); this.bodies.add(b); return b; }
  removeBody(b) { this.bodies.delete(b); }

  /**
   * Push a capsule (base `pos`, axis `up`, height h, radius r) out of the world. Mutates pos.
   * walking=true: walkable contacts push straight up (no sliding on slopes).
   * Returns the contact summary object `out`.
   */
  resolveCapsule(pos, up, h, r, walking, out) {
    out.ground = false; out.ceiling = false; out.wall = false;
    out.groundNormal.set(0, 0, 0); out.wallNormal.set(0, 0, 0);
    if (!this.bvh) return out;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      _seg.start.copy(pos).addScaledVector(up, r);
      _seg.end.copy(pos).addScaledVector(up, Math.max(r, h - r));
      _box.makeEmpty(); _box.expandByPoint(_seg.start); _box.expandByPoint(_seg.end); _box.expandByScalar(r);
      this.bvh.shapecast({
        intersectsBounds: (bx) => bx.intersectsBox(_box),
        intersectsTriangle: (tri) => {
          const d = tri.closestPointToSegment(_seg, _triPt, _segPt);
          if (d >= r) return false;
          if (d > 1e-5) _n.subVectors(_segPt, _triPt).divideScalar(d);
          else { tri.getNormal(_n); }
          const depth = r - d;
          if (walking && _n.y > WALKABLE) {
            const push = Math.min(depth / _n.y, r);
            pos.y += push; _seg.start.y += push; _seg.end.y += push;
            out.ground = true;
            if (_n.y > out.groundNormal.y) out.groundNormal.copy(_n);
          } else {
            pos.addScaledVector(_n, depth); _seg.start.addScaledVector(_n, depth); _seg.end.addScaledVector(_n, depth);
            if (_n.y < -0.5) out.ceiling = true;
            else { out.wall = true; out.wallNormal.addScaledVector(_n, depth + 0.001); }
            if (!walking && _n.y > WALKABLE) { out.ground = true; if (_n.y > out.groundNormal.y) out.groundNormal.copy(_n); }
          }
          moved = true;
          return false;
        },
      });
      if (!moved) break;
    }
    if (out.wall) out.wallNormal.normalize();
    return out;
  }
}

// ======================================================================================
/**
 * Capsule character. pos = base point of the capsule ("feet"); up = capsule axis.
 * Walking: up = +Y. Climbing: up is a tangent of the surface, surfNormal points away from it.
 *
 * step(dt, cmd) with cmd = { move: Vector3 (world; horizontal intent when walking, any 3-D intent when
 *   climbing — it is projected onto the surface), speed, jump (edge), up (held), down (held) }
 */
export class CharacterBody {
  constructor(phys, { radius = 0.24, height = 1.25, crouchHeight = 0.78, id = null } = {}) {
    this.phys = phys;
    this.id = id;
    this.radius = radius;
    this.standHeight = height;
    this.crouchHeight = crouchHeight;
    this.height = height;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.surfNormal = new THREE.Vector3(0, 0, 1);
    this.grounded = false;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.crouching = false;
    this.climbing = false;
    this.solid = true;
    this.enabled = true;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sinceJump = 10;
    this.airTime = 0;
    this.landSpeed = 0;           // vertical speed at the last landing (camera dip)
    this.justLanded = false;
    this.justJumped = false;
    this.stepOffset = 0;          // smoothing for step-ups (camera)
    this.walkSpeed = 4.2;
    this.crouchSpeed = 2.0;
    this.climbSpeed = 2.3;
    this.jumpSpeed = 6.4;
    this.stepHeight = 0.36;
    this.speed = 0;               // actual planar speed (animation)
    this._out = { ground: false, ceiling: false, wall: false, groundNormal: new THREE.Vector3(), wallNormal: new THREE.Vector3() };
    this._tmp = new THREE.Vector3();
  }

  get center() { return this._tmp.copy(this.pos).addScaledVector(this.up, this.height / 2); }
  centerTo(out) { return out.copy(this.pos).addScaledVector(this.up, this.height / 2); }
  /** Eye/head point (for cameras). */
  headTo(out, below = 0.14) { return out.copy(this.pos).addScaledVector(this.up, this.height - below); }

  teleport(p, facing) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.climbing = false;
    this.up.set(0, 1, 0);
    this.grounded = false;
    this.sinceJump = 10;
    this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
    this._snap(0.6);
  }

  /** Mannequin placement for the current state: root position (feet) + orientation. forward = walking facing. */
  visualTransform(outPos, outQuat, forward) {
    if (this.climbing) {
      // body front faces the surface, back to the room; pressed flat against it.
      outPos.copy(this.pos).addScaledVector(this.surfNormal, -(this.radius - 0.13));
      const z = _v1.copy(this.surfNormal).negate();
      const y = this.up;
      const x = _v2.crossVectors(y, z).normalize();
      _m4.makeBasis(x, y, _v3.crossVectors(x, y));
      outQuat.setFromRotationMatrix(_m4);
    } else {
      outPos.copy(this.pos);
      outPos.y -= this.stepOffset;
      const yaw = Math.atan2(forward.x, forward.z);
      outQuat.setFromAxisAngle(UP, yaw);
    }
  }

  canStand() {
    const r = this.radius - 0.02;
    return !this.phys.capsuleBlocked(_v1.copy(this.pos).addScaledVector(this.up, this.radius + 0.02), _v2.copy(this.pos).addScaledVector(this.up, this.standHeight - this.radius), r);
  }

  setCrouch(on) {
    if (this.climbing) return false;
    if (!on && this.crouching && !this.canStand()) return false;
    this.crouching = on;
    return true;
  }

  // ---------------------------------------------------------------- main step
  step(dt, cmd = {}) {
    this.justLanded = false; this.justJumped = false;
    if (!this.enabled) return;
    const target = this.crouching ? this.crouchHeight : this.standHeight;
    this.height += (target - this.height) * (1 - Math.exp(-14 * dt));
    if (Math.abs(target - this.height) < 0.003) this.height = target;
    if (this.climbing) this._climbStep(dt, cmd);
    else this._walkStep(dt, cmd);
    this._pushBodies();
    this.stepOffset *= Math.exp(-12 * dt);
    if (Math.abs(this.stepOffset) < 0.002) this.stepOffset = 0;
  }

  _sweep(delta, walking = true) {
    // Sub-stepped move + resolve (no tunnelling: each sub-step < 45 % of the radius).
    const len = delta.length();
    const n = Math.max(1, Math.ceil(len / (this.radius * 0.45)));
    const acc = { ground: false, ceiling: false, wall: false, groundNormal: new THREE.Vector3(), wallNormal: new THREE.Vector3() };
    const part = _v4.copy(delta).divideScalar(n).clone();
    for (let i = 0; i < n; i++) {
      this.pos.add(part);
      const o = this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, walking, this._out);
      if (o.ground) { acc.ground = true; if (o.groundNormal.y > acc.groundNormal.y) acc.groundNormal.copy(o.groundNormal); }
      if (o.ceiling) acc.ceiling = true;
      if (o.wall) { acc.wall = true; acc.wallNormal.add(o.wallNormal); }
    }
    if (acc.wall) acc.wallNormal.normalize();
    return acc;
  }

  _snap(dist) {
    // Probe downward in small steps; keep the result only if we find walkable ground.
    const save = _v3.copy(this.pos).clone();
    let moved = 0;
    const inc = this.radius * 0.4;
    while (moved < dist) {
      const s = Math.min(inc, dist - moved);
      this.pos.y -= s; moved += s;
      const o = this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
      if (o.ground) { this.groundNormal.copy(o.groundNormal); return true; }
      if (o.wall && !o.ground && this.pos.y > save.y - moved + s * 0.5) break;
    }
    this.pos.copy(save);
    return false;
  }

  _walkStep(dt, cmd) {
    const g = this.phys.gravity;
    const wasGrounded = this.grounded;
    const speed = cmd.speed ?? (this.crouching ? this.crouchSpeed : this.walkSpeed);
    const wish = _v1.set(cmd.move?.x || 0, 0, cmd.move?.z || 0);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(speed);
    const hasWish = wish.lengthSq() > 0.01;
    const accel = this.grounded ? (hasWish ? 14 : 18) : 3.2;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x += (wish.x - this.vel.x) * k;
    this.vel.z += (wish.z - this.vel.z) * k;

    // jump (buffered + coyote time)
    this.jumpBuffer = cmd.jump ? 0.13 : Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.1 : Math.max(0, this.coyote - dt);
    this.sinceJump += dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      if (this.crouching) { if (this.setCrouch(false)) this.jumpBuffer = 0; }
      else {
        this.vel.y = this.jumpSpeed;
        this.grounded = false; this.coyote = 0; this.jumpBuffer = 0; this.sinceJump = 0;
        this.justJumped = true;
      }
    }
    if (!this.grounded) { this.vel.y -= g * dt; this.vel.y = Math.max(this.vel.y, -30); this.airTime += dt; }
    else this.vel.y = 0;

    const start = _v2.copy(this.pos).clone();
    const delta = this._tmp.copy(this.vel).multiplyScalar(dt).clone();
    const res = this._sweep(delta, true);

    // step-up: blocked by a wall while walking on ground
    if (wasGrounded && res.wall && hasWish && this.sinceJump > 0.2) {
      const moved = _v3.subVectors(this.pos, start); moved.y = 0;
      const want = Math.hypot(delta.x, delta.z);
      if (moved.length() < want * 0.7) this._tryStep(start, delta, moved.length());
    }

    let grounded = res.ground && this.vel.y <= 0.01;
    if (res.ground) this.groundNormal.copy(res.groundNormal);
    if (!grounded && wasGrounded && this.sinceJump > 0.15 && this.vel.y <= 0.01) {
      grounded = this._snap(this.stepHeight + 0.05);
      if (grounded) this.stepOffset += 0; // snapping down is smoothed by the camera's own filter
    }
    if (grounded && !this.grounded) {
      this.justLanded = this.airTime > 0.12;
      this.landSpeed = -this.vel.y;
      this.airTime = 0;
    }
    this.grounded = grounded;
    if (grounded) this.vel.y = 0;
    if (res.ceiling && this.vel.y > 0) this.vel.y = 0;
    if (res.wall) {
      const n = _v3.copy(res.wallNormal); n.y = 0;
      if (n.lengthSq() > 1e-4) { n.normalize(); const d = this.vel.x * n.x + this.vel.z * n.z; if (d < 0) { this.vel.x -= n.x * d; this.vel.z -= n.z * d; } }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    // kill-plane safety: fell out of the world
    if (this.phys.bounds && this.pos.y < this.phys.bounds.min.y - 20) this.onFellOut?.();
  }

  _tryStep(start, delta, achieved) {
    const save = this.pos.clone();
    const saveH = this.height;
    this.pos.copy(start);
    // up
    const up = this._sweep(_v1.set(0, this.stepHeight, 0), true);
    const rise = this.pos.y - start.y;
    if (rise < 0.05 && up.ceiling) { this.pos.copy(save); return false; }
    // forward
    const fwd = _v2.set(delta.x, 0, delta.z);
    const fwdLen = fwd.length();
    if (fwdLen < 1e-4) { this.pos.copy(save); return false; }
    fwd.multiplyScalar(Math.max(1, (this.radius * 0.5) / fwdLen));
    this._sweep(fwd.clone(), true);
    // down
    const lifted = this.pos.y;
    let found = false;
    const inc = this.radius * 0.4;
    for (let m = 0; m < rise + 0.06; m += inc) {
      this.pos.y -= Math.min(inc, rise + 0.06 - m);
      const o = this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
      if (o.ground) { found = true; break; }
    }
    const progress = Math.hypot(this.pos.x - start.x, this.pos.z - start.z);
    if (found && this.pos.y > start.y + 0.02 && this.pos.y <= lifted && progress > achieved + 0.005) {
      // keep only the intended horizontal distance (we probed a little further to land on the step)
      const want = Math.hypot(delta.x, delta.z);
      if (progress > want) {
        const k = want / progress;
        const ny = this.pos.y;
        this.pos.x = start.x + (this.pos.x - start.x) * k;
        this.pos.z = start.z + (this.pos.z - start.z) * k;
        this.pos.y = ny;
        this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
      }
      this.stepOffset += this.pos.y - start.y;
      this.height = saveH;
      return true;
    }
    this.pos.copy(save);
    return false;
  }

  _pushBodies() {
    if (!this.solid || this.climbing) return;
    for (const b of this.phys.bodies) {
      if (b === this || !b.solid || !b.enabled || b.climbing) continue;
      const dx = this.pos.x - b.pos.x, dz = this.pos.z - b.pos.z;
      const rr = this.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      if (this.pos.y > b.pos.y + b.height - 0.1 || b.pos.y > this.pos.y + this.height - 0.1) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const push = (rr - d) * 0.5;
      this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
      this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
    }
  }

  // ---------------------------------------------------------------- climbing
  /**
   * Try to grab a surface. dir: preferred world direction (e.g. camera forward). Also checks a ceiling
   * right above the head. Returns true when attached.
   */
  tryClimb(dir, reach = 0.6) {
    if (this.climbing) return false;
    const c = this.centerTo(new THREE.Vector3());
    c.y = this.pos.y + this.height * 0.6;
    const d = _v1.copy(dir); d.y = 0;
    if (d.lengthSq() > 1e-4) {
      d.normalize();
      // fan of rays so near-grazing walls still work
      for (const a of [0, 0.35, -0.35, 0.7, -0.7]) {
        const rd = d.clone().applyAxisAngle(UP, a);
        const h = this.phys.raycast(c, rd, this.radius + reach, { collision: true, ignoreActors: true });
        if (h && h.normal.y < WALKABLE && h.normal.y > -0.95) { this.attach(h.point, h.normal, rd); return true; }
      }
    }
    if (!this.grounded || this.phys.raycast(this.headTo(new THREE.Vector3(), 0), UP, 0.25, { collision: true, ignoreActors: true })) {
      const h = this.phys.raycast(this.headTo(new THREE.Vector3(), 0.2), UP, 0.2 + reach, { collision: true, ignoreActors: true });
      if (h && h.normal.y < -0.5) { this.attach(h.point, h.normal, dir); return true; }
    }
    return false;
  }

  /** Stick to the surface at point with normal. hint = direction used to orient the body on ceilings. */
  attach(point, normal, hint) {
    this.climbing = true;
    this.crouching = false;
    this.height = this.standHeight;
    this.surfNormal.copy(normal).normalize();
    this._uprightUp(this.up, this.surfNormal, hint);
    // keep the body where it is along the surface, just pressed against it.
    const c = this.centerTo(new THREE.Vector3());
    const offset = _v1.subVectors(c, point).dot(this.surfNormal);
    c.addScaledVector(this.surfNormal, this.radius + 0.01 - offset);
    if (Math.abs(this.surfNormal.y) < 0.7) c.y = Math.max(c.y, point.y - 0.1);
    this.pos.copy(c).addScaledVector(this.up, -this.height / 2);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, false, this._out);
    this.onAttach?.();
  }

  _uprightUp(out, n, hint) {
    // walls: world-up projected on the plane; ceilings/floors: the hint direction projected.
    out.copy(UP).addScaledVector(n, -UP.dot(n));
    if (out.lengthSq() < 0.09) {
      out.copy(hint || _v2.set(0, 0, 1)).addScaledVector(n, -(hint || _v2).dot(n));
      if (out.lengthSq() < 1e-4) out.set(1, 0, 0).addScaledVector(n, -n.x);
    }
    return out.normalize();
  }

  detach() {
    if (!this.climbing) return;
    const c = this.centerTo(new THREE.Vector3());
    const n = this.surfNormal.clone();
    this.climbing = false;
    this.up.set(0, 1, 0);
    this.pos.copy(c).addScaledVector(UP, -this.height / 2);
    this.pos.addScaledVector(n, 0.05);
    this.vel.copy(n).multiplyScalar(n.y < -0.5 ? 0 : 1.6);
    this.grounded = false;
    this.airTime = 0.2;
    this.sinceJump = 0.3;
    this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
    this.onDetach?.();
  }

  _land() {
    // reached the floor while climbing down: stand up on it
    const c = this.centerTo(new THREE.Vector3());
    const n = this.surfNormal.clone();
    this.climbing = false;
    this.up.set(0, 1, 0);
    this.pos.set(c.x, c.y - this.height / 2, c.z).addScaledVector(n, 0.02);
    this.vel.set(0, 0, 0);
    this.phys.resolveCapsule(this.pos, this.up, this.height, this.radius, true, this._out);
    this.grounded = this._snap(1.0);
    this.onDetach?.();
  }

  _setFrame(newN) {
    _q.setFromUnitVectors(this.surfNormal, newN);
    this.up.applyQuaternion(_q);
    this.surfNormal.copy(newN);
    this.up.addScaledVector(newN, -this.up.dot(newN)).normalize();
  }

  _climbStep(dt, cmd) {
    const phys = this.phys;
    const n = this.surfNormal;
    const r = this.radius;
    // intent on the tangent plane
    const m = _v1.copy(cmd.move || _v1.set(0, 0, 0));
    m.addScaledVector(n, -m.dot(n));
    if (cmd.up) m.add(this.up);
    if (cmd.down) m.sub(this.up);
    if (m.lengthSq() > 1) m.normalize();
    const target = m.multiplyScalar(cmd.speed ?? this.climbSpeed);
    const k = 1 - Math.exp(-16 * dt);
    this.vel.lerp(target, k);
    this.vel.addScaledVector(n, -this.vel.dot(n));
    this.speed = this.vel.length();
    const delta = _v2.copy(this.vel).multiplyScalar(dt);
    const dl = delta.length();
    const center = this.centerTo(new THREE.Vector3());

    // Landing: moving "down" on a wall with the floor right under the capsule end.
    if (Math.abs(n.y) < 0.7 && (cmd.down || delta.dot(UP) < -1e-4)) {
      const foot = _v3.copy(this.pos).addScaledVector(this.up, r);
      const h = phys.raycast(foot, _v4.set(0, -1, 0), r + 0.06 + Math.max(0, -delta.y), { collision: true, ignoreActors: true });
      if (h && h.normal.y > WALKABLE) { this._land(); return; }
    }

    if (dl > 1e-5) {
      // concave transition: something ahead along the motion (wall→ceiling, wall→wall corner)
      const dir = _v3.copy(delta).divideScalar(dl);
      // probe from the capsule end in the motion direction
      const along = dir.dot(this.up);
      const probeFrom = center.clone().addScaledVector(this.up, Math.sign(along) * Math.min(Math.abs(along), 1) * (this.height / 2 - r));
      const h = phys.raycast(probeFrom, dir, r + dl + 0.04, { collision: true, ignoreActors: true });
      if (h && h.normal.dot(n) < 0.85) {
        if (h.normal.y > WALKABLE && Math.abs(n.y) < 0.7) { this._land(); return; }
        const old = n.clone();
        this._setFrame(h.normal.clone());
        // rotate the capsule around the contact edge: keep it pressed on the new face
        center.copy(h.point).addScaledVector(this.surfNormal, r + 0.01).addScaledVector(old, r * 0.5);
        this.pos.copy(center).addScaledVector(this.up, -this.height / 2);
        this.phys.resolveCapsule(this.pos, this.up, this.height, r, false, this._out);
        this._align(dt);
        return;
      }
      this.pos.add(delta);
      center.add(delta);
    }

    // stick: find the surface under the body
    const hit = this._probeSurface(center);
    if (hit) {
      const newN = hit.normal;
      if (newN.dot(n) < 0.999) this._setFrame(newN.dot(n) > 0.2 ? n.clone().lerp(newN, 0.5).normalize() : newN.clone());
      const dist = _v3.subVectors(center, hit.point).dot(hit.normal);
      center.addScaledVector(hit.normal, (r + 0.01) - dist);
      this.pos.copy(center).addScaledVector(this.up, -this.height / 2);
    } else if (dl > 1e-5) {
      // convex edge: wrap around it (ray from beyond the edge back under the body)
      const dir = _v3.copy(delta).divideScalar(dl);
      const from = center.clone().addScaledVector(n, -(r + 0.12)).addScaledVector(dir, r * 0.5);
      const h2 = phys.raycast(from, dir.clone().negate(), r + 0.6, { collision: true, ignoreActors: true });
      if (h2 && h2.normal.dot(n) < 0.95) {
        if (h2.normal.y > WALKABLE) {
          // top of a wall / ledge: climb onto it and stand
          this.climbing = false;
          this.up.set(0, 1, 0);
          this.pos.copy(h2.point).addScaledVector(h2.normal, 0.02);
          this.pos.addScaledVector(dir, r * 0.3);
          this.vel.set(0, 0, 0);
          this.phys.resolveCapsule(this.pos, this.up, this.height, r, true, this._out);
          this.grounded = this._snap(0.5);
          this.onDetach?.();
          return;
        }
        this._setFrame(h2.normal.clone());
        center.copy(h2.point).addScaledVector(this.surfNormal, r + 0.01);
        this.pos.copy(center).addScaledVector(this.up, -this.height / 2);
      } else {
        this.detach();
        return;
      }
    } else {
      this.detach();
      return;
    }
    this.phys.resolveCapsule(this.pos, this.up, this.height, r, false, this._out);
    this._align(dt);
  }

  _probeSurface(center) {
    const n = this.surfNormal;
    const r = this.radius;
    // sample the centre plus both capsule ends; take the nearest.
    for (const s of [0, 0.3, -0.3]) {
      const from = _v4.copy(center).addScaledVector(this.up, s * this.height).addScaledVector(n, 0.05);
      const h = this.phys.raycast(from, _v3.copy(n).negate(), r + 0.4, { collision: true, ignoreActors: true });
      if (h && h.normal.dot(n) > 0.2) return h;
    }
    return null;
  }

  _align(dt) {
    // walls: ease the body back upright (like the reference: wall climbers stay head-up)
    const n = this.surfNormal;
    if (Math.abs(n.y) < 0.7) {
      const want = this._uprightUp(_v1, n, this.up);
      const ang = Math.atan2(_v2.crossVectors(this.up, want).dot(n), this.up.dot(want));
      if (Math.abs(ang) > 1e-4) this.up.applyAxisAngle(n, ang * (1 - Math.exp(-8 * dt))).addScaledVector(n, -this.up.dot(n)).normalize();
    }
  }
}
