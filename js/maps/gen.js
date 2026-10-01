// Small helpers shared by the map modules: seeded rng, hide-spot generators, parallel prop loading, canvas painters.
import * as THREE from 'three';

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Hide spots hugging a wall segment. (nx,nz) = unit normal pointing into the open space. ys = body-centre heights. */
export function wallSpots(kit, ax, az, bx, bz, nx, nz, n, ys = [0.55, 1.0, 1.5], { off = 0.3, seed = 7, margin = 0.8 } = {}) {
  const r = rng(seed + ((ax * 31 + az * 17 + bx * 13 + bz * 7) | 0));
  const len = Math.hypot(bx - ax, bz - az);
  if (len < margin * 2 + 0.5) return;
  for (let i = 0; i < n; i++) {
    const t = (margin + (len - 2 * margin) * ((i + r() * 0.8) / n));
    const x = ax + ((bx - ax) / len) * t + nx * off, z = az + ((bz - az) / len) * t + nz * off;
    kit.hideSpot(x, ys[(r() * ys.length) | 0], z, nx, 0, nz, 'wall');
  }
}

/** Floor spots tucked in random places of a rectangle (kind 'floor'). */
export function floorSpots(kit, x0, z0, x1, z1, n, y = 0.3, seed = 3) {
  const r = rng(seed + ((x0 * 11 + z0 * 5) | 0));
  for (let i = 0; i < n; i++) kit.hideSpot(x0 + (x1 - x0) * r(), y, z0 + (z1 - z0) * r(), 0, 1, 0, 'floor');
}

/** Corner spots of a rectangle (the classic place to blend in). */
export function cornerSpots(kit, x0, z0, x1, z1, ys = [0.5, 1.1], off = 0.35) {
  const c = [[x0 + off, z0 + off, 1, 1], [x1 - off, z0 + off, -1, 1], [x0 + off, z1 - off, 1, -1], [x1 - off, z1 - off, -1, -1]];
  for (const [x, z, sx, sz] of c) { kit.hideSpot(x, ys[0], z, sx, 0, 0, 'wall'); kit.hideSpot(x, ys[1], z, 0, 0, sz, 'wall'); }
}

/** Spots along all four inner walls of a rectangle. */
export function roomSpots(kit, x0, z0, x1, z1, perWall = 3, ys, seed) {
  wallSpots(kit, x0, z0, x1, z0, 0, 1, perWall, ys, { seed });
  wallSpots(kit, x0, z1, x1, z1, 0, -1, perWall, ys, { seed: (seed || 1) + 1 });
  wallSpots(kit, x0, z0, x0, z1, 1, 0, perWall, ys, { seed: (seed || 1) + 2 });
  wallSpots(kit, x1, z0, x1, z1, -1, 0, perWall, ys, { seed: (seed || 1) + 3 });
}

/** Load models in parallel: list of [id, x, y, z, rotY?, opts?]. Failures are swallowed (kit.model returns an empty group). */
export function props(kit, list) {
  return Promise.all(list.map(([id, x, y, z, rotY = 0, o = {}]) => kit.model(id, { pos: [x, y, z], rotY, ...o }).catch((e) => { console.warn('prop', id, e); return null; })));
}

/** Canvas helpers */
export function wrapText(g, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  g.fillText(line, x, y);
}

export function noise(g, w, h, amount = 18, alpha = 0.5, seed = 2) {
  const r = rng(seed);
  for (let i = 0; i < w * h * 0.04; i++) {
    const v = (r() * 2 - 1) * amount;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${(v / 255) * alpha})` : `rgba(0,0,0,${(-v / 255) * alpha})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Plane (decal) lying on a surface. */
export function decal(kit, mat, w, d, x, y, z, rotY = 0) {
  mat.transparent = true; mat.depthWrite = false; mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2; m.rotation.z = rotY; m.position.set(x, y, z);
  m.userData.collide = false; m.castShadow = false; m.receiveShadow = true;
  kit.root.add(m);
  return m;
}

/** Vertical plane on a wall. nx,nz = normal of the wall face. */
export function poster(kit, mat, w, h, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.y = rotY;
  m.userData.collide = false; m.castShadow = false; m.receiveShadow = true;
  kit.root.add(m);
  return m;
}
