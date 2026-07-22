'use strict';

const { FAMILY_BY_KEY } = require('./settings/monospaceSettings');

function buildFontFaceBlock(family, woff2Bytes) {
  const safeFamily = family.replace(/'/g, "\\'");
  const b64 = Buffer.from(woff2Bytes).toString('base64');
  return `@font-face {
  font-family: '${safeFamily}';
  src: url(data:font/woff2;base64,${b64}) format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`;
}

function buildExportCss(settings, { woff2 } = {}) {
  const family = (settings && FAMILY_BY_KEY[settings.monospaceFont]) || 'JetBrains Mono';
  const ligatures = !!(settings && settings.monospaceLigatures === true);
  const face = buildFontFaceBlock(family, woff2 || Buffer.alloc(0));
  const feature = ligatures ? `code, pre, kbd, samp { font-feature-settings: 'liga' 1, 'calt' 1; }` : '';
  return [face, feature].filter(Boolean).join('\n\n');
}

module.exports = { buildExportCss, buildFontFaceBlock };
