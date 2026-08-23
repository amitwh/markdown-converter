const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');

// pdf-lib 1.17.1 cannot encrypt: SaveOptions has no userPassword/ownerPassword/
// permissions fields, so save() silently ignores them and writes an unprotected
// file, and PDFDocument.load() cannot open password-protected input (verified
// empirically in Task 22's review). Rather than trusting a pinned version
// string, probe the installed library once at module load: save a tiny
// in-memory document with a userPassword and check the raw bytes for an
// /Encrypt dictionary (which an unencrypted document never contains). A library
// that supports encryption passes the probe and the password ops re-enable
// automatically. Probe errors fail closed (treated as unsupported).
const pdfEncryptionSupported = (async () => {
  try {
    const probeDoc = await PDFDocument.create();
    const probeBytes = await probeDoc.save({ userPassword: 'encryption-capability-probe' });
    return Buffer.from(probeBytes).includes('/Encrypt');
  } catch {
    return false;
  }
})();

// Returned by the password ops when the probe reports no encryption support
// (Task 27): fail honestly instead of silently writing an unprotected file.
const PDF_ENCRYPTION_UNAVAILABLE_MESSAGE =
  'Password protection is not available in this build (pdf-lib lacks encryption support).';

function parsePageRanges(rangeString, totalPages) {
  const pages = [];
  const ranges = rangeString.split(',').map((r) => r.trim());

  for (const range of ranges) {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map((n) => parseInt(n.trim()));
      for (let i = start; i <= end && i <= totalPages; i++) {
        if (i > 0 && !pages.includes(i - 1)) {
          pages.push(i - 1);
        }
      }
    } else {
      const page = parseInt(range);
      if (page > 0 && page <= totalPages && !pages.includes(page - 1)) {
        pages.push(page - 1);
      }
    }
  }

  return pages.sort((a, b) => a - b);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 };
}

