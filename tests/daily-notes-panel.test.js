/**
 * @jest-environment jsdom
 *
 * Daily notes sidebar panel tests.
 */
const { renderDailyNotesPanel } = require('../src/sidebar/daily-notes-panel');

function mountPanel(deps = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = renderDailyNotesPanel(container, {
    openToday:
      deps.openToday ||
      jest.fn().mockResolvedValue({ path: '/notes/2026-09-14.md', created: true }),
    listExisting: deps.listExisting || jest.fn().mockResolvedValue([]),
    onOpenFile: deps.onOpenFile || jest.fn(),
    ...deps,
  });
  return { container, api };
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('renderDailyNotesPanel — mounting', () => {
  test('mounts the panel structure', () => {
    const { container } = mountPanel();
    expect(container.querySelector('.daily-notes-panel')).not.toBeNull();
    expect(container.querySelector('#daily-notes-today')).not.toBeNull();
    expect(container.querySelector('#daily-notes-refresh')).not.toBeNull();
    expect(container.querySelector('#daily-notes-list')).not.toBeNull();
  });

  test('shows the empty-state message when there are no notes', async () => {
    const { container } = mountPanel({ listExisting: jest.fn().mockResolvedValue([]) });
    await flush();
    expect(container.querySelector('.daily-notes-empty')).not.toBeNull();
    expect(container.textContent).toMatch(/Press.*Today/);
  });

  test('renders one row per filename', async () => {
    const { container } = mountPanel({
      listExisting: jest
        .fn()
        .mockResolvedValue([
          '/notes/daily/2026-09-14.md',
          '/notes/daily/2026-09-13.md',
          '/notes/daily/2026-09-10.md',
        ]),
    });
    await flush();
    const items = container.querySelectorAll('.daily-notes-item');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('2026-09-14');
    expect(items[0].textContent).toMatch(/Sep/);
  });
});

describe('renderDailyNotesPanel — Today button', () => {
  test('clicking Today opens (or creates) today and calls onOpenFile with the path', async () => {
    const openToday = jest.fn().mockResolvedValue({
      path: '/notes/2026-09-14.md',
      created: true,
      content: '',
    });
    const onOpenFile = jest.fn();
    const listExisting = jest.fn().mockResolvedValue(['2026-09-14.md']);
    const { container } = mountPanel({ openToday, onOpenFile, listExisting });
    await flush();

    container.querySelector('#daily-notes-today').click();
    await flush();

    expect(openToday).toHaveBeenCalledWith({});
    expect(onOpenFile).toHaveBeenCalledWith('/notes/2026-09-14.md');
  });

  test('shows a "Created today." / "Today already exists." status depending on the result', async () => {
    const onOpenFile = jest.fn();
    const { container } = mountPanel({
      openToday: jest.fn().mockResolvedValue({ path: '/x.md', created: true }),
      listExisting: jest.fn().mockResolvedValue([]),
      onOpenFile,
    });
    await flush();
    container.querySelector('#daily-notes-today').click();
    await flush();
    expect(container.querySelector('#daily-notes-status').textContent).toMatch(/Created today/);

    // Re-mount with a "not created" result
    const { container: c2 } = mountPanel({
      openToday: jest.fn().mockResolvedValue({ path: '/x.md', created: false }),
      listExisting: jest.fn().mockResolvedValue([]),
      onOpenFile,
    });
    await flush();
    c2.querySelector('#daily-notes-today').click();
    await flush();
    expect(c2.querySelector('#daily-notes-status').textContent).toMatch(/already exists/);
  });

  test('handles openToday errors gracefully (no crash, status reports)', async () => {
    const openToday = jest.fn().mockRejectedValue(new Error('disk gone'));
    const { container } = mountPanel({ openToday });
    await flush();
    container.querySelector('#daily-notes-today').click();
    await flush();
    expect(container.querySelector('#daily-notes-status').textContent).toMatch(/disk gone/);
  });
});

describe('renderDailyNotesPanel — click an existing entry', () => {
  test("clicking a row calls onOpenFile with that row's path", async () => {
    const onOpenFile = jest.fn();
    const { container } = mountPanel({
      onOpenFile,
      listExisting: jest
        .fn()
        .mockResolvedValue(['/notes/daily/2026-09-14.md', '/notes/daily/2026-09-10.md']),
    });
    await flush();
    const items = container.querySelectorAll('.daily-notes-item');
    items[1].click();
    expect(onOpenFile).toHaveBeenCalledWith('/notes/daily/2026-09-10.md');
  });

  test('Enter / Space on a focused row opens it', async () => {
    const onOpenFile = jest.fn();
    const { container } = mountPanel({
      onOpenFile,
      listExisting: jest.fn().mockResolvedValue(['/notes/daily/2026-09-14.md']),
    });
    await flush();
    const row = container.querySelector('.daily-notes-item');
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(onOpenFile).toHaveBeenCalledWith('/notes/daily/2026-09-14.md');
  });
});

describe('renderDailyNotesPanel — refresh', () => {
  test('refresh button re-fetches the list', async () => {
    const listExisting = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['2026-09-14.md']);
    const { container, api } = mountPanel({ listExisting });
    await flush();
    expect(container.querySelectorAll('.daily-notes-item')).toHaveLength(0);

    api.refresh();
    await flush();
    expect(container.querySelectorAll('.daily-notes-item')).toHaveLength(1);
    expect(listExisting).toHaveBeenCalledTimes(2);
  });
});

describe('renderDailyNotesPanel — graceful degradation', () => {
  test('shows an error when listExisting rejects', async () => {
    const listExisting = jest.fn().mockRejectedValue(new Error('ENOENT'));
    const { container } = mountPanel({ listExisting });
    await flush();
    expect(container.querySelector('#daily-notes-status').textContent).toMatch(/ENOENT/);
  });

  test('shows an error when listExisting is not provided', async () => {
    const { container } = mountPanel({ listExisting: null });
    await flush();
    expect(container.querySelector('#daily-notes-status').textContent).toMatch(/unavailable/);
  });

  test('filters out non-md entries', async () => {
    const { container } = mountPanel({
      listExisting: jest.fn().mockResolvedValue(['2026-09-14.md', 'readme.txt', '.DS_Store']),
    });
    await flush();
    expect(container.querySelectorAll('.daily-notes-item')).toHaveLength(1);
  });
});
