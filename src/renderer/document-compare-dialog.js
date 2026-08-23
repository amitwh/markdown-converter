/**
 * Document Compare Dialog
 *
 * Two-pane line diff opened from Tools > Document Compare (main.js sends
 * `show-document-compare`; renderer.js registers the listener).
 *
 * Construction mirrors src/renderer/media-operations-dialog.js: a modal built from
 * `.modal` / `.modal-content` / `.modal-header` / `.modal-body` / `.modal-footer`
 * markup appended to document.body on first use, driven by ModalManager, with a
 * status line reusing the `info-message` / `warning-message` classes. File
 * selection reuses the app's existing convention: a plain `<input type="file">`
 * whose chosen File is resolved to a path via `window.electronAPI.getFilePath`
 * (webUtils.getPathForFile — `File.path` was removed in Electron 32) —
 * no new IPC channel for picking files. File *contents* are read through the
 * existing `read-file` invoke channel (the same one the renderer's electronAPI
 * adapters use), not through a new privileged renderer-side file path.
 *
 * Two modes:
 *  - Local: File A (prefilled with the current tab's file, changeable) vs File B,
 *    diffed locally by the pure LCS function in src/utils/line-diff.js.
 *  - Git HEAD: the current file against its last commit, via the existing
 *    `git-diff` invoke channel with `againstHead: true` (GitOperations.diff).
 *    Git's own raw diff text is rendered verbatim, one row per line, colored by
 *    leading character — it is already a diff and is never re-diffed through
 *    line-diff. When the current file is not inside a git repository (or no file
 *    is open), the option is disabled with a hint instead of erroring.
 *
 * @module document-compare-dialog
 */

const { ipcRenderer } = require('electron');
const { getFilePath } = require('../utils/file-path');
const { computeLineDiff } = require('../utils/line-diff');

const COMPARE_ACCEPT = '.md,.markdown,.txt,.text,.log,.json,.xml,.yml,.yaml,.csv';

const GIT_DIFF_ROW_CLASS = [
  { prefix: '@@', className: 'diff-hunk' },
  { prefix: '+++', className: 'diff-context' },
  { prefix: '---', className: 'diff-context' },
  { prefix: '+', className: 'diff-added' },
  { prefix: '-', className: 'diff-removed' },
];

let modalEl = null;
let modalManager = null;
let els = null;
let currentFilePath = null;

function buildDialogDom() {
  modalEl = document.createElement('div');
  modalEl.id = 'document-compare-dialog';
  modalEl.className = 'modal hidden';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'document-compare-title');
  modalEl.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-content large">
      <div class="modal-header">
        <h3 id="document-compare-title">Document Compare</h3>
        <button class="modal-close" id="document-compare-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="export-section">
          <label for="compare-mode-select">Mode:</label>
          <select id="compare-mode-select">
            <option value="local">Compare Two Files</option>
            <option value="git">Compare Current File with Git HEAD</option>
          </select>
          <small id="compare-git-hint" class="hidden"></small>
        </div>
        <div id="compare-local-section">
          <div class="export-section">
            <label for="compare-file-a-input">File A (original):</label>
            <div class="folder-input-group">
              <input type="text" id="compare-file-a-input" readonly>
              <button type="button" id="compare-file-a-browse">Choose File A</button>
            </div>
          </div>
          <div class="export-section">
            <label for="compare-file-b-input">File B (revised):</label>
            <div class="folder-input-group">
              <input type="text" id="compare-file-b-input" readonly>
              <button type="button" id="compare-file-b-browse">Choose File B</button>
            </div>
          </div>
        </div>
        <div id="compare-git-section" class="hidden">
          <div class="export-section">
            <label>Current file:</label>
            <code id="compare-git-file"></code>
          </div>
        </div>
        <div id="compare-status-message" class="info-message hidden" aria-live="polite"></div>
        <div id="compare-result" class="diff-view hidden"></div>
      </div>
      <div class="modal-footer">
        <button id="document-compare-cancel" class="btn btn-secondary" data-close>Close</button>
        <button id="document-compare-run" class="btn btn-primary">Compare</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  els = {
    modeSelect: modalEl.querySelector('#compare-mode-select'),
    gitHint: modalEl.querySelector('#compare-git-hint'),
    localSection: modalEl.querySelector('#compare-local-section'),
    fileAInput: modalEl.querySelector('#compare-file-a-input'),
    fileABrowse: modalEl.querySelector('#compare-file-a-browse'),
    fileBInput: modalEl.querySelector('#compare-file-b-input'),
    fileBBrowse: modalEl.querySelector('#compare-file-b-browse'),
    gitSection: modalEl.querySelector('#compare-git-section'),
    gitFile: modalEl.querySelector('#compare-git-file'),
    status: modalEl.querySelector('#compare-status-message'),
    result: modalEl.querySelector('#compare-result'),
    runBtn: modalEl.querySelector('#document-compare-run'),
    cancelBtn: modalEl.querySelector('#document-compare-cancel'),
  };

  els.modeSelect.addEventListener('change', updateModeSections);
  els.fileABrowse.addEventListener('click', () => chooseFile(els.fileAInput));
  els.fileBBrowse.addEventListener('click', () => chooseFile(els.fileBInput));
  els.runBtn.addEventListener('click', handleCompare);
  els.cancelBtn.addEventListener('click', hideDialog);

  modalManager = new window.ModalManager(modalEl);
}

