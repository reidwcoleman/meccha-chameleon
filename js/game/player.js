// The local player's controls: hider (third person, paint, pose, climb), hunter (first person + shotgun),
// spectator / free camera. Pointer lock is used when available, but nothing requires it.
import * as THREE from 'three';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { OrbitRig, FirstPersonRig, FreeCamRig, lookDir } from './camera.js';
import { pickSurface } from '../char/eyedropper.js';

const SENS = 0.0023;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _mv = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3();
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2();

export class Player {
  constructor(app) {
    this.app = app;
    const { engine, physics } = app;
    this.engine = engine; this.physics = physics;
    this.actor = app.local;
    this.orbit = new OrbitRig(physics);
    this.fp = new FirstPersonRig();
    this.freeRig = new FreeCamRig();
    this.role = 'spectator';
    this.enabled = false;        // false in menus / lobby overlays
    this.frozen = false;         // hunters waiting blind
    this.paintMode = false;
    this.freeCam = false;
    this.shadow = true;
    this.names = true;
    this.xray = false;
    this.eyedrop = false;
    this.paintArea = 0;
    this.lastHit = null;
    this.stepT = 0;
    this.tauntKeyDown = false;
    this.aim = false;
    this.stroking = false;
    this._pw = 0;
    const b = this.actor.body;
    b.onFellOut = () => { app.respawnLocal?.(); };
    b.onAttach = () => audio.whoosh();
  }

  // ------------------------------------------------------------------ roles
  setRole(role) {
    this.role = role;
    this.setPaint(false);
    this.setFree(false, true);
    const a = this.actor;
    a.mannequin.root.visible = role !== 'hunter' && role !== 'spectator';
    this.app.shotgun.setVisible(role === 'hunter');
    this.app.hud.setRole(role);
    this.app.hud.setToggle('names', this.names);
    this.app.hud.setToggle('xray', this.xray);
    this.app.hud.setToggle('free', false);
    this.app.hud.freeOn(false);
    const cam = this.engine.camera;
    if (role === 'hunter') {
      this.fp.yaw = this._yawOf(a.facing); this.fp.pitch = 0;
      cam.fov = this.fp.fov = this.fp.baseFov; cam.updateProjectionMatrix();
    } else {
      this.orbit.yaw = this._yawOf(a.facing) + Math.PI; this.orbit.pitch = -0.28; this.orbit.dist = 3.4; this.orbit._init = false;
      cam.fov = 60; cam.updateProjectionMatrix();
    }
    if (role === 'spectator') this.setFree(true, true);
  }

  _yawOf(f) { return Math.atan2(-f.x, -f.z); }

  setPaint(on) {
    if (on && (this.role !== 'hider' || this.freeCam)) return;
    if (this.paintMode === on) return;
    this.paintMode = on;
    const { panel, hud } = this.app;
    if (on) {
      input.unlock();
      panel.show();
      this.orbit.dist = 2.1; this._lastDist = 2.1;
    } else {
      panel.hide();
      this.orbit.dist = 3.4;
      this.stroking = false; this.lastHit = null; this.setEyedrop(false);
    }
    hud.setRowState('paint', { act: on });
  }

  setEyedrop(on) { this.eyedrop = on; this.app.panel.setEyedrop(on); }

