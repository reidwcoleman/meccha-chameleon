// Hide-and-Seek Mansion: dining hall, kitchen/pantry, study, red-runner corridor, library, grand foyer with
// staircase, portrait gallery, and an upper floor of bedrooms. 48 x 36 m footprint.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, roomSpots, decal, poster, noise } from './gen.js';

const T = 0.3;
const UP = 4.4;      // upper floor level
const TOP = 8.0;     // upper ceiling
const GH = 5.0;      // ground ceiling in the north half

export async function build({ kit, assets, engine }) {
  const R = rng(42);
  const pbr = (id, rep = [0.5, 0.5], o = {}) => assets.pbr(id, { repeat: rep, ...o });

  // ---------------------------------------------------------------- materials
  const marble = assets.canvasMaterial('mansion-checker', 512, 512, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#101012' : '#ece8df'; g.fillRect(x * w / 2, y * h / 2, w / 2, h / 2); }
    const r = rng(9);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${r() > 0.5 ? '90,90,100' : '255,255,255'},${0.05 + r() * 0.09})`; g.lineWidth = 1 + r() * 2.5;
      g.beginPath(); let px = r() * w, py = r() * h; g.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 110; py += (r() - 0.5) * 110; g.lineTo(px, py); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  }, { roughness: 0.14, metalness: 0.02 }, [0.5, 0.5]);

  const wallpaper = assets.canvasMaterial('mansion-wallpaper', 512, 512, (g, w, h) => {
    g.fillStyle = '#62282a'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    g.strokeStyle = 'rgba(200,150,90,0.55)'; g.lineWidth = 3;
    for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
      const cx = gx * w / 2 + w / 4 + (gy % 2) * 0, cy = gy * h / 2 + h / 4;
      for (let s = 0; s < 3; s++) {
        g.beginPath();
        for (let a = 0; a <= 6.4; a += 0.2) { const rad = 20 + s * 18 + Math.sin(a * 3 + s) * 7; const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad * 1.35; a ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); }
    noise(g, w, h, 14, 0.5, 5);
  }, { roughness: 0.8 }, [0.5, 0.5]);

  const greenPaper = assets.canvasMaterial('mansion-green', 256, 256, (g, w, h) => {
    g.fillStyle = '#35523f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(210,225,190,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w / 4 + (i % 2) * w / 2, h / 4 + ((i / 2) | 0) * h / 2, 26, 0, 6.3); g.stroke(); }
    noise(g, w, h, 12, 0.5, 6);
  }, { roughness: 0.85 }, [0.5, 0.5]);

  const runner = assets.canvasMaterial('mansion-runner', 256, 1024, (g, w, h) => {
    g.fillStyle = '#8f1620'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d6a64a'; g.lineWidth = 8; g.strokeRect(14, 0, w - 28, h);
    g.lineWidth = 3; g.strokeRect(30, 0, w - 60, h);
    g.fillStyle = 'rgba(214,166,74,0.5)';
    for (let y = 40; y < h; y += 96) { g.beginPath(); g.moveTo(w / 2, y - 24); g.lineTo(w / 2 + 22, y); g.lineTo(w / 2, y + 24); g.lineTo(w / 2 - 22, y); g.fill(); }
    noise(g, w, h, 20, 0.6, 7);
  }, { roughness: 0.95 });

  const velvet = assets.canvasMaterial('mansion-velvet', 256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? '#6e0b14' : '#a3121f');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { roughness: 0.7 });

  const wood = pbr('dark_paneled_wood', [0.5, 0.5], { color: 0xffffff, emissive: 0x2a160c, emissiveIntensity: 1 });
  const woodFloor = pbr('herringbone_parquet', [0.4, 0.4]);
  const darkWood = pbr('dark_wood', [0.5, 0.5]);
  const kitchenTile = pbr('floor_tiles_06', [0.5, 0.5], { color: 0xbfe3c4 });
  const whiteBrick = pbr('white_bricks', [0.5, 0.5], { color: 0xc8e6cc });
  const carpet = pbr('dirty_carpet', [0.5, 0.5], { color: 0x8a5a4a });
  const ceilMat = assets.mat('mansion-ceiling', { color: 0xe6dccb, roughness: 0.95 });
  const trim = assets.mat('mansion-trim', { color: 0xf1ead9, roughness: 0.4 });
  const gold = assets.mat('mansion-gold', { color: 0xd6a64a, roughness: 0.25, metalness: 0.9 });
  const countertop = assets.mat('mansion-counter', { color: 0xf0f0ec, roughness: 0.2, metalness: 0.0 });
  const cabinet = assets.mat('mansion-cabinet', { color: 0x4b6b57, roughness: 0.5 });
  const rugRed = assets.mat('mansion-rug', { color: 0x7a1820, roughness: 0.95 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a8).multiplyScalar(4) });

  // ---------------------------------------------------------------- shell helpers
  const gap = (a, b, h) => ({ a, b, y1: h });
  /** Wall line with world-coordinate doors on the varying axis. */
  function line(ax, az, bx, bz, y0, y1, mat, doors = [], o = {}) {
    const horiz = Math.abs(bz - az) < 1e-6;
    const base = horiz ? ax : az;
    const gaps = doors.map(([a, b, h]) => ({ a: a - base, b: b - base, y0, y1: y0 + (h ?? 2.4) }));
    kit.wall(ax, az, bx, bz, y0, y1, mat, { t: T, uv: 2, gaps, ...o });
  }
  /** Wainscot + skirting on both faces of a wall line, skipping doors. */
  function wain(ax, az, bx, bz, y0, doors = [], mats = [wood, wood], hgt = 1.05) {
    const horiz = Math.abs(bz - az) < 1e-6;
    const a0 = horiz ? ax : az, a1 = horiz ? bx : bz;
    const cuts = [a0, ...doors.flatMap(([a, b]) => [a, b]), a1].sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i += 2) {
      const s0 = cuts[i], s1 = cuts[i + 1];
      if (s1 - s0 < 0.3) continue;
      for (const [k, side] of [[0, -1], [1, 1]]) {
        const off = side * (T / 2 + 0.02);
        if (horiz) {
          kit.box(s1 - s0, hgt, 0.04, mats[k], { pos: [(s0 + s1) / 2, y0 + hgt / 2, az + off], collide: false, uv: 1 });
          kit.box(s1 - s0, 0.14, 0.07, trim, { pos: [(s0 + s1) / 2, y0 + 0.07, az + off * 1.2], collide: false });
          kit.box(s1 - s0, 0.07, 0.08, trim, { pos: [(s0 + s1) / 2, y0 + hgt + 0.035, az + off * 1.25], collide: false });
        } else {
          kit.box(0.04, hgt, s1 - s0, mats[k], { pos: [ax + off, y0 + hgt / 2, (s0 + s1) / 2], collide: false, uv: 1 });
          kit.box(0.07, 0.14, s1 - s0, trim, { pos: [ax + off * 1.2, y0 + 0.07, (s0 + s1) / 2], collide: false });
          kit.box(0.08, 0.07, s1 - s0, trim, { pos: [ax + off * 1.25, y0 + hgt + 0.035, (s0 + s1) / 2], collide: false });
        }
      }
    }
  }
  /** Door frame trim. */
  function frame(x, z, w, vertical, y0 = 0, h = 2.4) {
    const a = vertical ? { pos: [x, y0 + h + 0.06, z + w / 2], s: [0.4, 0.12, w + 0.2] } : { pos: [x + w / 2, y0 + h + 0.06, z], s: [w + 0.2, 0.12, 0.4] };
    kit.box(a.s[0], a.s[1], a.s[2], trim, { pos: a.pos, collide: false });
    for (const k of [-0.05, w + 0.05]) {
      if (vertical) kit.box(0.4, h, 0.1, trim, { pos: [x, y0 + h / 2, z + k], collide: false });
      else kit.box(0.1, h, 0.4, trim, { pos: [x + k, y0 + h / 2, z], collide: false });
    }
  }

  // door tables (world coords on the varying axis)
  const dZm4 = [[-18, -15.4], [-12, -9.4], [-1.2, 1.2], [9, 11.6], [17, 19.6]];
  const dZ2 = [[-17, -14.4], [-3, 3, 3.2], [14, 16.4]];
  const dX = [[-11, -8.6]];

  // ---------------------------------------------------------------- floors / ceilings
  kit.floor(-24, -18, -6, -4, 0, marble, { uv: 2 });                       // dining
  kit.floor(-6, -18, 6, -4, 0, kitchenTile, { uv: 2 });                    // kitchen
  kit.floor(6, -18, 14, -4, 0, darkWood, { uv: 2 });                       // pantry
  kit.floor(14, -18, 24, -4, 0, woodFloor, { uv: 2 });                     // study
  kit.floor(-24, -4, 24, 2, 0, woodFloor, { uv: 2 });                      // corridor
  kit.floor(-24, 2, -8, 18, 0, woodFloor, { uv: 2 });                      // library
  kit.floor(-8, 2, 8, 18, 0, marble, { uv: 2 });                           // foyer
  kit.floor(8, 2, 24, 18, 0, darkWood, { uv: 2 });                         // gallery
  kit.ceiling(-24, -18, 24, 2, GH, ceilMat, { uv: 2 });
  // upper slab (walkable top + ceiling underside)
  kit.floor(-24, 2, -8, 18, UP, woodFloor, { uv: 2, t: 0.4 });
  kit.floor(8, 2, 24, 18, UP, woodFloor, { uv: 2, t: 0.4 });
  kit.floor(-8, 11.4, 8, 18, UP, woodFloor, { uv: 2, t: 0.4 });
  kit.ceiling(-24, 2, 24, 18, TOP, ceilMat, { uv: 2 });

  // ---------------------------------------------------------------- walls
  line(-24, -18, 24, -18, 0, GH, wallpaper);
  line(-24, -4, 24, -4, 0, GH, wallpaper, dZm4);
  line(-24, 2, 24, 2, 0, TOP, wallpaper, dZ2);
  line(-24, 18, 24, 18, 0, TOP, wallpaper);
  line(-24, -18, -24, 2, 0, GH, wallpaper); line(-24, 2, -24, 18, 0, TOP, wallpaper);
  line(24, -18, 24, 2, 0, GH, wallpaper); line(24, 2, 24, 18, 0, TOP, wallpaper);
  line(-6, -18, -6, -4, 0, GH, greenPaper, dX); line(6, -18, 6, -4, 0, GH, greenPaper, dX); line(14, -18, 14, -4, 0, GH, wallpaper, dX);
  line(-8, 2, -8, 18, 0, UP, wallpaper, [[8, 10.4]]);   line(-8, 2, -8, 18, UP, TOP, wallpaper, [[13, 15.4]]);
  line(8, 2, 8, 18, 0, UP, wallpaper, [[8, 10.4]]);     line(8, 2, 8, 18, UP, TOP, wallpaper, [[13, 15.4]]);
  line(-24, 10, -8, 10, UP, TOP, wallpaper, [[-18, -15.6]]);
  line(8, 10, 24, 10, UP, TOP, wallpaper, [[15.6, 18]]);

  // wainscot
  wain(-24, -4, 24, -4, 0, dZm4); wain(-24, 2, 24, 2, 0, dZ2);
  wain(-24, -18, 24, -18, 0, [], [wood, wood]);
  wain(-6, -18, -6, -4, 0, dX); wain(6, -18, 6, -4, 0, dX); wain(14, -18, 14, -4, 0, dX);
  wain(-24, -18, -24, 18, 0); wain(24, -18, 24, 18, 0);
  wain(-8, 2, -8, 18, 0, [[8, 10.4]]); wain(8, 2, 8, 18, 0, [[8, 10.4]]);
  wain(-24, 18, 24, 18, 0);
  wain(-24, 10, -8, 10, UP, [[-18, -15.6]]); wain(8, 10, 24, 10, UP, [[15.6, 18]]);
  wain(-8, 2, -8, 18, UP, [[13, 15.4]]); wain(8, 2, 8, 18, UP, [[13, 15.4]]);
  // door frames
  for (const [a, b] of dZm4) frame(a, -4, b - a, false);
  for (const [a, b] of dZ2) frame(a, 2, b - a, false);
  for (const z of [-11]) { frame(-6, z, 2.4, true); frame(6, z, 2.4, true); frame(14, z, 2.4, true); }
  frame(-8, 8, 2.4, true); frame(8, 8, 2.4, true); frame(-8, 13, 2.4, true, UP); frame(8, 13, 2.4, true, UP);

  // runner carpet
  decal(kit, runner, 2.2, 46, 0, 0.014, -1, Math.PI / 2);
  decal(kit, rugRed, 8, 5, 0, 0.012, 14, 0);
  decal(kit, assets.mat('mansion-rug2', { color: 0x1d3a52, roughness: 0.95 }), 6, 4, -16, 0.012, 10, 0);

  // ---------------------------------------------------------------- stairs + balcony
  kit.stairs(-5.2, 0, 3, 8.4, UP, 2.4, '+z', woodFloor, { solid: true, uv: 1 });
  const rail = assets.mat('mansion-rail', { color: 0x2a1a12, roughness: 0.4 });
  for (const x of [-6.4, -4.0]) kit.box(0.1, 0.9, 8.4, rail, { pos: [x, 1.8 + 0.3, 7.2], rot: [-Math.atan2(UP, 8.4), 0, 0], collide: false });
  for (let x = -8; x <= 8; x += 0.35) { if (x > -6.5 && x < -3.9) continue; kit.box(0.05, 1.0, 0.05, rail, { pos: [x, UP + 0.5, 11.35], collide: false }); }
  kit.box(5.4, 0.08, 0.1, rail, { pos: [-1.3, UP + 1.0, 11.35], collide: false });
  kit.box(1.5, 0.08, 0.1, rail, { pos: [-7.25, UP + 1.0, 11.35], collide: false });
  kit.box(0.1, 0.08, 0.1, rail, { pos: [4, UP + 1.0, 11.35], collide: false });
  kit.box(3.9, 0.08, 0.1, rail, { pos: [6.05, UP + 1.0, 11.35], collide: false });

  // red curtains in the gallery + foyer
  for (let z = 4; z <= 16; z += 4) {
    kit.box(0.12, 3.4, 1.2, velvet, { pos: [23.5, 2.1, z], collide: false });
    kit.box(0.12, 3.4, 1.2, velvet, { pos: [23.5, 2.1, z + 1.3], collide: false });
    kit.box(0.14, 0.14, 2.7, gold, { pos: [23.5, 3.95, z + 0.65], collide: false });
  }

  // search-start poster wall (corridor)
  const posterMat = assets.canvasMaterial('mansion-search-poster', 512, 256, (g, w, h) => {
    g.fillStyle = '#f2e7c8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6b1b1b'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#6b1b1b'; g.textAlign = 'center'; g.font = '800 64px "M PLUS Rounded 1c", serif'; g.fillText('SEARCH', w / 2, 100);
    g.fillText('START!', w / 2, 180);
  }, { roughness: 0.7 });
  poster(kit, posterMat, 3.4, 1.7, 21, 2.4, -3.82, 0);

  // ---------------------------------------------------------------- lights
  const lamp = (x, y, z, c = 0xffd9a0, i = 12, d = 13, o) => { kit.point([x, y, z], c, i, d, o); kit.bulb([x, y, z], c, 0.07, 5); };
  lamp(-15, 3.9, -11, 0xffddaa, 40, 24, { shadow: true, shadowSize: 1024 });
  lamp(-20.5, 3.8, -9, 0xffd7a0, 14, 14); lamp(-9.5, 3.8, -13, 0xffd7a0, 14, 14);
  lamp(0, 3.6, -11, 0xe9ffe0, 18, 16);
  lamp(10, 3.4, -11, 0xffe0a8, 10, 11);
  lamp(19, 3.6, -11, 0xffcf95, 14, 14);
  for (const x of [-20, -12, -4, 4, 12, 20]) lamp(x, 3.8, -1, 0xffcf8d, 14, 12);
  lamp(-16, 3.6, 10, 0xffc989, 16, 16);
  lamp(0, 7.2, 9, 0xfff0d8, 42, 26, { shadow: true, shadowSize: 1024 });
  lamp(0, 3.6, 4, 0xffe3b4, 10, 10);
  lamp(16, 3.6, 7, 0xffd09a, 14, 15); lamp(16, 3.6, 14, 0xffd09a, 14, 15);
  lamp(-16, UP + 3.2, 6, 0xffd7a8, 12, 14); lamp(-16, UP + 3.2, 14, 0xffd7a8, 12, 14);
  lamp(16, UP + 3.2, 6, 0xffd7a8, 12, 14); lamp(16, UP + 3.2, 14, 0xffd7a8, 12, 14);
  lamp(0, UP + 3.4, 15, 0xffe3b4, 12, 14);
  kit.hemi(0xffead0, 0x3a2a1c, 0.5);

  // ---------------------------------------------------------------- props
  const bookMat = assets.canvasMaterial('mansion-books', 256, 256, (g, w, h) => {
    g.fillStyle = '#1c130e'; g.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let row = 0; row < 4; row++) { let x = 4; while (x < w - 6) { const bw = 6 + r() * 10; const hh = 50 + r() * 12; g.fillStyle = `hsl(${(r() * 360) | 0},${35 + r() * 30}%,${25 + r() * 25}%)`; g.fillRect(x, row * 64 + 62 - hh, bw, hh); x += bw + 1; } g.fillStyle = '#3a2517'; g.fillRect(0, row * 64 + 62, w, 4); }
  }, { roughness: 0.8 }, [0.5, 0.5]);
  const shelf = (x, z, len, nx, nz, y = 0) => {
    const along = nx ? [0, 1] : [1, 0];
    const w = nx ? 0.5 : len, d = nx ? len : 0.5;
    kit.box(w, 3.2, d, bookMat, { pos: [x, y + 1.6, z], uv: 1 });
  };
  // library
  shelf(-23.6, 10, 12, 1, 0); shelf(-16, 17.6, 12, 0, -1);
  // kitchen counters
  kit.box(10.4, 0.9, 0.9, cabinet, { pos: [0, 0.45, -17.4] }); kit.box(10.6, 0.06, 1.0, countertop, { pos: [0, 0.93, -17.4], collide: false });
  kit.box(3.6, 0.9, 1.6, cabinet, { pos: [0, 0.45, -10.6] }); kit.box(3.8, 0.06, 1.8, countertop, { pos: [0, 0.93, -10.6], collide: false });
  kit.box(0.9, 0.9, 5, cabinet, { pos: [-5.4, 0.45, -14] }); kit.box(1.0, 0.06, 5.2, countertop, { pos: [-5.4, 0.93, -14], collide: false });
  // pantry shelving
  for (const z of [-16.8, -12.6, -7.0]) kit.box(7.6, 2.0, 0.6, assets.mat('mansion-pantry', { color: 0x5a3b24, roughness: 0.7 }), { pos: [10, 1.0, z] });
  // study table / billiard-like block
  kit.box(5, 0.9, 2.6, assets.mat('mansion-felt', { color: 0x1c5a34, roughness: 0.95 }), { pos: [19, 0.45, -11.4] });
  kit.box(5.4, 0.12, 3.0, darkWood, { pos: [19, 0.93, -11.4], collide: false });
  // dining table
  kit.box(9, 0.12, 1.9, darkWood, { pos: [-15, 0.8, -11], uv: 1 });
  for (const [dx, dz] of [[-4, -0.7], [4, -0.7], [-4, 0.7], [4, 0.7]]) kit.box(0.2, 0.74, 0.2, darkWood, { pos: [-15 + dx, 0.37, -11 + dz] });
  kit.box(8.4, 0.01, 1.5, assets.mat('mansion-cloth', { color: 0xf3ecdc, roughness: 0.9 }), { pos: [-15, 0.87, -11], collide: false });

  const L = [];
  for (let i = 0; i < 5; i++) {
    const x = -18.5 + i * 2.0;
    L.push(['dining_chair_02', x, 0, -12.6, Math.PI], ['dining_chair_02', x, 0, -9.4, 0]);
  }
  L.push(['dining_chair_02', -20, 0, -11, -Math.PI / 2], ['dining_chair_02', -10, 0, -11, Math.PI / 2]);
  L.push(['Chandelier_01', -17.5, 2.9, -11, 0, { collide: false }], ['Chandelier_02', -12.5, 2.9, -11, 0, { collide: false }]);
  L.push(['vintage_grandfather_clock_01', -23.2, 0, -6.5, Math.PI / 2], ['horse_statue_01', -22.6, 0, -16.6, 0.8, { fitHeight: 1.4 }]);
  L.push(['ClassicConsole_01', -9, 0, -17.3, 0], ['ceramic_vase_01', -9, 0.82, -17.3, 0, { collide: false }], ['antique_ceramic_vase_01', -21, 0, -17, 0, { fitHeight: 1.2 }]);
  L.push(['fancy_picture_frame_01', -15, 2.6, -17.8, 0, { collide: false }], ['fancy_picture_frame_02', -20, 2.6, -17.8, 0, { collide: false }], ['hanging_picture_frame_02', -10, 2.7, -17.8, 0, { collide: false }]);
  // corridor
  L.push(['ClassicConsole_01', -21, 0, 1.7, Math.PI], ['ClassicConsole_01', 12, 0, 1.7, Math.PI], ['marble_bust_01', -21, 0.85, 1.7, 0, { collide: false, fitHeight: 0.6 }],
    ['ornate_mirror_01', -21, 1.9, 1.78, Math.PI, { collide: false, fitHeight: 1.8 }], ['ornate_mirror_01', 12, 1.9, 1.78, Math.PI, { collide: false, fitHeight: 1.8 }],
    ['ceramic_vase_03', 12, 0.82, 1.7, 0, { collide: false }], ['mantel_clock_01', -12, 0.85, -3.6, 0, { collide: false }], ['ClassicConsole_01', -12, 0, -3.65, 0],
    ['fancy_picture_frame_01', -2, 2.4, 1.85, Math.PI, { collide: false }], ['wall_clock', 6, 2.8, 1.85, Math.PI, { collide: false }],
    ['Sofa_01', 22.5, 0, -1, -Math.PI / 2, { fitHeight: 0.9 }]);
  // kitchen / pantry
  L.push(['drawer_cabinet', -5.6, 0, -6.2, Math.PI / 2], ['cardboard_box_01', 4.5, 0, -16.8, 0.3], ['cardboard_box_01', 3.4, 0, -16.9, -0.2], ['trashbag', 5.2, 0, -5.4, 0], ['multi_cleaner_5_litre', 1.4, 0.95, -17.4, 0, { collide: false }],
    ['strawberry_chocolate_cake', 0, 0.94, -10.6, 0, { collide: false }], ['wooden_crate_01', 9.4, 0, -5.1, 0.2], ['wooden_crate_01', 12.6, 0, -5.4, 0.9], ['wooden_crate_01', 8.2, 0, -14.6, 0], ['cardboard_box_01', 12.8, 0, -14, 1.2],
    ['industrial_pastic_container', 7.0, 0, -9.4, 0], ['plastic_crate_02', 13, 0, -9.6, 0.4], ['korean_fire_extinguisher_01', 13.7, 0, -4.5, 0, { collide: false }]);
  // study
  L.push(['Television_01', 23.4, 0.0, -8, -Math.PI / 2, { collide: 'box' }], ['sofa_03', 17.5, 0, -16.2, Math.PI], ['GothicCabinet_01', 15, 0, -17.4, 0], ['ArmChair_01', 22, 0, -14.5, -2.3], ['round_wooden_table_01', 22.3, 0, -5.4, 0],
    ['book_encyclopedia_set_01', 22.3, 0.78, -5.4, 0, { collide: false }], ['potted_plant_04', 15, 0, -5, 0, { fitHeight: 1.5 }], ['Rockingchair_01', 15.8, 0, -8.4, 1.0]);
  // library
  L.push(['Sofa_01', -19, 0, 6, 0], ['sofa_02', -12, 0, 6, Math.PI], ['CoffeeTable_01', -15.5, 0, 6.6, 0], ['ArmChair_01', -21.5, 0, 12.5, -0.6], ['Rockingchair_01', -10.5, 0, 14, 2.3],
    ['side_table_tall_01', -22.5, 0, 6, 0], ['ceramic_vase_03', -22.5, 1.0, 6, 0, { collide: false }], ['Ottoman_01', -16, 0, 13.4, 0.2], ['vintage_grandfather_clock_01', -9, 0, 3.2, 0], ['marble_bust_01', -23, 0, 3.4, 0.5, { fitHeight: 1.7 }],
    ['potted_plant_04', -9, 0, 17, 0, { fitHeight: 1.6 }], ['Chandelier_02', -16, 2.9, 10, 0, { collide: false }]);
  // foyer
  L.push(['Chandelier_01', 0, 6.0, 8, 0, { collide: false, scale: 1.4 }], ['Chandelier_02', 0, 6.4, 15, 0, { collide: false, scale: 1.2 }], ['ClassicConsole_01', 6.6, 0, 5.5, -Math.PI / 2], ['ornate_mirror_01', 7.7, 1.9, 5.5, -Math.PI / 2, { collide: false, fitHeight: 2.2 }],
    ['horse_statue_01', 5.2, 0, 16.4, 3.6, { fitHeight: 1.6 }], ['marble_bust_01', -6.8, 0, 16.6, 0.2, { fitHeight: 1.7 }], ['potted_plant_04', 7, 0, 3.4, 0, { fitHeight: 1.8 }], ['vintage_grandfather_clock_01', 7.4, 0, 12, -Math.PI / 2]);
  // gallery
  L.push(['marble_bust_01', 13, 0, 3.4, 0, { fitHeight: 1.7 }], ['marble_bust_01', 19, 0, 16.6, 3.1, { fitHeight: 1.7 }], ['Sofa_01', 17, 0, 10, Math.PI / 2], ['CoffeeTable_01', 14, 0, 10, 0], ['ArmChair_01', 21, 0, 4, 2.4],
    ['antique_ceramic_vase_01', 9.4, 0, 17, 0, { fitHeight: 1.1 }], ['antique_ceramic_vase_01', 23, 0, 3.2, 0, { fitHeight: 1.1 }], ['Chandelier_02', 16, 2.9, 10, 0, { collide: false }]);
  for (let i = 0; i < 6; i++) {
    const z = 3.5 + i * 2.5;
    L.push([i % 2 ? 'fancy_picture_frame_01' : 'fancy_picture_frame_02', 8.2, 2.3, z, Math.PI / 2, { collide: false }]);
  }
  for (let i = 0; i < 4; i++) L.push(['hanging_picture_frame_02', 11 + i * 3.4, 2.6, 17.78, Math.PI, { collide: false }]);
  // upper floor
  L.push(['GothicBed_01', -20.5, UP, 5.5, Math.PI / 2], ['GothicCommode_01', -9.5, UP, 4, -Math.PI / 2], ['ClassicNightstand_01', -22.8, UP, 8.4, Math.PI / 2], ['ClassicNightstand_01', -22.8, UP, 2.8, Math.PI / 2],
    ['GothicCabinet_01', -17, UP, 2.7, 0], ['Sofa_01', -17, UP, 17.0, Math.PI], ['CoffeeTable_01', -15.5, UP, 14.4, 0], ['ArmChair_01', -22, UP, 12.2, -0.8], ['Ottoman_01', -12, UP, 12, 0.4], ['potted_plant_04', -9, UP, 17, 0, { fitHeight: 1.5 }],
    ['GothicBed_01', 20.5, UP, 5.5, -Math.PI / 2], ['GothicCommode_01', 9.5, UP, 4, Math.PI / 2], ['ClassicNightstand_01', 22.8, UP, 8.4, -Math.PI / 2], ['GothicCabinet_01', 17, UP, 2.7, 0],
    ['cardboard_box_01', 21, UP, 17, 0.4], ['wooden_crate_01', 22.4, UP, 15.8, 0.1], ['wooden_crate_01', 12, UP, 16.9, 0.7], ['trashbag', 10, UP, 11.4, 0], ['Sofa_01', 16, UP, 11.4, 0], ['WoodenChair_01', 13, UP, 15.8, 0.6],
    ['marble_bust_01', 1.2, UP, 17.3, 3.1, { fitHeight: 1.7 }], ['ornate_mirror_01', -7.7, UP + 1.9, 15, Math.PI / 2, { collide: false, fitHeight: 2.0 }], ['ClassicConsole_01', -7.65, UP, 17.0, Math.PI / 2],
    ['Chandelier_02', -16, UP + 3.0, 14, 0, { collide: false }], ['Chandelier_02', 16, UP + 3.0, 14, 0, { collide: false }]);
  await props(kit, L);

  // ---------------------------------------------------------------- gameplay data
  const sp = (x, z, y = 0.05) => kit.hider(x, y, z);
  // hiders start across the dining hall, corridor and kitchen
  for (let i = 0; i < 6; i++) sp(-22 + i * 1.6, -6.5 - (i % 2) * 1.2);
  for (let i = 0; i < 5; i++) sp(-10 + i * 5, -1 + (i % 2) * 1.6 - 0.6);
  for (let i = 0; i < 4; i++) sp(-3 + i * 2, -14 + (i % 2) * 2);
  sp(18, -7); sp(20, -13); sp(-14, 8); sp(2, 5);
  for (const x of [-5, -3, -1, 1, 3, 5]) kit.seeker(x, 0.05, 16.4);
  // spots: rooms + furniture-height detail
  roomSpots(kit, -23.7, -17.7, -6.3, -4.3, 5, [0.55, 1.1, 1.7], 1);
  roomSpots(kit, -5.7, -17.7, 5.7, -4.3, 4, [0.55, 1.1, 1.7], 2);
  roomSpots(kit, 6.3, -17.7, 13.7, -4.3, 3, [0.55, 1.1, 1.7], 3);
  roomSpots(kit, 14.3, -17.7, 23.7, -4.3, 4, [0.55, 1.1, 1.7], 4);
  roomSpots(kit, -23.7, -3.7, 23.7, 1.7, 10, [0.55, 1.1, 1.7], 5);
  roomSpots(kit, -23.7, 2.3, -8.3, 17.7, 5, [0.55, 1.1, 1.7], 6);
  roomSpots(kit, -7.7, 2.3, 7.7, 17.7, 5, [0.55, 1.1, 1.7, 2.4], 7);
  roomSpots(kit, 8.3, 2.3, 23.7, 17.7, 5, [0.55, 1.1, 1.7], 8);
  roomSpots(kit, -23.7, 2.3 + UP * 0, -8.3, 9.7, 0, [0.5], 9);
  for (const [x0, z0, x1, z1] of [[-23.7, 2.3, -8.3, 9.7], [-23.7, 10.3, -8.3, 17.7], [8.3, 2.3, 23.7, 9.7], [8.3, 10.3, 23.7, 17.7]]) {
    wallSpots(kit, x0, z0, x1, z0, 0, 1, 3, [UP + 0.55, UP + 1.1, UP + 1.6], { seed: 12 });
    wallSpots(kit, x0, z1, x1, z1, 0, -1, 3, [UP + 0.55, UP + 1.1, UP + 1.6], { seed: 13 });
    wallSpots(kit, x0, z0, x0, z1, 1, 0, 3, [UP + 0.55, UP + 1.1, UP + 1.6], { seed: 14 });
    wallSpots(kit, x1, z0, x1, z1, -1, 0, 3, [UP + 0.55, UP + 1.1, UP + 1.6], { seed: 15 });
  }
  floorSpots(kit, -23, -17, 23, -5, 16, 0.3, 21);
  floorSpots(kit, -23, 3, 23, 17, 12, 0.3, 22);
  cornerSpots(kit, -23.7, -17.7, 23.7, 17.7);

  return kit.data({
    titleCam: { center: new THREE.Vector3(-5, 1.8, 6), radius: 5.5, height: 3.4 },
    environment: {
      exposure: 1.0, envIntensity: 0.55, background: new THREE.Color(0x070605), probe: [0, 2.2, 0],
      bloom: { strength: 0.34, radius: 0.6, threshold: 0.9 }, ao: { aoRadius: 1.1, intensity: 2.6, distanceFalloff: 0.7 },
    },
    seekerWait: { pos: new THREE.Vector3(0, 1.6, 16.4), look: new THREE.Vector3(0, 1.6, 8) },
  });
}
