// Paint panel (top-left, Paint Mode) — replica of the real game's colour editor + the key-hint card under it.
// API: const panel = new PaintPanel(uiRoot, paint); panel.show(); panel.hide(); panel.pushHistory(color);
//      panel.setColor(THREE.Color); panel.on('color', c) / 'eyedrop' / 'metal' / 'rough'
// Colour maths follows the game: R G B and H S V fields are LINEAR (0..1); "Hex sRGB" is the display value.
import * as THREE from 'three';
import { Emitter } from '../core/emitter.js';
import { ICONS } from './icons.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));

function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; } else if (h < 2) { r = x; g = c; } else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; } else if (h < 5) { r = x; b = c; } else { r = c; b = x; }
  return [r + m, g + m, b + m];
}
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, mx > 1e-6 ? d / mx : 0, mx];
}
const lin2srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const srgb2lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const css = (r, g, b) => `rgb(${Math.round(clamp01(lin2srgb(r)) * 255)},${Math.round(clamp01(lin2srgb(g)) * 255)},${Math.round(clamp01(lin2srgb(b)) * 255)})`;
const hex2 = (x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0').toUpperCase();
const f3 = (x) => (Math.round(x * 1000) / 1000).toFixed(3);

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class PaintPanel extends Emitter {
  constructor(root, paint) {
    super();
    this.paint = paint;
    this.root = root;
    this.h = 38.4; this.s = 0.85; this.v = 0.42;
    this.old = new THREE.Color();
    this.history = [];
    this.preview = false;
    this.visible = false;
    this._build();
    this._applyBrush(false);
    this.hide();
  }

  // ------------------------------------------------------------------ DOM
  _build() {
    const wrap = (this.el = el('div', 'pp-wrap'));
    const panel = (this.panel = el('div', 'pp'));
    wrap.appendChild(panel);

    // wheel
    const wheel = (this.wheel = el('canvas', 'pp-wheel'));
    wheel.width = wheel.height = 520;
    const wb = (this.wb = el('div', 'pp-wb')); wb.appendChild(wheel); panel.appendChild(wb);
    this._drawWheel();
    this._drag(wheel, (e) => {
      const r = wheel.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = ((e.clientY - r.top) / r.height) * 2 - 1;
      this.h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      this.s = Math.min(1, Math.hypot(x, y));
      this._fromHSV(true);
    });

    // two vertical sliders (saturation, value)
    this.vsS = el('div', 'pp-vs'); this.vsV = el('div', 'pp-vs');
    this.vsSm = el('i'); this.vsVm = el('i');
    this.vsS.appendChild(this.vsSm); this.vsV.appendChild(this.vsVm);
    panel.append(this.vsS, this.vsV);
    this._drag(this.vsS, (e) => { const r = this.vsS.getBoundingClientRect(); this.s = clamp01(1 - (e.clientY - r.top) / r.height); this._fromHSV(true); });
    this._drag(this.vsV, (e) => { const r = this.vsV.getBoundingClientRect(); this.v = clamp01(1 - (e.clientY - r.top) / r.height); this._fromHSV(true); });

    // swatches + buttons
    const sw = el('div', 'pp-sw');
    this.swNew = el('div', 'pp-new'); this.swOld = el('div', 'pp-old');
    sw.append(this.swNew, this.swOld);
    panel.appendChild(sw);
    const chk = el('label', 'pp-chk', '<input type="checkbox"><b></b><span>sRGB Preview</span>');
    chk.querySelector('input').addEventListener('change', (e) => { this.preview = e.target.checked; this._paintSwatches(); });
    panel.appendChild(chk);
    const rb = el('button', 'pp-btn pp-rb', ICONS.rainbow);
    rb.title = 'Random hue';
    rb.addEventListener('click', () => { this.h = Math.random() * 360; this.s = 0.55 + Math.random() * 0.45; this.v = Math.max(this.v, 0.5); this._fromHSV(true); });
    this.btnDrop = el('button', 'pp-btn pp-dr', ICONS.eyedropper);
    this.btnDrop.title = '3D eyedropper';
    this.btnDrop.addEventListener('click', () => this.emit('eyedrop'));
    const sb = el('button', 'pp-btn pp-sb', ICONS.swatches);
    sb.addEventListener('click', () => this.histRow.classList.toggle('compact'));
    panel.append(rb, this.btnDrop, sb);

    // RGB + HSV rows
    this.rows = {};
    const mk = (key, label, x, y, grad, getMax, onSet) => {
      const row = el('div', 'pp-row');
      row.style.cssText = `left:${x}%;top:${y}px`;
      const lab = el('u', null, label);
      const bar = el('div', 'pp-bar'); bar.style.background = grad;
      const m = el('i'); bar.appendChild(m);
      const inp = el('input'); inp.type = 'text'; inp.spellcheck = false;
      row.append(lab, bar, inp);
      panel.appendChild(row);
      this._drag(bar, (e) => { const r = bar.getBoundingClientRect(); onSet(clamp01((e.clientX - r.left) / r.width)); });
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) onSet(clamp01(v / getMax())); this._refresh(); });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      this.rows[key] = { bar, m, inp, getMax };
    };
    const rgbSet = (i) => (t) => { const c = this._rgb(); c[i] = t; [this.h, this.s, this.v] = rgb2hsv(...c); if (this.s < 1e-4) this.h = this._hOld ?? this.h; this._fromHSV(true); };
    mk('r', 'R', 0, 335, 'linear-gradient(90deg,#150000,#ff1a1a)', () => 1, rgbSet(0));
    mk('g', 'G', 0, 372, 'linear-gradient(90deg,#001500,#1aff1a)', () => 1, rgbSet(1));
    mk('b', 'B', 0, 409, 'linear-gradient(90deg,#000015,#1a1aff)', () => 1, rgbSet(2));
    mk('h', 'H', 50, 335, 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)', () => 360, (t) => { this.h = t * 360; this._fromHSV(true); });
    mk('s', 'S', 50, 372, '#fff', () => 1, (t) => { this.s = t; this._fromHSV(true); });
    mk('v', 'V', 50, 409, '#000', () => 1, (t) => { this.v = t; this._fromHSV(true); });

    // hex
    const hexRow = el('div', 'pp-hex', '<span>Hex sRGB <em>&#9662;</em></span>');
    this.hexInp = el('input'); this.hexInp.type = 'text'; this.hexInp.spellcheck = false; this.hexInp.maxLength = 9;
    hexRow.appendChild(this.hexInp);
    this.hexInp.addEventListener('keydown', (e) => e.stopPropagation());
    this.hexInp.addEventListener('change', () => {
      const t = this.hexInp.value.replace('#', '').trim();
      if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(t)) {
        const r = srgb2lin(parseInt(t.slice(0, 2), 16) / 255), g = srgb2lin(parseInt(t.slice(2, 4), 16) / 255), b = srgb2lin(parseInt(t.slice(4, 6), 16) / 255);
        [this.h, this.s, this.v] = rgb2hsv(r, g, b);
        this._fromHSV(true);
      } else this._refresh();
    });
    panel.appendChild(hexRow);

    // history
    this.histRow = el('div', 'pp-hist');
    const clock = el('button', 'pp-clock', ICONS.clock + '<em>&#9662;</em>');
    this.histCells = el('div', 'pp-cells');
    this.histRow.append(clock, this.histCells);
    panel.appendChild(this.histRow);

    // metallic / roughness
    const mr = (label, key, y) => {
      const row = el('div', 'pp-mr'); row.style.top = y + 'px';
      const inp = el('input'); inp.type = 'text'; inp.spellcheck = false;
      row.append(el('span', null, label), inp);
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) this.paint.brush[key] = clamp01(v); this._refresh(); this.emit(key === 'metallic' ? 'metal' : 'rough', this.paint.brush[key]); });
      // drag to scrub
      row.querySelector('span').addEventListener('pointerdown', (e) => {
        const x0 = e.clientX, v0 = this.paint.brush[key];
        const mv = (ev) => { this.paint.brush[key] = clamp01(v0 + (ev.clientX - x0) / 260); this._refresh(); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      panel.appendChild(row);
      return inp;
    };
    this.metInp = mr('Metallic', 'metallic', 557);
    this.rouInp = mr('Roughness', 'roughness', 592);

    // key-hint card
    const card = (this.card = el('div', 'pp-card'));
    const K = (t, cls = '') => `<b class="cap ${cls}">${t}</b>`;
    card.innerHTML = `
      <div class="pp-hint big"><i class="ring">${ICONS.pen}</i><div><div class="keys">${K('SPACE', 'y')}</div><span>3D Eyedropper (Hold)</span></div></div>
      <div class="pp-hint big"><i class="ring">${ICONS.size}</i><div><div class="keys">${ICONS.mouse('r')}<em>+</em>${ICONS.wheel}</div><span>Brush Size</span></div></div>
      <div class="pp-hint big"><i class="ring">${ICONS.sun}</i><div><div class="keys"><b class="cap vkey"><s>V</s><s class="r">V</s></b></div><span>Shadow</span></div></div>
      <div class="pp-hint"><div class="keys">${ICONS.mouse('l')}<em>+</em>${ICONS.move}</div><div class="keys">${K('ALT')}<em>+</em>${ICONS.mouse('r')}<em>+</em>${ICONS.move}</div><span>Rotate Camera</span></div>
      <div class="pp-hint"><div class="keys">${ICONS.wheel}</div><div class="keys">${K('ALT')}<em>+</em>${ICONS.mouse('l')}<em>+</em>${ICONS.move}</div><span>Zoom</span></div>`;
    wrap.appendChild(card);

    // brush ring (cursor while painting)
    this.ring = el('div', 'pp-ring');
    this.root.append(wrap, this.ring);
  }

  _drag(node, fn) {
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      fn(e);
      const mv = (ev) => fn(ev);
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); this._commit(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }

  _drawWheel() {
    const c = this.wheel, g = c.getContext('2d'), N = c.width, R = N / 2;
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - R) / R, dy = (y + 0.5 - R) / R, d = Math.hypot(dx, dy);
      const i = (y * N + x) * 4;
      if (d > 1) { img.data[i + 3] = 0; continue; }
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const [r, gg, b] = hsv2rgb(h, d, 1);
      img.data[i] = r * 255; img.data[i + 1] = gg * 255; img.data[i + 2] = b * 255;
      img.data[i + 3] = d > 0.992 ? 255 * (1 - (d - 0.992) / 0.008) : 255;
    }
    g.putImageData(img, 0, 0);
    this.wheelDot = el('i', 'pp-dot'); this.wheelOld = el('i', 'pp-dot old');
    this.wb.append(this.wheelOld, this.wheelDot);
  }

  // ------------------------------------------------------------------ state
  _rgb() { return hsv2rgb(this.h, this.s, this.v); }

  _fromHSV(live) {
    if (this.s > 1e-4) this._hOld = this.h;
    const [r, g, b] = this._rgb();
    this.paint.brush.color.setRGB(r, g, b);
    this._refresh();
    if (live) this.emit('color', this.paint.brush.color);
  }

  _commit() { this.pushHistory(this.paint.brush.color); }

  /** Load a colour (THREE.Color, linear) into the panel — used by the eyedropper. */
  setColor(color, { push = false } = {}) {
    [this.h, this.s, this.v] = rgb2hsv(color.r, color.g, color.b);
    this.paint.brush.color.copy(color);
    this._refresh();
    if (push) this.pushHistory(color);
  }

  _applyBrush() {
    const c = this.paint.brush.color;
    [this.h, this.s, this.v] = rgb2hsv(c.r, c.g, c.b);
    this.old.copy(c);
    this._refresh();
  }

  pushHistory(color) {
    const h = '#' + color.getHexString();
    if (this.history[0] === h) return;
    this.history = [h, ...this.history.filter((x) => x !== h)].slice(0, 16);
    this.histCells.innerHTML = '';
    for (const hx of this.history) {
      const b = el('button', 'pp-cell'); b.style.background = hx;
      b.addEventListener('click', () => { this.setColor(new THREE.Color(hx)); this.emit('color', this.paint.brush.color); });
      this.histCells.appendChild(b);
    }
  }

  _paintSwatches() {
    const [r, g, b] = this._rgb();
    const show = (c) => (this.preview ? `rgb(${Math.round(clamp01(c[0]) * 255)},${Math.round(clamp01(c[1]) * 255)},${Math.round(clamp01(c[2]) * 255)})` : css(c[0], c[1], c[2]));
    this.swNew.style.background = show([r, g, b]);
    this.swOld.style.background = show([this.old.r, this.old.g, this.old.b]);
  }

  _refresh() {
    const [r, g, b] = this._rgb();
    const R = this.rows;
    const set = (k, t, text) => { R[k].m.style.left = `${clamp01(t) * 100}%`; if (document.activeElement !== R[k].inp) R[k].inp.value = text; };
    set('r', r, f3(r)); set('g', g, f3(g)); set('b', b, f3(b));
    set('h', this.h / 360, f3(this.h)); set('s', this.s, f3(this.s)); set('v', this.v, f3(this.v));
    R.s.bar.style.background = `linear-gradient(90deg,${css(...hsv2rgb(this.h, 0, this.v))},${css(...hsv2rgb(this.h, 1, this.v))})`;
    R.v.bar.style.background = `linear-gradient(90deg,#000,${css(...hsv2rgb(this.h, this.s, 1))})`;
    this.vsS.style.background = `linear-gradient(to bottom,${css(...hsv2rgb(this.h, 1, this.v))},#fff)`;
    this.vsV.style.background = `linear-gradient(to bottom,${css(...hsv2rgb(this.h, this.s, 1))},#000)`;
    this.vsSm.style.top = `${(1 - this.s) * 100}%`;
    this.vsVm.style.top = `${(1 - this.v) * 100}%`;
    const a = (this.h * Math.PI) / 180;
    this.wheelDot.style.left = `${50 + Math.cos(a) * this.s * 50}%`;
    this.wheelDot.style.top = `${50 + Math.sin(a) * this.s * 50}%`;
    const [oh, os] = rgb2hsv(this.old.r, this.old.g, this.old.b);
    const oa = (oh * Math.PI) / 180;
    this.wheelOld.style.left = `${50 + Math.cos(oa) * os * 50}%`;
    this.wheelOld.style.top = `${50 + Math.sin(oa) * os * 50}%`;
    if (document.activeElement !== this.hexInp) this.hexInp.value = `${hex2(lin2srgb(r))}${hex2(lin2srgb(g))}${hex2(lin2srgb(b))}FF`;
    const br = this.paint.brush;
    if (document.activeElement !== this.metInp) this.metInp.value = f3(br.metallic).replace(/0+$/, '').replace(/\.$/, '.0') || '0.0';
    if (document.activeElement !== this.rouInp) this.rouInp.value = f3(br.roughness).replace(/0+$/, '').replace(/\.$/, '.0') || '0.0';
    this._paintSwatches();
  }

  /** Re-read the brush (after an eyedropper or an external change). */
  refresh() { this._applyBrush(); }

  /** Position the cursor ring (px) while painting. */
  setRing(x, y, diameterPx, on) {
    this.ring.style.display = on && this.visible ? 'block' : 'none';
    if (!on) return;
    this.ring.style.width = this.ring.style.height = `${Math.max(6, diameterPx)}px`;
    this.ring.style.transform = `translate(${x - diameterPx / 2}px, ${y - diameterPx / 2}px)`;
  }

  setEyedrop(on) { this.btnDrop.classList.toggle('on', !!on); }

  show() { this.visible = true; this.el.style.display = 'block'; this._applyBrush(); }
  hide() { this.visible = false; this.el.style.display = 'none'; this.ring.style.display = 'none'; }
  dispose() { this.el.remove(); this.ring.remove(); }
}
