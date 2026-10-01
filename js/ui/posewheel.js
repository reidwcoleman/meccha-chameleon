// Pose wheel (R): dark radial menu, eight wedge slots with white mannequin thumbnails.
import * as THREE from 'three';
import { Emitter } from '../core/emitter.js';
import { poseCapsules } from '../char/mannequin.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function thumb(id, size = 192) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  let caps;
  try { caps = poseCapsules(id); } catch (e) { return c; }
  const yaw = 0.62, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const pr = (p) => ({ x: p.x * cy + p.z * sy, y: p.y, d: -p.x * sy + p.z * cy });
  const items = caps.map((k) => ({ a: pr(k.a), b: pr(k.b), r: k.r }));
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const k of items) for (const p of [k.a, k.b]) { x0 = Math.min(x0, p.x - k.r); x1 = Math.max(x1, p.x + k.r); y0 = Math.min(y0, p.y - k.r); y1 = Math.max(y1, p.y + k.r); }
  const s = (size * 0.78) / Math.max(x1 - x0, y1 - y0, 0.4);
  const ox = size / 2 - ((x0 + x1) / 2) * s, oy = size / 2 + ((y0 + y1) / 2) * s;
  items.sort((p, q) => (q.a.d + q.b.d) - (p.a.d + p.b.d));
  g.lineCap = 'round';
  const draw = (col, grow) => {
    for (const k of items) {
      g.strokeStyle = col; g.lineWidth = (k.r * 2 + grow) * s;
      g.beginPath(); g.moveTo(ox + k.a.x * s, oy - k.a.y * s); g.lineTo(ox + k.b.x * s, oy - k.b.y * s); g.stroke();
    }
  };
  draw('rgba(0,0,0,.55)', 0.02);
  for (const k of items) {
    const grd = g.createLinearGradient(ox + k.a.x * s - k.r * s, 0, ox + k.a.x * s + k.r * s, 0);
    grd.addColorStop(0, '#d6d9de'); grd.addColorStop(0.45, '#ffffff'); grd.addColorStop(1, '#c3c8cf');
    g.strokeStyle = grd; g.lineWidth = k.r * 2 * s * 0.94;
    g.beginPath(); g.moveTo(ox + k.a.x * s, oy - k.a.y * s); g.lineTo(ox + k.b.x * s, oy - k.b.y * s); g.stroke();
  }
  return c;
}

export class PoseWheel extends Emitter {
  constructor(root, poses) {
    super();
    this.poses = poses; this.isOpen = false; this.hover = -1;
    const w = (this.el = el('div', 'pw'));
    const ring = el('div', 'pw-ring');
    this.cells = poses.map((p, i) => {
      const a = (i / poses.length) * Math.PI * 2 - Math.PI / 2;
      const b = el('button', 'pw-cell');
      b.style.left = `${50 + Math.cos(a) * 33}%`; b.style.top = `${50 + Math.sin(a) * 33}%`;
      b.appendChild(thumb(p.id));
      b.insertAdjacentHTML('beforeend', `<s>${i + 1}</s>`);
      b.addEventListener('pointerenter', () => this._hover(i));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.emit('select', p.id); this.close(); });
      ring.appendChild(b);
      return b;
    });
    this.label = el('div', 'pw-label', '');
    const stand = el('button', 'pw-none', 'Stand');
    stand.addEventListener('click', (e) => { e.stopPropagation(); this.emit('select', null); this.close(); });
    ring.append(this.label, stand);
    w.appendChild(ring);
    w.addEventListener('click', () => this.close());
    root.appendChild(w);
  }
  _hover(i) {
    this.hover = i;
    this.cells.forEach((c, k) => c.classList.toggle('on', k === i));
    this.label.textContent = i >= 0 ? this.poses[i].name : '';
  }
  open() { this.isOpen = true; this.el.style.display = 'flex'; this._hover(-1); requestAnimationFrame(() => this.el.classList.add('show')); this.emit('open'); }
  close() { if (!this.isOpen) return; this.isOpen = false; this.el.classList.remove('show'); this.el.style.display = 'none'; this.emit('close'); }
  key(code) {
    const m = /^(?:Digit|Numpad)([1-8])$/.exec(code);
    if (!m || !this.isOpen) return false;
    this.emit('select', this.poses[+m[1] - 1].id); this.close(); return true;
  }
}
