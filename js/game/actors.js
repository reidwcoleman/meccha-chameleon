// An Actor = mannequin + character body + the per-round fields the Round (round.js) expects.
import * as THREE from 'three';
import { Mannequin } from '../char/mannequin.js';

let NEXT_ID = 1;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Actor {
  constructor({ engine, physics, name, isBot = true, isLocal = false, color = null }) {
    this.id = NEXT_ID++;
    this.name = name;
    this.isBot = isBot;
    this.isLocal = isLocal;
    this.applicant = true;
    this.forceRole = null;
    this.score = 0;
    this.likes = 0;
    this.engine = engine;
    this.physics = physics;
    this.mannequin = new Mannequin({ engine, name, isLocal, paintRes: isLocal ? undefined : 512 });
    this.mannequin.setActorId(this.id);
    engine.scene.add(this.mannequin.root);
    this.body = physics.createBody({ radius: 0.24, height: 1.25, crouchHeight: 0.78, id: this.id });
    this.facing = new THREE.Vector3(0, 0, 1);
    this.camo = 0;               // 0..1 how well the body blends in (bots read this)
    this.moved = 0;              // seconds since last significant movement
    this.hidden = false;         // hider has settled on a hiding spot
    this.eye = new THREE.Vector3();
    this.color = color;
    physics.addActor(this);
    this._last = new THREE.Vector3();
  }

  get pos() { return this.body.pos; }

  face(dir, dt = 1, rate = 14) {
    if (dir.lengthSq() < 1e-6) return;
    const f = this.facing;
    const k = dt >= 1 ? 1 : 1 - Math.exp(-rate * dt);
    f.x += (dir.x - f.x) * k; f.z += (dir.z - f.z) * k; f.y = 0;
    if (f.lengthSq() < 1e-6) f.copy(dir); f.normalize();
  }

  headPoint(out = this.eye) { return this.body.headTo(out, 0.15); }

  place(p, yaw = 0) {
    this.body.teleport(p);
    this.facing.set(Math.sin(yaw), 0, Math.cos(yaw));
    this._last.copy(this.body.pos);
    this.sync(0.001, true);
  }

  /** Copy body state onto the mannequin. Call once per frame after the body stepped. */
  sync(dt, snap = false) {
    const b = this.body, m = this.mannequin;
    b.visualTransform(m.root.position, m.root.quaternion, this.facing);
    m.setLocomotion({
      speed: b.speed, grounded: b.grounded || b.climbing, crouch: b.crouching, climbing: b.climbing,
      airborne: !b.grounded && !b.climbing, surfaceNormal: b.climbing ? b.surfNormal : null,
    });
    m.update(dt, snap);
    const moved = this._last.distanceToSquared(b.pos) > (0.02 * 0.02) || b.speed > 0.2;
    this.moved = moved ? 0 : this.moved + dt;
    this._last.copy(b.pos);
  }

  setTeamLook(team) { this.mannequin.setTeamLook(team); }

  dispose() {
    this.physics.removeActor?.(this);
    this.physics.removeBody?.(this.body);
    this.mannequin.dispose();
  }
}
