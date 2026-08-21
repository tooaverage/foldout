// Everything that should be true before submitting, checked rather than assumed.
// Run: node tools/preflight.mjs      (add --offline to skip the URL checks)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const fails = [];
const notes = [];
const ok = (label) => console.log(`  ok    ${label}`);
const bad = (label) => { console.log(`  FAIL  ${label}`); fails.push(label); };
const check = (cond, label) => (cond ? ok(label) : bad(label));

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const brand = manifest.short_name || manifest.name;
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);

console.log(`\nmanifest`);
check(Boolean(manifest.name), 'has a listing name');
check((manifest.name || '').length <= 45, `listing name is within 45 chars (${(manifest.name || '').length})`);
check(Boolean(manifest.short_name), `has a short_name for filenames and the popup (${manifest.short_name})`);
check((manifest.description || '').length > 0 && manifest.description.length <= 132,
  `description is present and within 132 chars (${(manifest.description || '').length})`);
check(JSON.stringify(manifest.permissions) === JSON.stringify(['activeTab', 'scripting']),
  `permissions are exactly activeTab and scripting (${(manifest.permissions || []).join(', ')})`);
check(!manifest.host_permissions, 'declares no host permissions');
check(Boolean(manifest.action?.default_popup), 'the toolbar action opens the popup');

console.log(`\nfiles the manifest points at`);
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean);
for (const f of [...new Set(referenced)]) check(fs.existsSync(f), `${f} exists`);

console.log(`\nnaming is consistent`);
// A half-finished rename is the likeliest thing to leak into a listing.
// Assembled from pieces so this file does not match its own check.
const RETIRED = ['long' + 'shot'];
const stale = [];
for (const f of tracked) {
  if (f.startsWith('store-assets/') || f.startsWith('icons/')) continue;
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const hits = RETIRED.flatMap((name) => text.match(new RegExp(name, 'gi')) || []);
  if (hits.length) stale.push(`${f} (${hits.length})`);
}
check(stale.length === 0, `no trace of a previous name left in the source${stale.length ? ': ' + stale.join(', ') : ''}`);

console.log(`\nthe guides quote the live manifest`);
// Chrome takes the listing title and summary from the manifest, so a guide that
// quotes stale values sends you to paste something you cannot paste.
for (const doc of ['SUBMIT.md', 'STORE.md']) {
  if (!fs.existsSync(doc)) continue;
  const text = fs.readFileSync(doc, 'utf8');
  check(text.includes(manifest.name), `${doc} quotes the current listing title`);
  check(text.includes(manifest.description), `${doc} quotes the current summary`);
}

console.log(`\nlisting assets`);
const png = (f) => {
  const d = fs.readFileSync(f);
  return [d.readUInt32BE(16), d.readUInt32BE(20)];
};
const shots = fs.existsSync('store-assets') ? fs.readdirSync('store-assets').filter((f) => f.endsWith('.png')).sort() : [];
// A file that names its own dimensions is a promo tile and is checked against
// them; everything else is a listing screenshot and must be 1280x800.
const screenshots = shots.filter((f) => !/\d+x\d+/.test(f));
check(screenshots.length >= 1, `${screenshots.length} listing screenshots present`);
for (const f of shots) {
  const named = f.match(/(\d+)x(\d+)/);
  const [want, tall] = named ? [Number(named[1]), Number(named[2])] : [1280, 800];
  const [w, h] = png(path.join('store-assets', f));
  check(w === want && h === tall, `${f} is ${want}x${tall} (${w}x${h})`);
  // The store rejects alpha on promo tiles.
  const colourType = fs.readFileSync(path.join('store-assets', f))[25];
  if (named) check(colourType === 2 || colourType === 0, `${f} has no alpha channel`);
}
if (!shots.some((f) => f.includes('440x280'))) notes.push('no 440x280 small promo tile found');

console.log(`\npackage`);
const built = spawnSync('node', ['tools/package.mjs'], { encoding: 'utf8' });
check(built.status === 0, 'package.mjs builds without tripping its own policy checks');
const zip = `${brand.toLowerCase()}-${manifest.version}.zip`;
check(fs.existsSync(zip), `${zip} exists`);

if (!process.argv.includes('--offline')) {
  console.log(`\nlinks in the docs actually resolve`);
  const urls = new Set();
  for (const f of tracked.filter((f) => f.endsWith('.md') || f.endsWith('.html'))) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/https:\/\/(?:tooaverage\.github\.io|github\.com\/tooaverage)[^\s)>"'`]*/g)) {
      urls.add(m[0].replace(/[.,]$/, ''));
    }
  }
  for (const url of [...urls].sort()) {
    let status = 0;
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      status = res.status;
    } catch {}
    check(status === 200, `${url} -> ${status || 'unreachable'}`);
  }
}

for (const n of notes) console.log(`  note  ${n}`);
console.log(fails.length ? `\n${fails.length} FAILED` : `\npreflight clean: ready to submit as "${manifest.name}"`);
process.exit(fails.length ? 1 : 0);
