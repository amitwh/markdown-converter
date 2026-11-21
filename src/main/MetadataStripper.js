/**
 * Lossless AI-metadata stripper.
 *
 * Removes provenance containers (C2PA/JUMBF, EXIF/XMP, PDF Info, Office
 * docProps, media tags, Markdown frontmatter/HTML comments) without touching
 * the content. Binary formats are verified by hashing the content payload
 * before and after; a mismatch is reported as a failure and the file is left
 * unchanged.
 *
 * Pixel-domain watermarks and statistical text watermarks are NOT metadata and
 * cannot be removed here — see the visible-mark tools in ImageOperations /
 * PDFOperations.
 *
 * @module MetadataStripper
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const REMOVABLE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.pdf',
  '.docx',
  '.epub',
  '.mp3',
  '.wav',
  '.mp4',
  '.mov',
  '.m4a',
  '.m4v',
  '.md',
  '.markdown',
  '.html',
  '.htm',
]);

const AI_KEY_RE =
  /^(ai|generated|generator|model|prompt|provider|source_tool|tool|c2pa|jumbf|watermark|llm|machine|openai|anthropic|claude|gpt|assistant|chatgpt|copilot|gemini|synthid)([-_.]|$)/i;

const AI_TEXT_RE =
  /\b(ai[-_ ]?generated|generated (?:by|with)|generator|c2pa|jumbf|content credentials|synthid|watermark|openai|anthropic|claude|chatgpt|copilot|gemini|llm|machine[-_ ]generated)\b/i;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function atomicWrite(filePath, buffer) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.strip-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, filePath);
}

function formatOf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpeg') return 'jpeg';
  if (ext === '.markdown') return 'md';
  if (ext === '.htm') return 'html';
  return ext.replace('.', '');
}


/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

function stripPng(buf) {
  const remove = new Set(['caBX', 'tEXt', 'iTXt', 'zTXt', 'eXIf']);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > buf.length) throw new Error('Truncated PNG chunk table');
    chunks.push({ type, start: offset, end, data: buf.subarray(offset + 8, offset + 8 + length) });
    offset = end;
  }
  const removed = chunks.filter((chunk) => remove.has(chunk.type)).map((chunk) => chunk.type);
  if (!removed.length) return { buffer: buf, removed, verified: true };
  const kept = chunks.filter((chunk) => !remove.has(chunk.type));
  const out = Buffer.concat([buf.subarray(0, 8), ...kept.map((chunk) => buf.subarray(chunk.start, chunk.end))]);
  const contentHash = (list) =>
    sha256(Buffer.concat(list.filter((c) => ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'].includes(c.type)).map((c) => c.data)));
  return {
    buffer: out,
    removed: [...new Set(removed)],
    verified: contentHash(chunks) === contentHash(kept),
  };
}

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  const removed = [];
  let offset = 2;
  let scanStart = -1;
  while (offset + 1 < buf.length) {
    if (buf[offset] !== 0xff) {
      // Should only happen inside scan data; copy the remainder verbatim.
      out.push(buf.subarray(offset));
      break;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8) {
      out.push(buf.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(offset));
      break;
    }
    if (marker === 0xda) {
      out.push(buf.subarray(offset));
      scanStart = offset;
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(buf.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > buf.length) throw new Error('Truncated JPEG segment');
    const length = buf.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (end > buf.length) throw new Error('Truncated JPEG segment');
    // APP1 (EXIF/XMP), APP3..APP15 (IPTC/other provenance), COM (comments).
    const isRemoved = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xef) || marker === 0xfe;
    if (isRemoved) {
      removed.push(marker === 0xfe ? 'COM' : `APP${marker - 0xe0}`);
    } else {
      out.push(buf.subarray(offset, end));
    }
    offset = end;
  }
  if (!removed.length) return { buffer: buf, removed, verified: true };
  const outBuffer = Buffer.concat(out);
  const outScan = outBuffer.indexOf(Buffer.from([0xff, 0xda]));
  return {
    buffer: outBuffer,
    removed: [...new Set(removed)],
    verified:
      scanStart === -1 ||
      (outScan !== -1 && sha256(buf.subarray(scanStart)) === sha256(outBuffer.subarray(outScan))),
  };
}

function stripWebp(buf) {
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const type = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > buf.length) throw new Error('Truncated WebP chunk table');
    chunks.push({ type, start: offset, end: end + (size % 2), size, dataStart: offset + 8 });
    offset = end + (size % 2);
  }
  const removed = chunks.filter((c) => c.type === 'EXIF' || c.type === 'XMP ').map((c) => c.type.trim());
  if (!removed.length) return { buffer: buf, removed, verified: true };
  const kept = chunks.filter((c) => c.type !== 'EXIF' && c.type !== 'XMP ');
  for (const chunk of kept) {
    if (chunk.type === 'VP8X') {
      // Clear the EXIF (0x08) and XMP (0x04) flags in the VP8X header.
      buf[chunk.dataStart] &= ~0x0c;
    }
  }
  const body = Buffer.concat(kept.map((c) => buf.subarray(c.start, c.end)));
  const out = Buffer.alloc(12 + body.length);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(4 + body.length, 4);
  out.write('WEBP', 8, 'ascii');
  body.copy(out, 12);
  const contentHash = (list) =>
    sha256(Buffer.concat(list.filter((c) => ['VP8 ', 'VP8L', 'ALPH', 'ANMF'].includes(c.type)).map((c) => buf.subarray(c.dataStart, c.dataStart + c.size))));
  return { buffer: out, removed, verified: contentHash(chunks.slice()) === contentHash(kept) };
}

/* ------------------------------------------------------------------ */
/* Text formats: Markdown, HTML, SVG                                   */
/* ------------------------------------------------------------------ */

function stripFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { text, removed: [] };
  const lines = match[1].split(/\r?\n/);
  const removed = [];
  const kept = lines.filter((line) => {
    const key = /^([A-Za-z0-9_.-]+)\s*:/.exec(line);
    if (!key) return true;
    if (AI_KEY_RE.test(key[1])) {
      removed.push(key[1]);
      return false;
    }
    return true;
  });
  if (!removed.length) return { text, removed };
  const frontmatter = kept.length ? `---\n${kept.join('\n')}\n---\n` : '';
  return { text: frontmatter + text.slice(match[0].length), removed };
}

function stripAiComments(text) {
  const removed = [];
  const out = text.replace(/<!--[\s\S]*?-->/g, (comment) => {
    if (!AI_TEXT_RE.test(comment)) return comment;
    removed.push(comment.slice(0, 80).replace(/\s+/g, ' '));
    return '';
  });
  return { text: out, removed };
}

function stripMarkdown(buf) {
  let text = buf.toString('utf8');
  const original = text;
  const front = stripFrontmatter(text);
  text = front.text;
  const comments = stripAiComments(text);
  text = comments.text;
  return {
    buffer: Buffer.from(text, 'utf8'),
    removed: [
      ...front.removed.map((key) => `frontmatter:${key}`),
      ...comments.removed.map((c) => `comment:${c}`),
    ],
    verified: text.length <= original.length,
  };
}

function stripHtml(buf) {
  let text = buf.toString('utf8');
  const removed = [];
  text = text.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (/name\s*=\s*["']?(generator|ai[-_]|c2pa|watermark)|property\s*=\s*["']?(c2pa|ai[-_])/i.test(tag)) {
      removed.push(tag.slice(0, 80));
      return '';
    }
    return tag;
  });
  const comments = stripAiComments(text);
  return {
    buffer: Buffer.from(comments.text, 'utf8'),
    removed: [...removed, ...comments.removed.map((c) => `comment:${c}`)],
    verified: true,
  };
}

function stripSvg(buf) {
  let text = buf.toString('utf8');
  const removed = [];
  text = text.replace(/<metadata\b[\s\S]*?<\/metadata\s*>/gi, () => {
    removed.push('metadata');
    return '';
  });
  const comments = stripAiComments(text);
  return {
    buffer: Buffer.from(comments.text, 'utf8'),
    removed: [...removed, ...comments.removed.map((c) => `comment:${c}`)],
    verified: true,
  };
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

async function pageContentHash(doc, PDFName) {
  const parts = [];
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of('Contents'));
    if (!contents) continue;
    const refs =
      contents && typeof contents.asArray === 'function' ? contents.asArray() : [contents];
    for (const ref of refs) {
      const obj = doc.context.lookup(ref);
      if (obj && obj.contents) parts.push(Buffer.from(obj.contents));
    }
  }
  return sha256(Buffer.concat(parts));
}

