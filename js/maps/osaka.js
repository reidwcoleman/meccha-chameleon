// Osaka: a neon-lit covered shopping arcade at night. Twelve shops, a cross alley, back lanes, torii gates, vending machines and bikes.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, roomSpots, poster, noise } from './gen.js';

const H = 6.5, SH = 4.2, T = 0.3;

export async function build({ kit, assets }) {
  const R = rng(4242);
  const tiles = assets.pbr('floor_tiles_06', { repeat: [0.35, 0.35], color: 0xb8b0a8 });
  const asphalt = assets.pbr('asphalt_02', { repeat: [0.3, 0.3], color: 0x9a9a9a });
  const shopFloor = assets.pbr('wood_floor', { repeat: [0.5, 0.5], color: 0xb89870 });
  const dirtyTile = assets.pbr('dirty_tiles', { repeat: [0.5, 0.5], color: 0xc8c8c0 });
  const facadeA = assets.pbr('blue_plaster_wall', { repeat: [0.3, 0.3], color: 0x9aa8b8 });
  const facadeB = assets.pbr('beige_wall_001', { repeat: [0.3, 0.3], color: 0xc8b8a0 });
  const facadeC = assets.pbr('painted_brick', { repeat: [0.3, 0.3], color: 0x9a7a6a });
  const shutter = assets.pbr('painted_metal_shutter', { repeat: [0.4, 0.4], color: 0x889098 });
  const concrete = assets.pbr('brushed_concrete_03', { repeat: [0.3, 0.3], color: 0x9a9a9c });
  const roofFrame = assets.mat('osaka-roof', { color: 0x2a3038, roughness: 0.6, metalness: 0.6 });
  const wood = assets.pbr('dark_wood', { repeat: [1, 1] });
  const red = assets.mat('osaka-red', { color: 0xc8221c, roughness: 0.5 });
  const black = assets.mat('osaka-black', { color: 0x15151a, roughness: 0.5 });
  const white = assets.mat('osaka-white', { color: 0xf2f2ee, roughness: 0.6 });
  const gold = assets.mat('osaka-gold', { color: 0xe8b84a, roughness: 0.35, metalness: 0.7 });

  const nightTex = assets.canvasTexture('osaka-sky', 512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#06081a'); gr.addColorStop(1, '#1a1030'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(5); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  }, [1, 1]);
  const nightMat = new THREE.MeshBasicMaterial({ map: nightTex });

  // ---- shell
  kit.floor(-25, -5, 25, 5, 0, tiles, { uv: 3 });
  kit.floor(-25, -20, 25, -13, 0, asphalt, { uv: 3 });
  kit.floor(-25, 13, 25, 20, 0, asphalt, { uv: 3 });
  kit.floor(-2.5, -13, 2.5, -5, 0, tiles, { uv: 3 });
  kit.floor(-2.5, 5, 2.5, 13, 0, tiles, { uv: 3 });
  kit.ceiling(-25, -20, 25, 20, H, nightMat, { uv: 20 });
  for (const [ax, az, bx, bz, m] of [[-25, -20, 25, -20, facadeC], [-25, 20, 25, 20, facadeC], [-25, -20, -25, 20, facadeB], [25, -20, 25, 20, facadeB]]) kit.wall(ax, az, bx, bz, 0, H, m, { t: 0.5, uv: 3 });
  // roof ribs over the arcade
  for (let x = -24; x <= 24; x += 4) { kit.box(0.25, 0.3, 10.6, roofFrame, { pos: [x, H - 0.2, 0], collide: false }); }
  for (const z of [-5, 0, 5]) kit.box(50, 0.25, 0.25, roofFrame, { pos: [0, H - 0.4, z], collide: false });
  // glass skylight strip glow
  const skylight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6a7ab0).multiplyScalar(0.28) });
  for (let x = -22; x <= 22; x += 4) kit.box(3.4, 0.05, 9.4, skylight, { pos: [x, H - 0.1, 0], collide: false, cast: false, receive: false });

  const neon = (text, color, w, h, x, y, z, ry, bg = '#0a0a12') => {
    const tex = assets.canvasTexture('osaka-neon-' + text + color, 512, Math.round(512 * h / w), (g, cw, ch) => {
      g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.strokeStyle = color; g.lineWidth = 8; g.shadowColor = color; g.shadowBlur = 22; g.strokeRect(14, 14, cw - 28, ch - 28);
      g.fillStyle = color; g.font = `900 ${Math.round(ch * 0.46)}px "Hiragino Sans","Arial Black",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2 + 4); g.fillText(text, cw / 2, ch / 2 + 4);
    }, [1, 1]);
    const m = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) });
    return poster(kit, m, w, h, x, y, z, ry);
  };

  // ---- shops
  const shops = [];
  const kinds = [
    ['ラーメン', '#ff5a3c', facadeA], ['ゲーム', '#4ae0ff', facadeB], ['パチンコ', '#ff4fd8', facadeC], ['寿司', '#ffd23a', facadeA], ['着物', '#c88aff', facadeB], ['コンビニ', '#5aff9a', facadeC],
    ['たこ焼き', '#ff9a3a', facadeB], ['居酒屋', '#ff4a4a', facadeA], ['本屋', '#7ab8ff', facadeC], ['喫茶', '#ffe08a', facadeB], ['麻雀', '#6aff6a', facadeA], ['薬局', '#4affd8', facadeC],
  ];
  const segs = [[-25, -17.5], [-17.5, -10], [-10, -2.5], [2.5, 10], [10, 17.5], [17.5, 25]];
  let ki = 0;
  for (const side of [-1, 1]) for (const [x0, x1] of segs) {
    const [name, col, fm] = kinds[ki++];
    const front = side * 5, back = side * 13;
    const zA = Math.min(front, back), zB = Math.max(front, back);
    const w = x1 - x0, cx = (x0 + x1) / 2;
    kit.wall(x0, front, x1, front, 0, H, fm, { t: T, uv: 3, gaps: [{ a: 1.0, b: w - 1.0, y0: 0, y1: 2.9 }] });
    kit.wall(x0, back, x1, back, 0, H, fm, { t: T, uv: 3 });
    if (x0 !== -25) kit.wall(x0, zA, x0, zB, 0, H, fm, { t: T, uv: 3, gaps: [{ a: 3.5, b: 5.5, y0: 0, y1: 2.4 }] });
    if (x1 !== 25) kit.wall(x1, zA, x1, zB, 0, H, fm, { t: T, uv: 3 });
    kit.floor(x0, zA, x1, zB, 0.01, ki % 3 === 0 ? dirtyTile : shopFloor, { uv: 2, collide: false });
    kit.ceiling(x0, zA, x1, zB, SH, white, { t: 0.1, uv: 3 });
    // rolled-up shutter box above the door + neon
    kit.box(w - 2, 0.5, 0.5, shutter, { pos: [cx, 3.1, front - side * 0.0], uv: 1, collide: false });
    neon(name, col, w - 2.4, 1.1, cx, 4.5, front - side * 0.18, side < 0 ? 0 : Math.PI);
    neon(name, col, 1.0, 3.0, x0 + 0.6, 4.0, front - side * 0.18, side < 0 ? 0 : Math.PI);
    kit.point([cx, SH - 0.5, (front + back) / 2], new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.5).getHex(), 5, 10);
    // interior fittings
    const mid = (front + back) / 2;
    kit.box(w - 3, 1.0, 0.8, wood, { pos: [cx, 0.5, front + (back - front) * 0.28], uv: 1 });
    for (const sx of [-1, 1]) kit.box(0.6, 2.2, 5, wood, { pos: [cx + sx * (w / 2 - 0.5), 1.1, mid + (back - front) * 0.08], uv: 1 });
    shops.push({ x0, x1, zA, zB, side, front, back });
  }

  // ---- torii gates
  for (const x of [-20, 20]) {
    for (const z of [-4.4, 4.4]) { kit.cyl(0.3, 5.4, red, { pos: [x, 2.7, z], segments: 14 }); kit.cyl(0.34, 0.5, black, { pos: [x, 0.25, z], collide: false, segments: 14 }); }
    kit.box(0.5, 0.45, 11, black, { pos: [x, 5.75, 0], collide: false }); kit.box(0.35, 0.4, 9.6, red, { pos: [x, 5.2, 0], collide: false });
  }

  // ---- lanterns + arcade lighting
  const chochin = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5030).multiplyScalar(1.1) });
  for (let x = -23; x <= 23; x += 2.6) for (const z of [-2.2, 2.2]) { const l = kit.sphere(0.32, chochin, { pos: [x + (z > 0 ? 1.3 : 0), 4.9, z], scale: [1, 1.3, 1], collide: false, cast: false, segments: 10 }); kit.cyl(0.18, 0.06, black, { pos: [x + (z > 0 ? 1.3 : 0), 5.42, z], collide: false, segments: 8 }); }
  for (const x of [-18, -6, 6, 18]) kit.point([x, 5.2, 0], 0xffb878, 12, 14);
  for (const [x, z] of [[-12, -16.5], [12, -16.5], [-12, 16.5], [12, 16.5]]) { kit.cyl(0.06, 3.6, black, { pos: [x, 1.8, z], collide: false, segments: 6 }); kit.sphere(0.25, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe4a0).multiplyScalar(2) }), { pos: [x, 3.7, z], collide: false, segments: 8 }); kit.point([x, 3.5, z], 0xffd890, 9, 13); }
  kit.point([0, 5, -9], 0xffd8b0, 6, 11); kit.point([0, 5, 9], 0xffd8b0, 6, 11);
  kit.point([0, 5.2, 0], 0xfff0e0, 30, 22, { shadow: true, shadowSize: 1024 });
  kit.hemi(0x8090c0, 0x504036, 1.0);
  for (const x of [-20, -8, 8, 20]) for (const z of [-16.5, 16.5]) kit.point([x, 3.4, z], 0xffc890, 7, 12);

  // ---- vending machines, bikes, maneki-neko
  const vendTex = (key, c) => assets.canvasTexture('osaka-vend-' + key, 128, 256, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(8, 10, w - 16, h * 0.58);
    const r = rng(key.length * 7 + 3); const cols = ['#e63946', '#2a9d8f', '#f4a261', '#264653', '#e9c46a', '#8ecae6'];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = cols[(r() * 6) | 0]; g.fillRect(14 + i * 26, 16 + j * 38, 18, 30); }
    g.fillStyle = '#111'; g.fillRect(14, h * 0.74, w - 28, 22); g.fillStyle = '#ffe08a'; g.fillRect(w - 34, h * 0.84, 18, 18);
  }, [1, 1]);
  const vend = (x, z, ry, c = '#d62828', k = 'a') => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; kit.root.add(g);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.85), assets.mat('osaka-vendbody' + c, { color: c, roughness: 0.4 })); body.position.y = 0.95; body.castShadow = true; body.userData.collide = true; g.add(body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7), new THREE.MeshBasicMaterial({ map: vendTex(k + c, c), color: new THREE.Color(1.25, 1.25, 1.25) })); face.position.set(0, 1.0, 0.43); face.userData.collide = false; g.add(face);
    kit.point([x + Math.sin(ry) * 0.9, 1.3, z + Math.cos(ry) * 0.9], 0xffffff, 1.6, 4);
  };
  vend(-24.4, -12, Math.PI / 2, '#d62828', 'a'); vend(-24.4, -11, Math.PI / 2, '#1d6fd6', 'b'); vend(24.4, 12, -Math.PI / 2, '#e8c020', 'c'); vend(24.4, 13, -Math.PI / 2, '#d62828', 'd'); vend(-6, -4.5, 0, '#2a9d4a', 'e'); vend(6, 4.5, Math.PI, '#1d6fd6', 'f');
  const bike = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; kit.root.add(g);
    const bm = assets.mat('osaka-bike', { color: 0x3a6a9a, roughness: 0.4, metalness: 0.5 }); const tm = assets.mat('osaka-tyre', { color: 0x111111, roughness: 0.8 });
    for (const sx of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 20), tm); w.position.set(sx, 0.36, 0); w.rotation.y = Math.PI / 2; g.add(w); }
    const fr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.05), bm); fr.position.set(0, 0.62, 0); fr.rotation.z = 0.2; g.add(fr);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), bm); bar.position.set(0.52, 0.95, 0); g.add(bar);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.34), assets.mat('osaka-basket', { color: 0xc8c8c8, metalness: 0.6, roughness: 0.4 })); bk.position.set(0.62, 0.9, 0); g.add(bk);
    kit.collider(1.4, 1.0, 0.35, [x, 0.5, z], ry);
  };
  [[-14, -4.4, 0.1], [-13, -4.6, -0.1], [15, 4.4, 3.2], [-20, 15, 1.2], [8, -15, 0.4], [-8, 17, 1.8], [22, -17, 0.6], [1.8, -9, 1.57]].forEach(([x, z, r]) => bike(x, z, r));
  const neko = (x, z, ry) => {
    kit.sphere(0.36, white, { pos: [x, 0.5, z], scale: [1, 1.15, 0.9], segments: 14 }); kit.sphere(0.27, white, { pos: [x, 1.0, z], segments: 14 });
    for (const sx of [-1, 1]) { kit.cyl(0.001, 0.2, white, { pos: [x + sx * 0.17, 1.28, z], radiusTop: 0.001, segments: 6, collide: false }); }
    const arm = kit.cyl(0.07, 0.4, white, { pos: [x + 0.32, 0.9, z], collide: false, segments: 8 }); arm.rotation.z = -0.4;
    kit.sphere(0.07, red, { pos: [x, 0.78, z + 0.3], collide: false, segments: 6 }); kit.cyl(0.4, 0.12, gold, { pos: [x, 0.06, z], segments: 14 });
  };
  neko(-4.6, -3.6); neko(4.6, 3.6); neko(-23, 3);

  // ---- props
  const L = [
    ['street_lamp_01', -10, 0, 12.6, 0], ['fire_hydrant', 24.3, 0, -6, 0], ['metal_trash_can', -23.8, 0, 18, 0], ['metal_trash_can', 23.8, 0, -18, 0], ['metal_trash_can', 4.8, 0, -17, 0], ['propane_tank', -22, 0, -19.4, 0], ['propane_tank', -21.4, 0, -19.4, 0],
    ['wine_barrel_01', -18, 0, -19.2, 0], ['wine_barrel_01', -17, 0, -19.3, 0], ['wooden_crate_01', 18, 0, -19, 0.2], ['wooden_crate_01', 19.2, 0, -19, 0.5], ['plastic_crate_01', 10, 0, 19.2, 0], ['plastic_crate_02', 11, 0, 19.2, 0.2], ['cardboard_box_01', 14, 0, 19, 0.3], ['cardboard_box_01', -15, 0, 19, 0.6],
    ['modular_street_seating', 12, 0, 3.8, 0], ['modular_street_seating', -12, 0, -3.8, 3.14], ['painted_wooden_bench', -4, 0, 4.4, 3.14], ['CoffeeCart_01', -8, 0, 0.5, 1.57], ['CoffeeCart_01', 9, 0, -0.5, -1.57], ['WetFloorSign_01', 0, 0, 2, 0.3],
    ['standing_chalkboard_01', -17, 0, -4.5, 0.2], ['standing_chalkboard_01', 14, 0, 4.5, 3.4], ['industrial_wall_lamp', -24.6, 3, -16, 1.57, { collide: false }], ['industrial_wall_lamp', 24.6, 3, 16, -1.57, { collide: false }], ['Lantern_01', 0, 0, -1.5, 0, { collide: false }],
    ['potted_plant_04', -2.2, 0, -5.4, 0], ['potted_plant_04', 2.2, 0, 5.4, 0], ['old_tyre', -3, 0, -18, 0.4], ['trashbag', 16, 0, 19, 0], ['trashbag', 16.8, 0, 19.1, 1], ['compost_bags', -4, 0, 19, 0], ['korean_fire_extinguisher_01', -24.5, 1.2, 8, 1.57, { collide: false }],
  ];
  // shop interior stock
  for (const s of shops) {
    const cx = (s.x0 + s.x1) / 2, mid = (s.front + s.back) / 2;
    L.push(['Shelf_01', cx, 0, s.back - Math.sign(s.back) * 0.5, s.side < 0 ? 0 : Math.PI], ['WoodenChair_01', cx - 1.2, 0, mid, 0.4], ['WoodenTable_01', cx + 1.2, 0, mid + s.side * 0.6, 0], ['wooden_crate_01', s.x1 - 0.9, 0, s.back - Math.sign(s.back) * 0.9, 0.2]);
  }
  await props(kit, L);

  // ---- gameplay
  for (let i = 0; i < 7; i++) kit.hider(-18 + i * 6, 0.05, (i % 2 ? 2.4 : -2.4));
  for (let i = 0; i < 4; i++) kit.hider(-18 + i * 12, 0.05, -17);
  for (let i = 0; i < 4; i++) kit.hider(-18 + i * 12, 0.05, 17);
  kit.hider(0, 0.05, -9); kit.hider(0, 0.05, 9);
  for (let i = 0; i < 5; i++) kit.seeker(-23.6, 0.05, -3 + i * 1.5);
  for (const s of shops) { roomSpots(kit, s.x0 + 0.6, s.zA + 0.6, s.x1 - 0.6, s.zB - 0.6, 3, [0.5, 1.0, 1.6], 3); floorSpots(kit, s.x0 + 1, s.zA + 1, s.x1 - 1, s.zB - 1, 2, 0.3, 5); }
  wallSpots(kit, -24.6, -4.6, 24.6, -4.6, 0, 1, 18, [0.5, 1.0, 1.6, 2.2], { seed: 31 });
  wallSpots(kit, -24.6, 4.6, 24.6, 4.6, 0, -1, 18, [0.5, 1.0, 1.6, 2.2], { seed: 32 });
  wallSpots(kit, -24.6, -19.6, 24.6, -19.6, 0, 1, 10, [0.5, 1.0, 1.6], { seed: 33 });
  wallSpots(kit, -24.6, 19.6, 24.6, 19.6, 0, -1, 10, [0.5, 1.0, 1.6], { seed: 34 });
  wallSpots(kit, -24.6, -19.6, -24.6, 19.6, 1, 0, 8, [0.5, 1.0, 1.6], { seed: 35 });
  wallSpots(kit, 24.6, -19.6, 24.6, 19.6, -1, 0, 8, [0.5, 1.0, 1.6], { seed: 36 });
  wallSpots(kit, -2.2, -12.8, -2.2, -5.2, 1, 0, 3, [0.5, 1.0, 1.6], { seed: 37 }); wallSpots(kit, 2.2, -12.8, 2.2, -5.2, -1, 0, 3, [0.5, 1.0, 1.6], { seed: 38 });
  wallSpots(kit, -2.2, 5.2, -2.2, 12.8, 1, 0, 3, [0.5, 1.0, 1.6], { seed: 39 }); wallSpots(kit, 2.2, 5.2, 2.2, 12.8, -1, 0, 3, [0.5, 1.0, 1.6], { seed: 40 });
  floorSpots(kit, -23, -4, 23, 4, 8, 0.3, 12); floorSpots(kit, -23, -19, 23, -14, 5, 0.3, 13); floorSpots(kit, -23, 14, 23, 19, 5, 0.3, 14);

  return kit.data({
    titleCam: { center: new THREE.Vector3(0, 2.2, 0), radius: 14, height: 3.0 },
    environment: {
      exposure: 1.25, envIntensity: 0.55, background: new THREE.Color(0x080a18), probe: [0, 2.5, 0],
      fog: new THREE.FogExp2(0x1a1830, 0.012),
      bloom: { strength: 0.65, radius: 0.7, threshold: 0.85 }, ao: { aoRadius: 1.2, intensity: 2.2, distanceFalloff: 0.8 },
    },
    seekerWait: { pos: new THREE.Vector3(-23.6, 1.6, 0), look: new THREE.Vector3(0, 1.8, 0) },
  });
}
