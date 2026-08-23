/**
 * @jest-environment node
 *
 * PDFOperations.js tests for Task 15's new operations: extractText, pageNumbers,
 * crop, extractImages. Uses pdf-lib to build minimal fixture PDFs at test time,
 * mirroring the fixture pattern used by tests/main/ImageOperations.test.js.
 *
 * NOTE: pdfExtractText/pdfExtractImages use pdfjs-dist (ESM-only) via a dynamic
 * `import()`, which requires Node's `--experimental-vm-modules` flag under Jest
 * (set via NODE_OPTIONS in the npm test scripts) and a `node` test environment
 * (jsdom lacks the fetch API globals pdfjs-dist needs).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const PDFOperations = require('../../src/main/PDFOperations');

describe('PDFOperations - Task 15 new operations', () => {
  let tmpDir, inputPath;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfops_'));
    inputPath = path.join(tmpDir, 'in.pdf');

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const page1 = doc.addPage([600, 800]);
    page1.drawText('Hello Task 15 Page One', {
      x: 50,
      y: 700,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });

    const page2 = doc.addPage([600, 800]);
    page2.drawText('Second Page Content', { x: 50, y: 700, size: 20, font, color: rgb(0, 0, 0) });

    fs.writeFileSync(inputPath, await doc.save());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('pdfExtractText', () => {
    it('extracts text from all pages', async () => {
      const result = await PDFOperations.pdfExtractText({ inputPath });

      expect(result.success).toBe(true);
      expect(result.text).toContain('Hello Task 15 Page One');
      expect(result.text).toContain('Second Page Content');
    });

    it('returns failure for a nonexistent file', async () => {
      const result = await PDFOperations.pdfExtractText({
        inputPath: path.join(tmpDir, 'missing.pdf'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('also saves the text to outputPath when provided', async () => {
      const outputPath = path.join(tmpDir, 'extracted.txt');
      const result = await PDFOperations.pdfExtractText({ inputPath, outputPath });

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
      const saved = fs.readFileSync(outputPath, 'utf8');
      expect(saved).toContain('Hello Task 15 Page One');
      expect(result.message).toContain(outputPath);
    });
  });

  describe('pdfAddPageNumbers', () => {
    it('adds a page number to every page at the requested position', async () => {
      const outputPath = path.join(tmpDir, 'numbered.pdf');
      const result = await PDFOperations.pdfAddPageNumbers({
        inputPath,
        outputPath,
        position: 'bottom-center',
        startNumber: 1,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);

      const extracted = await PDFOperations.pdfExtractText({ inputPath: outputPath });
      expect(extracted.success).toBe(true);
      expect(extracted.text).toContain('1');
      expect(extracted.text).toContain('2');

      const savedPdf = await PDFDocument.load(fs.readFileSync(outputPath));
      expect(savedPdf.getPageCount()).toBe(2);
    });

    it('honors a custom startNumber', async () => {
      const outputPath = path.join(tmpDir, 'numbered-start5.pdf');
      const result = await PDFOperations.pdfAddPageNumbers({
        inputPath,
        outputPath,
        position: 'bottom-right',
        startNumber: 5,
      });

      expect(result.success).toBe(true);
      const extracted = await PDFOperations.pdfExtractText({ inputPath: outputPath });
      expect(extracted.text).toContain('5');
      expect(extracted.text).toContain('6');
    });
  });

  describe('pdfCrop', () => {
    it('shrinks the crop box by the given margins', async () => {
      const outputPath = path.join(tmpDir, 'cropped.pdf');
      const result = await PDFOperations.pdfCrop({
        inputPath,
        outputPath,
        margins: { top: 50, bottom: 50, left: 20, right: 20 },
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);

      const croppedPdf = await PDFDocument.load(fs.readFileSync(outputPath));
      const page = croppedPdf.getPage(0);
      const cropBox = page.getCropBox();

      expect(cropBox.x).toBe(20);
      expect(cropBox.y).toBe(50);
      expect(cropBox.width).toBe(560); // 600 - 20 - 20
      expect(cropBox.height).toBe(700); // 800 - 50 - 50
    });

    it('fails gracefully when margins exceed the page size', async () => {
      const outputPath = path.join(tmpDir, 'cropped-invalid.pdf');
      const result = await PDFOperations.pdfCrop({
        inputPath,
        outputPath,
        margins: { top: 500, bottom: 500, left: 0, right: 0 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('pdfExtractImages', () => {
    it('extracts embedded raster images as PNG files', async () => {
      const imgPath = path.join(tmpDir, 'red.png');
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .png()
        .toFile(imgPath);

      const doc = await PDFDocument.create();
      const page = doc.addPage([300, 300]);
      const pngImage = await doc.embedPng(fs.readFileSync(imgPath));
      page.drawImage(pngImage, { x: 50, y: 50, width: 100, height: 100 });

      const imagePdfPath = path.join(tmpDir, 'with-image.pdf');
      fs.writeFileSync(imagePdfPath, await doc.save());

      const outputDir = path.join(tmpDir, 'extracted');
      const result = await PDFOperations.pdfExtractImages({
        inputPath: imagePdfPath,
        outputDir,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThanOrEqual(1);
      expect(result.files.length).toBe(result.count);

      for (const file of result.files) {
        expect(fs.existsSync(file)).toBe(true);
        const meta = await sharp(file).metadata();
        expect(meta.format).toBe('png');
      }
    });

    it('returns zero images for a text-only PDF', async () => {
      const outputDir = path.join(tmpDir, 'extracted-none');
      const result = await PDFOperations.pdfExtractImages({ inputPath, outputDir });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.files).toEqual([]);
    });
  });

  describe('executeOperation dispatch', () => {
    it('dispatches extractText', async () => {
      const result = await PDFOperations.executeOperation('extractText', { inputPath });
      expect(result.success).toBe(true);
    });

    it('dispatches pageNumbers', async () => {
      const outputPath = path.join(tmpDir, 'dispatch-numbered.pdf');
      const result = await PDFOperations.executeOperation('pageNumbers', {
        inputPath,
        outputPath,
        position: 'bottom-center',
        startNumber: 1,
      });
      expect(result.success).toBe(true);
    });

    it('dispatches crop', async () => {
      const outputPath = path.join(tmpDir, 'dispatch-cropped.pdf');
      const result = await PDFOperations.executeOperation('crop', {
        inputPath,
        outputPath,
        margins: { top: 10, bottom: 10, left: 10, right: 10 },
      });
      expect(result.success).toBe(true);
    });

    it('dispatches extractImages', async () => {
      const outputDir = path.join(tmpDir, 'dispatch-extracted');
      const result = await PDFOperations.executeOperation('extractImages', {
        inputPath,
        outputDir,
      });
      expect(result.success).toBe(true);
    });
  });
});
