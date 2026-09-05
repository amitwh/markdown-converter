/**
 * Wiki-link ([[target]] / [[target|alias]] / [[target#heading]]) support.
 *
 * Markdown has no spec for wiki-links; marked renders the bracket text
 * literally, so this module post-processes rendered HTML and turns wiki-link
 * text into anchor elements. Code blocks and inline code are skipped so
 * documentation *about* wiki-links doesn't become live links.
 *
 * Pure string processing — no DOM, no IO — so it is directly testable.
 *
 * @module WikiLinks
 */

/**
 * Matches [[target]], [[target|alias]], [[target#section]] and
 * [[target#section|alias]]. Group 1 = target, group 2 = optional alias.
 * Brackets are not allowed inside (that would be nested links).
 */
const WIKI_LINK_REGEX = /\[\[([^\]#|]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g;

/**
 * Replace wiki-link text with anchors in a rendered-HTML string, skipping
 * <pre>/<code> segments.
 *
 * @param {string} html Rendered markdown HTML
 * @returns {string} HTML with <a class="wiki-link" data-wiki-target="...">…
 */
function renderWikiLinksInHtml(html) {
  if (typeof html !== 'string' || html.indexOf('[[') === -1) return html;

  // Split into code/non-code segments so replacements only happen in prose
  const segments = html.split(/(<pre\b[\s\S]*?<\/pre>|<code\b[\s\S]*?<\/code>)/i);
  return segments
    .map((segment, index) => {
      // Odd indices are the captured code blocks (never transformed)
      if (index % 2 === 1) return segment;
      return segment.replace(WIKI_LINK_REGEX, (_match, target, alias) => {
        const clean = String(target).trim();
        if (!clean) return _match;
        const label = alias ? String(alias).trim() : clean;
        return `<a href="#" class="wiki-link" data-wiki-target="${escapeAttr(clean)}">${escapeHtml(label)}</a>`;
      });
    })
    .join('');
}

/**
 * Resolve a wiki target to a markdown file path next to the current document.
 * "Note" → <dir>/Note.md; "Note.md" stays as-is; "./sub/Note" resolves
 * relative to dir. Returns null for empty/unsafe targets (absolute paths
 * and traversal outside the vault would be surprising at best).
 *
 * @param {string} target Wiki target (already trimmed)
 * @param {string} currentDir Directory of the current document
 * @param {Function} pathUtil injected path module
 * @returns {string|null}
 */
function resolveTargetPath(target, currentDir, pathUtil) {
  if (!target || !currentDir) return null;
  const clean = String(target).trim();
  if (!clean || clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return null;
  if (clean.includes('..')) return null;

  const withExt = /\.(md|markdown)$/i.test(clean) ? clean : `${clean}.md`;
  return pathUtil.join(currentDir, withExt);
}

/** Escape text for HTML content. */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape text for a double-quoted attribute value. */
function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

/**
 * The document-name key used for backlink matching: basename without
 * extension, e.g. "/docs/My Note.md" → "My Note".
 */
function docNameFor(docPath, pathUtil) {
  if (!docPath) return null;
  const base = pathUtil.basename(docPath);
  return base.replace(/\.(md|markdown)$/i, '');
}

module.exports = {
  WIKI_LINK_REGEX,
  renderWikiLinksInHtml,
  resolveTargetPath,
  docNameFor,
};
