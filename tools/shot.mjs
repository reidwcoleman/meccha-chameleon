#!/usr/bin/env node
// Headless Chrome harness (raw CDP, no deps). Needs the dev server running (node tools/serve.mjs).
//
//   node tools/shot.mjs "<query>" out.png [--wait ms] [--eval "js"] [--size 1920x1080] [--port 5277] [--keep]
//
//   <query>  URL query string WITHOUT '?', e.g.  "view=map&map=mansion&cam=0,1.6,5&look=0,1.2,0"
//            or "" for the real game.  `harness=1` is added automatically.
//   --eval   JS evaluated after window.__mc.ready (awaited if it returns a promise). Its JSON result
//            is printed. Runs BEFORE the screenshot, so use it to drive the game into a state.
//   --wait   extra ms after ready/eval before the screenshot (default 1500 — lets textures stream in).
//   --shots  "ms1,ms2,..." take extra screenshots at these delays after the first: out-1.png, out-2.png
//   Prints console errors/warnings and page exceptions. Exit code 1 if the page threw or never got ready.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const query = args[0] ?? '';
const out = args[1] ?? 'shot.png';
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const WAIT = Number(opt('wait', 1500));
const EVAL = opt('eval', null);
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const PORT = Number(opt('port', process.env.PORT || 5277));
const SHOTS = (opt('shots', '') || '').split(',').filter(Boolean).map(Number);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-chrome-'));
const dbgPort = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0;
const pending = new Map();
const logs = [];
let threw = false;

function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}

async function main() {
  let ver;
  for (let i = 0; i < 50; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${dbgPort}/json/version`)).json(); break; } catch { await sleep(100); }
  }
  if (!ver) throw new Error('chrome did not start');
  ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn'].includes(m.params.type)) {
      logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') { threw = true; logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(`[log] ${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Runtime.enable'); await s('Log.enable'); await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const url = `http://localhost:${PORT}/index.html?harness=1${query ? '&' + query : ''}`;
  await s('Page.navigate', { url });
  const evalJS = async (expr) => {
    const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  let ready = false;
  for (let i = 0; i < 600; i++) {
    await sleep(100);
    try { const st = await evalJS('JSON.stringify({r: !!window.__mc?.ready, e: window.__mc?.error || null})'); const o = JSON.parse(st || '{}'); if (o.e) { logs.push('[boot error] ' + o.e); threw = true; break; } if (o.r) { ready = true; break; } } catch {}
  }
  if (!ready) logs.push('[harness] window.__mc.ready never became true');
  if (EVAL) {
    try { const v = await evalJS(`(async () => { ${EVAL.includes('return') ? EVAL : 'return (' + EVAL + ')'} })()`); console.log('eval:', JSON.stringify(v)); }
    catch (e) { logs.push('[eval error] ' + e.message); threw = true; }
  }
  await sleep(WAIT);
  const snap = async (file) => {
    const { data } = await s('Page.captureScreenshot', { format: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: 85 });
    fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log('wrote', file);
  };
  await snap(out);
  let t = 0;
  for (let i = 0; i < SHOTS.length; i++) {
    await sleep(Math.max(0, SHOTS[i] - t)); t = SHOTS[i];
    await snap(out.replace(/(\.\w+)$/, `-${i + 1}$1`));
  }
  try { console.log('fps/info:', await evalJS('JSON.stringify({calls: __mc.engine.renderer.info.render.calls, tris: __mc.engine.renderer.info.render.triangles, geos: __mc.engine.renderer.info.memory.geometries, tex: __mc.engine.renderer.info.memory.textures})')); } catch {}
  for (const l of logs) console.log(l);
  ws.close();
}

main().catch((e) => { console.error('harness:', e.message); threw = true; }).finally(() => {
  chrome.kill('SIGKILL');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  process.exit(threw ? 1 : 0);
});
