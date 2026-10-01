// The hider mannequin body: one seamless skinned mesh built once per page from a signed-distance
// field (smooth union of round cones / ellipsoids) -> naive surface nets -> Newton projection onto
// the iso-surface (exact smooth normals) -> automatic skin weights from bone distance -> a
// cube-chart UV atlas (every body part is projected onto 6 cube faces from its own centre, charts
// are packed with gutters). Pure JS + three math, so it also runs under node for tests.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- rest skeleton (root = feet)
export const ARM_REST_ANGLE = 40 * DEG; // arms hang 40deg out from vertical in the bind pose
const dA_L = V(Math.sin(ARM_REST_ANGLE), -Math.cos(ARM_REST_ANGLE), 0);
const dA_R = V(-dA_L.x, dA_L.y, 0);
const SH_L = V(0.165, 0.925, 0), SH_R = V(-0.165, 0.925, 0);
const EL_L = SH_L.clone().addScaledVector(dA_L, 0.215), EL_R = SH_R.clone().addScaledVector(dA_R, 0.215);
const WR_L = EL_L.clone().addScaledVector(dA_L, 0.195), WR_R = EL_R.clone().addScaledVector(dA_R, 0.195);
const TIP_L = WR_L.clone().addScaledVector(dA_L, 0.085), TIP_R = WR_R.clone().addScaledVector(dA_R, 0.085);
const HIP_L = V(0.088, 0.565, 0), HIP_R = V(-0.088, 0.565, 0);
const KN_L = V(0.093, 0.30, 0.008), KN_R = V(-0.093, 0.30, 0.008);
const AN_L = V(0.097, 0.07, -0.005), AN_R = V(-0.097, 0.07, -0.005);
const HEEL_L = V(0.097, 0.055, -0.01), HEEL_R = V(-0.097, 0.055, -0.01);
const TOE_L = V(0.097, 0.042, 0.085), TOE_R = V(-0.097, 0.042, 0.085);

/** [name, parentIndex, restHeadPosition(root space), restTail] — index order is the skeleton order. */
export const BONES = [
  ['hips', -1, V(0, 0.60, 0), V(0, 0.68, 0)],
  ['spine', 0, V(0, 0.68, 0), V(0, 0.82, 0)],
  ['chest', 1, V(0, 0.82, 0), V(0, 0.975, 0)],
  ['neck', 2, V(0, 0.975, 0), V(0, 1.04, 0)],
  ['head', 3, V(0, 1.04, 0), V(0, 1.25, 0)],
  ['upperArm_L', 2, SH_L, EL_L], ['lowerArm_L', 5, EL_L, WR_L], ['hand_L', 6, WR_L, TIP_L],
  ['upperArm_R', 2, SH_R, EL_R], ['lowerArm_R', 8, EL_R, WR_R], ['hand_R', 9, WR_R, TIP_R],
  ['upperLeg_L', 0, HIP_L, KN_L], ['lowerLeg_L', 11, KN_L, AN_L], ['foot_L', 12, AN_L, TOE_L],
  ['upperLeg_R', 0, HIP_R, KN_R], ['lowerLeg_R', 14, KN_R, AN_R], ['foot_R', 15, AN_R, TOE_R],
];
export const B = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
export const REST_DIR = BONES.map(([, , h, t]) => t.clone().sub(h).normalize());

