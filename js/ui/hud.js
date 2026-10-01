// In-round HUD, laid out after the real game (SPEC §1).
import { ICONS } from './icons.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const cap = (k, c = '') => `<b class="cap ${c}">${k}</b>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ROWS = {
  chat:    { k: 'T', t: 'Chat', ico: 'chat' },
  taunt:   { k: '1', kc: 'y', t: 'Taunt', ico: 'bell' },
  pose:    { k: 'R', t: 'Pose', ico: 'pose' },
  paint:   { k: 'F', t: 'Paint Mode', ico: 'brush' },
  lock:    { k: 'mouse-r', t: 'Rotation Lock', ico: 'lock' },
  names:   { k: '2', t: 'Toggle Nameplate Display', tog: true },
  xray:    { k: '3', t: 'Toggle X-Ray Rendering', tog: true },
  free:    { k: '5', t: 'Switch to Free Camera', tog: true, pink: true },
};

export class Hud {
  constructor(root) {
    this.root = root;
    const h = (this.el = el('div', 'hud'));
    h.style.display = 'none';

    // top
    this.top = el('div', 'h-top');
    const row = el('div', 'h-row');
    this.teamL = el('div', 'h-team l'); this.teamR = el('div', 'h-team r');
    this.glass = el('div', 'h-glass', ICONS.hourglass + '<b>0</b>');
    row.append(this.teamL, this.glass, this.teamR);
    this.time = el('div', 'h-time', '60'); this.label = el('div', 'h-label', '');
    this.top.append(row, this.time, this.label);

    // right column
    this.right = el('div', 'h-right');
    this.rows = {};
    for (const [id, r] of Object.entries(ROWS)) {
      const d = el('div', 'h-r' + (r.tog ? ' tog' : '') + (r.pink ? ' pink' : ''));
      const key = r.k === 'mouse-r' ? ICONS.mouse('r').replace('class="ic ', 'class="ic k-m ') : cap(r.k, r.kc || '');
      d.innerHTML = `<div class="t">${r.t}</div><div class="k">${r.k === 'mouse-r' ? `<span style="display:inline-block;width:1.6em;height:2.2em">${ICONS.mouse('r')}</span>` : key}</div>` +
        (r.tog ? `<div class="bar">${r.k}</div>` : `<div class="ico">${ICONS[r.ico]}</div>`);
      this.rows[id] = d; this.right.appendChild(d);
    }
    this.vb = el('div', 'h-vb', `<div>${cap('V')}<span style="width:2.4em;height:2.4em;display:block">${ICONS.shadow}</span></div><div>${cap('B')}<span style="width:2.4em;height:2.4em;display:block">${ICONS.headphones}</span></div>`);
    this.shadowIc = this.vb.children[0];

    // mode
    this.mode = el('div', 'h-mode', '<div class="n"></div><div class="d"></div>');

    // bottom hints
    this.bottom = el('div', 'h-bottom');
    this.qe = el('div', 'h-qe', `${cap('Q')}<span>&#9671;</span><span>&#9671;</span>${cap('E')}`);
    this.hints = el('div', 'h-hints');
    this.bottom.append(this.qe, this.hints);

    this.feed = el('div', 'h-feed');
    this.names = el('div', 'h-names');
    this.sight = el('div', 'h-sight');
    this.banner = el('div', 'h-banner');
    this.warn = el('div', 'h-warn', 'Your body is buried too much!<br>If this continues, your location will be revealed');
    this.free = el('div', 'h-free', `<div class="t">Free Camera</div><div>${cap('5')}<span>Exit Free Camera</span></div><div>${cap('WASD')}<span>Free Movement</span></div>`);
    this.score = el('div', 'h-score');
    this.rank = el('div', 'h-rank', '<h4>Missed-Spot Ranking</h4><div class="rl"></div>');
    this.cross = el('div', 'h-cross');
    this.hit = el('div', 'h-hit');
    this.chat = el('div', 'h-chat'); this.chatIn = el('input'); this.chatIn.placeholder = 'Chat'; this.chatIn.maxLength = 80; this.chat.appendChild(this.chatIn);
    this.toast = el('div', 'h-toast');
    this.fade = el('div', 'fade');

    h.append(this.hit, this.score, this.rank, this.names, this.top, this.right, this.vb, this.mode, this.feed, this.sight, this.bottom, this.cross, this.warn, this.free, this.chat, this.banner, this.toast);
    root.append(h, this.fade);
    this.npPool = new Map();
    this._hintKey = '';
    this._bannerT = 0;
  }

  show(on = true) { this.el.style.display = on ? '' : 'none'; }

  setMode(info) {
    this.mode.querySelector('.n').textContent = info.name;
    this.mode.querySelector('.n').style.color = info.color;
    this.mode.querySelector('.d').innerHTML = info.desc.map(esc).join('<br>');
  }

  // which right-column rows apply for this role
  setRole(role) {
    const hider = role === 'hider';
    const show = hider ? ['chat', 'taunt', 'pose', 'paint', 'lock', 'names', 'xray', 'free'] : role === 'hunter' ? ['chat', 'names', 'xray', 'free'] : ['chat', 'names', 'xray'];
    for (const [id, d] of Object.entries(this.rows)) d.style.display = show.includes(id) ? '' : 'none';
    this.vb.style.display = hider ? '' : 'none';
    this.qe.style.display = hider ? '' : 'none';
    this.cross.style.display = role === 'hunter' ? 'block' : 'none';
    this.mode.style.display = '';
  }
  setToggle(id, on) { this.rows[id]?.classList.toggle('off', !on); }
  setRowState(id, { cd, act, dis } = {}) { const r = this.rows[id]; if (!r) return; r.classList.toggle('cd', !!cd); r.classList.toggle('act', !!act); r.classList.toggle('dis', !!dis); }
  setShadow(on) { this.shadowIc.style.opacity = on ? 1 : 0.4; }

