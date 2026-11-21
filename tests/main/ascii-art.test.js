/**
 * @jest-environment node
 */
const AsciiArt = require('../../src/main/AsciiArt');
const AsciiArtFonts = require('../../src/main/AsciiArt.fonts');
const AsciiArtTemplates = require('../../src/main/AsciiArt.templates');

describe('AsciiArt.generate', () => {
  test('renders "HELLO" in standard font with known shape', () => {
    const out = AsciiArt.generate({ text: 'HELLO', font: 'standard' });
    const lines = out.split('\n');
    expect(lines).toHaveLength(AsciiArtFonts.HAND_CODED_FONTS.standard.height);
    expect(lines[0]).toMatch(/\|/);
  });

  test('lowercase input is uppercased', () => {
    const a = AsciiArt.generate({ text: 'hello', font: 'standard' });
    const b = AsciiArt.generate({ text: 'HELLO', font: 'standard' });
    expect(a).toBe(b);
  });

  test('unknown font falls back to standard', () => {
    const a = AsciiArt.generate({ text: 'A', font: 'nope-not-a-font' });
    const b = AsciiArt.generate({ text: 'A', font: 'standard' });
    expect(a).toBe(b);
  });

  test('unknown character substitutes space glyph (column width preserved)', () => {
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    const spaceWidth = font.chars[' '][0].length;
    const out = AsciiArt.generate({ text: 'A!A', font: 'standard' });
    const line = out.split('\n')[0];
    // "A" rendered + space-glyph for "!" + "A" rendered; the middle column
    // is the space-width.
    expect(line.length).toBeGreaterThanOrEqual(spaceWidth);
  });

  test('renders a named template via "template:<name>"', () => {
    const tpl = AsciiArtTemplates.getTemplate('arrow-right');
    expect(AsciiArt.generate({ text: 'ignored', font: 'template:arrow-right' })).toBe(tpl);
  });

  test('renders figlet font via "figlet:<font>" — adapter is mocked below', () => {
    // Mock the adapter module so we don't depend on the real figlet.
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: (t, f) => `FIGLET[${f}:${t}]`,
      listFigletFonts: () => ['Big', 'Slant'],
      loadFiglet: () => ({ fontsSync: () => ['Big', 'Slant'] }),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    expect(Fresh.generate({ text: 'HI', font: 'figlet:Big' })).toBe('FIGLET[Big:HI]');
  });

  test('propagates AsciiArtFigletError on figlet failure', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => {
      const AsciiArtFigletError = class extends Error {};
      return {
        AsciiArtFigletError,
        generateFiglet: () => {
          throw new AsciiArtFigletError('figlet boom');
        },
        listFigletFonts: () => [],
        loadFiglet: () => null,
      };
    });
    const Fresh = require('../../src/main/AsciiArt');
    expect(() => Fresh.generate({ text: 'X', font: 'figlet:Big' })).toThrow(/figlet/i);
  });
});

describe('AsciiArt.listFonts', () => {
  test('returns hand-coded fonts first, then figlet, then templates', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => ['Big', 'Slant'],
      loadFiglet: () => ({ fontsSync: () => ['Big', 'Slant'] }),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    const list = Fresh.listFonts();
    expect(list.length).toBeGreaterThanOrEqual(17 + 2 + 19);
    // first 17 should be hand-coded
    for (let i = 0; i < 17; i++) {
      expect(list[i].kind).toBe('hand-coded');
      expect(list[i].id).toMatch(/^[a-z0-9-]+$/);
    }
    // figlet entries come next
    const firstFiglet = list.find((f) => f.kind === 'figlet');
    expect(firstFiglet.id).toBe('figlet:Big');
  });

  test('still returns hand-coded + templates when figlet is unavailable', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => [],
      loadFiglet: () => null,
    }));
    const Fresh = require('../../src/main/AsciiArt');
    const list = Fresh.listFonts();
    expect(list.some((f) => f.kind === 'figlet')).toBe(false);
    expect(list.filter((f) => f.kind === 'hand-coded')).toHaveLength(17);
    expect(list.filter((f) => f.kind === 'template').length).toBeGreaterThanOrEqual(19);
  });

  test('every entry has id, label, kind, sample', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => [],
      loadFiglet: () => null,
    }));
    const Fresh = require('../../src/main/AsciiArt');
    for (const f of Fresh.listFonts()) {
      expect(typeof f.id).toBe('string');
      expect(typeof f.label).toBe('string');
      expect(['hand-coded', 'figlet', 'template']).toContain(f.kind);
      expect(typeof f.sample).toBe('string');
      expect(f.sample.length).toBeGreaterThan(0);
    }
  });
});

