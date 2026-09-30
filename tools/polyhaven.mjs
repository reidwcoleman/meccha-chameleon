#!/usr/bin/env node
// Download CC0 assets from Poly Haven into assets/.
//   node tools/polyhaven.mjs model  <id> [res=1k]   -> assets/models/<id>/<id>_<res>.gltf (+bin, textures/)
//   node tools/polyhaven.mjs tex    <id> [res=1k]   -> assets/tex/<id>/{diff,nor,arm}.jpg
//   node tools/polyhaven.mjs hdri   <id> [res=1k]   -> assets/hdri/<id>.hdr
//   node tools/polyhaven.mjs search <type> <words>  -> list ids (type: models|textures|hdris)
// Skips files that already exist. Needs network (run outside the Bash sandbox).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.polyhaven.com';
const [, , kind, id, res = '1k', ...rest] = process.argv;

async function json(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'meccha-chameleon-replica' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await fetch(url, { headers: { 'User-Agent': 'meccha-chameleon-replica' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return true;
}

async function model(id, res) {
  const files = await json(`${API}/files/${id}`);
  const g = files.gltf?.[res]?.gltf ?? files.gltf?.['1k']?.gltf;
  if (!g) throw new Error(`no gltf for ${id}`);
  const dir = path.join(ROOT, 'assets/models', id);
  const main = path.join(dir, path.basename(g.url));
  await download(g.url, main);
  for (const [rel, f] of Object.entries(g.include || {})) await download(f.url, path.join(dir, rel));
  console.log(path.relative(ROOT, main));
}

async function tex(id, res) {
  const files = await json(`${API}/files/${id}`);
  const dir = path.join(ROOT, 'assets/tex', id);
  const pick = (k) => files[k]?.[res]?.jpg?.url ?? files[k]?.['1k']?.jpg?.url;
  const map = { diff: pick('Diffuse'), nor: pick('nor_gl'), arm: pick('arm') };
  for (const [k, url] of Object.entries(map)) if (url) await download(url, path.join(dir, `${k}.jpg`));
  console.log(path.relative(ROOT, dir), Object.keys(map).filter((k) => map[k]).join(','));
}

async function hdri(id, res) {
  const files = await json(`${API}/files/${id}`);
  const url = files.hdri?.[res]?.hdr?.url ?? files.hdri?.['1k']?.hdr?.url;
  const dest = path.join(ROOT, 'assets/hdri', `${id}.hdr`);
  await download(url, dest);
  console.log(path.relative(ROOT, dest));
}

async function search(type, words) {
  const all = await json(`${API}/assets?t=${type}`);
  const ws = words.map((w) => w.toLowerCase());
  for (const [k, v] of Object.entries(all)) {
    const hay = `${k} ${v.name} ${(v.tags || []).join(' ')} ${Object.keys(v.categories || {}).join(' ')} ${(v.categories || []).join?.(' ') ?? ''}`.toLowerCase();
    if (ws.every((w) => hay.includes(w))) console.log(k.padEnd(36), '|', v.name, '|', (v.tags || []).slice(0, 6).join(','));
  }
}

try {
  if (kind === 'model') await model(id, res);
  else if (kind === 'tex') await tex(id, res);
  else if (kind === 'hdri') await hdri(id, res);
  else if (kind === 'search') await search(id, [res, ...rest].filter((w) => w && w !== '1k'));
  else console.log('usage: polyhaven.mjs model|tex|hdri <id> [res] | search <models|textures|hdris> <words..>');
} catch (e) {
  console.error('polyhaven:', e.message);
  process.exit(1);
}
