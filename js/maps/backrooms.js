// Backrooms: an endless-feeling maze of yellow wallpaper, damp carpet and buzzing fluorescent panels.
import * as THREE from 'three';
import { rng, wallSpots, floorSpots, noise } from './gen.js';

const N = 8, C = 6, H = 3.1, T = 0.24;
const ORG = -(N * C) / 2;

export async function build({ kit, assets }) {
  const R = rng(1337);

  const paper = assets.canvasMaterial('back-paper', 512, 512, (g, w, h) => {
    g.fillStyle = '#c9b45a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = (x / 64) % 2 ? 'rgba(120,100,30,0.16)' : 'rgba(255,240,150,0.1)'; g.fillRect(x, 0, 32, h); }
    g.strokeStyle = 'rgba(110,90,30,0.28)'; g.lineWidth = 2;
    for (let y = 40; y < h; y += 96) for (let x = 16; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 32, y + 24); g.lineTo(x, y + 48); g.lineTo(x - 32, y + 24); g.closePath(); g.stroke(); }
    const r = rng(8);
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h * 0.5; const gr = g.createLinearGradient(0, y, 0, y + 150 + r() * 200); gr.addColorStop(0, 'rgba(80,60,10,0.22)'); gr.addColorStop(1, 'rgba(80,60,10,0)'); g.fillStyle = gr; g.fillRect(x, y, 14 + r() * 28, 360); }
    noise(g, w, h, 16, 0.6, 4);
  }, { roughness: 0.92 }, [0.5, 0.5]);
  const carpet = assets.canvasMaterial('back-carpet', 256, 256, (g, w, h) => {
    g.fillStyle = '#a28f4a'; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,240,170,0.16)' : 'rgba(60,45,10,0.2)'; g.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(70,50,10,0.12)'; g.beginPath(); g.arc(r() * w, r() * h, 20 + r() * 30, 0, 6.3); g.fill(); }
  }, { roughness: 1 }, [0.5, 0.5]);
  const ceilTile = assets.canvasMaterial('back-ceil', 256, 256, (g, w, h) => {
    g.fillStyle = '#d5cba0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,60,30,0.5)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    const r = rng(2); for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(90,80,40,0.25)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { roughness: 1 }, [0.5, 0.5]);
  const panel = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6d0).multiplyScalar(3.2) });
  const base = assets.mat('back-base', { color: 0x6a5a28, roughness: 0.8 });

  kit.floor(ORG, ORG, -ORG, -ORG, 0, carpet, { uv: 2 });
  kit.ceiling(ORG, ORG, -ORG, -ORG, H, ceilTile, { uv: 2 });

  // maze: DFS spanning tree + extra loops
  const open = new Set();
  const key = (a, b, dir) => `${a},${b},${dir}`; // dir 0 = wall on +x side of cell, 1 = wall on +z side
  const seen = Array.from({ length: N }, () => Array(N).fill(false));
  const stack = [[0, 0]]; seen[0][0] = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [cx + dx, cz + dz, dx, dz]).filter(([x, z]) => x >= 0 && z >= 0 && x < N && z < N && !seen[x][z]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, nz, dx, dz] = nb[(R() * nb.length) | 0];
    seen[nx][nz] = true;
    open.add(dx ? key(Math.min(cx, nx), cz, 0) : key(cx, Math.min(cz, nz), 1));
    stack.push([nx, nz]);
  }
  for (let i = 0; i < 26; i++) {
    const a = (R() * (N - 1)) | 0, b = (R() * (N - 1)) | 0;
    open.add(R() > 0.5 ? key(a, b, 0) : key(a, b, 1));
  }
  const gx = (i) => ORG + i * C;
  const edges = [];
  // outer boundary
  for (let i = 0; i < N; i++) {
    edges.push([gx(i), ORG, gx(i + 1), ORG, 0, -1]); edges.push([gx(i), -ORG, gx(i + 1), -ORG, 0, 1]);
    edges.push([ORG, gx(i), ORG, gx(i + 1), -1, 0]); edges.push([-ORG, gx(i), -ORG, gx(i + 1), 1, 0]);
  }
  const walls = [];
  // interior edges with half-open gaps so openings read as doorways in a room-like layout
  for (let a = 0; a < N - 1; a++) for (let b = 0; b < N; b++) {
    // wall between cell (a,b) and (a+1,b) lies on x = gx(a+1), spanning z in [gx(b), gx(b+1)]
    const x = gx(a + 1);
    if (open.has(key(a, b, 0))) { // open edge: leave a wide gap, keep short stubs for corners
      const z0 = gx(b); const stub = 1.2;
      walls.push([x, z0, x, z0 + stub, 1, 0]); walls.push([x, z0 + C - stub, x, z0 + C, 1, 0]);
    } else walls.push([x, gx(b), x, gx(b + 1), 1, 0]);
  }
  for (let a = 0; a < N; a++) for (let b = 0; b < N - 1; b++) {
    const z = gx(b + 1);
    if (open.has(key(a, b, 1))) {
      const x0 = gx(a); const stub = 1.2;
      walls.push([x0, z, x0 + stub, z, 0, 1]); walls.push([x0 + C - stub, z, x0 + C, z, 0, 1]);
    } else walls.push([gx(a), z, gx(a + 1), z, 0, 1]);
  }
  for (const [ax, az, bx, bz] of [...edges, ...walls]) {
    kit.wall(ax, az, bx, bz, 0, H, paper, { t: T, uv: 2 });
    // baseboard
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const horiz = Math.abs(bz - az) < 1e-6;
    kit.box(horiz ? len : T + 0.06, 0.14, horiz ? T + 0.06 : len, base, { pos: [cx, 0.07, cz], collide: false });
  }

  // fluorescent panels: a grid in every cell, real lights in a scattering of cells
  const lit = [];
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
    const cx = gx(a) + C / 2, cz = gx(b) + C / 2;
    kit.box(1.2, 0.05, 0.5, panel, { pos: [cx, H - 0.03, cz], collide: false, cast: false, receive: false });
    lit.push([cx, cz]);
  }
  const order = lit.map((p, i) => [R(), p]).sort((p, q) => p[0] - q[0]).slice(0, 22);
  for (const [, [x, z]] of order) kit.point([x, H - 0.4, z], 0xfff1b8, 7, 12);
  kit.point([0, H - 0.4, 0], 0xfff1b8, 22, 24, { shadow: true, shadowSize: 1024 });
  kit.hemi(0xfff0c0, 0x8a7a30, 0.9);

  // gameplay
  const cells = [];
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) cells.push([gx(a) + C / 2, gx(b) + C / 2]);
  const spawnCells = cells.filter(([x, z]) => x > ORG + 6 && z < -ORG - 6 && z > ORG + 6);
  for (let i = 0; i < 16; i++) { const [x, z] = cells[(i * 4 + 5) % cells.length]; kit.hider(x + ((i % 3) - 1) * 0.8, 0.05, z + ((i % 2) - 0.5) * 1.0); }
  kit.seeker(-21, 0.05, 21); kit.seeker(-19.5, 0.05, 21); kit.seeker(-21, 0.05, 19.5); kit.seeker(-19.5, 0.05, 19.5); kit.seeker(-18, 0.05, 21);
  for (const [ax, az, bx, bz, nx, nz] of walls) {
    wallSpots(kit, ax, az, bx, bz, nx, nz, 1, [0.5, 1.0, 1.6], { seed: 3 });
    wallSpots(kit, ax, az, bx, bz, -nx, -nz, 1, [0.5, 1.0, 1.6], { seed: 4 });
  }
  for (const [ax, az, bx, bz, nx, nz] of edges) wallSpots(kit, ax, az, bx, bz, -nx, -nz, 2, [0.5, 1.0, 1.6], { seed: 5 });
  floorSpots(kit, ORG + 2, ORG + 2, -ORG - 2, -ORG - 2, 12, 0.3, 6);

  return kit.data({
    titleCam: { center: new THREE.Vector3(0, 1.6, 0), radius: 6, height: 1.7 },
    environment: {
      exposure: 1.05, envIntensity: 0.4, background: new THREE.Color(0x201a08), probe: [0, 1.6, 0],
      fog: new THREE.FogExp2(0x7a6a30, 0.018),
      bloom: { strength: 0.3, radius: 0.5, threshold: 0.9 }, ao: { aoRadius: 1.0, intensity: 2.4, distanceFalloff: 0.7 },
    },
    seekerWait: { pos: new THREE.Vector3(-20, 1.6, 20), look: new THREE.Vector3(0, 1.6, 0) },
  });
}
