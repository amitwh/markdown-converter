'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function buildPdfFontHeader(settings, ttfPath, fontFamily) {
  if (!ttfPath || !fs.existsSync(ttfPath)) {
    throw new Error(`PdfFontHeader: TTF not found at ${ttfPath}`);
  }
  const ligatures = !!(settings && settings.monospaceLigatures === true);
  const fontDir = path.dirname(ttfPath);
  const basename = path.basename(ttfPath);
  const boldName = basename.replace('Regular', 'Bold').replace('Medium', 'Bold');
  const lines = [
    `\\setmonofont[Path = ${fontDir}/,`,
    `             Extension = .ttf,`,
    `             UprightFont = ${basename},`,
    `             BoldFont = ${boldName},`,
    ligatures ? '             Ligatures=TeX,' : '',
    `             Scale = 0.9]`,
    `{${fontFamily}}`,
  ].filter(Boolean);
  const headerPath = path.join(os.tmpdir(), `monospace-pdf-${Date.now()}-${process.pid}.tex`);
  fs.writeFileSync(headerPath, lines.join('\n'), 'utf-8');
  return { headerPath, familyName: fontFamily };
}

module.exports = { buildPdfFontHeader };
