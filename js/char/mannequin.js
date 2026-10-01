// The paintable white mannequin: shared skinned body, own skeleton + paint atlas, procedural animation
// (idle / walk / run / crouch / climb / air) and eight hand-authored poses. See SPEC.md section 8.
import * as THREE from 'three';
import { getBody, BONES, B, REST_DIR, HIT_CAPSULES } from './body.js';
import { PaintSurface } from './paint.js';

const D2R = Math.PI / 180;
const HIPS_Y = BONES[0][2].y;

export const POSES = [
  { id: 'star', name: 'Star' }, { id: 'ball', name: 'Crouch Ball' }, { id: 'armsup', name: 'Arms Up' },
  { id: 'tpose', name: 'T-Pose' }, { id: 'sit', name: 'Sit' }, { id: 'lie', name: 'Lie Flat' },
  { id: 'fetal', name: 'Fetal' }, { id: 'wallhug', name: 'Wall Hug' },
];

// ---------------------------------------------------------------- pose specs
// Euler degrees for hip/spine/chest/neck/head ([pitch(+lean forward), yaw, roll]); limb directions are
// unit-ish vectors [x,y,z] in the torso (arms) / hips (legs) frame, left side; the right side is mirrored.
const FOOT_REST = [0, -0.32, 0.95];
const POSE_SPECS = {
  star: {
    arm: { u: [0.78, 0.62, 0], l: [0.78, 0.62, 0] }, leg: { u: [0.5, -0.86, 0], l: [0.5, -0.86, 0] },
    head: [-8, 0, 0],
  },
  tpose: {
    arm: { u: [1, 0, 0], l: [1, 0, 0] }, leg: { u: [0.06, -1, 0], l: [0.04, -1, 0] },
  },
  armsup: {
    arm: { u: [0.2, 1, 0.04], l: [0.14, 1, 0.04] }, leg: { u: [0.07, -1, 0], l: [0.05, -1, 0] },
    head: [-6, 0, 0],
  },
  ball: {
    hip: [10, 0, 0], spine: [38, 0, 0], chest: [30, 0, 0], neck: [20, 0, 0], head: [16, 0, 0],
    arm: { u: [0.25, -0.55, 0.75], l: [0.12, -0.25, 0.96] },
    leg: { u: [0.14, 0.2, 0.97], l: [0.1, -0.98, -0.2], f: [0, -0.5, 0.86] },
  },
  sit: {
    hip: [0, 0, 0], spine: [6, 0, 0], head: [-4, 0, 0],
    arm: { u: [0.2, -0.82, 0.5], l: [0.1, -0.4, 0.9] },
    leg: { u: [0.16, 0.0, 1], l: [0.14, -0.12, 1], f: [0, 0.3, 0.95] },
  },
  lie: {
    hip: [-90, 0, 0], head: [-8, 0, 0],
    arm: { u: [0.2, -0.98, 0], l: [0.16, -1, 0] }, leg: { u: [0.1, -1, 0], l: [0.08, -1, 0] },
  },
  fetal: {
    hip: [8, 0, 90], spine: [34, 0, 0], chest: [28, 0, 0], neck: [18, 0, 0], head: [14, 0, 0],
    arm: { u: [0.3, -0.45, 0.8], l: [0.2, 0.3, 0.92] },
    leg: { u: [0.12, 0.1, 0.99], l: [0.08, -0.62, -0.78], f: [0, -0.6, 0.8] },
  },
  wallhug: {
    spine: [0, 0, 0], head: [-10, 0, 0],
    arm: { u: [0.92, -0.1, -0.35], l: [0.95, -0.12, -0.3] }, leg: { u: [0.1, -1, 0], l: [0.08, -1, 0], f: [0, -0.15, 1] },
  },
};

