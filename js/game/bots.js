// AI for every non-player actor.
//  Hider bots: pick a hiding spot, walk (A*) there, climb walls, strike a pose and bake the surroundings onto
//  their body (PaintSurface.bakeCamo). Hunter bots: patrol every hiding spot, scan with a view cone, accumulate
//  suspicion per target (camo, distance, motion, line of sight) and shoot the shotgun once sure.
import * as THREE from 'three';
import { firePellets, ShotgunFX, buildThirdPersonGun } from './shotgun.js';
import { audio } from '../core/audio.js';

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

export const DIFF = {
  easy:   { rate: 0.30, range: 22, react: [0.9, 1.5], aim: 0.07, turn: 3.0, camoBake: 0.7, speed: 3.4 },
  normal: { rate: 0.55, range: 30, react: [0.5, 1.0], aim: 0.04, turn: 4.5, camoBake: 0.9, speed: 4.0 },
  hard:   { rate: 0.95, range: 40, react: [0.25, 0.6], aim: 0.02, turn: 7.0, camoBake: 1.0, speed: 4.4 },
};

const FLOOR_POSES = ['ball', 'fetal', 'lie', 'sit', 'armsup', 'tpose'];

export class Brain {
  constructor(bots, actor, diff) {
    this.bots = bots; this.app = bots.app; this.actor = actor;
    this.d = DIFF[diff] || DIFF.normal;
    this.state = 'idle';
    this.path = null; this.pi = 0; this.pathReq = false;
    this.spot = null; this.stand = null;
    this.stuckT = 0; this.stuckPos = new THREE.Vector3(); this.stuckCount = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.scan = Math.random() * 6; this.wantYaw = null;
    this.susp = new Map();          // targetId -> suspicion
    this.lock = null; this.lockT = 0; this.cool = 0;
    this.visited = new Set();
    this.wp = null; this.wpTimer = 0;
    this.percT = rnd(0, 0.2);
    this.gun = null;
    this.baked = false; this.bakeAt = 0; this.climbTop = 0;
    this.wander = new THREE.Vector3(); this.wanderT = 0;
    this.mode = 'idle';
    this.hideDeadline = 0;
  }

