/**
 * Image Operations Module
 *
 * Handles image manipulation via `sharp`: format conversion, resize, compress, rotate.
 * Mirrors the executeOperation(operation, data) dispatcher pattern used by PDFOperations.js.
 *
 * sharp loads LAZILY: its native bindings (@img/sharp-*) are optionalDependencies
 * that a packaged build can prune or fail to unpack, and a top-level require would
 * then crash the whole app at boot (src/main.js requires this module unconditionally).
 * When sharp cannot load, operations degrade honestly instead of killing the app —
 * the same honest-failure precedent PDFOperations set for missing pdf-lib features.
 *
 * @module ImageOperations
 */

const fs = require('fs');
const path = require('path');

let sharpModule = null;
let sharpLoadError = null;

function loadSharp() {
  if (sharpModule) return sharpModule;
  if (sharpLoadError) throw sharpLoadError;
  try {
    sharpModule = require('sharp');
    return sharpModule;
  } catch (error) {
    sharpLoadError = error;
    throw error;
  }
}

// Strip absolute paths from error text before it reaches callers, mirroring
// sanitizeErrorMessage() in main.js (that helper is not importable from here).
function sanitizeMessage(message) {
  if (typeof message !== 'string') return String(message);
  return message
    .replace(/[A-Z]:\\[^\s"']+\\([^\s"'\\]+)/gi, '$1')
    .replace(/\/[^\s"']+\/([^\s"'/]+)/g, '$1');
}

// Must match the MAX_FILE_SIZE convention defined in main.js (50MB). main.js is the
// single source of truth for this limit; this module does not redefine it independently
// — callers (main.js) pass it in via data.maxFileSize when they want it enforced, and we
// fall back to the same 50MB default so direct/unit-test callers are still protected.
const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024;

const RASTER_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];
const RESIZE_FIT_MODES = ['cover', 'contain', 'fill', 'inside', 'outside'];

function validateInput(data) {
  const { inputPath, outputPath, maxFileSize } = data || {};

  if (!inputPath || !outputPath) {
    throw new Error('inputPath and outputPath are required');
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${path.basename(inputPath)}`);
  }

  const limit = typeof maxFileSize === 'number' ? maxFileSize : DEFAULT_MAX_FILE_SIZE;
  const stats = fs.statSync(inputPath);
  if (stats.size > limit) {
    throw new Error(`File exceeds the ${Math.floor(limit / (1024 * 1024))}MB size limit.`);
  }
}

async function imageConvert(data) {
  try {
    const sharp = loadSharp();
    validateInput(data);
    const { inputPath, outputPath, format } = data;

    if (!RASTER_FORMATS.includes(format)) {
      throw new Error(`Unsupported output format: ${format}`);
    }

    await sharp(inputPath).toFormat(format).toFile(outputPath);

    return { success: true, outputPath };
  } catch (error) {
    throw new Error(`Image conversion failed: ${error.message}`);
  }
}

async function imageResize(data) {
  try {
    const sharp = loadSharp();
    validateInput(data);
    const { inputPath, outputPath, width = null, height = null, fit = 'inside' } = data;

    if (width === null && height === null) {
      throw new Error('At least one of width or height must be provided');
    }

    if (!RESIZE_FIT_MODES.includes(fit)) {
      throw new Error(`Unsupported fit mode: ${fit}`);
    }

    await sharp(inputPath).resize({ width, height, fit }).toFile(outputPath);

    return { success: true, outputPath };
  } catch (error) {
    throw new Error(`Image resize failed: ${error.message}`);
  }
}

async function imageCompress(data) {
  try {
    const sharp = loadSharp();
    validateInput(data);
    const { inputPath, outputPath, quality = 80 } = data;

    if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
      throw new Error('quality must be an integer between 1 and 100');
    }

    const ext = path.extname(outputPath).toLowerCase().replace('.', '');
    let pipeline = sharp(inputPath);

    switch (ext) {
      case 'jpg':
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality });
        break;
      case 'webp':
        pipeline = pipeline.webp({ quality });
        break;
      case 'avif':
        pipeline = pipeline.avif({ quality });
        break;
      case 'png':
        pipeline = pipeline.png({ quality, compressionLevel: 9 });
        break;
      default:
        throw new Error(`Unsupported compression output format: ${ext}`);
    }

    await pipeline.toFile(outputPath);

    return { success: true, outputPath };
  } catch (error) {
    throw new Error(`Image compression failed: ${error.message}`);
  }
}

async function imageRotate(data) {
  try {
    const sharp = loadSharp();
    validateInput(data);
    const { inputPath, outputPath, angle } = data;

    if (typeof angle !== 'number' || !Number.isFinite(angle)) {
      throw new Error('angle must be a number');
    }

    await sharp(inputPath).rotate(angle).toFile(outputPath);

    return { success: true, outputPath };
  } catch (error) {
    throw new Error(`Image rotation failed: ${error.message}`);
  }
}

function executeOperation(operation, data) {
  try {
    loadSharp();
  } catch (error) {
    // Honest degradation: the app keeps booting and every image op reports the
    // unavailable state as a resolved result instead of throwing at import time.
    return Promise.resolve({
      success: false,
      error: `Image operations unavailable: ${sanitizeMessage(error.message)}`,
    });
  }
  switch (operation) {
    case 'convert':
      return imageConvert(data);
    case 'resize':
      return imageResize(data);
    case 'compress':
      return imageCompress(data);
    case 'rotate':
      return imageRotate(data);
    default:
      return Promise.reject(new Error(`Unknown operation: ${operation}`));
  }
}

module.exports = {
  executeOperation,
  imageConvert,
  imageResize,
  imageCompress,
  imageRotate,
};