// ---------------------------------------------------------------- pose solver
const _E = new THREE.Euler(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3();
const euler = (arr, out) => (arr ? out.setFromEuler(_E.set(arr[0] * D2R, arr[1] * D2R, arr[2] * D2R, 'YXZ')) : out.identity());
function dirQ(bone, d, mirror, out) {
  _va.set(mirror ? -d[0] : d[0], d[1], d[2]).normalize();
  return out.setFromUnitVectors(REST_DIR[bone], _va);
}
const _qd0 = new THREE.Quaternion(), _qd1 = new THREE.Quaternion(), _qd2 = new THREE.Quaternion();
function limb(out, b0, u, l, h, mirror) {
  dirQ(b0, u, mirror, _qd0);
  dirQ(b0 + 1, l, mirror, _qd1);
  dirQ(b0 + 2, h, mirror, _qd2);
  out[b0].copy(_qd0);
  out[b0 + 1].copy(_qd0).invert().multiply(_qd1);
  out[b0 + 2].copy(_qd1).invert().multiply(_qd2);
}
function solve(spec, out) {
  euler(spec.hip, out[0]); euler(spec.spine, out[1]); euler(spec.chest, out[2]); euler(spec.neck, out[3]); euler(spec.head, out[4]);
  const a = spec.arm, aR = spec.armR || a, lg = spec.leg, lgR = spec.legR || lg, mir = !spec.armR, mirL = !spec.legR;
  limb(out, B.upperArm_L, a.u, a.l, a.h || a.l, false);
  limb(out, B.upperArm_R, aR.u, aR.l, aR.h || aR.l, mir);
  limb(out, B.upperLeg_L, lg.u, lg.l, lg.f || FOOT_REST, false);
  limb(out, B.upperLeg_R, lgR.u, lgR.l, lgR.f || FOOT_REST, mirL);
}

// forward kinematics (own matrices) for grounding + pose thumbnails
const _W = BONES.map(() => new THREE.Matrix4());
const _L = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _t = new THREE.Vector3();
function fk(q, gy) {
  for (let i = 0; i < BONES.length; i++) {
    const p = BONES[i][1];
    if (p < 0) _t.set(0, HIPS_Y + gy, 0); else _t.copy(BONES[i][2]).sub(BONES[p][2]);
    _L.compose(_t, q[i], _one);
    if (p < 0) _W[i].copy(_L); else _W[i].multiplyMatrices(_W[p], _L);
  }
}
const _p = new THREE.Vector3();
function lowest() {
  let m = Infinity;
  for (const [b, A, Bp, r] of HIT_CAPSULES) {
    const head = BONES[b][2];
    m = Math.min(m, _p.copy(A).sub(head).applyMatrix4(_W[b]).y - r, _p.copy(Bp).sub(head).applyMatrix4(_W[b]).y - r);
  }
  return m;
}
const _restQ = BONES.map(() => new THREE.Quaternion());
let _restLow = null;
const restLow = () => (_restLow ??= (fk(_restQ, 0), lowest()));
export function groundOffset(q) { fk(q, 0); return restLow() - lowest(); }

/** Capsules (rig space, feet at y=0) of a pose, for thumbnails. */
export function poseCapsules(id) {
  const q = BONES.map(() => new THREE.Quaternion());
  solve(POSE_SPECS[id] || {}, q);
  const gy = groundOffset(q);
  fk(q, gy);
  return HIT_CAPSULES.map(([b, A, Bp, r]) => {
    const head = BONES[b][2];
    return { a: A.clone().sub(head).applyMatrix4(_W[b]), b: Bp.clone().sub(head).applyMatrix4(_W[b]), r, bone: b };
  });
}

// ---------------------------------------------------------------- locomotion spec
const s3 = (x, y, z) => [x, y, z];
function locoSpec(st) {
  const { phase, amp, crouch, air, climb, t, breathe } = st;
  const sw = Math.sin(phase), sw2 = Math.sin(phase + Math.PI);
  const spec = { hip: s3(0, 0, 0), spine: s3(0, 0, 0), chest: s3(0, 0, 0), neck: s3(0, 0, 0), head: s3(0, 0, 0) };
  const lean = 4 + amp * 6 + crouch * 22;
  spec.spine = s3(lean * 0.5, Math.sin(phase) * amp * 5, 0);
  spec.chest = s3(lean * 0.5 + breathe, -Math.sin(phase) * amp * 7, 0);
  spec.head = s3(-lean * 0.7, 0, 0);
  const leg = (s) => {
    const phi = s > 0 ? phase : phase + Math.PI;
    const A = (amp * 34 * Math.sin(phi) + crouch * 52) * D2R;
    const K = (amp * 62 * Math.max(0, Math.cos(phi)) + crouch * 100 + 4) * D2R;
    const S = A - K;
    const th = Math.max(0, 0.325 - S * 0.5);
    return { u: s3(0.05, -Math.cos(A), Math.sin(A)), l: s3(0.04, -Math.cos(S), Math.sin(S)), f: s3(0, -Math.sin(th), Math.cos(th)) };
  };
  const arm = (s) => {
    const phi = s > 0 ? phase : phase + Math.PI;
    const a = -amp * 38 * Math.sin(phi) * D2R;
    const a2 = a + (22 + amp * 40) * D2R;
    const sway = Math.sin(t * 1.3 + (s > 0 ? 0 : 1.7)) * 0.03;
    return { u: s3(0.24 + sway, -Math.cos(a), Math.sin(a)), l: s3(0.2 + sway, -Math.cos(a2), Math.sin(a2)) };
  };
  if (climb) {
    const c = climb;
    const reach = (ph) => { const k = Math.sin(ph); return { u: s3(0.35, 0.7 + 0.25 * k, 0.45), l: s3(0.25, 0.75 + 0.2 * k, 0.5) }; };
    spec.hip = s3(6, 0, 0); spec.spine = s3(-6, 0, 0); spec.head = s3(-18, 0, 0);
    const la = reach(phase), ra = reach(phase + Math.PI);
    spec.arm = la; spec.armR = { u: s3(-ra.u[0], ra.u[1], ra.u[2]), l: s3(-ra.l[0], ra.l[1], ra.l[2]) };
    const lgA = { u: s3(0.35, -0.7 + 0.25 * Math.sin(phase + Math.PI), 0.55), l: s3(0.3, -0.85, -0.2), f: s3(0, -0.5, 0.85) };
    const lgB = { u: s3(0.35, -0.7 + 0.25 * Math.sin(phase), 0.55), l: s3(0.3, -0.85, -0.2), f: s3(0, -0.5, 0.85) };
    spec.leg = lgA; spec.legR = { u: s3(-lgB.u[0], lgB.u[1], lgB.u[2]), l: s3(-lgB.l[0], lgB.l[1], lgB.l[2]), f: lgB.f };
    void c;
    return spec;
  }
  if (air) {
    spec.arm = { u: s3(0.45, 0.8, 0.25), l: s3(0.5, 0.8, 0.35) };
    spec.leg = { u: s3(0.2, -0.9, 0.4), l: s3(0.15, -0.9, -0.15), f: s3(0, -0.5, 0.85) };
    spec.legR = { u: s3(-0.2, -0.95, -0.15), l: s3(-0.15, -0.8, -0.5), f: s3(0, -0.7, 0.7) };
    spec.chest = s3(8, 0, 0);
    return spec;
  }
  const lL = leg(1), lR = leg(-1), aL = arm(1), aR = arm(-1);
  spec.leg = lL; spec.legR = { u: s3(-lR.u[0], lR.u[1], lR.u[2]), l: s3(-lR.l[0], lR.l[1], lR.l[2]), f: lR.f };
  spec.arm = aL; spec.armR = { u: s3(-aR.u[0], aR.u[1], aR.u[2]), l: s3(-aR.l[0], aR.l[1], aR.l[2]) };
  void sw; void sw2;
  return spec;
}

// ---------------------------------------------------------------- the mannequin
const XRAY_MAT = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.5, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false });
const XRAY_HIDER = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthFunc: THREE.GreaterDepth, depthWrite: false, toneMapped: false });

