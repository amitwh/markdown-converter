'use strict';

const fs = require('fs');
const path = require('path');

/**
 * List a directory's entries (excluding dotfiles), sorted directories-first
 * then alphabetically. Returns a flat array of FileEntry-shaped objects,
 * matching the renderer type declaration in `src/renderer/lib/ipc.ts`.
 *
 * Skips entries that cannot be stat'd (permission errors, broken symlinks)
 * instead of throwing — keeps the UI responsive on partially-readable dirs.
 */
function listDirectoryEntries(dirPath) {
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
  const entries = [];
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    const full = path.join(dirPath, d.name);
    let size = 0;
    let modified = 0;
    try {
      const s = fs.statSync(full);
      size = d.isDirectory() ? 0 : s.size;
      modified = s.mtimeMs;
    } catch (_err) {
      continue;
    }
    entries.push({
      name: d.name,
      isDirectory: d.isDirectory(),
      size,
      modified,
      path: full,
    });
  }
  entries.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

module.exports = { listDirectoryEntries };
