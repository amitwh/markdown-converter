/**
 * History sidebar panel — local version history for the current document.
 *
 * Lists snapshots captured automatically before every save (plus manual ones),
 * and offers Restore (replace editor content), Diff (side-by-side line diff
 * against the current editor content, reusing utils/line-diff), and Delete.
 *
 * @module HistoryPanel
 */

const { computeLineDiff } = require('../utils/line-diff');

/** Escape text before it enters innerHTML templates. */
function esc(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "3 min ago"-style relative time for version labels. */
function timeAgo(ts) {
  const seconds = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Render the history panel.
 *
 * @param {HTMLElement} container Sidebar panel content element
 * @param {object} deps
 * @param {() => string|null} deps.getCurrentFilePath Active tab's file path
 * @param {() => string} deps.getCurrentContent Live editor content
 * @param {(content: string) => void} deps.replaceContent Swap the editor's document
 * @param {object} deps.history IPC-backed VersionHistory api:
 *   { list(docPath), read(docPath, id), save(docPath, content, label), delete(docPath, id) }
 */
async function renderHistoryPanel(container, deps) {
  container.replaceChildren();
  const { getCurrentFilePath, getCurrentContent, replaceContent, history } = deps;

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  const heading = document.createElement('h3');
  heading.className = 'ws-heading';
  heading.textContent = 'Version History';
  panel.appendChild(heading);

  const docPath = getCurrentFilePath();
  if (!docPath) {
    const note = document.createElement('p');
    note.className = 'ws-muted';
    note.textContent =
      'Open a saved document to see its local history. Versions are captured automatically before each save.';
    panel.appendChild(note);
    container.appendChild(panel);
    return;
  }

  // Manual snapshot control: pin the current state before a risky edit
  const snapshotBtn = document.createElement('button');
  snapshotBtn.className = 'ws-btn ws-btn-primary';
  snapshotBtn.textContent = 'Save version now';
  snapshotBtn.addEventListener('click', async () => {
    await history.save(docPath, getCurrentContent(), 'manual');
    renderHistoryPanel(container, deps);
  });
  panel.appendChild(snapshotBtn);

  let versions = [];
  try {
    versions = (await history.list(docPath)) || [];
  } catch {
    /* leave the list empty */
  }

  const list = document.createElement('div');
  list.className = 'ws-issues-list';
  if (versions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ws-muted';
    empty.textContent = 'No versions yet — one is captured each time you save.';
    list.appendChild(empty);
  }

  for (const version of versions) {
    const item = document.createElement('div');
    item.className = 'ws-issue-item';
    const date = new Date(version.createdAt).toLocaleString();
    item.innerHTML = `
      <div class="ws-issue-type">
        <span>${esc(version.label || 'version')} · ${esc(timeAgo(version.createdAt))}</span>
      </div>
      <div class="ws-muted">${esc(date)} · ${version.wordCount ?? '?'} words</div>
      <div class="ws-issue-actions">
        <button class="ws-btn ws-btn-sm" data-action="restore">Restore</button>
        <button class="ws-btn ws-btn-sm" data-action="diff">Diff</button>
        <button class="ws-btn ws-btn-sm" data-action="delete">Delete</button>
      </div>`;

    item.querySelector('[data-action="restore"]').addEventListener('click', async () => {
      if (
        !confirm(
          'Replace the editor content with this version? (Your current text is snapped first.)'
        )
      ) {
        return;
      }
      // Guard rail: snapshot the live content before overwriting it
      await history.save(docPath, getCurrentContent(), 'before restore');
      const content = await history.read(docPath, version.id);
      replaceContent(content);
    });

    item.querySelector('[data-action="diff"]').addEventListener('click', async () => {
      const content = await history.read(docPath, version.id);
      showDiffModal(content, getCurrentContent(), version);
    });

    item.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      await history.delete(docPath, version.id);
      renderHistoryPanel(container, deps);
    });

    list.appendChild(item);
  }
  panel.appendChild(list);
  container.appendChild(panel);
}

/**
 * Overlay modal showing a unified line diff (version → current).
 * Read-only; closed with its button, Esc, or backdrop click.
 */
function showDiffModal(oldText, newText, version) {
  const overlay = document.createElement('div');
  overlay.className = 'ai-settings-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const body = document.createElement('div');
  body.className = 'history-diff-body';
  // computeLineDiff takes raw texts and returns {type: 'added'|'removed'|'unchanged', text}
  const diffLines = computeLineDiff(String(oldText || ''), String(newText || ''));
  for (const line of diffLines) {
    const div = document.createElement('div');
    div.className = `history-diff-line history-diff-${line.type}`;
    div.textContent =
      (line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  ') + (line.text ?? '');
    body.appendChild(div);
  }

  const dialog = document.createElement('div');
  dialog.className = 'ai-settings-dialog history-diff-dialog';
  dialog.innerHTML = `<h3>Version diff — ${esc(new Date(version.createdAt).toLocaleString())}</h3>
    <p class="ai-settings-note">Red: version · Green: current editor content</p>`;
  dialog.appendChild(body);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.className = 'ws-btn';
  dialog.appendChild(closeBtn);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
}

module.exports = { renderHistoryPanel };
