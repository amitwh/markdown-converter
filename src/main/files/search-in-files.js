'use strict';

const fs = require('fs');
const path = require('path');

const MAX_RESULTS = 1000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.cache']);

function listFiles(rootPath) {
  const out = [];
  const stack = [rootPath];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

function makeMatcher(query, isRegex, caseSensitive) {
  if (isRegex) {
    try {
      const re = new RegExp(query, caseSensitive ? '' : 'i');
      return (line) => re.test(line);
    } catch (_err) {
      return null;
    }
  }
  const needle = caseSensitive ? query : query.toLowerCase();
  return (line) => (caseSensitive ? line : line.toLowerCase()).includes(needle);
}

/**
 * Recursively search `rootPath` for files containing `query`.
 * Returns up to MAX_RESULTS matches of the form
 *   { filePath, line, content }.
 *
 * Skips binary files (> MAX_FILE_BYTES) and noisy directories
 * (node_modules, .git, dist, .next, .cache) to keep latency low.
 */
function searchInFiles({ rootPath, query, isRegex = false, caseSensitive = false }) {
  if (!rootPath || !query) return [];
  const matcher = makeMatcher(query, isRegex, caseSensitive);
  if (!matcher) return [];

  const results = [];
  for (const filePath of listFiles(rootPath)) {
    if (results.length >= MAX_RESULTS) break;
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (_) {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (_) {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (matcher(lines[i])) {
        results.push({ filePath, line: i + 1, content: lines[i] });
        if (results.length >= MAX_RESULTS) break;
      }
    }
  }
  return results;
}

module.exports = { searchInFiles };
