// 3D eyedropper: albedo (texture texel x material colour) of the surface under a screen pixel.
import * as THREE from 'three';
import { assets } from '../core/assets.js';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const _n = new THREE.Vector3();

export function pickSurface(engine, clientX, clientY, { ignore = [], camera = engine.camera, far = 80 } = {}) {
  const el = engine.renderer.domElement;
  const r = el.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
  ray.setFromCamera(ndc, camera);
  ray.far = far;
  const hits = ray.intersectObject(engine.scene, true);
  const skip = new Set(ignore);
  for (const h of hits) {
    const o = h.object;
    if (!o.isMesh || !o.visible || skip.has(o) || o.userData.colliderOnly || o.userData.mannequinBody || o.userData.noProbe) continue;
    let p = o; let hidden = false;
    while (p) { if (!p.visible) { hidden = true; break; } p = p.parent; }
    if (hidden) continue;
    let mat = o.material;
    if (Array.isArray(mat)) mat = mat[h.face?.materialIndex ?? 0] || mat[0];
    if (!mat) continue;
    const color = assets.albedoAt(mat, h.uv);
    if (mat.vertexColors && h.face && o.geometry.attributes.color) {
      const c = o.geometry.attributes.color;
      color.multiply(new THREE.Color(c.getX(h.face.a), c.getY(h.face.a), c.getZ(h.face.a)));
    }
    const normal = h.face ? _n.copy(h.face.normal).transformDirection(o.matrixWorld).clone() : new THREE.Vector3(0, 1, 0);
    return { color, metallic: mat.metalness ?? 0, roughness: mat.roughness ?? 0.6, point: h.point.clone(), normal, object: o };
  }
  return null;
}
