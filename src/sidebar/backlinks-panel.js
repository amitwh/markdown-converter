/**
 * Backlinks sidebar panel — the "what links here?" view for the local
 * knowledge-base. Lists documents in the current folder that wiki-link to the
 * active document, with jump-to-source. Re-scans on every render (panel opens
 * / refresh) because scans are bounded and folders are small in practice.
 *
 * @module BacklinksPanel
 */

const { collectMarkdownFiles, findBacklinks } = require('../../utils/backlinks');
const { docNameFor } = require('../../utils/wiki-links');

/**
 * Render the backlinks panel.
 *
 * @param {HTMLElement} container Sidebar panel content element
 * @param {object} deps
 * @param {() => string|null} deps.getCurrentFilePath Active tab's file path
 * @param {(dir: string) => Promise<{entries:Array}|null>} deps.listDir
 * @param {(path: string) => Promise<string|null>} deps.readFile
 * @param {(path: string) => void} deps.onFileOpen Open a file in a new tab
 * @param {Function} deps.pathUtil injected path module
 */
async function renderBacklinksPanel(container, deps) {
  container.replaceChildren();
  const { getCurrentFilePath, listDir, readFile, onFileOpen, pathUtil } = deps;

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  const heading = document.createElement('h3');
  heading.className = 'ws-heading';
  heading.textContent = 'Backlinks';
  panel.appendChild(heading);

  const docPath = getCurrentFilePath();
  if (!docPath) {
    appendNote(panel, 'Open a saved document to see what links to it.');
    container.appendChild(panel);
    return;
  }

  const docName = docNameFor(docPath, pathUtil);
  const dir = pathUtil.dirname(docPath);
  const status = document.createElement('p');
  status.className = 'ws-muted';
  status.textContent = `Scanning for links to "${docName}"…`;
  panel.appendChild(status);
  container.appendChild(panel);

  try {
    const files = await collectMarkdownFiles(dir, listDir);
    const links = await findBacklinks({ docName, docPath, files, readFile });

    status.textContent =
      files.length === 0
        ? 'No markdown files found in this folder.'
        : `${links.length} document${links.length === 1 ? '' : 's'} link here ` +
          `(scanned ${files.length} files)`;

    if (links.length > 0) {
      const list = document.createElement('div');
      list.className = 'ws-issues-list';
      for (const link of links) {
        const item = document.createElement('div');
        item.className = 'ws-issue-item';
        const name = pathUtil.basename(link.path);
        item.innerHTML = `
          <div class="ws-issue-type"><span>${escapeText(name)} : line ${link.line}</span></div>
          <div class="ws-issue-text">${escapeText(link.context)}</div>`;
        // Whole item is clickable — jump straight to the linking document
        item.setAttribute('role', 'link');
        item.setAttribute('tabindex', '0');
        item.style.cursor = 'pointer';
        item.addEventListener('click', () => onFileOpen(link.path));
        item.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') onFileOpen(link.path);
        });
        list.appendChild(item);
      }
      panel.appendChild(list);
    }
  } catch (error) {
    status.textContent = 'Scan failed: ' + (error.message || error);
  }
}

function appendNote(parent, text) {
  const note = document.createElement('p');
  note.className = 'ws-muted';
  note.textContent = text;
  parent.appendChild(note);
}

function escapeText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { renderBacklinksPanel };
