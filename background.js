// Foldout, scroll the page, capture each screenful, hand the pieces to the
// viewer tab to stitch. Everything runs locally; nothing is ever sent anywhere.

// chrome.tabs.captureVisibleTab is quota-limited to roughly 2 calls/second.
const MIN_CAPTURE_GAP_MS = 520;
const MAX_SLICES = 80;

// Below this, a capture is over almost before it starts, so announcing it reads
// as a glitch rather than an explanation. Short pages just get captured.
const PANEL_MIN_SCREENFULS = 4;
const JOB_TTL_MS = 5 * 60 * 1000;

const TAB_LEFT =
  'Capture stopped because you switched tabs. Foldout can only photograph ' +
  'whichever tab is in front, so stay on the page while it scrolls.';

const jobs = new Map();
let jobSeq = 0;
let running = false;
let lastCaptureAt = 0;

let stopRequested = false;
let statusPort = null;
let lastStatus = null;
let runSeq = 0;

// The popup is the progress display. It lives in browser UI, so unlike anything
// drawn on the page it can never be photographed by the capture it is reporting.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'foldout') return;
  statusPort = port;
  port.onDisconnect.addListener(() => {
    if (statusPort === port) statusPort = null;
  });
  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'start') begin(msg.tab);
    else if (msg.type === 'stop') stopRequested = true;
  });
  // Reopening the popup mid-run should rejoin the run in progress, not start a
  // second one.
  if (lastStatus) port.postMessage(lastStatus);
});

function report(status) {
  lastStatus = status;
  if (!statusPort) return;
  try {
    statusPort.postMessage(status);
  } catch {}
}

async function begin(tab) {
  if (running) {
    if (lastStatus) report(lastStatus);
    return;
  }
  running = true;
  stopRequested = false;
  const generation = ++runSeq;
  report({ phase: 'preparing' });

  try {
    await capture(tab);
    report({ phase: 'done' });
  } catch (err) {
    // "Can't work here" is a normal answer, not a crash, so say it quietly.
    const expected = Boolean(err && err.expected);
    const reason = String(err && err.message ? err.message : err);
    console[expected ? 'warn' : 'error']('[Foldout]', err);
    badge(expected ? '–' : '!', expected ? '#5f5f5a' : '#a8321d');
    chrome.action.setTitle({ title: 'Foldout: ' + reason });
    report({ phase: 'error', message: reason, expected });
  } finally {
    running = false;
    setTimeout(() => {
      // A newer run may have started inside the delay; leave its state alone.
      if (generation !== runSeq) return;
      lastStatus = null;
      badge('');
      chrome.action.setTitle({ title: 'Capture full page' });
    }, 6000);
  }
}

// Something the user can act on, rather than a fault in the code.
function expectedError(message) {
  const err = new Error(message);
  err.expected = true;
  return err;
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  const job = msg && jobs.get(msg.jobId);
  if (!msg || !job) {
    respond({ ok: false });
    return;
  }
  if (msg.type === 'foldout:meta') {
    respond({ ok: true, meta: job.meta, count: job.slices.length });
  } else if (msg.type === 'foldout:slice') {
    respond({ ok: true, slice: job.slices[msg.index] });
  } else if (msg.type === 'foldout:release') {
    jobs.delete(msg.jobId);
    respond({ ok: true });
  } else {
    respond({ ok: false });
  }
});

