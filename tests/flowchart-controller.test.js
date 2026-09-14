/**
 * @jest-environment jsdom
 *
 * Tests the standalone Flowchart Generator window's renderer controller
 * (src/renderer/flowchart-controller.js). Loads the real HTML and the
 * pure-module + controller scripts into jsdom, mocks
 * window.electronAPI.flowchart, and asserts:
 *   - The stylesheet links are src/-relative (no `..` escape).
 *   - bootstrap() resolves getUserDataPath exactly once and reads
 *     <userData>/flowchart-session.json.
 *   - "Insert at Cursor" wraps the Mermaid source in a fenced code block.
 *   - Reset clears nodes/edges and persists the empty graph.
 *   - The sidebar Flow Chart panel registration is commented out of
 *     src/renderer.js (regression: ensure the legacy sidebar doesn't
 *     re-appear).
 */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'src', 'flowchart-generator.html');
const CONTROLLER_PATH = path.join(__dirname, '..', 'src', 'renderer', 'flowchart-controller.js');
const RENDERER_PATH = path.join(__dirname, '..', 'src', 'renderer.js');

async function mount(apiMockOverrides = {}) {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');
  // Strip <head>/<body> wrappers — jsdom already provides those.
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;

  const apiMock = {
    getUserDataPath: jest.fn(async () => '/userdata'),
    readFile: jest.fn(async () => null),
    writeFile: jest.fn(async () => undefined),
    insertAtCursor: jest.fn(),
    ...apiMockOverrides,
  };
  window.electronAPI = { flowchart: apiMock };

  // Load the pure-module UMD scripts so the controller sees them as
  // window globals. Each is a self-contained IIFE; running them in the
  // current realm is enough — they don't need the DOM. The content of each
  // file is hardcoded under src/ (no user input) — same pattern used by
  // tests/ascii-controller.test.js.
  const scriptPaths = [
    'flowchart/flowchart-shapes.js',
    'flowchart/flowchart-mermaid.js',
    'flowchart/flowchart-store.js',
    'flowchart/flowchart-canvas.js',
  ];
  for (const rel of scriptPaths) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', src)(window, document);
  }
  // Then run the controller itself. The controller's IIFE auto-calls
  // bootstrap() at the end because document.readyState is 'complete' in
  // jsdom (not 'loading'). Wait for the bootstrap chain — which awaits
  // api.getUserDataPath() and api.readFile() — to settle, so callers see a
  // fully-initialized store and don't need to call bootstrap() themselves.
  const ctrlSrc = fs.readFileSync(CONTROLLER_PATH, 'utf-8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', ctrlSrc)(window, document);
  // Flush microtasks until the bootstrap's awaits resolve.
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }

  return { apiMock };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  delete window.electronAPI;
  delete window.FlowchartController;
  delete window.FlowchartShapes;
  delete window.FlowchartMermaid;
  delete window.FlowchartStore;
  delete window.FlowchartCanvas;
  delete window.FlowchartModals;
});

describe('flowchart-generator.html — stylesheet links', () => {
  test('all stylesheet hrefs are src/-relative (no "../" escape)', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    const linkRe = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    const hrefs = [];
    let match;
    while ((match = linkRe.exec(html)) !== null) hrefs.push(match[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith('../')).toBe(false);
    }
  });

  test('links fonts.css as the first stylesheet', () => {
    const html = fs.readFileSync(HTML_PATH, 'utf-8');
    expect(html).toMatch(/<link[^>]*href=["']fonts\.css["']/);
  });
});

describe('flowchart-controller: bootstrap', () => {
  test('resolves getUserDataPath exactly once on mount', async () => {
    const { apiMock } = await mount();
    expect(apiMock.getUserDataPath).toHaveBeenCalledTimes(1);
  });

  test('reads <userData>/flowchart-session.json on mount', async () => {
    const { apiMock } = await mount();
    expect(apiMock.readFile).toHaveBeenCalledWith('/userdata/flowchart-session.json');
  });

  test('hydrates the store from a saved session', async () => {
    const saved = JSON.stringify({
      nodes: [{ id: 'n1', kind: 'process', x: 10, y: 10, label: 'Loaded' }],
      edges: [],
    });
    await mount({ readFile: jest.fn(async () => saved) });
    await Promise.resolve();
    await Promise.resolve();
    const store = window.FlowchartController.store;
    expect(store.getGraph().nodes).toHaveLength(1);
    expect(store.getGraph().nodes[0].label).toBe('Loaded');
  });
});

describe('flowchart-controller: insert at cursor', () => {
  test('wraps the Mermaid source in a fenced code block', async () => {
    const { apiMock } = await mount();
    const store = window.FlowchartController.store;
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'Start' });
    store.addNode({ kind: 'process', x: 200, y: 0, label: 'End' });
    store.connect(store.getGraph().nodes[0].id, store.getGraph().nodes[1].id, 'solid');

    document.getElementById('fc-btn-insert').click();

    expect(apiMock.insertAtCursor).toHaveBeenCalledTimes(1);
    const fenced = apiMock.insertAtCursor.mock.calls[0][0];
    expect(fenced.startsWith('```mermaid\n')).toBe(true);
    expect(fenced.endsWith('\n```')).toBe(true);
    expect(fenced).toContain('flowchart TD');
    expect(fenced).toContain('A[Start]');
    expect(fenced).toContain('B[End]');
    expect(fenced).toContain('A --> B');
  });
});

