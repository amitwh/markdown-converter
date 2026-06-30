const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const EpubFontEmbedder = require('../src/main/EpubFontEmbedder');

describe('EpubFontEmbedder.patchManifest', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const epubPath = path.join(fixturesDir, 'fake.epub');
  const fontPath = path.join(fixturesDir, 'fake.ttf');

  beforeAll(async () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(fontPath, 'fake-ttf-binary');
    const zip = new JSZip();
    zip.file(
      'OEBPS/content.opf',
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"></package>'
    );
    fs.writeFileSync(epubPath, await zip.generateAsync({ type: 'nodebuffer' }));
  });

  afterAll(() => fs.rmSync(fixturesDir, { recursive: true, force: true }));

  test('adds a manifest entry referencing the TTF when missing', async () => {
    const patched = await EpubFontEmbedder.patchManifest(epubPath, [
      { path: fontPath, family: 'JetBrains Mono', weight: 400 },
    ]);
    const out = fs.readFileSync(patched);
    const zip = await JSZip.loadAsync(out);
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).toMatch(/<item[^>]*href="OEBPS\/fonts\/fake\.ttf"/);
    expect(opf).toMatch(/<item[^>]*media-type="application\/x-font-ttf"/);
  });
});
