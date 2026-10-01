// Sugar Land: a pastel candy world. Giant tiered cake, gingerbread houses, lollipop forest, candy canes, gumdrops and a chocolate river.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, roomSpots, poster, noise, decal } from './gen.js';

const S = 25, WH = 5;

export async function build({ kit, assets }) {
  const R = rng(2024);
  const cm = (key, c, r = 0.45, extra = {}) => assets.mat('sugar-' + key, { color: c, roughness: r, ...extra });
  const pink = cm('pink', 0xff9ec4, 0.4), white = cm('white', 0xfff6f8, 0.5), mint = cm('mint', 0x9ff0cf, 0.4), lemon = cm('lemon', 0xffe98a, 0.4);
  const lilac = cm('lilac', 0xc9a8ff, 0.4), peach = cm('peach', 0xffc08a, 0.4), sky = cm('sky', 0x9fd6ff, 0.4), red = cm('red', 0xff4f6a, 0.3);
  const choc = cm('choc', 0x4a2616, 0.35), cream = cm('cream', 0xfff0d0, 0.6);
  const gum = [pink, mint, lemon, lilac, peach, sky, red];

  const ground = assets.canvasMaterial('sugar-ground', 512, 512, (g, w, h) => {
    g.fillStyle = '#ffd9ea'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) { g.fillStyle = '#fff3f8'; g.fillRect(i * 128, j * 128, 128, 128); }
    const r = rng(6); const cols = ['#ff7aa8', '#7be0c0', '#ffd24a', '#a98aff', '#6ec3ff'];
    for (let i = 0; i < 260; i++) { g.save(); g.translate(r() * w, r() * h); g.rotate(r() * 6.3); g.fillStyle = cols[(r() * 5) | 0]; g.fillRect(-5, -1.6, 10, 3.2); g.restore(); }
    noise(g, w, h, 6, 0.35, 8);
  }, { roughness: 0.7 }, [0.5, 0.5]);
  const wafer = assets.canvasMaterial('sugar-wafer', 256, 256, (g, w, h) => {
    g.fillStyle = '#f6c98a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9a35e'; g.lineWidth = 6; for (let x = 0; x <= w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y <= h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    noise(g, w, h, 14, 0.5, 4);
  }, { roughness: 0.9 }, [1, 1]);
  const gingerbread = assets.canvasMaterial('sugar-ginger', 256, 256, (g, w, h) => {
    g.fillStyle = '#a8602e'; g.fillRect(0, 0, w, h);
    const r = rng(10); for (let i = 0; i < 60; i++) { g.fillStyle = r() > 0.5 ? 'rgba(255,200,130,0.18)' : 'rgba(60,25,5,0.2)'; g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 9, 0, 6.3); g.fill(); }
    noise(g, w, h, 16, 0.6, 12);
  }, { roughness: 0.95 }, [0.5, 0.5]);
  const stripe = (key, a, b, n = 8) => assets.canvasMaterial('sugar-stripe-' + key, 256, 256, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b;
    for (let i = -n; i < n * 2; i++) { g.beginPath(); g.moveTo((i * w) / n, 0); g.lineTo(((i + 0.5) * w) / n, 0); g.lineTo(((i + 0.5) * w) / n - w * 0.5, h); g.lineTo((i * w) / n - w * 0.5, h); g.fill(); }
  }, { roughness: 0.3 }, [1, 1]);
  const cane = stripe('cane', '#ffffff', '#ff3b5c', 6);
  const awning = stripe('awning', '#fff6f8', '#ff7aa8', 8);
  const spiral = (key, cols) => assets.canvasMaterial('sugar-spiral-' + key, 256, 256, (g, w, h) => {
    const n = cols.length * 3, cx = w / 2, cy = h / 2, R0 = w / 2, SEG = 16;
    g.fillStyle = cols[1]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i += 1) {
      if (i % cols.length) continue;
      g.fillStyle = cols[0]; g.beginPath(); g.moveTo(cx, cy);
      for (let k = 0; k <= SEG; k++) { const r = (k / SEG) * R0, th = (i / n) * 6.2832 + (k / SEG) * 1.8; g.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r); }
      for (let k = SEG; k >= 0; k--) { const r = (k / SEG) * R0, th = ((i + 1) / n) * 6.2832 + (k / SEG) * 1.8; g.lineTo(cx + Math.cos(th) * r, cy + Math.sin(th) * r); }
      g.closePath(); g.fill();
    }
  }, { roughness: 0.25 }, [1, 1]);
  const swirls = [spiral('a', ['#ff5c8a', '#ffffff']), spiral('b', ['#7be0c0', '#ffffff']), spiral('c', ['#a98aff', '#ffe98a']), spiral('d', ['#ffa03a', '#fff3c0'])];
  const river = assets.mat('sugar-river', { color: 0x3a1a0c, roughness: 0.05, metalness: 0.2 });

  // ---- sky dome
  const skyTex = assets.canvasTexture('sugar-sky', 512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9fd6ff'); gr.addColorStop(0.55, '#ffd2ea'); gr.addColorStop(1, '#fff1d8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(77); for (let i = 0; i < 18; i++) { const x = r() * w, y = h * (0.15 + r() * 0.45); g.fillStyle = 'rgba(255,255,255,0.85)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + k * 18, y + (r() - 0.5) * 8, 22 + r() * 18, 10 + r() * 6, 0, 0, 6.3); g.fill(); } }
  }, [1, 1]);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(95, 32, 20), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  dome.userData.collide = false; dome.castShadow = false; dome.receiveShadow = false; kit.root.add(dome);

  // ---- ground + frosted perimeter wall
  kit.floor(-S, -S, S, S, 0, ground, { uv: 6 });
  for (const [ax, az, bx, bz] of [[-S, -S, S, -S], [-S, S, S, S], [-S, -S, -S, S], [S, -S, S, S]]) {
    kit.wall(ax, az, bx, bz, 0, WH, wafer, { t: 0.8, uv: 3 });
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 2.2);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; kit.sphere(0.75, white, { pos: [ax + (bx - ax) * t, WH + 0.1, az + (bz - az) * t], scale: [1, 0.8, 1], collide: false, segments: 10 }); }
  }
  // chocolate river
  decal(kit, river, 2 * S, 3.4, 0, 0.03, 8.6, 0);
  kit.box(2 * S, 0.1, 0.3, cream, { pos: [0, 0.05, 6.8], collide: false }); kit.box(2 * S, 0.1, 0.3, cream, { pos: [0, 0.05, 10.4], collide: false });

  // ---- builders
  const gumdrop = (x, z, r, mat) => { kit.sphere(r, mat, { pos: [x, r * 0.5, z], scale: [1, 0.78, 1], segments: 18 }); kit.sphere(r * 0.12, white, { pos: [x - r * 0.3, r * 0.82, z - r * 0.3], collide: false, segments: 6, cast: false }); };
  const lolly = (x, z, h, sw) => { kit.cyl(0.1, h, white, { pos: [x, h / 2, z], segments: 8 }); const d = kit.cyl(h * 0.28, 0.14, swirls[sw], { pos: [x, h + h * 0.12, z], segments: 28 }); d.rotation.x = Math.PI / 2; d.rotation.z = R() * 6; d.rotation.y = 0; };
  const caneAt = (x, z, h, ry) => {
    const pts = []; for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(0, (h * i) / 12, 0));
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push(new THREE.Vector3(Math.sin(a) * h * 0.2 * (1), h * 0.5 + Math.sin(a * 0.5) * 0 + (1 - Math.cos(a)) * h * 0.0, 0).setY(h * 0.5 + Math.sin(a) * h * 0.2).setX(h * 0.2 - Math.cos(a) * h * 0.2)); }
    const m = kit.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.16, 10, false), cane, { pos: [x, 0, z], rot: [0, ry, 0] });
    kit.collider(0.4, h, 0.4, [x, h / 2, z], 0);
    return m;
  };
  const cupcake = (x, z, s, wrap, frost) => {
    kit.cyl(0.55 * s, 0.7 * s, wrap, { pos: [x, 0.35 * s, z], radiusTop: 0.7 * s, segments: 16 });
    kit.sphere(0.72 * s, frost, { pos: [x, 0.95 * s, z], scale: [1, 0.8, 1], segments: 16 });
    kit.sphere(0.4 * s, frost, { pos: [x, 1.4 * s, z], collide: false, segments: 12 });
    kit.sphere(0.16 * s, red, { pos: [x, 1.75 * s, z], collide: false, segments: 8 });
  };
  const donut = (x, z, s, mat) => {
    const t = kit.mesh(new THREE.TorusGeometry(1.0 * s, 0.45 * s, 14, 28), mat, { pos: [x, 1.45 * s, z], rot: [0, R() * 3, 0] });
    kit.mesh(new THREE.TorusGeometry(1.0 * s, 0.48 * s, 14, 28, Math.PI * 1.9), cm('icing' + (x | 0), 0xff7aa8, 0.3), { pos: [x, 1.5 * s + 0.0, z], rot: [0, t.rotation.y, 0], collide: false, cast: false });
  };
  const cone = (x, z, s, ball) => {
    const c = kit.cyl(0.001, 2.0 * s, peach, { pos: [x, 1.0 * s, z], radiusTop: 0.7 * s, segments: 14 }); c.rotation.x = Math.PI; c.position.y = 1.0 * s;
    kit.sphere(0.85 * s, ball, { pos: [x, 2.2 * s, z], segments: 18 }); kit.sphere(0.2 * s, red, { pos: [x, 3.0 * s, z], collide: false, segments: 8 });
  };
  const peppermint = (x, z, r, ry) => { const d = kit.cyl(r, 0.25, swirls[3], { pos: [x, r * 0.9, z], rot: [Math.PI / 2 - 0.25, ry, 0], segments: 28 }); };

  // ---- centrepiece cake
  kit.cyl(3.4, 1.3, cm('cake1', 0xffc8dc, 0.5), { pos: [0, 0.65, -2], segments: 32 });
  kit.cyl(2.5, 1.2, cm('cake2', 0xcfeee0, 0.5), { pos: [0, 1.9, -2], segments: 32 });
  kit.cyl(1.6, 1.1, cm('cake3', 0xfff0b8, 0.5), { pos: [0, 3.05, -2], segments: 32 });
  for (const [r, y] of [[3.45, 1.3], [2.55, 2.5], [1.65, 3.6]]) kit.mesh(new THREE.TorusGeometry(r, 0.14, 8, 40), white, { pos: [0, y, -2], rot: [Math.PI / 2, 0, 0], collide: false });
  for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283; kit.sphere(0.2, red, { pos: [Math.cos(a) * 3.3, 1.45, -2 + Math.sin(a) * 3.3], collide: false, segments: 8 }); }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; const x = Math.cos(a) * 1.0, z = -2 + Math.sin(a) * 1.0; kit.cyl(0.07, 0.6, gum[i], { pos: [x, 3.9, z], collide: false, segments: 6 }); kit.bulb([x, 4.3, z], 0xffc060, 0.1, 5); }
  kit.point([0, 4.6, -2], 0xffd8a0, 6, 10);

  // ---- gingerbread houses
  const house = (x0, z0, x1, z1, facing, roofMat, name) => {
    const H = 3.2, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const dx = 1.0;
    const doorA = (x1 - x0) / 2 - dx;
    const wg = (a, b) => ({ a, b, y0: 1.0, y1: 2.3 });
    kit.wall(x0, z1, x1, z1, 0, H, gingerbread, { t: 0.3, uv: 2, gaps: facing === 's' ? [{ a: doorA, b: doorA + 2.0, y0: 0, y1: 2.5 }, wg(0.9, 2.2), wg(x1 - x0 - 2.2, x1 - x0 - 0.9)] : [wg(2, 3.4)] });
    kit.wall(x0, z0, x1, z0, 0, H, gingerbread, { t: 0.3, uv: 2, gaps: facing === 'n' ? [{ a: doorA, b: doorA + 2.0, y0: 0, y1: 2.5 }, wg(0.9, 2.2), wg(x1 - x0 - 2.2, x1 - x0 - 0.9)] : [wg(2, 3.4)] });
    kit.wall(x0, z0, x0, z1, 0, H, gingerbread, { t: 0.3, uv: 2, gaps: [wg(2.2, 3.6)] });
    kit.wall(x1, z0, x1, z1, 0, H, gingerbread, { t: 0.3, uv: 2, gaps: [wg(2.2, 3.6)] });
    kit.floor(x0, z0, x1, z1, 0.02, wafer, { uv: 2, collide: false });
    kit.ceiling(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, H, white, { t: 0.15, uv: 2 });
    // roof as two slabs + gable
    const w = x1 - x0 + 1.0, d = z1 - z0 + 1.0;
    for (const s of [-1, 1]) kit.box(w, 0.35, d / 2 / Math.cos(0.5) + 0.2, roofMat, { pos: [mx, H + 0.95, mz + s * d * 0.23], rot: [s * 0.5, 0, 0], uv: 2 });
    for (let i = 0; i < 9; i++) kit.sphere(0.17, gum[i % 7], { pos: [x0 + 0.5 + (i * (x1 - x0 - 1)) / 8, H + 0.35, facing === 's' ? z1 + 0.28 : z0 - 0.28], collide: false, segments: 8 });
    kit.cyl(0.4, 1.2, white, { pos: [mx + 1.5, H + 1.7, mz - 0.5], radiusTop: 0.5, segments: 10 });
    // candy-cane porch posts + icing trim
    const fz = facing === 's' ? z1 + 0.2 : z0 - 0.2;
    kit.box(x1 - x0, 0.18, 0.1, white, { pos: [mx, H - 0.1, fz], collide: false });
    kit.point([mx, H - 0.6, mz], 0xffe4b8, 4, 10);
    return { x0, z0, x1, z1 };
  };
  const houses = [house(-23, -22, -13, -13.5, 's', pink, 'A'), house(13, -22, 23, -13.5, 's', mint, 'B'), house(-5.5, -24, 5.5, -17, 's', lilac, 'C')];
  poster(kit, assets.canvasMaterial('sugar-shop', 512, 128, (g, w, h) => { g.fillStyle = '#ff7aa8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.fillStyle = '#fff'; g.font = '900 64px "Comic Sans MS", Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SUGAR SHOP', w / 2, h / 2 + 4); }, { roughness: 0.5 }), 4.4, 1.1, 0, 4.2, -16.6, 0);
  kit.box(5, 0.12, 1.6, awning, { pos: [0, 2.9, -16.1], rot: [0.35, 0, 0], collide: false });

  // ---- scenery
  const clear = (x, z, r) => houses.every((h) => !(x > h.x0 - r && x < h.x1 + r && z > h.z0 - r && z < h.z1 + r)) && Math.hypot(x, z + 2) > 4.2 + r && !(z > 6.2 - r && z < 11 + r);
  let n = 0, tries = 0;
  while (n < 34 && tries++ < 400) { const x = (R() * 2 - 1) * 22.5, z = (R() * 2 - 1) * 22.5, r = 0.55 + R() * 1.1; if (!clear(x, z, r + 0.6)) continue; gumdrop(x, z, r, gum[n % 7]); n++; }
  const lollySpots = [[-20, 15], [-16, 20], [-11, 14], [-6, 19], [-1, 14.5], [4, 20], [9, 14], [14, 19], [19, 14.5], [21, 21], [-21, 6], [21, 5], [-21, -6], [21, -7]];
  lollySpots.forEach(([x, z], i) => lolly(x, z, 3 + (i % 4) * 0.7, i % 4));
  const canes = [[-24, -10], [-24, 0], [-24, 11], [24, -10], [24, 0], [24, 11], [-12, -24], [12, -24], [-12, 24], [12, 24]];
  canes.forEach(([x, z], i) => caneAt(x * 0.94, z * 0.94, 3.2 + (i % 3) * 0.6, i * 1.3));
  cupcake(-9, -8, 1.5, pink, white); cupcake(9, -9, 1.5, mint, pink); cupcake(-17, 3, 1.3, lilac, lemon); cupcake(17, 2, 1.3, peach, mint); cupcake(-7, 14, 1.2, sky, white); cupcake(10, 22, 1.2, red, cream);
  donut(-8, 2, 1.2, peach); donut(8, 2.5, 1.2, lemon); donut(-19, 20, 1.0, lilac); donut(19, -3, 1.0, pink);
  cone(-12, -3, 1.2, pink); cone(12, -4, 1.2, mint); cone(0, 3, 1.0, lemon); cone(-3, 22, 1.0, lilac);
  peppermint(-14, 8.6, 1.3, 0.5); peppermint(15, 8.6, 1.3, -0.5); peppermint(-23, 20, 1.2, 1.2); peppermint(23, -18, 1.2, -1.2);
  // sugar-cube piles + macarons
  for (const [x, z] of [[-18, -8], [17, -10], [3, 12], [-4, 4]]) for (let i = 0; i < 6; i++) kit.box(0.7, 0.7, 0.7, white, { pos: [x + (i % 3) * 0.72, 0.35 + (i > 2 ? 0.7 : 0), z + (i % 2) * 0.1], rot: [0, R() * 0.4, 0] });
  for (const [x, z, m1, m2] of [[-14, 16, pink, mint], [6, 5, lilac, lemon], [15, 17, peach, sky]]) { for (let k = 0; k < 4; k++) { kit.cyl(0.9, 0.28, k % 2 ? m1 : cream, { pos: [x, 0.14 + k * 0.28, z], segments: 20 }); } kit.cyl(0.9, 0.28, m2, { pos: [x, 1.26, z], segments: 20 }); }
  // light-pole lollipop lamps
  for (const [x, z] of [[-10, 2], [10, 1], [-10, 20], [10, 21], [0, 9]]) { kit.cyl(0.07, 3.6, white, { pos: [x, 1.8, z], segments: 8 }); kit.sphere(0.3, cm('lamp', 0xfff0c8, 0.3, { emissive: 0xffd890, emissiveIntensity: 2 }), { pos: [x, 3.8, z], collide: false, segments: 10 }); kit.point([x, 3.7, z], 0xffe2a8, 3, 12); }
  kit.sun([-0.5, -1, -0.35], 0xfff0e0, 1.7, { area: 36, shadowSize: 4096 });
  kit.hemi(0xffeaf6, 0xd6b4e8, 0.45);

  // ---- models
  await props(kit, [
    ['strawberry_chocolate_cake', -9, 0, 18, 0.3, { fitHeight: 1.1 }], ['strawberry_chocolate_cake', 7, 0, -6, 1.2, { fitHeight: 1.1 }], ['strawberry_chocolate_cake', 18, 0, 8, 0, { fitHeight: 1.1 }], ['strawberry_chocolate_cake', -19, 0, -4, 2, { fitHeight: 1.1 }],
    ['rubber_duck_toy', 1, 0.0, 9, 0, { fitHeight: 1.0 }], ['rubber_duck_toy', -12, 0.0, 9, 2, { fitHeight: 0.8 }],
    ['wooden_crate_01', -20, 0, -17, 0.4], ['wooden_crate_01', 18, 0, -18, 0.8], ['CoffeeCart_01', -2, 0, -15.5, 0.2],
  ]);

  // ---- gameplay
  const hp = [[-10, -4], [-6, 1], [6, 1], [10, -2], [-15, 5], [15, 4], [-20, 14], [-10, 17], [0, 17], [10, 16], [20, 17], [-22, -6], [22, -6], [-3, -10], [4, -10], [-18, -9], [18, -8]];
  hp.forEach(([x, z]) => kit.hider(x, 0.05, z));
  for (let i = 0; i < 5; i++) kit.seeker(-4 + i * 2, 0.05, 23.3);
  for (const h of houses) { roomSpots(kit, h.x0 + 0.5, h.z0 + 0.5, h.x1 - 0.5, h.z1 - 0.5, 4, [0.5, 1.0, 1.6], 3); floorSpots(kit, h.x0 + 1, h.z0 + 1, h.x1 - 1, h.z1 - 1, 3, 0.3, 4); wallSpots(kit, h.x0, h.z0 - 0.3, h.x1, h.z0 - 0.3, 0, -1, 3, [0.5, 1.0, 1.6], { seed: 13 }); wallSpots(kit, h.x0 - 0.3, h.z0, h.x0 - 0.3, h.z1, -1, 0, 2, [0.5, 1.0, 1.6], { seed: 14 }); wallSpots(kit, h.x1 + 0.3, h.z0, h.x1 + 0.3, h.z1, 1, 0, 2, [0.5, 1.0, 1.6], { seed: 15 }); }
  roomSpots(kit, -S + 1.2, -S + 1.2, S - 1.2, S - 1.2, 8, [0.5, 1.0, 1.6, 2.4], 21);
  cornerSpots(kit, -S + 1.2, -S + 1.2, S - 1.2, S - 1.2);
  floorSpots(kit, -22, -12, 22, 22, 22, 0.3, 9);

  return kit.data({
    titleCam: { center: new THREE.Vector3(0, 2, 0), radius: 14, height: 4 },
    environment: {
      exposure: 0.85, envIntensity: 0.3, background: new THREE.Color(0xffd6ea), probe: [0, 3, 0],
      fog: new THREE.FogExp2(0xffd9ec, 0.004),
      bloom: { strength: 0.15, radius: 0.6, threshold: 1.0 }, ao: { aoRadius: 1.2, intensity: 2.0, distanceFalloff: 0.8 },
    },
    seekerWait: { pos: new THREE.Vector3(0, 1.6, 23.3), look: new THREE.Vector3(0, 1.6, 0) },
  });
}
