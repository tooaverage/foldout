// Renders the toolbar icons to PNG with no dependencies: shapes are defined as
// signed-distance fields, supersampled for antialiasing, then encoded by hand.
// Run with: node tools/make-icons.mjs

import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];

const ORANGE = [184, 69, 28];
const WHITE = [255, 255, 255];

/* ---------- shapes, in a unit square ---------- */

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - r;
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function sample(x, y) {
  // Background plate.
  if (sdRoundedBox(x, y, 0.5, 0.5, 0.5, 0.5, 0.225) > 0) return null;

  // Camera: body plus the viewfinder bump that makes the silhouette readable
  // even at 16px, where any lens detail would collapse into a smudge.
  const body = sdRoundedBox(x, y, 0.5, 0.585, 0.318, 0.196, 0.072) <= 0;
  const bump = sdRoundedBox(x, y, 0.383, 0.398, 0.108, 0.06, 0.026) <= 0;
  const camera = body || bump;

  // The arrow is cut out of the body rather than sitting beside it, so the two
  // ideas share one shape instead of competing for space.
  const stem = x >= 0.449 && x <= 0.551 && y >= 0.455 && y <= 0.595;
  const head = inTriangle(x, y, 0.5, 0.732, 0.369, 0.578, 0.631, 0.578);
  const arrow = stem || head;

  return camera && !arrow ? WHITE : ORANGE;
}

function render(size) {
  const ss = Math.max(4, Math.ceil(256 / size));
  const total = ss * ss;
  const rgba = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          hits++;
        }
      }
      const i = (py * size + px) * 4;
      if (hits) {
        rgba[i] = Math.round(r / hits);
        rgba[i + 1] = Math.round(g / hits);
        rgba[i + 2] = Math.round(b / hits);
        rgba[i + 3] = Math.round((hits / total) * 255);
      }
    }
  }
  return rgba;
}

/* ---------- minimal PNG encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, rgba, height = width) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export { render, encodePNG, SIZES };

if (!import.meta.main) {
  // Imported for previewing; do not rewrite the icons as a side effect.
} else {
fs.mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, encodePNG(size, render(size)));
  console.log(`${path.relative(process.cwd(), file)}  ${size}×${size}`);
}
}