  setFree(on, quiet = false) {
    if (this.freeCam === on) return;
    if (on && this.role === 'hider' && this.paintMode) this.setPaint(false);
    this.freeCam = on;
    const { hud } = this.app;
    if (on) { this.freeRig.from(this.engine.camera); this.app.shotgun.setVisible(false); }
    else if (this.role === 'hunter') this.app.shotgun.setVisible(true);
    if (this.role === 'spectator') on = true;
    hud.setToggle('free', on); hud.freeOn(on);
    if (!quiet) audio.toggle(on);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const app = this.app;
    const a = this.actor, body = a.body;
    const live = this.enabled;
    const locked = input.locked;

    // global toggles
    if (live) {
      if (input.pressed('Digit2')) { this.names = !this.names; app.hud.setToggle('names', this.names); audio.toggle(this.names); }
      if (input.pressed('Digit3')) { this.xray = !this.xray; app.hud.setToggle('xray', this.xray); audio.toggle(this.xray); app.applyXray(); }
      if (input.pressed('Digit5') && this.role !== 'spectator') this.setFree(!this.freeCam);
      if (input.pressed('KeyV') && this.role === 'hider') { this.shadow = !this.shadow; a.mannequin.setShadow(this.shadow); app.hud.setShadow(this.shadow); audio.toggle(this.shadow); }
      if (input.pressed('KeyT') && !app.chatOpen) { app.openChat(); }
    }

    // look
    const canLook = live && (locked || input.button(2) || (!this.paintMode && input.button(0)) || (this.paintMode && input.alt() && input.button(0)));
    let ldx = 0, ldy = 0;
    if (canLook && !(this.paintMode && !input.button(2) && !input.alt())) { ldx = input.mouse.dx * SENS; ldy = input.mouse.dy * SENS; }
    if (live && !locked && !this.paintMode && input.clicked(0) && !app.chatOpen && app.round?.phase !== 'lobby') input.lock();

    if (this.freeCam || this.role === 'spectator') this._updateFree(dt, ldx, ldy, live);
    else if (this.role === 'hunter') this._updateHunter(dt, ldx, ldy, live);
    else this._updateHider(dt, ldx, ldy, live);

    a.sync(dt);
    this._footsteps(dt);
  }

  _footsteps(dt) {
    const b = this.actor.body;
    if (b.justJumped) audio.jump();
    if (b.justLanded) audio.land(Math.min(1, b.landSpeed / 8));
    if (b.grounded && b.speed > 1) {
      this.stepT -= dt * (b.speed / 4.2);
      if (this.stepT <= 0) { this.stepT = 0.38; audio.step(this.app.stepMat || 'wood', this.role === 'hunter' ? 0.2 : 0.09); }
    }
  }

  _updateFree(dt, ldx, ldy, live) {
    const cam = this.engine.camera;
    const f = this.freeRig;
    if (live) f.addLook(ldx, ldy);
    if (live && input.mouse.wheel) f.wheel(input.mouse.wheel);
    const mv = { x: 0, y: 0, z: 0 };
    if (live) {
      mv.z = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
      mv.x = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
      mv.y = (input.down('Space') ? 1 : 0) - (input.ctrl() ? 1 : 0);
    }
    f.update(dt, cam, mv);
    const a = this.actor;
    a.body.vel.set(0, 0, 0); a.body.speed = 0;
    this.app.hud.setHints({ free: true });
    this.app.hud.setNames(this.app.nameplates(), this.names);
  }

  _moveIntent(yaw) {
    const x = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const z = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    lookDir(yaw, 0, _f); _f.y = 0; _f.normalize();
    _r.set(Math.cos(yaw), 0, -Math.sin(yaw));
    _mv.set(0, 0, 0).addScaledVector(_f, z).addScaledVector(_r, x);
    return { x, z, move: _mv };
  }