async function capture(tab) {
  if (!tab || !tab.id) throw new Error('No active tab.');

  const url = tab.url || '';
  if (/^(chrome|edge|about|devtools|chrome-extension|view-source|chrome-untrusted):/i.test(url)) {
    throw expectedError(
      'Chrome blocks every extension on its own pages, including settings, the New Tab page and the Web Store. Open a normal website and try again.'
    );
  }
  if (/^https:\/\/chromewebstore\.google\.com/i.test(url)) {
    throw expectedError('Chrome blocks every extension on the Web Store. Open a normal website and try again.');
  }
  if (/^file:/i.test(url)) {
    let allowed = true;
    try {
      allowed = await chrome.extension.isAllowedFileSchemeAccess();
    } catch {}
    if (!allowed) {
      throw expectedError(
        'To capture local files, open chrome://extensions, click Details on Foldout, and turn on "Allow access to file URLs".'
      );
    }
  }

  const tabId = tab.id;
  badge('…', '#3f3f46');

  await exec(tabId, prepare);

  // Measure before announcing anything, so we can tell a long capture worth
  // explaining from a short one that would just flash a panel and vanish.
  const first = await exec(tabId, measure);
  if (!first) throw expectedError('There is nothing capturable here. Chrome also blocks extensions inside its built-in PDF viewer.');
  const longRun = Math.ceil(first.height / Math.max(1, first.viewportHeight)) >= PANEL_MIN_SCREENFULS;

  report({ phase: 'priming' });
  if (longRun) {
    await exec(tabId, mountOverlay);
    // Priming races through the whole page to wake lazy images. Watching that
    // happen is the most alarming part, so cover it rather than explain it
    // away afterwards.
    await exec(tabId, showCurtain);
    await exec(tabId, primeLazyContent);
    await exec(tabId, hideCurtain);
  } else {
    await exec(tabId, primeLazyContent);
  }

  const page = await exec(tabId, measure);
  if (!page) throw expectedError('There is nothing capturable here. Chrome also blocks extensions inside its built-in PDF viewer.');

  const step = Math.max(1, page.viewportHeight);
  const estimate = Math.min(MAX_SLICES, Math.max(1, Math.ceil(page.height / step)));
  const slices = [];
  let previousY = -1;
  let truncated = true; // cleared by whichever break means we reached the end

  try {
    await exec(tabId, setOverlay, [{ hidden: false, done: 0, total: estimate }]);
    report({ phase: 'capturing', done: 0, total: estimate });

    for (let i = 0; i < MAX_SLICES; i++) {
      const target = i * step;
      if (i > 0 && target >= page.height) {
        truncated = false;
        break;
      }

      const at = await exec(tabId, scrollToY, [target]);
      if (at && at.aborted) throw expectedError('Capture stopped. Nothing was saved.');
      if (at && at.hidden) throw expectedError(TAB_LEFT);
      if (i > 0 && at.y === previousY) {
        truncated = false; // hit the bottom, no new content
        break;
      }
      previousY = at.y;

      // "Capture the visible tab" means exactly that. If the user has moved on,
      // the next frame would be a photograph of somebody else's page, so stop
      // rather than quietly stitching the wrong thing into their screenshot.
      await requireStillInFront(tabId, url);

      // Serve the capture quota *before* hiding anything. Hiding first left the
      // overlay dark for the whole 520ms wait, which read as a strobe rather
      // than a steady indicator.
      await settleQuota();
      if (stopRequested) throw expectedError('Capture stopped. Nothing was saved.');

      // Our own overlay would otherwise be baked into every screenful.
      await exec(tabId, setOverlay, [{ hidden: true }]);
      slices.push({ y: at.y, dataUrl: await grab(tab.windowId, tabId, url) });
      badge(String(slices.length), '#3f3f46');

      // Fixed and sticky chrome is real at the top of the page but would
      // otherwise be burned into every screenful below it.
      if (i === 0 && page.height > page.viewportHeight) {
        await exec(tabId, hideStuckElements);
      }
      const status = await exec(tabId, setOverlay, [{ hidden: false, done: slices.length, total: estimate }]);
      if (status && status.aborted) throw expectedError('Capture stopped. Nothing was saved.');
      if (status && status.hidden) throw expectedError(TAB_LEFT);
      report({ phase: 'capturing', done: slices.length, total: estimate });
    }
  } finally {
    await exec(tabId, restore).catch(() => {});
  }

  if (!slices.length) throw new Error('Nothing was captured.');
  report({ phase: 'assembling', done: slices.length, total: slices.length });

  // If we ran out of screenfuls before the bottom, describe what we actually
  // covered so the viewer does not leave a blank tail.
  const covered = slices[slices.length - 1].y + page.viewportHeight;

  const jobId = String(++jobSeq);
  jobs.set(jobId, {
    slices,
    meta: {
      viewportWidth: page.viewportWidth,
      height: Math.min(page.height, covered),
      contentWidth: page.contentWidth,
      truncated,
      title: page.title,
      url: page.url,
    },
  });
  setTimeout(() => jobs.delete(jobId), JOB_TTL_MS);

  badge('');
  await chrome.tabs.create({
    url: chrome.runtime.getURL('viewer.html#' + jobId),
    index: tab.index + 1,
  });
}

