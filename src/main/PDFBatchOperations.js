/**
 * PDFBatchOperations
 *
 * Applies one PDFOperations.executeOperation() operation (watermark, compress,
 * rotate, split, ...) to every .pdf file in an input folder — the PDF sibling of
 * runMediaBatchOperation() in main.js (Task 12's image/audio/video batch mode):
 * collect matching files via collectFilesByExtension (which generalizes the
 * inline collectFiles() of the 'universal-convert-batch' handler), loop the
 * operation over them, and report per-file progress plus a final
 * completed/failed summary.
 *
 * Pulled out as its own Electron-free module (same precedent as
 * collectFilesByExtension) so the batch loop is unit-testable against real
 * pdf-lib fixtures; main.js injects the IPC-facing callbacks:
 *   onProgress -> mainWindow.webContents.send('batch-progress', ...)
 *   onComplete -> mainWindow.webContents.send('pdf-batch-complete', ...) + dialog
 *
 * Not every executeOperation op fits the "apply the same operation to every
 * file" batch model. Excluded (enforced by absence from PDF_BATCH_OUTPUT_SPEC,
 * which doubles as the defensive backstop for renderer-supplied op names):
 *   - merge / reorder / fillForm — consume per-file knowledge the batch flow
 *     cannot supply (merge takes many inputs in one op; reorder needs each
 *     file's full page order; fillForm's field values differ per file).
 *   - formFields — a read-only query returning data, not a transform.
 *   - encrypt / decrypt / permissions — pdf-lib 1.17.1 (bundled) lacks
 *     encryption support, so since Task 27 these ops fail honestly with an
 *     "unavailable" result instead of silently writing unprotected files;
 *     a batch run would deterministically fail every file.
 *
 * @module PDFBatchOperations
 */

const fs = require('fs');
const path = require('path');
const PDFOperations = require('./PDFOperations');
const { collectFilesByExtension } = require('./collectFilesByExtension');

// How to derive each output file's path (or directory) from the source file,
// mirroring BATCH_OUTPUT_SPEC in main.js:
//   { ext: 'original' } -> <outputFolder>/<relativeDir>/<baseName>.pdf via outputPath
//   { ext: 'txt' }      -> <outputFolder>/<relativeDir>/<baseName>.txt via outputPath
//   { folder: true }    -> split writes its `<baseName>_part_N.pdf` files into
//                          the mirrored output folder via outputFolder
//   { dir: true }       -> extractImages writes images into a per-PDF
//                          <outputFolder>/<relativeDir>/<baseName>/ via outputDir
const PDF_BATCH_OUTPUT_SPEC = {
  split: { folder: true },
  compress: { ext: 'original' },
  rotate: { ext: 'original' },
  delete: { ext: 'original' },
  watermark: { ext: 'original' },
  extractText: { ext: 'txt' },
  pageNumbers: { ext: 'original' },
  crop: { ext: 'original' },
  extractImages: { dir: true },
};

/**
 * Runs a single PDFOperations operation over every .pdf under `inputFolder`.
 *
 * @param {object} args
 * @param {string} args.operation - executeOperation op name (must be batchable).
 * @param {string} args.inputFolder - Folder to scan for .pdf files.
 * @param {string} args.outputFolder - Destination folder (created if missing);
 *   the input folder's relative structure is mirrored beneath it.
 * @param {boolean} [args.includeSubfolders=true] - Recurse into subdirectories.
 * @param {object} [args.data={}] - Shared operation options forwarded to
 *   executeOperation for every file (same option shapes as the single-file PDF
 *   editor dialog; inputPath/outputPath are added per file here).
 * @param {number} [args.maxFileSize] - Skip (count as failed) files larger than
 *   this many bytes, mirroring the batch-convert handler's file-size guard.
 * @param {Function} [args.onProgress] - Called with { completed, failed, total,
 *   currentFile } before each file and once (currentFile: null) at the end —
 *   the existing 'batch-progress' payload shape.
 * @param {Function} args.onComplete - Called exactly once with the outcome:
 *   { success: false, error } for early failures, otherwise
 *   { success: true, completed, failed, total, outputFolder }.
 * @param {Function} [args.sanitizeError] - Sanitizer for error messages that
 *   could leak absolute paths (main.js passes sanitizeErrorMessage).
 * @returns {Promise<void>}
 */
async function runPDFBatchOperation({
  operation,
  inputFolder,
  outputFolder,
  includeSubfolders,
  data = {},
  maxFileSize,
  onProgress = () => {},
  onComplete,
  sanitizeError = (message) => message,
}) {
  const spec = PDF_BATCH_OUTPUT_SPEC[operation];
  if (!spec) {
    onComplete({
      success: false,
      error: `Batch mode is not supported for the "${operation}" operation.`,
    });
    return;
  }

  if (!inputFolder || !fs.existsSync(inputFolder)) {
    onComplete({ success: false, error: 'Input folder does not exist.' });
    return;
  }

  try {
    fs.mkdirSync(outputFolder, { recursive: true });
  } catch (error) {
    onComplete({
      success: false,
      error: sanitizeError(`Failed to create output folder: ${error.message}`),
    });
    return;
  }

  const files = collectFilesByExtension(inputFolder, ['.pdf'], includeSubfolders !== false);
  if (files.length === 0) {
    onComplete({ success: false, error: 'No matching files found in the selected folder.' });
    return;
  }

  const total = files.length;
  let completed = 0;
  let failed = 0;

  for (const filePath of files) {
    onProgress({
      completed,
      failed,
      total,
      currentFile: path.basename(filePath),
    });

    try {
      if (maxFileSize && fs.statSync(filePath).size > maxFileSize) {
        failed++;
        continue;
      }

      const baseName = path.basename(filePath, path.extname(filePath));
      const relativeDir = path.dirname(path.relative(inputFolder, filePath));
      const targetDir = relativeDir === '.' ? outputFolder : path.join(outputFolder, relativeDir);
      fs.mkdirSync(targetDir, { recursive: true });

      const fileData = { ...data, inputPath: filePath };
      if (spec.dir) {
        fileData.outputDir = path.join(targetDir, baseName);
      } else if (spec.folder) {
        fileData.outputFolder = targetDir;
      } else {
        const ext = spec.ext === 'original' ? 'pdf' : spec.ext;
        fileData.outputPath = path.join(targetDir, `${baseName}.${ext}`);
      }

      // PDFOperations ops report failures via { success: false } rather than by
      // throwing (each op catches internally), so the result flag — not just
      // the promise — decides the per-file outcome.
      const result = await PDFOperations.executeOperation(operation, fileData);
      if (result && result.success) {
        completed++;
      } else {
        failed++;
      }
    } catch {
      // stat/mkdir can throw (file vanished mid-scan, output path became a
      // file, ...): count the file as failed and keep the batch going, matching
      // how executeOperation's own failures are handled.
      failed++;
    }
  }

  onProgress({ completed, failed, total, currentFile: null });
  onComplete({ success: true, completed, failed, total, outputFolder });
}

module.exports = { runPDFBatchOperation, PDF_BATCH_OUTPUT_SPEC };
