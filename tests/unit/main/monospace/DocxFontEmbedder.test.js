const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

const { embedDocxFont } = require('../../../../src/main/DocxFontEmbedder');

async function makeMinimalDocx(outPath) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  );
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outPath, buf);
}

describe('DocxFontEmbedder', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-docx-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('embeds TTF into word/fonts and updates rels', async () => {
    const input = path.join(tmpDir, 'in.docx');
    const output = path.join(tmpDir, 'out.docx');
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    await makeMinimalDocx(input);
    fs.writeFileSync(ttf, Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00]));

    await embedDocxFont(input, output, ttf, 'JetBrainsMono');

    const result = await JSZip.loadAsync(fs.readFileSync(output));
    const fontFiles = Object.keys(result.files).filter((n) => n.startsWith('word/fonts/'));
    expect(fontFiles.length).toBeGreaterThan(0);
    const rels = result.file('word/_rels/fontTable.xml.rels');
    expect(rels).toBeTruthy();
    const relsContent = await rels.async('string');
    expect(relsContent).toContain('.ttf');
  });

  test('returns rejected promise for invalid docx input', async () => {
    const input = path.join(tmpDir, 'invalid.docx');
    const output = path.join(tmpDir, 'out.docx');
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(input, Buffer.from('not a docx'));
    fs.writeFileSync(ttf, Buffer.from([0x01]));
    await expect(embedDocxFont(input, output, ttf, 'JetBrainsMono')).rejects.toThrow();
  });

  test('throws if ttf missing', async () => {
    const input = path.join(tmpDir, 'in.docx');
    const output = path.join(tmpDir, 'out.docx');
    await makeMinimalDocx(input);
    await expect(embedDocxFont(input, output, '/nope.ttf', 'JetBrainsMono')).rejects.toThrow(/TTF/);
  });
});
