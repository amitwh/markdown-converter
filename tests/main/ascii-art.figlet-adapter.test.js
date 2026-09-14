/**
 * @jest-environment node
 *
 * Adapter tests — figlet is mocked so we don't ship 400 KB of fonts into
 * the test runner.
 */
jest.mock('figlet', () => {
  const actual = jest.requireActual('figlet');
  return {
    __esModule: true,
    default: actual,
    textSync: jest.fn(() => 'MOCKED_FIGLET_OUTPUT'),
    fontsSync: jest.fn(() => ['Standard', 'Big', 'Slant']),
  };
});

const FigletAdapter = require('../../src/main/AsciiArt.figlet-adapter');

describe('AsciiArt.figlet-adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FigletAdapter._resetCache(); // test-only reset
  });

  test('loadFiglet returns the figlet module on first call', () => {
    const mod = FigletAdapter.loadFiglet();
    expect(mod).not.toBeNull();
    expect(typeof mod.textSync).toBe('function');
  });

  test('listFigletFonts returns string[] from figlet.fontsSync()', () => {
    const fonts = FigletAdapter.listFigletFonts();
    expect(fonts).toEqual(['Standard', 'Big', 'Slant']);
  });

  test('listFigletFonts caches between calls', () => {
    FigletAdapter.listFigletFonts();
    FigletAdapter.listFigletFonts();
    const figlet = require('figlet');
    expect(figlet.fontsSync).toHaveBeenCalledTimes(1);
  });

  test('generateFiglet returns rendered string', () => {
    const out = FigletAdapter.generateFiglet('HELLO', 'Big');
    expect(out).toBe('MOCKED_FIGLET_OUTPUT');
    const figlet = require('figlet');
    expect(figlet.textSync).toHaveBeenCalledWith('HELLO', { font: 'Big' });
  });

  test('generateFiglet throws AsciiArtFigletError when figlet throws', () => {
    const figlet = require('figlet');
    figlet.textSync.mockImplementationOnce(() => {
      throw new Error('unknown font');
    });
    expect(() => FigletAdapter.generateFiglet('X', 'Nope')).toThrow(
      FigletAdapter.AsciiArtFigletError
    );
  });

  test('returns null when figlet module fails to load', () => {
    // simulate require failure by reloading after breaking the module cache
    jest.isolateModules(() => {
      jest.doMock('figlet', () => {
        throw new Error('not found');
      });
      const Fresh = require('../../src/main/AsciiArt.figlet-adapter');
      Fresh._resetCache();
      expect(Fresh.loadFiglet()).toBeNull();
      expect(Fresh.listFigletFonts()).toEqual([]);
      expect(() => Fresh.generateFiglet('X', 'Big')).toThrow(Fresh.AsciiArtFigletError);
    });
  });
});
