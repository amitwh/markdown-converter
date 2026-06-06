/**
 * Build assets/icon.icns from the PNGs in assets/icons/.
 *
 * ICNS file format (Apple Icon Image):
 *   Header:  'icns' (4 bytes) + total file length (uint32 BE, includes header)
 *   For each size:
 *     Type tag (4 bytes) + length (uint32 BE, includes the 8-byte entry header) + PNG data
 *
 * Standard PNG type tags we'll include:
 *   icp4 = 16x16,    icp5 = 32x32,    icp6 = 64x64
 *   ic07 = 128x128,  ic08 = 256x256,  ic09 = 512x512,  ic10 = 1024x1024
 *   icsb = 48x48 (small)
 *   ic11 = 16x16@2x (32x32 retina),  ic12 = 32x32@2x (64x64 retina)
 *   ic13 = 128x128@2x (256x256 retina), ic14 = 256x256@2x (512x512 retina)
 */
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'assets', 'icons');
const outFile = path.join(__dirname, '..', 'assets', 'icon.icns');

// (size-in-pixels, icns type tag) — we skip sizes we don't have on disk
const sizes = [
  { size: 16,  type: 'icp4' },
  { size: 32,  type: 'icp5' },
  { size: 64,  type: 'icp6' },
  { size: 128, type: 'ic07' },
  { size: 256, type: 'ic08' },
  { size: 512, type: 'ic09' },
  { size: 1024, type: 'ic10' },
  { size: 48,  type: 'icsb' },
  { size: 32,  type: 'ic11' }, // 16@2x
  { size: 64,  type: 'ic12' }, // 32@2x
  { size: 256, type: 'ic13' }, // 128@2x
  { size: 512, type: 'ic14' }, // 256@2x
];

const entries = [];
for (const { size, type } of sizes) {
  const pngPath = path.join(iconsDir, `${size}x${size}.png`);
  if (!fs.existsSync(pngPath)) continue;
  const png = fs.readFileSync(pngPath);
  // ICNS requires 8-byte alignment per entry. paddedLen is the TOTAL entry size
  // (8-byte type+length header + PNG + padding), rounded up to a multiple of 8.
  const paddedLen = 8 + Math.ceil(png.length / 8) * 8;
  entries.push({ type, png, paddedLen });
  console.log(`  ${type} (${size}x${size}) — ${png.length} bytes`);
}

if (entries.length === 0) {
  console.error('No source PNGs found in', iconsDir);
  process.exit(1);
}

const totalLen = 8 + entries.reduce((s, e) => s + e.paddedLen, 0);
const buf = Buffer.alloc(totalLen);
let off = 0;

// Header
buf.write('icns', off, 4, 'ascii'); off += 4;
buf.writeUInt32BE(totalLen, off); off += 4;

// Entries
for (const { type, png, paddedLen } of entries) {
  buf.write(type, off, 4, 'ascii'); off += 4;
  buf.writeUInt32BE(paddedLen, off); off += 4;
  png.copy(buf, off);
  off += png.length;
  // Pad to 8-byte boundary within the entry. paddedLen already includes the 8-byte header.
  const pad = paddedLen - 8 - png.length;
  if (pad > 0) off += pad;
}

fs.writeFileSync(outFile, buf);
console.log(`\nWrote ${outFile} (${buf.length} bytes, ${entries.length} sizes)`);
