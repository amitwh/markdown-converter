/**
 * @jest-environment node
 *
 * Per-font snapshot tests for the 17 hand-coded ASCII art fonts. Snapshots
 * are the safety net that catches drift when the font tables are hand-edited.
 * Line endings are normalized to \n and trailing whitespace is trimmed so
 * editor auto-trim does not produce spurious diffs.
 */
const AsciiArtFonts = require('../../src/main/AsciiArt.fonts');

const FONT_IDS = Object.freeze([
  // 5 existing
  'standard',
  'banner',
  'block',
  'bubble',
  'digital',
  // 12 new
  'big',
  'small',
  'lean',
  'slant',
  'isometric1',
  'isometric2',
  'isometric3',
  'isometric4',
  'three-d',
  'three-x-five',
  'ansi-shadow',
  'calvin-s',
]);

const normalize = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n');

describe('AsciiArt.fonts table shape', () => {
  test.each(FONT_IDS)('%s has height and chars for A-Z 0-9 and space', (id) => {
    const font = AsciiArtFonts.HAND_CODED_FONTS[id];
    expect(font).toBeDefined();
    expect(typeof font.height).toBe('number');
    expect(font.height).toBeGreaterThanOrEqual(3);
    expect(font.height).toBeLessThanOrEqual(12);
    expect(typeof font.chars).toBe('object');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')) {
      expect(font.chars[ch]).toBeDefined();
      expect(font.chars[ch]).toHaveLength(font.height);
      for (const line of font.chars[ch]) {
        expect(typeof line).toBe('string');
      }
    }
  });
});

describe('AsciiArt.fonts HELLO snapshot per font', () => {
  test.each(FONT_IDS)('%s', (id) => {
    const font = AsciiArtFonts.HAND_CODED_FONTS[id];
    const lines = Array(font.height).fill('');
    for (const ch of 'HELLO') {
      const glyph = font.chars[ch] || font.chars[' '];
      for (let i = 0; i < font.height; i++) lines[i] += glyph[i];
    }
    expect(normalize(lines.join('\n'))).toMatchSnapshot();
  });
});

describe('AsciiArt.fonts edge cases', () => {
  test('unknown character falls back to space glyph (preserves column width)', () => {
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    const fallback = font.chars[' '];
    const unknown = font.chars['é'];
    expect(unknown).toEqual(fallback);
  });

  test('all digit glyphs exist for standard', () => {
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    for (const d of '0123456789') {
      expect(font.chars[d]).toBeDefined();
      expect(font.chars[d]).toHaveLength(font.height);
    }
  });
});
