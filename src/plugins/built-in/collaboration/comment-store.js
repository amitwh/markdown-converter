/**
 * Comment store for the Collaboration plugin.
 *
 * Inline document comments live in a sidecar folder (`.comments/`) next to the
 * document they annotate, one JSON file per document (`<name>.json`), matching
 * the v5 collaboration design. Keeping comments out of the document itself
 * means they never ship in exports or leak into Git commits of the prose.
 *
 * A comment anchors to a line number plus the anchor line's text snippet; the
 * snippet lets the UI detect drift ("line moved / text changed") after edits
 * without storing full document positions.
 *
 * All IO is injected, so the module is unit-testable and works from both the
 * renderer (via IPC file helpers) and tests (via in-memory fakes).
 *
 * @module CommentStore
 */

const COMMENT_FOLDER = '.comments';

/**
 * Path of the sidecar comments file for a document path.
 * Pure string surgery — no IO, easy to test.
 *
 * @param {string} docPath Absolute path to the markdown document
 * @param {Function} pathUtil path module (or equivalent) — injected for tests
 * @returns {string} e.g. /docs/.comments/notes.md.json
 */
function commentsFilePathFor(docPath, pathUtil) {
  const p = pathUtil;
  return p.join(p.dirname(docPath), COMMENT_FOLDER, p.basename(docPath) + '.json');
}

/**
 * Generate a reasonably unique comment id without external deps.
 */
function newCommentId(now = Date.now()) {
  return 'c' + now.toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Load all comments for a document. Missing file/corrupt JSON → [] (a fresh
 * document simply has no comments yet; a corrupt store must not crash the app).
 *
 * @param {string} docPath Document path
 * @param {object} io - { readFile: (path) => string|null, fileExists: (path) => bool }
 * @param {Function} pathUtil injected path module
 * @returns {Array<object>} comments sorted by line then createdAt
 */
function loadComments(docPath, io, pathUtil) {
  if (!docPath) return [];
  const file = commentsFilePathFor(docPath, pathUtil);
  try {
    if (!io.fileExists(file)) return [];
    const raw = io.readFile(file);
    const data = JSON.parse(raw);
    if (!Array.isArray(data.comments)) return [];
    return normalizeComments(data.comments);
  } catch {
    return [];
  }
}

/**
 * Persist comments for a document (creates the sidecar structure on demand).
 *
 * @param {string} docPath Document path
 * @param {Array<object>} comments
 * @param {object} io - { writeFile, ensureDirectory }
 * @param {Function} pathUtil injected path module
 */
function saveComments(docPath, comments, io, pathUtil) {
  const file = commentsFilePathFor(docPath, pathUtil);
  io.ensureDirectory(pathUtil.dirname(file));
  io.writeFile(
    file,
    JSON.stringify({ version: 1, doc: pathUtil.basename(docPath), comments }, null, 2)
  );
}

/** Coerce/validate raw entries into the canonical comment shape. */
function normalizeComments(raw) {
  return raw
    .filter((c) => c && typeof c === 'object' && typeof c.line === 'number')
    .map((c) => ({
      id: typeof c.id === 'string' ? c.id : newCommentId(),
      line: Math.max(1, Math.floor(c.line)),
      anchorText: typeof c.anchorText === 'string' ? c.anchorText : '',
      author: typeof c.author === 'string' ? c.author : 'anonymous',
      text: typeof c.text === 'string' ? c.text : '',
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
      resolved: c.resolved === true,
    }))
    .sort((a, b) => a.line - b.line || a.createdAt - b.createdAt);
}

/**
 * Add a comment anchored to a document line.
 *
 * @param {Array<object>} comments Existing list (mutated copy returned)
 * @param {{line:number, anchorText?:string, author?:string, text:string}} input
 * @returns {object} the created comment
 */
function addComment(comments, input) {
  const comment = {
    id: newCommentId(),
    line: Math.max(1, Math.floor(input.line || 1)),
    anchorText: String(input.anchorText || '').slice(0, 200),
    author: String(input.author || 'me'),
    text: String(input.text || '').slice(0, 4000),
    createdAt: Date.now(),
    resolved: false,
  };
  comments.push(comment);
  return comment;
}

/**
 * Toggle a comment's resolved flag by id.
 * @returns {boolean} new resolved state, or null when the id is unknown
 */
function toggleResolved(comments, id) {
  const comment = comments.find((c) => c.id === id);
  if (!comment) return null;
  comment.resolved = !comment.resolved;
  return comment.resolved;
}

/**
 * Remove a comment by id. @returns {boolean} whether anything was removed.
 */
function deleteComment(comments, id) {
  const index = comments.findIndex((c) => c.id === id);
  if (index === -1) return false;
  comments.splice(index, 1);
  return true;
}

/**
 * Find the next unresolved comment for F8-style navigation (wraps around).
 * "Next" is relative to the given line: the first unresolved comment on a
 * line > fromLine, wrapping to the top when none exist below.
 *
 * @returns {object|null} the comment to jump to, or null when none are open
 */
function nextUnresolved(comments, fromLine) {
  const open = comments.filter((c) => !c.resolved);
  if (open.length === 0) return null;
  return open.find((c) => c.line > fromLine) || open[0];
}

/**
 * Drift check for one comment against the live document lines.
 * @returns {'ok'|'moved'|'changed'|'missing'} anchor status
 */
function anchorStatus(comment, lines) {
  if (!Array.isArray(lines) || lines.length === 0) return 'missing';
  if (comment.line > lines.length) return 'missing';
  const currentText = lines[comment.line - 1].trim();
  if (!comment.anchorText) return 'moved';
  return currentText === comment.anchorText.trim() ? 'ok' : 'changed';
}

module.exports = {
  COMMENT_FOLDER,
  commentsFilePathFor,
  loadComments,
  saveComments,
  addComment,
  toggleResolved,
  deleteComment,
  nextUnresolved,
  anchorStatus,
  newCommentId,
  normalizeComments,
};
