// Lazy grid navigation. Nodes are (ix, iz, floor level) sampled on demand with downward rays against the
// collision BVH, so multi-storey maps (stairs, balconies) work without a bake step.
import * as THREE from 'three';
import { WALKABLE } from '../core/physics.js';

const CELL = 0.55;
const DOWN = new THREE.Vector3(0, -1, 0);
const _o = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

export class Nav {
  constructor(physics) {
    this.phys = physics;
    this.cache = new Map();   // "ix,iz,lvl" -> node | null
    this.col = new Map();     // "ix,iz,ylevel" -> floor y | null   (floor query cache)
  }
  clear() { this.cache.clear(); this.col.clear(); }

  cellOf(x) { return Math.round(x / CELL); }

  /** Floor under (x,z) searching down from y+up to y-down. Returns y or null. */
  floorAt(x, z, y, up = 0.5, down = 1.0) {
    const k = `${this.cellOf(x)},${this.cellOf(z)},${Math.round(y * 2)}`;
    if (this.col.has(k)) return this.col.get(k);
    const cx = this.cellOf(x) * CELL, cz = this.cellOf(z) * CELL;
    _o.set(cx, y + up, cz);
    const h = this.phys.raycast(_o, DOWN, up + down, { collision: true, ignoreActors: true });
    let res = null;
    if (h && h.normal.y >= WALKABLE) {
      const fy = h.point.y;
      // headroom for a crouched body at least
      _a.set(cx, fy + 0.34, cz); _b.set(cx, fy + 0.78, cz);
      if (!this.phys.capsuleBlocked(_a, _b, 0.2)) res = fy;
    }
    this.col.set(k, res);
    return res;
  }

  /** Walkable neighbours of a node. */
  neighbors(n) {
    const out = [];
    for (const [dx, dz] of DIRS) {
      const ix = n.ix + dx, iz = n.iz + dz;
      const x = ix * CELL, z = iz * CELL;
      const y = this.floorAt(x, z, n.y, 0.55, 1.1);
      if (y == null || Math.abs(y - n.y) > 0.5) continue;
      if (dx && dz) {
        // diagonal: both orthogonal cells must be walkable too (no corner cutting)
        const y1 = this.floorAt(n.ix * CELL + dx * CELL, n.iz * CELL, n.y, 0.55, 1.1);
        const y2 = this.floorAt(n.ix * CELL, n.iz * CELL + dz * CELL, n.y, 0.55, 1.1);
        if (y1 == null || y2 == null) continue;
      }
      // clearance for the body between the two cells
      _a.set((n.ix * CELL + x) / 2, Math.max(n.y, y) + 0.42, (n.iz * CELL + z) / 2);
      _b.set(_a.x, _a.y + 0.45, _a.z);
      if (this.phys.capsuleBlocked(_a, _b, 0.22)) continue;
      out.push({ ix, iz, y, x, z, c: dx && dz ? 1.414 : 1 });
    }
    return out;
  }

  snap(p) {
    // nearest standable node to a world point
    const y = this.floorAt(Math.round(p.x / CELL) * CELL, Math.round(p.z / CELL) * CELL, p.y + 0.3, 0.6, 1.8);
    if (y != null) return { ix: this.cellOf(p.x), iz: this.cellOf(p.z), y };
    for (let r = 1; r <= 3; r++) {
      for (const [dx, dz] of DIRS) {
        const ix = this.cellOf(p.x) + dx * r, iz = this.cellOf(p.z) + dz * r;
        const yy = this.floorAt(ix * CELL, iz * CELL, p.y + 0.3, 0.6, 1.8);
        if (yy != null) return { ix, iz, y: yy };
      }
    }
    return null;
  }

  /** A* from a to b (world points). Returns an array of Vector3 waypoints (smoothed) or null. */
  path(a, b, maxNodes = 5000) {
    const s = this.snap(a), g = this.snap(b);
    if (!s || !g) return null;
    const key = (n) => `${n.ix},${n.iz},${Math.round(n.y * 2)}`;
    const open = new Heap();
    const best = new Map();
    const start = { ix: s.ix, iz: s.iz, y: s.y, g: 0, f: 0, p: null };
    open.push(start); best.set(key(start), 0);
    const gx = g.ix, gz = g.iz;
    let found = null, expanded = 0, closest = start, closestH = 1e9;
    while (open.size && expanded < maxNodes) {
      const n = open.pop();
      if (n.dead) continue;
      if (Math.abs(n.ix - gx) <= 1 && Math.abs(n.iz - gz) <= 1 && Math.abs(n.y - g.y) < 0.7) { found = n; break; }
      expanded++;
      for (const m of this.neighbors(n)) {
        const k = key(m);
        const cost = n.g + m.c + Math.abs(m.y - n.y) * 0.6;
        if (best.has(k) && best.get(k) <= cost) continue;
        best.set(k, cost);
        const h = Math.hypot(m.ix - gx, m.iz - gz) + Math.abs(m.y - g.y) * 0.5;
        const node = { ix: m.ix, iz: m.iz, y: m.y, g: cost, f: cost + h * 1.35, p: n };
        if (h < closestH) { closestH = h; closest = node; }
        open.push(node);
      }
    }
    const end = found || (closestH < 6 ? closest : null);
    if (!end) return null;
    const pts = [];
    for (let n = end; n; n = n.p) pts.push(new THREE.Vector3(n.ix * CELL, n.y, n.iz * CELL));
    pts.reverse();
    return this.smooth(pts);
  }

  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.straight(pts[i], pts[j])) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  straight(a, b) {
    const d = a.distanceTo(b);
    if (d > 7) return false;
    const n = Math.ceil(d / 0.35);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
      if (Math.abs(a.y - b.y) > 0.3 && i > 0) { const fy = this.floorAt(x, z, y, 0.4, 0.6); if (fy == null || Math.abs(fy - y) > 0.25) return false; }
      else { const fy = this.floorAt(x, z, a.y, 0.3, 0.5); if (fy == null || Math.abs(fy - a.y) > 0.2) return false; }
      _a.set(x, y + 0.4, z); _b.set(x, y + 0.8, z);
      if (this.phys.capsuleBlocked(_a, _b, 0.26)) return false;
    }
    return true;
  }
}
