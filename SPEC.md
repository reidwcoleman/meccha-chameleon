# MECCHA CHAMELEON — browser replica · SPEC (contracts for every module)

Goal: an **exact** replica of MECCHA CHAMELEON (Steam, lemorion_1224, 2026) running in the browser with
Three.js — same phases, same HUD text and layout, same paint tools, same poses, same maps, same seeker
shotgun — with graphics as close to the Unreal original as WebGL allows (PBR, shadows, AO, bloom,
baked reflection probes, Poly Haven CC0 assets). Single-player vs bots first; every actor goes through
one `Actor` shape so networking can be added later.

Reference material (Read these images — they are ground truth): `ref/`
- `ref/s00.jpg … s14.jpg` — 2×2 contact sheets, 60 frames of a gameplay tutorial, in time order.
- `ref/paint-panel-crop.png`, `ref/right-hints-crop.png`, `ref/top-hud-crop.png`, `ref/bottom-hints-crop.png` — HUD close-ups.
- `ref/tutorial-transcript.vtt` — what the narrator says (controls, modes, tips).
- To study more footage yourself: `python3 ~/.claude/plugins/cache/claude-video/watch/0.1.3/scripts/watch.py "ytsearch1:MECCHA CHAMELEON <topic> gameplay" --max-frames 40 --resolution 768 --no-whisper --out-dir /tmp/mc-<you>` (run with the Bash sandbox disabled), then Read the frames. Good searches: "MECCHA CHAMELEON sewer", "… penguin hotel", "… sugar land", "… osaka", "… backrooms", "… indoor country", "… mansion", "… lobby".

## 1. The real game, as observed

**Loop.** Lobby → host opens *Configure Map* → round. Teams: **Hiders** (white) and **Hunters/Seekers** (red).
Hiders spawn as a smooth, featureless **pure-white mannequin** (rounded head, no face, simple capsule
limbs, gingerbread-man proportions, ~1.25 m tall) and paint their own body to match the stage. Hunters
play in **first person with a pump shotgun** (the gun itself is covered in painted red/green splotches)
and shoot anything that looks wrong. A shot that hits a hider = caught ("`Greenblobdude found MightyCasub`"
kill-feed line, hunter name orange, hider name cyan). No flashlights, no radar.

**Phases & HUD label under the timer** (top-centre):
1. Hide — label **"Until Search Starts"**, countdown = *Hunter Wait Time* (default 60). Hunters wait blind.
2. Banner **"Search Start!"** (big white text with dark outline, centre) → label **"Search Time"**, countdown = *Search Time* (default 300).
3. **"Answer Check"** — countdown = *Answer Check Time* (default 30): round is over, surviving hiders are revealed, **Missed-Spot Ranking** shown.
4. Banner **"Hunters Win!"** / **"Hiders Win!"** → back to lobby.
Hiders may keep painting after the search starts. Hiders win if ≥1 survives the Search Time.

**Modes** (Configure Map → Game Mode, with ‹ › arrows):
- **Infection** — "If you get caught, you become a hunter. Hide until the end to win" (green title bottom-right + that 2-line description).
- **Normal** — fixed teams.
- **Double** — "Everyone hides at the start. After that, everyone searches and the first player to find everyone wins." (uses *Paint Time(sec)* instead of Hunter Wait Time.)

**Configure Map menu** (three translucent dark panels over the lobby): **Game Mode** panel with rows
`Game Mode ‹Infection›`, `Number of Hunters 1`, `Hunter Wait Time(sec) 60`, `Search Time(sec) 300`,
`Answer Check Time(sec) 30`, `Forced Taunt Interval(sec) 0`, `Show Missed-Spot Ranking to Hunters ‹On›`,
button **Start Game** (green outline); **Filter** panel: `Monochrome ‹Off›`, `Horror ‹Off›`, `Mosaic ‹Off›`;
**Map** panel: preview image + list `Random, Hide-and-Seek Mansion, Sewer, Backrooms, Indoor Country,
Penguin Hotel, Sugar Land, Osaka` (selected row = bright green bar, others dark with white text).
Bottom-left `Back` key hint. Numeric rows are editable fields with a small "n/18"-style page counter at right.

