// Title screen, Configure Map menu, results board.
import { Emitter } from '../core/emitter.js';
import { PLAYABLE, thumb } from '../maps/index.js';
import { MODES, modeInfo } from '../game/round.js';
import { audio } from '../core/audio.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Title extends Emitter {
  constructor(root) {
    super();
    const t = (this.el = el('div', 'title'));
    t.innerHTML = `<h1><small>HIDE &middot; PAINT &middot; SURVIVE</small>MECCHA<br>CHAMELEON</h1>
      <div class="in"><input maxlength="14" placeholder="Your name" spellcheck="false"><button class="btn">Play</button></div>
      <div class="sub">WASD move &middot; Mouse look &middot; F paint your body &middot; R pose<br>Hunters win by shooting every hider. Hiders win by surviving.</div>`;
    this.input = t.querySelector('input');
    try { this.input.value = localStorage.getItem('mc.name') || ''; } catch (e) { /* ignore */ }
    const go = () => {
      const name = (this.input.value.trim() || 'Player').slice(0, 14);
      try { localStorage.setItem('mc.name', name); } catch (e) { /* ignore */ }
      audio.ensure(); audio.start();
      this.emit('play', name);
    };
    t.querySelector('.btn').addEventListener('click', go);
    this.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
    root.appendChild(t);
  }
  show(on) { this.el.style.display = on ? 'flex' : 'none'; if (on) setTimeout(() => this.input.focus(), 50); }
}

const NUM_ROWS = [
  ['hunters', 'Number of Hunters', 1, 6, 1],
  ['hunterWait', 'Hunter Wait Time(sec)', 10, 180, 10, 'normal'],
  ['paintTime', 'Paint Time(sec)', 10, 180, 10, 'double'],
  ['searchTime', 'Search Time(sec)', 30, 600, 30],
  ['answerCheck', 'Answer Check Time(sec)', 5, 60, 5],
  ['forcedTaunt', 'Forced Taunt Interval(sec)', 0, 60, 5],
];

export class ConfigMenu extends Emitter {
  constructor(root, settings) {
    super();
    this.s = settings;
    const m = (this.el = el('div', 'cfg'));
    m.innerHTML = `<div class="cfg-w">
      <div class="cfg-h"><h2>Configure Map</h2><span class="hint" style="font-size:1.4em;opacity:.7">Bots: <b class="nb"></b> &middot; Difficulty: <b class="df"></b></span></div>
      <div class="cfg-cols">
        <div class="cfg-p"><h3>Game Mode</h3><div class="cfg-b gm"></div><div class="cfg-desc"></div></div>
        <div class="cfg-p"><h3>Filter</h3><div class="cfg-b fl"></div><div class="cfg-p" style="border:0;background:none"><h3>Bots</h3><div class="cfg-b bt"></div></div></div>
        <div class="cfg-p"><h3>Map</h3><div class="cfg-maps"></div></div>
      </div>
      <div class="cfg-f"><div class="hint"><b class="cap" style="font-size:1em">ESC</b> &nbsp;Back</div><button class="btn sm go">Start Game</button></div></div>`;
    this.gm = m.querySelector('.gm'); this.fl = m.querySelector('.fl'); this.bt = m.querySelector('.bt');
    this.desc = m.querySelector('.cfg-desc'); this.maps = m.querySelector('.cfg-maps');
    m.querySelector('.go').addEventListener('click', () => { audio.start(); this.emit('start', this.s); });
    m.addEventListener('click', (e) => { if (e.target === m) this.hide(); });
    root.appendChild(m);
    this.render();
  }

