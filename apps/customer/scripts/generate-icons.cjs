/**
 * Generates minimal solid-color PNG icons for the Beverly customer PWA.
 * Brand green: #22c55e  (R=34 G=197 B=94)
 * Run once: node apps/customer/scripts/generate-icons.cjs
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

function crc32(buf) {
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
}

function makePng(size, r, g, b) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8]=8; ihdr[9]=2; // 8-bit depth, RGB

    // one scanline: filter-byte(0) + RGB * size
    const row = Buffer.alloc(1 + size * 3);
    for (let i = 0; i < size; i++) { row[1+i*3]=r; row[2+i*3]=g; row[3+i*3]=b; }
    const raw = Buffer.concat(Array.from({length: size}, () => row));
    const idat = zlib.deflateSync(raw, { level: 6 });

    return Buffer.concat([
        Buffer.from([137,80,78,71,13,10,26,10]),
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idat),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });

// Brand green #22c55e
const [R, G, B] = [34, 197, 94];

const icons = [
    { name: 'pwa-192.png',          size: 192 },
    { name: 'pwa-512.png',          size: 512 },
    { name: 'pwa-512-maskable.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.svg',          size: null }, // SVG handled separately
];

for (const { name, size } of icons) {
    if (!size) continue;
    const buf = makePng(size, R, G, B);
    fs.writeFileSync(path.join(outDir, name), buf);
    console.log(`wrote ${name} (${size}x${size})`);
}

// favicon SVG
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#22c55e"/>
  <text x="16" y="23" font-family="system-ui,sans-serif" font-size="20" font-weight="700"
        text-anchor="middle" fill="#0a0e14">B</text>
</svg>`;
fs.writeFileSync(path.join(outDir, 'favicon.svg'), svg);
console.log('wrote favicon.svg');
console.log('Done.');