// ---------------------------------------------------------------- SDF
function sdRoundCone(px, py, pz, a, b, r1, r2) {
  // iq's exact round cone
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a.x, pay = py - a.y, paz = pz - a.z;
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const cx = pax * l2 - bax * y, cy = pay * l2 - bay * y, cz = paz * l2 - baz * y;
  const x2 = cx * cx + cy * cy + cz * cz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
function sdCapsuleS(px, py, pz, a, b, r, sz) { // capsule with z squashed by sz (elliptic cross-section)
  const d = sdRoundCone(px, py, pz / sz, a, b, r, r);
  return d * sz;
}
function sdEllipsoid(px, py, pz, c, rx, ry, rz) {
  const x = px - c.x, y = py - c.y, z = pz - c.z;
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
const P = {
  pelvisA: V(-0.06, 0.585, 0), pelvisB: V(0.06, 0.585, 0),
  absA: V(0, 0.62, 0), absB: V(0, 0.84, 0),
  barA: V(-0.10, 0.885, 0), barB: V(0.10, 0.885, 0),
  neckA: V(0, 0.94, 0), neckB: V(0, 1.03, 0),
  head: V(0, 1.118, 0.004),
};
function limbArm(x, y, z, SH, EL, WR, TIP) {
  const u = sdRoundCone(x, y, z, SH, EL, 0.060, 0.050);
  const f = sdRoundCone(x, y, z, EL, WR, 0.050, 0.044);
  const h = sdRoundCone(x, y, z, WR, TIP, 0.047, 0.041);
  return smin(smin(u, f, 0.02), h, 0.016);
}
function limbLeg(x, y, z, HIP, KN, AN, HEEL, TOE) {
  const t = sdRoundCone(x, y, z, HIP, KN, 0.080, 0.064);
  const s = sdRoundCone(x, y, z, KN, AN, 0.064, 0.052);
  const f = sdRoundCone(x, y, z, HEEL, TOE, 0.053, 0.042);
  return smin(smin(t, s, 0.02), f, 0.035);
}
export function bodySDF(x, y, z) {
  const pelvis = sdCapsuleS(x, y, z, P.pelvisA, P.pelvisB, 0.118, 0.78);
  const abs = sdRoundCone(x, y, z / 0.70, P.absA, P.absB, 0.128, 0.148) * 0.70;
  const bar = sdCapsuleS(x, y, z, P.barA, P.barB, 0.088, 0.9);
  const neck = sdRoundCone(x, y, z, P.neckA, P.neckB, 0.054, 0.056);
  const head = sdEllipsoid(x, y, z, P.head, 0.122, 0.132, 0.125);
  let T = smin(pelvis, abs, 0.07);
  T = smin(T, bar, 0.07);
  T = smin(T, neck, 0.045);
  T = smin(T, head, 0.035);
  // each limb blends with the torso only (never with each other -> clean gaps between legs/arms)
  let d = T;
  if (x > -0.05) {
    d = Math.min(d, smin(T, limbArm(x, y, z, SH_L, EL_L, WR_L, TIP_L), 0.03));
    d = Math.min(d, smin(T, limbLeg(x, y, z, HIP_L, KN_L, AN_L, HEEL_L, TOE_L), 0.045));
  }
  if (x < 0.05) {
    d = Math.min(d, smin(T, limbArm(x, y, z, SH_R, EL_R, WR_R, TIP_R), 0.03));
    d = Math.min(d, smin(T, limbLeg(x, y, z, HIP_R, KN_R, AN_R, HEEL_R, TOE_R), 0.045));
  }
  return d;
}

// ---------------------------------------------------------------- skin-weight segments
// bone -> list of [a, b, radius], sigma (softness of blend in metres)
const WSEG = [
  [[[V(0, 0.52, 0), V(0, 0.63, 0), 0.11]], 0.045],
  [[[V(0, 0.66, 0), V(0, 0.76, 0), 0.13]], 0.045],
  [[[V(0, 0.80, 0), V(0, 0.90, 0), 0.14], [V(-0.10, 0.89, 0), V(0.10, 0.89, 0), 0.085]], 0.045],
  [[[V(0, 0.955, 0), V(0, 1.01, 0), 0.05]], 0.022],
  [[[V(0, 1.08, 0), V(0, 1.15, 0), 0.12]], 0.022],
  [[[SH_L, EL_L, 0.055]], 0.022], [[[EL_L, WR_L, 0.047]], 0.02], [[[WR_L, TIP_L.clone().addScaledVector(dA_L, -0.03), 0.043]], 0.015],
  [[[SH_R, EL_R, 0.055]], 0.022], [[[EL_R, WR_R, 0.047]], 0.02], [[[WR_R, TIP_R.clone().addScaledVector(dA_R, -0.03), 0.043]], 0.015],
  [[[HIP_L, KN_L, 0.072]], 0.03], [[[KN_L, AN_L, 0.058]], 0.025], [[[V(0.097, 0.05, 0.0), TOE_L, 0.045]], 0.02],
  [[[HIP_R, KN_R, 0.072]], 0.03], [[[KN_R, AN_R, 0.058]], 0.025], [[[V(-0.097, 0.05, 0.0), TOE_R, 0.045]], 0.02],
];
function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / (abx * abx + aby * aby + abz * abz)));
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
}
function boneDists(p, out) {
  for (let i = 0; i < WSEG.length; i++) {
    let d = Infinity;
    for (const [a, b, r] of WSEG[i][0]) d = Math.min(d, segDist(p, a, b) - r);
    out[i] = d;
  }
  return out;
}

