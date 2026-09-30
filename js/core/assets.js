// Asset loading with caches. See SPEC.md §Assets.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const hdrLoader = new HDRLoader();

class Assets {
  constructor() {
    this.textures = new Map();
    this.gltfs = new Map();
    this.materials = new Map();
    this.hdris = new Map();
    this._pixels = new WeakMap();
    this.maxAnisotropy = 8;
  }

  /** Load (cached) texture. opts: { srgb=true, repeat:[x,y], wrap=true } */
  texture(url, opts = {}) {
    const key = `${url}|${opts.srgb !== false}|${opts.repeat ?? ''}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const t = texLoader.load(url, undefined, undefined, () => console.warn('[assets] missing texture', url));
    t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (opts.wrap !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.anisotropy = this.maxAnisotropy;
    this.textures.set(key, t);
    return t;
  }

  /**
   * PBR material from a Poly Haven texture folder assets/tex/<id>/{diff,nor,arm}.jpg
   * (download it first: node tools/polyhaven.mjs tex <id>).
   * opts: { repeat:[x,y], color, roughness, metalness, normalScale, tint, emissive, side, name }
   * Materials are cached by id+opts, so identical calls share one material (keeps draw calls mergeable).
   */
  pbr(id, opts = {}) {
    const key = `${id}|${JSON.stringify(opts)}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const base = `assets/tex/${id}/`;
    const rep = opts.repeat || [1, 1];
    const m = new THREE.MeshStandardMaterial({
      map: this.texture(base + 'diff.jpg', { repeat: rep }),
      normalMap: opts.noNormal ? null : this.texture(base + 'nor.jpg', { srgb: false, repeat: rep }),
      roughnessMap: opts.noArm ? null : this.texture(base + 'arm.jpg', { srgb: false, repeat: rep }),
      metalnessMap: opts.metalMap ? this.texture(base + 'arm.jpg', { srgb: false, repeat: rep }) : null,
      aoMap: null,
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? 1,
      metalness: opts.metalness ?? 0,
      side: opts.side ?? THREE.FrontSide,
      emissive: opts.emissive ?? 0x000000,
    });
    if (opts.normalScale != null) m.normalScale.setScalar(opts.normalScale);
    m.name = opts.name || id;
    this.materials.set(key, m);
    return m;
  }

  /** Cached simple material. */
  mat(key, params) {
    if (this.materials.has(key)) return this.materials.get(key);
    const m = new THREE.MeshStandardMaterial(params);
    m.name = key;
    this.materials.set(key, m);
    return m;
  }

  /** Material from a procedural canvas: draw(ctx, w, h). Cached by key. */
  canvasMaterial(key, w, h, draw, params = {}, repeat = [1, 1]) {
    if (this.materials.has(key)) return this.materials.get(key);
    const tex = this.canvasTexture(key, w, h, draw, repeat);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, ...params });
    m.name = key;
    this.materials.set(key, m);
    return m;
  }

  canvasTexture(key, w, h, draw, repeat = [1, 1]) {
    const k = `canvas:${key}`;
    if (this.textures.has(k)) return this.textures.get(k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = this.maxAnisotropy;
    this.textures.set(k, t);
    return t;
  }

  /**
   * Load a glTF once; returns a fresh clone each call (SkeletonUtils-safe).
   * path e.g. 'assets/models/Barrel_01/Barrel_01_1k.gltf'
   * or shorthand model id 'Barrel_01' (resolves to the 1k Poly Haven layout).
   */
  async gltf(pathOrId, { castShadow = true, receiveShadow = true } = {}) {
    const path = pathOrId.includes('/') ? pathOrId : `assets/models/${pathOrId}/${pathOrId}_1k.gltf`;
    if (!this.gltfs.has(path)) {
      this.gltfs.set(path, gltfLoader.loadAsync(path).then((g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = castShadow;
            o.receiveShadow = receiveShadow;
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of ms) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]) m[k].anisotropy = this.maxAnisotropy;
          }
        });
        return g;
      }).catch((e) => { console.warn('[assets] gltf failed', path, e.message); return null; }));
    }
    const g = await this.gltfs.get(path);
    if (!g) { const ph = new THREE.Group(); ph.name = `missing:${path}`; return ph; }
    return SkeletonUtils.clone(g.scene);
  }

  /** Equirect HDRI -> PMREM env map. id = Poly Haven hdri id in assets/hdri/<id>.hdr */
  async hdri(id, renderer) {
    if (this.hdris.has(id)) return this.hdris.get(id);
    const p = hdrLoader.loadAsync(`assets/hdri/${id}.hdr`).then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromEquirectangular(t).texture;
      pm.dispose();
      return { equirect: t, env };
    });
    this.hdris.set(id, p);
    return p;
  }

  /**
   * CPU pixels for a texture's image (for the 3D eyedropper / bot colour matching).
   * Returns { data:Uint8ClampedArray, w, h } or null if the image is not ready.
   */
  pixels(texture, maxSize = 256) {
    if (!texture?.image) return null;
    const img = texture.image;
    let cached = this._pixels.get(img);
    if (cached) return cached;
    const iw = img.width || img.videoWidth, ih = img.height || img.videoHeight;
    if (!iw || !ih) return null;
    const s = Math.min(1, maxSize / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    try { g.drawImage(img, 0, 0, w, h); } catch { return null; }
    cached = { data: g.getImageData(0, 0, w, h).data, w, h };
    this._pixels.set(img, cached);
    return cached;
  }

  /** Albedo (linear-ish sRGB 0..1 THREE.Color) of material at uv, including texture repeat/offset. */
  albedoAt(material, uv, out = new THREE.Color()) {
    const m = Array.isArray(material) ? material[0] : material;
    out.set(0xffffff);
    if (m?.color) out.copy(m.color);
    const t = m?.map;
    if (t && uv) {
      const px = this.pixels(t);
      if (px) {
        t.updateMatrix();
        const v = new THREE.Vector2(uv.x, uv.y).applyMatrix3(t.matrix);
        let x = v.x, y = v.y;
        x = x - Math.floor(x); y = y - Math.floor(y);
        if (t.flipY !== false) y = 1 - y;
        const i = (Math.min(px.h - 1, Math.floor(y * px.h)) * px.w + Math.min(px.w - 1, Math.floor(x * px.w))) * 4;
        const c = new THREE.Color().setRGB(px.data[i] / 255, px.data[i + 1] / 255, px.data[i + 2] / 255, THREE.SRGBColorSpace);
        out.multiply(c);
      }
    }
    return out;
  }
}

export const assets = new Assets();
