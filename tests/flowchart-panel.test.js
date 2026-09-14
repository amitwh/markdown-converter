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

describe('flowchart-panel: selection wiring (canvas click → panel state + SVG class)', () => {
  // Match the SVG viewBox (1000x700) so client→svg mapping is 1:1 for the
  // canvas's getSvgPoint. Mirrors the layout prime in
  // tests/flowchart-canvas.test.js — duplicated here so the panel tests
  // stay self-contained.
  function primeCanvasLayout(container, nodes) {
    const svg = container.querySelector('svg.flowchart-canvas');
    if (!svg) return;
    svg.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      top: 0,
      left: 0,
      bottom: 700,
      right: 1000,
    });
    for (const n of nodes) {
      const g = container.querySelector(`g[data-node-id="${n.id}"]`);
      if (!g) continue;
      g.getBoundingClientRect = () => ({
        x: n.x,
        y: n.y,
        width: 80,
        height: 40,
        top: n.y,
        left: n.x,
        bottom: n.y + 40,
        right: n.x + 80,
      });
    }
  }
  function dispatch(target, type, opts) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, opts || {});
    target.dispatchEvent(ev);
  }

  test('clicking a node applies .selected class to the matching SVG <g>', () => {
    const { container, api } = mount();
    const store = api.getStore();
    const a = store.addNode({ kind: 'process', x: 100, y: 100, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 400, y: 100, label: 'B' });
    primeCanvasLayout(container, [
      { id: a.id, x: 100, y: 100 },
      { id: b.id, x: 400, y: 100 },
    ]);
    const nodeA = container.querySelector(`g[data-node-id="${a.id}"]`);
    // jsdom doesn't carry CSSOM class assertions from stylesheets — assert
    // on the SVG `class` attribute, which is what render() writes.
    expect(nodeA.getAttribute('class')).not.toMatch(/selected/);

    dispatch(nodeA, 'pointerdown', { clientX: 120, clientY: 110, pointerId: 1 });

    const updated = container.querySelector(`g[data-node-id="${a.id}"]`);
    expect(updated.getAttribute('class')).toMatch(/selected/);
    // The other node must remain un-selected.
    const other = container.querySelector(`g[data-node-id="${b.id}"]`);
    expect(other.getAttribute('class')).not.toMatch(/selected/);
  });

  test('clicking a second node moves .selected from the first to the second', () => {
    const { container, api } = mount();
    const store = api.getStore();
    const a = store.addNode({ kind: 'process', x: 100, y: 100, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 400, y: 100, label: 'B' });
    primeCanvasLayout(container, [
      { id: a.id, x: 100, y: 100 },
      { id: b.id, x: 400, y: 100 },
    ]);
    const nodeA = container.querySelector(`g[data-node-id="${a.id}"]`);
    // Click A.
    dispatch(nodeA, 'pointerdown', { clientX: 120, clientY: 110, pointerId: 1 });
    // SVG elements are replaced on each render() — re-query, then assert.
    const afterA = container.querySelector(`g[data-node-id="${a.id}"]`);
    const otherAfterA = container.querySelector(`g[data-node-id="${b.id}"]`);
    expect(afterA.getAttribute('class')).toMatch(/selected/);
    expect(otherAfterA.getAttribute('class')).not.toMatch(/selected/);

    // Re-prime the layout for the new B element (old one is detached) and
    // click B by re-querying it before dispatching.
    const freshB = container.querySelector(`g[data-node-id="${b.id}"]`);
    primeCanvasLayout(container, [{ id: b.id, x: 400, y: 100 }]);
    dispatch(freshB, 'pointerdown', { clientX: 420, clientY: 110, pointerId: 1 });
    const newA = container.querySelector(`g[data-node-id="${a.id}"]`);
    const newB = container.querySelector(`g[data-node-id="${b.id}"]`);
    expect(newA.getAttribute('class')).not.toMatch(/selected/);
    expect(newB.getAttribute('class')).toMatch(/selected/);
  });

  test('clicking an edge applies .selected class to the matching SVG <line>', () => {
    const { container, api } = mount();
    const store = api.getStore();
    const a = store.addNode({ kind: 'process', x: 100, y: 100, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 400, y: 100, label: 'B' });
    const e = store.connect(a.id, b.id, 'solid');
    primeCanvasLayout(container, [
      { id: a.id, x: 100, y: 100 },
      { id: b.id, x: 400, y: 100 },
    ]);
    const edgeLine = container.querySelector(`line[data-edge-id="${e.id}"]`);
    expect(edgeLine.getAttribute('class')).not.toMatch(/selected/);

    // The panel's onEdgeClick handler calls window.prompt — replace it
    // with a no-op jest.fn so the test doesn't hang or throw in jsdom.
    window.prompt = jest.fn().mockReturnValue(null);
    dispatch(edgeLine, 'pointerdown', { clientX: 280, clientY: 120, pointerId: 1 });

    const updated = container.querySelector(`line[data-edge-id="${e.id}"]`);
    expect(updated.getAttribute('class')).toMatch(/selected/);
  });

  test('clicking a node populates panel selection state so Delete removes it', () => {
    // Regression: v4.9.3 left the panel's `selectedNodeId` untouched on a
    // canvas click — only programmatic selectNode() worked. The result was
    // Delete/Backspace silently no-op'ing on a freshly-clicked node.
    const { container, api } = mount();
    const store = api.getStore();
    const a = store.addNode({ kind: 'process', x: 100, y: 100, label: 'A' });
    primeCanvasLayout(container, [{ id: a.id, x: 100, y: 100 }]);
    const nodeA = container.querySelector(`g[data-node-id="${a.id}"]`);
    dispatch(nodeA, 'pointerdown', { clientX: 120, clientY: 110, pointerId: 1 });

    expect(store.getGraph().nodes).toHaveLength(1);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(store.getGraph().nodes).toHaveLength(0);
  });
});

