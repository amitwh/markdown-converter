const PdfFontHeader = require('../src/main/PdfFontHeader');

describe('PdfFontHeader.build', () => {
  test('emits fontspec with Path, family prefix, weight globs, and Ligatures=NoCommon when off', () => {
    const tex = PdfFontHeader.build({
      fontTtfPath: '/abs/path/JetBrainsMono-Regular.ttf',
      boldTtfPath: '/abs/path/JetBrainsMono-Bold.ttf',
      ligatures: false,
    });
    expect(tex).toContain('\\usepackage{fontspec}');
    // \setmonofont uses the family prefix (weight suffix stripped)
    expect(tex).toMatch(/\\setmonofont\[[^\]]*\]\{JetBrainsMono\}/);
    // Path is the directory (no trailing filename)
    expect(tex).toContain('Path=/abs/path/');
    // No programming ligatures
    expect(tex).toContain('Ligatures=NoCommon');
    // Upright/Bold use the family-prefixed glob
    expect(tex).toContain('UprightFont=*-Regular');
    expect(tex).toContain('BoldFont=*-Bold');
  });

  test('emits Ligatures=TeX when on (preserves --/--- but no programming ligatures)', () => {
    const tex = PdfFontHeader.build({
      fontTtfPath: '/abs/JBM-Regular.ttf',
      boldTtfPath: '/abs/JBM-Bold.ttf',
      ligatures: true,
    });
    expect(tex).toContain('Ligatures=TeX');
    expect(tex).not.toContain('Ligatures=NoCommon');
  });

  test('returns a no-op stub when font path is missing', () => {
    const tex = PdfFontHeader.build({ fontTtfPath: null, boldTtfPath: null, ligatures: false });
    expect(tex).toContain('% Monospace font path unavailable');
  });

  test('normalizes Windows backslashes to forward slashes', () => {
    const tex = PdfFontHeader.build({
      fontTtfPath: 'C:\\Users\\foo\\JetBrainsMono-Regular.ttf',
      boldTtfPath: 'C:\\Users\\foo\\JetBrainsMono-Bold.ttf',
      ligatures: false,
    });
    expect(tex).toContain('Path=C:/Users/foo/');
    expect(tex).toMatch(/\{JetBrainsMono\}/);
  });

  test('strips the FiraCode weight suffix to derive the family prefix', () => {
    const tex = PdfFontHeader.build({
      fontTtfPath: '/abs/FiraCode-Regular.ttf',
      boldTtfPath: '/abs/FiraCode-Bold.ttf',
      ligatures: false,
    });
    expect(tex).toMatch(/\{FiraCode\}/);
  });
});
