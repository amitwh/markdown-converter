/**
 * Workspace file lister for the quick-switcher.
 *
 * Walks a directory tree and returns every entry whose extension matches a
 * configurable allowlist. Skips:
 *   - hidden directories (leading '.')
 *   - `node_modules` and other known non-content dirs (dist, build, .next, …)
 *
 * The walk is injectable so tests use real fs via `mkdtempSync`. A cap
 * (`maxResults`) prevents pathological workspaces (50k+ files) from
 * blowing the IPC payload or the renderer's filter loop.
 *
 * @module workspace-file-lister
 */

const path = require('path');

const DEFAULT_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt'];
const DEFAULT_MAX_RESULTS = 2000;

// Known large/output directories that shouldn't appear in a file picker
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.cache',
  '.parcel-cache',
  '.turbo',
  'coverage',
  '__snapshots__',
]);

function isHiddenDir(name) {
  return name.startsWith('.');
}

function isSkippedDir(name) {
  return isHiddenDir(name) || SKIP_DIRS.has(name);
}

/**
 * @param {string} dir - Workspace root (absolute path)
 * @param {object} [options]
 * @param {string[]} [options.extensions] - Extensions to match (with leading dot)
 * @param {number} [options.maxResults] - Hard cap on results
 * @param {object} [options.io] - Injectable IO `{ fs, pathUtil }`. Defaults
 *   to the real `node:fs` and `node:path`.
 * @returns {Array<{path:string, name:string}>}
 */
function listWorkspaceFiles(dir, options = {}) {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new Error('listWorkspaceFiles: dir must be a non-empty string');
  }
  const {
    extensions = DEFAULT_EXTENSIONS,
    maxResults = DEFAULT_MAX_RESULTS,
    io = { fs: require('fs'), pathUtil: path },
  } = options;

  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error('listWorkspaceFiles: extensions must be a non-empty array');
  }
  if (typeof maxResults !== 'number' || maxResults <= 0) {
    throw new Error('listWorkspaceFiles: maxResults must be a positive number');
  }

  const normalizedExts = new Set(extensions.map((e) => String(e).toLowerCase()));
  const results = [];

  walk(dir, normalizedExts, results, maxResults, io.fs, io.pathUtil);
  return results;
}

function walk(currentDir, exts, results, maxResults, fs, pathUtil) {
  if (results.length >= maxResults) return;
  let entries;
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch (err) {
    // Permission denied / ENOENT at a subdir shouldn't kill the walk.
    // Real failures propagate when the root itself is unreadable — main
    // process callers treat that as an empty result.
    if (err && (err.code === 'EACCES' || err.code === 'ENOENT')) return;
    throw err;
  }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (entry.isDirectory()) {
      if (isSkippedDir(entry.name)) continue;
      walk(pathUtil.join(currentDir, entry.name), exts, results, maxResults, fs, pathUtil);
    } else if (entry.isFile()) {
      const ext = pathUtil.extname(entry.name).toLowerCase();
      if (exts.has(ext)) {
        results.push({
          path: pathUtil.join(currentDir, entry.name),
          name: entry.name,
        });
      }
    }
  }
}

module.exports = {
  listWorkspaceFiles,
  DEFAULT_EXTENSIONS,
  DEFAULT_MAX_RESULTS,
  SKIP_DIRS,
};
