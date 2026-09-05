/**
 * Collaboration plugin — Comments sidebar panel.
 *
 * Lists the inline comments anchored to the current document, lets the user
 * add a comment at the cursor line, jump to a comment's anchor, and
 * resolve/delete entries. Comment persistence flows through the injected IO
 * (IPC-backed file helpers in the app; fakes in tests).
 *
 * @module CommentsPanel
 */

const store = require('./comment-store');

/** Escape text before it enters any innerHTML template. */
function esc(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the comments panel.
 *
 * @param {HTMLElement} container Sidebar panel content element
 * @param {object} deps
 * @param {object} deps.editor Plugin editor API (getCurrentFilePath,
 *     getCurrentLine, jumpToLine, getContent)
 * @param {object} deps.io { readFile, writeFile, fileExists, ensureDirectory }
 * @param {Function} deps.pathUtil injected path module
 * @param {string} [deps.author='me'] Display name for new comments
 */
function renderCommentsPanel(container, deps) {
  container.replaceChildren();
  const { editor, io, pathUtil } = deps;
  const docPath = editor.getCurrentFilePath();

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  // --- Header ---------------------------------------------------------------
  const header = document.createElement('div');
  header.className = 'ws-section';
  const heading = document.createElement('h3');
  heading.className = 'ws-heading';
  heading.textContent = docPath ? 'Inline Comments' : 'No document open';
  header.appendChild(heading);

  if (docPath) {
    const hint = document.createElement('p');
    hint.className = 'ws-muted';
    hint.textContent =
      'Comments are stored in .comments/ next to the file and never exported. F8 jumps to the next open comment.';
    header.appendChild(hint);
  }
  panel.appendChild(header);

  if (!docPath) {
    const note = document.createElement('p');
    note.className = 'ws-muted';
    note.textContent = 'Open a saved document to annotate it.';
    panel.appendChild(note);
    container.appendChild(panel);
    return;
  }

  // --- Composer -------------------------------------------------------------
  const composer = document.createElement('div');
  composer.className = 'ws-section';
  const textarea = document.createElement('textarea');
  textarea.rows = 2;
  textarea.placeholder = 'Comment on the current line…';
  const addBtn = document.createElement('button');
  addBtn.className = 'ws-btn ws-btn-primary';
  addBtn.textContent = 'Comment on line ' + editor.getCurrentLine();
  addBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    const line = editor.getCurrentLine();
    const anchorText = (getLines(editor)[line - 1] || '').trim();
    const comments = store.loadComments(docPath, io, pathUtil);
    store.addComment(comments, { line, anchorText, author: deps.author || 'me', text });
    store.saveComments(docPath, comments, io, pathUtil);
    renderCommentsPanel(container, deps); // re-render with fresh list
  });
  composer.appendChild(textarea);
  composer.appendChild(addBtn);
  panel.appendChild(composer);

  // --- List -----------------------------------------------------------------
  const comments = store.loadComments(docPath, io, pathUtil);
  const lines = getLines(editor);

  const list = document.createElement('div');
  list.className = 'ws-issues-list';
  if (comments.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ws-muted';
    empty.textContent = 'No comments yet.';
    list.appendChild(empty);
  }
  for (const comment of comments) {
    const status = store.anchorStatus(comment, lines);
    const item = document.createElement('div');
    item.className = 'ws-issue-item' + (comment.resolved ? ' comment-resolved' : '');
    const date = new Date(comment.createdAt).toLocaleString();
    item.innerHTML = `
      <div class="ws-issue-type">
        <span data-role="meta">L${comment.line} · ${esc(comment.author)} · ${esc(date)}
          ${status !== 'ok' ? '· ' + (status === 'changed' ? 'text changed' : status === 'moved' ? 'moved' : 'gone') : ''}
        </span>
      </div>
      <div class="ws-issue-text">${esc(comment.text)}</div>
      ${comment.anchorText ? `<div class="ws-muted">> ${esc(comment.anchorText)}</div>` : ''}
      <div class="ws-issue-actions">
        <button class="ws-btn ws-btn-sm" data-action="jump">Go to line</button>
        <button class="ws-btn ws-btn-sm" data-action="resolve">${comment.resolved ? 'Reopen' : 'Resolve'}</button>
        <button class="ws-btn ws-btn-sm" data-action="delete">Delete</button>
      </div>`;

    item.querySelector('[data-action="jump"]').addEventListener('click', () => {
      editor.jumpToLine(comment.line);
    });
    item.querySelector('[data-action="resolve"]').addEventListener('click', () => {
      const updated = store.loadComments(docPath, io, pathUtil);
      store.toggleResolved(updated, comment.id);
      store.saveComments(docPath, updated, io, pathUtil);
      renderCommentsPanel(container, deps);
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const updated = store.loadComments(docPath, io, pathUtil);
      store.deleteComment(updated, comment.id);
      store.saveComments(docPath, updated, io, pathUtil);
      renderCommentsPanel(container, deps);
    });
    list.appendChild(item);
  }
  panel.appendChild(list);

  container.appendChild(panel);
}

/** Split the live document content into lines (1-based indexing helper). */
function getLines(editor) {
  return String(editor.getContent() || '').split('\n');
}

module.exports = { renderCommentsPanel };
