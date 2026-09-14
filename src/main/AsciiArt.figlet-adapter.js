/**
 * Figlet adapter — lazy-loads the figlet package and caches the font list.
 *
 * The figlet npm package ships ~400 fonts. Lazy-loading on first
 * `generateFiglet` / `listFigletFonts` call keeps app startup fast. If
 * `require('figlet')` itself fails (corrupt install), the adapter reports
 * the system as unavailable instead of crashing.
 *
 * @module AsciiArt.figlet-adapter
 */
'use strict';

class AsciiArtFigletError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AsciiArtFigletError';
    this.cause = cause;
  }
}

let _figlet = undefined; // undefined = not yet attempted; null = failed
let _figletFonts = undefined; // undefined = not yet listed

function loadFiglet() {
  if (_figlet !== undefined) return _figlet;
  try {
    _figlet = require('figlet');
  } catch {
    _figlet = null;
  }
  return _figlet;
}

function listFigletFonts() {
  const f = loadFiglet();
  if (!f) return [];
  if (_figletFonts === undefined) {
    try {
      _figletFonts = f.fontsSync();
    } catch {
      _figletFonts = [];
    }
  }
  return _figletFonts.slice();
}

function generateFiglet(text, font) {
  const f = loadFiglet();
  if (!f) {
    throw new AsciiArtFigletError('figlet is not available');
  }
  try {
    return f.textSync(String(text ?? ''), { font });
  } catch (err) {
    throw new AsciiArtFigletError(`figlet render failed for font "${font}": ${err.message}`, err);
  }
}

// Test-only cache reset; not used at runtime.
function _resetCache() {
  _figlet = undefined;
  _figletFonts = undefined;
}

module.exports = {
  AsciiArtFigletError,
  loadFiglet,
  listFigletFonts,
  generateFiglet,
  _resetCache,
};