async function requireStillInFront(tabId, startedAt) {
  let tab = null;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {}

  if (!tab) throw expectedError('That tab was closed before the capture finished.');
  if (!tab.active) throw expectedError(TAB_LEFT);
  // Some pages rewrite the fragment as you scroll, so compare only the address.
  const here = String(tab.url || '').split('#')[0];
  const then = String(startedAt || '').split('#')[0];
  if (here && then && here !== then) {
    throw expectedError('Capture stopped because the page navigated somewhere else.');
  }
}

async function settleQuota() {
  const wait = MIN_CAPTURE_GAP_MS - (Date.now() - lastCaptureAt);
  if (wait > 0) await sleep(wait);
}

async function grab(windowId, tabId, pageUrl) {
  await settleQuota();

  for (let attempt = 0; attempt < 5; attempt++) {
    // Re-check immediately before the shutter rather than only before the wait
    // above. captureVisibleTab photographs whichever tab is frontmost and
    // permission-checks *that* tab, so a switch during the wait would otherwise
    // surface as a raw Chrome permission error instead of a useful sentence.
    await requireStillInFront(tabId, pageUrl);
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      lastCaptureAt = Date.now();
      return dataUrl;
    } catch (err) {
      const text = String(err);
      if (/MAX_CAPTURE_VISIBLE_TAB/i.test(text)) {
        await sleep(700);
        continue;
      }
      // Lost the race anyway: the frontmost tab changed between the check and
      // the shutter. Say the useful thing rather than Chrome's version.
      if (/Cannot access contents|must request permission/i.test(text)) {
        throw expectedError(
          'Capture stopped because the frontmost tab changed. Foldout can only photograph whichever tab is in front, so stay on the page while it scrolls.'
        );
      }
      throw err;
    }
  }
  throw new Error('Chrome rate-limited the capture. Try again.');
}

async function exec(tabId, func, args = []) {
  let frames;
  try {
    frames = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  } catch (err) {
    // Reached when the tab's URL was not visible to us up front, so the scheme
    // checks in capture() could not rule it out first.
    if (/cannot access|must request permission|showing error page/i.test(String(err))) {
      throw expectedError(
        'Chrome will not let any extension read this page. That covers chrome:// pages, the Web Store, the built-in PDF viewer, and Chrome error pages.'
      );
    }
    throw err;
  }
  const [frame] = frames;
  if (!frame) throw new Error('Could not run on this page.');
  return frame.result;
}

function badge(text, color = '#3f3f46') {
  chrome.action.setBadgeText({ text });
  if (text) chrome.action.setBadgeBackgroundColor({ color });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- injected into the page (isolated world, no closure access) ---------- */

function prepare() {
  const doc = document.documentElement;
  const state = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    scrollBehavior: doc.style.scrollBehavior,
    hidden: [],
    listeners: [],
    aborted: false,
  };
  window.__foldout = state;
  doc.style.scrollBehavior = 'auto';

  // Telling the user not to scroll is weaker than simply not letting them.
  // scrollTo() is unaffected, so we still drive the page; their input does not.
  const swallow = (e) => e.preventDefault();
  const SCROLL_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ',
  ]);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      state.aborted = true;
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (SCROLL_KEYS.has(e.key)) e.preventDefault();
  };
  state.listeners = [
    ['wheel', swallow, { passive: false, capture: true }],
    ['touchmove', swallow, { passive: false, capture: true }],
    ['keydown', onKey, { capture: true }],
  ];
  for (const [type, fn, opts] of state.listeners) window.addEventListener(type, fn, opts);

  const style = document.createElement('style');
  style.id = '__foldout_style';
  style.textContent =
    'html{scrollbar-width:none!important}' +
    '::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}';
  (document.head || doc).appendChild(style);
}

