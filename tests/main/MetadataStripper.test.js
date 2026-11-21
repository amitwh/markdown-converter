/**
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const sharp = require('sharp');
const JSZip = require('jszip');
const { PDFDocument, StandardFonts, rgb } = require('@cantoo/pdf-lib');
const Stripper = require('../../src/main/MetadataStripper');

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strip-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function file(name, buffer) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, buffer);
  return p;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function injectPngChunk(png, chunk) {
  const ihdrEnd = 8 + 8 + png.readUInt32BE(8) + 4;
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

async function makePng() {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  return injectPngChunk(
    injectPngChunk(png, pngChunk('tEXt', Buffer.from('generator\0AI image'))),
    pngChunk('caBX', Buffer.from('fake-c2pa-manifest'))
  );
}

async function makeJpeg() {
  const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
    .jpeg()
    .toBuffer();
  const app1 = Buffer.from([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

function wavChunk(id, data) {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, Buffer.alloc(data.length % 2)]);
}

test('PNG: removes tEXt and caBX while keeping IDAT pixels identical', async () => {
  const original = await makePng();
  const p = file('image.png', original);
  const result = await Stripper.stripFile(p);
  expect(result.changed).toBe(true);
  expect(result.verified).toBe(true);
  expect(result.removed).toEqual(expect.arrayContaining(['tEXt', 'caBX']));
  const out = fs.readFileSync(p);
  expect(out.includes(Buffer.from('caBX'))).toBe(false);
  expect(out.includes(Buffer.from('generator'))).toBe(false);
  // IHDR + IDAT survive byte-for-byte.
  const chunks = (buf) => {
    const list = {};
    let o = 8;
    while (o + 12 <= buf.length) {
      const len = buf.readUInt32BE(o);
      const type = buf.toString('ascii', o + 4, o + 8);
      list[type] = buf.subarray(o + 8, o + 8 + len);
      o += 12 + len;
    }
    return list;
  };
  const before = chunks(original);
  const after = chunks(out);
  expect(after.IHDR).toEqual(before.IHDR);
  expect(after.IDAT).toEqual(before.IDAT);
});

test('JPEG: removes APP1/COM and keeps scan data identical', async () => {
  const p = file('image.jpg', await makeJpeg());
  const result = await Stripper.stripFile(p);
  expect(result.changed).toBe(true);
  expect(result.verified).toBe(true);
  const out = fs.readFileSync(p);
  expect(out.includes(Buffer.from('Exif'))).toBe(false);
  expect(out[0]).toBe(0xff);
  expect(out[1]).toBe(0xd8);
});

test('SVG: removes <metadata> and AI comments, keeps the shape', () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><metadata>AI generated</metadata><!-- created by OpenAI --><rect width="10" height="10"/></svg>'
  );
  const result = Stripper.stripFile(file('image.svg', svg));
  return result.then(() => {
    const out = fs.readFileSync(path.join(dir, 'image.svg'), 'utf8');
    expect(out).not.toContain('metadata');
    expect(out).not.toContain('OpenAI');
    expect(out).toContain('<rect');
  });
});

test('Markdown: strips AI frontmatter keys and provenance comments only', async () => {
  const md = [
    '---',
    'title: My note',
    'ai-generated: true',
    'generator: SomeAI',
    'model: gpt-x',
    'author: Amit',
    '---',
    '',
    '<!-- AI-generated summary -->',
    '# Body',
    '',
    'Keep this sentence.',
    '',
  ].join('\n');
  const p = file('note.md', md);
  const result = await Stripper.stripFile(p);
  expect(result.changed).toBe(true);
  expect(result.removed).toEqual(
    expect.arrayContaining(['frontmatter:ai-generated', 'frontmatter:generator', 'frontmatter:model'])
  );
  const out = fs.readFileSync(p, 'utf8');
  expect(out).toContain('title: My note');
  expect(out).toContain('author: Amit');
  expect(out).not.toContain('ai-generated');
  expect(out).not.toContain('AI-generated summary');
  expect(out).toContain('Keep this sentence.');
});

test('HTML: removes generator/AI meta tags but keeps the document', async () => {
  const p = file(
    'page.html',
    '<!doctype html><html><head><meta name="generator" content="AI"><meta charset="utf-8"></head><body>Hi</body></html>'
  );
  await Stripper.stripFile(p);
  const out = fs.readFileSync(p, 'utf8');
  expect(out).not.toContain('name="generator"');
  expect(out).toContain('<meta charset="utf-8">');
  expect(out).toContain('Hi');
});

test('PDF: removes Producer/Creator and XMP while verifying page streams', async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Content that must not change', { x: 20, y: 700, size: 12, font, color: rgb(0, 0, 0) });
  pdf.setProducer('AI Generator');
  pdf.setCreator('SomeAI');
  const bytes = Buffer.from(await pdf.save({ useObjectStreams: false }));
  const p = file('doc.pdf', bytes);
  const result = await Stripper.stripFile(p);
  expect(result.changed).toBe(true);
  expect(result.verified).toBe(true);
  const after = await PDFDocument.load(fs.readFileSync(p));
  expect(after.getProducer() || '').not.toContain('AI Generator');
});

test('DOCX: removes docProps but keeps document.xml byte-identical', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', '<w:document>Hello</w:document>');
  zip.file('docProps/core.xml', '<cp:coreProperties><dc:creator>AI</dc:creator></cp:coreProperties>');
  const p = file('doc.docx', await zip.generateAsync({ type: 'nodebuffer' }));
  const result = await Stripper.stripFile(p);
  expect(result.changed).toBe(true);
  expect(result.verified).toBe(true);
  const check = await JSZip.loadAsync(fs.readFileSync(p));
  expect(check.file('docProps/core.xml')).toBeNull();
  expect(await check.file('word/document.xml').async('string')).toBe(
    '<w:document>Hello</w:document>'
  );
});

test('EPUB: removes generator metadata but keeps title', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container/>');
  zip.file(
    'OEBPS/content.opf',
    '<package><metadata><meta name="generator" content="AI"/><dc:title>Book</dc:title></metadata></package>'
  );
  const p = file('book.epub', await zip.generateAsync({ type: 'nodebuffer' }));
  await Stripper.stripFile(p);
  const check = await JSZip.loadAsync(fs.readFileSync(p));
  const opf = await check.file('OEBPS/content.opf').async('string');
  expect(opf).not.toContain('generator');
  expect(opf).toContain('Book');
});

test('MP3: strips ID3v2/ID3v1 and preserves the audio bytes', async () => {
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4, 5, 6]);
  const id3 = Buffer.alloc(10);
  id3.write('ID3', 0);
  id3[3] = 3;
  const tag = Buffer.alloc(128);
  tag.write('TAG', 0);
  const p = file('audio.mp3', Buffer.concat([id3, audio, tag]));
  const result = await Stripper.stripFile(p);
  expect(result.changed).toBe(true);
  expect(result.verified).toBe(true);
  expect(fs.readFileSync(p)).toEqual(audio);
});

test('WAV: removes LIST INFO and preserves fmt/data bytes', async () => {
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(1, 2);
  fmt.writeUInt32LE(8000, 4);
  fmt.writeUInt32LE(8000, 8);
  fmt.writeUInt16LE(1, 12);
  fmt.writeUInt16LE(8, 14);
  const data = Buffer.from([0, 1, 2, 3]);
  const list = Buffer.from('INFOISFT\x05\x00\x00\x00AI\0\0');
  const body = Buffer.concat([wavChunk('fmt ', fmt), wavChunk('data', data), wavChunk('LIST', list)]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WAVE', 8);
  const p = file('audio.wav', Buffer.concat([header, body]));
  await Stripper.stripFile(p);
  const out = fs.readFileSync(p);
  expect(out.includes(Buffer.from('LIST'))).toBe(false);
  expect(out.includes(Buffer.from('AI'))).toBe(false);
  expect(out.includes(data)).toBe(true);
});

test('stripFiles reports per-file errors without aborting the batch', async () => {
  const good = file('good.md', '---\nai_generated: yes\n---\nBody');
  const results = await Stripper.stripFiles([good, path.join(dir, 'missing.md')]);
  expect(results).toHaveLength(2);
  expect(results[0].changed).toBe(true);
  expect(results[1].error).toMatch(/not found/i);
});
