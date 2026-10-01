// Penguin Hotel: a grand ice-blue and cream hotel run by penguins. Lobby, restaurant, long corridor and five guest rooms.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, roomSpots, poster, noise } from './gen.js';

const H = 3.6, T = 0.25;

export async function build({ kit, assets }) {
  const R = rng(909);
  const checker = assets.canvasMaterial('hotel-checker', 256, 256, (g, w, h) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1b2a44' : '#eef3f8'; g.fillRect(i * 128, j * 128, 128, 128); }
    noise(g, w, h, 10, 0.5, 5);
  }, { roughness: 0.25, metalness: 0.05 }, [1, 1]);
  const marble = assets.pbr('marble_01', { repeat: [0.4, 0.4], color: 0xdde8f0 });
  const wall = assets.canvasMaterial('hotel-wall', 256, 256, (g, w, h) => {
    g.fillStyle = '#cfe3ee'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 3;
    for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = 'rgba(120,160,190,0.10)'; for (let x = 32; x < w; x += 64) g.fillRect(x - 10, 0, 20, h);
    noise(g, w, h, 8, 0.4, 3);
  }, { roughness: 0.85 }, [0.5, 0.5]);
  const roomWall = assets.canvasMaterial('hotel-roomwall', 256, 256, (g, w, h) => {
    g.fillStyle = '#e8dcc4'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(160,120,70,0.12)'; for (let y = 0; y < h; y += 48) for (let x = (y / 48) % 2 ? 0 : 24; x < w; x += 48) { g.beginPath(); g.arc(x + 12, y + 12, 7, 0, 6.3); g.fill(); }
    noise(g, w, h, 8, 0.4, 7);
  }, { roughness: 0.9 }, [0.5, 0.5]);
  const carpet = assets.canvasMaterial('hotel-carpet', 256, 256, (g, w, h) => {
    g.fillStyle = '#2a3f66'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d8b25a'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#d8b25a'; for (const [x, y] of [[w / 2, h / 2]]) { g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 22, y); g.lineTo(x, y + 30); g.lineTo(x - 22, y); g.fill(); }
    noise(g, w, h, 14, 0.6, 2);
  }, { roughness: 1 }, [0.5, 0.5]);
  const woodFloor = assets.pbr('herringbone_parquet', { repeat: [0.4, 0.4], color: 0xd8c0a0 });
  const ceil = assets.mat('hotel-ceil', { color: 0xf2f5f8, roughness: 0.9 });
  const gold = assets.mat('hotel-gold', { color: 0xd8b25a, roughness: 0.3, metalness: 0.8 });
  const dkwood = assets.pbr('dark_wood', { repeat: [1, 1] });
  const black = assets.mat('hotel-black', { color: 0x14161c, roughness: 0.5 });
  const white = assets.mat('hotel-white', { color: 0xf4f6f8, roughness: 0.6 });
  const orange = assets.mat('hotel-orange', { color: 0xf08a1c, roughness: 0.5 });
  const iceBlue = assets.mat('hotel-ice', { color: 0x9fd0ea, roughness: 0.2, metalness: 0.1 });
  const linen = assets.mat('hotel-linen', { color: 0xf1f1ee, roughness: 1 });
  const bedBlue = assets.mat('hotel-bedblue', { color: 0x3a6a9a, roughness: 0.9 });

  const numMat = (n) => assets.canvasMaterial('hotel-num-' + n, 128, 64, (g, w, h) => {
    g.fillStyle = '#d8b25a'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a1a0a'; g.font = '900 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), w / 2, h / 2 + 2);
  }, { roughness: 0.4, metalness: 0.5 });

  // ---- shell: x -20..20, z -16..16
  kit.floor(-20, -16, 20, 16, 0, marble, { uv: 3 });
  kit.floor(-20, -16, 2, -2, 0.01, checker, { uv: 4, collide: false });
  kit.floor(2, -16, 20, -2, 0.01, woodFloor, { uv: 2, collide: false });
  kit.floor(-20, -2, 20, 2, 0.01, carpet, { uv: 2, collide: false });
  for (let i = 0; i < 5; i++) kit.floor(-20 + i * 8, 2, -12 + i * 8, 16, 0.01, woodFloor, { uv: 2, collide: false });
  kit.ceiling(-20, -16, 20, 16, H, ceil, { uv: 4 });
  const w = (ax, az, bx, bz, mat, gaps) => kit.wall(ax, az, bx, bz, 0, H, mat, { t: T, uv: 2, gaps });
  w(-20, -16, 20, -16, wall); w(-20, 16, 20, 16, roomWall); w(-20, -16, -20, 16, wall); w(20, -16, 20, 16, wall);
  // lobby/restaurant to corridor wall (z=-2): wide openings
  w(-20, -2, 20, -2, wall, [{ a: 8, b: 16, y0: 0, y1: 3.0 }, { a: 25, b: 33, y0: 0, y1: 3.0 }]);
  // lobby/restaurant divider (x=2)
  w(2, -16, 2, -2, wall, [{ a: 6, b: 8.2, y0: 0, y1: 2.6 }]);
  // corridor south wall with five doors
  const doors = [0, 1, 2, 3, 4].map((i) => ({ a: 3.6 + i * 8, b: 5.6 + i * 8, y0: 0, y1: 2.5 }));
  w(-20, 2, 20, 2, wall, doors);
  for (const x of [-12, -4, 4, 12]) w(x, 2, x, 16, roomWall);
  // wainscot + crown
  for (const [ax, az, bx, bz] of [[-20, -15.85, 20, -15.85], [-19.85, -16, -19.85, -2]]) { const len = Math.hypot(bx - ax, bz - az); kit.box(bx === ax ? 0.12 : len, 1.0, bz === az ? 0.12 : len, dkwood, { pos: [(ax + bx) / 2, 0.5, (az + bz) / 2], collide: false }); }
  kit.box(40, 0.18, 0.4, white, { pos: [0, H - 0.1, -2.15], collide: false });
  // door frames + numbers
  doors.forEach((d, i) => {
    const cx = -20 + (d.a + d.b) / 2;
    kit.box(0.12, 2.5, 0.4, gold, { pos: [-20 + d.a - 0.06, 1.25, 2.0], collide: false });
    kit.box(0.12, 2.5, 0.4, gold, { pos: [-20 + d.b + 0.06, 1.25, 2.0], collide: false });
    poster(kit, numMat(101 + i), 0.5, 0.25, cx, 2.0, 1.86, 0);
  });
  // columns in lobby
  for (const [x, z] of [[-14, -9], [-8, -9], [-14, -5], [-8, -5]]) { kit.cyl(0.4, H, marble, { pos: [x, H / 2, z], uv: 2 }); kit.cyl(0.55, 0.3, gold, { pos: [x, 0.15, z], collide: false }); kit.cyl(0.55, 0.3, gold, { pos: [x, H - 0.15, z], collide: false }); }

  // ---- penguins from primitives
  const penguin = (x, z, s = 1, ry = 0, body = black) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; kit.root.add(g);
    const add = (m) => { m.userData.collide = false; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 20, 16), body)); b.scale.set(1, 1.5, 0.95); b.position.y = 0.66 * s;
    const bel = add(new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 20, 16), white)); bel.scale.set(0.95, 1.4, 0.7); bel.position.set(0, 0.62 * s, 0.14 * s);
    const hd = add(new THREE.Mesh(new THREE.SphereGeometry(0.25 * s, 18, 14), body)); hd.position.set(0, 1.38 * s, 0.02 * s);
    const bk = add(new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.2 * s, 10), orange)); bk.rotation.x = Math.PI / 2; bk.position.set(0, 1.34 * s, 0.28 * s);
    for (const sx of [-1, 1]) {
      const e = add(new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 8, 8), white)); e.position.set(sx * 0.1 * s, 1.44 * s, 0.2 * s);
      const pu = add(new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 8, 8), black)); pu.position.set(sx * 0.1 * s, 1.44 * s, 0.235 * s);
      const fl = add(new THREE.Mesh(new THREE.SphereGeometry(0.15 * s, 10, 8), body)); fl.scale.set(0.3, 1.5, 0.8); fl.position.set(sx * 0.46 * s, 0.82 * s, 0); fl.rotation.z = -sx * 0.3;
      const ft = add(new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 10, 8), orange)); ft.scale.set(1, 0.35, 1.4); ft.position.set(sx * 0.17 * s, 0.04 * s, 0.1 * s);
    }
    kit.collider(0.9 * s, 1.7 * s, 0.8 * s, [x, 0.85 * s, z], ry);
  };
  penguin(-17, -13.5, 1.2, 0.6); penguin(-17, -3.5, 1.2, -0.5, iceBlue); penguin(-3.2, -3.6, 1.0, 3.6);
  penguin(-11, -13.8, 1.7, 0); penguin(10, -14, 1.1, 0.2); penguin(18, -3.5, 1.0, 3.5); penguin(-1, 0, 0.8, 1.2);
  // ice-block sculpture
  kit.box(1.4, 1.2, 1.4, iceBlue, { pos: [-1.2, 0.6, -7] }); kit.box(1.0, 0.9, 1.0, iceBlue, { pos: [-1.0, 1.65, -7.1], rot: [0, 0.4, 0] });

  // ---- reception desk
  kit.box(7, 1.15, 1.2, dkwood, { pos: [-11, 0.58, -14], uv: 1 });
  kit.box(7.2, 0.08, 1.4, marble, { pos: [-11, 1.17, -14], uv: 2 });
  const sign = assets.canvasMaterial('hotel-sign', 512, 128, (g, wd, h) => {
    g.fillStyle = '#10243c'; g.fillRect(0, 0, wd, h); g.strokeStyle = '#d8b25a'; g.lineWidth = 6; g.strokeRect(8, 8, wd - 16, h - 16);
    g.fillStyle = '#f0e0b0'; g.font = '900 56px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PENGUIN HOTEL', wd / 2, h / 2 + 3);
  }, { roughness: 0.4 });
  poster(kit, sign, 5.4, 1.35, -11, 2.7, -15.85, 0);

  // ---- restaurant tables
  const tableCloth = assets.mat('hotel-cloth', { color: 0xf6f0e4, roughness: 0.9 });
  for (const [x, z] of [[6, -12], [10, -12], [14, -12], [18, -12], [6, -6], [10, -6], [14, -6], [18, -6]]) {
    kit.cyl(0.8, 0.06, tableCloth, { pos: [x, 0.78, z] }); kit.cyl(0.08, 0.78, black, { pos: [x, 0.39, z], collide: false });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; kit.box(0.4, 0.45, 0.4, bedBlue, { pos: [x + Math.cos(a) * 1.15, 0.22, z + Math.sin(a) * 1.15], rot: [0, a, 0] }); }
  }
  kit.box(8, 1.0, 0.8, dkwood, { pos: [14, 0.5, -15.2] });

  // ---- guest rooms
  for (let i = 0; i < 5; i++) {
    const cx = -16 + i * 8;
    kit.box(2.2, 0.5, 2.6, dkwood, { pos: [cx, 0.25, 13.6], uv: 1 });
    kit.box(2.0, 0.28, 2.5, linen, { pos: [cx, 0.64, 13.6] });
    kit.box(2.0, 0.12, 1.2, bedBlue, { pos: [cx, 0.8, 13.0] });
    kit.box(2.4, 1.3, 0.12, dkwood, { pos: [cx, 0.65, 15.1], collide: false });
    kit.box(0.5, 0.45, 0.45, dkwood, { pos: [cx - 1.8, 0.22, 14.8] }); kit.box(0.5, 0.45, 0.45, dkwood, { pos: [cx + 1.8, 0.22, 14.8] });
    kit.point([cx, H - 0.5, 9], 0xffe2b0, 9, 10);
    kit.point([cx - 1.8, 0.95, 14.8], 0xffc880, 3, 4);
  }

  // lights
  for (const [x, z] of [[-14, -9], [-8, -9], [-14, -4], [-8, -4], [-11, -12], [-17, -9]]) kit.point([x, H - 0.4, z], 0xfff0d8, 5, 12);
  for (const [x, z] of [[6, -10], [14, -10], [10, -5], [18, -5]]) kit.point([x, H - 0.4, z], 0xffe6c0, 5, 12);
  for (const x of [-16, -8, 0, 8, 16]) kit.point([x, H - 0.4, 0], 0xffe2b0, 8, 11);
  kit.point([-8, H - 0.5, -8], 0xfff4e0, 16, 20, { shadow: true, shadowSize: 1024 });
  kit.hemi(0xe8f2ff, 0xa89a80, 0.8);
  // chandeliers (emissive stand-ins)
  const chand = assets.mat('hotel-chand', { color: 0xffe9b8, emissive: 0xffd080, emissiveIntensity: 1.8 });
  for (const [x, z] of [[-11, -7], [10, -9]]) { kit.cyl(0.6, 0.12, gold, { pos: [x, H - 0.8, z], collide: false }); kit.sphere(0.35, chand, { pos: [x, H - 1.1, z], collide: false }); kit.cyl(0.02, 0.7, gold, { pos: [x, H - 0.35, z], collide: false }); }

  // ---- props
  const L = [
    ['Sofa_01', -17.5, 0, -8.5, 1.57], ['sofa_02', -3.5, 0, -10, -1.57], ['ArmChair_01', -3.5, 0, -6, -1.4], ['CoffeeTable_01', -5.5, 0, -8, 0], ['potted_plant_04', -19, 0, -15, 0], ['potted_plant_04', 1, 0, -15, 0], ['potted_plant_04', -19, 0, -3, 0], ['potted_plant_04', 1, 0, -3, 0],
    ['vintage_grandfather_clock_01', -19, 0, -10, 1.57], ['ornate_mirror_01', -19.8, 1.6, -5.5, 1.57, { collide: false, fitHeight: 1.7 }],
    ['marble_bust_01', -1.4, 0, -14.5, 0.3], ['Chandelier_01', -11, H - 0.1, -3, 0, { collide: false }],
    ['potted_plant_04', 19, 0, -15, 0], ['potted_plant_04', 19, 0, -3, 0], ['Shelf_01', 11, 0, -15.5, 0],
    ['treasure_chest', 19, 0, 0.8, 0.2], ['ClassicConsole_01', -6, 0, -1.5, 0], ['ClassicConsole_01', 8, 0, -1.4, 3.14],
    ['standing_chalkboard_01', -2.5, 0, -2.8, 0.2], ['fancy_picture_frame_01', -16, 1.7, 1.78, 3.14, { collide: false }], ['fancy_picture_frame_02', 0, 1.7, 1.78, 3.14, { collide: false }], ['fancy_picture_frame_01', 16, 1.7, 1.78, 3.14, { collide: false }],
  ];
  for (let i = 0; i < 5; i++) {
    const cx = -16 + i * 8;
    L.push(['GothicCabinet_01', cx + 3, 0, 8, -1.57], ['WoodenChair_01', cx - 2.5, 0, 6, 0.6], ['side_table_tall_01', cx - 3, 0, 8.4, 0], ['Television_01', cx, 0.9, 3.3, 0, { collide: false }]);
    if (i % 2 === 0) L.push(['Rockingchair_01', cx - 2.5, 0, 10.5, 0.5]); else L.push(['GreenChair_01', cx - 2.5, 0, 10.5, 0.8]);
  }
  await props(kit, L);

  // ---- gameplay
  for (let i = 0; i < 5; i++) { kit.hider(-16 + i * 8, 0.05, 8.5); }
  for (let i = 0; i < 4; i++) kit.hider(-17 + i * 3.4, 0.05, -11 + (i % 2) * 5);
  for (let i = 0; i < 4; i++) kit.hider(6 + i * 3.8, 0.05, -9);
  for (let i = 0; i < 3; i++) kit.hider(-14 + i * 14, 0.05, 0);
  for (let i = 0; i < 5; i++) kit.seeker(-17 + i * 1.6, 0.05, 0.4);
  roomSpots(kit, -19.6, -15.6, 1.7, -2.3, 6, [0.5, 1.0, 1.6, 2.3], 3);
  roomSpots(kit, 2.3, -15.6, 19.6, -2.3, 5, [0.5, 1.0, 1.6, 2.3], 5);
  wallSpots(kit, -19.6, -1.7, 19.6, -1.7, 0, 1, 10, [0.5, 1.0, 1.6, 2.3], { seed: 8 });
  for (let i = 0; i < 5; i++) {
    const x0 = -19.6 + i * 8, x1 = x0 + 7.2 + (i === 4 ? 0 : 0.0);
    roomSpots(kit, x0, 2.4, x1, 15.6, 3, [0.5, 1.0, 1.6], 20 + i);
    cornerSpots(kit, x0, 2.4, x1, 15.6, [0.5, 1.1]);
    floorSpots(kit, x0 + 1, 3, x1 - 1, 11, 2, 0.3, 30 + i);
  }
  floorSpots(kit, -18, -14, 19, -3, 10, 0.3, 14);

  return kit.data({
    titleCam: { center: new THREE.Vector3(-8, 1.8, -8), radius: 9, height: 2.4 },
    environment: {
      exposure: 1.1, envIntensity: 0.6, background: new THREE.Color(0x182030), probe: [-8, 1.8, -6],
      bloom: { strength: 0.28, radius: 0.6, threshold: 0.97 }, ao: { aoRadius: 1.2, intensity: 2.2, distanceFalloff: 0.8 },
    },
    seekerWait: { pos: new THREE.Vector3(-13, 1.6, 0.4), look: new THREE.Vector3(-4, 1.6, -8) },
  });
}
