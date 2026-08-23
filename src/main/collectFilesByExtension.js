/**
 * collectFilesByExtension
 *
 * Recursively (optionally) collects files under a directory whose extension matches
 * one of a given set of extensions. Generalizes the `collectFiles()` closure defined
 * inside `ipcMain.on('universal-convert-batch', ...)` in main.js (which matches a
 * single `.${fromFormat}` extension) to match against an arbitrary extension list —
 * used by the batch-image/audio/video-operation handlers, which need to match several
 * possible input extensions per media kind (e.g. .jpg/.jpeg/.png/... for images).
 *
 * Pulled out as its own module (rather than an inline closure like the original) so it
 * can be unit tested without Electron.
 *
 * @module collectFilesByExtension
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {string} dir - Directory to scan.
 * @param {string[]} extensions - Extensions to match, each including the leading dot
 *   (e.g. ['.jpg', '.png']). Matching is case-insensitive.
 * @param {boolean} [includeSubfolders=true] - Recurse into subdirectories.
 * @returns {string[]} Absolute paths of matching files, in directory-walk order.
 */
function collectFilesByExtension(dir, extensions, includeSubfolders = true) {
  const normalizedExts = (extensions || []).map((ext) => ext.toLowerCase());
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (includeSubfolders) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (normalizedExts.includes(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return results;
}

module.exports = { collectFilesByExtension };
