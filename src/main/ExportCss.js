'use strict';

const fs = require('fs');

function toDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

function build({ activeFontPath, family, weight = 400, ligatures = false }) {
  const features = ligatures ? 'normal' : "'liga' 0, 'calt' 0, 'dlig' 0";
  const faceBlock = activeFontPath
    ? `@font-face {
  font-family: '${family}';
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
  src: url('${toDataUri(activeFontPath)}') format('woff2');
}
`
    : '';

  return `${faceBlock}code, pre, kbd, samp {
  font-family: '${family}', monospace;
  font-feature-settings: ${features};
}
pre, code {
  white-space: pre;
  tab-size: 4;
}
`;
}

module.exports = { build };