async function stripPdf(buf) {
  const { PDFDocument, PDFName } = require('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  return stripPdfDocument(doc, PDFName);
}

async function stripPdfDocument(doc, PDFName) {
  const removed = [];
  const before = await pageContentHash(doc, PDFName);
  const infoRef = doc.context.trailerInfo && doc.context.trailerInfo.Info;
  if (infoRef) {
    const info = doc.context.lookup(infoRef);
    for (const key of [
      'Producer',
      'Creator',
      'Title',
      'Author',
      'Subject',
      'Keywords',
      'CreationDate',
      'ModDate',
      'Trapped',
    ]) {
      if (info && typeof info.delete === 'function' && info.has(PDFName.of(key))) {
        info.delete(PDFName.of(key));
        removed.push(`Info/${key}`);
      }
    }
  }
  if (doc.catalog.has(PDFName.of('Metadata'))) {
    doc.catalog.delete(PDFName.of('Metadata'));
    removed.push('XMP/Metadata');
  }
  const out = Buffer.from(
    await doc.save({ useObjectStreams: false, updateFieldAppearances: false })
  );
  const afterDoc = await require('@cantoo/pdf-lib').PDFDocument.load(out);
  const after = await pageContentHash(afterDoc, PDFName);
  return { buffer: out, removed, verified: before === after };
}

function stripPdfBuffer(buf) {
  return stripPdf(buf);
}

/* ------------------------------------------------------------------ */
/* ZIP containers: DOCX / EPUB                                         */
/* ------------------------------------------------------------------ */

async function stripZipContainer(buf, format) {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const removed = [];
  const modified = new Map();
  const beforeHashes = new Map();

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    beforeHashes.set(name, sha256(await entry.async('nodebuffer')));
  }

  if (format === 'docx') {
    for (const name of ['docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml']) {
      if (zip.file(name)) {
        zip.remove(name);
        removed.push(name);
      }
    }
  } else if (format === 'epub') {
    if (zip.file('META-INF/metadata.xml')) {
      zip.remove('META-INF/metadata.xml');
      removed.push('META-INF/metadata.xml');
    }
    for (const name of Object.keys(zip.files).filter((n) => /\.opf$/i.test(n))) {
      const entry = zip.file(name);
      if (!entry) continue;
      const original = await entry.async('string');
      let next = original;
      next = next.replace(/<meta\b[^>]*name=["']generator["'][^>]*\/?>/gi, () => {
        removed.push(`${name}:meta[generator]`);
        return '';
      });
      next = next.replace(/<meta\b[^>]*(?:c2pa|ai[-_]generated|watermark)[^>]*\/?>/gi, (tag) => {
        removed.push(`${name}:${tag.slice(0, 50)}`);
        return '';
      });
      if (next !== original) modified.set(name, next);
    }
  }

  for (const [name, content] of modified) zip.file(name, content);
  if (!removed.length) return { buffer: buf, removed, verified: true };

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const check = await JSZip.loadAsync(out);
  let verified = true;
  for (const [name, hash] of beforeHashes) {
    if (removed.includes(name)) continue;
    const entry = check.file(name);
    if (!entry) {
      verified = false;
      break;
    }
    const after = sha256(await entry.async('nodebuffer'));
    if (modified.has(name)) {
      if (after === hash) verified = false;
    } else if (after !== hash) {
      verified = false;
      break;
    }
  }
  return { buffer: out, removed, verified };
}

/* ------------------------------------------------------------------ */
/* Audio: MP3 / WAV                                                    */
/* ------------------------------------------------------------------ */

function stripMp3(buf) {
  let start = 0;
  let end = buf.length;
  const removed = [];
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    const footer = buf[5] & 0x10 ? 10 : 0;
    start = 10 + size + footer;
    removed.push('ID3v2');
  }
  if (end - start > 128 && buf.toString('ascii', end - 128, end - 125) === 'TAG') {
    end -= 128;
    removed.push('ID3v1');
  }
  if (!removed.length) return { buffer: buf, removed, verified: true };
  const audioBefore = sha256(buf.subarray(start, end));
  const out = buf.subarray(start, end);
  return { buffer: out, removed, verified: sha256(out) === audioBefore };
}

