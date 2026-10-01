// Indoor Country: a whole wild-west town built under one giant roof. Sand street, eight wooden buildings with
// porches, wagons, barrels, a well and a water tower, lit by hanging lanterns.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, roomSpots, decal, poster, noise } from './gen.js';

const X = 24, Z = 21, HR = 9.5, BH = 4.4, T = 0.25;

export async function build({ kit, assets }) {
  const R = rng(5150);
  const sand = assets.pbr('coast_sand_03', { repeat: [0.3, 0.3], color: 0xe0c590 });
  const plank = (c) => assets.pbr('brown_planks_09', { repeat: [0.4, 0.4], color: c });
  const painted = (c) => assets.pbr('distressed_painted_planks', { repeat: [0.4, 0.4], color: c });
  const woodFloor = assets.pbr('wood_floor', { repeat: [0.5, 0.5], color: 0xc8a070 });
  const darkWood = assets.pbr('dark_wood', { repeat: [1, 1] });
  const hallWall = assets.pbr('rustic_stone_wall', { repeat: [0.25, 0.25], color: 0x9a8a70 });
  const roofMat = assets.pbr('corrugated_iron_03', { repeat: [0.4, 0.4], color: 0x8a6a50 });
  const trimWood = assets.mat('country-trim', { color: 0x4a2f1c, roughness: 0.8 });
  const canvasWhite = assets.mat('country-canvas', { color: 0xe6dcc0, roughness: 0.95 });
  const iron = assets.mat('country-iron', { color: 0x3a3a3c, roughness: 0.6, metalness: 0.5 });

  const sky = assets.canvasTexture('country-sky', 1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5b9fe0'); gr.addColorStop(1, '#cfe6f7'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h; g.fillStyle = 'rgba(255,255,255,0.8)'; for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(x + k * 22 - 60, y + (r() - 0.5) * 12, 34 + r() * 24, 14 + r() * 8, 0, 0, 6.3); g.fill(); } }
  }, [1, 1]);
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, color: 0xffffff });

  // ---- hall shell
  kit.floor(-X, -Z, X, Z, 0, sand, { uv: 3 });
  kit.ceiling(-X, -Z, X, Z, HR, skyMat, { uv: 12 });
  for (const [ax, az, bx, bz] of [[-X, -Z, X, -Z], [-X, Z, X, Z], [-X, -Z, -X, Z], [X, -Z, X, Z]]) kit.wall(ax, az, bx, bz, 0, HR, hallWall, { t: 0.5, uv: 3 });
  for (let x = -X + 4; x < X; x += 6) kit.box(0.5, 0.6, 2 * Z, trimWood, { pos: [x, HR - 0.5, 0], collide: false, uv: 1 });
  for (const z of [-14, 0, 14]) kit.box(2 * X, 0.5, 0.5, trimWood, { pos: [0, HR - 0.9, z], collide: false });
  for (const [x, z] of [[-X + 1, -Z + 1], [X - 1, -Z + 1], [-X + 1, Z - 1], [X - 1, Z - 1]]) kit.box(1.2, HR, 1.2, hallWall, { pos: [x, HR / 2, z], uv: 3 });

  // ---- buildings
  const signMat = (key, text, bg, fg) => assets.canvasMaterial(key, 512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg; g.font = '900 74px "Rye", "Georgia", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4);
  }, { roughness: 0.7 });
  const lights = [];
  const B = [];
  function bld(x0, z0, x1, z1, front, name, tint, signBg, signFg) {
    const wm = painted(tint);
    const fl = front; // 's' door on +z side, 'n' door on -z side
    const dx = (x0 + x1) / 2 - 1.0;
    const wGap = (a, b) => ({ a, b, y0: 1.0, y1: 2.2 });
    const doorGap = { a: dx - x0, b: dx - x0 + 2.0, y0: 0, y1: 2.5 };
    const winF = [wGap(1.2, 3.0), wGap(x1 - x0 - 3.0, x1 - x0 - 1.2)].filter((g) => g.b < dx - x0 - 0.2 || g.a > dx - x0 + 2.2);
    const south = z1, north = z0;
    kit.wall(x0, north, x1, north, 0, BH, wm, { t: T, uv: 2, gaps: fl === 'n' ? [doorGap, ...winF] : [wGap(2, 3.8), wGap(x1 - x0 - 3.8, x1 - x0 - 2)] });
    kit.wall(x0, south, x1, south, 0, BH, wm, { t: T, uv: 2, gaps: fl === 's' ? [doorGap, ...winF] : [wGap(2, 3.8), wGap(x1 - x0 - 3.8, x1 - x0 - 2)] });
    kit.wall(x0, north, x0, south, 0, BH, wm, { t: T, uv: 2, gaps: [{ a: 3, b: 4.6, y0: 1.0, y1: 2.2 }] });
    kit.wall(x1, north, x1, south, 0, BH, wm, { t: T, uv: 2, gaps: [{ a: 3, b: 4.6, y0: 1.0, y1: 2.2 }] });
    kit.floor(x0, north, x1, south, 0, woodFloor, { uv: 2 });
    kit.ceiling(x0, north, x1, south, BH, plank(0x9a7a56), { uv: 2 });
    // roof + false front
    kit.box(x1 - x0 + 0.8, 0.25, south - north + 0.8, roofMat, { pos: [(x0 + x1) / 2, BH + 0.12, (north + south) / 2], uv: 2 });
    const fz = fl === 's' ? south + 0.05 : north - 0.05;
    kit.box(x1 - x0 + 0.5, 1.5, 0.22, wm, { pos: [(x0 + x1) / 2, BH + 0.9, fz], uv: 2 });
    poster(kit, signMat('country-sign-' + name, name, signBg, signFg), 5.2, 1.3, (x0 + x1) / 2, BH + 0.95, fz + (fl === 's' ? 0.12 : -0.12), fl === 's' ? 0 : Math.PI);
    // porch boards + posts + awning
    const pz = fl === 's' ? south + 1.6 : north - 1.6;
    kit.box(x1 - x0, 0.05, 3.0, plank(0x8a6a48), { pos: [(x0 + x1) / 2, 0.03, pz], collide: false, uv: 1 });
    kit.box(x1 - x0, 0.18, 3.0, plank(0x6a4a30), { pos: [(x0 + x1) / 2, BH - 0.7, pz], collide: false, uv: 1, cast: true });
    for (const px of [x0 + 0.3, x1 - 0.3]) kit.box(0.2, BH - 0.7, 0.2, trimWood, { pos: [px, (BH - 0.7) / 2, pz + (fl === 's' ? 1.3 : -1.3)] });
    // interior light
    lights.push([(x0 + x1) / 2, BH - 0.6, (north + south) / 2]);
    B.push({ x0, z0: north, x1, z1: south, fl });
  }
  bld(-23, -20, -12, -11, 's', 'SALOON', 0xb0553a, '#3a1a10', '#f3c15a');
  bld(-10, -20, 0, -11, 's', 'SHERIFF', 0x7a8a5a, '#2a2a20', '#e8e0c0');
  bld(2, -20, 12, -11, 's', 'GENERAL STORE', 0x5a7a9a, '#1d2a3a', '#f0e6c8');
  bld(14, -20, 23, -11, 's', 'BANK', 0xd0b080, '#3a2c14', '#f6d37a');
  bld(-23, 11, -13, 20, 'n', 'HOTEL', 0x8a5a7a, '#2e1830', '#f1d8ee');
  bld(-11, 11, -1, 20, 'n', 'BARBER', 0xa08a5a, '#22201a', '#f2ecd8');
  bld(1, 11, 11, 20, 'n', 'STABLES', 0x8a6040, '#2c1a10', '#e8c890');
  bld(13, 11, 23, 20, 'n', 'UNDERTAKER', 0x5a5a62, '#18181c', '#d8d8e8');

  // ---- street dressing
  // well
  kit.cyl(1.1, 0.9, hallWall, { pos: [0, 0.45, 0], uv: 1 }); kit.cyl(0.8, 0.02, assets.mat('country-water', { color: 0x1a3a5a, roughness: 0.05 }), { pos: [0, 0.85, 0], collide: false });
  for (const s of [-1, 1]) kit.box(0.15, 2.4, 0.15, trimWood, { pos: [s * 1.0, 1.7, 0] });
  kit.box(2.4, 0.15, 0.15, trimWood, { pos: [0, 2.8, 0] }); kit.box(2.6, 0.12, 1.6, roofMat, { pos: [0, 3.0, 0], collide: false, rot: [0, 0, 0] });
  // water tower
  kit.cyl(1.7, 2.4, plank(0x8a6a48), { pos: [-19, 6.2, 0], uv: 1, collide: false });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) kit.box(0.22, 5, 0.22, trimWood, { pos: [-19 + sx * 1.3, 2.5, sz * 1.3] });
  kit.cyl(1.9, 0.3, iron, { pos: [-19, 7.55, 0], radiusTop: 0.2, collide: false });
  kit.box(5, 0.2, 5, trimWood, { pos: [-19, 0.1, 0], collide: false });
  // wagons
  const wagon = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; kit.root.add(g);
    const add = (w, h, d, m, p, o = {}) => kit.box(w, h, d, m, { pos: [p[0], p[1], p[2]], parent: g, merge: false, ...o });
    add(3.2, 0.9, 1.5, plank(0x7a5a3a), [0, 0.95, 0], { uv: 1 });
    for (const sx of [-1.1, 1.1]) for (const sz of [-0.85, 0.85]) { const w = kit.cyl(0.55, 0.12, trimWood, { pos: [sx, 0.55, sz], parent: g, merge: false }); w.rotation.x = Math.PI / 2; }
    for (let i = -1; i <= 1; i++) { const rib = kit.mesh(new THREE.TorusGeometry(0.85, 0.04, 6, 14, Math.PI), trimWood, { pos: [i * 0.9, 1.4, 0], parent: g, collide: false, merge: false }); rib.rotation.y = Math.PI / 2; }
    const cv = kit.mesh(new THREE.CylinderGeometry(0.85, 0.85, 3.0, 14, 1, true, 0, Math.PI), canvasWhite, { pos: [0, 1.4, 0], parent: g, collide: false, merge: false }); cv.rotation.z = Math.PI / 2; cv.material.side = THREE.DoubleSide;
    kit.collider(3.2, 1.8, 1.5, [x, 0.9, z], ry);
  };
  wagon(-8, 3.5, 0.2); wagon(9, -4.5, -0.4); wagon(19, 5.5, 1.1);
  // hay
  const hay = assets.mat('country-hay', { color: 0xd8b858, roughness: 1 });
  for (const [x, z] of [[-21, 8], [-20.5, 9.2], [-21.5, 9.8], [21, -7], [22, -7.8]]) kit.box(1.3, 0.9, 0.9, hay, { pos: [x, 0.45, z], rot: [0, R() * 3, 0] });
  // cacti
  const cactus = assets.mat('country-cactus', { color: 0x3f7a3a, roughness: 0.7 });
  for (const [x, z, s] of [[-14, 6, 1.2], [16, 8, 1.5], [5, -7, 1.0], [-5, -8, 1.3], [22, 0, 1.1]]) {
    kit.cyl(0.25 * s, 2.0 * s, cactus, { pos: [x, s, z], radiusTop: 0.22 * s });
    const a = kit.cyl(0.14 * s, 0.9 * s, cactus, { pos: [x + 0.4 * s, 1.5 * s, z], collide: false }); a.rotation.z = -0.5;
    const b = kit.cyl(0.14 * s, 0.8 * s, cactus, { pos: [x - 0.4 * s, 1.2 * s, z], collide: false }); b.rotation.z = 0.5;
  }
  // street lamps + hitching posts
  const lamp = (x, z) => { kit.cyl(0.07, 3.4, iron, { pos: [x, 1.7, z] }); kit.cyl(0.16, 0.3, assets.mat('country-lamp', { color: 0xffd08a, emissive: 0xffa040, emissiveIntensity: 2.2 }), { pos: [x, 3.5, z], collide: false }); kit.point([x, 3.5, z], 0xffc070, 20, 16); };
  for (const [x, z] of [[-14, -9.5], [-4, 9.5], [7, -9.5], [15, 9.5], [-20, 4], [20, -4]]) lamp(x, z);
  for (const [x, z] of [[-17, -9], [-5, -9], [7, -9], [18, -9], [-18, 9], [-6, 9], [6, 9], [18, 9]]) kit.box(2.2, 0.12, 0.12, trimWood, { pos: [x, 1.0, z] }), kit.box(0.14, 1.0, 0.14, trimWood, { pos: [x - 1.0, 0.5, z], collide: false }), kit.box(0.14, 1.0, 0.14, trimWood, { pos: [x + 1.0, 0.5, z], collide: false });

  // lights
  for (const [x, y, z] of lights) kit.point([x, y, z], 0xffd9a0, 11, 11);
  kit.point([0, 8.6, 0], 0xfff0d8, 70, 34, { shadow: true, shadowSize: 1024 });
  kit.point([-14, 8.6, 0], 0xfff0d8, 40, 24); kit.point([14, 8.6, 0], 0xfff0d8, 40, 24);
  kit.hemi(0xeaf2ff, 0xb89a68, 1.2);

  // ---- props
  const L = [];
  const crateRow = (xs, z, ry = 0) => xs.forEach((x, i) => L.push([i % 2 ? 'wooden_crate_01' : 'old_military_crate', x, 0, z, ry + i * 0.2]));
  // saloon
  L.push(['wooden_picnic_table', -20, 0, -15, 0], ['WoodenChair_01', -21, 0, -13, 0.4], ['WoodenChair_01', -18, 0, -13.6, -0.5], ['WoodenTable_01', -15, 0, -14, 0], ['WoodenChair_01', -15, 0, -12.5, 3.1], ['wine_barrel_01', -22.2, 0, -19, 0], ['wine_barrel_01', -22.2, 0, -17.8, 0], ['Shelf_01', -17.5, 0, -19.5, 0], ['Barrel_02', -13, 0, -19, 0]);
  kit.box(5.5, 1.1, 0.8, plank(0x6a4a30), { pos: [-16.5, 0.55, -17], uv: 1 });
  // sheriff
  L.push(['WoodenTable_03', -5, 0, -16, 0], ['WoodenChair_01', -5, 0, -14.4, 3.1], ['painted_wooden_cabinet_02', -9, 0, -17, 1.57], ['treasure_chest', -1.4, 0, -19, -0.3], ['Shelf_01', -3, 0, -19.4, 0]);
  for (const x of [-9.4, -9.4]) { /* cell bars */ }
  for (let i = 0; i < 7; i++) kit.box(0.05, 2.4, 0.05, iron, { pos: [-9.5 + 0 + 0, 1.2, -19.2 + i * 0.5], collide: true });
  // store
  L.push(['Shelf_01', 3.5, 0, -19.5, 0], ['Shelf_01', 6, 0, -19.5, 0], ['Shelf_01', 8.5, 0, -19.5, 0], ['Barrel_01', 11, 0, -19, 0], ['Barrel_02', 11, 0, -17.8, 0], ['barrel_03', 10.4, 0, -12.2, 0], ['wooden_crate_01', 3, 0, -12, 0.2], ['wooden_crate_01', 3.2, 0.9, -12, 0.1], ['CoffeeCart_01', 7.5, 0, -15, 0.5], ['WoodenTable_01', 5, 0, -15.6, 0]);
  // bank
  L.push(['treasure_chest', 22, 0, -19, -0.4], ['treasure_chest', 21, 0, -19.2, 0.2], ['WoodenTable_03', 18, 0, -16, 0], ['WoodenChair_01', 18, 0, -14.3, 3.1], ['painted_wooden_cabinet_02', 14.8, 0, -16, 1.57], ['Lantern_01', 18, 0.78, -16, 0, { collide: false }]);
  // hotel
  L.push(['vintage_day_bed', -20, 0, 14, 0], ['vintage_day_bed', -16, 0, 14, 0], ['ClassicNightstand_01', -18, 0, 13.4, 0], ['GothicCommode_01', -22.5, 0, 17, 1.57], ['Rockingchair_01', -15, 0, 18, 3.4], ['Sofa_01', -20, 0, 19.2, 3.14]);
  // barber
  L.push(['BarberShopChair_01', -8, 0, 15, 0.5], ['BarberShopChair_01', -5, 0, 15, -0.5], ['Shelf_01', -10.5, 0, 17, 1.57], ['WoodenChair_01', -3, 0, 18, 3.4], ['ornate_mirror_01', -6.5, 1.8, 19.78, 3.14, { collide: false, fitHeight: 1.6 }]);
  // stables
  L.push(['horse_statue_01', 4, 0, 17, 0.4, { fitHeight: 1.7 }], ['horse_statue_01', 7.5, 0, 17.5, -0.4, { fitHeight: 1.7 }], ['wooden_crate_01', 10.2, 0, 12, 0.2], ['barrel_03', 10.4, 0, 14, 0], ['Barrel_01', 1.8, 0, 12, 0]);
  // undertaker
  L.push(['painted_wooden_cabinet_02', 14, 0, 14, 0.2], ['WoodenTable_03', 18, 0, 16, 0], ['WoodenChair_01', 20, 0, 14, 0.4], ['standing_chalkboard_01', 21.5, 0, 12.5, 0.3], ['Rockingchair_01', 16, 0, 12.8, 0.1]);
  // street
  L.push(['Barrel_01', -12, 0, -9, 0], ['Barrel_02', -11, 0, -9.2, 0], ['wine_barrel_01', 1, 0, -8.5, 0], ['wooden_crate_01', 14, 0, -8.8, 0.4], ['old_military_crate', 15.2, 0, -9, 0.1], ['Barrel_01', -2, 0, 9, 0], ['barrel_03', -1, 0, 9.2, 0], ['outdoor_table_chair_set_01', -16, 0, 6, 0.2], ['wooden_picnic_table', 12, 0, 6, 0.4], ['painted_wooden_bench', 4, 0, -9, 0], ['painted_wooden_bench', -9, 0, 9.4, 3.14], ['Lantern_01', 2, 0, 3, 0, { collide: false }]);
  crateRow([20, 21.1, 22.2], 4, 0); crateRow([-22, -21, -20], -7.5, 0.1);
  await props(kit, L);

  // ---- gameplay
  for (let i = 0; i < 7; i++) kit.hider(-18 + i * 5.6, 0.05, -2 + (i % 2) * 3);
  for (let i = 0; i < 6; i++) kit.hider(-16 + i * 6, 0.05, 6.6 + (i % 2) * 1.2);
  kit.hider(0, 0.05, 4); kit.hider(10, 0.05, -2);
  for (const x of [-4, -2, 0, 2, 4]) kit.seeker(x, 0.05, -8.8);
  for (const b of B) {
    roomSpots(kit, b.x0 + 0.5, b.z0 + 0.5, b.x1 - 0.5, b.z1 - 0.5, 4, [0.5, 1.0, 1.6], 3);
    floorSpots(kit, b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1, 3, 0.3, 5);
    // outside faces
    wallSpots(kit, b.x0, b.z0 - 0.2, b.x1, b.z0 - 0.2, 0, -1, 3, [0.5, 1.0, 1.6], { seed: 41 });
    wallSpots(kit, b.x0, b.z1 + 0.2, b.x1, b.z1 + 0.2, 0, 1, 3, [0.5, 1.0, 1.6], { seed: 42 });
    wallSpots(kit, b.x0 - 0.2, b.z0, b.x0 - 0.2, b.z1, -1, 0, 3, [0.5, 1.0, 1.6], { seed: 43 });
    wallSpots(kit, b.x1 + 0.2, b.z0, b.x1 + 0.2, b.z1, 1, 0, 3, [0.5, 1.0, 1.6], { seed: 44 });
  }
  roomSpots(kit, -X + 0.6, -Z + 0.6, X - 0.6, Z - 0.6, 6, [0.5, 1.0, 1.6, 2.4], 9);
  cornerSpots(kit, -X + 0.6, -Z + 0.6, X - 0.6, Z - 0.6);
  floorSpots(kit, -22, -9, 22, 9, 14, 0.3, 17);

  return kit.data({
    titleCam: { center: new THREE.Vector3(0, 2, 0), radius: 11, height: 3.4 },
    environment: {
      exposure: 1.25, envIntensity: 0.7, background: new THREE.Color(0x201810), probe: [0, 3, 0],
      bloom: { strength: 0.3, radius: 0.6, threshold: 0.92 }, ao: { aoRadius: 1.3, intensity: 2.4, distanceFalloff: 0.8 },
    },
    seekerWait: { pos: new THREE.Vector3(0, 1.6, -8.8), look: new THREE.Vector3(0, 1.6, 4) },
  });
}
