// End-to-end test: loads the real extension into Chrome, drives a full-page
// capture over CDP, then samples the stitched canvas to prove every block of
// the page landed at exactly the right offset, exactly once.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXT_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HERE = fs.mkdtempSync(path.join(os.tmpdir(), 'longshot-e2e-'));
// Derived per process: fixed ports meant a back-to-back run could bind-fail and
// silently attach to the previous run's leftover browser, testing the wrong page.
const PORT = 9300 + (process.pid % 300);
const HTTP_PORT = 8700 + (process.pid % 300);
const HEADLESS = process.argv.includes('--headed') ? false : true;

const BLOCKS = Number((process.argv.find((a) => a.startsWith('--blocks=')) || '').slice(9)) || 45;
const BLOCK_H = 220;
const HEADER_H = 60;
const HEADER_RGB = [255, 0, 255];
const BANNER_RGB = [0, 255, 255];

// Kept to the mid range on every channel so no block can ever pass for the
// overlay card (near-black) or its accent (near-white), whatever BLOCKS is.
const blockColor = (i) => [60 + ((i * 37 + 11) % 140), 60 + ((i * 91 + 40) % 140), 60 + ((i * 151 + 70) % 140)];

/* ---------------- test fixture ---------------- */

function writeFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(EXT_SRC, 'icons/icon-128.png'), path.join(dir, 'img.png'));

  const sections = Array.from({ length: BLOCKS }, (_, i) => {
    const [r, g, b] = blockColor(i);
    const lazy = i % 15 === 7 ? `<img src="img.png?i=${i}" loading="lazy" width="96" height="96">` : '';
    return `<section style="background:rgb(${r},${g},${b})"><span>${i + 1}</span>${lazy}</section>`;
  }).join('\n');

  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Longshot torture page</title>
<style>
  html,body{margin:0;padding:0}
  body{font:600 64px/1 ui-sans-serif,system-ui,sans-serif;color:#fff}
  header{position:sticky;top:0;height:${HEADER_H}px;background:rgb(${HEADER_RGB});
         display:flex;align-items:center;padding-left:280px;font-size:24px;z-index:5}
  section{height:${BLOCK_H}px;display:flex;align-items:center;gap:24px;padding-left:280px}
  #banner{position:fixed;right:24px;bottom:24px;width:260px;height:110px;
          background:rgb(${BANNER_RGB});z-index:9}
</style>
<header>sticky header</header>
${sections}
<div id="banner"></div>`
  );
}

/* ---------------- minimal CDP client ---------------- */

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.exceptions = [];
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve(this);
      this.ws.onerror = () => reject(new Error('websocket failed'));
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: ok, reject: no } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          msg.error ? no(new Error(JSON.stringify(msg.error))) : ok(msg.result);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          this.exceptions.push(
            msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text
          );
        }
      };
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression, timeout = 180000) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }
  close() {
    try { this.ws.close(); } catch {}
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Equal bands, each within the cap, together covering exactly the whole page.
function segments_ok(total, cap, count) {
  const band = Math.ceil(total / count);
  if (band > cap) return false;
  let covered = 0;
  for (let i = 0; i < count; i++) covered += Math.min(band, total - i * band);
  return covered === total;
}

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

async function waitFor(predicate, label, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const hit = (await targets()).find(predicate);
      if (hit) return hit;
    } catch {}
    await sleep(300);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/* ---------------- run ---------------- */

// activeTab is only granted on a real toolbar click, which CDP cannot synthesise.
// Test a byte-identical copy whose only difference is a standing host permission.
function stageExtension() {
  const dir = path.join(HERE, 'ext-under-test');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(EXT_SRC, dir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const fixtureDir = path.join(HERE, 'fixture');
const extDir = stageExtension();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'longshot-profile-'));
writeFixture(fixtureDir);

const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
  cwd: fixtureDir,
  stdio: 'ignore',
});

// Chrome 142+ removed --load-extension from branded builds; Extensions.loadUnpacked
// over the DevTools Protocol is the supported replacement.
const chromeArgs = [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  '--enable-unsafe-extension-debugging',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--window-size=1200,900',
  ...(process.argv.find((a) => a.startsWith('--dpr=')) ? [`--force-device-scale-factor=${process.argv.find((a) => a.startsWith('--dpr=')).slice(6)}`] : []),
  `http://127.0.0.1:${HTTP_PORT}/index.html`,
];
if (HEADLESS) chromeArgs.unshift('--headless=new');

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromeArgs, {
  stdio: 'ignore',
});

