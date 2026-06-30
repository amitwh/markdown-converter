'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function generatedRId(idx) {
  return `rIdFont${idx}`;
}

async function patchZipWithFonts(inputPath, fonts) {
  const buf = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(buf);
  const existingFontNames = new Set();

  // Detect prior embeds (idempotency: skip TTF files already present).
  for (const f of Object.keys(zip.files)) {
    if (zip.files[f].name && /^word\/fonts\//.test(zip.files[f].name)) {
      existingFontNames.add(path.basename(f));
    }
  }

  for (let i = 0; i < fonts.length; i++) {
    const { path: fontPath } = fonts[i];
    const fname = path.basename(fontPath);
    const wordPath = `word/fonts/${fname}`;
    if (!existingFontNames.has(fname)) {
      zip.file(wordPath, fs.readFileSync(fontPath));
      existingFontNames.add(fname);
    }
  }

  // Build/replace word/fontTable.xml so Word knows the family and where to
  // fetch the embedded TTF data.
  const fontTableXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/main">\n` +
    fonts
      .map(
        (f, i) =>
          `  <w:font w:name="${f.family}"><w:embedRegular r:id="${generatedRId(i)}" xmlns:r="${REL_NS}"/></w:font>`
      )
      .join('\n') +
    `\n</w:fonts>\n`;

  zip.file('word/fontTable.xml', fontTableXml);

  // Patch [Content_Types].xml — add Override for /word/fontTable.xml and each TTF.
  const ctPath = '[Content_Types].xml';
  let ct = await zip.file(ctPath).async('string');
  if (!ct.includes('PartName="/word/fontTable.xml"')) {
    ct = ct.replace(
      '</Types>',
      '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>'
    );
  }
  for (const f of fonts) {
    const ttfCt = 'application/x-font-ttf';
    const filePart = `/word/fonts/${path.basename(f.path)}`;
    if (!ct.includes(`PartName="${filePart}"`)) {
      ct = ct.replace(
        '</Types>',
        `<Override PartName="${filePart}" ContentType="${ttfCt}"/></Types>`
      );
    }
  }
  if (!ct.includes('Default Extension="ttf"')) {
    ct = ct.replace(
      '</Types>',
      '<Default Extension="ttf" ContentType="application/x-font-ttf"/></Types>'
    );
  }
  zip.file(ctPath, ct);

  // Patch word/_rels/document.xml.rels — relationships for fontTable + each font.
  const relsPath = 'word/_rels/document.xml.rels';
  if (!zip.files[relsPath]) {
    zip.file(
      relsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${REL_NS}"/>`
    );
  }
  let rels = await zip.file(relsPath).async('string');
  if (!rels.includes('fontTable.xml')) {
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${generatedRId(fonts.length)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>`
    );
  }
  for (let i = 0; i < fonts.length; i++) {
    const fname = path.basename(fonts[i].path);
    if (!rels.includes(fname)) {
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${generatedRId(i)}" Type="http://schemas.microsoft.com/office/2011/relationships/font" Target="fonts/${fname}"/></Relationships>`
      );
    }
  }
  zip.file(relsPath, rels);

  // Patch word/styles.xml — bind SourceCode/VerbatimChar styles to the family.
  const stylesPath = 'word/styles.xml';
  if (zip.files[stylesPath]) {
    let styles = await zip.file(stylesPath).async('string');
    const family = fonts[0].family;
    if (!styles.includes(`w:ascii="${family}"`)) {
      styles = styles.replace(
        /(<w:style[^>]*w:styleId="(?:SourceCode|VerbatimChar)"[^>]*>)/,
        `$1<w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/></w:rPr>`
      );
    }
    zip.file(stylesPath, styles);
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(inputPath, outBuf);
  return inputPath;
}

async function embed(docxPath, fonts) {
  return patchZipWithFonts(docxPath, fonts);
}

module.exports = { embed };
