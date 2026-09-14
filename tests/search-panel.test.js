/**
 * @jest-environment jsdom
 *
 * Search-panel DOM tests — verify the panel wires the existing backend
 * (workspace-search / doc-qa) and renders results safely. We don't test
 * pixel layout; we test the contract: click a result → calls onOpenFile
 * with the right path.
 */
const { renderSearchPanel } = require('../src/sidebar/search-panel');

function mountPanel(deps = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = renderSearchPanel(container, {
    search: deps.search || jest.fn().mockResolvedValue([]),
    ask: deps.ask || jest.fn().mockResolvedValue({ question: '', chunks: [] }),
    getCurrentDir: deps.getCurrentDir || (() => '/notes'),
    onOpenFile: deps.onOpenFile || jest.fn(),
  });
  return { container, api };
}

async function flush() {
  // Drain any pending microtasks (search() → render)
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('renderSearchPanel — DOM wiring', () => {
  test('mounts the panel structure inside its container', () => {
    const { container } = mountPanel();
    expect(container.querySelector('.search-panel')).not.toBeNull();
    expect(container.querySelector('#search-input')).not.toBeNull();
    expect(container.querySelector('#search-run')).not.toBeNull();
    expect(container.querySelectorAll('.search-mode-btn')).toHaveLength(2);
  });

  test('seeds the folder input from getCurrentDir() on mount', () => {
    const { container } = mountPanel({ getCurrentDir: () => '/data/notes' });
    expect(container.querySelector('#search-dir').value).toBe('/data/notes');
  });

  test('uses a helpful placeholder when no folder is available', () => {
    const { container } = mountPanel({ getCurrentDir: () => null });
    const dirEl = container.querySelector('#search-dir');
    expect(dirEl.value).toBe('');
    expect(dirEl.placeholder).toMatch(/none/i);
  });
});

describe('renderSearchPanel — search mode', () => {
  test('Enter on the input triggers a search() with the typed query and dir', async () => {
    const search = jest.fn().mockResolvedValue([]);
    const { container } = mountPanel({ search });
    const input = container.querySelector('#search-input');
    input.value = 'rust async';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await flush();
    expect(search).toHaveBeenCalledWith({
      query: 'rust async',
      dir: '/notes',
      limit: 50,
    });
  });

  test('clicking the run button triggers a search() too', async () => {
    const search = jest.fn().mockResolvedValue([]);
    const { container } = mountPanel({ search });
    container.querySelector('#search-input').value = 'foo';
    container.querySelector('#search-run').click();

    await flush();
    expect(search).toHaveBeenCalledTimes(1);
  });

  test('renders result list when search returns hits', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        filePath: '/notes/a.md',
        snippet: 'rust async mention',
        score: 4.5,
        matchedTerms: ['rust'],
        matchedTags: [],
        matchedLinks: [],
      },
      {
        filePath: '/notes/b.md',
        snippet: 'no match here',
        score: 1,
        matchedTerms: ['rust'],
        matchedTags: ['lang'],
        matchedLinks: [],
      },
    ]);
    const { container } = mountPanel({ search });
    container.querySelector('#search-input').value = 'rust';
    container.querySelector('#search-run').click();

    await flush();

    const items = container.querySelectorAll('.search-result');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('a.md');
    expect(items[0].textContent).toContain('rust async mention');
    // tag facet surfaces in the meta line
    expect(items[1].textContent).toContain('#lang');
  });

  test('clicking a result calls onOpenFile with the right path', async () => {
    const onOpenFile = jest.fn();
    const search = jest
      .fn()
      .mockResolvedValue([{ filePath: '/notes/x.md', snippet: 's', score: 1, matchedTerms: [] }]);
    const { container } = mountPanel({ search, onOpenFile });
    container.querySelector('#search-input').value = 'x';
    container.querySelector('#search-run').click();
    await flush();

    container.querySelector('.search-result').click();
    expect(onOpenFile).toHaveBeenCalledWith('/notes/x.md', 0);
  });

  test('shows "No matches." when the search returns []', async () => {
    const { container } = mountPanel({ search: jest.fn().mockResolvedValue([]) });
    container.querySelector('#search-input').value = 'absent';
    container.querySelector('#search-run').click();
    await flush();

    expect(container.querySelector('.search-empty')).not.toBeNull();
    expect(container.querySelector('#search-status').textContent).toMatch(/0 matches/);
  });

  test('shows an error message when search rejects', async () => {
    const search = jest.fn().mockRejectedValue(new Error('disk gone'));
    const { container } = mountPanel({ search });
    container.querySelector('#search-input').value = 'x';
    container.querySelector('#search-run').click();
    await flush();

    const status = container.querySelector('#search-status');
    expect(status.textContent).toMatch(/disk gone/);
    expect(status.dataset.kind).toBe('error');
  });

  test('refuses to search when the query is empty', async () => {
    const search = jest.fn();
    const { container } = mountPanel({ search });
    container.querySelector('#search-run').click();
    await flush();
    expect(search).not.toHaveBeenCalled();
    expect(container.querySelector('#search-status').textContent).toMatch(/Enter a query/);
  });

  test('refuses to search when no folder is available', async () => {
    const search = jest.fn();
    const { container } = mountPanel({ search, getCurrentDir: () => null });
    container.querySelector('#search-input').value = 'x';
    container.querySelector('#search-run').click();
    await flush();
    expect(search).not.toHaveBeenCalled();
    expect(container.querySelector('#search-status').textContent).toMatch(/No folder/);
  });
});