describe('flowchart-controller: reset', () => {
  test('clears all nodes and edges after confirm', async () => {
    const { apiMock } = await mount();
    const store = window.FlowchartController.store;
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'One' });
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    expect(apiMock.writeFile).toHaveBeenCalled();

    // Mock confirm() to return true and click Reset.
    window.confirm = jest.fn(() => true);
    document.getElementById('fc-btn-reset').click();

    expect(store.getGraph().nodes).toHaveLength(0);
    expect(store.getGraph().edges).toHaveLength(0);

    // Reset mutation should trigger another persisted write within 500 ms.
    apiMock.writeFile.mockClear();
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    expect(apiMock.writeFile).toHaveBeenCalled();
    const lastCall = apiMock.writeFile.mock.calls[apiMock.writeFile.mock.calls.length - 1];
    expect(lastCall[0]).toBe('/userdata/flowchart-session.json');
    expect(JSON.parse(lastCall[1]).nodes).toHaveLength(0);
  });

  test('does nothing when the user cancels the confirm', async () => {
    await mount();
    const store = window.FlowchartController.store;
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'Keep me' });
    window.confirm = jest.fn(() => false);

    document.getElementById('fc-btn-reset').click();

    expect(store.getGraph().nodes).toHaveLength(1);
    expect(store.getGraph().nodes[0].label).toBe('Keep me');
  });
});