  _updateHider(dt, ldx, ldy, live) {
    const { engine, app } = this;
    const a = this.actor, body = a.body, m = a.mannequin, hud = app.hud;
    const cam = engine.camera, orbit = this.orbit;
    const frozen = this.frozen || !live;

    if (live) {
      if (input.pressed('KeyF')) { this.setPaint(!this.paintMode); audio.toggle(this.paintMode); }
      if (input.pressed('KeyR') && !this.paintMode) app.togglePoseWheel();
      if (input.pressed('Digit1') && !this.paintMode) app.taunt();
      if (app.wheel.isOpen) for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']) if (input.pressed(k)) app.wheel.key(k);
    }

    // camera look
    if (this.paintMode) {
      if (live && (input.button(2) || (input.alt() && input.button(0)))) orbit.addLook(input.mouse.dx * SENS, input.mouse.dy * SENS);
      if (live && input.mouse.wheel) {
        if (input.button(2)) {
          const br = app.paint.brush; br.size = THREE.MathUtils.clamp(br.size * Math.pow(1.12, -input.mouse.wheel), 0.015, 0.35); app.panel._applyBrush?.(true);
        } else orbit.zoom(input.mouse.wheel, 1.1);
      }
    } else if (live) {
      orbit.addLook(ldx, ldy);
      if (input.mouse.wheel) orbit.zoom(input.mouse.wheel);
    }

    // movement
    const climbing = body.climbing;
    let moving = false;
    if (!frozen && !this.paintMode) {
      const mi = this._moveIntent(orbit.yaw);
      const any = mi.x || mi.z;
      moving = !!any;
      let jump = input.pressed('Space');
      if (m.pose && (any || jump)) { m.setPose(null); app.hud.setRowState('pose', { act: false }); }
      if (m.pose) { const q = (input.down('KeyE') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0); if (q) m.rotatePose(q * dt * 2.2); }
      if (input.pressed('ControlLeft') || input.pressed('ControlRight') || input.pressed('KeyC')) {
        if (!climbing) body.setCrouch(!body.crouching);
      }
      if (input.pressed('ShiftLeft') || input.pressed('ShiftRight')) {
        if (climbing) body.detach();
        else { lookDir(orbit.yaw, 0, _t); body.tryClimb(_t); }
      }
      if (climbing) {
        const n = body.surfNormal;
        if (Math.abs(n.y) > 0.7) { _t.copy(mi.move); } // floor/ceiling: camera-relative
        else {
          _r.copy(body.up).cross(n).normalize();
          _t.set(0, 0, 0).addScaledVector(_r, mi.x).addScaledVector(body.up, mi.z);
        }
        body.step(dt, { move: _t, up: input.down('Space'), down: input.ctrl() });
        jump = false;
      } else {
        body.step(dt, { move: mi.move, jump });
        if (any && !input.button(2)) a.face(_t.copy(mi.move).normalize(), dt, 12);
      }
    } else {
      body.step(dt, { move: _mv.set(0, 0, 0) });
    }
    if (!body.climbing && !moving && !frozen) { /* idle: facing kept */ }

    // paint interaction
    if (this.paintMode && live) this._paint(dt);

    // camera
    body.centerTo(_e); _e.y += 0.1;
    orbit.update(dt, cam, _e);
    app.hud.setHints({ crouch: body.crouching, climb: !body.climbing && this._nearClimbable(), attached: body.climbing, free: false });
    app.hud.setRowState('lock', { act: input.button(2) && !this.paintMode });
    app.hud.setRowState('taunt', { cd: a.tauntCd > 0 });
    app.hud.setNames(app.nameplates(), this.names);
  }

  _nearClimbable() {
    const b = this.actor.body;
    if (this._ct === undefined || this._ct < this.engine.time - 0.2) {
      this._ct = this.engine.time;
      this.engine.camera.getWorldDirection(_t); _t.y = 0;
      const c = b.centerTo(_e);
      let ok = false;
      if (_t.lengthSq() > 1e-4) {
        _t.normalize();
        const h = this.physics.raycast(c, _t, 0.95, { collision: true, ignoreActors: true });
        ok = !!(h && h.normal.y < 0.64);
      }
      this._cl = ok;
    }
    return this._cl;
  }

  // ------------------------------------------------------------------ paint mode
  _ray(x, y) {
    const el = this.engine.renderer.domElement, r = el.getBoundingClientRect();
    _ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    _ray.setFromCamera(_ndc, this.engine.camera);
    _ray.far = 30;
    return _ray;
  }

