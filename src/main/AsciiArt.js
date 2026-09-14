/**
 * ASCII art orchestrator — pure module.
 *
 * Public API:
 *   - generate({ text, font, options }) → string
 *   - listFonts()                        → [{ id, label, kind, sample }]
 *   - getFontMeta(id)                    → { kind, height?, supportedChars? } | null
 *
 * `font` is a single string that namespaces each backend:
 *   - bare id ('standard', 'big', 'isometric1', ...)           → hand-coded
 *   - 'template:<name>'                                        → templates
 *   - 'figlet:<font>'                                          → lazy figlet
 *
 * Pure: no Electron, no fs, no IPC. Wired to main.js via ipcMain.handle.
 *
 * @module AsciiArt
 */
'use strict';

const { HAND_CODED_FONTS } = require('./AsciiArt.fonts');
const { getTemplate, ASCII_TEMPLATES } = require('./AsciiArt.templates');
const FigletAdapter = require('./AsciiArt.figlet-adapter');

const SAMPLE_TEXT = 'HELLO';

function _renderHandCoded(text, fontId) {
  const font = HAND_CODED_FONTS[fontId];
  if (!font) return null;
  const upper = String(text ?? '').toUpperCase();
  const lines = Array(font.height).fill('');
  for (const ch of upper) {
    const glyph = font.chars[ch] || font.chars[' '];
    for (let i = 0; i < font.height; i++) lines[i] += glyph[i];
  }
  return lines.join('\n');
}

function generate({ text, font, options: _options } = {}) {
  const f = typeof font === 'string' && font ? font : 'standard';
  if (f.startsWith('template:')) {
    return getTemplate(f.slice('template:'.length));
  }
  if (f.startsWith('figlet:')) {
    return FigletAdapter.generateFiglet(String(text ?? ''), f.slice('figlet:'.length));
  }
  const rendered = _renderHandCoded(text, f);
  return rendered !== null ? rendered : _renderHandCoded(text, 'standard');
}

function listFonts() {
  const out = [];
  for (const [id] of Object.entries(HAND_CODED_FONTS)) {
    out.push({
      id,
      label: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      kind: 'hand-coded',
      sample: _renderHandCoded(SAMPLE_TEXT, id),
    });
  }
  for (const name of FigletAdapter.listFigletFonts()) {
    out.push({
      id: `figlet:${name}`,
      label: `FIGlet · ${name}`,
      kind: 'figlet',
      sample: '',
    });
  }
  for (const name of Object.keys(ASCII_TEMPLATES)) {
    out.push({
      id: `template:${name}`,
      label: `Template · ${name.replace(/-/g, ' ')}`,
      kind: 'template',
      sample: ASCII_TEMPLATES[name],
    });
  }
  return out;
}

function getFontMeta(id) {
  if (typeof id !== 'string' || !id) return null;
  if (id.startsWith('template:')) {
    return ASCII_TEMPLATES[id.slice('template:'.length)] ? { kind: 'template' } : null;
  }
  if (id.startsWith('figlet:')) {
    const name = id.slice('figlet:'.length);
    return FigletAdapter.listFigletFonts().includes(name) ? { kind: 'figlet' } : null;
  }
  const font = HAND_CODED_FONTS[id];
  if (!font) return null;
  return {
    kind: 'hand-coded',
    height: font.height,
    supportedChars: Object.keys(font.chars),
  };
}

module.exports = { generate, listFonts, getFontMeta };