async function installExtension() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      const browser = await new CDP(version.webSocketDebuggerUrl).open();
      const { id } = await browser.send('Extensions.loadUnpacked', { path: extDir });
      browser.close();
      return id;
    } catch {
      await sleep(400);
    }
  }
  throw new Error('could not install the extension');
}

// Interruption tests need a run long enough to interrupt. A two-screenful
// page finishes in well under a second, so they are skipped, not failed.
const INTERRUPTIBLE = BLOCKS >= 20;
const skip = (label, why) => console.log(`SKIP  ${label} (${why})`);

const failures = [];
const record = (ok, label) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

try {
  const pageTarget = await waitFor((t) => t.url.includes(`:${HTTP_PORT}/index.html`), 'test page');
  const page = await new CDP(pageTarget.webSocketDebuggerUrl).open();
  await page.send('Runtime.enable');
  const layout = await page.eval(
    `({ innerHeight: innerHeight, innerWidth: innerWidth, dpr: devicePixelRatio,
        scrollHeight: document.documentElement.scrollHeight })`
  );
  console.log('page:', JSON.stringify(layout));

  const extId = await installExtension();
  console.log('extension id:', extId);
  const swTarget = await waitFor(
    (t) => t.type === 'service_worker' && t.url === `chrome-extension://${extId}/background.js`,
    'extension service worker'
  );
  const sw = await new CDP(swTarget.webSocketDebuggerUrl).open();
  await sw.send('Runtime.enable');

  record(await sw.eval('typeof capture === "function"'), 'service worker registered without errors');

  // The lock is a promise to the user, so prove it engages and releases.
  const findTab = `const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:${HTTP_PORT}/index.html' });`;
  const wheelBlocked =
    `(() => { const e = new WheelEvent('wheel', { cancelable: true, bubbles: true });` +
    ` window.dispatchEvent(e); return e.defaultPrevented; })()`;

  record(!(await page.eval(wheelBlocked)), 'page scrolls freely before a capture starts');
  await sw.eval(`(async () => { ${findTab} await exec(tab.id, prepare); await exec(tab.id, mountOverlay); })()`);
  record(await page.eval(wheelBlocked), 'user scrolling is blocked while capturing');
  record(
    await page.eval(`document.querySelectorAll('#__longshot_ui, #__longshot_banner').length === 1`),
    'progress overlay is mounted during capture'
  );
  await sw.eval(`(async () => { ${findTab} await exec(tab.id, restore); })()`);
  record(!(await page.eval(wheelBlocked)), 'scrolling is released again afterwards');

  const started = Date.now();
  await sw.eval(`(async () => {
    const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1:${HTTP_PORT}/index.html' });
    if (!tab) throw new Error('test tab not found');
    return capture(tab);
  })()`);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const viewerTarget = await waitFor((t) => t.url.includes('viewer.html#'), 'viewer tab');
  const viewer = await new CDP(viewerTarget.webSocketDebuggerUrl).open();
  await viewer.send('Runtime.enable');

  let dims = null;
  for (let i = 0; i < 600 && !dims; i++) {
    dims = await viewer.eval(
      'typeof segments !== "undefined" && segments.length && segments.every(s => s.blob)' +
        ' ? [segments[0].canvas.width, segments.reduce((a, s) => a + s.h, 0), segments.length] : null'
    );
    if (!dims) await sleep(250);
  }
  if (!dims) throw new Error('viewer never finished stitching');
  const [outWidth, outHeight, segCount] = dims;
  console.log(`stitched ${outWidth}x${outHeight} across ${segCount} image(s) in ${elapsed}s`);

  // Never downscale: the output must be exactly devicePixelRatio times the page.
  record(
    Math.abs(outWidth / layout.innerWidth - layout.dpr) < 0.001,
    `output is full ${layout.dpr}x resolution, not scaled down`
  );
  const cap = Math.min(32767, Math.floor(250000000 / outWidth));
  record(
    segCount === Math.max(1, Math.ceil(outHeight / cap)) && segments_ok(outHeight, cap, segCount),
    `split into the fewest images that fit (${segCount}, each <= ${cap}px tall)`
  );

  const scale = outWidth / layout.innerWidth;

  // One probe per block, in the left gutter where only the block colour shows.
  const probes = [];
  for (let i = 0; i < BLOCKS; i++) {
    probes.push({
      label: `block ${i + 1}`,
      x: 40,
      y: Math.round((HEADER_H + i * BLOCK_H + BLOCK_H / 2) * scale),
      want: blockColor(i),
    });
  }
  // Just under each screenful boundary: where a burnt-in sticky header would land.
  const boundaries = [];
  for (let y = layout.innerHeight; y < layout.scrollHeight - 40; y += layout.innerHeight) {
    boundaries.push({ label: `screenful boundary at ${y}px`, x: 40, y: Math.round((y + 20) * scale) });
  }

  // Sample by absolute page position, resolving which image that falls inside.
  const sampled = await viewer.eval(`(() => {
    const at = (x, gy) => {
      const s = segments.find(s => gy >= s.y0 && gy < s.y0 + s.h);
      if (!s) return [-1, -1, -1];
      const d = s.ctx.getImageData(x, gy - s.y0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return {
      probes: ${JSON.stringify(probes)}.map(p => ({ ...p, got: at(p.x, p.y) })),
      boundaries: ${JSON.stringify(boundaries)}.map(p => ({ ...p, got: at(p.x, p.y) })),
      header: at(40, 4),
    };
  })()`);

  const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

  const misplaced = sampled.probes.filter((p) => !near(p.got, p.want));
  record(
    misplaced.length === 0,
    `all ${BLOCKS} blocks stitched at the correct offset` +
      (misplaced.length ? ` (${misplaced.length} wrong, first: ${misplaced[0].label} wanted ${misplaced[0].want} got ${misplaced[0].got})` : '')
  );

  const burned = sampled.boundaries.filter((p) => near(p.got, HEADER_RGB));
  record(
    burned.length === 0,
    `sticky header not repeated at any of the ${boundaries.length} screenful seams` +
      (burned.length ? ` (${burned.length} repeats)` : '')
  );

  record(near(sampled.header, HEADER_RGB), 'sticky header still present at the top of the page');

  const expectedHeight = Math.round(layout.scrollHeight * scale);
  record(
    Math.abs(outHeight - expectedHeight) <= 2,
    `total height ${outHeight}px matches the full page (${expectedHeight}px)`
  );

  const bannerHits = await viewer.eval(`(() => {
    const total = segments.reduce((a, s) => a + s.h, 0);
    const width = segments[0].canvas.width;
    const at = (x, gy) => {
      const s = segments.find(s => gy >= s.y0 && gy < s.y0 + s.h);
      return s.ctx.getImageData(x, gy - s.y0, 1, 1).data;
    };
    let bands = [];
    for (let y = 0; y < total; y += 8) {
      const d = at(width - 60, y);
      if (Math.abs(d[0]-${BANNER_RGB[0]})<6 && Math.abs(d[1]-${BANNER_RGB[1]})<6 && Math.abs(d[2]-${BANNER_RGB[2]})<6) bands.push(y);
    }
    return bands.length ? [bands[0], bands[bands.length-1]] : null;
  })()`);
  record(
    bannerHits !== null && bannerHits[1] < layout.innerHeight * scale,
    `fixed banner appears once, in the first screenful only (found at y ${JSON.stringify(bannerHits)})`
  );

  // The banner is a 320px card of near-uniform fill. Individual pixel colours
  // are unreliable here because antialiased white text on a mid-grey block can
  // land on almost any value, but a long uniform run cannot happen by accident.
  const cardish = (c) => c.every((v) => v >= 235) || c.every((v) => v <= 48);
  const collides = Array.from({ length: BLOCKS }, (_, i) => blockColor(i)).filter(cardish);
  record(collides.length === 0, 'leak probe is unambiguous (no fixture block resembles the banner)');

  const overlayLeak = await viewer.eval(`(() => {
    const total = segments.reduce((a, s) => a + s.h, 0);
    const width = segments[0].canvas.width;
    const vh = ${layout.innerHeight} * ${scale};
    const need = Math.round(200 * ${scale});
    let worst = 0;
    const hits = [];
    for (let k = 0; k * vh < total; k++) {
      for (let dy = 10; dy < 130; dy += 5) {
        const gy = Math.round((k + 1) * vh - dy);
        if (gy < 0 || gy >= total) continue;
        const s = segments.find(s => gy >= s.y0 && gy < s.y0 + s.h);
        if (!s) continue;
        const d = s.ctx.getImageData(0, gy - s.y0, width, 1).data;
        let run = 0;
        const consider = (len) => {
          if (len > worst && len <= need * 3) worst = len;
          // Card-width, not page-width: the banner is ~330 CSS px across.
          if (len >= need && len <= need * 3) hits.push(gy);
        };
        for (let i = 0; i < d.length; i += 4) {
          const light = d[i] >= 235 && d[i+1] >= 235 && d[i+2] >= 235;
          const dark = d[i] <= 48 && d[i+1] <= 48 && d[i+2] <= 48;
          if (light || dark) { run++; continue; }
          if (run) consider(run);
          run = 0;
        }
        if (run) consider(run);
      }
    }
    return { hits: hits.slice(0, 4), worst, need };
  })()`);
  record(
    overlayLeak.hits.length === 0,
    `progress banner never appears in the captured image ` +
      `(longest uniform run ${overlayLeak.worst}px, banner would be ${overlayLeak.need}px)` +
      (overlayLeak.hits.length ? ' FOUND AT y ' + JSON.stringify(overlayLeak.hits) : '')
  );

  if (INTERRUPTIBLE) {
  // The popup drives real runs, so exercise that path and not just capture().
  // Also measure how much of the capture loop the on-page overlay is actually
  // visible for: hiding it before the rate-limit wait once left it dark for
  // most of every cycle, which is what made the page feel like it flickered.
  await sw.eval(`(async () => {
    ${findTab}
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise(r => setTimeout(r, 400));
    begin(tab);
    return true;
  })()`);

  const duty = await page.eval(`(async () => {
    let visible = 0, samples = 0;
    let curtainSeen = false, curtainDuringCapture = false, curtainWords = '';
    for (let i = 0; i < 700; i++) {
      const curtain = document.getElementById('__longshot_curtain');
      if (curtain) {
        curtainSeen = true;
        const w = curtain.shadowRoot && curtain.shadowRoot.querySelector('.word');
        if (w) curtainWords = w.textContent;
      }
      const host = document.getElementById('__longshot_ui');
      if (!host) {
        if (samples > 5) break;
      } else {
        // .count only carries text once the capture loop proper has started,
        // which keeps priming out of the measurement.
        const count = host.shadowRoot && host.shadowRoot.querySelector('.count');
        if (count && count.textContent) {
          samples++;
          if (getComputedStyle(host).visibility !== 'hidden') visible++;
          if (curtain) curtainDuringCapture = true;
        }
      }
      await new Promise(r => setTimeout(r, 30));
    }
    return { visible, samples, curtainSeen, curtainDuringCapture, curtainWords };
  })()`);
  record(duty.curtainSeen, 'the fast priming scroll is covered rather than shown');
  record(
    /stay on this tab/i.test(duty.curtainWords || ''),
    `the cover itself tells you to stay on the tab ("${(duty.curtainWords || '').slice(0, 70)}")`
  );
  record(
    !duty.curtainDuringCapture,
    'that cover is gone before the first screenful, so it cannot be photographed'
  );
  const seen = duty.samples ? duty.visible / duty.samples : 0;
  record(duty.samples > 30, `overlay observed across the capture loop (${duty.samples} samples)`);
  record(
    seen > 0.6,
    `overlay is visible for most of the loop, not strobing (${Math.round(seen * 100)}% of samples)`
  );

  const popupRun = await sw.eval(`(async () => {
    for (let i = 0; i < 240; i++) {
      if (!running) return lastStatus ? lastStatus.phase : 'finished with no status';
      await new Promise(r => setTimeout(r, 250));
    }
    return 'never finished';
  })()`);
  record(popupRun === 'done', `popup-driven capture runs to completion (${popupRun})`);

  const filename = await viewer.eval(`(() => {
    const brand = chrome.runtime.getManifest().name.toLowerCase();
    return { name: name(segments[0], 'png'), brand };
  })()`);
  record(
    filename.name.startsWith(filename.brand + '-'),
    `saved file is branded with the extension name (${filename.name})`
  );

  // A backgrounded tab issues no animation frames. Before the paint waits were
  // capped this hung forever and left the page scroll-locked.
  const hung = await sw.eval(`(async () => {
    ${findTab}
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise(r => setTimeout(r, 400));
    const inFlight = capture(tab).then(() => 'completed', e => (e && e.expected ? 'stopped: ' : 'crashed: ') + e.message);
    await new Promise(r => setTimeout(r, 2500));
    const decoy = await chrome.tabs.create({ url: 'about:blank', active: true });
    const outcome = await Promise.race([
      inFlight,
      new Promise(r => setTimeout(() => r('HUNG'), 20000)),
    ]);
    await chrome.tabs.remove(decoy.id);
    return outcome;
  })()`);
  record(hung.startsWith('stopped:'), `backgrounding the tab stops the run instead of hanging (${hung})`);

  const freed = await page.eval(
    `(() => {
       const e = new WheelEvent('wheel', { cancelable: true, bubbles: true });
       window.dispatchEvent(e);
       return { locked: e.defaultPrevented, overlay: document.querySelectorAll('#__longshot_ui').length };
     })()`
  );
  record(
    !freed.locked && freed.overlay === 0,
    `page is unlocked and clean after a backgrounded run (${JSON.stringify(freed)})`
  );

  // The real entry point is the toolbar popup, which nothing above exercises.
  // Opening popup.html in a *background* tab reproduces it faithfully: its
  // chrome.tabs.query({active:true}) then resolves to the page under test,
  // exactly as it does when Chrome renders the popup over that page.
  const popupUrl = `chrome-extension://${extId}/popup.html`;
  await sw.eval(`(async () => {
    ${findTab}
    await chrome.tabs.update(tab.id, { active: true });
    await new Promise(r => setTimeout(r, 400));
    await chrome.tabs.create({ url: '${popupUrl}', active: false });
    return true;
  })()`);

  const popupTarget = await waitFor((t) => t.url === popupUrl, 'popup page');
  const popupPage = await new CDP(popupTarget.webSocketDebuggerUrl).open();
  await popupPage.send('Runtime.enable');

  // The panel must be up on the page before the first screenful is taken.
  let panelUp = false;
  for (let i = 0; i < 100 && !panelUp; i++) {
    panelUp = await page.eval(
      `(() => {
         const h = document.getElementById('__longshot_ui');
         return Boolean(h) && getComputedStyle(h).visibility !== 'hidden' && h.getBoundingClientRect().width > 100;
       })()`
    );
    if (!panelUp) await sleep(100);
  }
  record(panelUp, 'popup click puts the on-page panel up, visible and laid out');

  // Read the specific nodes rather than the whole shadow root, which would
  // otherwise include the contents of its <style> element.
  const wording = await page.eval(
    `(() => {
       const r = document.getElementById('__longshot_ui');
       if (!r || !r.shadowRoot) return null;
       const part = (sel) => {
         const n = r.shadowRoot.querySelector(sel);
         return n ? n.textContent.trim() : '';
       };
       return [part('.title'), part('.count'), part('.hint')].filter(Boolean).join(' | ');
     })()`
  );
  record(
    Boolean(wording) && /stay on this tab/i.test(wording) && /esc/i.test(wording),
    `panel says to stay on the tab and how to stop ("${(wording || '').slice(0, 90)}")`
  );

  let popupText = '';
  for (let i = 0; i < 120; i++) {
    popupText = await popupPage.eval(`document.getElementById('headline').textContent`);
    if (/Capturing section/i.test(popupText)) break;
    await sleep(150);
  }
  record(/Capturing section \d+ of \d+/i.test(popupText), `popup shows live progress ("${popupText}")`);

  await page.send('Page.enable');
  const frame = await page.send('Page.captureScreenshot', { format: 'png' });
  const proofPath = path.join(process.cwd(), 'panel-proof.png');
  fs.writeFileSync(proofPath, Buffer.from(frame.data, 'base64'));
  console.log('panel screenshot written to', proofPath);

  const stopVisible = await popupPage.eval(
    `(() => { const r = document.getElementById('row'); return !r.hidden && document.getElementById('stop').offsetWidth > 0; })()`
  );
  record(stopVisible, 'popup offers a Stop button while running');

  const popupDone = await sw.eval(`(async () => {
    for (let i = 0; i < 240; i++) {
      if (!running) return lastStatus ? lastStatus.phase : 'finished, no status';
      await new Promise(r => setTimeout(r, 250));
    }
    return 'never finished';
  })()`);
  record(popupDone === 'done', `capture started from the popup completes (${popupDone})`);
  popupPage.close();

  } else {
    skip('popup, overlay-duty, filename and backgrounding checks', 'page is only a screenful or two');

    // A panel that appears and vanishes inside a second reads as a glitch, so a
    // short page should be captured with no on-page furniture whatsoever.
    await sw.eval(`(async () => {
      ${findTab}
      await chrome.tabs.update(tab.id, { active: true });
      await new Promise(r => setTimeout(r, 300));
      begin(tab);
      return true;
    })()`);
    const quiet = await page.eval(`(async () => {
      let panel = false, curtain = false;
      for (let i = 0; i < 220; i++) {
        if (document.getElementById('__longshot_ui')) panel = true;
        if (document.getElementById('__longshot_curtain')) curtain = true;
        await new Promise(r => setTimeout(r, 15));
      }
      return { panel, curtain };
    })()`);
    record(
      !quiet.panel && !quiet.curtain,
      `short page is captured quietly, with nothing flashed on it (${JSON.stringify(quiet)})`
    );
  }

  const preview = await viewer.eval(`(() => {
    const total = segments.reduce((a, s) => a + s.h, 0);
    const k = 400 / segments[0].canvas.width;
    const c = document.createElement('canvas');
    c.width = 400; c.height = Math.round(total * k);
    const ctx = c.getContext('2d');
    for (const s of segments) ctx.drawImage(s.canvas, 0, Math.round(s.y0 * k), 400, Math.round(s.h * k));
    return c.toDataURL('image/jpeg', 0.75);
  })()`);
  const previewPath = path.join(process.cwd(), 'stitched-preview.jpg');
  fs.writeFileSync(previewPath, Buffer.from(preview.split(',')[1], 'base64'));
  console.log('preview written to', previewPath);

  record(sw.exceptions.length === 0, `no runtime errors in the service worker${sw.exceptions.length ? ': ' + sw.exceptions[0] : ''}`);
  record(viewer.exceptions.length === 0, `no runtime errors in the viewer${viewer.exceptions.length ? ': ' + viewer.exceptions[0] : ''}`);

  // The page must be left exactly as it was found.
  const after = await page.eval(
    `(() => {
       const e = new WheelEvent('wheel', { cancelable: true, bubbles: true });
       window.dispatchEvent(e);
       return {
         scrollY: window.scrollY,
         banner: getComputedStyle(document.getElementById('banner')).visibility,
         header: getComputedStyle(document.querySelector('header')).visibility,
         styleLeft: document.querySelectorAll('#__longshot_style').length,
         overlayLeft: document.querySelectorAll('#__longshot_ui, #__longshot_banner').length,
         stillLocked: e.defaultPrevented,
       };
     })()`
  );
  record(
    after.scrollY === 0 && after.banner === 'visible' && after.header === 'visible' &&
      after.styleLeft === 0 && after.overlayLeft === 0 && after.stillLocked === false,
    `page restored afterwards (${JSON.stringify(after)})`
  );
  if (INTERRUPTIBLE) {
  // The overlay promises that leaving the tab stops the capture. Prove it, so
  // the promise is not just words on a card.
  const abort = await sw.eval(`(async () => {
    const [target] = await chrome.tabs.query({ url: 'http://127.0.0.1:${HTTP_PORT}/index.html' });
    if (!target) return 'no page tab found';
    await chrome.tabs.update(target.id, { active: true });
    await new Promise(r => setTimeout(r, 500));

    const inFlight = capture(target).then(
      () => 'ran to completion',
      e => (e && e.expected ? 'stopped: ' : 'crashed: ') + e.message
    );
    await new Promise(r => setTimeout(r, 3000));
    const decoy = await chrome.tabs.create({ url: 'about:blank', active: true });
    const outcome = await inFlight;
    await chrome.tabs.remove(decoy.id);
    return outcome;
  })()`);
  record(
    abort.startsWith('stopped: Capture stopped because you switched tabs'),
    `switching tabs mid-capture stops it and says why (${abort})`
  );

  const afterAbort = await page.eval(
    `({ leftovers: document.querySelectorAll('#__longshot_style, #__longshot_ui').length })`
  );
  record(afterAbort.leftovers === 0, 'an aborted capture still cleans up after itself');

  // The overlay also offers Esc as the way out, so that has to be real too.
  const escaped = await sw.eval(`(async () => {
    const [target] = await chrome.tabs.query({ url: 'http://127.0.0.1:${HTTP_PORT}/index.html' });
    await chrome.tabs.update(target.id, { active: true });
    await new Promise(r => setTimeout(r, 500));

    const inFlight = capture(target).then(
      () => 'ran to completion',
      e => (e && e.expected ? 'stopped: ' : 'crashed: ') + e.message
    );
    await new Promise(r => setTimeout(r, 3000));
    await exec(target.id, () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    return inFlight;
  })()`);
  record(escaped.startsWith('stopped:'), `pressing Esc stops the capture (${escaped})`);
  } else {
    skip('tab-switch and Esc cancellation checks', 'page is only a screenful or two');
  }

  record(
    !(await page.eval(wheelBlocked)),
    'scrolling is handed back after an Esc-cancelled capture too'
  );

} catch (err) {
  record(false, `harness error: ${err.message}`);
} finally {
  chrome.kill('SIGKILL');
  server.kill('SIGKILL');
  spawnSync('rm', ['-rf', profile]);
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
