/**
 * Tests for the Git sidebar panel XSS hardening.
 * renderGitPanel takes injected git operations (no electron mock needed); these tests
 * verify that repository-derived strings (branch names, file names, commit messages,
 * author names, error text) are HTML-escaped in both element and attribute contexts.
 */

const { renderGitPanel } = require('../src/sidebar/git-panel');

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

const EMPTY_STATUS = { modified: [], not_added: [], created: [], deleted: [], staged: [] };
const EMPTY_BRANCHES = () => ({ all: [], current: '' });

function makeOps(overrides = {}) {
  return {
    gitStatus: jest.fn().mockResolvedValue(EMPTY_STATUS),
    gitDiff: jest.fn().mockResolvedValue(''),
    gitStage: jest.fn().mockResolvedValue({}),
    gitCommit: jest.fn().mockResolvedValue({}),
    gitLog: jest.fn().mockResolvedValue({ all: [] }),
    gitBranches: jest.fn().mockResolvedValue(EMPTY_BRANCHES()),
    gitCheckout: jest.fn().mockResolvedValue({}),
    gitPush: jest.fn().mockResolvedValue({}),
    gitPull: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function mountPanel(ops) {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderGitPanel(container, ops);
  return container;
}

describe('Git panel XSS escaping', () => {
  it('renders a hostile branch name as literal text with no img element in the DOM', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    mountPanel(
      makeOps({
        gitBranches: jest.fn().mockResolvedValue({ all: [payload, 'master'], current: 'master' }),
      })
    );
    await flush();

    const branchesEl = document.getElementById('git-branches');
    expect(branchesEl.querySelectorAll('img')).toHaveLength(0);
    expect(branchesEl.textContent).toContain(payload);
    const item = branchesEl.querySelector('[data-branch]');
    expect(item).not.toBeNull();
    expect(item.dataset.branch).toBe(payload);
  });

  it('keeps a hostile branch name inert in attribute and text contexts', async () => {
    const payload = '" onclick="alert(1)" data-x="';
    mountPanel(
      makeOps({
        gitBranches: jest.fn().mockResolvedValue({ all: [payload], current: '' }),
      })
    );
    await flush();

    const item = document.querySelector('.git-branch-item');
    expect(item.dataset.branch).toBe(payload);
    expect(item.getAttribute('onclick')).toBeNull();
    expect(item.textContent).toContain(payload);
  });

  it('renders a commit message with an event-handler payload as inert text', async () => {
    const ops = makeOps({
      gitLog: jest.fn().mockResolvedValue({
        all: [
          {
            message: '<img src=x onerror=alert(1)> fix build',
            author_name: 'Attacker <script>alert(2)</script>',
            date: '2024-05-01T10:00:00',
          },
        ],
      }),
    });
    mountPanel(ops);
    await flush();

    const logEl = document.getElementById('git-log');
    expect(logEl.querySelectorAll('img, script')).toHaveLength(0);
    const msg = logEl.querySelector('.git-log-msg');
    expect(msg.textContent).toBe('<img src=x onerror=alert(1)> fix build');
    const meta = logEl.querySelector('.git-log-meta');
    expect(meta.textContent).toContain('Attacker <script>alert(2)</script>');
  });

  it('does not let a quoted file name break out of the data-file attribute', async () => {
    const evilFile = 'notes" onmouseover="alert(1)" data-evil="x.md';
    mountPanel(
      makeOps({ gitStatus: jest.fn().mockResolvedValue({ ...EMPTY_STATUS, modified: [evilFile] }) })
    );
    await flush();

    const fileRow = document.querySelector('.git-file');
    expect(fileRow.getAttribute('data-file')).toBe(evilFile);
    expect(fileRow.getAttribute('onmouseover')).toBeNull();
    expect(fileRow.getAttribute('data-evil')).toBeNull();
    expect(fileRow.textContent).toContain(evilFile);
    const stageBtn = fileRow.querySelector('.git-stage-btn');
    expect(stageBtn.dataset.file).toBe(evilFile);
  });

  it('escapes HTML in a git status error message', async () => {
    const error = 'fatal: <b>not</b> a git repository <img src=x onerror=alert(1)>';
    mountPanel(makeOps({ gitStatus: jest.fn().mockResolvedValue({ error }) }));
    await flush();

    const changesEl = document.getElementById('git-changes');
    expect(changesEl.querySelectorAll('img')).toHaveLength(0);
    expect(changesEl.querySelector('.git-info').textContent).toBe(error);
  });

  it('escapes HTML in a git branch listing error message', async () => {
    const error = 'refs/heads/<script>alert(1)</script> is invalid';
    mountPanel(makeOps({ gitBranches: jest.fn().mockResolvedValue({ error }) }));
    await flush();

    const branchesEl = document.getElementById('git-branches');
    expect(branchesEl.querySelectorAll('script')).toHaveLength(0);
    expect(branchesEl.querySelector('.git-info').textContent).toBe(error);
  });

  it('still renders benign branch names, files, and commits normally', async () => {
    mountPanel(
      makeOps({
        gitStatus: jest.fn().mockResolvedValue({ ...EMPTY_STATUS, modified: ['README.md'] }),
        gitLog: jest.fn().mockResolvedValue({
          all: [{ message: 'initial commit', author_name: 'Dev', date: '2024-05-01T10:00:00' }],
        }),
        gitBranches: jest.fn().mockResolvedValue({ all: ['master'], current: 'master' }),
      })
    );
    await flush();

    expect(document.querySelector('.git-file-name').textContent).toBe('README.md');
    expect(document.querySelector('.git-log-msg').textContent).toBe('initial commit');
    expect(document.querySelector('.git-branch-name').textContent).toContain('master');
  });
});
