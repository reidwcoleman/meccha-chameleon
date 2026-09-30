// Renderer, scene, camera, post chain, main loop, map loading. See SPEC.md §Engine.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { N8AOPass } from 'n8ao';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { Emitter } from './emitter.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const QUALITY = {
  low: { pr: 0.75, shadows: 1024, ao: false, bloom: true, smaa: false },
  medium: { pr: 1, shadows: 2048, ao: true, aoHalf: true, bloom: true, smaa: true },
  high: { pr: 1.5, shadows: 2048, ao: true, aoHalf: false, bloom: true, smaa: true },
};

// Filters from the "Configure Map" menu: Monochrome / Horror / Mosaic.
const FilterShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uMono: { value: 0 },
    uHorror: { value: 0 },
    uMosaic: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 }, // white screen flash (hit / round start)
    uDim: { value: 0 },   // blackout for waiting hunters (0..1)
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uMono, uHorror, uMosaic, uTime, uFlash, uDim;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uMosaic > 0.5) { vec2 cell = vec2(uRes.y / 90.0); uv = (floor(uv * uRes / cell) + 0.5) * cell / uRes; }
      vec4 c = texture2D(tDiffuse, uv);
      if (uMono > 0.5) { float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = vec3(l); }
      if (uHorror > 0.5) {
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        vec3 h = mix(vec3(l) * vec3(0.55, 0.62, 0.7), c.rgb * 0.5, 0.25);
        float d = distance(vUv, vec2(0.5)); h *= smoothstep(0.85, 0.2, d);
        h += (hash(vUv * uRes + uTime) - 0.5) * 0.06;
        c.rgb = h;
      }
      c.rgb = mix(c.rgb, vec3(1.0), uFlash);
      c.rgb *= 1.0 - uDim;
      gl_FragColor = c;
    }`,
};

export class Engine extends Emitter {
  constructor(container, opts = {}) {
    super();
    this.container = container;
    this.qualityName = opts.quality || 'high';
    this.q = QUALITY[this.qualityName] || QUALITY.high;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pr));
    r.setSize(container.clientWidth, container.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    r.domElement.id = 'gl';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.05, 400);
    this.camera.position.set(0, 1.6, 4);
    this.scene.add(this.camera); // so view-models parented to the camera render

    const pmrem = (this.pmrem = new THREE.PMREMGenerator(r));
    this.defaultEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.defaultEnv;
    this.scene.environmentIntensity = 1;

    this._buildComposer();

    this.timer = new THREE.Timer();
    this.timer.connect?.(document);
    this.time = 0;
    this.dt = 0;
    this.paused = false;
    this._updaters = [];
    this.map = null;

    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this._frame());
  }

  _buildComposer() {
    const r = this.renderer;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    const c = (this.composer = new EffectComposer(r, rt));
    if (this.q.ao) {
      const ao = (this.aoPass = new N8AOPass(this.scene, this.camera, w, h));
      ao.configuration.aoRadius = 0.9;
      ao.configuration.distanceFalloff = 1.0;
      ao.configuration.intensity = 4.0;
      ao.configuration.aoSamples = 16;
      ao.configuration.denoiseSamples = 8;
      ao.configuration.denoiseRadius = 6;
      ao.configuration.halfRes = !!this.q.aoHalf;
      ao.configuration.gammaCorrection = false;
      ao.configuration.screenSpaceRadius = false;
      c.addPass(ao);
    } else {
      c.addPass((this.renderPass = new RenderPass(this.scene, this.camera)));
    }
    if (this.q.bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.55, 0.92);
      c.addPass(this.bloomPass);
    }
    this.outputPass = new OutputPass();
    c.addPass(this.outputPass);
    this.filterPass = new ShaderPass(FilterShader);
    c.addPass(this.filterPass);
    if (this.q.smaa) c.addPass((this.smaaPass = new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio())));
  }

  /** Swap the camera used for rendering (seeker first-person vs. hider orbit vs. free cam). */
  setCamera(cam) {
    if (cam.parent !== this.scene && !cam.parent) this.scene.add(cam);
    this.camera = cam;
    if (this.aoPass) this.aoPass.camera = cam;
    if (this.renderPass) this.renderPass.camera = cam;
    this.resize();
  }

  setFilters({ monochrome = false, horror = false, mosaic = false } = {}) {
    const u = this.filterPass.uniforms;
    u.uMono.value = monochrome ? 1 : 0;
    u.uHorror.value = horror ? 1 : 0;
    u.uMosaic.value = mosaic ? 1 : 0;
  }
  set flash(v) { this.filterPass.uniforms.uFlash.value = v; }
  get flash() { return this.filterPass.uniforms.uFlash.value; }
  set dim(v) { this.filterPass.uniforms.uDim.value = v; }
  get dim() { return this.filterPass.uniforms.uDim.value; }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.aoPass?.setSize(w, h);
    this.smaaPass?.setSize(w * pr, h * pr);
    this.filterPass.uniforms.uRes.value.set(w * pr, h * pr);
    this.emit('resize', { w, h });
  }

  /** fn(dt, time) every frame; returns an unsubscribe function. Lower order runs first. */
  onUpdate(fn, order = 0) {
    const item = { fn, order };
    this._updaters.push(item);
    this._updaters.sort((a, b) => a.order - b.order);
    return () => { const i = this._updaters.indexOf(item); if (i >= 0) this._updaters.splice(i, 1); };
  }

  _frame() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.dt = dt;
    if (!this.paused) {
      this.time += dt;
      this.filterPass.uniforms.uTime.value = this.time;
      for (const u of this._updaters.slice()) u.fn(dt, this.time);
      this.map?.update?.(dt, this.time);
    }
    this.composer.render(dt);
    this.emit('frame', dt);
  }

  /** Render once right now (used by harness screenshots). */
  renderNow() { this.composer.render(0); }

  /**
   * Load a map module and make it the active world. Returns MapData (SPEC.md §Map contract).
   * `ctx` extras are merged into the build context.
   */
  async loadMap(id, extras = {}) {
    const { MAPS } = await import('../maps/index.js');
    const entry = MAPS.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown map ${id}`);
    this.unloadMap();
    const mod = await entry.load();
    const { Kit } = await import('../maps/kit.js');
    const assets = (await import('./assets.js')).assets;
    const root = new THREE.Group();
    root.name = `map:${id}`;
    const kit = new Kit(root, assets, this);
    const ctx = { THREE, engine: this, root, kit, assets, quality: this.qualityName, ...extras };
    const data = await mod.build(ctx);
    data.id = id;
    data.name = entry.name;
    data.root = data.root || root;
    if (!data.root.parent) this.scene.add(data.root);
    kit.finish?.();
    this._applyEnvironment(data.environment || {});
    // BVH for fast raycasts on every static mesh (eyedropper, shots, line of sight).
    data.root.updateMatrixWorld(true);
    data.root.traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.boundsTree && o.geometry.attributes.position) {
        try { o.geometry.computeBoundsTree(); } catch { /* non-indexable geometry */ }
      }
    });
    if (!data.bounds) data.bounds = new THREE.Box3().setFromObject(data.root);
    this.map = data;
    this.emit('map', data);
    return data;
  }

  unloadMap() {
    if (!this.map) return;
    const root = this.map.root;
    this.map.dispose?.();
    this.scene.remove(root);
    root.traverse((o) => {
      if (o.isMesh) { o.geometry?.disposeBoundsTree?.(); o.geometry?.dispose(); }
    });
    this.map = null;
    this.scene.fog = null;
    this.scene.background = null;
  }

  _applyEnvironment(env) {
    const s = this.scene;
    s.environment = env.envMap || this.defaultEnv;
    s.environmentIntensity = env.envIntensity ?? 1;
    s.background = env.background ?? new THREE.Color(0x000000);
    s.backgroundIntensity = env.backgroundIntensity ?? 1;
    s.fog = env.fog || null;
    this.renderer.toneMappingExposure = env.exposure ?? 1.0;
    if (this.bloomPass) {
      this.bloomPass.strength = env.bloom?.strength ?? 0.28;
      this.bloomPass.radius = env.bloom?.radius ?? 0.55;
      this.bloomPass.threshold = env.bloom?.threshold ?? 0.92;
    }
    if (this.aoPass && env.ao) Object.assign(this.aoPass.configuration, env.ao);
    // Reflection/ambient probe baked from the map itself (much better than a generic env).
    if (env.probe) {
      const probes = Array.isArray(env.probe) ? env.probe : [env.probe];
      s.environment = this.bakeProbe(probes[0]);
      if (env.probeBounce) s.environment = this.bakeProbe(probes[0]);
    }
  }

  /** Render a cube map of the current scene at `pos` and return a PMREM env texture. */
  bakeProbe(pos, { size = 256, near = 0.1, far = 300 } = {}) {
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(near, far, rt);
    cc.position.set(pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2]);
    this.scene.add(cc);
    const hidden = [];
    this.scene.traverse((o) => { if (o.userData.noProbe && o.visible) { o.visible = false; hidden.push(o); } });
    cc.update(this.renderer, this.scene);
    for (const o of hidden) o.visible = true;
    this.scene.remove(cc);
    const env = this.pmrem.fromCubemap(rt.texture).texture;
    rt.dispose();
    return env;
  }
}
