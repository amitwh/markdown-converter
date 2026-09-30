/**
 * @jest-environment jsdom
 *
 * Quick-switcher overlay UI.
 *
 * Mounts a modal centered over the viewport. Pure controller logic
 * (fuzzy match, ranking) lives in fuzzy-matcher.js — this test only
 * covers DOM contract, keyboard nav, and the wiring between user
 * input and the deps callbacks.
 */

const { createQuickSwitcherOverlay } = require('../src/quick-switcher/quick-switcher-overlay');
const { rankResults } = require('../src/quick-switcher/fuzzy-matcher');

async function flush(ms = 0) {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function mount(deps = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const overlay = createQuickSwitcherOverlay(container, {
    getOpenTabPaths: deps.getOpenTabPaths || (() => []),
    listWorkspaceFiles:
      deps.listWorkspaceFiles ||
      jest.fn().mockResolvedValue([
        { path: '/ws/readme.md', name: 'readme.md' },
        { path: '/ws/notes.md', name: 'notes.md' },
      ]),
    onOpenFile: deps.onOpenFile || jest.fn(),
    getWorkspaceDir: deps.getWorkspaceDir || (() => '/ws'),
    rankResults: deps.rankResults || rankResults,
    debounceMs: 0, // tests don't wait for debounce
    ...deps,
  });
  return { container, overlay };
}

function getInput(container) {
  return container.querySelector('.quick-switcher-input');
}

function getItems(container) {
  return Array.from(container.querySelectorAll('.quick-switcher-item'));
}

function selectedIndex(container) {
  const items = getItems(container);
  return items.findIndex((el) => el.classList.contains('selected'));
}

function dispatchKey(target, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('createQuickSwitcherOverlay — show/hide', () => {
  test('show() mounts DOM structure into container', () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    expect(container.querySelector('.quick-switcher-modal')).not.toBeNull();
    expect(container.querySelector('.quick-switcher-input')).not.toBeNull();
    expect(container.querySelector('.quick-switcher-list')).not.toBeNull();
  });

  test('show() focuses the input', () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    const input = getInput(container);
    expect(document.activeElement).toBe(input);
  });

  test('hide() removes the open class but keeps the DOM mounted', () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    overlay.hide();
    const modal = container.querySelector('.quick-switcher-modal');
    expect(modal).not.toBeNull();
    expect(modal.classList.contains('open')).toBe(false);
  });

  test('destroy() removes the DOM entirely', () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    overlay.destroy();
    expect(container.querySelector('.quick-switcher-modal')).toBeNull();
  });

  test('isOpen() reflects state', () => {
    const { overlay } = mount();
    expect(overlay.isOpen()).toBe(false);
    overlay.show({ recent: [] });
    expect(overlay.isOpen()).toBe(true);
    overlay.hide();
    expect(overlay.isOpen()).toBe(false);
  });
});

describe('createQuickSwitcherOverlay — initial results', () => {
  test('empty query shows recent files first', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/recent-a.md', '/ws/recent-b.md'] });
    await flush();
    const items = getItems(container);
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('recent-a');
  });

  test('empty query with no recent shows open tabs', async () => {
    const { container, overlay } = mount({
      getOpenTabPaths: () => ['/ws/open.md'],
    });
    overlay.show({ recent: [] });
    await flush();
    const items = getItems(container);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('open.md');
  });

  test('empty query with no recent and no tabs shows an empty state', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    await flush();
    expect(container.querySelector('.quick-switcher-empty')).not.toBeNull();
    expect(getItems(container)).toHaveLength(0);
  });
});

describe('createQuickSwitcherOverlay — typing & filtering', () => {
  test('typing a query filters the list via fuzzy matcher', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/readme.md', '/ws/notes.md', '/ws/idea.md'] });
    await flush();

    const input = getInput(container);
    input.value = 'idea';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    const items = getItems(container);
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('idea.md');
  });

  test('typing with no match shows the "no matches" state', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/readme.md'] });
    await flush();

    const input = getInput(container);
    input.value = 'xyzqwerty';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(container.querySelector('.quick-switcher-empty')).not.toBeNull();
    expect(getItems(container)).toHaveLength(0);
  });

  test('selection defaults to the top result', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/readme.md', '/ws/idea.md'] });
    await flush();
    expect(selectedIndex(container)).toBe(0);
  });
});

