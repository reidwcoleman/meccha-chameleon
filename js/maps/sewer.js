// Sewer: round brick tunnels crossing under four storage chambers, rusty pipes, IBC tanks, jerrycans, pallets,
// cable spools, graffiti and a STOP sign. Dim, damp, sludge on the floor.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, roomSpots, decal, poster, noise, wrapText } from './gen.js';

const X = 22, Z = 20, TW = 3, SPRING = 2.2, HC = 5.2, T = 0.4;

export async function build({ kit, assets }) {
  const R = rng(77);
  const brick = assets.pbr('brick_wall_001', { repeat: [0.4, 0.4], color: 0xb8a69a });
  const brickDark = assets.pbr('brick_wall_02', { repeat: [0.4, 0.4], color: 0xa89888 });
  const floorMat = assets.pbr('chipped_concrete', { repeat: [0.4, 0.4], color: 0xd0d0c4 });
  const tiles = assets.pbr('dirty_tiles', { repeat: [0.5, 0.5], color: 0xaaa89a });
  const rust = assets.pbr('rust_coarse_01', { repeat: [1, 1] });
  const grate = assets.pbr('metal_grate_rusty', { repeat: [1, 1] });
  const ceil = assets.pbr('painted_brick', { repeat: [0.4, 0.4], color: 0x8a8278 });
  const sludge = new THREE.MeshStandardMaterial({ color: 0x374820, roughness: 0.08, metalness: 0.1, emissive: 0x0b1404 });
  const yellow = assets.mat('sewer-yellow', { color: 0xe0b020, roughness: 0.5 });
  const wood = assets.pbr('dark_wood', { repeat: [1, 1] });
  const steel = assets.mat('sewer-steel', { color: 0x8a96a0, roughness: 0.55, metalness: 0.35 });

  // ---- shell
  kit.floor(-X, -Z, X, Z, 0, floorMat, { uv: 2 });
  kit.ceiling(-X, -Z, X, Z, HC, ceil, { uv: 2 });
  const W = (ax, az, bx, bz, doors = [], mat = brick) => {
    const horiz = Math.abs(bz - az) < 1e-6; const base = horiz ? ax : az;
    kit.wall(ax, az, bx, bz, 0, HC, mat, { t: T, uv: 2.5, gaps: doors.map(([a, b]) => ({ a: a - base, b: b - base, y0: 0, y1: 2.3 })) });
  };
  W(-X, -Z, X, -Z); W(-X, Z, X, Z, [], brickDark); W(-X, -Z, -X, Z); W(X, -Z, X, Z, [], brickDark);
  // chamber walls beside the tunnels (doors into every chamber from both tunnels)
  W(-X, -TW, -TW, -TW, [[-16, -12.5]]); W(TW, -TW, X, -TW, [[12, 15.5]]);
  W(-X, TW, -TW, TW, [[-17, -13.5]], brickDark); W(TW, TW, X, TW, [[13, 16.5]], brickDark);
  W(-TW, -Z, -TW, -TW, [[-14, -10.5]]); W(-TW, TW, -TW, Z, [[10, 13.5]], brickDark);
  W(TW, -Z, TW, -TW, [[-13, -9.5]], brickDark); W(TW, TW, TW, Z, [[11, 14.5]]);

  // ---- vaulted tunnels (groin vault where they cross)
  const vaultMat = brick.clone(); vaultMat.side = THREE.BackSide;
  const gx = new THREE.CylinderGeometry(TW, TW, 2 * X, 28, 1, true, 0, Math.PI); gx.rotateZ(Math.PI / 2);
  const gz = new THREE.CylinderGeometry(TW, TW, 2 * Z, 28, 1, true, 0, Math.PI); gz.rotateZ(Math.PI / 2); gz.rotateY(Math.PI / 2);
  for (const g of [gx, gz]) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 12); }
  kit.mesh(gx, vaultMat, { pos: [0, SPRING, 0], collide: false, merge: false });
  kit.mesh(gz, vaultMat, { pos: [0, SPRING, 0], collide: false, merge: false });
  // ribs
  for (let x = -X + 3; x < X; x += 5) if (Math.abs(x) > 3.5) { const r = kit.mesh(new THREE.TorusGeometry(TW, 0.12, 6, 20, Math.PI), steel, { pos: [x, SPRING, 0], collide: false, merge: false }); r.rotation.y = Math.PI / 2; }
  for (let z = -Z + 3; z < Z; z += 5) if (Math.abs(z) > 3.5) { kit.mesh(new THREE.TorusGeometry(TW, 0.12, 6, 20, Math.PI), steel, { pos: [0, SPRING, z], collide: false, merge: false }); }

  // sludge channels + grates
  decal(kit, sludge, 2 * X, 1.4, 0, 0.012, 0, 0);
  decal(kit, sludge, 1.4, 2 * Z, 0, 0.012, 0, 0);
  for (const [x, z, r] of [[-8, 0, 0], [8, 0, 0], [0, -9, Math.PI / 2], [0, 9, Math.PI / 2]]) decal(kit, grate, 2.2, 1.0, x, 0.016, z, r);
  // walkway ledges inside tunnels (low kerbs)
  for (const s of [-2.3, 2.3]) { kit.box(2 * X - 8, 0.28, 0.6, floorMat, { pos: [0, 0.14, s * 1.0 + (s > 0 ? 0.0 : 0)], collide: true, uv: 1 }); }
  for (const s of [-2.3, 2.3]) { kit.box(0.6, 0.28, 2 * Z - 8, floorMat, { pos: [s, 0.14, 0], collide: true, uv: 1 }); }

  // pipes along tunnel walls and chamber ceilings
  const pipe = (x, y, z, len, axis, r = 0.22, mat = rust) => {
    const m = kit.cyl(r, len, mat, { pos: [x, y, z], uv: 1 });
    if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  };
  for (const sx of [-1, 1]) {
    const cx = sx * (3.6 + (X - 3.6) / 2), len = X - 3.6 - 0.5;
    pipe(cx, 2.0, -2.7, len, 'x', 0.2); pipe(cx, 1.35, 2.7, len, 'x', 0.26, steel);
    const cz = sx * (3.6 + (Z - 3.6) / 2), lz = Z - 3.6 - 0.5;
    pipe(-2.7, 1.8, cz, lz, 'z', 0.2); pipe(2.7, 1.2, cz, lz, 'z', 0.18, steel);
  }
  for (const [x, z] of [[-13, -11], [13, -11], [-13, 11], [13, 11]]) { pipe(x, 4.3, z, 17, 'x', 0.28); pipe(x - 3, 4.0, z + 3, 14, 'z', 0.24, steel); }
  for (const x of [-12, -6, 12, 6]) for (const s of [-1, 1]) kit.cyl(0.14, 1.6, rust, { pos: [x, 2.0, s * 2.85], collide: false });

  // ---- lights (dim + sickly)
  const lamp = (x, y, z, c, i, d, o) => { kit.point([x, y, z], c, i, d, o); kit.bulb([x, y, z], c, 0.08, 4); };
  for (const x of [-16, -8, 8, 16]) lamp(x, 3.9, 0, 0xffb064, 18, 13);
  for (const z of [-14, -7, 7, 14]) lamp(0, 3.9, z, 0xffb064, 18, 13);
  lamp(0, 4.2, 0, 0xffc890, 26, 16, { shadow: true, shadowSize: 1024 });
  lamp(-13, 4.4, -12, 0xb0ff9a, 26, 18); lamp(-8, 4.4, -7, 0xffb064, 14, 12); lamp(-18, 4.4, -16, 0xffb064, 12, 12); lamp(13, 4.4, -12, 0xffb064, 26, 18, { shadow: true, shadowSize: 1024 });
  lamp(-13, 4.4, 12, 0xff9a60, 24, 18); lamp(13, 4.4, 12, 0xa8d8ff, 24, 18);
  kit.hemi(0xb8c8b0, 0x40482c, 0.95);

  // ---- props
  const pallet = (x, z, rot = 0) => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) kit.box(1.2, 0.1, 0.12, wood, { pos: [x + Math.cos(rot) * 0, 0.1, z + (i - 1) * 0.44], rot: [0, rot, 0], uv: 1 });
    for (let i = 0; i < 5; i++) kit.box(0.14, 0.04, 1.0, wood, { pos: [x + (i - 2) * 0.28, 0.17, z], rot: [0, rot, 0], uv: 1 });
  };
  const jerry = (x, z, ry = 0) => { kit.box(0.35, 0.5, 0.2, yellow, { pos: [x, 0.25, z], rot: [0, ry, 0] }); kit.box(0.1, 0.1, 0.1, yellow, { pos: [x, 0.55, z], rot: [0, ry, 0], collide: false }); };
  const spool = (x, z, r = 0.8, ry = 0) => {
    const m = kit.cyl(r, 0.18, wood, { pos: [x, r, z], uv: 1 }); m.rotation.x = Math.PI / 2; m.rotation.z = ry;
    const m2 = kit.cyl(r, 0.18, wood, { pos: [x, r, z + 0.5], uv: 1 }); m2.rotation.x = Math.PI / 2;
    const c = kit.cyl(r * 0.5, 0.82, assets.mat('sewer-cable', { color: 0x1a1a1c, roughness: 0.6 }), { pos: [x, r, z + 0.25] }); c.rotation.x = Math.PI / 2;
  };
  // NW chamber: pump room
  spool(-18, -17, 0.9); spool(-15, -18, 0.7); pallet(-8, -17); pallet(-8, -15.6, 0.3); jerry(-7.6, -16.7); jerry(-7.2, -16.4, 0.4); jerry(-7.8, -15.0);
  kit.cyl(1.0, 3.0, steel, { pos: [-18.5, 1.5, -8], uv: 1 }); kit.cyl(0.8, 2.6, steel, { pos: [-16, 1.3, -8.4], uv: 1 });
  // NE chamber: IBC tanks + drums
  // SW: stacked crates, hydrant
  // SE: tyres, trash
  const stop = assets.canvasMaterial('sewer-stop', 256, 256, (g, w, h) => {
    g.fillStyle = '#7a8088'; g.fillRect(118, 150, 20, 106);
    g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(128 + Math.cos(a) * 118, 104 + Math.sin(a) * 100); } g.fill();
    g.fillStyle = '#c8202a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g.lineTo(128 + Math.cos(a) * 106, 104 + Math.sin(a) * 90); } g.fill();
    g.fillStyle = '#fff'; g.font = '800 54px sans-serif'; g.textAlign = 'center'; g.fillText('STOP', 128, 124);
  }, { roughness: 0.5, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  poster(kit, stop, 1.2, 1.2, -TW - 0.1, 2.0, -12.5, Math.PI / 2 * 0 + 0);
  const gra = (key, text, col, bg) => assets.canvasMaterial(key, 512, 256, (g, w, h) => {
    g.fillStyle = bg; g.globalAlpha = 0.0; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    g.font = '900 120px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.lineWidth = 12; g.strokeStyle = '#111'; g.strokeText(text, w / 2, 160); g.fillStyle = col; g.fillText(text, w / 2, 160);
    const r = rng(key.length); for (let i = 0; i < 20; i++) { g.fillStyle = col; g.fillRect(r() * w, 170 + r() * 80, 3, 20 + r() * 50); }
  }, { roughness: 0.8, transparent: true }, [1, 1]);
  poster(kit, gra('sewer-g1', 'HIDE!', '#ff5ec8', 'rgba(0,0,0,0)'), 4, 2, -X + 0.25, 2.4, -14, Math.PI / 2);
  poster(kit, gra('sewer-g2', 'BOO', '#7dff6a', 'rgba(0,0,0,0)'), 3.4, 1.7, 4, 2.4, TW + 0.22 + 0.0, 0);
  poster(kit, gra('sewer-g3', 'RAT', '#ffd24a', 'rgba(0,0,0,0)'), 3, 1.5, 16, 2.2, -Z + 0.25, 0);

  const L = [];
  for (const [x, z, r] of [[8, -16, 0], [9.2, -16.4, 0.3], [10.6, -16, 0], [8.8, -14.8, 0.1]]) L.push(['industrial_pastic_container', x, 0, z, r]);
  L.push(['industrial_pastic_container', 19, 0, -17, 0.2], ['industrial_pastic_container', 19, 0, -14.4, 0], ['industrial_pastic_container', 19, 1.1, -16, 0.1, { collide: false }]);
  L.push(['Barrel_01', 14, 0, -18, 0], ['Barrel_02', 15.1, 0, -18.1, 0], ['barrel_03', 16.2, 0, -17.9, 0], ['Barrel_01', 20.5, 0, -9, 0], ['Barrel_02', 20.6, 0, -8, 0], ['wine_barrel_01', 11, 0, -8, 0], ['propane_tank', 12.6, 0, -7.4, 0], ['propane_tank', 13.2, 0, -7.4, 0]);
  L.push(['wooden_crate_01', 10, 0, -10.5, 0.3], ['wooden_crate_01', 10.2, 0.9, -10.5, 0.1], ['old_military_crate', 17, 0, -6, 0.3], ['old_military_crate', 18.1, 0, -6.4, -0.2]);
  L.push(['wooden_crate_01', -8, 0, 8, 0.2], ['wooden_crate_01', -9.2, 0, 8, -0.2], ['wooden_crate_01', -8.6, 0.9, 8, 0], ['fire_hydrant', -20.8, 0, 8, 1.57], ['metal_trash_can', -20.5, 0, 17.5, 0], ['metal_trash_can', -19.4, 0, 17.6, 0.2],
    ['steel_frame_shelves_01', -12, 0, 19.2, 0], ['tool_cart', -15, 0, 16, 0.4], ['industrial_storage_cart', -9, 0, 14, 1.2], ['trashbag', -19, 0, 10, 0], ['trashbag', -18.4, 0, 10.3, 1], ['compost_bags', -7, 0, 18, 0]);
  L.push(['old_tyre', 8, 0, 8, 0], ['old_tyre', 8.2, 0.3, 8.1, 0.4], ['old_tyre', 20, 0, 18, 0], ['WetFloorSign_01', 5, 0, 6, 0.5], ['WetFloorSign_01', 13, 0, 3.6, -0.4], ['trashbag', 16, 0, 12, 0.5], ['compost_bags', 20, 0, 12, 0], ['cardboard_box_01', 10, 0, 18, 0.4], ['cardboard_box_01', 11, 0, 18.4, 0.1],
    ['plastic_crate_01', 17, 0, 7.8, 0], ['plastic_crate_02', 18, 0, 8, 0.3], ['Barrel_01', 20.4, 0, 6.8, 0], ['metal_trash_can', 5, 0, 19, 0], ['hanging_industrial_lamp', 0, 4.9, 0, 0, { collide: false }]);
  L.push(['modular_pipes', -20, 0, -3.8, 0, { collide: false }], ['industrial_wall_lamp', -TW + 0.1, 2.6, -8, 1.57, { collide: false }], ['industrial_wall_lamp', TW - 0.1, 2.6, 8, -1.57, { collide: false }], ['rubber_duck_toy', 1, 0.0, -3, 0, { collide: false }]);
  pallet(16, 17); pallet(15, 14); pallet(-6, 3.6); jerry(13, 16.4); jerry(13.5, 16.6, 0.5); jerry(-6.4, 4.2);
  spool(-20, 18, 0.8); spool(9, 18.2, 0.7);
  await props(kit, L);

  // ---- gameplay
  for (let i = 0; i < 6; i++) kit.hider(-X + 3 + i * 6, 0.05, -1 + (i % 2) * 2);
  for (let i = 0; i < 5; i++) kit.hider(-1 + (i % 2) * 2, 0.05, -Z + 3 + i * 7);
  kit.hider(-12, 0.05, -12); kit.hider(12, 0.05, -12); kit.hider(-12, 0.05, 12); kit.hider(-18, 0.05, -6);
  for (const x of [8, 10, 12, 14, 16]) kit.seeker(x, 0.05, 16.5);
  for (const [x0, z0, x1, z1] of [[-X + 0.4, -Z + 0.4, -TW - 0.4, -TW - 0.4], [TW + 0.4, -Z + 0.4, X - 0.4, -TW - 0.4], [-X + 0.4, TW + 0.4, -TW - 0.4, Z - 0.4], [TW + 0.4, TW + 0.4, X - 0.4, Z - 0.4]]) {
    roomSpots(kit, x0, z0, x1, z1, 5, [0.5, 1.0, 1.6], 1); cornerSpots(kit, x0, z0, x1, z1); floorSpots(kit, x0, z0, x1, z1, 5, 0.3, 4);
  }
  wallSpots(kit, -X + 0.4, -TW + 0.3, -TW, -TW + 0.3, 0, 1, 5, [0.5, 1.0, 1.5], { seed: 20 });
  wallSpots(kit, -X + 0.4, TW - 0.3, -TW, TW - 0.3, 0, -1, 5, [0.5, 1.0, 1.5], { seed: 21 });
  wallSpots(kit, TW, -TW + 0.3, X - 0.4, -TW + 0.3, 0, 1, 5, [0.5, 1.0, 1.5], { seed: 22 });
  wallSpots(kit, TW, TW - 0.3, X - 0.4, TW - 0.3, 0, -1, 5, [0.5, 1.0, 1.5], { seed: 23 });
  floorSpots(kit, -X + 2, -2, X - 2, 2, 8, 0.3, 30);

  return kit.data({
    titleCam: { center: new THREE.Vector3(0, 1.6, 0), radius: 5, height: 1.8 },
    environment: {
      exposure: 1.3, envIntensity: 0.5, background: new THREE.Color(0x050806), probe: [0, 1.8, 0],
      fog: new THREE.FogExp2(0x1a2418, 0.022),
      bloom: { strength: 0.36, radius: 0.6, threshold: 0.85 }, ao: { aoRadius: 1.2, intensity: 2.8, distanceFalloff: 0.8 },
    },
    seekerWait: { pos: new THREE.Vector3(12, 1.6, 16.5), look: new THREE.Vector3(0, 1.6, 0) },
  });
}