// Says out loud what prepare() has already done: the page is being scrolled
// for you, your own scrolling is switched off, and Esc is the way out.
//
// Built node by node inside a shadow root, so pages that enforce Trusted Types
// don't throw on innerHTML and no page CSS can reach in and restyle it. It
// stays dark in both themes on purpose, this is Foldout's hand on somebody
// else's page, not part of Foldout's own surface.
function mountOverlay() {
  if (document.getElementById('__foldout_ui')) return null;

  const host = document.createElement('div');
  host.id = '__foldout_ui';
  host.setAttribute('aria-hidden', 'true');
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = [
    ':host{position:fixed!important;left:50%!important;bottom:22px!important;',
    'transform:translateX(-50%)!important;z-index:2147483647!important;pointer-events:none!important}',
    '.card{box-sizing:border-box;width:330px;padding:12px 14px;border-radius:10px;',
    'background:rgb(23,23,26);color:rgb(238,238,241);border:1px solid rgba(255,255,255,.10);',
    'box-shadow:0 8px 28px rgba(0,0,0,.35);',
    'font:400 13px/1.45 ui-sans-serif,-apple-system,system-ui,sans-serif}',
    '.row{display:flex;align-items:baseline;gap:10px}',
    '.title{flex:1;font-weight:550}',
    '.count{color:rgb(160,160,169);font-variant-numeric:tabular-nums}',
    '.track{height:3px;margin:9px 0 8px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden}',
    '.fill{display:block;height:100%;width:0;background:rgb(224,112,63);transition:width 150ms ease}',
    '.hint{margin:0;color:rgb(160,160,169)}',
    '@media (prefers-reduced-motion:reduce){.fill{transition:none}}',
  ].join('');

  const card = document.createElement('div');
  card.className = 'card';

  const row = document.createElement('div');
  row.className = 'row';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = 'Getting the page ready';
  const count = document.createElement('span');
  count.className = 'count';
  row.append(title, count);

  const track = document.createElement('div');
  track.className = 'track';
  const fill = document.createElement('span');
  fill.className = 'fill';
  track.append(fill);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Foldout is scrolling for you. Stay on this tab. Press Esc to stop.';

  card.append(row, track, hint);
  root.append(style, card);
  (document.body || document.documentElement).appendChild(host);
  return null;
}

// An opaque cover in the page's own background colour, held over the priming
// scroll. Removed before the first screenful is taken, so it can never be
// photographed.
function showCurtain() {
  if (document.getElementById('__foldout_curtain')) return;

  const readable = (value) => value && value !== 'transparent' && !/,\s*0\)$/.test(value);
  const body = document.body ? getComputedStyle(document.body).backgroundColor : '';
  const rootBg = getComputedStyle(document.documentElement).backgroundColor;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const backdrop = readable(body) ? body : readable(rootBg) ? rootBg : dark ? '#101013' : '#ffffff';

  const host = document.createElement('div');
  host.id = '__foldout_curtain';
  host.setAttribute('aria-hidden', 'true');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = [
    ':host{position:fixed!important;inset:0!important;z-index:2147483646!important;',
    'pointer-events:none!important}',
    '.veil{width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
    'opacity:0;transition:opacity 130ms ease}',
    '.veil.on{opacity:1}',
    '.word{font:400 13px/1.45 ui-sans-serif,-apple-system,system-ui,sans-serif;color:',
    dark ? '#a0a0a9' : '#5f5f5a',
    '}',
    '@media (prefers-reduced-motion:reduce){.veil{transition:none}}',
  ].join('');

  const veil = document.createElement('div');
  veil.className = 'veil';
  veil.style.background = backdrop;
  const word = document.createElement('span');
  word.className = 'word';
  // The panel below carries progress; the cover carries the instruction, since
  // this is where the eye lands while the page races past.
  word.textContent = 'Foldout is scrolling this page to load everything. Stay on this tab.';
  veil.append(word);
  shadow.append(style, veil);
  (document.body || document.documentElement).appendChild(host);

  requestAnimationFrame(() => veil.classList.add('on'));
}

