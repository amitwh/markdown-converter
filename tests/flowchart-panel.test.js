/**
 * @jest-environment jsdom
 */
jest.useFakeTimers();

const { renderFlowChartPanel } = require('../src/sidebar/flowchart-panel');

function mount(deps = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = renderFlowChartPanel(container, {
    getUserDataPath: deps.getUserDataPath || (() => '/tmp/userdata'),
    readFile: deps.readFile || jest.fn().mockResolvedValue(null),
    writeFile: deps.writeFile || jest.fn().mockResolvedValue(undefined),
    insertAtCursor: deps.insertAtCursor || jest.fn(),
    renderMermaid: deps.renderMermaid || jest.fn(),
    ...deps,
  });
  return { container, api };
}

describe('flowchart-panel: mounting', () => {
  test('mounts canvas + preview panes', () => {
    const { container } = mount();
    expect(container.querySelector('.flowchart-panel')).not.toBeNull();
    expect(container.querySelector('.flowchart-canvas-host')).not.toBeNull();
    expect(container.querySelector('.flowchart-preview-host')).not.toBeNull();
    expect(container.querySelector('svg.flowchart-canvas')).not.toBeNull();
    expect(container.querySelector('.flowchart-insert-btn')).not.toBeNull();
  });

  test('exposes an <svg> on the returned api', () => {
    const { api } = mount();
    expect(api.getSvg().tagName.toLowerCase()).toBe('svg');
  });
});

describe('flowchart-panel: persistence', () => {
  test('reads from <userData>/flowchart-session.json on mount', async () => {
    const readFile = jest.fn().mockResolvedValue(
      JSON.stringify({
        nodes: [{ id: 'n1', kind: 'process', x: 10, y: 10, label: 'Loaded' }],
        edges: [],
      })
    );
    mount({ readFile });
    await Promise.resolve();
    expect(readFile).toHaveBeenCalledWith('/tmp/userdata/flowchart-session.json');
  });

  test('writes debounced snapshot after a mutation (500ms)', async () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    const { api } = mount({ writeFile });
    const store = api.getStore();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'New' });
    expect(writeFile).not.toHaveBeenCalled();
    jest.advanceTimersByTime(500);
    // Allow the awaited writeFile microtask to resolve.
    await Promise.resolve();
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, content] = writeFile.mock.calls[0];
    expect(path).toBe('/tmp/userdata/flowchart-session.json');
    expect(JSON.parse(content).nodes).toHaveLength(1);
  });

  test('corrupt JSON does not crash mount', async () => {
    const readFile = jest.fn().mockResolvedValue('{not-json');
    expect(() => mount({ readFile })).not.toThrow();
  });
});

describe('flowchart-panel: live preview', () => {
  test('re-renders preview within 250ms of a store change', async () => {
    const renderMermaid = jest.fn();
    const { api } = mount({ renderMermaid });
    api.getStore().addNode({ kind: 'process', x: 0, y: 0, label: 'Preview me' });
    expect(renderMermaid).not.toHaveBeenCalled();
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    const source = renderMermaid.mock.calls[0][0];
    expect(source).toMatch(/^flowchart TD/);
    expect(source).toMatch(/Preview me/);
  });
});

describe('flowchart-panel: insert at cursor', () => {
  test('clicking Insert wraps Mermaid source in a fenced code block', async () => {
    const insertAtCursor = jest.fn();
    const renderMermaid = jest.fn();
    const { container, api } = mount({ insertAtCursor, renderMermaid });
    api.getStore().addNode({ kind: 'process', x: 0, y: 0, label: 'Hi' });
    jest.advanceTimersByTime(250);
    await Promise.resolve();
    container.querySelector('.flowchart-insert-btn').click();
    expect(insertAtCursor).toHaveBeenCalledTimes(1);
    const text = insertAtCursor.mock.calls[0][0];
    expect(text.startsWith('```mermaid\n')).toBe(true);
    expect(text.endsWith('\n```')).toBe(true);
    expect(text).toMatch(/Hi/);
  });
});

describe('flowchart-panel: keyboard shortcuts', () => {
  test('Ctrl+Z triggers undo', () => {
    const { api, container } = mount();
    const store = api.getStore();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(store.canUndo()).toBe(true);
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
    );
    expect(store.getGraph().nodes).toHaveLength(0);
  });

  test('Ctrl+Shift+Z triggers redo', () => {
    const { api, container } = mount();
    const store = api.getStore();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.undo();
    expect(store.canRedo()).toBe(true);
    container.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
    expect(store.getGraph().nodes).toHaveLength(1);
  });

  test('Delete removes the selected node', () => {
    const { api, container } = mount();
    const store = api.getStore();
    const n = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    // Select the node programmatically (canvas does this on pointerdown).
    api.selectNode(n.id);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(store.getGraph().nodes).toHaveLength(0);
  });
});
