const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const DocxFontEmbedder = require('../src/main/DocxFontEmbedder');

describe('DocxFontEmbedder.embed', () => {
  const dir = path.join(__dirname, 'fixtures-docx');
  const docxPath = path.join(dir, 'in.docx');
  const fontPath = path.join(dir, 'fake.ttf');

  beforeAll(async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fontPath, 'fake-ttf-data');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/main"><w:body/></w:document>');
    zip.file('word/styles.xml', '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/main"><w:style w:type="character" w:styleId="SourceCode"><w:name w:val="Source Code"/></w:style></w:styles>');
    fs.writeFileSync(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('embeds TTF and patches fontTable.xml + styles.xml', async () => {
    const out = await DocxFontEmbedder.embed(docxPath, [
      { path: fontPath, family: 'JetBrains Mono', weight: 400 },
    ]);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/fonts/'))).toBe(true);
    const fontTable = zip.file('word/fontTable.xml') ? await zip.file('word/fontTable.xml').async('string') : '';
    expect(fontTable).toContain('JetBrains Mono');
    expect(fontTable).toMatch(/<w:embedRegular/);
    const styles = await zip.file('word/styles.xml').async('string');
    expect(styles).toMatch(/<w:rFonts[^>]*w:ascii="JetBrains Mono"/);
  });

  test('is idempotent: running twice does not double-embed', async () => {
    const once = await DocxFontEmbedder.embed(docxPath, [{ path: fontPath, family: 'JetBrains Mono', weight: 400 }]);
    const twice = await DocxFontEmbedder.embed(once, [{ path: fontPath, family: 'JetBrains Mono', weight: 400 }]);
    const zip = await JSZip.loadAsync(fs.readFileSync(twice));
    const fontEntries = Object.keys(zip.files).filter((f) => /^word\/fonts\/[^/]+\.ttf$/.test(f));
    expect(fontEntries.length).toBe(1);
  });
});