describe('renderSearchPanel — Ask mode', () => {
  test('clicking the Ask tab switches placeholder and routes to ask()', async () => {
    const ask = jest.fn().mockResolvedValue({ question: '', chunks: [] });
    const { container } = mountPanel({ ask });
    container.querySelector('.search-mode-btn[data-mode="ask"]').click();
    const input = container.querySelector('#search-input');
    expect(input.placeholder).toMatch(/question/i);

    input.value = 'how does rust async work';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();

    expect(ask).toHaveBeenCalledWith({
      question: 'how does rust async work',
      dir: '/notes',
      topK: 5,
    });
  });

  test('renders Ask-mode chunks (filePath + snippet + offset)', async () => {
    const ask = jest.fn().mockResolvedValue({
      question: 'q',
      chunks: [
        { filePath: '/notes/c.md', offset: 1234, snippet: '...passage...', score: 3, mtimeMs: 1 },
      ],
    });
    const { container } = mountPanel({ ask });
    container.querySelector('.search-mode-btn[data-mode="ask"]').click();
    container.querySelector('#search-input').value = 'q';
    container.querySelector('#search-run').click();
    await flush();

    const items = container.querySelectorAll('.search-result');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('c.md');
    expect(items[0].textContent).toContain('+1234');
  });

  test('Ask-mode click passes the offset through to onOpenFile', async () => {
    const onOpenFile = jest.fn();
    const ask = jest.fn().mockResolvedValue({
      question: 'q',
      chunks: [{ filePath: '/notes/c.md', offset: 999, snippet: 's', score: 1 }],
    });
    const { container } = mountPanel({ ask, onOpenFile });
    container.querySelector('.search-mode-btn[data-mode="ask"]').click();
    container.querySelector('#search-input').value = 'q';
    container.querySelector('#search-run').click();
    await flush();
    container.querySelector('.search-result').click();
    expect(onOpenFile).toHaveBeenCalledWith('/notes/c.md', 999);
  });
});

describe('renderSearchPanel — escaping', () => {
  test('result rows escape HTML in filenames and snippets', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        filePath: '/notes/<script>alert(1)</script>.md',
        snippet: '<img src=x onerror=alert(1)>',
        score: 1,
        matchedTerms: [],
        matchedTags: ['<unsafe>'],
      },
    ]);
    const { container } = mountPanel({ search });
    container.querySelector('#search-input').value = 'x';
    container.querySelector('#search-run').click();
    await flush();

    // No executable elements should have been built — escapeHtml() prevents
    // a hostile filename or snippet from running script/img in the panel.
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    // The literal text still appears (decoded by the browser); the safety
    // is that it stays as text instead of becoming a node.
    expect(container.querySelector('.search-result').textContent).toContain('<script>');
    expect(container.querySelector('.search-result').textContent).toContain('<img');
    expect(container.querySelector('.search-result').textContent).toContain('#<unsafe>');
  });
});

describe('renderSearchPanel — clear/escape behaviors', () => {
  test('Escape on the input clears the query and results', async () => {
    const search = jest.fn().mockResolvedValue([{ filePath: '/a.md', snippet: 's', score: 1 }]);
    const { container, container: c2 } = mountPanel({ search });
    const input = container.querySelector('#search-input');
    input.value = 'x';
    container.querySelector('#search-run').click();
    await flush();
    expect(container.querySelectorAll('.search-result')).toHaveLength(1);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();

    expect(input.value).toBe('');
    expect(container.querySelector('.search-empty')).not.toBeNull();
    // Clean up the c2 reference just to silence the unused-var lint warning.
    void c2;
  });

  test('Clear button resets input + results', async () => {
    const { container } = mountPanel({ search: jest.fn().mockResolvedValue([]) });
    const input = container.querySelector('#search-input');
    input.value = 'x';
    container.querySelector('#search-clear').click();
    expect(input.value).toBe('');
    expect(container.querySelector('.search-empty')).not.toBeNull();
  });

  test('returned API can set the dir + focus + clear from the host', () => {
    const { container, api } = mountPanel();
    api.setDir('/new/path');
    expect(container.querySelector('#search-dir').value).toBe('/new/path');
    // focus() and clear() are exposed; ensure they don't throw.
    api.focus();
    api.clear();
    expect(container.querySelector('#search-input').value).toBe('');
  });
});
