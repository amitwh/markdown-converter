'use strict';

const fs = require('fs');
const path = require('path');

const MAX_RESULTS = 1000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 10000;
const MAX_QUERY_LENGTH = 1024;
const MAX_REGEX_LENGTH = 200;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.cache']);

// Reject regexes with classic ReDoS shapes. This is a defense-in-depth
// denylist, not a proof of safety — the hard caps on length, files, and
// results are the primary defense.
const UNSAFE_REGEX = new RegExp(
  // nested quantifiers: (a+)+, [a-z]*+
  '\\([^)]*[+*][^)]*\\)[+*?]' +
  '|' +
  // class with quantifier: [a-z]+
  '\\[[^\\]]*\\][+*]' +
  '|' +
  // dot-quantifier followed by dot-quantifier
  '\\.[+*]\\s*\\.[+*]' +
  '|' +
  // lookahead / lookbehind
  '\\(\\?[=!]' +
  '|' +
  // backrefs
  '\\\\[1-9]' +
  '|' +
  // alternation with quantifier
  '\\([^)]*\\|[^)]*\\)[+*]'
);

function listFiles(rootPath) {
  const out = [];
  const stack = [rootPath];
  const visited = new Set();
  while (stack.length && out.length < MAX_FILES) {
    const dir = stack.pop();
    // Resolve symlinks and verify we haven't escaped the root.
    let real;
    try {
      real = fs.realpathSync(dir);
    } catch (_) {
      continue;
    }
    if (visited.has(real)) continue;
    visited.add(real);
    const rootReal = fs.realpathSync(rootPath);
    if (!real.startsWith(rootReal + path.sep) && real !== rootReal) continue;

    let entries;
    try {
      entries = fs.readdirSync(real, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(real, e.name);
      // Follow symlinks but verify containment again.
      try {
        const s = fs.lstatSync(full);
        if (s.isSymbolicLink()) {
          const linkTarget = fs.realpathSync(full);
          if (!linkTarget.startsWith(rootReal + path.sep) && linkTarget !== rootReal) continue;
        }
      } catch (_) {
        continue;
      }
      try {
        const s = fs.statSync(full);
        if (s.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue;
          stack.push(full);
        } else if (s.isFile()) {
          out.push(full);
          if (out.length >= MAX_FILES) break;
        }
      } catch (_) {
        continue;
      }
    }
  }
  return out;
}

function makeMatcher(query, isRegex, caseSensitive) {
  if (isRegex) {
    if (query.length > MAX_REGEX_LENGTH) return null;
    if (UNSAFE_REGEX.test(query)) return null;
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
 * Hardened against:
 * - Path traversal via symlinks (verified after realpathSync)
 * - ReDoS via nested-quantifier regex (rejected at match time)
 * - Resource exhaustion via MAX_FILES + MAX_FILE_BYTES + MAX_RESULTS
 * - Empty / oversized queries via MAX_QUERY_LENGTH
 */
function searchInFiles({ rootPath, query, isRegex = false, caseSensitive = false }) {
  if (!rootPath || !query) return [];
  if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) return [];
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