  get a() { return this.actor; }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.path = null; this.pathReq = false; this.stuckT = 0; this.wp = null;
    const a = this.a;
    if (mode === 'hide') {
      this.state = 'pick'; this.baked = false; this.spot = null;
      a.hidden = false; a.mannequin.setPose(null);
      this._gun(false);
    } else if (mode === 'hunt') {
      this._gun(true);
      a.mannequin.setPose(null);
      if (a.body.climbing) a.body.detach();
      this.visited.clear();
    } else {
      this._gun(mode === 'wait' || mode === 'wander' ? mode === 'wait' : false);
    }
  }

  _gun(on) {
    const m = this.a.mannequin;
    if (on && !this.gun) {
      this.gun = buildThirdPersonGun();
      this.gun.rotation.y = Math.PI; this.gun.position.set(0.17, 0.74, 0.22); this.gun.scale.setScalar(0.62);
      m.root.add(this.gun);
    }
    if (this.gun) this.gun.visible = on;
  }

  // ------------------------------------------------------------------ movement helpers
  requestPath(to) {
    if (this.pathReq) return;
    this.pathReq = true;
    this.bots.pathQueue.push({ brain: this, from: this.a.body.pos.clone(), to: to.clone() });
  }
  setPath(p) { this.pathReq = false; this.path = p; this.pi = p && p.length > 1 ? 1 : 0; if (!p) this.stuckCount++; }

  follow(dt, speed) {
    const a = this.a, b = a.body;
    if (!this.path || this.pi >= this.path.length) return true;
    const w = this.path[this.pi];
    _a.set(w.x - b.pos.x, 0, w.z - b.pos.z);
    const d = _a.length();
    const last = this.pi === this.path.length - 1;
    if (d < (last ? 0.3 : 0.4)) { this.pi++; return this.pi >= this.path.length; }
    _a.divideScalar(d);
    let jump = false;
    if (w.y - b.pos.y > 0.42 && b.grounded && d < 0.9) jump = true;
    b.step(dt, { move: _a, jump, speed });
    this._stuck(dt);
    if (this.mode !== 'hunt') a.face(_a, dt, 10);
    return false;
  }

  _stuck(dt) {
    this.stuckT += dt;
    if (this.stuckT > 1.4) {
      const moved = this.stuckPos.distanceTo(this.a.body.pos);
      this.stuckPos.copy(this.a.body.pos);
      this.stuckT = 0;
      if (moved < 0.35) { this.path = null; this.stuckCount++; this.a.body.vel.y = this.a.body.grounded ? 5 : this.a.body.vel.y; }
    }
  }

  idle(dt) { this.a.body.step(dt, { move: _a.set(0, 0, 0) }); }

  // ------------------------------------------------------------------ hider
  pickSpot() {
    const app = this.app, spots = app.map.hideSpots, wait = app.map.seekerWait?.pos;
    const taken = this.bots.taken;
    let best = null, bestS = -1e9;
    const n = Math.min(spots.length, 14);
    for (let i = 0; i < n; i++) {
      const s = spots[(Math.random() * spots.length) | 0];
      if (s.kind === 'ceiling') continue;
      let sc = Math.random() * 6;
      if (wait) sc += Math.min(40, wait.distanceTo(s.pos)) * 0.4;
      for (const t of taken) if (t.distanceTo(s.pos) < 2.2) sc -= 50;
      sc -= this.a.body.pos.distanceTo(s.pos) * 0.08;
      if (this.bots.badSpots.has(s)) sc -= 80;
      if (sc > bestS) { bestS = sc; best = s; }
    }
    if (!best) return false;
    this.spot = best; taken.push(best.pos);
    if (best.kind === 'wall') {
      this.stand = _a.copy(best.pos).addScaledVector(best.normal, 0.5).clone();
      this.stand.y = Math.max(0.05, best.pos.y - Math.min(best.pos.y, 0.9));
    } else this.stand = best.pos.clone();
    return true;
  }

  tickHide(dt) {
    const a = this.a, b = a.body, app = this.app, round = app.round;
    if (this.state === 'pick') {
      if (!this.pickSpot()) { this.state = 'settle'; return; }
      this.state = 'go'; this.requestPath(this.stand); this.hideDeadline = 0;
    }
    if (this.state === 'go') {
      this.hideDeadline += dt;
      if (!this.path) {
        if (!this.pathReq) { if (this.stuckCount > 3 || this.hideDeadline > 70) { this._giveUp(); return; } this.requestPath(this.stand); }
        this.idle(dt); return;
      }
      if (this.follow(dt, this.d.speed)) {
        if (this.spot.kind === 'wall' && this.spot.pos.y > 0.9) this.state = 'climb';
        else this.state = 'settle';
        this.settleT = 0;
      }
      if (round.phase === 'search' && this.hideDeadline > 1) { this.state = this.spot.kind === 'wall' && this.spot.pos.y > 0.9 ? 'climb' : 'settle'; this.settleT = 0; }
    } else if (this.state === 'climb') {
      this.settleT = (this.settleT || 0) + dt;
      if (!b.climbing) {
        _b.copy(this.spot.normal).negate();
        if (b.grounded) { a.face(_b, 1); if (!b.tryClimb(_b, 0.9)) { if (this.settleT > 0.8) { this.bots.badSpots.add(this.spot); this.state = 'settle'; } } }
        this.idle(dt);
      } else {
        const ty = this.spot.pos.y - 0.45;
        const dy = ty - b.pos.y;
        if (dy > 0.06 && this.settleT < 9) {
          _a.copy(b.up);
          b.step(dt, { move: _a.set(0, 0, 0), up: true, speed: 2.1 });
        } else { b.step(dt, { move: _a.set(0, 0, 0) }); this.state = 'settle'; this.settleT = 0; }
      }
    } else if (this.state === 'settle') {
      this.settleT = (this.settleT || 0) + dt;
      if (this.settleT === dt) {
        if (b.climbing) a.mannequin.setPose(null);
        else {
          const wallish = this.spot && this.spot.kind === 'wall';
          a.mannequin.setPose(wallish ? 'wallhug' : FLOOR_POSES[(Math.random() * FLOOR_POSES.length) | 0]);
          if (wallish) { _b.copy(this.spot.normal); a.face(_b.negate(), 1); }
          else if (Math.random() < 0.5) a.mannequin.rotatePose(rnd(-3, 3));
        }
      }
      b.step(dt, { move: _a.set(0, 0, 0) });
      if (this.settleT > 0.55 && !this.baked) { this.baked = true; this.bots.queueBake(this); }
      if (this.settleT > 0.55 && this.baked) { this.state = 'hidden'; a.hidden = true; }
    } else if (this.state === 'hidden') {
      b.step(dt, { move: _a.set(0, 0, 0) });
    }
  }

  _giveUp() { this.state = 'settle'; this.settleT = 0; if (!this.spot) this.spot = { pos: this.a.body.pos.clone(), normal: new THREE.Vector3(0, 0, 1), kind: 'floor' }; }

  bake() {
    const a = this.a, m = a.mannequin, app = this.app;
    const cam = app.bakeCam;
    const c = a.body.centerTo(_c);
    let n = this.spot?.normal;
    if (!n || n.lengthSq() < 0.1 || Math.abs(n.y) > 0.8) {
      // look from a random side of the room so the baked view matches what hunters usually see
      const ang = Math.random() * Math.PI * 2;
      _d.set(Math.sin(ang), 0.15, Math.cos(ang)).normalize();
    } else _d.copy(n);
    let dist = 2.2;
    const h = app.physics.raycast(c, _d, dist + 0.2, { collision: true, ignoreActors: true });
    if (h) dist = Math.max(0.9, h.distance - 0.1);
    cam.position.copy(c).addScaledVector(_d, dist);
    cam.up.copy(UP); cam.lookAt(c);
    cam.aspect = 1.6; cam.fov = 52; cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    try {
      m.paint.bakeCamo(cam, { strength: this.d.camoBake, noise: 0.03, blur: 0 });
      a.camo = clamp(this.d.camoBake * 0.93, 0, 0.97);
    } catch (e) { console.warn('bake failed', e); a.camo = 0.3; }
  }

  // ------------------------------------------------------------------ hunter
  waypoints() {
    if (this._wps) return this._wps;
    const map = this.app.map;
    const out = [];
    for (const s of map.hideSpots) {
      const p = s.kind === 'wall' ? _a.copy(s.pos).addScaledVector(s.normal, 1.0).clone() : s.pos.clone();
      if (s.kind === 'wall') p.y = Math.max(0.05, s.pos.y - Math.min(s.pos.y, 0.9));
      if (s.kind === 'ceiling') continue;
      out.push({ p, spot: s });
    }
    return (this._wps = out);
  }

  pickWaypoint() {
    const wps = this.waypoints(), me = this.a.body.pos;
    let best = null, bs = 1e9;
    let pool = wps.filter((w) => !this.visited.has(w));
    if (!pool.length) { this.visited.clear(); pool = wps; }
    for (let i = 0; i < 8; i++) {
      const w = pool[(Math.random() * pool.length) | 0];
      if (!w || this.bots.badWps.has(w)) continue;
      const s = me.distanceTo(w.p) + Math.random() * 6 + (this.bots.claimed.has(w) ? 25 : 0);
      if (s < bs) { bs = s; best = w; }
    }
    return best;
  }

  tickHunt(dt) {
    const a = this.a, b = a.body, round = this.app.round;
    this.cool -= dt;
    // target acquisition
    if (this.lock) {
      this.lockT += dt;
      const t = this.lock;
      if (t.caught && !round.isDouble || (round.isDouble && round.hasFound(a, t))) { this.lock = null; this.susp.delete(t.id); }
      else {
        t.headPoint(_b); _c.copy(t.body.centerTo(_d));
        _a.subVectors(_c, a.headPoint(_a));
        this._aim(_a, dt, this.d.turn * 2);
        if (this.lockT > this.reaction && this.cool <= 0) this._fire(t);
        b.step(dt, { move: _d.set(0, 0, 0) });
        if (this.lockT > 3) { this.lock = null; this.susp.set(t.id, 0.4); }
        return;
      }
    }
    // patrol
    if (!this.wp) {
      this.wp = this.pickWaypoint();
      if (this.wp) { this.bots.claimed.add(this.wp); this.requestPath(this.wp.p); this.wpTimer = 0; }
    }
    this.wpTimer += dt;
    if (this.wp) {
      if (!this.path) {
        if (!this.pathReq) { this.bots.badWps.add(this.wp); this.bots.claimed.delete(this.wp); this.wp = null; }
        this.idle(dt);
      } else if (this.follow(dt, this.d.speed) || this.wpTimer > 40) {
        this._arrive();
      }
      if (this.stuckCount > 2) { this.stuckCount = 0; if (this.wp) { this.bots.badWps.add(this.wp); this.bots.claimed.delete(this.wp); } this.wp = null; this.path = null; }
    } else this.idle(dt);

    // scanning look: head sweeps left/right and glances at the spot being approached
    this.scan += dt;
    const moveYaw = b.speed > 0.3 ? Math.atan2(-a.facing.x, -a.facing.z) : this.lookYaw;
    if (b.speed > 0.3) {
      const mv = this.path && this.pi < this.path.length ? this.path[this.pi] : null;
      if (mv) { _a.set(mv.x - b.pos.x, 0, mv.z - b.pos.z); if (_a.lengthSq() > 1e-3) this.wantYaw = Math.atan2(-_a.x, -_a.z); }
    }
    const base = this.wantYaw ?? moveYaw;
    const sweep = Math.sin(this.scan * 0.9) * 0.9;
    this._turnTo(base + sweep, dt, this.d.turn);
    this.lookPitch += (Math.sin(this.scan * 0.5) * 0.12 - 0.02 - this.lookPitch) * Math.min(1, dt * 3);
    a.facing.set(-Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw));
  }

  _arrive() {
    const w = this.wp;
    if (w) {
      this.visited.add(w);
      for (const o of this.waypoints()) if (o.p.distanceTo(w.p) < 3) this.visited.add(o);
      this.bots.claimed.delete(w);
      // occasionally fire at a suspicious bare spot, like a real hunter who got impatient
      if (Math.random() < 0.06 && this.cool <= 0 && w.spot.kind !== 'floor') {
        _a.copy(w.spot.pos).sub(this.a.headPoint(_b)).normalize();
        this._aimSnap(_a);
        this._shoot(_a);
      }
    }
    this.wp = null; this.path = null;
  }

  _turnTo(yaw, dt, rate) {
    let d = yaw - this.lookYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.lookYaw += d * Math.min(1, dt * rate);
  }
  _aimSnap(dir) { this.lookYaw = Math.atan2(-dir.x, -dir.z); this.lookPitch = Math.asin(clamp(dir.y, -1, 1)); this.a.facing.set(-Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw)); }
  _aim(dir, dt, rate) {
    const yaw = Math.atan2(-dir.x, -dir.z), pit = Math.asin(clamp(dir.y / Math.max(1e-4, dir.length()), -1, 1));
    this._turnTo(yaw, dt, rate);
    this.lookPitch += (pit - this.lookPitch) * Math.min(1, dt * rate);
    this.a.facing.set(-Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw));
  }

  lookVec(out) {
    const cp = Math.cos(this.lookPitch);
    return out.set(-Math.sin(this.lookYaw) * cp, Math.sin(this.lookPitch), -Math.cos(this.lookYaw) * cp);
  }

  _fire(target) {
    const a = this.a;
    a.headPoint(_a);
    target.body.centerTo(_b);
    _b.y += rnd(-0.1, 0.1);
    _c.subVectors(_b, _a).normalize();
    this.cool = 1.1;
    this._shoot(_c, target);
    this.lockT = 0;
  }

  _shoot(dir, target) {
    const a = this.a, app = this.app;
    a.headPoint(_a);
    // inaccuracy
    _d.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(this.d.aim);
    const dd = dir.clone().add(_d).normalize();
    const res = firePellets(app.physics, _a.clone(), dd, { ignore: [a.id], fx: ShotgunFX.get(app.engine) });
    app.onShot(a, res, true);
    this.cool = 1.1;
  }

  // ------------------------------------------------------------------ perception (called a few times per second)
  perceive(dt) {
    const a = this.a, app = this.app, round = app.round;
    if (this.lock) return;
    this.lookVec(_c); a.headPoint(_a);
    const range = this.d.range;
    for (const t of round.targetsFor(a)) {
      if (t === a) continue;
      const sid = t.id;
      let s = this.susp.get(sid) || 0;
      t.body.centerTo(_b);
      _d.subVectors(_b, _a);
      const dist = _d.length();
      let seen = 0;
      if (dist < range) {
        _d.divideScalar(dist);
        const cosA = _d.dot(_c);
        if (cosA > 0.5) {
          // sample head / chest / hip
          const hp = t.headPoint(_d.clone());
          const pts = [_b, hp, t.body.pos.clone().add(new THREE.Vector3(0, 0.25, 0))];
          let vis = 0;
          for (const p of pts) if (app.physics.lineOfSight(_a, p)) vis++;
          seen = vis / pts.length;
          if (seen > 0) {
            const centered = (cosA - 0.5) / 0.5;
            let r = this.d.rate * seen * (0.4 + 0.6 * centered) / (1 + dist / 9);
            const camo = clamp(t.camo || 0, 0, 0.97);
            r *= (1 - camo * 0.93);
            if (t.body.speed > 0.8 || t.body.climbing && t.body.speed > 0.3) r *= 3;
            else if (t.moved < 0.5) r *= 1.8;
            if (dist < 2.5) r *= 3;
            if (t.isLocal && t.mannequin.pose == null && !t.body.crouching) r *= 1.15;
            s += r * dt;
          }
        }
      }
      if (!seen) s = Math.max(0, s - dt * 0.22);
      this.susp.set(sid, s);
      if (s >= 1) {
        this.lock = t; this.lockT = 0; this.reaction = rnd(...this.d.react);
        this.path = null; this.wp = null;
        break;
      }
    }
  }
}

