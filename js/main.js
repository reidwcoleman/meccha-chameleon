// Boot. URL params (SPEC.md §Debug):
//   ?q=low|medium|high           render quality
//   ?view=map&map=<id>           map inspection: fly camera (WASD/QE, drag to look), no game
//        &cam=x,y,z&look=x,y,z   initial camera for view=map (harness screenshots)
//   anything else                starts the real game (js/game/app.js)
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { input } from './core/input.js';
import { assets } from './core/assets.js';

const params = new URLSearchParams(location.search);
const engine = new Engine(document.getElementById('app'), {
  quality: params.get('q') || 'high',
  preserveDrawingBuffer: params.has('harness'),
});
input.attach(engine.renderer.domElement);
engine.onUpdate(() => input.endFrame(), 1000);

const mc = (window.__mc = { THREE, engine, input, assets, params, ready: false });

const vec = (s) => (s ? new THREE.Vector3(...s.split(',').map(Number)) : null);

async function viewMap() {
  const map = await engine.loadMap(params.get('map') || 'test');
  mc.map = map;
  const cam = engine.camera;
  const p = vec(params.get('cam')) || (map.spawns?.hider?.[0]?.clone().add(new THREE.Vector3(0, 1.6, 0))) || new THREE.Vector3(0, 1.6, 4);
  cam.position.copy(p);
  const look = vec(params.get('look'));
  if (look) cam.lookAt(look);
  const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
  let yaw = e.y, pitch = e.x;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  engine.onUpdate((dt) => {
    if (input.button(0) || input.button(2) || input.locked) { yaw -= input.mouse.dx * 0.003; pitch = Math.max(-1.55, Math.min(1.55, pitch - input.mouse.dy * 0.003)); }
    cam.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const sp = (input.shift() ? 12 : 4) * dt;
    cam.getWorldDirection(fwd); right.crossVectors(fwd, cam.up).normalize();
    if (input.down('KeyW')) cam.position.addScaledVector(fwd, sp);
    if (input.down('KeyS')) cam.position.addScaledVector(fwd, -sp);
    if (input.down('KeyD')) cam.position.addScaledVector(right, sp);
    if (input.down('KeyA')) cam.position.addScaledVector(right, -sp);
    if (input.down('KeyE')) cam.position.y += sp;
    if (input.down('KeyQ')) cam.position.y -= sp;
  });
  mc.ready = true;
}

async function game() {
  const app = await import('./game/app.js');
  await app.start(mc);
  mc.ready = true;
}

async function viewChar() {
  const map = await engine.loadMap(params.get('map') || 'test');
  mc.map = map;
  const { Mannequin, POSES } = await import('./char/mannequin.js');
  mc.POSES = POSES; mc.Mannequin = Mannequin;
  const list = [null, ...POSES.map((p) => p.id)];
  mc.mans = list.map((id, i) => {
    const m = new Mannequin({ engine, name: 'm' + i, isLocal: i === 0 });
    m.root.position.set(-4 + i * 1.0, 0, -5);
    engine.scene.add(m.root);
    m.setPose(id);
    return m;
  });
  const cam = engine.camera;
  cam.position.copy(vec(params.get('cam')) || new THREE.Vector3(0, 1.2, 5));
  cam.lookAt(vec(params.get('look')) || new THREE.Vector3(0, 0.7, 0));
  engine.onUpdate((dt) => { for (const m of mc.mans) m.update(dt); });
  mc.ready = true;
}

(params.get('view') === 'map' ? viewMap() : params.get('view') === 'char' ? viewChar() : game()).catch((err) => {
  console.error(err);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;left:12px;bottom:12px;color:#f66;font:12px monospace;z-index:99;white-space:pre-wrap;max-width:90vw';
  d.textContent = String(err?.stack || err);
  document.body.appendChild(d);
  mc.error = String(err?.stack || err);
});