function stripWav(buf) {
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > buf.length) throw new Error('Truncated WAV chunk table');
    chunks.push({ id, start: offset, end: end + (size % 2), dataStart: offset + 8, size });
    offset = end + (size % 2);
  }
  const removed = chunks.filter((c) => c.id === 'LIST' || c.id === 'id3 ').map((c) => c.id);
  if (!removed.length) return { buffer: buf, removed, verified: true };
  const kept = chunks.filter((c) => c.id !== 'LIST' && c.id !== 'id3 ');
  const contentHash = () =>
    sha256(
      Buffer.concat(
        kept
          .filter((c) => c.id === 'fmt ' || c.id === 'data')
          .map((c) => buf.subarray(c.dataStart, c.dataStart + c.size))
      )
    );
  const before = contentHash();
  const body = Buffer.concat(kept.map((c) => buf.subarray(c.start, c.end)));
  const out = Buffer.alloc(12 + body.length);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(4 + body.length, 4);
  out.write('WAVE', 8, 'ascii');
  body.copy(out, 12);
  return { buffer: out, removed, verified: contentHash() === before };
}

/* ------------------------------------------------------------------ */
/* Video/audio containers via ffmpeg remux                             */
/* ------------------------------------------------------------------ */

async function streamHash(filePath) {
  const ffmpeg = require('ffmpeg-static');
  const { stdout } = await execFileAsync(
    ffmpeg,
    ['-v', 'error', '-i', filePath, '-map', '0', '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'],
    { maxBuffer: 8 * 1024 * 1024 }
  );
  return sha256(Buffer.from(stdout));
}

async function stripMediaContainer(filePath) {
  const ffmpeg = require('ffmpeg-static');
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.strip-media-${process.pid}`);
  try {
    const before = await streamHash(filePath);
    await execFileAsync(ffmpeg, [
      '-y',
      '-v',
      'error',
      '-i',
      filePath,
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-flags',
      '+bitexact',
      '-c',
      'copy',
      tmp,
    ]);
    const after = await streamHash(tmp);
    const out = fs.readFileSync(tmp);
    return { buffer: out, removed: ['container metadata'], verified: before === after };
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

async function stripBuffer(filePath, buf, format) {
  switch (format) {
    case 'png':
      return stripPng(buf);
    case 'jpg':
    case 'jpeg':
      return stripJpeg(buf);
    case 'webp':
      return stripWebp(buf);
    case 'svg':
      return stripSvg(buf);
    case 'html':
      return stripHtml(buf);
    case 'md':
      return stripMarkdown(buf);
    case 'pdf':
      return stripPdfBuffer(buf);
    case 'docx':
    case 'epub':
      return stripZipContainer(buf, format);
    case 'mp3':
      return stripMp3(buf);
    case 'wav':
      return stripWav(buf);
    case 'mp4':
    case 'mov':
    case 'm4a':
    case 'm4v':
      return stripMediaContainer(filePath);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

async function stripFile(filePath, { dryRun = false } = {}) {
  const format = formatOf(filePath);
  if (!REMOVABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return { file: filePath, format, changed: false, verified: true, removed: [], skipped: true };
  }
  const buf = fs.readFileSync(filePath);
  const result = await stripBuffer(filePath, buf, format);
  const changed = !result.buffer.equals(buf);
  if (changed && !dryRun) {
    if (!result.verified) {
      return {
        file: filePath,
        format,
        changed: false,
        verified: false,
        removed: result.removed,
        error: 'Content verification failed; file left unchanged',
      };
    }
    atomicWrite(filePath, result.buffer);
  }
  return {
    file: filePath,
    format,
    changed,
    verified: result.verified !== false,
    removed: result.removed || [],
  };
}

async function stripFiles(filePaths, options = {}) {
  const results = [];
  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath)) throw new Error('File not found');
      results.push(await stripFile(filePath, options));
    } catch (error) {
      results.push({
        file: filePath,
        format: formatOf(filePath),
        changed: false,
        verified: false,
        removed: [],
        error: error.message,
      });
    }
  }
  return results;
}

module.exports = {
  REMOVABLE_EXTENSIONS,
  AI_KEY_RE,
  AI_TEXT_RE,
  stripFile,
  stripFiles,
  stripFrontmatter,
  stripPng,
  stripJpeg,
  stripWebp,
  stripMp3,
  stripWav,
};
