// Magnifies the small icons so their actual pixels can be judged, on both a
// light and a dark toolbar. Run: node tools/preview-icons.mjs
import fs from 'node:fs';
import { render, encodePNG } from './make-icons.mjs';

const SHOW = [16, 32, 48];
const ZOOM = 11;
const PAD = 16;
const BACKDROPS = [[241, 243, 244], [53, 54, 58]]; // Chrome light and dark toolbars

const cellW = SHOW.map((s) => s * ZOOM + PAD * 2);
const width = cellW.reduce((a, b) => a + b, 0);
const rowH = Math.max(...SHOW.map((s) => s * ZOOM)) + PAD * 2;
const height = rowH * BACKDROPS.length;

const out = Buffer.alloc(width * height * 4);
const put = (x, y, r, g, b, a) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  const src = a / 255;
  out[i] = Math.round(r * src + out[i] * (1 - src));
  out[i + 1] = Math.round(g * src + out[i + 1] * (1 - src));
  out[i + 2] = Math.round(b * src + out[i + 2] * (1 - src));
  out[i + 3] = 255;
};

BACKDROPS.forEach((bg, row) => {
  const top = row * rowH;
  for (let y = top; y < top + rowH; y++) for (let x = 0; x < width; x++) put(x, y, ...bg, 255);

  let left = 0;
  SHOW.forEach((size, i) => {
    const rgba = render(size);
    const ox = left + PAD;
    const oy = top + PAD;
    for (let sy = 0; sy < size; sy++) {
      for (let sx = 0; sx < size; sx++) {
        const p = (sy * size + sx) * 4;
        for (let dy = 0; dy < ZOOM; dy++) {
          for (let dx = 0; dx < ZOOM; dx++) {
            put(ox + sx * ZOOM + dx, oy + sy * ZOOM + dy, rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3]);
          }
        }
      }
    }
    left += cellW[i];
  });
});

fs.writeFileSync('icon-preview.png', encodePNG(width, out, height));
console.log(`icon-preview.png  ${width}x${height}  (sizes ${SHOW.join(', ')} at ${ZOOM}x)`);