export class Bots {
  constructor(app) {
    this.app = app;
    this.brains = [];
    this.pathQueue = [];
    this.bakeQueue = [];
    this.taken = [];
    this.badSpots = new Set(); this.badWps = new Set(); this.claimed = new Set();
    this.bakeAcc = 0;
  }

  add(actor, diff) { const b = new Brain(this, actor, diff); this.brains.push(b); actor.brain = b; return b; }

  clear() {
    this.brains.length = 0; this.pathQueue.length = 0; this.bakeQueue.length = 0;
    this.taken.length = 0; this.badSpots.clear(); this.badWps.clear(); this.claimed.clear();
  }

  remove(actor) { this.brains = this.brains.filter((b) => b.actor !== actor); }

  queueBake(brain) { this.bakeQueue.push(brain); }

  modeFor(a) {
    const round = this.app.round;
    if (!round || round.phase === 'lobby') return 'wander';
    if (round.phase === 'hide') return round.isDouble || a.team === 'hider' ? 'hide' : 'wait';
    if (round.phase === 'search') {
      if (a.team === 'hunter' || round.isDouble) return 'hunt';
      return a.caught ? 'idle' : 'hide';
    }
    return 'idle';
  }

  update(dt) {
    const app = this.app;
    // one path per frame, one bake per few frames: keeps frame time flat
    if (this.pathQueue.length) {
      const r = this.pathQueue.shift();
      if (this.brains.includes(r.brain)) { let p = null; try { p = app.nav.path(r.from, r.to, 3500); } catch (e) { console.warn(e); } r.brain.setPath(p); }
    }
    this.bakeAcc += dt;
    if (this.bakeQueue.length && this.bakeAcc > 0.12) {
      this.bakeAcc = 0;
      const b = this.bakeQueue.shift();
      if (this.brains.includes(b)) b.bake();
    }
    for (const b of this.brains) {
      const a = b.actor;
      const mode = this.modeFor(a);
      b.setMode(mode);
      if (mode === 'hide') b.tickHide(dt);
      else if (mode === 'hunt') {
        b.tickHunt(dt);
        b.percT -= dt;
        if (b.percT <= 0) { b.perceive(0.2 + (-b.percT)); b.percT = 0.2; }
      } else if (mode === 'wander') this.tickWander(b, dt);
      else {
        b.idle(dt);
        if (mode === 'wait') { b.lookYaw = Math.atan2(-a.facing.x, -a.facing.z); }
      }
      a.sync(dt);
    }
  }

  tickWander(b, dt) {
    const a = b.actor;
    b.wanderT -= dt;
    if (b.wanderT <= 0) {
      b.wanderT = rnd(2, 6);
      const ang = Math.random() * Math.PI * 2;
      b.wander.set(Math.sin(ang), 0, Math.cos(ang));
      if (Math.random() < 0.3) b.wander.set(0, 0, 0);
      const home = this.app.lobbyHome;
      if (home && a.body.pos.distanceTo(home) > 7) b.wander.subVectors(home, a.body.pos).setY(0).normalize();
    }
    if (b.wander.lengthSq() > 0) a.face(b.wander, dt, 6);
    a.body.step(dt, { move: b.wander, speed: 2.2 });
  }
}