  _paint(dt) {
    const { app, engine } = this;
    const paint = app.paint, mesh = this.actor.mannequin.mesh;
    const mx = input.mouse.x, my = input.mouse.y;
    const eye = input.down('Space') || this.eyedrop;
    let hit = null;
    if (!input.button(2) && !input.alt()) {
      const hs = this._ray(mx, my).intersectObject(mesh, false);
      hit = hs[0] ? hs[0].point.clone() : null;
    }
    // ring
    const cam = engine.camera;
    const dist = hit ? hit.distanceTo(cam.position) : cam.position.distanceTo(this.actor.body.centerTo(_e));
    const px = (paint.brush.size / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * Math.max(0.2, dist))) * innerHeight;
    app.panel.setRing(mx, my, Math.max(6, px), !input.button(2) && !input.alt());

    if (eye) {
      if (input.button(0) || input.clicked(0)) {
        const p = pickSurface(engine, mx, my, { ignore: [mesh] });
        if (p) { paint.brush.metallic = p.metallic; paint.brush.roughness = p.roughness; app.panel.setColor(p.color, { push: false }); }
      }
      if (input.clicked(0) && this.eyedrop) this.setEyedrop(false);
      if (input.released('Space') || input.unclicked(0)) app.panel.pushHistory(paint.brush.color);
      this.stroking = false; this.lastHit = null;
      return;
    }
    if (input.clicked(0) && !input.alt()) { paint.snapshot(); this.stroking = true; this.lastHit = null; }
    if (this.stroking && input.button(0) && hit) {
      if (this.lastHit) {
        paint.stroke(this.lastHit, hit);
        this.paintArea += this.lastHit.distanceTo(hit) * paint.brush.size;
      } else { paint.stamp(hit); this.paintArea += paint.brush.size * paint.brush.size * 0.8; }
      this.lastHit = hit;
      if (Math.random() < 0.18) audio.splat();
      this._syncCamo();
    } else if (!input.button(0)) { this.stroking = false; this.lastHit = null; }
    else if (!hit) this.lastHit = null;
    if (input.pressed('KeyZ') && (input.ctrl() || input.down('MetaLeft'))) { if (input.shift()) paint.redo(); else paint.undo(); }
  }

  _syncCamo() { this.actor.camo = 1 - Math.exp(-this.paintArea / 1.1); }
  resetPaint() { this.paintArea = 0; this.actor.camo = 0; }
  addFill() { this.paintArea += 1.1; this._syncCamo(); }

  // ------------------------------------------------------------------ hunter
  _updateHunter(dt, ldx, ldy, live) {
    const { engine, app } = this;
    const a = this.actor, body = a.body, fp = this.fp, cam = engine.camera, gun = app.shotgun;
    const frozen = this.frozen || !live;
    if (live) fp.addLook(ldx, ldy);
    this.aim = live && !frozen && input.button(2);
    const mi = this._moveIntent(fp.yaw);
    if (!frozen) {
      if (input.pressed('ControlLeft') || input.pressed('KeyC')) body.setCrouch(!body.crouching);
      body.step(dt, { move: mi.move, jump: input.pressed('Space'), speed: body.crouching ? 2.4 : 4.6 });
    } else body.step(dt, { move: _mv.set(0, 0, 0) });
    a.facing.set(-Math.sin(fp.yaw), 0, -Math.cos(fp.yaw));
    body.headTo(_e, 0.12);
    if (body.justLanded) fp.land(body.landSpeed);
    const st = fp.update(dt, cam, _e, { speed: body.speed, grounded: body.grounded, aim: this.aim, strafe: mi.x });
    gun.update(dt, { lookDX: ldx, lookDY: ldy, speed: body.speed, grounded: body.grounded, aim: this.aim, bob: st.bob, bobX: st.bobX });
    if (!frozen && (input.locked || app.params.has('harness')) && input.clicked(0) && app.round?.phase !== 'lobby') {
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const res = gun.fire(cam.position, _f, { ignore: [a.id] });
      if (res) { fp.recoil(1); app.onShot(a, res); }
      else audio.empty();
    }
    app.hud.setHints({ crouch: body.crouching });
    app.hud.setNames(app.nameplates(), this.names);
  }
}
