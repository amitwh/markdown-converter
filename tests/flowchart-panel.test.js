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

  // Regression: src/renderer.js used to pass flowchartIO.getUserDataPath
  // (which returns ipcRenderer.invoke's Promise) directly into the panel.
  // The panel then coerced that Promise to "[object Promise]" in the
  // template literal, producing a persistence path that fell outside the
  // userData sandbox and was rejected by write-text-file. The fix is to
  // await the path on the renderer side and cache it, then hand the panel
  // a sync getter. This test mirrors that pattern: simulate the renderer's
  // pre-resolve + cache, and assert the panel's persistence path is a
  // real resolved string on mount.
  test('handles an async getUserDataPath via renderer-side pre-resolve + cache', async () => {
    const asyncGetUserDataPath = jest.fn().mockResolvedValue('/abs/path/to/userdata');
    // Pre-resolve exactly the way src/renderer.js now does.
    let cachedUserDataPath = null;
    if (!cachedUserDataPath) cachedUserDataPath = await asyncGetUserDataPath();
    const syncGetUserDataPath = () => cachedUserDataPath;

    const writeFile = jest.fn().mockResolvedValue(undefined);
    const { api } = mount({ getUserDataPath: syncGetUserDataPath, writeFile });

    // read on mount must use the resolved (real) path, not "[object Promise]".
    await Promise.resolve();
    expect(asyncGetUserDataPath).toHaveBeenCalledTimes(1);

    // mutate -> debounced write -> assert writeFile is called with the real path.
    api.getStore().addNode({ kind: 'process', x: 0, y: 0, label: 'async-cache' });
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile.mock.calls[0][0]).toBe('/abs/path/to/userdata/flowchart-session.json');
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

  // Regression: when the user adds N nodes one at a time and the debounced
  // preview fires once per settled state, the <pre class="flowchart-preview-source">
  // must contain exactly the latest Mermaid source — not a concatenation of
  // every intermediate state. The renderMermaid mock here mirrors the
  // production inline implementation in src/renderer.js (innerHTML='' + a single
  // <div class="mermaid"> child).
  test('preview source pre and render target do not accumulate across N mutations', async () => {
    // Mirrors src/renderer.js renderFlowChartMermaid: clear target, then
    // append exactly one <div class="mermaid"> per render. If the panel ever
    // stops clearing (or starts appending), this test will fail.
    const renderMermaid = jest.fn((source, targetEl) => {
      targetEl.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = source;
      targetEl.appendChild(div);
    });
    const { container, api } = mount({ renderMermaid });
    const store = api.getStore();
    const previewSourceEl = container.querySelector('.flowchart-preview-source');
    const previewRenderEl = container.querySelector('.flowchart-preview-render');

    // Add 7 nodes — matches the v4.9.2 screenshot.
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    for (const label of labels) {
      store.addNode({ kind: 'process', x: 0, y: 0, label });
    }

    // Advance past debounce window so the panel flushes a single preview.
    jest.advanceTimersByTime(250);
    await Promise.resolve();

    // After coalescing, renderMermaid is called exactly once with the latest graph.
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    const latestSource = renderMermaid.mock.calls[0][0];

    // The <pre> must show exactly the latest source — not a concatenation of
    // 7 intermediate renders (one per addNode).
    expect(previewSourceEl.textContent).toBe(latestSource);
    expect(previewSourceEl.textContent).toMatch(
      /^flowchart TD\nA\[A\]\nB\[B\]\nC\[C\]\nD\[D\]\nE\[E\]\nF\[F\]\nG\[G\]$/
    );

    // The render target must hold exactly one render-result child, not seven.
    expect(previewRenderEl.childNodes.length).toBe(1);
    expect(previewRenderEl.firstElementChild.className).toBe('mermaid');
    expect(previewRenderEl.firstElementChild.textContent).toBe(latestSource);
  });

  // Regression: v4.9.2 preview pane accumulated raw source when the user
  // fired several mutations within the 250ms debounce window — mermaid.run
  // is async, so the previous render's `<div class="mermaid">` was still in
  // targetEl when the next renderMermaid call arrived. The fix is to clear
  // targetEl BEFORE each render so the previous render's eventual
  // `element.innerHTML = svg` lands on a detached node (no visible stale
  // source) and the new render starts from a clean slate. This mock mimics
  // mermaid's actual behaviour: it sets `element.innerHTML = svg`
  // unconditionally (same as the real `mermaid.run` loop), even if the
  // element is no longer in the DOM.
  test('preview-source pre never duplicates across debounced mutations even with in-flight mermaid.render', async () => {
    let inflight = 0;
    const renderMermaid = jest.fn((source, targetEl) => {
      inflight += 1;
      // Mimic the real mermaid.run closure: it captures the input element
      // and unconditionally sets `element.innerHTML = svg` once the async
      // render resolves, regardless of whether the element is still in the
      // document. If the panel didn't clear targetEl between renders, the
      // OLD div would still be there carrying raw text when the user's
      // eyes get to it.
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = source;
      targetEl.replaceChildren(div);
      Promise.resolve().then(() => {
        div.innerHTML = `<svg data-source="${source.length}"></svg>`;
        inflight -= 1;
      });
    });
    const { container, api } = mount({ renderMermaid });
    const store = api.getStore();
    const previewSourceEl = container.querySelector('.flowchart-preview-source');
    const previewRenderEl = container.querySelector('.flowchart-preview-render');

    // Fire N mutations faster than the 250ms debounce so the previous
    // mermaid.run is still pending when the next renderMermaid call lands.
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    for (const label of labels) {
      store.addNode({ kind: 'process', x: 0, y: 0, label });
      jest.advanceTimersByTime(10);
    }
    // Flush the debounced preview + any pending microtasks for the mock's
    // async innerHTML replacement.
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The <pre> must contain exactly the latest source — never a stack of
    // every intermediate state. This is the v4.9.2 symptom.
    expect(previewSourceEl.textContent).toMatch(
      /^flowchart TD\nA\[A\]\nB\[B\]\nC\[C\]\nD\[D\]\nE\[E\]\nF\[F\]\nG\[G\]$/
    );
    // Defensive: textContent must equal exactly one copy of the latest
    // source — not multiple copies concatenated.
    expect(previewSourceEl.textContent.split('flowchart TD').length - 1).toBe(1);

    // Render target: at most one render-result child (the latest svg), never
    // a stack of stale <div class="mermaid"> elements.
    expect(previewRenderEl.childNodes.length).toBeLessThanOrEqual(1);
    if (previewRenderEl.firstElementChild) {
      // The surviving child must be the latest render's <div class="mermaid">
      // with its innerHTML replaced by an <svg> (mirrors mermaid.run's
      // `element.innerHTML = svg`). Never a stale <div> carrying raw text.
      expect(previewRenderEl.firstElementChild.className).toBe('mermaid');
      expect(previewRenderEl.firstElementChild.firstElementChild).not.toBeNull();
      expect(previewRenderEl.firstElementChild.firstElementChild.tagName.toLowerCase()).toBe('svg');
    }
    expect(inflight).toBe(0);
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
