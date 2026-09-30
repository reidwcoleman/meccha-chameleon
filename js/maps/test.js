// Tiny test room used by the harness and by agents before the real maps exist.
import * as THREE from 'three';

export async function build({ kit, assets }) {
  const checker = assets.canvasMaterial('test-checker', 256, 256, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#1a1a1a' : '#eeeeee'; g.fillRect(x * w / 2, y * h / 2, w / 2, h / 2); }
  }, { roughness: 0.25 });
  const wall = assets.canvasMaterial('test-wall', 256, 256, (g, w, h) => {
    g.fillStyle = '#7b1e22'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4a0f12'; g.lineWidth = 6;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); }
  });
  const ceil = assets.mat('test-ceil', { color: 0xd8d0c0, roughness: 0.9 });
  kit.room({ x0: -8, z0: -8, x1: 8, z1: 8, h: 4, floor: checker, wall, ceiling: ceil, floorUV: 2, doors: { n: [{ a: 7, b: 9 }] } });
  kit.box(2, 1, 1, assets.mat('test-green', { color: 0x2f8a3a, roughness: 0.6 }), { pos: [3, 0.5, 2] });
  kit.cyl(0.35, 4, assets.mat('test-pillar', { color: 0xe8dcc0, roughness: 0.5 }), { pos: [-3, 2, -3] });
  kit.stairs(-6, 0, 4, 3, 1.5, 2, '+x', assets.mat('test-wood', { color: 0x6b3f22, roughness: 0.7 }));
  kit.boxAB(-3, 0, 3, 0, 1.5, 5, assets.mat('test-wood', { color: 0x6b3f22, roughness: 0.7 }));
  kit.point([0, 3.5, 0], 0xffe6c0, 25, 16, { shadow: true });
  kit.bulb([0, 3.6, 0]);
  kit.hemi(0xfff4e0, 0x302018, 0.5);
  for (let i = 0; i < 10; i++) kit.hider(-4 + i, 0, 0);
  kit.seeker(0, 0, 6); kit.seeker(1, 0, 6);
  kit.hideSpot(7.7, 1.2, 0, -1, 0, 0, 'wall');
  kit.hideSpot(3, 1, 2, 0, 1, 0, 'floor');
  return kit.data({
    environment: { exposure: 1.0, envIntensity: 1.0, background: new THREE.Color(0x101010), probe: [0, 1.5, 0] },
    seekerWait: { pos: new THREE.Vector3(0, 1.6, 6), look: new THREE.Vector3(0, 1.6, 0) },
  });
}
