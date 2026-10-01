// GPU paint atlas for one mannequin. Brush dabs are spheres in rest-pose body space, rasterised into the
// body's UV atlas, so strokes run seamlessly across UV chart borders. Two attachments: albedo (sRGB)
// and a metal/rough map (G = roughness, B = metalness).
import * as THREE from 'three';
import { getBody, HIT_CAPSULES } from './body.js';

const BASE_COLOR = new THREE.Color(0xeeeeea);
const BASE_ROUGH = 0.5;

const STAMP_VERT = /* glsl */`
uniform vec3 uOff;
varying vec3 vRest;
void main(){ vRest = position; gl_Position = vec4(uv * 2.0 - 1.0 + uOff.xy, uOff.z, 1.0); }`;
const STAMP_FRAG = /* glsl */`
precision highp float;
uniform vec3 uCenter; uniform float uRadius; uniform float uHardness;
uniform vec4 uColor; uniform vec2 uMR; uniform float uFill;
varying vec3 vRest;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main(){
  float a = uColor.a;
  if (uFill < 0.5) {
    float d = distance(vRest, uCenter) / uRadius;
    if (d >= 1.0) discard;
    a *= 1.0 - smoothstep(min(uHardness, 0.97), 1.0, d);
  }
  o0 = vec4(uColor.rgb, a);
  o1 = vec4(0.0, uMR.x, uMR.y, a);
}`;

const BAKE_VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform mat4 uVP; uniform vec3 uOff;
varying vec4 vClip; varying vec3 vN; varying vec3 vW;
void main(){
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vW = wp.xyz;
  vClip = uVP * wp;
  vN = normalize(mat3(modelMatrix) * objectNormal);
  gl_Position = vec4(uv * 2.0 - 1.0 + uOff.xy, uOff.z, 1.0);
}`;
const BAKE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uScene; uniform vec3 uCam; uniform float uStrength; uniform float uNoise; uniform float uSeed;
varying vec4 vClip; varying vec3 vN; varying vec3 vW;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 ndc = vClip.xyz / vClip.w;
  vec2 suv = ndc.xy * 0.5 + 0.5;
  vec3 v = normalize(uCam - vW);
  float facing = dot(normalize(vN), v);
  if (vClip.w <= 0.0 || suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 || facing < 0.08) discard;
  vec3 c = texture2D(uScene, suv).rgb;
  float n = (hash(gl_FragCoord.xy + uSeed) - 0.5) * uNoise;
  c = max(c * (1.0 + n), 0.0);
  float a = uStrength * smoothstep(0.08, 0.3, facing);
  o0 = vec4(c, a);
  o1 = vec4(0.0, 0.0, 0.0, 0.0);
}`;

const BLIT_FRAG = /* glsl */`
precision highp float;
uniform sampler2D t0; uniform sampler2D t1; varying vec2 vUv;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main(){ o0 = texture2D(t0, vUv); o1 = texture2D(t1, vUv); }`;
const BLIT_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BLEND = {
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  depthTest: true, depthWrite: true, depthFunc: THREE.LessDepth, side: THREE.DoubleSide,
};

function makeRT(res) {
  const rt = new THREE.WebGLRenderTarget(res, res, {
    count: 2, depthBuffer: true, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
  });
  rt.textures[0].colorSpace = THREE.SRGBColorSpace;
  rt.textures[1].colorSpace = THREE.NoColorSpace;
  return rt;
}