async function pdfMerge(data) {
  try {
    const mergedPdf = await PDFDocument.create();

    for (const filePath of data.inputFiles) {
      const pdfBytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const pdfBytes = await mergedPdf.save();
    fs.writeFileSync(data.outputPath, pdfBytes);

    return { success: true, message: `Successfully merged ${data.inputFiles.length} PDFs` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfSplit(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    const splits = [];

    if (data.splitMode === 'pages') {
      const ranges = data.pageRanges.split(',').map((r) => r.trim());
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        const pages = [];

        if (range.includes('-')) {
          const [start, end] = range.split('-').map((n) => parseInt(n.trim()));
          for (let p = start; p <= end && p <= totalPages; p++) {
            pages.push(p - 1);
          }
        } else {
          const page = parseInt(range);
          if (page > 0 && page <= totalPages) {
            pages.push(page - 1);
          }
        }

        if (pages.length > 0) {
          splits.push({ pages, name: `part_${i + 1}` });
        }
      }
    } else if (data.splitMode === 'interval') {
      const interval = data.interval;
      if (!Number.isInteger(interval) || interval <= 0) {
        return { success: false, message: 'Split interval must be a positive integer.' };
      }
      for (let i = 0; i < totalPages; i += interval) {
        const pages = [];
        for (let j = i; j < i + interval && j < totalPages; j++) {
          pages.push(j);
        }
        splits.push({ pages, name: `part_${Math.floor(i / interval) + 1}` });
      }
    } else if (data.splitMode === 'size') {
      const chunkSize = Math.max(1, Math.floor(totalPages / 5));
      for (let i = 0; i < totalPages; i += chunkSize) {
        const pages = [];
        for (let j = i; j < i + chunkSize && j < totalPages; j++) {
          pages.push(j);
        }
        splits.push({ pages, name: `part_${Math.floor(i / chunkSize) + 1}` });
      }
    }

    const baseName = path.basename(data.inputPath, '.pdf');
    for (const split of splits) {
      const newPdf = await PDFDocument.create();
      const copiedPages = await newPdf.copyPages(pdf, split.pages);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const outputPath = path.join(data.outputFolder, `${baseName}_${split.name}.pdf`);
      const newPdfBytes = await newPdf.save();
      fs.writeFileSync(outputPath, newPdfBytes);
    }

    return { success: true, message: `Successfully split PDF into ${splits.length} files` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfCompress(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);

    const compressedPdfBytes = await pdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    fs.writeFileSync(data.outputPath, compressedPdfBytes);

    const originalSize = fs.statSync(data.inputPath).size;
    const compressedSize = fs.statSync(data.outputPath).size;
    const savings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);

    return {
      success: true,
      message: `PDF compressed. Size reduced by ${savings}% (${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB)`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfRotate(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    let pagesToRotate = [];
    if (data.pages && data.pages.trim()) {
      pagesToRotate = parsePageRanges(data.pages, totalPages);
    } else {
      pagesToRotate = Array.from({ length: totalPages }, (_, i) => i);
    }

    pagesToRotate.forEach((pageIndex) => {
      const page = pdf.getPage(pageIndex);
      page.setRotation(degrees(data.angle));
    });

    const rotatedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, rotatedPdfBytes);

    return {
      success: true,
      message: `Successfully rotated ${pagesToRotate.length} page(s) by ${data.angle}\u00B0`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfDeletePages(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    const pagesToDelete = parsePageRanges(data.pages, totalPages);

    pagesToDelete
      .sort((a, b) => b - a)
      .forEach((pageIndex) => {
        pdf.removePage(pageIndex);
      });

    const newPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, newPdfBytes);

    return {
      success: true,
      message: `Successfully deleted ${pagesToDelete.length} page(s). New PDF has ${totalPages - pagesToDelete.length} pages`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfReorder(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    const newOrder = data.newOrder.split(',').map((n) => parseInt(n.trim()) - 1);

    if (newOrder.length !== totalPages) {
      return { success: false, error: `New order must include all ${totalPages} pages` };
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, newOrder);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const reorderedPdfBytes = await newPdf.save();
    fs.writeFileSync(data.outputPath, reorderedPdfBytes);

    return { success: true, message: 'Successfully reordered PDF pages' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Shared corner/center coordinate mapping used by pdfWatermark and pdfAddPageNumbers.
function resolvePosition(position, width, height, margin = 50) {
  switch (position) {
    case 'center':
      return { x: width / 2, y: height / 2 };
    case 'diagonal':
      return { x: width / 2, y: height / 2 };
    case 'top-left':
      return { x: margin, y: height - margin };
    case 'top-center':
      return { x: width / 2, y: height - margin };
    case 'top-right':
      return { x: width - margin, y: height - margin };
    case 'bottom-left':
      return { x: margin, y: margin };
    case 'bottom-center':
      return { x: width / 2, y: margin };
    case 'bottom-right':
      return { x: width - margin, y: margin };
    default:
      return { x: width / 2, y: height / 2 };
  }
}

async function pdfWatermark(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    let pagesToWatermark = [];
    if (data.pages === 'all') {
      pagesToWatermark = Array.from({ length: totalPages }, (_, i) => i);
    } else if (data.pages === 'custom' && data.customPages) {
      pagesToWatermark = parsePageRanges(data.customPages, totalPages);
    }

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const color = hexToRgb(data.color);

    for (const pageIndex of pagesToWatermark) {
      const page = pdf.getPage(pageIndex);
      const { width, height } = page.getSize();

      const { x, y } = resolvePosition(data.position, width, height, 50);
      const rotation = data.position === 'diagonal' ? 45 : 0;

      page.drawText(data.text, {
        x,
        y,
        size: data.fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: data.opacity,
        rotate: degrees(rotation),
      });
    }

    const watermarkedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, watermarkedPdfBytes);

    return {
      success: true,
      message: `Successfully added watermark to ${pagesToWatermark.length} page(s)`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfEncrypt(data) {
  if (!(await pdfEncryptionSupported)) {
    return { success: false, message: PDF_ENCRYPTION_UNAVAILABLE_MESSAGE };
  }
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);

    const encryptedPdfBytes = await pdf.save({
      userPassword: data.userPassword,
      ownerPassword: data.ownerPassword || data.userPassword,
      permissions: {
        printing: data.permissions.printing ? 'highResolution' : 'lowResolution',
        modifying: data.permissions.modifying,
        copying: data.permissions.copying,
        annotating: data.permissions.annotating,
        fillingForms: data.permissions.fillingForms,
        contentAccessibility: data.permissions.contentAccessibility,
        documentAssembly: data.permissions.documentAssembly,
      },
    });

    fs.writeFileSync(data.outputPath, encryptedPdfBytes);

    return { success: true, message: 'Successfully added password protection to PDF' };
  } catch (error) {
    if (error.message.includes('encrypt') || error.message.includes('password')) {
      return {
        success: false,
        error:
          'PDF encryption requires pdf-lib with encryption support. This feature may not be available in the current version.',
      };
    }
    return { success: false, error: error.message };
  }
}

async function pdfDecrypt(data) {
  if (!(await pdfEncryptionSupported)) {
    return { success: false, message: PDF_ENCRYPTION_UNAVAILABLE_MESSAGE };
  }
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes, { password: data.password });

    const decryptedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, decryptedPdfBytes);

    return { success: true, message: 'Successfully removed password protection from PDF' };
  } catch (error) {
    if (error.message.includes('password') || error.message.includes('encrypted')) {
      return { success: false, error: 'Incorrect password or PDF is not encrypted' };
    }
    return { success: false, error: error.message };
  }
}

async function pdfSetPermissions(data) {
  if (!(await pdfEncryptionSupported)) {
    return { success: false, message: PDF_ENCRYPTION_UNAVAILABLE_MESSAGE };
  }
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const loadOptions = data.currentPassword ? { password: data.currentPassword } : {};
    const pdf = await PDFDocument.load(pdfBytes, loadOptions);

    const newPdfBytes = await pdf.save({
      ownerPassword: data.ownerPassword,
      permissions: {
        printing: data.permissions.printing ? 'highResolution' : 'lowResolution',
        modifying: data.permissions.modifying,
        copying: data.permissions.copying,
        annotating: data.permissions.annotating,
        fillingForms: data.permissions.fillingForms,
        contentAccessibility: data.permissions.contentAccessibility,
        documentAssembly: data.permissions.documentAssembly,
      },
    });

    fs.writeFileSync(data.outputPath, newPdfBytes);

    return { success: true, message: 'Successfully updated PDF permissions' };
  } catch (error) {
    if (error.message.includes('encrypt') || error.message.includes('permission')) {
      return {
        success: false,
        error:
          'PDF permissions require pdf-lib with encryption support. This feature may not be available in the current version.',
      };
    }
    return { success: false, error: error.message };
  }
}

// pdf-lib has no text-extraction API, so this loads pdfjs-dist's Node-friendly
// "legacy" build (the standard build assumes DOM globals like DOMMatrix).
// pdfjs-dist v5.x ships ESM-only, so it must be loaded via dynamic import()
// even from this CommonJS module.
async function loadPdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

// Points pdfjs-dist at its bundled standard font metrics so it doesn't warn
// (and degrade text-extraction fidelity) when a PDF uses a standard font.
function getStandardFontDataUrl() {
  return (
    path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts') + path.sep
  );
}

async function pdfExtractText(data) {
  try {
    const pdfjsLib = await loadPdfjs();
    const fileData = new Uint8Array(fs.readFileSync(data.inputPath));
    const pdf = await pdfjsLib.getDocument({
      data: fileData,
      standardFontDataUrl: getStandardFontDataUrl(),
    }).promise;

    let text = '';
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(' ');
      text += pageText + '\n';
    }

    const trimmedText = text.trim();
    const result = { success: true, text: trimmedText };

    // outputPath is optional: when provided (e.g. from the PDF editor UI),
    // also save the extracted text to disk and report where it went.
    if (data.outputPath) {
      fs.writeFileSync(data.outputPath, trimmedText, 'utf8');
      result.message = `Successfully extracted text to ${data.outputPath}`;
    }

    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfAddPageNumbers(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const position = data.position || 'bottom-center';
    const fontSize = data.fontSize || 12;
    const startNumber = data.startNumber && data.startNumber > 0 ? data.startNumber : 1;

    for (let i = 0; i < totalPages; i++) {
      const page = pdf.getPage(i);
      const { width, height } = page.getSize();
      const { x, y } = resolvePosition(position, width, height, 30);

      const label = String(startNumber + i);
      const textWidth = font.widthOfTextAtSize(label, fontSize);

      let drawX = x;
      if (position.includes('center')) {
        drawX = x - textWidth / 2;
      } else if (position.includes('right')) {
        drawX = x - textWidth;
      }

      page.drawText(label, {
        x: drawX,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }

    const newPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, newPdfBytes);

    return { success: true, message: `Successfully added page numbers to ${totalPages} page(s)` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfCrop(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const totalPages = pdf.getPageCount();

    const margins = data.margins || {};
    const top = margins.top || 0;
    const bottom = margins.bottom || 0;
    const left = margins.left || 0;
    const right = margins.right || 0;

    for (let i = 0; i < totalPages; i++) {
      const page = pdf.getPage(i);
      const mediaBox = page.getMediaBox();
      const newWidth = mediaBox.width - left - right;
      const newHeight = mediaBox.height - top - bottom;

      if (newWidth <= 0 || newHeight <= 0) {
        return { success: false, error: `Crop margins are too large for page ${i + 1}` };
      }

      page.setCropBox(mediaBox.x + left, mediaBox.y + bottom, newWidth, newHeight);
    }

    const croppedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, croppedPdfBytes);

    return { success: true, message: `Successfully cropped ${totalPages} page(s)` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfExtractImages(data) {
  try {
    const pdfjsLib = await loadPdfjs();
    // sharp is only needed here; require lazily to match the module's existing
    // pattern of not pulling heavy optional deps in until an operation runs.
    const sharp = require('sharp');

    const fileData = new Uint8Array(fs.readFileSync(data.inputPath));
    const pdf = await pdfjsLib.getDocument({
      data: fileData,
      standardFontDataUrl: getStandardFontDataUrl(),
    }).promise;

    if (!fs.existsSync(data.outputDir)) {
      fs.mkdirSync(data.outputDir, { recursive: true });
    }

    const baseName = path.basename(data.inputPath, path.extname(data.inputPath));
    const files = [];
    let imageIndex = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const opList = await page.getOperatorList();

      for (let i = 0; i < opList.fnArray.length; i++) {
        if (opList.fnArray[i] !== pdfjsLib.OPS.paintImageXObject) {
          continue;
        }

        const objId = opList.argsArray[i][0];

        try {
          const imgObj = await new Promise((resolve) => page.objs.get(objId, resolve));

          if (!imgObj || !imgObj.data || !imgObj.width || !imgObj.height) {
            continue;
          }

          const channels =
            imgObj.kind === pdfjsLib.ImageKind.RGBA_32BPP
              ? 4
              : imgObj.kind === pdfjsLib.ImageKind.GRAYSCALE_1BPP
                ? 1
                : 3;

          imageIndex++;
          const outputFile = path.join(
            data.outputDir,
            `${baseName}_page${pageNum}_img${imageIndex}.png`
          );

          await sharp(Buffer.from(imgObj.data), {
            raw: { width: imgObj.width, height: imgObj.height, channels },
          })
            .png()
            .toFile(outputFile);

          files.push(outputFile);
        } catch {
          // Skip images pdfjs/sharp can't decode (e.g. unsupported color spaces).
          continue;
        }
      }
    }

    return {
      success: true,
      count: files.length,
      files,
      message: `Successfully extracted ${files.length} image(s)`,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfGetFormFields(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    const fields = form.getFields().map((field) => {
      let value;
      try {
        if (typeof field.getText === 'function') {
          value = field.getText();
        } else if (typeof field.isChecked === 'function') {
          value = field.isChecked();
        } else if (typeof field.getSelected === 'function') {
          value = field.getSelected();
        }
      } catch {
        // Some field types throw when read in an unexpected state; leave value undefined.
        value = undefined;
      }
      return { name: field.getName(), type: field.constructor.name, value };
    });

    return { success: true, fields };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfFillForm(data) {
  try {
    const pdfBytes = fs.readFileSync(data.inputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    const form = pdf.getForm();

    const values = data.values || {};
    let filledCount = 0;

    for (const [name, value] of Object.entries(values)) {
      try {
        const field = form.getTextField(name);
        field.setText(value !== null && value !== undefined ? String(value) : '');
        filledCount++;
      } catch (fieldError) {
        // Batch-of-independent-fields: a field that doesn't exist or isn't a text
        // field shouldn't fail the whole fill — skip it and keep going (same
        // partial-success precedent as pdfExtractImages).
        console.warn(`pdfFillForm: skipping field "${name}": ${fieldError.message}`);
      }
    }

    if (data.flatten) {
      form.flatten();
    }

    const filledPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, filledPdfBytes);

    return { success: true, message: `Successfully filled ${filledCount} form field(s)` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function executeOperation(operation, data) {
  switch (operation) {
    case 'merge':
      return pdfMerge(data);
    case 'split':
      return pdfSplit(data);
    case 'compress':
      return pdfCompress(data);
    case 'rotate':
      return pdfRotate(data);
    case 'delete':
      return pdfDeletePages(data);
    case 'reorder':
      return pdfReorder(data);
    case 'watermark':
      return pdfWatermark(data);
    case 'encrypt':
      return pdfEncrypt(data);
    case 'decrypt':
      return pdfDecrypt(data);
    case 'permissions':
      return pdfSetPermissions(data);
    case 'extractText':
      return pdfExtractText(data);
    case 'pageNumbers':
      return pdfAddPageNumbers(data);
    case 'crop':
      return pdfCrop(data);
    case 'extractImages':
      return pdfExtractImages(data);
    case 'formFields':
      return pdfGetFormFields(data);
    case 'fillForm':
      return pdfFillForm(data);
    default:
      return Promise.resolve({ success: false, error: `Unknown operation: ${operation}` });
  }
}

async function getPageCount(filePath) {
  const pdfBytes = fs.readFileSync(filePath);
  const pdf = await PDFDocument.load(pdfBytes);
  return pdf.getPageCount();
}

module.exports = {
  parsePageRanges,
  hexToRgb,
  pdfEncryptionSupported,
  PDF_ENCRYPTION_UNAVAILABLE_MESSAGE,
  pdfMerge,
  pdfSplit,
  pdfCompress,
  pdfRotate,
  pdfDeletePages,
  pdfReorder,
  pdfWatermark,
  pdfEncrypt,
  pdfDecrypt,
  pdfSetPermissions,
  pdfExtractText,
  pdfAddPageNumbers,
  pdfCrop,
  pdfExtractImages,
  pdfGetFormFields,
  pdfFillForm,
  executeOperation,
  getPageCount,
};