export class Mannequin {
  constructor({ engine, name = '', isLocal = false, paintRes } = {}) {
    this.engine = engine; this.name = name; this.isLocal = isLocal;
    this.height = 1.25;
    this.root = new THREE.Group(); this.root.name = `mannequin:${name}`;
    const body = getBody();
    this.poseGroup = new THREE.Group(); this.root.add(this.poseGroup);
    const bones = BONES.map(([n]) => { const b = new THREE.Bone(); b.name = n; return b; });
    BONES.forEach(([, p, head], i) => {
      if (p < 0) { bones[i].position.copy(head); this.poseGroup.add(bones[i]); }
      else { bones[i].position.copy(head).sub(BONES[p][2]); bones[p].add(bones[i]); }
    });
    this.bones = bones;
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bones);

    const res = paintRes ?? (isLocal ? (engine?.qualityName === 'high' ? 2048 : 1024) : 512);
    this.paint = new PaintSurface(engine, this, { res });
    this.material = new THREE.MeshStandardMaterial({
      map: this.paint.texture, roughnessMap: this.paint.materialTexture, metalnessMap: this.paint.materialTexture,
      roughness: 1, metalness: 1, emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 0,
    });
    this.mesh = new THREE.SkinnedMesh(body.geometry, this.material);
    this.mesh.name = 'mannequin-body';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.mannequinBody = true;
    this.root.add(this.mesh);
    this.mesh.bind(this.skeleton, this.mesh.matrixWorld);
    this.bodyMeshes = [this.mesh];

