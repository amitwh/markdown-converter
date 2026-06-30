'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Patches an EPUB produced by pandoc so it embeds the supplied TTF font files
// inside the OEBPS and registers them in the OPF manifest. Used after
// `pandoc --epub-embed-font=...` runs (which embeds the font data) but does
// not always add the manifest item we need for readers to discover the font.
//
// Writes a new file at `${epubPath}.patched.epub` and returns the patched path.
// Caller should overwrite the original after a successful export.
async function patchManifest(epubPath, fonts) {
  const zip = await JSZip.loadAsync(fs.readFileSync(epubPath));
  const opfPath = Object.keys(zip.files).find((f) => f.endsWith('content.opf'));
  if (!opfPath) throw new Error('EPUB has no content.opf');
  let opf = await zip.file(opfPath).async('string');

  for (const { path: fontPath, family, weight } of fonts) {
    const filename = path.basename(fontPath);
    const inFontDir = `OEBPS/fonts/${filename}`;
    zip.file(inFontDir, fs.readFileSync(fontPath));
    if (!opf.includes(filename)) {
      const safeFamily = String(family || 'Font').replace(/\s+/g, '-');
      const item = `<item id="font-${safeFamily}-${weight}" href="${inFontDir}" media-type="application/x-font-ttf"/>`;
      if (opf.includes('</manifest>')) {
        opf = opf.replace('</manifest>', `${item}</manifest>`);
      } else {
        // OPF without a manifest element (unusual but tolerated): inject one
        // just before </package> so the font item is still discoverable.
        opf = opf.replace('</package>', `<manifest>${item}</manifest></package>`);
      }
    }
  }

  zip.file(opfPath, opf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const tmp = `${epubPath}.patched.epub`;
  fs.writeFileSync(tmp, buf);
  return tmp;
}

module.exports = { patchManifest };