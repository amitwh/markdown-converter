const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');

function parsePageRanges(rangeString, totalPages) {
  const pages = [];
  const ranges = rangeString.split(',').map(r => r.trim());

  for (const range of ranges) {
    if (range.includes('-')) {
      const [start, end] = range.split('-').map(n => parseInt(n.trim()));
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
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

async function pdfMerge(data) {
  try {
    const mergedPdf = await PDFDocument.create();

    for (const filePath of data.inputFiles) {
      const pdfBytes = fs.readFileSync(filePath);
      const pdf = await PDFDocument.load(pdfBytes);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach(page => mergedPdf.addPage(page));
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

    let splits = [];

    if (data.splitMode === 'pages') {
      const ranges = data.pageRanges.split(',').map(r => r.trim());
      for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i];
        let pages = [];

        if (range.includes('-')) {
          const [start, end] = range.split('-').map(n => parseInt(n.trim()));
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
      copiedPages.forEach(page => newPdf.addPage(page));

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
      objectsPerTick: 50
    });

    fs.writeFileSync(data.outputPath, compressedPdfBytes);

    const originalSize = fs.statSync(data.inputPath).size;
    const compressedSize = fs.statSync(data.outputPath).size;
    const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

    return {
      success: true,
      message: `PDF compressed. Size reduced by ${savings}% (${(originalSize / 1024).toFixed(1)}KB → ${(compressedSize / 1024).toFixed(1)}KB)`
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

    pagesToRotate.forEach(pageIndex => {
      const page = pdf.getPage(pageIndex);
      page.setRotation(degrees(data.angle));
    });

    const rotatedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, rotatedPdfBytes);

    return {
      success: true,
      message: `Successfully rotated ${pagesToRotate.length} page(s) by ${data.angle}\u00B0`
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

    pagesToDelete.sort((a, b) => b - a).forEach(pageIndex => {
      pdf.removePage(pageIndex);
    });

    const newPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, newPdfBytes);

    return {
      success: true,
      message: `Successfully deleted ${pagesToDelete.length} page(s). New PDF has ${totalPages - pagesToDelete.length} pages`
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

    const newOrder = data.newOrder.split(',').map(n => parseInt(n.trim()) - 1);

    if (newOrder.length !== totalPages) {
      return { success: false, error: `New order must include all ${totalPages} pages` };
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, newOrder);
    copiedPages.forEach(page => newPdf.addPage(page));

    const reorderedPdfBytes = await newPdf.save();
    fs.writeFileSync(data.outputPath, reorderedPdfBytes);

    return { success: true, message: 'Successfully reordered PDF pages' };
  } catch (error) {
    return { success: false, error: error.message };
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

      let x, y, rotation = 0;

      switch (data.position) {
        case 'center':
          x = width / 2;
          y = height / 2;
          break;
        case 'diagonal':
          x = width / 2;
          y = height / 2;
          rotation = 45;
          break;
        case 'top-left':
          x = 50;
          y = height - 50;
          break;
        case 'top-center':
          x = width / 2;
          y = height - 50;
          break;
        case 'top-right':
          x = width - 50;
          y = height - 50;
          break;
        case 'bottom-left':
          x = 50;
          y = 50;
          break;
        case 'bottom-center':
          x = width / 2;
          y = 50;
          break;
        case 'bottom-right':
          x = width - 50;
          y = 50;
          break;
        default:
          x = width / 2;
          y = height / 2;
      }

      page.drawText(data.text, {
        x,
        y,
        size: data.fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: data.opacity,
        rotate: degrees(rotation)
      });
    }

    const watermarkedPdfBytes = await pdf.save();
    fs.writeFileSync(data.outputPath, watermarkedPdfBytes);

    return {
      success: true,
      message: `Successfully added watermark to ${pagesToWatermark.length} page(s)`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function pdfEncrypt(data) {
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
        documentAssembly: data.permissions.documentAssembly
      }
    });

    fs.writeFileSync(data.outputPath, encryptedPdfBytes);

    return { success: true, message: 'Successfully added password protection to PDF' };
  } catch (error) {
    if (error.message.includes('encrypt') || error.message.includes('password')) {
      return {
        success: false,
        error: 'PDF encryption requires pdf-lib with encryption support. This feature may not be available in the current version.'
      };
    }
    return { success: false, error: error.message };
  }
}

async function pdfDecrypt(data) {
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
        documentAssembly: data.permissions.documentAssembly
      }
    });

    fs.writeFileSync(data.outputPath, newPdfBytes);

    return { success: true, message: 'Successfully updated PDF permissions' };
  } catch (error) {
    if (error.message.includes('encrypt') || error.message.includes('permission')) {
      return {
        success: false,
        error: 'PDF permissions require pdf-lib with encryption support. This feature may not be available in the current version.'
      };
    }
    return { success: false, error: error.message };
  }
}

function executeOperation(operation, data) {
  switch (operation) {
    case 'merge': return pdfMerge(data);
    case 'split': return pdfSplit(data);
    case 'compress': return pdfCompress(data);
    case 'rotate': return pdfRotate(data);
    case 'delete': return pdfDeletePages(data);
    case 'reorder': return pdfReorder(data);
    case 'watermark': return pdfWatermark(data);
    case 'encrypt': return pdfEncrypt(data);
    case 'decrypt': return pdfDecrypt(data);
    case 'permissions': return pdfSetPermissions(data);
    default: return Promise.resolve({ success: false, error: `Unknown operation: ${operation}` });
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
  executeOperation,
  getPageCount
};
