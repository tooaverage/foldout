// Builds the Chrome Web Store upload, and refuses to build one that would
// obviously fail review. Run: node tools/package.mjs

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Only what the extension actually runs. Docs, tests and tooling stay out: a
// reviewer should see the shipped surface and nothing else.
const SHIP = ['manifest.json', 'background.js', 'popup.html', 'popup.js', 'viewer.html', 'viewer.js', 'icons'];

const problems = [];
const warn = [];

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

// Single purpose, stated narrowly, and permissions that match it.
const ALLOWED = new Set(['activeTab', 'scripting']);
for (const p of manifest.permissions || []) {
  if (!ALLOWED.has(p)) problems.push(`permission "${p}" is beyond the single purpose and will draw review`);
}
if (manifest.host_permissions?.length) {
  problems.push(`host_permissions ${JSON.stringify(manifest.host_permissions)} triggers deep review; activeTab covers this extension`);
}
if (!manifest.description) problems.push('manifest has no description');
if ((manifest.description || '').length > 132) problems.push('description exceeds the 132-character store limit');
if (!manifest.icons?.['128']) problems.push('a 128px icon is required for the store listing');

// Remote code of any kind is a hard rejection, and so is anything unreadable.
const RISKY = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bimportScripts\s*\(/, 'importScripts()'],
  [/\beval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/<script[^>]+src=["']https?:/i, 'remote <script>'],
  [/@import\s+url\(["']?https?:/i, 'remote @import'],
];

function scan(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const [re, label] of RISKY) {
    if (re.test(text)) problems.push(`${file} contains ${label}, which reads as remote or dynamic code`);
  }
  const longest = Math.max(...text.split('\n').map((l) => l.length));
  if (longest > 500) warn.push(`${file} has a ${longest}-character line; minified-looking code slows review`);
}

for (const entry of SHIP) {
  const full = path.join(ROOT, entry);
  if (!fs.existsSync(full)) { problems.push(`missing ${entry}`); continue; }
  if (fs.statSync(full).isDirectory()) continue;
  if (/\.(js|html)$/.test(entry)) scan(entry);
}

for (const size of [16, 32, 48, 128]) {
  if (!fs.existsSync(path.join(ROOT, `icons/icon-${size}.png`))) problems.push(`missing icons/icon-${size}.png`);
}

if (warn.length) console.log(warn.map((w) => 'note:    ' + w).join('\n'));
if (problems.length) {
  console.error(problems.map((p) => 'BLOCKED: ' + p).join('\n'));
  process.exit(1);
}

const out = path.join(ROOT, `foldout-${manifest.version}.zip`);
fs.rmSync(out, { force: true });
const zip = spawnSync('zip', ['-r', '-X', '-q', out, ...SHIP], { cwd: ROOT });
if (zip.status !== 0) {
  console.error('zip failed:', zip.stderr?.toString());
  process.exit(1);
}

const listed = spawnSync('unzip', ['-Z1', out], { encoding: 'utf8' }).stdout.trim().split('\n');
console.log(`\n${path.basename(out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
for (const f of listed) console.log('  ' + f);
console.log(`\npermissions: ${(manifest.permissions || []).join(', ')} (no host permissions)`);
console.log('ready to upload to the Chrome Web Store developer dashboard');