**Top-centre HUD** (`ref/top-hud-crop.png`): row of small white hider figures (each holding a brush) ·
a green/cream **hourglass** icon with a small green number (hiders remaining / score) · row of red hunter
figures. Caught hiders' icons turn red and move to the hunter side in Infection. Under it: big thin
timer number (e.g. `46`, `273`) and the phase label in small text.

**Right-side control column** (`ref/right-hints-crop.png`), top→bottom, key-cap + label + round icon:
`T` chat · `1` **Taunt** (yellow bell) · `R` **Pose** · `F` **Paint Mode** · mouse-R **Rotation Lock** ·
green toggle `2` **Toggle Nameplate Display** · green toggle `3` **Toggle X-Ray Rendering** ·
pink `5` **Switch to Free Camera** · `V` shadow on/off icon · `B` headphones icon.
Bottom-right: mode name in green (`Infection`) + description in white.

**Bottom-centre context hints** (`ref/bottom-hints-crop.png`): small coloured key-caps with labels —
on ground: `CTRL Crouch` (yellow), `Stand Up` (green caps), `Climb` (teal); attached to a wall/ceiling:
`SHIFT Detach` (green) · `CTRL Move Down` · `SPACE Move Up`; above them a pose-rotation strip `Q ◇ ◇ E`.

**Paint panel** (top-left, only in Paint Mode — `ref/paint-panel-crop.png`): HSV colour **wheel**; two
vertical sliders (value, alpha/brightness); new/old colour swatches; `sRGB Preview` checkbox; rainbow
button + eyedropper button + a "swatches" button; **R G B** sliders with numeric fields (0–1 floats,
e.g. `0.418`); **H S V** sliders (`38.423`, `0.845`, `0.418`); `Hex sRGB ▾  AD9348FF`; a colour-history
row with a clock ▾ dropdown; **Metallic** and **Roughness** fields (`0.000379`, `1.0`). Under it the
key-hint card: pen icon + `SPACE` **3D Eyedropper (Hold)**; brush icon + (mouse-R + wheel) **Brush Size**;
sun icon + `V` **Shadow**; (mouse-L + move / ALT + mouse-R + move) **Rotate Camera**; (wheel / ALT + mouse + move) **Zoom**.

**Pose wheel** (`R`): a round dark radial menu with 8 wedge slots, each showing a white mannequin
thumbnail in a pose (star/X-pose, crouch ball, arms-up, T-pose, sitting, lying flat, fetal curl, wall-hug…).

**Other observed UI**: nameplates above players (`👍 2` + name, white; red for hunters); **"In
Chugazug's Line of Sight +1"** lines stacking at right-middle (hiders earn a point per second while a
hunter looks at them unfound — "close calls"); left edge score list (numbers); **"Missed-Spot Ranking"**
tab at left; warning in yellow **"Your body is buried too much! / If this continues, your location will
be revealed"**; **"Free Camera"** large text bottom-left with `5 Exit Free Camera` / `Free Movement`.

