// Procedural WebAudio: every sound is synthesised, no asset files.
let ctx = null, master = null, sfxBus = null, musBus = null, noiseBuf = null;
let musicOn = false, musicTimer = 0, musicStep = 0, musicMode = 'lobby';

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = 0.16; musBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

const now = () => ctx.currentTime;
function env(g, t, a, peak, d) {
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq, dur, { type = 'sine', vol = 0.3, a = 0.005, slide = 0, bus = null, delay = 0, pan = 0 } = {}) {
  if (!ensure()) return;
  const t = now() + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  env(g, t, a, vol, dur);
  let out = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
  o.connect(g); out.connect(bus || sfxBus); o.start(t); o.stop(t + dur + a + 0.05);
}
function noise(dur, { vol = 0.4, hp = 0, lp = 20000, a = 0.002, delay = 0, q = 0.7, bus = null, sweep = 0 } = {}) {
  if (!ensure()) return;
  const t = now() + delay, s = ctx.createBufferSource(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  const f1 = ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
  const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(lp, t); f2.Q.value = q;
  if (sweep) f2.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
  env(g, t, a, vol, dur);
  s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(bus || sfxBus); s.start(t, Math.random()); s.stop(t + dur + a + 0.05);
}

export const audio = {
  ensure() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); return c; },
  volume(v) { if (ensure()) master.gain.value = v; },
  click() { tone(880, 0.06, { type: 'triangle', vol: 0.18 }); },
  hover() { tone(1320, 0.03, { type: 'sine', vol: 0.05 }); },
  back() { tone(520, 0.08, { type: 'triangle', vol: 0.16, slide: -180 }); },
  start() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.07 })); },
  shot(pan = 0, dist = 0) {
    const v = Math.max(0.15, 1 - dist / 60);
    noise(0.5, { vol: 0.9 * v, lp: 5200, hp: 80, sweep: 300, a: 0.001 });
    tone(110, 0.35, { type: 'sawtooth', vol: 0.5 * v, slide: -80, a: 0.001, pan });
    noise(0.12, { vol: 0.5 * v, hp: 2000, delay: 0.01 });
    noise(1.1, { vol: 0.12 * v, lp: 900, a: 0.05, delay: 0.08 });
  },
  pump() {
    noise(0.07, { vol: 0.35, hp: 600, lp: 3200 }); tone(180, 0.05, { type: 'square', vol: 0.12 });
    noise(0.09, { vol: 0.4, hp: 400, lp: 2400, delay: 0.2 }); tone(120, 0.06, { type: 'square', vol: 0.16, delay: 0.2 });
  },
  empty() { tone(300, 0.03, { type: 'square', vol: 0.1 }); },
  step(mat = 'wood', vol = 0.18) {
    const f = { wood: 700, tile: 1500, carpet: 350, grass: 500, metal: 2200, water: 900 }[mat] || 700;
    noise(0.07, { vol, hp: f * 0.4, lp: f * 2.4, a: 0.003 });
  },
  jump() { noise(0.09, { vol: 0.15, hp: 400, lp: 2200 }); },
  land(v = 1) { noise(0.12, { vol: 0.22 * v, lp: 800 }); tone(70, 0.12, { vol: 0.2 * v, slide: -30 }); },
  taunt() {
    // two-note chirpy whistle
    tone(1568, 0.16, { type: 'sine', vol: 0.3, slide: 500 });
    tone(2093, 0.24, { type: 'sine', vol: 0.28, delay: 0.17, slide: -400 });
    tone(3136, 0.1, { type: 'sine', vol: 0.06, delay: 0.17 });
  },
  tick(low = false) { tone(low ? 660 : 990, 0.07, { type: 'square', vol: 0.09 }); },
  searchStart() {
    [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', vol: 0.14, delay: i * 0.09 }));
    tone(98, 1.1, { type: 'sine', vol: 0.4, a: 0.02 });
    noise(0.9, { vol: 0.14, hp: 800, lp: 6000, sweep: 8000, a: 0.3 });
  },
  found() {
    tone(660, 0.12, { type: 'square', vol: 0.15 }); tone(880, 0.12, { type: 'square', vol: 0.15, delay: 0.1 }); tone(1320, 0.28, { type: 'square', vol: 0.15, delay: 0.2 });
  },
  hit() { tone(180, 0.12, { type: 'sawtooth', vol: 0.3, slide: -90 }); noise(0.1, { vol: 0.25, lp: 1500 }); },
  closeCall() { tone(220, 0.5, { type: 'sine', vol: 0.18, slide: 440, a: 0.1 }); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.2, delay: i * 0.12 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.2, delay: i * 0.18 })); },
  toggle(on) { tone(on ? 740 : 520, 0.07, { type: 'triangle', vol: 0.14 }); },
  splat() { noise(0.06, { vol: 0.1, hp: 1500, lp: 5000 }); },
  warn() { tone(440, 0.18, { type: 'square', vol: 0.12 }); tone(330, 0.22, { type: 'square', vol: 0.12, delay: 0.18 }); },
  whoosh() { noise(0.25, { vol: 0.18, hp: 300, lp: 3000, sweep: 800, a: 0.08 }); },

  music(mode = 'lobby') {
    if (!ensure()) return;
    musicMode = mode;
    if (musicOn) return;
    musicOn = true; musicStep = 0;
    const loop = () => {
      if (!musicOn) return;
      const t = now();
      const lobby = musicMode === 'lobby';
      const bpm = lobby ? 92 : musicMode === 'hide' ? 84 : musicMode === 'search' ? 118 : 100;
      const sp = 60 / bpm / 2;
      const root = lobby ? [60, 64, 67, 64] : musicMode === 'search' ? [57, 57, 60, 55] : [57, 60, 64, 60];
      const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
      const bar = Math.floor(musicStep / 8) % 4, s = musicStep % 8;
      const r = root[bar];
      if (s % 2 === 0) {
        const n = r + [0, 7, 12, 7, 4, 7, 12, 16][s];
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = lobby ? 'triangle' : 'sine'; o.frequency.value = midi(n + 12);
        env(g, t, 0.01, 0.5, sp * 1.6); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + sp * 2);
      }
      if (s === 0 || s === 4) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = midi(r - 12);
        env(g, t, 0.02, 0.9, sp * 3.6); o.connect(g); g.connect(musBus); o.start(t); o.stop(t + sp * 4);
      }
      if (musicMode === 'search' && s % 2 === 1) noise(0.04, { vol: 0.3, hp: 6000, bus: musBus });
      if (musicMode === 'search' && (s === 0 || s === 4)) tone(60, 0.18, { vol: 0.6, slide: -30, bus: musBus });
      musicStep++;
      musicTimer = setTimeout(loop, sp * 1000);
    };
    loop();
  },
  musicMode(m) { musicMode = m; },
  stopMusic() { musicOn = false; clearTimeout(musicTimer); },
};
