/**
 * Workspace dir resolver for the Quick Switcher overlay.
 *
 * Derives a workspace directory from a single file path by returning its
 * parent directory. Auto-detects path separator (Windows backslash vs
 * POSIX forward slash).
 *
 * Returns null when no usable file path is supplied (untitled tab, no
 * active tab) — the renderer then surfaces only recent + open tabs in
 * the Quick Switcher, and the workspace toggle is a no-op.
 *
 * @module workspace-dir-resolver
 */

/**
 * @param {string|null|undefined} filePath
 * @returns {string|null} parent directory, or null if not derivable
 */
function deriveWorkspaceDir(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  // Trim trailing separators (so a path like '/foo/bar/' resolves to '/foo',
  // not '/foo/bar').
  let end = filePath.length;
  while (end > 0 && (filePath[end - 1] === '/' || filePath[end - 1] === '\\')) {
    end--;
  }
  if (end === 0) return null;
  const trimmed = filePath.slice(0, end);
  // Find the last separator of either kind — mixed paths are ambiguous
  // but taking the last one of either kind matches what users mean when
  // they paste a path with mixed separators.
  const lastSlash = trimmed.lastIndexOf('/');
  const lastBack = trimmed.lastIndexOf('\\');
  const lastSep = Math.max(lastSlash, lastBack);
  if (lastSep <= 0) return null;
  return trimmed.slice(0, lastSep);
}

module.exports = { deriveWorkspaceDir };
