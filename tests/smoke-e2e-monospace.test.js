/**
 * E2E smoke for monospace embedding. Runs against the vendored fonts when
 * available. If pandoc is missing, the PDF-specific test is skipped; the
 * DOCX/EPUB/HTML tests exercise the JS modules directly and run either way.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function ttfAvailable() {
  const ttf = path.resolve(__dirname, '..', 'assets', 'fonts', 'JetBrainsMono-Regular.ttf');
  return fs.existsSync(ttf);
}

function pandocAvailable() {
  try {
    execFileSync('pandoc', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('monospace E2E', () => {
  let tmp;

  beforeAll(() => {
    if (ttfAvailable()) {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-e2e-'));
    }
  });

  afterAll(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('DOCX export embeds the TTF', async () => {
    if (!ttfAvailable()) return;
    const { embedDocxFont } = require('../src/main/DocxFontEmbedder');
    const { getMonoFontTtfPath } = require('../src/main/MonospaceFontConfig');
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
    );
    fs.writeFileSync(path.join(tmp, 'in.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
    await embedDocxFont(
      path.join(tmp, 'in.docx'),
      path.join(tmp, 'out.docx'),
      getMonoFontTtfPath('jetbrains-mono', 400),
      'JetBrainsMono'
    );
    const out = await JSZip.loadAsync(fs.readFileSync(path.join(tmp, 'out.docx')));
    const fonts = Object.keys(out.files).filter((n) => n.startsWith('word/fonts/'));
    expect(fonts.length).toBeGreaterThan(0);
  });

  it('EPUB export args include --epub-embed-font', () => {
    const { withEpubEmbedFontArgs } = require('../src/main/EpubFontEmbedder');
    const args = withEpubEmbedFontArgs(
      ['-o', 'out.epub', 'in.md'],
      '/tmp/JetBrainsMono-Regular.ttf',
      'JetBrains Mono'
    );
    expect(args).toContain('--epub-embed-font=/tmp/JetBrainsMono-Regular.ttf');
  });

  it('HTML CSS contains base64 font face', () => {
    const { buildExportCss } = require('../src/main/ExportCss');
    const woff2 = Buffer.from('woff2-test');
    const css = buildExportCss(
      { monospaceFont: 'jetbrains-mono', monospaceLigatures: true },
      { woff2 }
    );
    const m = css.match(/base64,([A-Za-z0-9+/=]+)/);
    expect(Buffer.from(m[1], 'base64').toString()).toBe('woff2-test');
  });

  (ttfAvailable() && pandocAvailable() ? it : it.skip)(
    'PDF export references the monospace font (xelatex header)',
    () => {
      const { buildPdfFontHeader } = require('../src/main/PdfFontHeader');
      const { getMonoFontTtfPath } = require('../src/main/MonospaceFontConfig');
      const ttf = getMonoFontTtfPath('jetbrains-mono', 400);
      const out = buildPdfFontHeader(
        { monospaceFont: 'jetbrains-mono', monospaceLigatures: false },
        ttf,
        'JetBrains Mono'
      );
      const content = fs.readFileSync(out.headerPath, 'utf-8');
      expect(content).toContain('\\setmonofont');
      expect(content).toContain('JetBrainsMono-Regular.ttf');
      fs.rmSync(out.dir, { recursive: true, force: true });
    }
  );
});
