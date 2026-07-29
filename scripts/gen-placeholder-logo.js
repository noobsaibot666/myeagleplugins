#!/usr/bin/env node
// Generates a simple 128x128 placeholder plugin logo.png (no dependencies —
// hand-rolled PNG encoder via zlib) so manifest.json's `logo` field always
// points at something real. Swap it for real artwork whenever you like.
//
// Usage: node scripts/gen-placeholder-logo.js <output.png> [hex1] [hex2]

const fs = require("fs");
const zlib = require("zlib");

const SIZE = 128;
const out = process.argv[2];
if (!out) {
  console.error("Usage: node scripts/gen-placeholder-logo.js <output.png> [hex1] [hex2]");
  process.exit(1);
}
const c1 = hexToRgb(process.argv[3] || "#64D2FF");
const c2 = hexToRgb(process.argv[4] || "#0A84FF");

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Signed distance from point to a rounded-rect boundary (for corner radius + AA).
function roundedRectCoverage(x, y, size, radius) {
  const dx = Math.max(radius - x, x - (size - radius), 0);
  const dy = Math.max(radius - y, y - (size - radius), 0);
  if (dx === 0 || dy === 0) return 1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist <= radius ? 1 : Math.max(0, 1 - (dist - radius));
}

// Point-in-triangle (barycentric) for the arrowhead.
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

const radius = 26;
const stemW = 14,
  stemTop = 30,
  stemBottom = 74,
  cx = SIZE / 2;
const headHalf = 20,
  headTop = 70,
  headTip = 94;

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (1 + SIZE * 4);
  raw[rowStart] = 0; // filter type: none
  for (let x = 0; x < SIZE; x++) {
    const t = (x + y) / (2 * SIZE);
    let r = lerp(c1[0], c2[0], t);
    let g = lerp(c1[1], c2[1], t);
    let b = lerp(c1[2], c2[2], t);
    let a = 255 * roundedRectCoverage(x, y, SIZE, radius);

    const inStem = x >= cx - stemW / 2 && x <= cx + stemW / 2 && y >= stemTop && y <= stemBottom;
    const inHead = inTriangle(
      x,
      y,
      cx - headHalf,
      headTop,
      cx + headHalf,
      headTop,
      cx,
      headTip
    );
    if ((inStem || inHead) && a > 0) {
      r = 255;
      g = 255;
      b = 255;
    }

    const idx = rowStart + 1 + x * 4;
    raw[idx] = r;
    raw[idx + 1] = g;
    raw[idx + 2] = b;
    raw[idx + 3] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${SIZE}x${SIZE})`);