/** Capsules per bone in REST space for hit-testing / physics: [boneIndex, a, b, radius]. */
export const HIT_CAPSULES = [
  [0, V(-0.06, 0.585, 0), V(0.06, 0.585, 0), 0.125],
  [1, V(0, 0.64, 0), V(0, 0.78, 0), 0.15],
  [2, V(-0.09, 0.885, 0), V(0.09, 0.885, 0), 0.105],
  [3, V(0, 0.95, 0), V(0, 1.03, 0), 0.06],
  [4, V(0, 1.1, 0), V(0, 1.14, 0), 0.135],
  [5, SH_L, EL_L, 0.062], [6, EL_L, WR_L, 0.052], [7, WR_L, TIP_L.clone().addScaledVector(dA_L, -0.04), 0.048],
  [8, SH_R, EL_R, 0.062], [9, EL_R, WR_R, 0.052], [10, WR_R, TIP_R.clone().addScaledVector(dA_R, -0.04), 0.048],
  [11, HIP_L, KN_L, 0.082], [12, KN_L, AN_L, 0.066], [13, V(0.097, 0.05, 0), TOE_L.clone().add(V(0, 0, -0.04)), 0.055],
  [14, HIP_R, KN_R, 0.082], [15, KN_R, AN_R, 0.066], [16, V(-0.097, 0.05, 0), TOE_R.clone().add(V(0, 0, -0.04)), 0.055],
];

// ---------------------------------------------------------------- UV chart parts
const PART_OF_BONE = [0, 0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6, 7, 10, 8, 9, 11];
function limbFrame(a, b, r) {
  const ax = b.clone().sub(a); const len = ax.length(); ax.normalize();
  const ref = Math.abs(ax.z) < 0.9 ? V(0, 0, 1) : V(1, 0, 0);
  const e1 = ref.clone().sub(ax.clone().multiplyScalar(ref.dot(ax))).normalize();
  const e2 = ax.clone().cross(e1);
  return { c: a.clone().add(b).multiplyScalar(0.5), axes: [ax, e1, e2], ext: [len / 2 + r, r, r] };
}
const PARTS = [
  { c: V(0, 0.75, 0), axes: [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)], ext: [0.2, 0.26, 0.13] }, // torso
  { c: V(0, 1.1, 0), axes: [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)], ext: [0.13, 0.16, 0.13] }, // head+neck
  limbFrame(SH_L, EL_L, 0.06), limbFrame(EL_L, TIP_L, 0.05),
  limbFrame(SH_R, EL_R, 0.06), limbFrame(EL_R, TIP_R, 0.05),
  limbFrame(HIP_L, KN_L, 0.08), limbFrame(KN_L, AN_L.clone().add(V(0, 0, 0.04)), 0.065),
  limbFrame(HIP_R, KN_R, 0.08), limbFrame(KN_R, AN_R.clone().add(V(0, 0, 0.04)), 0.065),
  limbFrame(HEEL_L, TOE_L, 0.055), limbFrame(HEEL_R, TOE_R, 0.055),
];

// ---------------------------------------------------------------- build
/**
 * Build the body geometry. Returns { geometry, triBone:Uint8Array (dominant bone per triangle, triangles
 * sorted by bone), boneTriRanges:[[start,count]] }. ~100-250 ms; cache the result (getBodyGeometry()).
 */