describe('createQuickSwitcherOverlay — keyboard navigation', () => {
  test('ArrowDown moves selection down', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/a.md', '/ws/b.md', '/ws/c.md'] });
    await flush();

    const input = getInput(container);
    dispatchKey(input, 'ArrowDown');
    await flush();
    expect(selectedIndex(container)).toBe(1);

    dispatchKey(input, 'ArrowDown');
    await flush();
    expect(selectedIndex(container)).toBe(2);
  });

  test('ArrowUp moves selection up', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/a.md', '/ws/b.md', '/ws/c.md'] });
    await flush();

    const input = getInput(container);
    // Start at 0, go down twice, back up once
    dispatchKey(input, 'ArrowDown');
    dispatchKey(input, 'ArrowDown');
    dispatchKey(input, 'ArrowUp');
    await flush();
    expect(selectedIndex(container)).toBe(1);
  });

  test('ArrowDown clamps at the last item', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/a.md', '/ws/b.md'] });
    await flush();
    const input = getInput(container);
    dispatchKey(input, 'ArrowDown');
    dispatchKey(input, 'ArrowDown');
    dispatchKey(input, 'ArrowDown');
    await flush();
    expect(selectedIndex(container)).toBe(1);
  });

  test('ArrowUp clamps at 0', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: ['/ws/a.md'] });
    await flush();
    const input = getInput(container);
    dispatchKey(input, 'ArrowUp');
    await flush();
    expect(selectedIndex(container)).toBe(0);
  });

  test('Enter calls onOpenFile with the selected path', async () => {
    const onOpenFile = jest.fn();
    const { container, overlay } = mount({ onOpenFile });
    overlay.show({ recent: ['/ws/a.md', '/ws/b.md'] });
    await flush();
    const input = getInput(container);
    dispatchKey(input, 'ArrowDown'); // select /ws/b.md
    dispatchKey(input, 'Enter');
    await flush();
    expect(onOpenFile).toHaveBeenCalledTimes(1);
    expect(onOpenFile).toHaveBeenCalledWith('/ws/b.md');
  });

  test('Esc hides the overlay without calling onOpenFile', async () => {
    const onOpenFile = jest.fn();
    const { overlay } = mount({ onOpenFile });
    overlay.show({ recent: ['/ws/a.md'] });
    await flush();
    dispatchKey(document, 'Escape');
    await flush();
    expect(overlay.isOpen()).toBe(false);
    expect(onOpenFile).not.toHaveBeenCalled();
  });
});

describe('createQuickSwitcherOverlay — workspace toggle', () => {
  test('workspace toggle calls listWorkspaceFiles with workspace dir', async () => {
    const listWorkspaceFiles = jest
      .fn()
      .mockResolvedValue([{ path: '/ws/ws-only.md', name: 'ws-only.md' }]);
    const { container, overlay } = mount({
      listWorkspaceFiles,
      getWorkspaceDir: () => '/ws',
    });
    overlay.show({ recent: [] });
    await flush();

    const toggle = container.querySelector('.quick-switcher-workspace-toggle');
    expect(toggle).not.toBeNull();
    toggle.click();
    await flush();

    expect(listWorkspaceFiles).toHaveBeenCalled();
    const args = listWorkspaceFiles.mock.calls[0][0];
    expect(args).toBe('/ws');
  });

  test('workspace toggle off by default (recent + tabs only)', async () => {
    const listWorkspaceFiles = jest.fn().mockResolvedValue([]);
    const { overlay } = mount({
      listWorkspaceFiles,
      getWorkspaceDir: () => '/ws',
    });
    overlay.show({ recent: ['/recent.md'] });
    await flush();
    expect(listWorkspaceFiles).not.toHaveBeenCalled();
  });
});

describe('createQuickSwitcherOverlay — escape hatches', () => {
  test('backdrop click hides the overlay', async () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    await flush();
    const backdrop = container.querySelector('.quick-switcher-backdrop');
    backdrop.click();
    await flush();
    expect(overlay.isOpen()).toBe(false);
  });

  test('multiple show/hide cycles reuse the same DOM', () => {
    const { container, overlay } = mount();
    overlay.show({ recent: [] });
    const modalA = container.querySelector('.quick-switcher-modal');
    overlay.hide();
    overlay.show({ recent: [] });
    const modalB = container.querySelector('.quick-switcher-modal');
    expect(modalA).toBe(modalB);
  });
});

describe('createQuickSwitcherOverlay — getSelectedPath', () => {
  test('returns the path of the current selection', async () => {
    const { overlay } = mount();
    overlay.show({ recent: ['/ws/a.md', '/ws/b.md'] });
    await flush();
    expect(overlay.getSelectedPath()).toBe('/ws/a.md');
  });

  test('returns null when no items', async () => {
    const { overlay } = mount();
    overlay.show({ recent: [] });
    await flush();
    expect(overlay.getSelectedPath()).toBeNull();
  });
});