**Controls summary** (keyboard + mouse): WASD move, SPACE jump (hider: hold = 3D eyedropper in paint mode),
CTRL crouch, Climb onto walls **and ceilings** (then SHIFT detach, CTRL/SPACE move down/up), R pose wheel,
Q/E rotate pose, F paint mode, 1 taunt (whistle heard by nearby hunters; doesn't reveal exact spot),
V toggle own shadow, 2 nameplates, 3 x-ray, 5 free camera (4 = free-cam speed/mode), T chat, B voice
(stub), hunters: LMB shoot, RMB aim. Mouse-R hold = rotation lock.

**Maps (official)**: Hide-and-Seek Mansion (default: dining hall with chandeliers, black/white marble
checker floors, wood-swirl wallpaper corridors with red runner carpet and wall sconces, portrait gallery
with red curtains, staircase, green-tinted kitchen/pantry, a "Search Start" poster wall), Sewer (round
brick tunnels, rusty pipes, IBC tanks, yellow jerrycans, pallets, cable spools, graffiti, STOP sign,
sludge floor), Backrooms (yellow wallpaper maze, fluorescent lights, damp carpet), Indoor Country (a
western/country town under a roof: sand floor, wagons, barrels, wooden porches), Penguin Hotel, Sugar
Land (candy world), Osaka (Japanese shopping street). **Lobby**: bright hub with giant glossy paint
blobs, marble checker floor, a painted floor zone "Hunter applicants should stand here", a chalkboard of
credits `[Planning] [BGM] [3D Model] [Level Design] [UI] [System] [Effects] [Optimization]`, and a map
preview board labelled with the current map.

Art direction: Unreal-style lit realism with saturated game colours, warm practical lights, strong
bloom on bulbs, soft shadows, ambient occlusion, glossy floors with reflections.

## 2. File ownership (do NOT edit files you don't own — ask the lead instead)

| Owner | Files |
|---|---|
| lead | `index.html`, `js/main.js`, `js/core/engine.js`, `js/core/assets.js`, `js/core/input.js`, `js/core/emitter.js`, `js/maps/kit.js`, `js/maps/index.js`, `js/maps/test.js`, `tools/serve.mjs`, `tools/shot.mjs`, `tools/polyhaven.mjs`, `SPEC.md` |
| A · character | `js/char/*` (mannequin, paint, eyedropper, poses), `js/ui/paintpanel.js`, `js/ui/posewheel.js`, `css/paint.css` |
| B · mansion+lobby | `js/maps/mansion.js`, `js/maps/lobby.js`, `js/maps/mansion/*` |
| C · sewer/backrooms/country | `js/maps/sewer.js`, `js/maps/backrooms.js`, `js/maps/country.js` (+ subfolders) |
| D · hotel/sugar/osaka | `js/maps/hotel.js`, `js/maps/sugar.js`, `js/maps/osaka.js` (+ subfolders) |
| E · game flow + UI | `js/game/app.js`, `js/game/round.js`, `js/game/actors.js`, `js/ui/hud.js`, `js/ui/menu.js`, `js/ui/title.js`, `js/core/audio.js`, `css/ui.css`, `assets/ui/*` |
| F · movement + hunters + bots | `js/core/physics.js`, `js/game/player.js`, `js/game/camera.js`, `js/game/shotgun.js`, `js/game/bots.js`, `js/game/perception.js` |

Everyone may add files under `assets/` (models/textures via `tools/polyhaven.mjs`) and new `tools/*.mjs`
test scripts prefixed with their letter (e.g. `tools/f-botsim.mjs`). **Never run git** — the lead commits.

## 3. Runtime basics

- Plain ES modules + import map, no build step. `three` r186 is vendored at `vendor/`. Import as
  `import * as THREE from 'three'`, addons as `three/addons/...`, BVH as `three-mesh-bvh`.
- Dev server: `node tools/serve.mjs` → http://localhost:5277 (already running normally; if not, start it
  with the Bash sandbox disabled). Use `PORT=xxxx` + `--port xxxx` for a private one.
- Harness: `node tools/shot.mjs "<query>" out.png [--eval "js"] [--wait ms] [--shots 500,1000]`
  (headless Chrome with real GPU; run with the sandbox disabled). Prints console errors — **zero errors is
  the bar**. Judge visuals at 1920×1080 by Reading the PNG. Keep screenshots in your scratch dir, not the repo.
  - Map inspection: `"view=map&map=<id>&cam=x,y,z&look=x,y,z"`. `?q=low|medium|high`.
  - Game: `""` (boots `js/game/app.js`). `window.__mc` = `{ THREE, engine, input, assets, params, ready, ... }`;
    E adds `__mc.app` (round, actors, player, hud…) for harness driving.
- Units: metres, +Y up, character forward = +Z in its local frame. 60 fps target on an M1 MacBook at 1080p.