export function buildBodyGeometry({ cell = 0.0125, gutterTexels = 8, atlasRef = 1024 } = {}) {
  // --- grid
  const min = V(-0.6, -0.02, -0.2), max = V(0.6, 1.28, 0.2);
  const nx = Math.ceil((max.x - min.x) / cell) + 1, ny = Math.ceil((max.y - min.y) / cell) + 1, nz = Math.ceil((max.z - min.z) / cell) + 1;
  const F = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  // coarse pass to skip far-away regions
  const C = 4, cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    coarse[(k * cy + j) * cx + i] = bodySDF(min.x + i * C * cell, min.y + j * C * cell, min.z + k * C * cell);
  }
  const band = C * cell * 1.8;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ci = Math.round(i / C), cj = Math.round(j / C), ck = Math.round(k / C);
    const cv = coarse[(ck * cy + cj) * cx + ci];
    F[idx(i, j, k)] = Math.abs(cv) > band ? cv : bodySDF(min.x + i * cell, min.y + j * cell, min.z + k * cell);
  }
  // --- surface nets: one vertex per sign-changing cell
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const o = corner[c]; cv[c] = F[idx(i + o[0], j + o[1], k + o[2])]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb), oa = corner[a], ob = corner[b];
      sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; n++;
    }
    cellVert[cidx(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / n) * cell, min.y + (j + sy / n) * cell, min.z + (k + sz / n) * cell);
  }
  // quads across sign-changing grid edges
  const quads = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const f0 = F[idx(i, j, k)] < 0;
    // x edge (i,j,k)-(i+1,j,k): cells sharing it vary in j,k
    if (i < nx - 1 && f0 !== (F[idx(i + 1, j, k)] < 0)) {
      const q = [cidx(i, j - 1, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i, j - 1, k)];
      quads.push(f0 ? q : q.reverse());
    }
    if (j < ny - 1 && f0 !== (F[idx(i, j + 1, k)] < 0)) {
      const q = [cidx(i - 1, j, k - 1), cidx(i - 1, j, k), cidx(i, j, k), cidx(i, j, k - 1)];
      quads.push(f0 ? q : q.reverse());
    }
    if (k < nz - 1 && f0 !== (F[idx(i, j, k + 1)] < 0)) {
      const q = [cidx(i - 1, j - 1, k), cidx(i, j - 1, k), cidx(i, j, k), cidx(i - 1, j, k)];
      quads.push(f0 ? q : q.reverse());
    }
  }
  // --- project onto the iso-surface + analytic-ish normals
  const nv = pos.length / 3;
  const P3 = new Float32Array(pos), N3 = new Float32Array(nv * 3);
  const e = 0.0012;
  const grad = (x, y, z, out) => {
    out[0] = bodySDF(x + e, y, z) - bodySDF(x - e, y, z);
    out[1] = bodySDF(x, y + e, z) - bodySDF(x, y - e, z);
    out[2] = bodySDF(x, y, z + e) - bodySDF(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    let x = P3[v * 3], y = P3[v * 3 + 1], z = P3[v * 3 + 2];
    for (let it = 0; it < 4; it++) {
      const d = bodySDF(x, y, z); if (Math.abs(d) < 1e-5) break;
      grad(x, y, z, g); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    grad(x, y, z, g);
    P3[v * 3] = x; P3[v * 3 + 1] = y; P3[v * 3 + 2] = z;
    N3[v * 3] = g[0]; N3[v * 3 + 1] = g[1]; N3[v * 3 + 2] = g[2];
  }
  // --- triangles (split each quad along the shorter diagonal)
  const tris = [];
  const d2 = (a, b) => (P3[a * 3] - P3[b * 3]) ** 2 + (P3[a * 3 + 1] - P3[b * 3 + 1]) ** 2 + (P3[a * 3 + 2] - P3[b * 3 + 2]) ** 2;
  for (const q of quads) {
    const [a, b, c, d] = q.map((ci) => cellVert[ci]);
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    if (d2(a, c) <= d2(b, d)) { tris.push(a, b, c, a, c, d); } else { tris.push(a, b, d, b, c, d); }
  }
  // --- skin weights
  const NB = BONES.length;
  const skinIdx = new Uint16Array(nv * 4), skinW = new Float32Array(nv * 4), domBone = new Uint8Array(nv);
  const dists = new Float32Array(NB), p = V(0, 0, 0);
  const cand = [];
  for (let v = 0; v < nv; v++) {
    p.set(P3[v * 3], P3[v * 3 + 1], P3[v * 3 + 2]);
    boneDists(p, dists);
    let dmin = Infinity; for (let i = 0; i < NB; i++) dmin = Math.min(dmin, dists[i]);
    cand.length = 0;
    for (let i = 0; i < NB; i++) {
      const s = WSEG[i][1], x = (dists[i] - dmin) / s;
      if (x < 5) cand.push([i, Math.exp(-x * x * 0.6 - x * 0.4)]);
    }
    cand.sort((A, Bq) => Bq[1] - A[1]);
    let sum = 0; const n = Math.min(4, cand.length);
    for (let c = 0; c < n; c++) sum += cand[c][1];
    for (let c = 0; c < 4; c++) {
      skinIdx[v * 4 + c] = c < n ? cand[c][0] : 0;
      skinW[v * 4 + c] = c < n ? cand[c][1] / sum : 0;
    }
    domBone[v] = cand[0][0];
  }
  // --- triangle -> dominant bone (sum of weights) -> part -> cube face chart
  const ntri = tris.length / 3;
  const triBone = new Uint8Array(ntri);
  const acc = new Float32Array(NB);
  for (let t = 0; t < ntri; t++) {
    acc.fill(0);
    for (let c = 0; c < 3; c++) { const v = tris[t * 3 + c]; for (let w = 0; w < 4; w++) acc[skinIdx[v * 4 + w]] += skinW[v * 4 + w]; }
    let best = 0; for (let i = 1; i < NB; i++) if (acc[i] > acc[best]) best = i;
    triBone[t] = best;
  }
  const qn = (part, x, y, z, out) => {
    const f = PARTS[part];
    const dx = x - f.c.x, dy = y - f.c.y, dz = z - f.c.z;
    for (let a = 0; a < 3; a++) out[a] = (dx * f.axes[a].x + dy * f.axes[a].y + dz * f.axes[a].z) / f.ext[a];
    return out;
  };
  const charts = new Map();
  const qa = [0, 0, 0];
  for (let t = 0; t < ntri; t++) {
    const part = PART_OF_BONE[triBone[t]];
    let cxm = 0, cym = 0, czm = 0;
    for (let c = 0; c < 3; c++) { const v = tris[t * 3 + c]; cxm += P3[v * 3]; cym += P3[v * 3 + 1]; czm += P3[v * 3 + 2]; }
    qn(part, cxm / 3, cym / 3, czm / 3, qa);
    let ax = 0; for (let a = 1; a < 3; a++) if (Math.abs(qa[a]) > Math.abs(qa[ax])) ax = a;
    const key = part * 6 + ax * 2 + (qa[ax] < 0 ? 1 : 0);
    if (!charts.has(key)) charts.set(key, { key, part, ax, sign: qa[ax] < 0 ? -1 : 1, tris: [] });
    charts.get(key).tris.push(t);
  }
  // per chart: gnomonic projection -> metres
  const outPos = [], outNrm = [], outUV = [], outSI = [], outSW = [], outIdx = [], outTriBone = [];
  const remap = new Map();
  const chartList = [...charts.values()];
  for (const ch of chartList) {
    const u = (ch.ax + 1) % 3, w = (ch.ax + 2) % 3;
    ch.verts = new Map(); // orig vertex -> [s,t]
    for (const t of ch.tris) for (let c = 0; c < 3; c++) {
      const v = tris[t * 3 + c];
      if (ch.verts.has(v)) continue;
      qn(ch.part, P3[v * 3], P3[v * 3 + 1], P3[v * 3 + 2], qa);
      const den = Math.max(0.15, qa[ch.ax] * ch.sign);
      ch.verts.set(v, [(qa[u] / den) * ch.sign, qa[w] / den]);
    }
    let a3 = 0, a2 = 0;
    const tv = new THREE.Vector3(), tw = new THREE.Vector3();
    for (const t of ch.tris) {
      const [i0, i1, i2] = [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]];
      tv.set(P3[i1 * 3] - P3[i0 * 3], P3[i1 * 3 + 1] - P3[i0 * 3 + 1], P3[i1 * 3 + 2] - P3[i0 * 3 + 2]);
      tw.set(P3[i2 * 3] - P3[i0 * 3], P3[i2 * 3 + 1] - P3[i0 * 3 + 1], P3[i2 * 3 + 2] - P3[i0 * 3 + 2]);
      a3 += tv.cross(tw).length() / 2;
      const s0 = ch.verts.get(i0), s1 = ch.verts.get(i1), s2 = ch.verts.get(i2);
      a2 += Math.abs((s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1])) / 2;
    }
    const sc = Math.sqrt(a3 / Math.max(a2, 1e-9));
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const st of ch.verts.values()) { st[0] *= sc; st[1] *= sc; mnx = Math.min(mnx, st[0]); mny = Math.min(mny, st[1]); mxx = Math.max(mxx, st[0]); mxy = Math.max(mxy, st[1]); }
    const rot = mxy - mny > mxx - mnx; // keep every chart landscape (tighter shelves)
    for (const st of ch.verts.values()) { const a = st[0] - mnx, b = st[1] - mny; if (rot) { st[0] = b; st[1] = a; } else { st[0] = a; st[1] = b; } }
    ch.w = rot ? mxy - mny : mxx - mnx; ch.h = rot ? mxx - mnx : mxy - mny;
  }
  // shelf packing: find the smallest square side S (metres) that fits everything with gutters
  chartList.sort((a, b) => b.h - a.h);
  const tryPack = (S) => { // skyline bottom-left packer
    const gut = (gutterTexels / atlasRef) * S;
    let sky = [{ x: 0, y: 0, w: S }];
    for (const ch of chartList) {
      const w = ch.w + gut, h = ch.h + gut;
      let best = null;
      for (let i = 0; i < sky.length; i++) {
        const x = sky[i].x; if (x + w > S) break;
        let y = 0, j = i, rem = w;
        while (rem > 1e-9 && j < sky.length) { y = Math.max(y, sky[j].y); rem -= sky[j].w; j++; }
        if (rem > 1e-9) break;
        if (y + h <= S && (!best || y + h < best.y + best.h - 1e-9)) best = { x, y, h, i };
      }
      if (!best) return false;
      ch.px = best.x + gut; ch.py = best.y + gut;
      // update skyline
      const nx0 = best.x, nx1 = best.x + w, top = best.y + h;
      const next = [];
      for (const seg of sky) {
        const s0 = seg.x, s1 = seg.x + seg.w;
        if (s1 <= nx0 || s0 >= nx1) { next.push(seg); continue; }
        if (s0 < nx0) next.push({ x: s0, y: seg.y, w: nx0 - s0 });
        if (s1 > nx1) next.push({ x: nx1, y: seg.y, w: s1 - nx1 });
      }
      next.push({ x: nx0, y: top, w });
      next.sort((a, b) => a.x - b.x);
      sky = [];
      for (const seg of next) { const l = sky[sky.length - 1]; if (l && Math.abs(l.y - seg.y) < 1e-9) l.w += seg.w; else sky.push({ ...seg }); }
    }
    return true;
  };
  let lo = 0.1, hi = 10;
  for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (tryPack(mid)) hi = mid; else lo = mid; }
  const S = hi; tryPack(S);
  // emit vertices (duplicated per chart)
  for (const ch of chartList) {
    for (const t of ch.tris) {
      for (let c = 0; c < 3; c++) {
        const v = tris[t * 3 + c];
        const key = v * 256 + (ch.key & 255);
        let ni = remap.get(key);
        if (ni === undefined) {
          ni = outPos.length / 3;
          remap.set(key, ni);
          outPos.push(P3[v * 3], P3[v * 3 + 1], P3[v * 3 + 2]);
          outNrm.push(N3[v * 3], N3[v * 3 + 1], N3[v * 3 + 2]);
          const st = ch.verts.get(v);
          outUV.push((ch.px + st[0]) / S, (ch.py + st[1]) / S);
          for (let w = 0; w < 4; w++) { outSI.push(skinIdx[v * 4 + w]); outSW.push(skinW[v * 4 + w]); }
        }
        outIdx.push(ni);
      }
    }
  }
  // sort triangles by dominant bone (for the fast CPU raycast)
  const triOrder = [];
  for (const ch of chartList) for (const t of ch.tris) triOrder.push(t);
  const emitted = outIdx.slice();
  const order = triOrder.map((t, i) => i).sort((a, b) => triBone[triOrder[a]] - triBone[triOrder[b]]);
  const idxSorted = new Uint32Array(emitted.length);
  const tb = new Uint8Array(order.length);
  order.forEach((src, dst) => { idxSorted.set(emitted.slice(src * 3, src * 3 + 3), dst * 3); tb[dst] = triBone[triOrder[src]]; });
  const boneTriRanges = BONES.map(() => [0, 0]);
  for (let t = 0; t < tb.length; t++) { const r = boneTriRanges[tb[t]]; if (r[1] === 0) r[0] = t; r[1]++; }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(outNrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(outSI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(outSW, 4));
  geo.setIndex(new THREE.BufferAttribute(outPos.length / 3 > 65535 ? idxSorted : new Uint16Array(idxSorted), 1));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.name = 'mannequin-body';
  return { geometry: geo, triBone: tb, boneTriRanges, atlasMetres: S, charts: chartList.length, gridVerts: nv };
}

let _cached = null;
/** Shared, cached body (geometry is shared by every mannequin; each has its own skeleton + paint). */
export function getBody() {
  if (!_cached) _cached = buildBodyGeometry();
  return _cached;
}
