/**
 * File-input path resolution for Electron 41.
 *
 * `File.path` was removed in Electron 32, so a plain `<input type="file">`
 * picker can no longer read the chosen file's absolute path directly. The
 * replacement is `webUtils.getPathForFile(file)`, exposed to renderers as
 * `window.electronAPI.getFilePath` (by src/preload.js in preload-loaded
 * windows, and by the fallback shim in src/renderer.js for the main window,
 * which does not load the preload script).
 *
 * @module utils/file-path
 */

/**
 * Resolve a File object chosen via `<input type="file">` to its absolute path.
 * Falls back to `file.path` when the electronAPI helper is absent
 * (Electron < 32, or jsdom tests without the bridge).
 *
 * @param {File} file - File object from a file input's files list
 * @returns {string | undefined} Absolute filesystem path when resolvable
 */
function getFilePath(file) {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  if (api && typeof api.getFilePath === 'function') {
    return api.getFilePath(file);
  }
  return file && file.path;
}

module.exports = { getFilePath };
