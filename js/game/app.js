// Boots everything: title -> lobby -> Configure Map -> round on the chosen map -> results -> lobby.
// Single-player against bots; owns the camera, the round object and every UI hook the player controller needs.
import * as THREE from 'three';
import { audio } from '../core/audio.js';
import { Physics } from '../core/physics.js';
import { Nav } from './nav.js';
import { Round, defaultSettings, modeInfo, CLOSE_CALL_RANGE } from './round.js';
import { Actor } from './actors.js';
import { Player } from './player.js';
import { Bots } from './bots.js';
import { Shotgun, ShotgunFX, firePellets } from './shotgun.js';
import { Hud } from '../ui/hud.js';
import { Title, ConfigMenu, Results } from '../ui/menu.js';
import { PaintPanel } from '../ui/paintpanel.js';
import { PoseWheel } from '../ui/posewheel.js';
import { POSES } from '../char/mannequin.js';
import { PLAYABLE, MAPS } from '../maps/index.js';
import { input } from '../core/input.js';

const NAMES = ['Greenblobdude', 'MightyCasub', 'PixelPanda', 'Kuro', 'Mochi', 'SneakyNoodle', 'Toaster', 'Wasabi', 'Pomelo', 'Bagel',
  'Tanuki', 'Nimbus', 'LilSprout', 'Biscuit', 'Gizmo', 'Marshmallow', 'Yuzu', 'Clover', 'Pickle', 'Ramen', 'Sushi', 'Dango', 'Ghostie', 'Frogger'];
