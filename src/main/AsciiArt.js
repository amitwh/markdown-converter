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

function _renderHandCoded(text, fontId, options = {}) {
  const font = HAND_CODED_FONTS[fontId];
  if (!font) return null;
  const spacer = ' '.repeat(Math.max(0, Math.min(10, Number(options.spacing) || 0)));
  const blocks = String(text ?? '')
    .split('\n')
    .map((line) => {
      const upper = line.toUpperCase();
      const lines = Array(font.height).fill('');
      let columns = 0;
      for (const ch of upper) {
        const glyph = font.chars[ch] || font.chars[' '];
        for (let i = 0; i < font.height; i++) {
          lines[i] += (columns > 0 && spacer ? spacer : '') + glyph[i];
        }
        columns++;
      }
      return lines.join('\n');
    });
  return blocks.join('\n\n');
}

function _normalizeFigletOptions(options = {}) {
  const out = {};
  const width = Number(options.width);
  if (Number.isFinite(width) && width > 0) out.width = Math.min(400, Math.floor(width));
  if (options.horizontalLayout) out.horizontalLayout = options.horizontalLayout;
  if (options.verticalLayout) out.verticalLayout = options.verticalLayout;
  if (options.whitespaceBreak) out.whitespaceBreak = true;
  return out;
}

function _justify(text, justify) {
  if (justify !== 'center' && justify !== 'right') return text;
  const lines = text.split('\n');
  const width = lines.reduce((w, l) => Math.max(w, l.length), 0);
  return lines
    .map((l) => {
      const pad = width - l.length;
      if (pad <= 0) return l;
      if (justify === 'right') return ' '.repeat(pad) + l;
      const left = Math.floor(pad / 2);
      return ' '.repeat(left) + l + ' '.repeat(pad - left);
    })
    .join('\n');
}

function generate({ text, font, options } = {}) {
  const f = typeof font === 'string' && font ? font : 'standard';
  const opts = options || {};
  if (f.startsWith('template:')) {
    return getTemplate(f.slice('template:'.length));
  }
  if (f.startsWith('figlet:')) {
    const rendered = FigletAdapter.generateFiglet(
      String(text ?? ''),
      f.slice('figlet:'.length),
      _normalizeFigletOptions(opts)
    );
    return _justify(rendered, opts.justify);
  }
  const rendered = _renderHandCoded(text, f, opts);
  return rendered !== null ? rendered : _renderHandCoded(text, 'standard', opts);
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