function hideCurtain() {
  const host = document.getElementById('__foldout_curtain');
  if (!host) return null;
  const veil = host.shadowRoot && host.shadowRoot.querySelector('.veil');
  if (veil) veil.classList.remove('on');
  return new Promise((r) =>
    setTimeout(() => {
      host.remove();
      r(null);
    }, 160)
  );
}

function setOverlay(next) {
  const host = document.getElementById('__foldout_ui');
  const state = window.__foldout;
  const aborted = Boolean(state && state.aborted);
  if (!host) return { aborted, hidden: document.hidden };

  host.style.setProperty('visibility', next.hidden ? 'hidden' : 'visible', 'important');

  const root = host.shadowRoot;
  if (!next.hidden && root && typeof next.done === 'number') {
    const title = root.querySelector('.title');
    const count = root.querySelector('.count');
    const fill = root.querySelector('.fill');
    if (title) title.textContent = 'Capturing this page';
    if (count) count.textContent = next.done + ' of ' + next.total;
    if (fill) fill.style.width = Math.min(100, Math.round((next.done / next.total) * 100)) + '%';
  }

  // Resolve only once the change has been painted, so the frame captured next
  // is guaranteed not to contain a half-faded overlay. A hidden tab never
  // paints at all, so the wait is capped rather than left to hang.
  return new Promise((r) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      r({ aborted, hidden: document.hidden });
    };
    requestAnimationFrame(() => requestAnimationFrame(done));
    setTimeout(done, 300);
  });
}

async function primeLazyContent() {
  const step = Math.round(window.innerHeight * 0.9);
  const limit = 80;
  for (let i = 0; i < limit; i++) {
    if (document.hidden) break;
    const y = i * step;
    if (y > document.documentElement.scrollHeight) break;
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 45));
  }
  window.scrollTo(0, 0);

  const pending = Array.from(document.images)
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise((r) => {
          img.addEventListener('load', r, { once: true });
          img.addEventListener('error', r, { once: true });
          setTimeout(r, 1200);
        })
    );
  await Promise.all(pending);
  await new Promise((r) => setTimeout(r, 250));
}

function measure() {
  const doc = document.documentElement;
  const body = document.body;
  return {
    height: Math.max(doc.scrollHeight, body ? body.scrollHeight : 0, doc.clientHeight),
    contentWidth: Math.max(doc.scrollWidth, body ? body.scrollWidth : 0, doc.clientWidth),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    title: document.title || location.hostname,
    url: location.href,
  };
}

async function scrollToY(y) {
  window.scrollTo(0, y);
  // Capped for the same reason as above: a backgrounded tab issues no frames.
  await new Promise((r) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      r();
    };
    requestAnimationFrame(() => requestAnimationFrame(done));
    setTimeout(done, 300);
  });
  await new Promise((r) => setTimeout(r, 130));
  const state = window.__foldout;
  return {
    y: window.scrollY,
    height: document.documentElement.scrollHeight,
    aborted: Boolean(state && state.aborted),
    hidden: document.hidden,
  };
}

function hideStuckElements() {
  const state = window.__foldout;
  if (!state) return 0;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    if (el.id === '__foldout_ui' || el.id === '__foldout_curtain') continue; // ours, managed separately
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    state.hidden.push([el, el.style.getPropertyValue('visibility'), el.style.getPropertyPriority('visibility')]);
    el.style.setProperty('visibility', 'hidden', 'important');
  }
  return state.hidden.length;
}

function restore() {
  const state = window.__foldout;
  const style = document.getElementById('__foldout_style');
  const overlay = document.getElementById('__foldout_ui');
  const curtain = document.getElementById('__foldout_curtain');
  if (style) style.remove();
  if (overlay) overlay.remove();
  if (curtain) curtain.remove();
  if (!state) return;
  for (const [type, fn, opts] of state.listeners || []) {
    window.removeEventListener(type, fn, opts);
  }
  for (const [el, value, priority] of state.hidden) {
    if (value) el.style.setProperty('visibility', value, priority);
    else el.style.removeProperty('visibility');
  }
  document.documentElement.style.scrollBehavior = state.scrollBehavior || '';
  window.scrollTo(state.scrollX, state.scrollY);
  window.__foldout = null;
}