describe('flowchart-panel: maximize / takeover', () => {
  // Wrap the panel container in a fake `.main-content` so the takeover's
  // findMainContent() walker can locate it. Mirrors the real DOM layout in
  // src/index.html where `.sidebar-panel-content` lives inside `.sidebar`,
  // which lives inside `.main-content`.
  function mountWithMainContent(deps = {}) {
    const mainContent = document.createElement('div');
    mainContent.className = 'main-content';
    const sidebar = document.createElement('div');
    sidebar.className = 'sidebar';
    const panelContent = document.createElement('div');
    panelContent.className = 'sidebar-panel-content';
    panelContent.id = 'sidebar-panel-content';
    mainContent.appendChild(sidebar);
    sidebar.appendChild(panelContent);
    document.body.appendChild(mainContent);
    const api = renderFlowChartPanel(panelContent, {
      getUserDataPath: deps.getUserDataPath || (() => '/tmp/userdata'),
      readFile: deps.readFile || jest.fn().mockResolvedValue(null),
      writeFile: deps.writeFile || jest.fn().mockResolvedValue(undefined),
      insertAtCursor: deps.insertAtCursor || jest.fn(),
      renderMermaid: deps.renderMermaid || jest.fn(),
      ...deps,
    });
    return { mainContent, container: panelContent, api };
  }

  test('mount exposes a maximize button in the toolbar', () => {
    const { container } = mountWithMainContent();
    const btn = container.querySelector('.flowchart-maximize-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toMatch(/Maximize/);
  });

  test('clicking maximize toggles flowchart-takeover on .main-content', () => {
    const { mainContent, container } = mountWithMainContent();
    const btn = container.querySelector('.flowchart-maximize-btn');
    expect(mainContent.classList.contains('flowchart-takeover')).toBe(false);

    btn.click();
    expect(mainContent.classList.contains('flowchart-takeover')).toBe(true);
    // Button label flips to "Restore" so the user knows a second click
    // reverses the action.
    expect(btn.textContent).toMatch(/Restore/);
    expect(btn.classList.contains('active')).toBe(true);

    btn.click();
    expect(mainContent.classList.contains('flowchart-takeover')).toBe(false);
    expect(btn.textContent).toMatch(/Maximize/);
    expect(btn.classList.contains('active')).toBe(false);
  });

  test('destroy() clears the takeover class so the editor stays usable', () => {
    // Regression guard: if destroy() doesn't clear the takeover class,
    // switching panels (or closing the flowchart panel) leaves the editor
    // hidden for the rest of the session — a bad surprise.
    const { mainContent, container, api } = mountWithMainContent();
    const btn = container.querySelector('.flowchart-maximize-btn');
    btn.click();
    expect(mainContent.classList.contains('flowchart-takeover')).toBe(true);
    api.destroy();
    expect(mainContent.classList.contains('flowchart-takeover')).toBe(false);
  });
});
