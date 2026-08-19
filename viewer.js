// Pulls the captured screenfuls from the service worker and draws them onto one
// or more canvases at full device resolution. Resolution is never reduced: if a
// page is too tall for a single canvas it is split into several images instead.

// Chrome tops out at 65535px per side, and past that the canvas silently yields
// transparent pixels while toBlob returns null. Stay well clear of it. This cap
// also keeps every file openable in ordinary image editors.
const MAX_SEGMENT_H = 32767;
const MAX_SEGMENT_AREA = 250000000;

const GLYPH = {
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/>' +
    '<circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  width:
    '<polyline points="18 8 22 12 18 16"/><polyline points="6 8 2 12 6 16"/><line x1="2" x2="22" y1="12" y2="12"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>' +
    '<path d="M12 9v4"/><path d="M12 17h.01"/>',
  empty: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};

const jobId = location.hash.slice(1);
const el = (id) => document.getElementById(id);

let segments = [];
let meta = null;

start();

async function start() {
  const info = await ask({ type: 'longshot:meta' });
  if (!info || !info.ok) return fail('That capture has expired.', 'Take a new one from the toolbar.');

  meta = info.meta;
  document.title = meta.title + ' · Longshot';
  el('title').textContent = meta.title;

  let scale = 1;
  let totalHeight = 0;

  for (let i = 0; i < info.count; i++) {
    const res = await ask({ type: 'longshot:slice', index: i });
    if (!res || !res.ok) return fail('That capture has expired.', 'Take a new one from the toolbar.');
    const img = await decode(res.slice.dataUrl);

    if (!segments.length) {
      scale = img.naturalWidth / meta.viewportWidth;
      totalHeight = Math.round(meta.height * scale);
      segments = layOut(img.naturalWidth, totalHeight);
    }

    // A screenful can straddle a seam, so offer it to every segment it touches
    // and let each canvas clip its own share.
    const y = Math.round(res.slice.y * scale);
    for (const seg of segments) {
      if (y + img.naturalHeight <= seg.y0 || y >= seg.y0 + seg.h) continue;
      seg.ctx.drawImage(img, 0, y - seg.y0);
    }
    progress(i + 1, info.count);
  }

  ask({ type: 'longshot:release' });

  for (const seg of segments) seg.blob = await toBlob(seg.canvas, 'image/png');
  paint(scale, totalHeight);
}

// Fewest full-resolution canvases that hold the page, split into equal bands.
function layOut(width, totalHeight) {
  const cap = Math.min(MAX_SEGMENT_H, Math.floor(MAX_SEGMENT_AREA / width));
  const count = Math.max(1, Math.ceil(totalHeight / cap));
  const band = Math.ceil(totalHeight / count);

  return Array.from({ length: count }, (_, i) => {
    const y0 = i * band;
    const h = Math.min(band, totalHeight - y0);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = h;
    return { canvas, ctx: canvas.getContext('2d'), y0, h, index: i, blob: null };
  });
}