// Cached unlit (albedo-only) twins of scene materials, for camouflage baking.
const unlitCache = new WeakMap();
function unlitOf(m) {
  let u = unlitCache.get(m);
  if (u) return u;
  u = new THREE.MeshBasicMaterial({
    map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, vertexColors: !!m.vertexColors,
    transparent: !!m.transparent, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0,
    side: m.side ?? THREE.FrontSide, fog: false, toneMapped: false,
  });
  if (!m.map && m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.05) u.color.copy(m.emissive);
  unlitCache.set(m, u);
  return u;
}

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class PaintSurface {
  constructor(engine, mannequin, { res = 1024 } = {}) {
    this.engine = engine; this.owner = mannequin; this.res = res;
    this.brush = { color: new THREE.Color(1, 1, 1), alpha: 1, metallic: 0, roughness: 0.5, size: 0.08, hardness: 0.6 };
    this.rt = makeRT(res);
    this.texture = this.rt.textures[0];
    this.materialTexture = this.rt.textures[1];
    this._undo = []; this._redo = [];
    this._build();
    this.fill(BASE_COLOR, 0, BASE_ROUGH);
  }

  _build() {
    const body = getBody();
    const g = body.geometry;
    const texel = 2 / this.res;
    const OFFS = [[0, 0, -0.5], [1.6, 0, 0], [-1.6, 0, 0], [0, 1.6, 0], [0, -1.6, 0], [1.4, 1.4, 0], [-1.4, 1.4, 0], [1.4, -1.4, 0], [-1.4, -1.4, 0]];
    const variants = (base) => OFFS.map(([x, y, z]) => {
      const m = base.clone();
      m.uniforms = { ...base.uniforms, uOff: { value: new THREE.Vector3(x * texel, y * texel, z) } };
      return m;
    });
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this._stampMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: STAMP_VERT, fragmentShader: STAMP_FRAG, ...BLEND,
      uniforms: {
        uCenter: { value: new THREE.Vector3() }, uRadius: { value: 0.05 }, uHardness: { value: 0.5 },
        uColor: { value: new THREE.Vector4(1, 1, 1, 1) }, uMR: { value: new THREE.Vector2(0.5, 0) }, uFill: { value: 0 },
        uOff: { value: new THREE.Vector3() },
      },
    });
    this._scene = new THREE.Scene();
    this._stampMats = variants(this._stampMat);
    for (const m of this._stampMats) { const o = new THREE.Mesh(g, m); o.frustumCulled = false; this._scene.add(o); }

    // full-texture fill (also paints the gutters)
    this._fillMat = this._stampMat.clone();
    this._fillMat.uniforms = this._stampMat.uniforms;
    Object.assign(this._fillMat, { depthTest: false, depthWrite: false });
    this._fillScene = new THREE.Scene();
    const fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._fillMat);
    fq.frustumCulled = false;
    this._fillScene.add(fq);

    this._bakeMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, ...BLEND,
      uniforms: {
        uVP: { value: new THREE.Matrix4() }, uScene: { value: null }, uCam: { value: new THREE.Vector3() },
        uStrength: { value: 1 }, uNoise: { value: 0 }, uSeed: { value: 0 }, uOff: { value: new THREE.Vector3() },
      },
    });
    this._bakeScene = new THREE.Scene();
    this._bakeMats = variants(this._bakeMat);

    this._blitMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLIT_VERT, fragmentShader: BLIT_FRAG,
      uniforms: { t0: { value: null }, t1: { value: null } }, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this._blitScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._blitMat);
    quad.frustumCulled = false;
    this._blitScene.add(quad);
  }

  _render(scene, camera, target = this.rt) {
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevShadow = r.shadowMap.autoUpdate;
    r.autoClear = false; r.shadowMap.autoUpdate = false;
    r.setRenderTarget(target);
    r.clearDepth();
    r.render(scene, camera);
    r.setRenderTarget(prevRT); r.autoClear = prevAuto; r.shadowMap.autoUpdate = prevShadow;
  }

  // ------------------------------------------------------------ world -> rest pose
  _skinMatrices() {
    const sk = this.owner.skeleton;
    this.owner.root.updateMatrixWorld(true);
    if (!this._skin) this._skin = sk.bones.map(() => new THREE.Matrix4());
    for (let i = 0; i < sk.bones.length; i++) this._skin[i].multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]);
    return this._skin;
  }

  /** Rest-space point on the body nearest to a world point (the bone chosen by capsule distance). */
  worldToRest(p, out = new THREE.Vector3(), skin = this._skinMatrices()) {
    let best = Infinity, bi = 0;
    for (const [b, A, B, r] of HIT_CAPSULES) {
      _a.copy(A).applyMatrix4(skin[b]); _b.copy(B).applyMatrix4(skin[b]);
      _c.copy(_b).sub(_a);
      const l2 = _c.lengthSq();
      const t = l2 > 1e-9 ? THREE.MathUtils.clamp(_c.dot(_m_sub(p, _a)) / l2, 0, 1) : 0;
      const d = _a.addScaledVector(_c, t).distanceTo(p) - r;
      if (d < best) { best = d; bi = b; }
    }
    return out.copy(p).applyMatrix4(_m.copy(skin[bi]).invert());
  }

  // ------------------------------------------------------------ brush
  _dab(restPoint, size, hardness, color, alpha, metallic, roughness, fill = 0) {
    const u = this._stampMat.uniforms;
    u.uCenter.value.copy(restPoint); u.uRadius.value = Math.max(0.004, size * 0.5); u.uHardness.value = hardness;
    u.uColor.value.set(color.r, color.g, color.b, alpha); u.uMR.value.set(roughness, metallic); u.uFill.value = fill;
    this._render(this._scene, this._cam);
  }

  stamp(worldPoint) {
    const b = this.brush;
    this._dab(this.worldToRest(worldPoint), b.size, b.hardness, b.color, b.alpha, b.metallic, b.roughness);
    this._mipDirty = true;
  }

  stroke(worldA, worldB) {
    const b = this.brush;
    const dist = worldA.distanceTo(worldB);
    const step = Math.max(0.004, b.size * 0.22);
    const n = Math.min(40, Math.max(1, Math.ceil(dist / step)));
    const skin = this._skinMatrices();
    const rp = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 1; i <= n; i++) {
      p.lerpVectors(worldA, worldB, i / n);
      this.worldToRest(p, rp, skin);
      this._dab(rp, b.size, b.hardness, b.color, b.alpha, b.metallic, b.roughness);
    }
  }

  fill(color, metallic = this.brush.metallic, roughness = this.brush.roughness) {
    const u = this._stampMat.uniforms;
    u.uColor.value.set(color.r, color.g, color.b, 1); u.uMR.value.set(roughness, metallic); u.uFill.value = 1;
    this._render(this._fillScene, this._cam);
    u.uFill.value = 0;
  }

  /** Project the albedo of the scene behind the body (seen from viewCamera) onto all visible texels. */
  bakeCamo(viewCamera, { strength = 1, noise = 0, blur = 0 } = {}) {
    const eng = this.engine, r = eng.renderer, scene = eng.scene;
    viewCamera.updateMatrixWorld(true);
    const aspect = viewCamera.aspect || 1.6;
    const W = 1280, H = Math.max(256, Math.round(W / aspect));
    if (!this._sceneRT || this._sceneRT.width !== W || this._sceneRT.height !== H) {
      this._sceneRT?.dispose();
      this._sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    }
    // 1) albedo-only render of the world without any mannequin
    const swapped = [], hidden = [];
    scene.traverse((o) => {
      if (o.userData?.mannequinBody || o.userData?.noProbe || o.userData?.noCamo) { if (o.visible) { o.visible = false; hidden.push(o); } return; }
      if (o.isMesh && o.visible) {
        const m = o.material;
        if (Array.isArray(m)) { swapped.push([o, m]); o.material = m.map(unlitOf); }
        else if (m && !m.isShaderMaterial && !m.isMeshBasicMaterial) { swapped.push([o, m]); o.material = unlitOf(m); }
      }
    });
    const prevRT = r.getRenderTarget(), prevShadow = r.shadowMap.autoUpdate, prevTM = r.toneMapping;
    r.shadowMap.autoUpdate = false; r.toneMapping = THREE.NoToneMapping;
    r.setRenderTarget(this._sceneRT); r.clear();
    r.render(scene, viewCamera);
    r.setRenderTarget(prevRT); r.shadowMap.autoUpdate = prevShadow; r.toneMapping = prevTM;
    for (const [o, m] of swapped) o.material = m;
    for (const o of hidden) o.visible = true;

    // 2) project onto the skinned body in UV space
    const mesh = this.owner.mesh;
    if (!this._bakeMeshes) {
      this._bakeMeshes = this._bakeMats.map((m) => {
        const b = new THREE.SkinnedMesh(mesh.geometry, m);
        b.frustumCulled = false; b.matrixAutoUpdate = false; this._bakeScene.add(b);
        return b;
      });
    }
    mesh.updateMatrixWorld(true);
    for (const b of this._bakeMeshes) {
      b.matrix.copy(mesh.matrixWorld);
      b.bind(this.owner.skeleton, mesh.bindMatrix);
    }
    this._bakeScene.updateMatrixWorld(true);
    const u = this._bakeMat.uniforms;
    u.uVP.value.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse);
    u.uScene.value = this._sceneRT.texture;
    u.uCam.value.setFromMatrixPosition(viewCamera.matrixWorld);
    u.uStrength.value = strength; u.uNoise.value = noise; u.uSeed.value = Math.random() * 100;
    this._render(this._bakeScene, this._cam);
    this._mipDirty = true;
  }

  // ------------------------------------------------------------ history
  _copyRT() {
    const dst = makeRT(this.res);
    this._blitMat.uniforms.t0.value = this.rt.textures[0];
    this._blitMat.uniforms.t1.value = this.rt.textures[1];
    this._render(this._blitScene, this._cam, dst);
    return dst;
  }
  _restore(src) {
    this._blitMat.uniforms.t0.value = src.textures[0];
    this._blitMat.uniforms.t1.value = src.textures[1];
    this._render(this._blitScene, this._cam, this.rt);
  }
  snapshot() {
    this._undo.push(this._copyRT());
    if (this._undo.length > 12) this._undo.shift().dispose();
    for (const s of this._redo) s.dispose();
    this._redo.length = 0;
  }
  undo() {
    if (!this._undo.length) return false;
    this._redo.push(this._copyRT());
    const s = this._undo.pop();
    this._restore(s); s.dispose();
    return true;
  }
  redo() {
    if (!this._redo.length) return false;
    this._undo.push(this._copyRT());
    const s = this._redo.pop();
    this._restore(s); s.dispose();
    return true;
  }

  dispose() {
    this.rt.dispose(); this._sceneRT?.dispose();
    for (const s of [...this._undo, ...this._redo]) s.dispose();
    for (const m of [...this._stampMats, ...this._bakeMats, this._stampMat, this._fillMat, this._bakeMat, this._blitMat]) m.dispose();
  }
}

function _m_sub(p, a) { return _tmp.copy(p).sub(a); }
const _tmp = new THREE.Vector3();