## 4. Engine (`js/core/engine.js`) — lead

```js
engine.scene, engine.camera, engine.renderer, engine.composer, engine.time, engine.dt
engine.onUpdate(fn(dt, time), order=0) -> unsubscribe   // input.endFrame runs at order 1000
engine.setCamera(cam)                                  // swap active render camera (updates AO pass)
await engine.loadMap(id) -> MapData                    // unloads the previous map
engine.bakeProbe(pos) -> env texture                   // cube-map probe of the current scene
engine.setFilters({ monochrome, horror, mosaic })
engine.flash = 0..1   engine.dim = 0..1                // full-screen white flash / blackout
engine.on('map', fn) engine.on('resize', fn) engine.on('frame', fn)
```
Post chain: N8AO (AO) → UnrealBloom → Output (ACES tone map, sRGB) → filter pass → SMAA.
All map meshes get a `three-mesh-bvh` boundsTree after load, so `Raycaster` against them is fast.

## 5. Input (`js/core/input.js`) — lead
Single owner of raw DOM listeners. `input.down(code)`, `input.pressed(code)` (this frame),
`input.released(code)`, `input.button(0|1|2)`, `input.clicked(b)`, `input.unclicked(b)`,
`input.mouse {x,y,dx,dy,wheel}`, `input.alt()/shift()/ctrl()`, `input.lock()/unlock()/locked`,
`input.enabled` (false while a menu owns the keyboard), `input.on('keydown'|'mousedown'|'lock', fn)`.
Codes are `KeyboardEvent.code`. **Only `js/game/app.js` decides which system consumes a key** — each
system exposes methods, app wires keys. (F owns movement keys inside `player.js` via `input` reads.)

## 6. Assets (`js/core/assets.js`) — lead
```js
assets.pbr(polyhavenTexId, { repeat:[x,y], color, roughness, normalScale, metalMap }) -> MeshStandardMaterial (cached)
assets.mat(key, params) · assets.canvasMaterial(key, w, h, draw(ctx,w,h), params, repeat) · assets.canvasTexture(...)
await assets.gltf(idOrPath) -> Object3D clone      // Poly Haven id => assets/models/<id>/<id>_1k.gltf
await assets.hdri(id, renderer) -> { equirect, env }
assets.albedoAt(material, uv) -> THREE.Color       // CPU texel lookup incl. repeat/offset (eyedropper, bots)
```
Download CC0 assets: `node tools/polyhaven.mjs search models chandelier`, `… model Chandelier_01`,
`… tex red_brick`, `… hdri <id>` (sandbox disabled). **Budget: ≤ 60 MB of downloads per map agent**;
always 1k; prefer textures + kit geometry over heavy models; reuse ids another map already downloaded.

## 7. Map contract (`js/maps/<id>.js`) — B, C, D

```js
export async function build(ctx) -> MapData
// ctx = { THREE, engine, root, kit, assets, quality }
```
Build everything under `ctx.root` using `ctx.kit` (read `js/maps/kit.js` — room/wall-with-gaps/floor/
stairs/box/cyl/model/collider/lights/hider/seeker/hideSpot/data). Return `kit.data({...})`:

```js
{
  spawns: { hider: Vector3[≥12], seeker: Vector3[≥4] },   // feet positions on walkable floor
  hideSpots: [{ pos, normal, kind:'floor'|'wall'|'ceiling'|'nook' }] (≥ 40, spread over the whole map;
             pos = where the body's centre goes, normal = away from the surface it hugs),
  seekerWait: { pos: Vector3, look: Vector3 },            // where hunters stand blind during hide time
  environment: {
    background: Color|Texture, fog?: THREE.Fog, exposure=1, envIntensity=1,
    probe: [x,y,z],            // ALWAYS set: engine bakes a reflection/ambient cube map of your map here
    bloom?: { strength, radius, threshold }, ao?: { aoRadius, intensity, distanceFalloff }
  },
  update?(dt, t), dispose?()
}
```
Rules:
- Collision: every mesh collides unless `userData.collide === false`. Use `kit.model(id, { collide:'box' })`
  (default) for detailed props; `collide:false` for chandeliers, rugs, hanging stuff above 2.2 m, etc.
  Nothing horizontal in the 0.3–1.8 m band that isn't meant to block (railings = draw, collide:false +
  kit.collider thin box only if needed). Doorways ≥ 1.6 m wide, ≥ 2.2 m tall.