describe('flowchart-controller: renderer.js sidebar registration is disabled', () => {
  test('src/renderer.js no longer registers the flowchart sidebar panel', () => {
    const src = fs.readFileSync(RENDERER_PATH, 'utf-8');
    // The active code path should NOT call sidebarManager.registerPanel('flowchart', ...).
    // Strip /* ... */ block comments (legacy sidebar code is preserved as a
    // rollback comment block) AND // line comments so the regex doesn't match
    // the comment block describing the legacy registration.
    const blockStripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const stripped = blockStripped
      .split('\n')
      .filter((line) => !/^\s*\*/.test(line) && !/^\s*\/\//.test(line))
      .join('\n');
    expect(stripped).not.toMatch(/sidebarManager\.registerPanel\(\s*['"]flowchart['"]/);
  });

  test('the command-palette entry for "Toggle Sidebar: Flow Chart" is disabled', () => {
    const src = fs.readFileSync(RENDERER_PATH, 'utf-8');
    // Strip /* ... */ blocks (the legacy registration is preserved inside
    // such a block for rollback); only the live, uncommented registration
    // would match.
    const blockStripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const liveMatch = blockStripped.match(
      /^commandPalette\.register\(\s*['"]Toggle Sidebar: Flow Chart['"]/m
    );
    expect(liveMatch).toBeNull();
  });
});

// v4.9.7 regression — pure modules MUST expose themselves as window globals
// so the standalone Flowchart Generator window can load them via <script>
// tags. In Electron renderer with nodeIntegration:true, `module` is truthy,
// which used to make the UMD wrapper skip its browser-global assignment;
// this guard is now mandatory. We assert the source contains the
// `window.FlowchartXxx = exported;` line so a future refactor can't silently
// drop it again.
describe('flowchart pure modules — UMD browser-global assignment (v4.9.7)', () => {
  const cases = [
    ['flowchart/flowchart-store.js', 'FlowchartStore'],
    ['flowchart/flowchart-shapes.js', 'FlowchartShapes'],
    ['flowchart/flowchart-mermaid.js', 'FlowchartMermaid'],
    ['flowchart/flowchart-canvas.js', 'FlowchartCanvas'],
  ];
  test.each(cases)('%s assigns window.%s = exported', (rel, globalName) => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');
    expect(src).toMatch(new RegExp(`window\\.${globalName}\\s*=\\s*exported`));
  });
});

// v4.9.9 — Electron renderer contexts disable `window.prompt` and
// `window.confirm` (the BrowserWindow returns undefined when called),
// which broke shape change / edge kind / edge label / reset confirm in
// the standalone Flowchart Generator window. The bundle now ships
// `promptInline` and `confirmInline` (custom DOM overlay modals) and
// exposes them as `window.FlowchartModals` for testing. These tests load
// the real bundle into jsdom so we exercise the actual overlay code.
describe('flowchart-bundle: inline modal helpers (v4.9.9)', () => {
  const BUNDLE_PATH = path.join(__dirname, '..', 'src', 'renderer', 'flowchart-bundle.js');
  const HTML_PATH_BUNDLE = path.join(__dirname, '..', 'src', 'flowchart-generator.html');

  async function loadBundle() {
    const html = fs.readFileSync(HTML_PATH_BUNDLE, 'utf-8');
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
    window.electronAPI = {
      flowchart: {
        getUserDataPath: jest.fn(async () => '/userdata'),
        readFile: jest.fn(async () => null),
        writeFile: jest.fn(async () => undefined),
        insertAtCursor: jest.fn(),
      },
    };
    const bundleSrc = fs.readFileSync(BUNDLE_PATH, 'utf-8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', bundleSrc)(window, document);
    // Flush microtasks so the bootstrap chain settles before tests run.
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  }

  test('promptInline resolves with the entered value on OK click', async () => {
    await loadBundle();
    expect(typeof window.FlowchartModals.promptInline).toBe('function');
    const promise = window.FlowchartModals.promptInline({
      title: 'Edge kind',
      message: 'Enter the new edge kind.',
      defaultValue: 'solid',
    });
    const input = document.querySelector('input');
    expect(input).not.toBeNull();
    input.value = 'dotted';
    const okButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'OK'
    );
    expect(okButton).toBeDefined();
    okButton.click();
    await expect(promise).resolves.toBe('dotted');
    expect(document.querySelector('input')).toBeNull();
  });

  test('promptInline resolves null on Cancel click', async () => {
    await loadBundle();
    const promise = window.FlowchartModals.promptInline({
      title: 'Edge label',
      message: 'Enter a label.',
      defaultValue: '',
    });
    const cancelButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel'
    );
    expect(cancelButton).toBeDefined();
    cancelButton.click();
    await expect(promise).resolves.toBeNull();
    expect(document.querySelector('input')).toBeNull();
  });

  test('promptInline resolves null on Escape key', async () => {
    await loadBundle();
    const promise = window.FlowchartModals.promptInline({
      title: 'Edge kind',
      defaultValue: 'solid',
    });
    const input = document.querySelector('input');
    const ev = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    input.dispatchEvent(ev);
    await expect(promise).resolves.toBeNull();
  });

  test('confirmInline resolves true on OK click', async () => {
    await loadBundle();
    const promise = window.FlowchartModals.confirmInline({
      title: 'Reset diagram',
      message: 'Clear all nodes and edges?',
    });
    const okButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'OK'
    );
    expect(okButton).toBeDefined();
    okButton.click();
    await expect(promise).resolves.toBe(true);
  });

  test('confirmInline resolves false on Cancel click', async () => {
    await loadBundle();
    const promise = window.FlowchartModals.confirmInline({
      title: 'Reset diagram',
      message: 'Clear all nodes and edges?',
    });
    const cancelButton = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Cancel'
    );
    expect(cancelButton).toBeDefined();
    cancelButton.click();
    await expect(promise).resolves.toBe(false);
  });

  test('confirmInline with danger flag renders a Delete primary button', async () => {
    await loadBundle();
    const promise = window.FlowchartModals.confirmInline({
      title: 'Reset diagram',
      message: 'Clear all nodes and edges?',
      danger: true,
    });
    const buttons = Array.from(document.querySelectorAll('button'));
    const primary = buttons.find((b) => b.textContent === 'Delete');
    expect(primary).toBeDefined();
    expect(primary.style.background).toBe('rgb(207, 34, 46)');
    primary.click();
    await expect(promise).resolves.toBe(true);
  });
});

// v4.10.0 — the standalone Flowchart Generator window now ships a
// *visible* selection toolbar inside the canvas panel. When a node is
// selected, the toolbar exposes shape buttons + a label input + a
// Delete button — no right-click hidden menus, no window.prompt calls.
// These tests load the real bundle into jsdom and exercise the toolbar
// via the public FlowchartController.setSelection helper.
describe('flowchart-bundle: visible selection toolbar (v4.10.0)', () => {
  const BUNDLE_PATH = path.join(__dirname, '..', 'src', 'renderer', 'flowchart-bundle.js');
  const HTML_PATH_BUNDLE = path.join(__dirname, '..', 'src', 'flowchart-generator.html');

  async function loadBundleWithNodes() {
    const html = fs.readFileSync(HTML_PATH_BUNDLE, 'utf-8');
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
    window.electronAPI = {
      flowchart: {
        getUserDataPath: jest.fn(async () => '/userdata'),
        readFile: jest.fn(async () => null),
        writeFile: jest.fn(async () => undefined),
        insertAtCursor: jest.fn(),
      },
    };
    const bundleSrc = fs.readFileSync(BUNDLE_PATH, 'utf-8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', bundleSrc)(window, document);
    // Flush microtasks so bootstrap's awaits settle before tests run.
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    const store = window.FlowchartController.store;
    store.addNode({ kind: 'process', x: 10, y: 10, label: 'Alpha' });
    store.addNode({ kind: 'decision', x: 200, y: 10, label: 'Beta' });
    store.connect(store.getGraph().nodes[0].id, store.getGraph().nodes[1].id, 'solid');
    return store;
  }

  test('toolbar is hidden when nothing is selected', async () => {
    await loadBundleWithNodes();
    const toolbar = document.getElementById('fc-selection-toolbar');
    expect(toolbar.hidden).toBe(true);
    expect(toolbar.innerHTML).toBe('');
  });

  test('selecting a node populates the toolbar with shape buttons + label input + Delete', async () => {
    const store = await loadBundleWithNodes();
    const toolbar = document.getElementById('fc-selection-toolbar');
    const alpha = store.getGraph().nodes[0];

    window.FlowchartController.setSelection(alpha.id, 'node');

    expect(toolbar.hidden).toBe(false);
    const shapeButtons = toolbar.querySelectorAll('button[data-shape]');
    expect(shapeButtons).toHaveLength(5);
    const labels = Array.from(shapeButtons).map((b) => b.textContent);
    expect(labels).toEqual(['Process', 'Decision', 'Terminator', 'Subroutine', 'Document']);
    const active = toolbar.querySelector('button[data-shape].active');
    expect(active).not.toBeNull();
    expect(active.getAttribute('data-shape')).toBe('process');
    const labelInput = toolbar.querySelector('input.fc-tb-label-input');
    expect(labelInput).not.toBeNull();
    expect(labelInput.value).toBe('Alpha');
    const deleteBtn = toolbar.querySelector('button.fc-tb-delete');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn.textContent).toBe('Delete');
  });

  test('clicking a shape button updates the node kind', async () => {
    const store = await loadBundleWithNodes();
    const alpha = store.getGraph().nodes[0];

    window.FlowchartController.setSelection(alpha.id, 'node');
    const decisionBtn = document.querySelector(
      '#fc-selection-toolbar button[data-shape="decision"]'
    );
    expect(decisionBtn).not.toBeNull();
    decisionBtn.click();

    expect(store.getGraph().nodes[0].kind).toBe('decision');
    const active = document.querySelector('#fc-selection-toolbar button[data-shape].active');
    expect(active.getAttribute('data-shape')).toBe('decision');
  });

  test('typing into the label input updates the node label (debounced)', async () => {
    jest.useFakeTimers();
    try {
      const store = await loadBundleWithNodes();
      const alpha = store.getGraph().nodes[0];

      window.FlowchartController.setSelection(alpha.id, 'node');
      const input = document.querySelector('#fc-selection-toolbar input.fc-tb-label-input');
      input.value = 'Renamed';
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      // Debounce is 100ms — before that, store is unchanged.
      expect(store.getGraph().nodes[0].label).toBe('Alpha');
      jest.advanceTimersByTime(150);
      expect(store.getGraph().nodes[0].label).toBe('Renamed');
    } finally {
      jest.useRealTimers();
    }
  });

  test('selecting an edge populates the toolbar with edge-kind buttons', async () => {
    const store = await loadBundleWithNodes();
    const edge = store.getGraph().edges[0];
    const toolbar = document.getElementById('fc-selection-toolbar');

    window.FlowchartController.setSelection(edge.id, 'edge');

    expect(toolbar.hidden).toBe(false);
    const edgeButtons = toolbar.querySelectorAll('button[data-kind]');
    expect(edgeButtons).toHaveLength(3);
    const labels = Array.from(edgeButtons).map((b) => b.textContent);
    expect(labels).toEqual(['Solid', 'Dotted', 'Thick']);
    const active = toolbar.querySelector('button[data-kind].active');
    expect(active.getAttribute('data-kind')).toBe('solid');
  });

  test('Delete button removes the selected node and clears the toolbar', async () => {
    const store = await loadBundleWithNodes();
    const alpha = store.getGraph().nodes[0];
    const toolbar = document.getElementById('fc-selection-toolbar');

    window.FlowchartController.setSelection(alpha.id, 'node');
    expect(toolbar.hidden).toBe(false);

    const deleteBtn = toolbar.querySelector('button.fc-tb-delete');
    deleteBtn.click();

    expect(store.getGraph().nodes.find((n) => n.id === alpha.id)).toBeUndefined();
    // The deleted node's id is gone — selection collapses.
    expect(toolbar.hidden).toBe(true);
  });
});
