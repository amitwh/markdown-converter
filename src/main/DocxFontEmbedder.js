'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const FONT_TABLE_PATH = 'word/fontTable.xml';
const FONT_TABLE_RELS_PATH = 'word/_rels/fontTable.xml.rels';

function fontTableXml(family) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="${family}">
    <w:panose1 w:val="020F0502020204030204"/>
    <w:charset w:val="00"/>
    <w:family w:val="modern"/>
    <w:pitch w:val="fixed"/>
    <w:embedRegular r:id="rId1"/>
  </w:font>
</w:fonts>`;
}

function fontTableRels(fontFilename) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${fontFilename}"/>
</Relationships>`;
}

async function embedDocxFont(inputDocxPath, outputDocxPath, ttfPath, fontFamily) {
  if (!ttfPath || !fs.existsSync(ttfPath)) {
    throw new Error(`DocxFontEmbedder: TTF not found at ${ttfPath}`);
  }
  const inputBytes = fs.readFileSync(inputDocxPath);
  const zip = await JSZip.loadAsync(inputBytes);
  const safeFamily = String(fontFamily).replace(/[^A-Za-z0-9]/g, '');
  const fontFilename = `${safeFamily}.ttf`;
  const fontBytes = fs.readFileSync(ttfPath);
  zip.file(`word/fonts/${fontFilename}`, fontBytes);
  zip.file(FONT_TABLE_PATH, fontTableXml(safeFamily));
  zip.file(FONT_TABLE_RELS_PATH, fontTableRels(fontFilename));
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputDocxPath, out);
}

module.exports = { embedDocxFont };