function ensureDialog() {
  if (!modalEl) {
    buildDialogDom();
  }
}

// Same renderer-side picker the Media Operations and PDF Editor dialogs use.
function chooseFile(input) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = COMPARE_ACCEPT;
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      input.value = getFilePath(file);
      clearResult();
    }
  };
  fileInput.click();
}

function clearStatus() {
  if (!els.status) return;
  els.status.textContent = '';
  els.status.classList.remove('info-message', 'warning-message', 'success-message');
  els.status.classList.add('hidden');
}

function showStatus(message, type = 'info') {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.classList.remove('hidden', 'info-message', 'warning-message', 'success-message');
  els.status.classList.add(`${type}-message`);
}

function clearResult() {
  if (!els.result) return;
  els.result.innerHTML = '';
  els.result.classList.add('hidden');
}

function updateModeSections() {
  const isGit = els.modeSelect.value === 'git';
  els.localSection.classList.toggle('hidden', isGit);
  els.gitSection.classList.toggle('hidden', !isGit);
  clearStatus();
  clearResult();
}

function appendDiffRow(className, text, marker) {
  const row = document.createElement('div');
  row.className = `diff-row ${className}`;
  const markerSpan = document.createElement('span');
  markerSpan.className = 'diff-marker';
  markerSpan.textContent = marker;
  const textSpan = document.createElement('span');
  textSpan.className = 'diff-text';
  // Non-breaking space keeps empty lines one row tall under pre-wrap.
  textSpan.textContent = text === '' ? ' ' : text;
  row.appendChild(markerSpan);
  row.appendChild(textSpan);
  els.result.appendChild(row);
}

// Mode 1: local two-file diff through the pure LCS line-diff function.
function renderLocalDiff(entries) {
  clearResult();
  entries.forEach((entry) => {
    const marker = entry.type === 'added' ? '+' : entry.type === 'removed' ? '-' : '';
    const rowClass = entry.type === 'unchanged' ? 'diff-context' : `diff-${entry.type}`;
    appendDiffRow(rowClass, entry.text, marker);
  });
  els.result.classList.remove('hidden');
}

// Mode 2: git's own diff text, rendered verbatim (one row per line), colored by
// leading character. This is presentation only — the text is never re-diffed.
function renderGitDiff(rawDiff) {
  clearResult();
  rawDiff.split('\n').forEach((line) => {
    const match = GIT_DIFF_ROW_CLASS.find(({ prefix }) => line.startsWith(prefix));
    const className = match ? match.className : 'diff-context';
    appendDiffRow(className, line, '');
  });
  els.result.classList.remove('hidden');
}

