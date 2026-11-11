// Generates build/icon.png (1024x1024): an original pixel-art voxel cube with eyes. No dependencies.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 64;
const SCALE = 16;
const px = Array.from({ length: N * N }, () => null);

const inPoly = (x, y, pts) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const top = [[32, 6], [58, 19], [32, 32], [6, 19]];
const left = [[6, 19], [32, 32], [32, 60], [6, 47]];
const right = [[32, 32], [58, 19], [58, 47], [32, 60]];
const C = {
  top: [255, 201, 40], topHi: [255, 230, 120],
  left: [255, 43, 214], right: [123, 79, 209],
  out: [27, 20, 64], eye: [255, 255, 255], pupil: [17, 17, 17], glow: [43, 240, 255],
};

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    if (inPoly(cx, cy, top)) px[y * N + x] = (x + y) % 6 === 0 ? C.topHi : C.top;
    else if (inPoly(cx, cy, left)) px[y * N + x] = C.left;
    else if (inPoly(cx, cy, right)) px[y * N + x] = C.right;
  }
}
// eyes on the left face, glowing seam on the right face
const rect = (x0, y0, w, h, c) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px[y * N + x] = c;
};
rect(11, 32, 6, 7, C.eye);
rect(21, 37, 6, 7, C.eye);
rect(13, 35, 3, 4, C.pupil);
rect(23, 40, 3, 4, C.pupil);
for (let i = 0; i < 22; i++) {
  const x = 35 + i, y = Math.round(44 - i * 0.5);
  if (px[y * N + x]) px[y * N + x] = C.glow;
}
// outline
const out = px.slice();
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    if (px[y * N + x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px[(y + dy) * N + (x + dx)] && x + dx >= 0 && x + dx < N && y + dy >= 0 && y + dy < N);
    if (n) out[y * N + x] = C.out;
  }
}
// face edges
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    if (Math.abs(cx - 32) < 0.6 && cy > 32 && cy < 60) out[y * N + x] = C.out;
  }
}

const size = N * SCALE;
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) {
  raw[y * (size * 4 + 1)] = 0;
  for (let x = 0; x < size; x++) {
    const c = out[Math.floor(y / SCALE) * N + Math.floor(x / SCALE)];
    const o = y * (size * 4 + 1) + 1 + x * 4;
    if (c) {
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = 255;
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png);
console.log('wrote build/icon.png', size, 'x', size);