  setTop({ hiders, hunters, bonus, time, label }) {
    const fig = (n, dead) => `<span style="display:block;width:2.1em;height:2.6em;${dead ? 'opacity:.28' : ''}">${ICONS.figure}</span>`;
    const hk = hiders + '|' + hunters;
    if (hk !== this._tk) {
      this._tk = hk;
      this.teamL.innerHTML = Array.from({ length: Math.min(hiders, 9) }, () => fig()).join('');
      this.teamR.innerHTML = Array.from({ length: Math.min(hunters, 9) }, () => fig()).join('');
    }
    const b = this.glass.querySelector('b');
    if (b.textContent !== String(bonus)) b.textContent = bonus;
    const t = Math.max(0, Math.ceil(time));
    if (this._t !== t) { this._t = t; this.time.textContent = t; this.time.classList.toggle('low', t <= 10 && label !== '' && this._lowOk); }
    if (this.label.textContent !== label) this.label.textContent = label;
  }
  lowOk(on) { this._lowOk = on; }

  showBanner(text, kind = '') {
    const b = this.banner;
    b.className = 'h-banner ' + kind; b.textContent = text; void b.offsetWidth; b.classList.add('show');
  }
  showToast(text, ms = 2200) {
    this.toast.textContent = text; this.toast.style.opacity = 1;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { this.toast.style.opacity = 0; }, ms);
  }

  feedLine(hunter, hider) {
    const d = el('div', '', `<span class="hn">${esc(hunter)}</span> found <span class="rn">${esc(hider)}</span>`);
    this.feed.appendChild(d); setTimeout(() => d.remove(), 5000);
    while (this.feed.children.length > 4) this.feed.firstChild.remove();
  }
  sightLine(hunterName) {
    const d = el('div', '', `In <span class="hn">${esc(hunterName)}</span>'s Line of Sight +1`);
    this.sight.appendChild(d); setTimeout(() => d.remove(), 2200);
    while (this.sight.children.length > 3) this.sight.firstChild.remove();
  }
  chatLine(name, text, hunter) {
    const d = el('div', '', `<span style="color:${hunter ? '#ff6a5a' : '#8fe3ff'}">${esc(name)}</span>: ${esc(text)}`);
    this.chat.insertBefore(d, this.chatIn); setTimeout(() => d.remove(), 8000);
  }
  warnOn(on) { this.warn.style.display = on ? 'block' : 'none'; }
  freeOn(on) { this.free.style.display = on ? 'flex' : 'none'; }
  hitFlash() { this.hit.style.transition = 'none'; this.hit.style.opacity = 1; void this.hit.offsetWidth; this.hit.style.transition = 'opacity .6s'; this.hit.style.opacity = 0; }
  crossHit() { this.cross.classList.add('hit'); clearTimeout(this._ct); this._ct = setTimeout(() => this.cross.classList.remove('hit'), 160); }

  setHints({ crouch, climb, attached, free }) {
    const k = [crouch, climb, attached, free].join();
    if (k === this._hintKey) return; this._hintKey = k;
    let h = '';
    if (attached) h = `<div class="h-hint g">${cap('SHIFT', '')}<span>Detach</span></div><div class="h-hint">${cap('CTRL')}<span>Move Down</span></div><div class="h-hint">${cap('SPACE')}<span>Move Up</span></div>`;
    else if (!free) {
      h += `<div class="h-hint y">${cap('CTRL')}<span>Crouch</span></div>`;
      if (crouch) h = `<div class="h-hint g">${cap('CTRL')}<span>Stand Up</span></div>`;
      if (climb) h += `<div class="h-hint t">${cap('SHIFT')}<span>Climb</span></div>`;
    }
    this.hints.innerHTML = h;
    this.hints.querySelectorAll('.h-hint').forEach((x) => { const c = x.querySelector('b'); if (x.classList.contains('y')) c.classList.add('y'); });
  }

  setScore(list) {
    this.score.innerHTML = list.map((s) => `<div class="${s.you ? 'you' : ''}">${s.v}</div>`).join('');
  }
  setRank(list, on) {
    this.rank.style.display = on ? 'block' : 'none';
    if (!on) return;
    this.rank.querySelector('.rl').innerHTML = list.map((r) => `<div><span>${esc(r.name)}</span><em>${r.count}</em></div>`).join('') || '<div><span>-</span></div>';
  }

  // nameplates: list of {id,name,likes,hunter,x,y,near}
  setNames(list, on = true) {
    const seen = new Set();
    for (const n of list) {
      seen.add(n.id);
      let e = this.npPool.get(n.id);
      if (!e) {
        e = el('div', 'np'); e.innerHTML = `<div class="l">${ICONS.figure.replace('figure', 'thumb')}<span class="c"></span></div><div class="n"></div>`;
        e.querySelector('.l .ic').outerHTML = '<span style="display:block;width:1em;height:1em;font-size:1em">&#128077;</span>';
        this.names.appendChild(e); this.npPool.set(n.id, e);
      }
      e.querySelector('.n').textContent = n.name;
      e.querySelector('.c').textContent = n.likes;
      e.classList.toggle('hun', !!n.hunter);
      e.style.display = on ? '' : 'none';
      e.style.transform = `translate(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const [id, e] of this.npPool) if (!seen.has(id)) e.style.display = 'none';
  }
  clearNames() { this.names.innerHTML = ''; this.npPool.clear(); }

  setScale(s) { this.root.style.setProperty('--s', s); }
}
