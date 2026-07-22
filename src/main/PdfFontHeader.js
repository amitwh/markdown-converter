'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Build a xelatex/lualatex fontspec header referencing the bundled TTF.
 *
 * Uses an exclusive temp directory (mkdtempSync) to avoid the racy
 * Date.now()+pid filename pattern. Returns the directory along with the
 * header path; callers MUST `unlinkSync(headerPath)` and `rmdirSync(dir)`
 * after pandoc consumes the file.
 */
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-pdf-'));
  const headerPath = path.join(dir, 'monospace.tex');
  fs.writeFileSync(headerPath, lines.join('\n'), 'utf-8');
  return { headerPath, dir, familyName: fontFamily };
}

module.exports = { buildPdfFontHeader };
