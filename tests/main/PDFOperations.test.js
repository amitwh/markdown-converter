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

describe('PDFOperations - Task 16 form field fill/flatten', () => {
  let tmpDir, plainInputPath;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfops_form_'));
    plainInputPath = path.join(tmpDir, 'plain.pdf');

    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    fs.writeFileSync(plainInputPath, await doc.save());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Builds a fixture PDF with a real AcroForm text field via pdf-lib's
  // form.createTextField() API, mirroring pdf-lib's documented form-creation flow.
  async function buildFormPdf(fileName, initialValue = 'John Doe') {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const form = doc.getForm();
    const nameField = form.createTextField('name');
    nameField.setText(initialValue);
    nameField.addToPage(page, { x: 50, y: 700, width: 200, height: 20 });

    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, await doc.save());
    return filePath;
  }

  describe('pdfGetFormFields', () => {
    it('lists text fields with name, type, and current value', async () => {
      const formPath = await buildFormPdf('form.pdf', 'John Doe');

      const result = await PDFOperations.pdfGetFormFields({ inputPath: formPath });

      expect(result.success).toBe(true);
      expect(result.fields).toEqual([{ name: 'name', type: 'PDFTextField', value: 'John Doe' }]);
    });

    it('returns an empty fields array for a PDF with no AcroForm', async () => {
      const result = await PDFOperations.pdfGetFormFields({ inputPath: plainInputPath });

      expect(result.success).toBe(true);
      expect(result.fields).toEqual([]);
    });

    it('returns failure for a nonexistent file', async () => {
      const result = await PDFOperations.pdfGetFormFields({
        inputPath: path.join(tmpDir, 'missing.pdf'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('pdfFillForm', () => {
    it('fills a text field with the given value', async () => {
      const formPath = await buildFormPdf('form.pdf', '');
      const outputPath = path.join(tmpDir, 'filled.pdf');

      const result = await PDFOperations.pdfFillForm({
        inputPath: formPath,
        outputPath,
        values: { name: 'Jane Smith' },
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);

      const filled = await PDFDocument.load(fs.readFileSync(outputPath));
      expect(filled.getForm().getTextField('name').getText()).toBe('Jane Smith');
    });

    it('flattens the form when flatten is true, removing editable fields', async () => {
      const formPath = await buildFormPdf('form.pdf', '');
      const outputPath = path.join(tmpDir, 'flattened.pdf');

      const result = await PDFOperations.pdfFillForm({
        inputPath: formPath,
        outputPath,
        values: { name: 'Jane Smith' },
        flatten: true,
      });

      expect(result.success).toBe(true);
      const flattened = await PDFDocument.load(fs.readFileSync(outputPath));
      expect(flattened.getForm().getFields().length).toBe(0);
    });

    it('does not flatten when flatten is false/omitted', async () => {
      const formPath = await buildFormPdf('form.pdf', '');
      const outputPath = path.join(tmpDir, 'not-flattened.pdf');

      const result = await PDFOperations.pdfFillForm({
        inputPath: formPath,
        outputPath,
        values: { name: 'Jane Smith' },
      });

      expect(result.success).toBe(true);
      const notFlattened = await PDFDocument.load(fs.readFileSync(outputPath));
      expect(notFlattened.getForm().getFields().length).toBe(1);
    });

    it('skips a value for a field that does not exist, continuing with the rest', async () => {
      const formPath = await buildFormPdf('form.pdf', '');
      const outputPath = path.join(tmpDir, 'filled-partial.pdf');

      const result = await PDFOperations.pdfFillForm({
        inputPath: formPath,
        outputPath,
        values: { name: 'Jane Smith', doesNotExist: 'whatever' },
      });

      expect(result.success).toBe(true);
      const filled = await PDFDocument.load(fs.readFileSync(outputPath));
      expect(filled.getForm().getTextField('name').getText()).toBe('Jane Smith');
    });

    it('returns failure for a nonexistent input file', async () => {
      const result = await PDFOperations.pdfFillForm({
        inputPath: path.join(tmpDir, 'missing.pdf'),
        outputPath: path.join(tmpDir, 'out.pdf'),
        values: { name: 'X' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('executeOperation dispatch', () => {
    it('dispatches formFields', async () => {
      const formPath = await buildFormPdf('form.pdf', 'John Doe');
      const result = await PDFOperations.executeOperation('formFields', { inputPath: formPath });
      expect(result.success).toBe(true);
      expect(result.fields.length).toBe(1);
    });

    it('dispatches fillForm', async () => {
      const formPath = await buildFormPdf('form.pdf', '');
      const outputPath = path.join(tmpDir, 'dispatch-filled.pdf');
      const result = await PDFOperations.executeOperation('fillForm', {
        inputPath: formPath,
        outputPath,
        values: { name: 'Dispatch Test' },
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('PDFOperations - Task 27 honest encryption failure', () => {
  let tmpDir, inputPath;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfops_pw_'));
    inputPath = path.join(tmpDir, 'in.pdf');

    const doc = await PDFDocument.create();
    doc.addPage([600, 800]);
    fs.writeFileSync(inputPath, await doc.save());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects the bundled pdf-lib as encryption-incapable via the module-load probe', async () => {
    // Pins the Task 27 premise: pdf-lib 1.17.1's save() ignores password
    // options (SaveOptions has no such fields), so the probe — which saves a
    // tiny document with a userPassword and checks the bytes for /Encrypt —
    // must report false. If this fails after a library swap, the probe
    // re-enabled the ops and the honest-failure tests below no longer apply.
    await expect(PDFOperations.pdfEncryptionSupported).resolves.toBe(false);
  });

  it('pdfEncrypt fails honestly without writing an output file', async () => {
    const outputPath = path.join(tmpDir, 'encrypted.pdf');
    const result = await PDFOperations.pdfEncrypt({
      inputPath,
      outputPath,
      userPassword: 'secret',
      ownerPassword: 'owner-secret',
      permissions: { printing: true },
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(PDFOperations.PDF_ENCRYPTION_UNAVAILABLE_MESSAGE);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('pdfDecrypt fails honestly without writing an output file', async () => {
    const outputPath = path.join(tmpDir, 'decrypted.pdf');
    const result = await PDFOperations.pdfDecrypt({
      inputPath,
      outputPath,
      password: 'secret',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(PDFOperations.PDF_ENCRYPTION_UNAVAILABLE_MESSAGE);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('pdfSetPermissions fails honestly without writing an output file', async () => {
    const outputPath = path.join(tmpDir, 'permissions.pdf');
    const result = await PDFOperations.pdfSetPermissions({
      inputPath,
      outputPath,
      ownerPassword: 'owner-secret',
      permissions: { printing: true },
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(PDFOperations.PDF_ENCRYPTION_UNAVAILABLE_MESSAGE);
    expect(fs.existsSync(outputPath)).toBe(false);
  });

  it('fails honestly even before reading the input, so a missing input reports unavailability', async () => {
    const result = await PDFOperations.pdfEncrypt({
      inputPath: path.join(tmpDir, 'missing.pdf'),
      outputPath: path.join(tmpDir, 'never-written.pdf'),
      userPassword: 'secret',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(PDFOperations.PDF_ENCRYPTION_UNAVAILABLE_MESSAGE);
    expect(fs.existsSync(path.join(tmpDir, 'never-written.pdf'))).toBe(false);
  });

  it('executeOperation routes the password ops to the honest failure', async () => {
    const result = await PDFOperations.executeOperation('encrypt', {
      inputPath,
      outputPath: path.join(tmpDir, 'exec-encrypted.pdf'),
      userPassword: 'secret',
      permissions: { printing: true },
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe(PDFOperations.PDF_ENCRYPTION_UNAVAILABLE_MESSAGE);
  });

  it('the module-load probe does not affect other operations', async () => {
    const outputPath = path.join(tmpDir, 'rotated.pdf');
    const result = await PDFOperations.pdfRotate({
      inputPath,
      outputPath,
      pages: '1',
      angle: 90,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
    const rotated = await PDFDocument.load(fs.readFileSync(outputPath));
    expect(rotated.getPageCount()).toBe(1);
  });
});
