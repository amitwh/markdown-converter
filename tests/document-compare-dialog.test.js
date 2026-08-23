/**
 * Tests for the Document Compare dialog (local two-file diff and git-HEAD diff).
 * Exercises the real dialog DOM in jsdom with the electron IPC surface mocked,
 * following the jest.mock('electron') pattern in monospace-font-config.test.js.
 */

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

require('../src/utils/ModalManager'); // sets window.ModalManager for the dialog
const { ipcRenderer } = require('electron');
const { showDocumentCompareDialog } = require('../src/renderer/document-compare-dialog');

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

function openDialog(filePath = null) {
  showDocumentCompareDialog({ filePath });
}

function clickCompare() {
  document.getElementById('document-compare-run').click();
}

function resultRows() {
  return Array.from(document.querySelectorAll('#compare-result .diff-row'));
}

function statusText() {
  return document.getElementById('compare-status-message').textContent;
}

describe('Document Compare dialog', () => {
  beforeEach(() => {
    ipcRenderer.invoke.mockReset();
    openDialog('/notes/report.md');
  });

  describe('local two-file mode', () => {
    it('renders added, removed, and unchanged rows from the line diff', async () => {
      ipcRenderer.invoke.mockImplementation((channel, filePath) => {
        if (channel !== 'read-file') return {};
        if (filePath === '/notes/old.md') return '# Title\nold line\nshared tail';
        if (filePath === '/notes/new.md') return '# Title\nnew line\nshared tail';
        throw new Error(`unexpected path ${filePath}`);
      });
      document.getElementById('compare-file-a-input').value = '/notes/old.md';
      document.getElementById('compare-file-b-input').value = '/notes/new.md';

      clickCompare();
      await flush();

      const rows = resultRows();
      expect(rows).toHaveLength(4);
      expect(rows[0].className).toBe('diff-row diff-context');
      expect(rows[1].className).toBe('diff-row diff-removed');
      expect(rows[1].textContent).toContain('old line');
      expect(rows[2].className).toBe('diff-row diff-added');
      expect(rows[2].textContent).toContain('new line');
      expect(rows[3].className).toBe('diff-row diff-context');
      expect(statusText()).toBe('1 line(s) added, 1 line(s) removed.');
    });

    it('reports identical files without rendering a diff view', async () => {
      ipcRenderer.invoke.mockImplementation(() => 'same\ncontent');
      document.getElementById('compare-file-a-input').value = '/a.md';
      document.getElementById('compare-file-b-input').value = '/b.md';

      clickCompare();
      await flush();

      expect(statusText()).toBe('Files are identical.');
      expect(document.getElementById('compare-result').classList.contains('hidden')).toBe(true);
    });

    it('warns when one of the two files has not been chosen', async () => {
      document.getElementById('compare-file-a-input').value = '/a.md';
      document.getElementById('compare-file-b-input').value = '';

      clickCompare();
      await flush();

      expect(statusText()).toBe('Choose both files to compare.');
      expect(ipcRenderer.invoke).not.toHaveBeenCalledWith('read-file', expect.anything());
    });

    it('shows a warning when a file cannot be read', async () => {
      ipcRenderer.invoke.mockRejectedValue(new Error('Invalid file path'));
      document.getElementById('compare-file-a-input').value = '/a.md';
      document.getElementById('compare-file-b-input').value = '/b.md';

      clickCompare();
      await flush();

      expect(statusText()).toContain('Error reading file');
    });
  });

  describe('git HEAD mode', () => {
    function selectGitMode() {
      const modeSelect = document.getElementById('compare-mode-select');
      modeSelect.value = 'git';
      modeSelect.dispatchEvent(new Event('change'));
    }

    it('renders git raw diff text verbatim, colored by leading character', async () => {
      ipcRenderer.invoke.mockImplementation((channel) => {
        if (channel === 'git-status') return { current: 'master', files: [] };
        if (channel === 'git-diff') {
          return 'diff --git a/report.md b/report.md\n@@ -1,2 +1,2 @@\n context\n-old line\n+new line';
        }
        return {};
      });
      await flush(); // git-status availability check
      selectGitMode();
      clickCompare();
      await flush();

      const rows = resultRows();
      expect(rows).toHaveLength(5);
      expect(rows[0].className).toBe('diff-row diff-context');
      expect(rows[1].className).toBe('diff-row diff-hunk');
      expect(rows[2].className).toBe('diff-row diff-context');
      expect(rows[3].className).toBe('diff-row diff-removed');
      expect(rows[3].textContent).toBe('-old line');
      expect(rows[4].className).toBe('diff-row diff-added');
      expect(rows[4].textContent).toBe('+new line');
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('git-diff', {
        file: '/notes/report.md',
        againstHead: true,
      });
    });

    it('reports no differences when git returns an empty diff', async () => {
      ipcRenderer.invoke.mockImplementation((channel) => {
        if (channel === 'git-status') return { current: 'master', files: [] };
        if (channel === 'git-diff') return '';
        return {};
      });
      await flush();
      selectGitMode();
      clickCompare();
      await flush();

      expect(statusText()).toBe('No differences against HEAD.');
      expect(document.getElementById('compare-result').classList.contains('hidden')).toBe(true);
    });

    it('degrades to a disabled option with a hint outside a git repository', async () => {
      ipcRenderer.invoke.mockImplementation((channel) => {
        if (channel === 'git-status') return { error: 'Not a git repository' };
        return {};
      });
      openDialog('/plain/file.md');
      await flush();

      const gitOption = document.querySelector('#compare-mode-select option[value="git"]');
      expect(gitOption.disabled).toBe(true);
      const hint = document.getElementById('compare-git-hint');
      expect(hint.classList.contains('hidden')).toBe(false);
      expect(hint.textContent).toBe('Current file is not inside a git repository.');
      expect(ipcRenderer.invoke).not.toHaveBeenCalledWith('git-diff', expect.anything());
    });

    it('degrades to a disabled option with a hint when no file is open', async () => {
      openDialog(null);

      const gitOption = document.querySelector('#compare-mode-select option[value="git"]');
      expect(gitOption.disabled).toBe(true);
      const hint = document.getElementById('compare-git-hint');
      expect(hint.textContent).toContain('Open (or save) a file');
      expect(ipcRenderer.invoke).not.toHaveBeenCalledWith('git-diff', expect.anything());
    });
  });
});
