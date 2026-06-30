'use strict';

// fontspec accepts forward-slash paths on all platforms (TeX normalizes).
// Normalize Windows backslashes so we can reliably build Path/filename.
function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function escape(s) {
  // fontspec values: braces are the only TeX-significant chars we might emit
  // from a basename. Backslashes are converted to '/' upstream by toPosix().
  return String(s).replace(/[{}]/g, '\\$&');
}

function dirOf(p) {
  return toPosix(p).replace(/\/[^/]+$/, '') + '/';
}

function baseName(p) {
  return toPosix(p).split('/').pop();
}

// Strip a weight-style suffix from a TTF filename to get the family prefix
// (e.g. JetBrainsMono-Regular.ttf -> JetBrainsMono). Used as the `\setmonofont`
// argument so `*-Regular` / `*-Bold` globs resolve to the right files.
function weightPrefix(p) {
  return baseName(p).replace(/-(Regular|Bold|Light|Medium|SemiBold|Italic)\.ttf$/i, '');
}

function build({ fontTtfPath, boldTtfPath, ligatures }) {
  if (!fontTtfPath) {
    return '% Monospace font path unavailable; TeX will use its default monospace.\n';
  }

  const ligValue = ligatures ? 'Ligatures=TeX' : 'Ligatures=NoCommon';
  const prefix = escape(weightPrefix(fontTtfPath));

  return `\\usepackage{fontspec}
\\setmonofont[Path=${escape(dirOf(fontTtfPath))},Extension=.ttf,UprightFont=*-Regular,BoldFont=*-Bold,${ligValue}]{${prefix}}
`;
}

module.exports = { build };