- Lights: ≤ 2 shadow casters per map (kit counts), up to ~24 non-shadow point lights, emissive bulbs +
  bloom for fixtures. Always set `environment.probe` near the map's visual centre.
- Size: comparable to the real map — big enough for 8–14 players to hide (≥ 35×35 m of playable area,
  multiple rooms/levels), dense with props (the game is about blending into *detail*).
- Performance: ≤ ~400 draw calls in any view, ≤ ~1.5 M triangles. kit merges static boxes per material.
- Texture density: floors/walls use real-world repeats (kit UVs are in metres).
- Deliverable check: `node tools/shot.mjs "view=map&map=<id>&cam=…&look=…" <scratch>/x.png` from at
  least 6 viewpoints with zero console errors, compared side by side with the reference frames.

## 8. Character & paint (`js/char/*`, `js/ui/paintpanel.js`, `js/ui/posewheel.js`) — A

```js
import { Mannequin, POSES } from './js/char/mannequin.js';
const m = new Mannequin({ engine, name, isLocal=false })
m.root                    // THREE.Group at the FEET, forward +Z; add to engine.scene
m.height                  // ≈1.25
m.bodyMeshes              // meshes to raycast for hits (userData.actorId set by owner via m.setActorId(id))
m.setActorId(id)
m.update(dt)              // animation
m.setLocomotion({ speed, grounded, crouch, climbing, surfaceNormal, airborne })  // drives idle/walk/run/crouch/climb/jump
m.setPose(poseId|null)    // null = locomotion; POSES = [{ id, name }] (8 wheel poses)
m.rotatePose(deltaRad)    // Q/E
m.setShadow(bool)         // V
m.setXray(bool)           // visible through walls as a flat outline (for spectators / x-ray toggle)
m.setTeamLook('hider'|'hunter')  // hunters are the same mannequin, but tinted red nameplate etc.
m.flashCaught()           // hit reaction
m.paint                   // PaintSurface
m.dispose()

// PaintSurface (GPU atlas, seamless 3-D brush — stamps are spheres in body space, so strokes cross UV seams)
paint.brush = { color: THREE.Color (sRGB), alpha: 0..1, metallic: 0..1, roughness: 0..1, size: metres, hardness: 0..1 }
paint.stamp(worldPoint)          // one brush dab at a point on the body (world space; converted to rest pose)
paint.stroke(worldA, worldB)     // spaced dabs
paint.fill(color, metallic?, roughness?)
paint.bakeCamo(viewCamera, { strength=1, noise=0, blur=0 })   // project what the scene looks like BEHIND the
                                 // body from viewCamera onto every visible texel (bots use this = "painting")
paint.undo() / paint.redo() / paint.snapshot()
paint.texture / paint.materialTexture                            // live textures on the body material

import { pickSurface } from './js/char/eyedropper.js';
pickSurface(engine, clientX, clientY, { ignore: [meshes] }) -> { color: THREE.Color, metallic, roughness, point, normal } | null
// albedo of the surface under the pixel (texture texel × material colour), NOT the lit pixel.

import { PaintPanel } from './js/ui/paintpanel.js';   // exact replica of the top-left panel + hint card
const panel = new PaintPanel(uiRoot, paint); panel.show(); panel.hide(); panel.pushHistory(color)
import { PoseWheel } from './js/ui/posewheel.js';
const wheel = new PoseWheel(uiRoot, POSES); wheel.open(); wheel.close(); wheel.on('select', poseId)
```
The body material must look like the reference: smooth, slightly glossy white vinyl (roughness ~0.55)
before painting; painted texels use the painted metallic/roughness. Paint atlas ≥ 1024² (2048² on high).