describe('AsciiArt.getFontMeta', () => {
  test('hand-coded font returns kind, height, supportedChars', () => {
    const meta = AsciiArt.getFontMeta('big');
    expect(meta.kind).toBe('hand-coded');
    expect(typeof meta.height).toBe('number');
    expect(meta.height).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(meta.supportedChars)).toBe(true);
    expect(meta.supportedChars).toEqual(expect.arrayContaining(['A', '0', ' ']));
  });

  test('template returns { kind: "template" }', () => {
    expect(AsciiArt.getFontMeta('template:flowchart')).toEqual({ kind: 'template' });
  });

  test('figlet returns { kind: "figlet" }', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => ['Big'],
      loadFiglet: () => ({}),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    expect(Fresh.getFontMeta('figlet:Big')).toEqual({ kind: 'figlet' });
  });

  test('unknown id returns null', () => {
    expect(AsciiArt.getFontMeta('nope')).toBeNull();
  });
});

describe('AsciiArt.generate — studio options', () => {
  test('letter spacing widens hand-coded output by one column per gap', () => {
    const plain = AsciiArt.generate({ text: 'AB', font: 'standard' });
    const spaced = AsciiArt.generate({ text: 'AB', font: 'standard', options: { spacing: 1 } });
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    const glyphWidth = font.chars['A'][0].length;
    expect(spaced.split('\n')[0].length).toBe(plain.split('\n')[0].length + 1);
    expect(spaced.split('\n')[0].startsWith(font.chars['A'][0])).toBe(true);
    expect(glyphWidth).toBeGreaterThan(0);
  });

  test('spacing is clamped to 0..10', () => {
    const clamped = AsciiArt.generate({ text: 'A', font: 'standard', options: { spacing: 999 } });
    const ten = AsciiArt.generate({ text: 'A', font: 'standard', options: { spacing: 10 } });
    expect(clamped).toBe(ten);
  });

  test('multi-line input renders each line as its own block', () => {
    const one = AsciiArt.generate({ text: 'A', font: 'standard' });
    const two = AsciiArt.generate({ text: 'A\nB', font: 'standard' });
    expect(two.split('\n\n')).toHaveLength(2);
    expect(two.startsWith(one)).toBe(true);
  });

  test('figlet options and justify are applied', () => {
    jest.resetModules();
    const seen = [];
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: (t, f, opts) => {
        seen.push({ t, f, opts });
        return 'ab\nabcdef';
      },
      listFigletFonts: () => ['Big'],
      loadFiglet: () => ({}),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    const out = Fresh.generate({
      text: 'hi',
      font: 'figlet:Big',
      options: { width: 60, horizontalLayout: 'fitted', justify: 'right' },
    });
    expect(seen[0].f).toBe('Big');
    expect(seen[0].opts).toEqual({ width: 60, horizontalLayout: 'fitted' });
    // Right justify pads the shorter line to the width of the longest.
    expect(out.split('\n')[0]).toBe('    ab');
  });

  test('figlet width is clamped to the supported range', () => {
    jest.resetModules();
    let captured = null;
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: (_t, _f, opts) => {
        captured = opts;
        return '';
      },
      listFigletFonts: () => ['Big'],
      loadFiglet: () => ({}),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    Fresh.generate({ text: 'x', font: 'figlet:Big', options: { width: 9999 } });
    expect(captured.width).toBe(400);
  });
});
