/**
 * @jest-environment node
 *
 * PDFBatchOperations.js tests for Task 22's batch PDF operations: the folder
 * loop that applies one PDFOperations.executeOperation() op to every .pdf in an
 * input folder (optionally recursive) and mirrors the folder structure into the
 * output folder. Mirrors the real-PDF fixture conventions of
 * tests/main/PDFOperations.test.js (pdf-lib-built fixtures in a tmp dir).
 *
 * The watermark test doubles as the automated stand-in for the brief's manual
 * verification step ("batch-watermark a folder of 2-3 test PDFs, confirm each
 * output file has the watermark applied") — GUI batch runs are not possible in
 * this sandbox, so the assertion extracts the text back out of each output and
 * checks the watermark string is present.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb } = require('@cantoo/pdf-lib');
const PDFOperations = require('../../src/main/PDFOperations');
const {
  runPDFBatchOperation,
  PDF_BATCH_OUTPUT_SPEC,
} = require('../../src/main/PDFBatchOperations');

// Builds a small text PDF fixture with `pageCount` pages at the given path.
async function writePdfFixture(filePath, pageCount = 2, label = 'Batch Fixture') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([600, 800]);
    page.drawText(`${label} Page ${i}`, { x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0) });
  }
  fs.writeFileSync(filePath, await doc.save());
}

describe('PDFBatchOperations - runPDFBatchOperation', () => {
  let tmpDir, inputDir, outputDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfbatch_'));
    inputDir = path.join(tmpDir, 'in');
    outputDir = path.join(tmpDir, 'out');
    fs.mkdirSync(inputDir);
    fs.mkdirSync(path.join(inputDir, 'sub'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Runs a batch and returns { progress, completion } recorded from the
  // injected callbacks (same wiring main.js performs for the IPC handler).
  async function runBatch(args) {
    const progress = [];
    let completion = null;
    await runPDFBatchOperation({
      inputFolder: inputDir,
      outputFolder: outputDir,
      includeSubfolders: true,
      onProgress: (p) => progress.push(p),
      onComplete: (c) => {
        completion = c;
      },
      ...args,
    });
    return { progress, completion };
  }

  describe('watermark across a folder (brief manual-verification stand-in)', () => {
    beforeEach(async () => {
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 2, 'Alpha');
      await writePdfFixture(path.join(inputDir, 'b.pdf'), 3, 'Beta');
      await writePdfFixture(path.join(inputDir, 'sub', 'c.pdf'), 2, 'Gamma');
      fs.writeFileSync(path.join(inputDir, 'notes.txt'), 'not a pdf');
    });

    it('watermarks every PDF including subfolders, mirroring the folder structure', async () => {
      // 'DRAFT' extracts back out cleanly via pdfjs; wider centered strings
      // (e.g. 'CONFIDENTIAL') hit a pdfjs-dist text-extraction quirk that
      // truncates the returned item even though the full text is drawn.
      const { completion } = await runBatch({
        operation: 'watermark',
        data: {
          text: 'DRAFT',
          fontSize: 48,
          opacity: 0.5,
          position: 'center',
          color: '#000000',
          pages: 'all',
        },
      });

      expect(completion).toEqual({
        success: true,
        completed: 3,
        failed: 0,
        total: 3,
        outputFolder: outputDir,
      });

      const outputs = [
        path.join(outputDir, 'a.pdf'),
        path.join(outputDir, 'b.pdf'),
        path.join(outputDir, 'sub', 'c.pdf'),
      ];
      for (const outPath of outputs) {
        expect(fs.existsSync(outPath)).toBe(true);
        const saved = await PDFDocument.load(fs.readFileSync(outPath));
        expect(saved.getPageCount()).toBeGreaterThan(0);
        const extracted = await PDFOperations.pdfExtractText({ inputPath: outPath });
        expect(extracted.success).toBe(true);
        expect(extracted.text).toContain('DRAFT');
      }
    });

    it('ignores non-PDF files', async () => {
      const { completion } = await runBatch({
        operation: 'compress',
        data: {},
      });
      expect(completion.total).toBe(3); // notes.txt excluded
    });

    it('skips subfolder files when includeSubfolders is false', async () => {
      const { completion } = await runBatch({
        operation: 'compress',
        includeSubfolders: false,
        data: {},
      });
      expect(completion.total).toBe(2); // sub/c.pdf excluded
    });
  });

  describe('per-op output mapping (PDF_BATCH_OUTPUT_SPEC)', () => {
    it('exposes exactly the batchable per-file operations', () => {
      expect(Object.keys(PDF_BATCH_OUTPUT_SPEC).sort()).toEqual(
        [
          'split',
          'compress',
          'rotate',
          'delete',
          'watermark',
          'extractText',
          'pageNumbers',
          'crop',
          'extractImages',
        ].sort()
      );
    });

    it('split writes part files into the mirrored output folder', async () => {
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 4, 'Split Me');
      await writePdfFixture(path.join(inputDir, 'sub', 'b.pdf'), 2, 'Split Sub');

      const { completion } = await runBatch({
        operation: 'split',
        data: { splitMode: 'interval', interval: 2 },
      });

      expect(completion).toMatchObject({ success: true, completed: 2, failed: 0 });

      const part1 = await PDFDocument.load(fs.readFileSync(path.join(outputDir, 'a_part_1.pdf')));
      expect(part1.getPageCount()).toBe(2);
      const subPart = await PDFDocument.load(
        fs.readFileSync(path.join(outputDir, 'sub', 'b_part_1.pdf'))
      );
      expect(subPart.getPageCount()).toBe(2);
    });

    it('extractText writes one .txt per PDF', async () => {
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 2, 'Text Alpha');

      const { completion } = await runBatch({ operation: 'extractText', data: {} });

      expect(completion).toMatchObject({ success: true, completed: 1 });
      const txt = fs.readFileSync(path.join(outputDir, 'a.txt'), 'utf8');
      expect(txt).toContain('Text Alpha Page 1');
      expect(txt).toContain('Text Alpha Page 2');
    });

    it('extractImages writes images into a per-PDF output directory', async () => {
      const imgPath = path.join(tmpDir, 'red.png');
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .png()
        .toFile(imgPath);

      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 300]);
      const png = await doc.embedPng(fs.readFileSync(imgPath));
      page.drawImage(png, { x: 50, y: 50, width: 100, height: 100 });
      fs.writeFileSync(path.join(inputDir, 'img.pdf'), await doc.save());

      const { completion } = await runBatch({ operation: 'extractImages', data: {} });

      expect(completion).toMatchObject({ success: true, completed: 1 });
      const expectedDir = path.join(outputDir, 'img');
      const files = fs.readdirSync(expectedDir);
      expect(files.length).toBeGreaterThanOrEqual(1);
      expect(files[0]).toMatch(/^img_page1_img1\.png$/);
    });

    it.each([
      ['compress', {}],
      ['rotate', { angle: 90 }],
      ['delete', { pages: '1' }],
      ['pageNumbers', { position: 'bottom-center', startNumber: 1 }],
      ['crop', { margins: { top: 10, bottom: 10, left: 10, right: 10 } }],
    ])('applies %s to every file via executeOperation', async (operation, data) => {
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 2, 'Op Check');
      await writePdfFixture(path.join(inputDir, 'sub', 'b.pdf'), 2, 'Op Check Sub');

      const { completion } = await runBatch({ operation, data });

      expect(completion).toMatchObject({ success: true, completed: 2, failed: 0 });
      expect(fs.existsSync(path.join(outputDir, 'a.pdf'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'sub', 'b.pdf'))).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('counts a corrupt PDF as failed and continues with the rest', async () => {
      await writePdfFixture(path.join(inputDir, 'good.pdf'), 1, 'Good');
      fs.writeFileSync(path.join(inputDir, 'corrupt.pdf'), 'this is not a pdf at all');

      const { completion } = await runBatch({ operation: 'compress', data: {} });

      expect(completion).toMatchObject({ success: true, completed: 1, failed: 1, total: 2 });
      expect(fs.existsSync(path.join(outputDir, 'good.pdf'))).toBe(true);
    });

    it('counts files over maxFileSize as failed without processing them', async () => {
      await writePdfFixture(path.join(inputDir, 'big.pdf'), 1, 'Big');

      const { completion } = await runBatch({
        operation: 'compress',
        data: {},
        maxFileSize: 10, // fixture is larger than 10 bytes
      });

      expect(completion).toMatchObject({ success: true, completed: 0, failed: 1, total: 1 });
      expect(fs.existsSync(path.join(outputDir, 'big.pdf'))).toBe(false);
    });

    it('rejects an operation that is not batchable', async () => {
      const { completion } = await runBatch({ operation: 'merge', data: {} });
      expect(completion.success).toBe(false);
      expect(completion.error).toMatch(/not supported/i);
    });

    it('rejects a missing input folder', async () => {
      const { completion } = await runBatch({
        operation: 'compress',
        inputFolder: path.join(tmpDir, 'does-not-exist'),
        data: {},
      });
      expect(completion).toEqual({ success: false, error: 'Input folder does not exist.' });
    });

    it('rejects when no PDFs are found', async () => {
      const { completion } = await runBatch({ operation: 'compress', data: {} });
      expect(completion).toEqual({
        success: false,
        error: 'No matching files found in the selected folder.',
      });
    });

    it('creates the output folder when it does not exist', async () => {
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 1, 'Mkdir');
      const nestedOutput = path.join(tmpDir, 'deeply', 'nested', 'out');

      const { completion } = await runBatch({
        operation: 'compress',
        outputFolder: nestedOutput,
        data: {},
      });

      expect(completion).toMatchObject({ success: true, completed: 1 });
      expect(fs.existsSync(path.join(nestedOutput, 'a.pdf'))).toBe(true);
    });

    it('sanitizes output-folder creation errors through the injected sanitizer', async () => {
      // A regular file in the middle of the output path makes recursive mkdir
      // fail with ENOTDIR.
      const blocker = path.join(tmpDir, 'blocker');
      fs.writeFileSync(blocker, 'not a directory');
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 1, 'Mkdir Fail');

      const { completion } = await runBatch({
        operation: 'compress',
        outputFolder: path.join(blocker, 'child'),
        data: {},
        sanitizeError: (message) => message.replace(new RegExp(path.sep, 'g'), '_SANITIZED_'),
      });

      expect(completion.success).toBe(false);
      expect(completion.error).toContain('Failed to create output folder');
      expect(completion.error).toContain('_SANITIZED_');
    });
  });

  describe('progress reporting', () => {
    it('reports one event per file plus a final event, following the batch-progress shape', async () => {
      await writePdfFixture(path.join(inputDir, 'a.pdf'), 1, 'A');
      await writePdfFixture(path.join(inputDir, 'b.pdf'), 1, 'B');

      const { progress } = await runBatch({ operation: 'compress', data: {} });

      expect(progress).toHaveLength(3);
      expect(progress[0]).toEqual({
        completed: 0,
        failed: 0,
        total: 2,
        currentFile: expect.stringMatching(/^[ab]\.pdf$/),
      });
      expect(progress[1]).toMatchObject({ completed: 1, failed: 0, total: 2 });
      expect(progress[2]).toEqual({ completed: 2, failed: 0, total: 2, currentFile: null });
    });

    it('carries the running failed count in progress events', async () => {
      await writePdfFixture(path.join(inputDir, 'good.pdf'), 1, 'Good');
      fs.writeFileSync(path.join(inputDir, 'corrupt.pdf'), 'not a pdf');

      const { progress } = await runBatch({ operation: 'compress', data: {} });

      // Final event reflects the failure; earlier events carry the running count.
      expect(progress[progress.length - 1]).toEqual({
        completed: 1,
        failed: 1,
        total: 2,
        currentFile: null,
      });
    });
  });
});