## 9. Movement, cameras, hunters, bots (`js/core/physics.js`, `js/game/*`) — F

```js
import { Physics } from './js/core/physics.js';
const phys = new Physics(engine); phys.build(map)       // static BVH from all collidable meshes in map.root
phys.raycast(origin, dir, far, { ignoreActors }) -> { point, normal, distance, object } | null
phys.lineOfSight(a, b) -> bool
phys.buriedRatio(mannequin) -> 0..1                     // how much of the body is inside geometry

import { PlayerController } from './js/game/player.js';
const pc = new PlayerController({ engine, physics, input, actor })   // drives actor.mannequin
pc.setRole('hider'|'hunter'|'spectator')   // hider: third-person orbit cam; hunter: first-person + shotgun
pc.setFrozen(bool)                          // hunters during hide time
pc.paintMode (bool, toggled by app on F)    // cursor free; LMB paints own body; RMB/ALT orbit; wheel zoom; RMB+wheel brush size; SPACE hold eyedropper
pc.freeCam (bool, toggled by app on 5)
pc.camera                                   // the camera app passes to engine.setCamera
pc.update(dt)
pc.on('shoot', {origin, dir}) pc.on('hit', {actorId}) ...

import { Bots } from './js/game/bots.js';
const bots = new Bots({ engine, physics, round }); bots.update(dt)
// hider bots: pick a hideSpot (or climb a wall/ceiling), walk there with nav, pose, then paint via
//   mannequin.paint.bakeCamo(from a likely hunter viewpoint, strength by difficulty) + a few imperfect strokes.
// hunter bots: sweep the map, score each visible hider by REAL visual contrast (render-based or albedo
//   comparison vs. the surfaces behind it: see perception.js), shoot when suspicious; also shoot some
//   false positives. Difficulty presets easy/normal/hard.
```
Seeker gun: first-person pump shotgun built procedurally (no asset exists) with the splotchy red/green
paint look, muzzle flash, pellet sparks + small impact decals, recoil + pump animation, 0.9 s cycle.

## 10. Round, actors, HUD, menus, audio (`js/game/app.js`, `round.js`, `actors.js`, `js/ui/*`) — E

```js
// actors.js
Actor = { id, name, isLocal, isBot, team: 'hider'|'hunter', caught, score, likes, closeCalls,
          mannequin, controller /* PlayerController or bot brain */, spotCount /* missed-spot */ }
// round.js — pure state machine, no DOM
const round = new Round({ settings, actors, map }); round.phase: 'lobby'|'hide'|'search'|'answer'|'result'
round.timeLeft; round.on('phase', ...); round.catch(hunterId, hiderId); round.update(dt)
SETTINGS defaults: { mode:'infection', hunters:1, hunterWait:60, paintTime:60, searchTime:300,
  answerCheck:30, forcedTaunt:0, showMissedSpot:true, filters:{monochrome:false,horror:false,mosaic:false},
  map:'mansion', bots:7, botDifficulty:'normal' }
// app.js — boots everything: title → lobby map → Configure Map → round on chosen map → results → lobby.
//   Wires keys to systems; owns engine.setCamera; exposes window.__mc.app for the harness, incl.
//   __mc.app.debug = { skipTo(phase), setTime(s), role(r), startRound(settings) }.
```
HUD must reproduce every element in §1 with the same text, placement, colours and key-caps. Font:
'M PLUS Rounded 1c' (loaded in index.html). Audio: WebAudio-synthesised SFX (shotgun, pump, taunt
whistle, UI clicks, countdown ticks, "Search Start!" stinger, found jingle) + a light looping BGM.

## 11. Definition of done (every agent)
- Your harness screenshots at 1920×1080 look like the reference frames. Zero console errors.
- You read your own code paths once more for calls to methods that don't exist (grep before calling).
- A short `NOTES-<letter>.md` in the repo root: what you built, how to test it, known gaps.