const CHAT = ['gl hf', 'where is everyone', 'lol', 'nice spot', 'im on the wall', 'dont look up', 'ahh', 'he is close', 'gg', 'wait for me', 'shhh', 'who is hunter'];
const HUNTER_CHAT = ['got you', 'easy', 'found one', 'i see you', 'come out', 'nice try'];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _p = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function start(mc) {
  const { engine, params } = mc;
  const uiRoot = document.getElementById('ui');
  const app = (mc.app = { mc, engine, params, input });
  const fit = () => app.hud?.setScale(innerHeight / 1080);

  // ---------------------------------------------------------------- systems
  const physics = (app.physics = new Physics(engine));
  const nav = (app.nav = new Nav(physics));
  const hud = (app.hud = new Hud(uiRoot));
  addEventListener('resize', fit); fit();
  hud.fade.classList.add('on');
  const loading = document.createElement('div');
  loading.className = 'title'; loading.innerHTML = '<div class="load">Loading...</div>';
  uiRoot.appendChild(loading);

  const settings = (app.settings = defaultSettings(readParams(params)));
  const name0 = (() => { try { return localStorage.getItem('mc.name') || 'Player'; } catch (e) { return 'Player'; } })();
  const local = (app.local = new Actor({ engine, physics, name: params.get('name') || name0, isBot: false, isLocal: true }));
  local.applicant = false;
  if (params.get('role') === 'hunter' || params.get('role') === 'hider') local.forceRole = params.get('role');
  app.paint = local.mannequin.paint;
  app.panel = new PaintPanel(uiRoot, app.paint);
  app.wheel = new PoseWheel(uiRoot, POSES);
  app.shotgun = new Shotgun({ engine, physics, camera: engine.camera });
  app.shotgun.setVisible(false);
  app.bots = new Bots(app);
  app.bakeCam = new THREE.PerspectiveCamera(52, 1.6, 0.05, 80);
  const player = (app.player = new Player(app));
  const title = (app.title = new Title(uiRoot));
  const config = (app.config = new ConfigMenu(uiRoot, settings));
  const results = (app.results = new Results(uiRoot));
  title.show(false); config.hide(); results.hide();
  app.chatOpen = false;
  app.stepMat = 'wood';
  app.map = null;
  app.round = null;
  app.busy = false;
  app.inZone = false;
  app.titleOpen = true;
  app.bakeCam.name = 'bakeCam';

  // ---------------------------------------------------------------- helpers
  const actors = () => app.round?.actors || [local];
  const dimTarget = () => (player.frozen ? 1 : 0);
  let toastT = 0;

  app.respawnLocal = () => {
    const sp = app.map?.spawns?.hider?.[0] || new THREE.Vector3(0, 1, 0);
    local.place(app.lastSafe || sp, 0);
    local.body.vel.set(0, 0, 0);
  };

  app.applyXray = () => {
    for (const a of actors()) {
      if (a === local) continue;
      const showHider = a.team === 'hider' && !a.caught;
      a.mannequin.setXray(!!(player.xray || a.revealed || a.xrayT > 0), showHider);
    }
  };

  app.openChat = () => {
    if (app.chatOpen) return;
    app.chatOpen = true; input.unlock();
    hud.chatIn.style.display = 'block'; hud.chatIn.value = ''; hud.chatIn.focus();
  };
  const closeChat = (send) => {
    const t = hud.chatIn.value.trim();
    if (send && t) { hud.chatLine(local.name, t, local.team === 'hunter'); audio.click(); }
    hud.chatIn.value = ''; hud.chatIn.style.display = 'none'; hud.chatIn.blur(); app.chatOpen = false;
  };
  hud.chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') closeChat(true); else if (e.key === 'Escape') closeChat(false);
  });

  app.togglePoseWheel = () => {
    if (app.wheel.isOpen) app.wheel.close();
    else if (player.role === 'hider' && !player.paintMode) { input.unlock(); app.wheel.open(); }
  };
  app.wheel.on('select', (id) => { local.mannequin.setPose(id); hud.setRowState('pose', { act: !!id }); audio.click(); });

  app.taunt = () => {
    if (!app.round || !app.round.taunt(local.id)) return;
  };

  // -------- nameplates (screen space) --------
  app.nameplates = () => {
    const out = [];
    if (!app.round || app.round.phase === 'lobby' && !app.lobbyNames) return out;
    const cam = engine.camera;
    const W = innerWidth, H = innerHeight;
    cam.updateMatrixWorld();
    const hunterView = player.role === 'hunter' && !player.freeCam;
    for (const a of actors()) {
      if (a === local) continue;
      if (!a.mannequin.root.visible) continue;
      if (hunterView && !(a.team === 'hunter')) continue;
      a.headPoint(_v); _v.y += 0.38;
      _w.copy(_v).project(cam);
      if (_w.z > 1 || Math.abs(_w.x) > 1.05 || Math.abs(_w.y) > 1.05) continue;
      const d = cam.position.distanceTo(_v);
      if (d > 40) continue;
      if (!physics.lineOfSight(cam.position, a.body.centerTo(_p))) continue;
      out.push({ id: a.id, name: a.name, likes: a.likes || 0, hunter: a.team === 'hunter', x: (_w.x * 0.5 + 0.5) * W, y: (-_w.y * 0.5 + 0.5) * H });
    }
    return out;
  };

  // -------- shooting --------
  app.onShot = (shooter, res, isBot = false) => {
    const round = app.round;
    const cam = engine.camera;
    if (isBot) {
      shooter.headPoint(_v);
      _w.subVectors(_v, cam.position);
      const dist = _w.length();
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      _p.crossVectors(_f, new THREE.Vector3(0, 1, 0)).normalize();
      const pan = dist > 0.1 ? THREE.MathUtils.clamp(_w.normalize().dot(_p), -1, 1) : 0;
      audio.shot(pan, Math.min(1, dist / 50)); audio.pump?.();
    } else { audio.shot(0, 0); setTimeout(() => audio.pump?.(), 350); }
    let landed = false;
    for (const h of res?.hits || []) if (round?.catch(shooter.id, h.actorId)) landed = true;
    if (landed && shooter === local) hud.crossHit();
  };

  // ---------------------------------------------------------------- sense (what counts as "in line of sight")
  const lookOf = (a, out) => {
    if (a.isLocal) return out.set(0, 0, -1).applyQuaternion(engine.camera.quaternion);
    if (a.brain) return a.brain.lookVec(out);
    return out.copy(a.facing);
  };
  const buriedCache = new Map();
  const sense = {
    canSee(hunter, hider) {
      if (!hider.mannequin.root.visible) return false;
      const eye = hunter.isLocal && player.role === 'hunter' ? engine.camera.position : hunter.headPoint(_v);
      hider.body.centerTo(_w);
      const d = eye.distanceTo(_w);
      if (d > CLOSE_CALL_RANGE) return false;
      _f.subVectors(_w, eye).normalize();
      if (_f.dot(lookOf(hunter, _p)) < 0.72) return false;
      return physics.lineOfSight(eye, _w);
    },
    buriedRatio(a) {
      const c = buriedCache.get(a.id);
      if (c && engine.time - c.t < 0.4) return c.r;
      const r = a.mannequin.root.visible ? physics.buriedRatio(a.mannequin) : 0;
      buriedCache.set(a.id, { t: engine.time, r });
      return r;
    },
  };

  // ---------------------------------------------------------------- maps
  async function loadMapSafe(id) {
    const tried = [];
    const order = [id, ...shuffle(PLAYABLE.map((m) => m.id)).filter((x) => x !== id), 'test'];
    for (const mid of order) {
      if (!mid || tried.includes(mid)) continue;
      tried.push(mid);
      try { return await engine.loadMap(mid); } catch (e) { console.warn('map failed', mid, e); }
    }
    throw new Error('no map could be loaded');
  }

  function useMap(map) {
    app.map = map;
    physics.build(map);
    nav.clear();
    buriedCache.clear();
    app.lastSafe = null;
    app.stepMat = /sewer|osaka/.test(map.id) ? 'stone' : /sugar/.test(map.id) ? 'soft' : 'wood';
  }

  function clearBots() {
    app.bots.clear();
    for (const a of (app.round?.actors || [])) if (a !== local) a.dispose();
    app.lobbyBots = [];
  }

  function resetLocal() {
    local.mannequin.setPose(null);
    if (local.body.climbing) local.body.detach();
    local.body.setCrouch(false);
    app.paint.fill(new THREE.Color(0xeeeeea), 0, 0.5);
    player.resetPaint();
    local.camo = 0; local.hidden = false; local.revealed = false; local.caught = false; local.infected = false;
    local.mannequin.root.visible = true;
    local.mannequin.setXray(false);
    app.panel.hide?.();
  }

  // ---------------------------------------------------------------- lobby
  async function enterLobby(first = false) {
    app.busy = true;
    hud.fade.classList.add('on');
    if (!first) await sleep(450);
    results.hide(); config.hide();
    clearBots();
    offRound?.(); offRound = null;
    const map = await loadMapSafe('lobby');
    useMap(map);
    map.setMapName?.(settings.map);
    engine.setFilters({}); engine.dim = 0; engine.flash = 0;
    resetLocal();
    app.lobbyHome = (map.zone ? new THREE.Vector3(map.zone.x, 0, map.zone.z) : map.spawns.hider[0]?.clone()) || new THREE.Vector3();
    const sp = map.spawns.hider;
    local.place(sp[0] || new THREE.Vector3(0, 1, 0), 0);
    const lobbyRound = new Round({ settings, actors: [local], map, sense });
    app.round = lobbyRound;
    // a few ambient bots wandering the lobby
    const n = Math.min(settings.bots, 4);
    const names = shuffle(NAMES.slice());
    app.lobbyBots = [];
    for (let i = 0; i < n; i++) {
      const b = new Actor({ engine, physics, name: names[i], isBot: true });
      b.place(sp[(i + 1) % sp.length].clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1))), rnd(0, 6.28));
      app.bots.add(b, settings.botDifficulty);
      app.lobbyBots.push(b);
    }
    lobbyRound.actors = [local, ...app.lobbyBots];
    player.frozen = false;
    player.setRole('hider');
    hud.setMode(modeInfo(settings.mode));
    hud.top.style.display = 'none'; hud.mode.style.display = 'none';
    hud.setRank([], false); hud.warnOn(false);
    audio.musicMode('lobby');
    app.lobbyNames = true;
    if (first) engine.camera.fov = 55;
    hud.fade.classList.remove('on');
    app.busy = false;
    if (!first) hud.showToast('Press ENTER to configure the map. Stand in the circle to apply as Hunter.', 5000);
  }

  // ---------------------------------------------------------------- round
  let offRound = null;

  async function startRound() {
    if (app.busy) return;
    app.busy = true;
    config.hide();
    app.wheel.close();
    hud.fade.classList.add('on');
    audio.start();
    await sleep(500);
    clearBots();
    offRound?.(); offRound = null;
    const id = settings.map === 'random' ? PLAYABLE[(Math.random() * PLAYABLE.length) | 0].id : settings.map;
    const map = await loadMapSafe(id);
    useMap(map);
    resetLocal();
    app.lobbyNames = false;

    // actors
    const names = shuffle(NAMES.filter((n) => n !== local.name));
    const bots = [];
    for (let i = 0; i < settings.bots; i++) {
      const b = new Actor({ engine, physics, name: names[i % names.length] + (i >= names.length ? i : ''), isBot: true });
      bots.push(b);
    }
    const all = [local, ...bots];
    const round = (app.round = new Round({ settings, actors: all, map, sense }));
    for (const b of bots) { app.bots.add(b, settings.botDifficulty); b.applicant = true; }
    local.applicant = !!app.inZone;
    wireRound(round);
    round.start();

    // placement
    const hs = shuffle(map.spawns.hider.slice()), ss = shuffle(map.spawns.seeker.slice());
    let hi = 0, si = 0;
    for (const a of all) {
      let p, look;
      if (a.team === 'hunter' && !round.isDouble) { p = ss[si++ % ss.length]; look = map.seekerWait?.look; }
      else { p = hs[hi++ % hs.length]; }
      p = p.clone();
      if (hi > hs.length || si > ss.length) p.add(new THREE.Vector3(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6)));
      const yaw = look ? Math.atan2(look.x - p.x, look.z - p.z) : rnd(0, 6.28);
      a.place(p, yaw);
      a.setTeamLook(a.team);
    }
    app.lastSafe = local.body.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
    engine.setFilters(settings.filters);
    setupLocalRole();
    hud.setMode(modeInfo(settings.mode));
    hud.top.style.display = ''; hud.mode.style.display = '';
    audio.musicMode('hide');
    await sleep(120);
    hud.fade.classList.remove('on');
    app.busy = false;
  }

  function setupLocalRole() {
    const round = app.round;
    const isHunter = local.team === 'hunter' && !round.isDouble;
    player.frozen = isHunter && round.phase === 'hide';
    player.setRole(isHunter ? 'hunter' : 'hider');
    hud.lowOk(true);
    if (player.frozen) hud.showToast('You are a Hunter. Wait for the hiders to hide.', 60000);
    else if (!isHunter) hud.showToast('Paint your body to match the surroundings. Press F.', 5000);
  }

  function wireRound(round) {
    const offs = [];
    const on = (n, fn) => offs.push(round.on(n, fn));
    on('banner', ({ text, kind }) => {
      hud.showBanner(text, kind);
      if (kind === 'start') audio.searchStart();
      if (kind === 'win') (round.didWin(local) ? audio.win() : audio.lose());
    });
    on('phase', (phase) => {
      if (phase === 'search') {
        player.frozen = false; hud.showToast('', 1);
        audio.musicMode('search'); app.applyXray();
        if (local.team === 'hunter' && !round.isDouble) hud.showToast('Find the hiders. Left click to shoot.', 4000);
      } else if (phase === 'answer') {
        player.frozen = false;
        for (const a of round.actors) if (a.revealed) a.xrayT = 999;
        app.applyXray();
        const showRank = settings.showMissedSpot && (local.team === 'hunter' || local.caught || player.role !== 'hider');
        hud.setRank(round.missedRanking().map((r) => ({ name: r.actor.name, count: r.spots })), showRank);
        audio.musicMode('lobby');
      } else if (phase === 'result') {
        input.unlock(); player.enabled = false;
        hud.setRank([], false);
        results.show(round, local);
      } else if (phase === 'lobby') {
        if (!app.busy) enterLobby();
      }
    });
    on('tick', (s) => audio.tick(s <= 3));
    on('catch', ({ hunter, hider }) => {
      hud.feedLine(hunter.name, hider.name);
      audio.found();
      hider.mannequin.flashCaught();
      if (hider.isLocal) {
        hud.hitFlash(); audio.hit(); engine.flash = 0.6;
        if (round.mode === 'normal') { setTimeout(() => player.setRole('spectator'), 450); }
        else if (round.mode === 'infection') { setTimeout(() => { player.frozen = false; player.setRole('hunter'); hud.showToast('You were infected. Hunt the rest.', 3500); }, 450); }
      } else if (!round.isDouble && round.mode === 'normal') {
        setTimeout(() => { if (hider.caught) { hider.mannequin.root.visible = false; } }, 700);
      }
      if (hunter.isBot && Math.random() < 0.3) setTimeout(() => hud.chatLine(hunter.name, HUNTER_CHAT[(Math.random() * HUNTER_CHAT.length) | 0], true), 800);
    });
    on('team', ({ actor, team }) => { actor.setTeamLook(team); if (!actor.isLocal) { actor.hidden = false; actor.mannequin.setPose(null); } hud.setScore([]); });
    on('taunt', ({ actor }) => {
      if (actor.isLocal) audio.taunt();
      else if (player.role === 'hunter') { actor.headPoint(_v); if (_v.distanceTo(engine.camera.position) < 40) audio.taunt(); }
      // hunter bots turn toward a nearby whistle
      for (const b of app.bots.brains) {
        if (b.mode !== 'hunt' || b.actor === actor) continue;
        const d = b.actor.body.pos.distanceTo(actor.body.pos);
        if (d < 30) b.susp.set(actor.id, Math.min(0.95, (b.susp.get(actor.id) || 0) + 0.4 * (1 - d / 30) + 0.15));
      }
    });
    on('closeCall', ({ hider, hunter }) => { if (hider.isLocal) { hud.sightLine(hunter.name); audio.closeCall(); } });
    on('buried', ({ actor, on: o }) => { if (actor.isLocal) { hud.warnOn(o); if (o) audio.warn(); } });
    on('reveal', ({ actor }) => {
      actor.xrayT = 4; app.applyXray();
      setTimeout(() => { actor.xrayT = 0; app.applyXray(); }, 4000);
      if (actor.isLocal) hud.showToast('Your location was revealed.', 2500);
    });
    on('like', ({ from, to }) => { if (to.isLocal) { hud.showToast(`${from.name} gave you a thumbs up`, 2200); audio.click(); } });
    offRound = () => { for (const o of offs) o(); };
  }

  // ---------------------------------------------------------------- per-frame
  let orbitT = 0, scoreT = 0, botChatT = 20, rankT = 0, dblCool = 0;
  const cx = new THREE.Vector3();

  function updateTitleCamera(dt) {
    orbitT += dt * 0.12;
    const m = app.map;
    const tc = m?.titleCam || { center: new THREE.Vector3(0, 1.4, 0), radius: 7, height: 3.2 };
    const cam = engine.camera;
    cam.position.set(tc.center.x + Math.cos(orbitT) * tc.radius, tc.height, tc.center.z + Math.sin(orbitT) * tc.radius);
    cam.lookAt(tc.center.x, tc.center.y ?? 1.2, tc.center.z);
  }

  engine.onUpdate((dt) => {
    if (!app.map) return;
    const round = app.round;
    player.enabled = !app.titleOpen && !config.isOpen && !app.chatOpen && !app.busy && round?.phase !== 'result' && !app.wheel.isOpen;
    if (app.titleOpen) {
      updateTitleCamera(dt);
      app.bots.update(dt);
      return;
    }

    // lobby interactions
    if (round?.phase === 'lobby') {
      const z = app.map.zone;
      if (z) {
        const inZ = Math.hypot(local.body.pos.x - z.x, local.body.pos.z - z.z) < z.r;
        if (inZ !== app.inZone) { app.inZone = inZ; local.applicant = inZ; hud.showToast(inZ ? 'Applying as Hunter' : 'Applicant cancelled', 1800); audio.toggle(inZ); }
      }
      if (!config.isOpen && !app.chatOpen && !app.busy && input.pressed('Enter')) { audio.click(); config.show(); }
    }

    player.update(dt);
    app.bots.update(dt);
    if (round && round.phase !== 'lobby') round.update(dt);

    // double mode: the local player also shoots during the search
    dblCool -= dt;
    if (round?.isDouble && round.phase === 'search' && player.role === 'hider' && !player.paintMode && dblCool <= 0 && (input.locked || params.has('harness')) && input.clicked(0)) {
      dblCool = 0.9;
      const cam = engine.camera;
      _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const res = firePellets(physics, cam.position, _f, { ignore: [local.id], fx: ShotgunFX.get(engine) });
      app.onShot(local, res);
    }

    // answer check: thumbs-up by clicking a body
    if (round?.phase === 'answer' && !config.isOpen && input.clicked(0)) {
      _f.set(0, 0, -1).applyQuaternion(engine.camera.quaternion);
      const h = physics.raycast(engine.camera.position, _f, 80, { ignore: [local.id], actorsOnly: true });
      if (h?.actorId != null) { app.liked ??= new Set(); if (!app.liked.has(h.actorId) && round.like(local.id, h.actorId)) { app.liked.add(h.actorId); audio.click(); } }
    }
    if (round?.phase === 'hide') app.liked = null;

    // fade-to-black for waiting hunters
    engine.dim += (dimTarget() - engine.dim) * Math.min(1, dt * 4);
    engine.flash = Math.max(0, engine.flash - dt * 2.5);

    // HUD
    if (round && round.phase !== 'lobby') {
      hud.setTop({ hiders: round.hidersAlive().length, hunters: round.hunters().length, bonus: round.bonus, time: round.timeLeft, label: round.label });
      scoreT -= dt;
      if (scoreT <= 0) {
        scoreT = 0.5;
        const top = round.actors.slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 4);
        hud.setScore((round.phase === 'search' || round.phase === 'answer') ? top.map((a) => ({ v: `${a.name}  ${Math.round(a.score || 0)}`, you: a.isLocal })) : []);
      }
      if (round.phase === 'answer') {
        rankT -= dt;
        if (rankT <= 0) { rankT = 1; if (hud.rank.style.display === 'block') hud.setRank(round.missedRanking().map((r) => ({ name: r.actor.name, count: r.spots })), true); }
      }
    }

    // ambient bot chat
    botChatT -= dt;
    if (botChatT <= 0 && round) {
      botChatT = rnd(18, 45);
      const bs = round.actors.filter((a) => a.isBot);
      if (bs.length && round.phase !== 'result') { const b = bs[(Math.random() * bs.length) | 0]; hud.chatLine(b.name, CHAT[(Math.random() * CHAT.length) | 0], b.team === 'hunter'); }
    }
  }, 10);

  // ---------------------------------------------------------------- menus
  title.on('play', (name) => {
    local.name = name;
    title.show(false);
    app.titleOpen = false;
    hud.show(true);
    local.mannequin.setName?.(name);
    hud.showToast('Press ENTER to configure the map. Stand in the circle to apply as Hunter.', 6000);
  });
  config.on('start', () => startRound());
  config.on('close', () => app.map?.setMapName?.(settings.map));
  config.on('open', () => { input.unlock(); app.wheel.close(); });
  results.on('back', () => { if (!app.busy) enterLobby(); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && config.isOpen) { config.hide(); audio.back(); }
  });

  // ---------------------------------------------------------------- go
  await enterLobby(true);
  loading.remove();
  hud.show(false);
  app.debug = {
    startRound: (patch) => { Object.assign(settings, patch || {}); return startRound(); },
    skipTo: (p) => app.round?.skipTo(p),
    setTime: (s) => app.round?.setTime(s),
    role: (r) => player.setRole(r),
    lobby: () => enterLobby(),
  };
  const auto = params.get('autostart');
  if (auto != null) {
    app.titleOpen = false; hud.show(true);
    if (auto && auto !== '1') settings.map = auto;
    await startRound();
    const sk = params.get('skip'); if (sk) app.round.skipTo(sk);
  } else {
    title.show(true);
    hud.fade.classList.remove('on');
  }
  void MAPS;
}

function readParams(p) {
  const patch = {};
  const num = (k, key = k) => { if (p.has(k)) patch[key] = +p.get(k); };
  if (p.has('map') && p.get('view') == null) patch.map = p.get('map');
  if (p.has('mode')) patch.mode = p.get('mode');
  num('bots'); num('hunters'); num('wait', 'hunterWait'); num('paint', 'paintTime'); num('search', 'searchTime'); num('answer', 'answerCheck');
  if (p.has('diff')) patch.botDifficulty = p.get('diff');
  if (p.has('filter')) patch.filters = { monochrome: p.get('filter') === 'monochrome', horror: p.get('filter') === 'horror', mosaic: p.get('filter') === 'mosaic' };
  return patch;
}
