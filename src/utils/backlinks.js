/**
 * Backlink scanning for the local knowledge-base (wiki-link) feature.
 *
 * "Which documents link to the one I'm editing?" — answered with a bounded
 * breadth-first walk of the current folder collecting markdown files, then a
 * content scan for `[[docName]]` references. Bounds (depth, file count,
 * file size) keep a pathological folder tree from stalling the renderer.
 *
 * All IO is injected (listDir + readFile), mirroring the adapter style of the
 * rest of src/utils, so tests run against fakes.
 *
 * @module Backlinks
 */

const MAX_DEPTH = 3;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 1024 * 1024; // skip files larger than 1MB in scans

/**
 * Collect markdown file paths under rootDir (bounded BFS).
 *
 * @param {string} rootDir Folder to scan (usually the current document's dir)
 * @param {Function} listDir async (dir) => { entries: [{name, isDirectory, path}] } | null
 * @param {{maxDepth?: number, maxFiles?: number}} [limits]
 * @returns {Promise<string[]>} markdown file paths (not including hidden dirs)
 */
async function collectMarkdownFiles(rootDir, listDir, limits = {}) {
  const maxDepth = limits.maxDepth ?? MAX_DEPTH;
  const maxFiles = limits.maxFiles ?? MAX_FILES;
  const results = [];
  const queue = [{ dir: rootDir, depth: 0 }];

  while (queue.length > 0 && results.length < maxFiles) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;
    let listing;
    try {
      listing = await listDir(dir);
    } catch {
      continue; // unreadable folder: skip, don't fail the whole scan
    }
    if (!listing || !Array.isArray(listing.entries)) continue;

    for (const entry of listing.entries) {
      if (results.length >= maxFiles) break;
      if (entry.isDirectory) {
        // Never descend into hidden/vendor folders (.git, node_modules, …)
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          queue.push({ dir: entry.path, depth: depth + 1 });
        }
      } else if (/\.(md|markdown)$/i.test(entry.name)) {
        results.push(entry.path);
      }
    }
  }
  return results;
}

/**
 * Build the set of wiki targets a document's raw markdown references.
 * @returns {string[]} trimmed targets ([[target|alias]] → target)
 */
function extractOutgoingLinks(markdown) {
  const regex = /\[\[([^\]#|]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g;
  const targets = new Set();
  let match;
  while ((match = regex.exec(String(markdown || ''))) !== null) {
    const target = match[1].trim();
    if (target) targets.add(target);
  }
  return [...targets];
}

/**
 * Find documents that link to `docName`.
 *
 * @param {object} args
 * @param {string} args.docName Current document name without extension
 * @param {string} [args.docPath] Full path of the current doc (excluded from results)
 * @param {string[]} args.files Candidate markdown paths
 * @param {Function} args.readFile async (path) => string|null
 * @returns {Promise<Array<{path:string, line:number, context:string}>>}
 */
async function findBacklinks({ docName, docPath, files, readFile }) {
  if (!docName) return [];
  const wanted = docName.toLowerCase();
  const backlinks = [];

  for (const file of files) {
    if (docPath && file === docPath) continue;
    let content;
    try {
      content = await readFile(file);
    } catch {
      continue;
    }
    if (typeof content !== 'string' || content.length > MAX_FILE_BYTES) continue;

    // A backlink mentions [[docName]] or [[docName#heading]] or [[docName.md]]
    const regex = new RegExp(
      `\\[\\[\\s*${escapeRegex(wanted)}(?:\\.md)?(?:#[^\\]|]*)?\\s*(?:\\|[^\\]]+)?\\]\\]`,
      'i'
    );
    if (!regex.test(content)) continue;

    // Collect matching lines (capped) for context display
    const lines = content.split('\n');
    let hits = 0;
    for (let i = 0; i < lines.length && hits < 3; i++) {
      if (regex.test(lines[i])) {
        backlinks.push({
          path: file,
          line: i + 1,
          context: lines[i].trim().slice(0, 120),
        });
        hits++;
      }
    }
  }
  return backlinks;
}

/** Escape a literal string for embedding in a RegExp. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  collectMarkdownFiles,
  extractOutgoingLinks,
  findBacklinks,
  MAX_DEPTH,
  MAX_FILES,
  MAX_FILE_BYTES,
};