function paint(scale, totalHeight) {
  const many = segments.length > 1;
  const bytes = segments.reduce((sum, s) => sum + s.blob.size, 0);
  const ratio = scale % 1 === 0 ? scale : scale.toFixed(2);

  el('detail').innerHTML =
    '<b>' + segments[0].canvas.width + ' × ' + totalHeight + '</b> px · ' +
    ratio + '× · ' + size(bytes) +
    (many ? ' · ' + segments.length + ' images' : '');

  if (many) {
    addNote(
      'scissors',
      'Chrome cannot hold a page this tall in one image, so it was split into ' +
        segments.length +
        ' pieces at full resolution rather than shrunk to fit. They join edge to edge, top to bottom.'
    );
  }
  if (meta.truncated) {
    addNote('warning', 'The page was still growing as it was captured, so this stops partway down.');
  }
  if (meta.contentWidth > meta.viewportWidth + 2) {
    addNote(
      'width',
      'The page is wider than the window, so anything off to the right is missing. Widen the window and capture again to get it.'
    );
  }

  const sheets = el('sheets');
  for (const seg of segments) {
    const figure = document.createElement('figure');

    if (many) {
      const bar = document.createElement('figcaption');
      const label = document.createElement('span');
      label.textContent =
        (seg.index + 1) + ' of ' + segments.length + ' · ' + seg.canvas.width + ' × ' + seg.h + ' px';
      bar.append(
        label,
        button('Copy', (b) => copy(seg.blob, b)),
        button('PNG', () => save(seg.blob, name(seg)))
      );
      figure.append(bar);
    }

    const img = document.createElement('img');
    img.src = URL.createObjectURL(seg.blob);
    img.alt = 'Captured page, part ' + (seg.index + 1) + ' of ' + segments.length;
    figure.append(img);
    sheets.append(figure);
  }

  el('status').hidden = true;

  el('png').disabled = false;
  el('png').onclick = () => downloadAll('image/png');
  el('jpg').disabled = false;
  el('jpg').onclick = () => downloadAll('image/jpeg');
  el('copy').disabled = many;
  el('copy').title = many ? 'Copy each piece from its own button below' : 'Copy the image to the clipboard';
  el('copy').onclick = () => copy(segments[0].blob, el('copy'));
}

async function downloadAll(type) {
  const ext = type === 'image/png' ? 'png' : 'jpg';
  for (const seg of segments) {
    const blob = type === 'image/png' ? seg.blob : await toBlob(seg.canvas, type, 0.92);
    save(blob, name(seg, ext));
    // Chrome throttles bursts of downloads, and asks once before allowing many.
    if (segments.length > 1) await new Promise((r) => setTimeout(r, 300));
  }
}

/* ---------- pieces ---------- */

function glyph(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}

function addNote(kind, text) {
  const note = document.createElement('div');
  note.className = 'note';
  const body = document.createElement('p');
  body.textContent = text;
  note.append(glyph(GLYPH[kind]), body);
  el('notes').append(note);
}

function button(text, onClick) {
  const b = document.createElement('button');
  b.className = 'small';
  b.textContent = text;
  b.addEventListener('click', () => onClick(b));
  return b;
}

async function copy(blob, host) {
  // The toolbar button wraps its text in a span beside an icon; the small
  // per-image buttons are plain text.
  const target = host.querySelector('span') || host;
  const was = target.textContent;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    target.textContent = 'Copied';
  } catch {
    target.textContent = 'Blocked';
  }
  setTimeout(() => (target.textContent = was), 1600);
}

function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function name(seg, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    '-' + pad(d.getHours()) + pad(d.getMinutes());
  let host = 'page';
  try {
    host = new URL(meta.url).hostname.replace(/^www\./, '');
  } catch {}
  const slug =
    (meta.title || host)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || host;
  const part = segments.length > 1 ? '-' + (seg.index + 1) + 'of' + segments.length : '';
  // Lead with the extension's own name so a file that gets shared says where it
  // came from. Read from the manifest so a rename carries through by itself.
  const brand =
    (chrome.runtime.getManifest().name || 'longshot')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'longshot';
  return brand + '-' + slug + '-' + stamp + part + '.' + (ext || 'png');
}

function progress(done, total) {
  const pct = Math.round((done / total) * 100);
  el('bar').style.width = pct + '%';
  el('track').setAttribute('aria-valuenow', String(pct));
  el('status-text').textContent = 'Stitching screenful ' + done + ' of ' + total + ' · ' + pct + '%';
}

function fail(headline, detail) {
  el('title').textContent = headline;
  const status = el('status');
  status.replaceChildren(glyph(GLYPH.empty), Object.assign(document.createElement('p'), { textContent: detail }));
}

function ask(message) {
  return chrome.runtime.sendMessage({ ...message, jobId }).catch(() => null);
}

function decode(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode a captured screenful.'));
    img.src = dataUrl;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function size(bytes) {
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
}
