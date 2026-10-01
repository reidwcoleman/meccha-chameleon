// The lobby hub: bright glossy atrium, giant paint blobs, applicant circle, credits chalkboard, map board.
import * as THREE from 'three';
import { rng, props, wallSpots, floorSpots, cornerSpots, decal, poster, noise, roomSpots } from './gen.js';

const MAP_LABEL = { random: 'Random', mansion: 'Hide-and-Seek Mansion', sewer: 'Sewer', backrooms: 'Backrooms', country: 'Indoor Country', hotel: 'Penguin Hotel', sugar: 'Sugar Land', osaka: 'Osaka' };
const X0 = -17, X1 = 17, Z0 = -15, Z1 = 15, H = 6.5;

export async function build({ kit, assets, THREE: T }) {
  const R = rng(11);
  const marble = assets.canvasMaterial('lobby-marble', 512, 512, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#15151a' : '#f1efe9'; g.fillRect(x * w / 2, y * h / 2, w / 2, h / 2);
    }
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(${r() > 0.5 ? '120,120,130' : '255,255,255'},${0.06 + r() * 0.1})`; g.lineWidth = 1 + r() * 2;
      g.beginPath(); let px = r() * w, py = r() * h; g.moveTo(px, py);
      for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 120; py += (r() - 0.5) * 120; g.lineTo(px, py); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  }, { roughness: 0.16, metalness: 0.0 }, [0.25, 0.25]);
  marble.map.anisotropy = 8;
  const wallMat = assets.canvasMaterial('lobby-wall', 256, 256, (g, w, h) => {
    g.fillStyle = '#f6f2ea'; g.fillRect(0, 0, w, h); noise(g, w, h, 10, 0.4, 4);
  }, { roughness: 0.85 });
  const wainscot = assets.mat('lobby-wainscot', { color: 0x2c2f4a, roughness: 0.35 });
  const ceilMat = assets.mat('lobby-ceil', { color: 0xf4f1ea, roughness: 0.9 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(1.6) });

  // shell: floor, walls, ceiling
  kit.floor(X0, Z0, X1, Z1, 0, marble, { uv: 4 });
  kit.ceiling(X0, Z0, X1, Z1, H, ceilMat);
  const t = 0.3;
  kit.wall(X0, Z0, X1, Z0, 0, H, wallMat, { t, uv: 2 });
  kit.wall(X0, Z1, X1, Z1, 0, H, wallMat, { t, uv: 2 });
  kit.wall(X0, Z0, X0, Z1, 0, H, wallMat, { t, uv: 2 });
  kit.wall(X1, Z0, X1, Z1, 0, H, wallMat, { t, uv: 2 });
  // wainscot band
  for (const [ax, az, bx, bz, nx, nz] of [[X0, Z0, X1, Z0, 0, 1], [X0, Z1, X1, Z1, 0, -1], [X0, Z0, X0, Z1, 1, 0], [X1, Z0, X1, Z1, -1, 0]]) {
    const cx = (ax + bx) / 2 + nx * (t / 2 + 0.03), cz = (az + bz) / 2 + nz * (t / 2 + 0.03);
    kit.box(nx ? 0.06 : Math.abs(bx - ax), 1.0, nz ? 0.06 : Math.abs(bz - az), wainscot, { pos: [cx, 0.5, cz] });
    kit.box(nx ? 0.1 : Math.abs(bx - ax), 0.07, nz ? 0.1 : Math.abs(bz - az), assets.mat('lobby-trim', { color: 0xffffff, roughness: 0.3 }), { pos: [cx, 1.03, cz] });
  }

  // ceiling light panels
  for (let ix = -3; ix <= 3; ix++) for (let iz = -2; iz <= 2; iz++) {
    kit.box(2.4, 0.06, 2.4, glow, { pos: [ix * 4.6, H - 0.04, iz * 5.6], collide: false, cast: false, receive: false });
  }
  kit.point([0, H - 1.2, 0], 0xfff2dd, 55, 44, { shadow: true, shadowSize: 2048 });
  for (const [x, z] of [[-10, -8], [10, -8], [-10, 8], [10, 8]]) kit.point([x, H - 1.5, z], 0xfff0dc, 14, 24);
  kit.hemi(0xfff6ee, 0xb9b3c8, 0.3);

  // columns
  const colMat = assets.mat('lobby-column', { color: 0xfbf8f2, roughness: 0.25 });
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
    kit.cyl(0.7, H, colMat, { pos: [x, H / 2, z] });
    kit.cyl(0.9, 0.3, colMat, { pos: [x, 0.15, z] });
    kit.cyl(0.9, 0.3, colMat, { pos: [x, H - 0.15, z] });
  }

  // giant glossy paint blobs
  const blobs = [
    [0xe8344d, -12, -9, 2.4, 0.9], [0x2d86f0, 13, -10, 2.0, 1.0], [0xffc61f, -12.5, 5, 1.8, 0.8], [0x35c76a, 3, -11, 1.5, 1.1],
    [0xb04df0, 14, 11, 1.7, 0.9], [0xff7a1c, -4, 11, 1.3, 1.0], [0x20d4d0, 0, 3, 1.1, 0.8],
  ];
  for (const [c, x, z, r, sq] of blobs) {
    const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 });
    const body = kit.sphere(r, m, { pos: [x, r * sq * 0.78, z], scale: [1, sq, 1], segments: 36 });
    // satellite lumps make the silhouette irregular
    for (let i = 0; i < 4; i++) {
      const a = R() * 6.28, rr = r * (0.35 + R() * 0.3);
      kit.sphere(rr, m, { pos: [x + Math.cos(a) * r * 0.85, rr * 0.55, z + Math.sin(a) * r * 0.85], scale: [1, 0.6, 1], segments: 24 });
    }
    // floor puddle
    const p = assets.canvasMaterial(`lobby-puddle-${c}`, 256, 256, (g, w, h) => {
      g.fillStyle = '#' + c.toString(16).padStart(6, '0');
      g.beginPath();
      for (let k = 0; k <= 36; k++) { const a = (k / 36) * 6.28, rad = 0.62 + 0.28 * Math.sin(a * 3 + c) * Math.cos(a * 5) + R() * 0.06; const px = w / 2 + Math.cos(a) * rad * w / 2, py = h / 2 + Math.sin(a) * rad * h / 2; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.fill();
    }, { roughness: 0.1, metalness: 0 });
    decal(kit, p, r * 3.4, r * 3.4, x, 0.012, z, R() * 6);
    kit.hideSpot(x + r + 0.6, 0.45, z, 1, 0, 0, 'wall');
    kit.hideSpot(x - r - 0.6, 0.45, z, -1, 0, 0, 'wall');
  }
  // splashes on the walls
  for (let i = 0; i < 9; i++) {
    const c = [0xe8344d, 0x2d86f0, 0xffc61f, 0x35c76a, 0xb04df0, 0xff7a1c][i % 6];
    const sm = assets.canvasMaterial(`lobby-splat-${i}`, 256, 256, (g, w, h) => {
      g.fillStyle = '#' + c.toString(16).padStart(6, '0');
      g.beginPath(); for (let k = 0; k <= 40; k++) { const a = (k / 40) * 6.28, rad = 0.3 + 0.2 * Math.sin(a * 4 + i) + R() * 0.15; const px = w / 2 + Math.cos(a) * rad * w, py = h / 2 + Math.sin(a) * rad * h; k ? g.lineTo(px, py) : g.moveTo(px, py); } g.fill();
      for (let k = 0; k < 12; k++) { g.beginPath(); g.arc(R() * w, R() * h, 3 + R() * 9, 0, 6.28); g.fill(); }
    }, { roughness: 0.2 });
    const s = 2.2 + R() * 1.6;
    if (i < 3) poster(kit, sm, s, s, X0 + t / 2 + 0.05, 2.8 + R(), -10 + i * 9, Math.PI / 2);
    else if (i < 6) poster(kit, sm, s, s, X1 - t / 2 - 0.05, 2.8 + R(), -10 + (i - 3) * 9, -Math.PI / 2);
    else poster(kit, sm, s, s, -10 + (i - 6) * 10, 3 + R(), Z1 - t / 2 - 0.05, Math.PI);
  }

  // applicant circle
  const zone = { x: 10.5, z: 5.5, r: 3.4 };
  const zoneMat = assets.canvasMaterial('lobby-zone', 512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(232,52,77,0.55)'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, 6.28); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 12, 0, 6.28); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 40px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
    g.fillText('Hunter applicants', w / 2, h / 2 - 8); g.fillText('should stand here', w / 2, h / 2 + 40);
  }, { roughness: 0.3 });
  decal(kit, zoneMat, zone.r * 2, zone.r * 2, zone.x, 0.02, zone.z);

  // chalkboard of credits (north wall)
  const board = assets.canvasMaterial('lobby-chalk', 1024, 512, (g, w, h) => {
    g.fillStyle = '#1d3b2d'; g.fillRect(0, 0, w, h); noise(g, w, h, 20, 0.4, 9);
    g.strokeStyle = '#8a5a2b'; g.lineWidth = 18; g.strokeRect(9, 9, w - 18, h - 18);
    g.fillStyle = '#f3f0e6'; g.textAlign = 'left'; g.font = '700 46px "M PLUS Rounded 1c", sans-serif';
    g.fillText('MECCHA CHAMELEON', 70, 90);
    g.font = '500 34px "M PLUS Rounded 1c", sans-serif';
    ['[Planning]', '[BGM]', '[3D Model]', '[Level Design]', '[UI]', '[System]', '[Effects]', '[Optimization]'].forEach((s, i) => {
      g.fillText(s, 70 + (i % 2) * 450, 170 + ((i / 2) | 0) * 70);
    });
  }, { roughness: 0.95 });
  poster(kit, board, 8, 4, -8, 3.1, Z0 + t / 2 + 0.03, 0);

  // map preview board (east wall), updatable
  const mapTex = assets.canvasTexture('lobby-mapboard', 1024, 576, () => {});
  const mapMat = new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.4, emissive: 0xffffff, emissiveMap: mapTex, emissiveIntensity: 0.35 });
  const drawBoard = (id) => {
    const g = mapTex.image.getContext('2d'), w = 1024, h = 576;
    const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, '#26304f'); grad.addColorStop(1, '#101424');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#6cf06a'; g.fillRect(0, 0, w, 14);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '500 40px "M PLUS Rounded 1c", sans-serif'; g.fillText('MAP', w / 2, 100);
    g.font = '800 72px "M PLUS Rounded 1c", sans-serif';
    g.fillText(MAP_LABEL[id] || 'Random', w / 2, 270);
    g.font = '500 34px "M PLUS Rounded 1c", sans-serif'; g.fillStyle = '#9aa4c8';
    g.fillText('Press ENTER to configure', w / 2, 460);
    mapTex.needsUpdate = true;
  };
  drawBoard('mansion');
  const pb = kit.box(7, 4, 0.2, mapMat, { pos: [X1 - 0.45, 3.2, -3], rot: [0, -Math.PI / 2, 0], collide: false, merge: false });
  kit.box(7.4, 4.4, 0.12, assets.mat('lobby-frame', { color: 0x1c1c22, roughness: 0.4 }), { pos: [X1 - 0.35, 3.2, -3], rot: [0, -Math.PI / 2, 0], collide: false });

  // props
  await props(kit, [
    ['Sofa_01', -14, 0, 0, Math.PI / 2], ['sofa_02', -14, 0, -3.6, Math.PI / 2], ['CoffeeTable_01', -11.2, 0, -1.8, 0],
    ['potted_plant_04', -15.8, 0, -13.4, 0, { fitHeight: 1.6 }], ['potted_plant_04', 15.8, 0, 13.4, 0, { fitHeight: 1.6 }], ['potted_plant_04', 15.8, 0, -13.4, 0, { fitHeight: 1.6 }],
    ['marble_bust_01', 0, 0, -13.2, 0, { fitHeight: 1.5 }], ['Ottoman_01', 6, 0, 10, 0.4], ['Ottoman_01', 7.5, 0, 11.2, 1], ['rubber_duck_toy', 0.6, 0.0, 3.4, 0.7, { fitHeight: 0.5 }],
    ['strawberry_chocolate_cake', 5.2, 0.9, -12.9, 0, { fitHeight: 0.4, collide: false }],
    ['round_wooden_table_01', 5.2, 0, -12.9, 0, { fitHeight: 0.9 }],
    ['ornate_mirror_01', -16.7, 2.2, 8, Math.PI / 2, { fitHeight: 2.2, collide: false }],
    ['ArmChair_01', 12, 0, -2.5, -0.8], ['GreenChair_01', 8.5, 0, -6, 2.8],
  ]);

  // spawns
  for (let i = 0; i < 16; i++) kit.hider(-13 + (i % 8) * 3.6 + R(), 0.05, 12.5 - ((i / 8) | 0) * 3 - R());
  kit.hider(-3, 0.05, 11);kit.hider(-5, 0.05, 9);
  for (const [x, z] of [[-4, -10], [-2, -10], [0, -10], [2, -10], [4, -10]]) kit.seeker(x, 0.05, z);
  // spots (used if bots ever hide here)
  roomSpots(kit, X0 + 0.3, Z0 + 0.3, X1 - 0.3, Z1 - 0.3, 8, [0.6, 1.2, 1.8], 21);
  cornerSpots(kit, X0 + 0.3, Z0 + 0.3, X1 - 0.3, Z1 - 0.3);
  floorSpots(kit, -12, -8, 12, 8, 14, 0.3, 4);

  return kit.data({
    zone,
    titleCam: { center: new THREE.Vector3(0, 1.3, 0), radius: 10.5, height: 3.1 },
    setMapName: drawBoard,
    environment: {
      exposure: 0.85, envIntensity: 0.45, background: new THREE.Color(0xf4f1ea), probe: [0, 2.2, 0],
      bloom: { strength: 0.22, radius: 0.5, threshold: 0.95 }, ao: { aoRadius: 1.4, intensity: 2.2, distanceFalloff: 0.8 },
    },
    seekerWait: { pos: new THREE.Vector3(0, 1.6, -10), look: new THREE.Vector3(0, 1.6, 0) },
  });
}
