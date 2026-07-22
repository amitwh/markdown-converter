'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function withEpubEmbedFontArgs(pandocArgs, ttfPath, _fontFamily) {
  return [`--epub-embed-font=${ttfPath}`, ...pandocArgs];
}

async function embedEpubFont(epubPath, ttfPath, _fontFamily) {
  if (!ttfPath || !fs.existsSync(ttfPath)) {
    throw new Error(`EpubFontEmbedder: TTF not found at ${ttfPath}`);
  }
  const bytes = fs.readFileSync(epubPath);
  const zip = await JSZip.loadAsync(bytes);
  const ttfBytes = fs.readFileSync(ttfPath);
  const fontName = path.basename(ttfPath);
  zip.file(`OEBPS/${fontName}`, ttfBytes);
  const opfPath = 'OEBPS/content.opf';
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    fs.writeFileSync(epubPath, await zip.generateAsync({ type: 'nodebuffer' }));
    return;
  }
  let opf = await opfFile.async('string');
  const manifestEntry = `<item id="font-${path.basename(fontName, '.ttf')}" href="${fontName}" media-type="application/x-font-ttf"/>`;
  if (!opf.includes('manifest')) {
    opf = opf.replace('</package>', `<manifest>${manifestEntry}</manifest></package>`);
  } else if (!opf.includes(fontName)) {
    opf = opf.replace('</manifest>', `${manifestEntry}</manifest>`);
  }
  zip.file(opfPath, opf);
  fs.writeFileSync(epubPath, await zip.generateAsync({ type: 'nodebuffer' }));
}

module.exports = { withEpubEmbedFontArgs, embedEpubFont };
