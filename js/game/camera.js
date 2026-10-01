// Camera rigs: third-person orbit (collision-aware), first-person (bob / recoil / landing dip), free camera.
// All rigs write into a THREE.PerspectiveCamera passed to update(). Owner: F.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _right = new THREE.Vector3(), _upv = new THREE.Vector3();

export const lookDir = (yaw, pitch, out = new THREE.Vector3()) =>
  out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** Third-person orbit around a target point. Never clips into walls (thick-ray test on the collision BVH). */
export class OrbitRig {
  constructor(physics) {
    this.physics = physics;
    this.yaw = Math.PI;         // camera looks toward -Z when yaw=0; start behind a +Z-facing body
    this.pitch = -0.28;
    this.dist = 3.4;            // wanted distance
    this.minDist = 0.6;
    this.maxDist = 7;
    this.cur = 3.4;             // collision-limited, smoothed distance
    this.target = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._init = false;
    this.pitchMin = -1.35;
    this.pitchMax = 1.25;
    this.shoulder = 0;          // lateral offset (m)
  }

  addLook(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, this.pitchMin, this.pitchMax);
  }

  zoom(steps, factor = 1.12) { this.dist = THREE.MathUtils.clamp(this.dist * Math.pow(factor, steps), this.minDist, this.maxDist); }

  snap(target) { this._t.copy(target); this.cur = this.dist; this._init = true; }

  update(dt, camera, target) {
    if (!this._init) this.snap(target);
    // soften the follow a little (step-ups, crouch) — but keep horizontal tracking tight
    this._t.x = damp(this._t.x, target.x, 30, dt);
    this._t.z = damp(this._t.z, target.z, 30, dt);
    this._t.y = damp(this._t.y, target.y, 16, dt);
    if (this._t.distanceToSquared(target) > 4) this._t.copy(target);
    const fwd = lookDir(this.yaw, this.pitch, _v);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivot = _v3.copy(this._t).addScaledVector(_right, this.shoulder);
    // thick ray: centre + 4 offsets
    let free = this.dist;
    const back = _v2.copy(fwd).negate();
    _upv.crossVectors(_right, fwd).normalize();
    const offs = [[0, 0], [0.16, 0], [-0.16, 0], [0, 0.12], [0, -0.12]];
    for (const [ox, oy] of offs) {
      const o = _v.copy(pivot).addScaledVector(_right, ox * 0.6).addScaledVector(_upv, oy * 0.6);
      const h = this.physics?.raycast(o, back, this.dist + 0.3, { collision: true, ignoreActors: true });
      if (h) free = Math.min(free, h.distance - 0.22);
    }
    free = Math.max(0.25, free);
    // pull in instantly, ease back out
    this.cur = free < this.cur ? free : damp(this.cur, free, 4, dt);
    lookDir(this.yaw, this.pitch, fwd);
    camera.position.copy(pivot).addScaledVector(fwd, -this.cur);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(_e);
  }
}

/** First-person head camera with head-bob, landing dip, recoil springs and aim zoom. */
export class FirstPersonRig {
  constructor() {
    this.yaw = 0;
    this.pitch = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.dip = 0; this.dipV = 0;
    this.kick = 0; this.kickV = 0;      // recoil pitch spring
    this.kickYaw = 0; this.kickYawV = 0;
    this.roll = 0;
    this.eyeY = null;
    this.baseFov = 72;
    this.fov = 72;
  }

  addLook(dx, dy) {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.5, 1.5);
  }

  recoil(strength = 1) {
    this.kickV += 5.2 * strength;
    this.kickYawV += (Math.random() - 0.5) * 1.6 * strength;
  }

  land(speed) { this.dipV -= Math.min(speed, 14) * 0.09; }

  update(dt, camera, eye, { speed = 0, grounded = true, aim = false, strafe = 0 } = {}) {
    // smooth eye height (crouch/step) separately from horizontal position
    if (this.eyeY == null || Math.abs(this.eyeY - eye.y) > 1.5) this.eyeY = eye.y;
    this.eyeY = damp(this.eyeY, eye.y, 18, dt);
    // head bob
    const moving = grounded ? Math.min(speed / 4.2, 1.2) : 0;
    this.bobAmp = damp(this.bobAmp, moving, 8, dt);
    this.bobPhase += dt * (5.2 + speed * 1.15);
    const by = Math.abs(Math.sin(this.bobPhase)) * 0.034 * this.bobAmp - 0.017 * this.bobAmp;
    const bx = Math.cos(this.bobPhase) * 0.018 * this.bobAmp;
    // springs: landing dip + recoil
    this.dipV += (-this.dip * 170 - this.dipV * 18) * dt; this.dip += this.dipV * dt;
    this.kickV += (-this.kick * 260 - this.kickV * 24) * dt; this.kick += this.kickV * dt;
    this.kickYawV += (-this.kickYaw * 260 - this.kickYawV * 24) * dt; this.kickYaw += this.kickYawV * dt;
    this.roll = damp(this.roll, -strafe * 0.012 + Math.cos(this.bobPhase) * 0.004 * this.bobAmp, 8, dt);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    camera.position.set(eye.x, this.eyeY + by + this.dip, eye.z).addScaledVector(_right, bx);
    _e.set(this.pitch + this.kick * 0.06, this.yaw + this.kickYaw * 0.03, this.roll, 'YXZ');
    camera.quaternion.setFromEuler(_e);
    const f = aim ? this.baseFov * 0.8 : this.baseFov;
    this.fov = damp(this.fov, f, 12, dt);
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    return { bob: by, bobX: bx };
  }
}

/** Free camera: fly with WASD / Space / Ctrl, wheel = speed, mouse look. */
export class FreeCamRig {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.speeds = [1, 2, 4, 7, 12, 20];
    this.speedIndex = 2;
  }
  get speed() { return this.speeds[this.speedIndex]; }
  from(camera) {
    this.pos.copy(camera.position);
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = _e.y; this.pitch = _e.x;
    this.vel.set(0, 0, 0);
  }
  addLook(dx, dy) { this.yaw -= dx; this.pitch = THREE.MathUtils.clamp(this.pitch - dy, -1.55, 1.55); }
  cycleSpeed() { this.speedIndex = (this.speedIndex + 1) % this.speeds.length; }
  wheel(steps) { this.speedIndex = THREE.MathUtils.clamp(this.speedIndex - Math.sign(steps), 0, this.speeds.length - 1); }

  update(dt, camera, move /* {x: right, y: up, z: forward} */) {
    const f = lookDir(this.yaw, this.pitch, _v);
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = _v2.set(0, 0, 0).addScaledVector(f, move.z).addScaledVector(_right, move.x);
    want.y += move.y;
    if (want.lengthSq() > 1) want.normalize();
    want.multiplyScalar(this.speed);
    this.vel.lerp(want, 1 - Math.exp(-10 * dt));
    this.pos.addScaledVector(this.vel, dt);
    camera.position.copy(this.pos);
    _e.set(this.pitch, this.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(_e);
  }
}
