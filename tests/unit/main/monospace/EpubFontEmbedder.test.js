const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

const { withEpubEmbedFontArgs, embedEpubFont } = require('../../../../src/main/EpubFontEmbedder');

async function makeMinimalEpub(outPath) {
  const zip = new JSZip();
  zip.file(
    'META-INF/container.xml',
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  zip.file('OEBPS/content.opf', '<package xmlns="http://www.idpf.org/2007/opf"></package>');
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('EpubFontEmbedder', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-epub-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('withEpubEmbedFontArgs prepends --epub-embed-font', () => {
    const args = withEpubEmbedFontArgs(['-o', 'out.epub', 'in.md'], '/tmp/font.ttf', 'JetBrains Mono');
    expect(args).toContain('--epub-embed-font=/tmp/font.ttf');
    expect(args.indexOf('--epub-embed-font=/tmp/font.ttf')).toBeLessThan(args.indexOf('-o'));
  });

  test('embedEpubFont adds font to OEBPS and updates manifest', async () => {
    const epub = path.join(tmpDir, 'book.epub');
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    await makeMinimalEpub(epub);
    fs.writeFileSync(ttf, Buffer.from([0x01, 0x00]));

    await embedEpubFont(epub, ttf, 'JetBrains Mono');

    const zip = await JSZip.loadAsync(fs.readFileSync(epub));
    const fontFile = zip.file('OEBPS/JetBrainsMono-Regular.ttf');
    expect(fontFile).toBeTruthy();
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).toContain('JetBrainsMono-Regular.ttf');
  });

  test('embedEpubFont rejects missing TTF', async () => {
    const epub = path.join(tmpDir, 'book.epub');
    await makeMinimalEpub(epub);
    await expect(embedEpubFont(epub, '/nope.ttf', 'JetBrains Mono')).rejects.toThrow(/TTF/);
  });
});
