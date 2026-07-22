const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildPdfFontHeader } = require('../../../../src/main/PdfFontHeader');

describe('PdfFontHeader', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-pdfhdr-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writes a fontspec header for JetBrains Mono Regular', () => {
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(ttf, 'fake');
    const out = buildPdfFontHeader(
      { monospaceFont: 'jetbrains-mono', monospaceLigatures: false },
      ttf,
      'JetBrains Mono'
    );
    expect(typeof out.headerPath).toBe('string');
    expect(fs.existsSync(out.headerPath)).toBe(true);
    const content = fs.readFileSync(out.headerPath, 'utf-8');
    expect(content).toContain('\\setmonofont');
    expect(content).toContain('JetBrainsMono-Regular.ttf');
    expect(out.familyName).toBe('JetBrains Mono');
  });

  test('writes header with ligatures when enabled', () => {
    const ttf = path.join(tmpDir, 'FiraCode-Regular.ttf');
    fs.writeFileSync(ttf, 'fake');
    const out = buildPdfFontHeader(
      { monospaceFont: 'fira-code', monospaceLigatures: true },
      ttf,
      'Fira Code'
    );
    const content = fs.readFileSync(out.headerPath, 'utf-8');
    expect(content).toContain('Ligatures=TeX');
  });

  test('header is written under os.tmpdir', () => {
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(ttf, 'fake');
    const out = buildPdfFontHeader(
      { monospaceFont: 'jetbrains-mono', monospaceLigatures: false },
      ttf,
      'JetBrains Mono'
    );
    expect(out.headerPath.startsWith(os.tmpdir())).toBe(true);
  });

  test('throws if ttfPath does not exist', () => {
    expect(() =>
      buildPdfFontHeader(
        { monospaceFont: 'jetbrains-mono', monospaceLigatures: false },
        '/nonexistent.ttf',
        'JetBrains Mono'
      )
    ).toThrow(/TTF/);
  });
});