async function compareLocalFiles() {
  const pathA = els.fileAInput.value.trim();
  const pathB = els.fileBInput.value.trim();
  if (!pathA || !pathB) {
    showStatus('Choose both files to compare.', 'warning');
    return;
  }

  clearStatus();
  clearResult();
  let contentA;
  let contentB;
  try {
    contentA = await ipcRenderer.invoke('read-file', pathA);
    contentB = await ipcRenderer.invoke('read-file', pathB);
  } catch (err) {
    showStatus(`Error reading file: ${err.message}`, 'warning');
    return;
  }

  const entries = computeLineDiff(contentA, contentB);
  const added = entries.filter((entry) => entry.type === 'added').length;
  const removed = entries.filter((entry) => entry.type === 'removed').length;
  if (added === 0 && removed === 0) {
    showStatus('Files are identical.', 'info');
    return;
  }
  renderLocalDiff(entries);
  showStatus(`${added} line(s) added, ${removed} line(s) removed.`, 'success');
}

async function compareWithGitHead() {
  if (!currentFilePath) {
    showStatus('No file is open — save the current document first.', 'warning');
    return;
  }

  clearStatus();
  clearResult();
  let rawDiff;
  try {
    rawDiff = await ipcRenderer.invoke('git-diff', { file: currentFilePath, againstHead: true });
  } catch (err) {
    showStatus(`Error: ${err.message}`, 'warning');
    return;
  }
  if (rawDiff && typeof rawDiff === 'object' && rawDiff.error) {
    showStatus(`Git diff unavailable: ${rawDiff.error}`, 'warning');
    return;
  }
  if (!rawDiff || rawDiff.trim() === '') {
    showStatus('No differences against HEAD.', 'info');
    return;
  }
  renderGitDiff(rawDiff);
}

async function handleCompare() {
  if (els.modeSelect.value === 'git') {
    await compareWithGitHead();
  } else {
    await compareLocalFiles();
  }
}

// The Git HEAD option must degrade gracefully (disabled + hint), never error:
// no file open, or the file's directory is not a git repository.
async function refreshGitModeAvailability() {
  const gitOption = els.modeSelect.querySelector('option[value="git"]');
  if (!gitOption) return;

  const disableGitOption = (hint) => {
    gitOption.disabled = true;
    els.gitHint.textContent = hint;
    els.gitHint.classList.remove('hidden');
    if (els.modeSelect.value === 'git') {
      els.modeSelect.value = 'local';
      updateModeSections();
    }
  };

  if (!currentFilePath) {
    disableGitOption('Open (or save) a file to compare it with its git history.');
    return;
  }
  try {
    const status = await ipcRenderer.invoke('git-status');
    if (status && typeof status === 'object' && status.error) {
      disableGitOption('Current file is not inside a git repository.');
      return;
    }
  } catch (err) {
    disableGitOption(`Git check failed: ${err.message}`);
    return;
  }
  gitOption.disabled = false;
  els.gitHint.textContent = '';
  els.gitHint.classList.add('hidden');
}

function hideDialog() {
  if (modalManager) modalManager.close();
  clearStatus();
  clearResult();
}

/**
 * Open the Document Compare dialog.
 * @param {object} [context] - Current editor context from renderer.js.
 * @param {string|null} [context.filePath] - Active tab's file path, used to
 *   prefill File A and to resolve the Git HEAD mode.
 */
function showDocumentCompareDialog({ filePath = null } = {}) {
  ensureDialog();
  currentFilePath = filePath;

  els.fileAInput.value = filePath || '';
  els.fileBInput.value = '';
  els.gitFile.textContent = filePath || '(unsaved document)';
  els.modeSelect.value = 'local';
  updateModeSections();
  refreshGitModeAvailability();
  modalManager.open();
}

module.exports = { showDocumentCompareDialog };