  render() {
    const s = this.s;
    const mode = modeInfo(s.mode);
    this.gm.innerHTML = '';
    // mode row
    const mr = el('div', 'cfg-r', `<span>Game Mode</span><span class="ctl"><button data-a="mode-">&#8249;</button><span style="color:${mode.color}">${mode.name}</span><button data-a="mode+">&#8250;</button></span>`);
    this.gm.appendChild(mr);
    for (const [key, label, lo, hi, step, only] of NUM_ROWS) {
      if (only === 'double' && s.mode !== 'double') continue;
      if (only === 'normal' && s.mode === 'double') continue;
      if (key === 'hunters' && s.mode === 'double') continue;
      this.gm.appendChild(el('div', 'cfg-r', `<span>${label}</span><span class="ctl"><button data-k="${key}" data-d="-${step}">&minus;</button><span>${s[key]}</span><button data-k="${key}" data-d="${step}">+</button></span>`));
    }
    this.gm.appendChild(el('div', 'cfg-r', `<span>Show Missed-Spot Ranking to Hunters</span><button class="sw ${s.showMissedSpot ? 'on' : ''}" data-t="showMissedSpot"><i></i></button>`));
    this.desc.innerHTML = `<b style="color:${mode.color}">${mode.name}</b><br>${mode.desc.map(esc).join(' ')}`;

    this.fl.innerHTML = '';
    for (const [k, label] of [['monochrome', 'Monochrome'], ['horror', 'Horror'], ['mosaic', 'Mosaic']]) {
      this.fl.appendChild(el('div', 'cfg-r', `<span>${label}</span><button class="sw ${s.filters[k] ? 'on' : ''}" data-f="${k}"><i></i></button>`));
    }
    this.bt.innerHTML = '';
    this.bt.appendChild(el('div', 'cfg-r', `<span>Number of Bots</span><span class="ctl"><button data-k="bots" data-d="-1">&minus;</button><span>${s.bots}</span><button data-k="bots" data-d="1">+</button></span>`));
    this.bt.appendChild(el('div', 'cfg-r', `<span>Difficulty</span><span class="ctl"><button data-a="diff-">&#8249;</button><span style="min-width:5em">${s.botDifficulty}</span><button data-a="diff+">&#8250;</button></span>`));

    this.maps.innerHTML = '';
    const list = [{ id: 'random', name: 'Random' }, ...PLAYABLE];
    for (const mp of list) {
      const d = el('div', 'cfg-m' + (s.map === mp.id ? ' on' : ''), (mp.id === 'random' ? '<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:4em;background:linear-gradient(135deg,#243,#124)">?</div>' : `<img src="${thumb(mp.id)}" alt="" onerror="this.style.visibility='hidden'">`) + `<span>${esc(mp.name)}</span>`);
      d.addEventListener('click', () => { audio.click(); s.map = mp.id; this.render(); });
      this.maps.appendChild(d);
    }
    this.el.querySelector('.nb').textContent = s.bots; this.el.querySelector('.df').textContent = s.botDifficulty;
    this._bind();
  }

  _bind() {
    const s = this.s;
    this.el.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k, d = +b.dataset.d;
      const row = k === 'bots' ? [0, 'x', 1, 14, 1] : NUM_ROWS.find((r) => r[0] === k);
      const lo = k === 'bots' ? 1 : row[2], hi = k === 'bots' ? 14 : row[3];
      s[k] = Math.max(lo, Math.min(hi, s[k] + d)); audio.click(); this.render();
    }));
    this.el.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a; audio.click();
      if (a.startsWith('mode')) { const i = MODES.findIndex((x) => x.id === s.mode); s.mode = MODES[(i + (a.endsWith('+') ? 1 : MODES.length - 1)) % MODES.length].id; }
      if (a.startsWith('diff')) { const L = ['easy', 'normal', 'hard']; const i = L.indexOf(s.botDifficulty); s.botDifficulty = L[(i + (a.endsWith('+') ? 1 : 2)) % 3]; }
      this.render();
    }));
    this.el.querySelectorAll('button[data-t]').forEach((b) => b.addEventListener('click', () => { s[b.dataset.t] = !s[b.dataset.t]; audio.toggle(s[b.dataset.t]); this.render(); }));
    this.el.querySelectorAll('button[data-f]').forEach((b) => b.addEventListener('click', () => { s.filters[b.dataset.f] = !s.filters[b.dataset.f]; audio.toggle(s.filters[b.dataset.f]); this.render(); }));
  }

  show() { this.el.style.display = 'flex'; this.render(); this.emit('open'); }
  hide() { this.el.style.display = 'none'; this.emit('close'); }
  get isOpen() { return this.el.style.display === 'flex'; }
}

export class Results extends Emitter {
  constructor(root) {
    super();
    const r = (this.el = el('div', 'res'));
    r.innerHTML = '<div class="res-w"><h2></h2><div class="sub"></div><table class="res-t"></table><div class="res-b"><button class="btn sm">Back to Lobby</button></div></div>';
    r.querySelector('button').addEventListener('click', () => { audio.click(); this.emit('back'); });
    root.appendChild(r);
  }
  show(round, local) {
    const r = this.el;
    const won = round.didWin(local);
    const h = r.querySelector('h2'); h.textContent = round.winText || 'Round Over'; h.className = won ? 'win' : 'lose';
    r.querySelector('.sub').textContent = won ? 'You won this round.' : 'You lost this round.';
    const rows = round.actors.slice().sort((a, b) => (b.roundScore || 0) - (a.roundScore || 0));
    r.querySelector('table').innerHTML = '<tr><th>Player</th><th>Role</th><th class="n">Found</th><th class="n">Close calls</th><th class="n">Thumbs</th><th class="n">Score</th></tr>' +
      rows.map((a) => `<tr class="${a === local ? 'you' : ''}"><td>${esc(a.name)}</td><td class="${a.wasHunter || a.infected ? 'hn' : ''}">${a.wasHunter ? 'Hunter' : a.infected ? 'Infected' : a.survived ? 'Survivor' : 'Hider'}</td><td class="n">${a.finds || 0}</td><td class="n">${a.closeCalls || 0}</td><td class="n">${a.likes || 0}</td><td class="n">${Math.round(a.roundScore || 0)}</td></tr>`).join('');
    r.style.display = 'flex';
  }
  hide() { this.el.style.display = 'none'; }
}