    this.xray = new THREE.SkinnedMesh(body.geometry, XRAY_MAT);
    this.xray.frustumCulled = false; this.xray.visible = false; this.xray.renderOrder = 20; this.xray.userData.noProbe = true;
    this.root.add(this.xray);
    this.xray.bind(this.skeleton, this.mesh.matrixWorld);

    this.t = Math.random() * 10;
    this.phase = Math.random() * 6;
    this.loco = { speed: 0, grounded: true, crouch: false, climbing: false, airborne: false, surfaceNormal: null };
    this.moveAmt = 0; this.crouchAmt = 0; this.pose = null; this.poseYaw = 0; this.curYaw = 0;
    this.hit = 0; this.team = 'hider';
    this._tq = BONES.map(() => new THREE.Quaternion());
    this._gy = 0; this._curGy = 0;
    this.update(0.001, true);
  }

  setActorId(id) { this.actorId = id; this.mesh.userData.actorId = id; this.xray.userData.actorId = id; }
  setLocomotion(l) { Object.assign(this.loco, l); }
  setPose(id) { if (id !== this.pose) { this.pose = id || null; if (!id) this.poseYaw = 0; } }
  rotatePose(rad) { this.poseYaw += rad; }
  setShadow(on) { this.mesh.castShadow = !!on; }
  setXray(on, hider = false) { this.xray.visible = !!on; this.xray.material = hider ? XRAY_HIDER : XRAY_MAT; }
  setTeamLook(team) { this.team = team; }
  flashCaught() { this.hit = 1; }

  update(dt, snap = false) {
    const L = this.loco;
    this.t += dt;
    const speed = L.speed || 0;
    const moving = speed > 0.15 && L.grounded !== false;
    const targetAmp = L.climbing ? 1 : moving ? Math.min(1, 0.25 + speed / 4.5) : 0;
    this.moveAmt += (targetAmp - this.moveAmt) * (1 - Math.exp(-dt * 10));
    this.crouchAmt += ((L.crouch ? 1 : 0) - this.crouchAmt) * (1 - Math.exp(-dt * 12));
    this.phase += dt * (L.climbing ? 3.5 : 6.5 + speed * 1.3) * (this.moveAmt > 0.05 ? 1 : 0.0);
    let spec;
    if (this.pose && POSE_SPECS[this.pose]) spec = POSE_SPECS[this.pose];
    else {
      spec = locoSpec({
        phase: this.phase, amp: this.moveAmt, crouch: this.crouchAmt, air: L.airborne || L.grounded === false,
        climb: L.climbing ? 1 : 0, t: this.t, breathe: Math.sin(this.t * 1.9) * 1.2,
      });
    }
    solve(spec, this._tq);
    this._gy = groundOffset(this._tq);
    const k = snap ? 1 : 1 - Math.exp(-dt * (this.pose ? 9 : 22));
    for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.slerp(this._tq[i], k);
    this._curGy += (this._gy - this._curGy) * k;
    this.bones[0].position.y = HIPS_Y + this._curGy;
    this.curYaw += (this.poseYaw - this.curYaw) * (snap ? 1 : 1 - Math.exp(-dt * 14));
    this.poseGroup.rotation.y = this.curYaw;
    if (this.hit > 0) { this.hit = Math.max(0, this.hit - dt * 2.4); this.material.emissiveIntensity = this.hit * 1.4; }
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.paint.dispose();
    this.material.dispose();
  }
}
