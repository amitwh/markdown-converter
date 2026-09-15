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

// v4.11.0 — the standalone Flowchart Generator window's click-on-canvas
// interactions were unreliable in the user's Electron runtime (the
// v4.10.0 floating selection toolbar still depended on SVG click hit-
// testing). Replaced with a button-driven node-list panel (#fc-nodelist)
// below the canvas. Every mutation — add/delete node, change kind, edit
// label, add/delete edge, change edge kind, edit edge label — is wired
// to explicit buttons and form controls. These tests load the real
// bundle into jsdom and exercise the panel via the real DOM, asserting
// the resulting store mutations.
describe('flowchart-bundle: button-driven node-list panel (v4.11.0)', () => {
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
    // Flush microtasks so bootstrap's awaits settle before tests run.
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    return window.FlowchartController.store;
  }

  test('all 5 Add Node buttons create a node with the matching kind', async () => {
    const store = await loadBundle();
    const expectedKinds = ['process', 'decision', 'terminator', 'subroutine', 'document'];
    for (const kind of expectedKinds) {
      const btn = document.querySelector(`.fc-add-row .fc-btn[data-add="${kind}"]`);
      expect(btn).not.toBeNull();
      btn.click();
    }
    const nodes = store.getGraph().nodes;
    expect(nodes).toHaveLength(5);
    for (let i = 0; i < expectedKinds.length; i += 1) {
      expect(nodes[i].kind).toBe(expectedKinds[i]);
    }
  });

  test('node list re-renders with one <li> per node, each with kind-select + label-input + delete', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'One' });
    store.addNode({ kind: 'decision', x: 100, y: 0, label: 'Two' });

    const ul = document.getElementById('fc-nodelist-ul');
    const items = ul.querySelectorAll('li');
    expect(items).toHaveLength(2);

    for (const li of items) {
      expect(li.querySelector('.fc-node-id')).not.toBeNull();
      expect(li.querySelector('select')).not.toBeNull();
      expect(li.querySelector('input')).not.toBeNull();
      expect(li.querySelector('button.fc-delete')).not.toBeNull();
    }
    expect(document.getElementById('fc-node-count').textContent).toBe('2');
  });

  test('changing the per-node kind <select> updates the store', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'X' });
    const li = document.getElementById('fc-nodelist-ul').querySelector('li');
    const sel = li.querySelector('select');
    sel.value = 'terminator';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(store.getGraph().nodes[0].kind).toBe('terminator');
  });

  test('editing the per-node label <input> updates the store', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'Old' });
    const li = document.getElementById('fc-nodelist-ul').querySelector('li');
    const input = li.querySelector('input');
    input.value = 'New';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(store.getGraph().nodes[0].label).toBe('New');
  });

  test('clicking the per-node delete × removes the node from the store', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'Bye' });
    const li = document.getElementById('fc-nodelist-ul').querySelector('li');
    li.querySelector('button.fc-delete').click();
    expect(store.getGraph().nodes).toHaveLength(0);
    expect(document.getElementById('fc-nodelist-ul').querySelectorAll('li')).toHaveLength(0);
  });

  test('+ Edge button (with from + to selects) creates an edge in the store', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.addNode({ kind: 'process', x: 200, y: 0, label: 'B' });

    // Both selects should have one option per node (re-rendered on subscribe).
    const fromSel = document.getElementById('fc-connect-from');
    const toSel = document.getElementById('fc-connect-to');
    expect(fromSel.querySelectorAll('option')).toHaveLength(2);
    expect(toSel.querySelectorAll('option')).toHaveLength(2);

    fromSel.value = store.getGraph().nodes[0].id;
    toSel.value = store.getGraph().nodes[1].id;
    document.getElementById('fc-connect-btn').click();

    const edges = store.getGraph().edges;
    expect(edges).toHaveLength(1);
    expect(edges[0].fromNodeId).toBe(store.getGraph().nodes[0].id);
    expect(edges[0].toNodeId).toBe(store.getGraph().nodes[1].id);
    expect(edges[0].kind).toBe('solid');
  });

  test('selecting the same node for from + to is a no-op (no self-loop edge)', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'Solo' });
    const fromSel = document.getElementById('fc-connect-from');
    const toSel = document.getElementById('fc-connect-to');
    fromSel.value = store.getGraph().nodes[0].id;
    toSel.value = store.getGraph().nodes[0].id;
    document.getElementById('fc-connect-btn').click();
    expect(store.getGraph().edges).toHaveLength(0);
  });

  test('edge list shows each edge with kind-select + label-input + delete ×', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.addNode({ kind: 'decision', x: 200, y: 0, label: 'B' });
    store.connect(store.getGraph().nodes[0].id, store.getGraph().nodes[1].id, 'dotted');

    const ul = document.getElementById('fc-edgelist-ul');
    const items = ul.querySelectorAll('li');
    expect(items).toHaveLength(1);
    const li = items[0];
    expect(li.querySelector('.fc-node-id')).not.toBeNull();
    expect(li.querySelector('select')).not.toBeNull();
    expect(li.querySelector('input')).not.toBeNull();
    expect(li.querySelector('button.fc-delete')).not.toBeNull();
    expect(document.getElementById('fc-edge-count').textContent).toBe('1');
  });

  test('changing the per-edge kind <select> updates the store', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.addNode({ kind: 'process', x: 200, y: 0, label: 'B' });
    store.connect(store.getGraph().nodes[0].id, store.getGraph().nodes[1].id, 'solid');

    const li = document.getElementById('fc-edgelist-ul').querySelector('li');
    const sel = li.querySelector('select');
    sel.value = 'thick';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(store.getGraph().edges[0].kind).toBe('thick');
  });

  test('clicking the per-edge delete × removes the edge from the store', async () => {
    const store = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.addNode({ kind: 'process', x: 200, y: 0, label: 'B' });
    store.connect(store.getGraph().nodes[0].id, store.getGraph().nodes[1].id, 'solid');

    const li = document.getElementById('fc-edgelist-ul').querySelector('li');
    li.querySelector('button.fc-delete').click();
    expect(store.getGraph().edges).toHaveLength(0);
  });

  test('subscribe re-renders the lists on every store mutation', async () => {
    const store = await loadBundle();
    const nodelistUl = document.getElementById('fc-nodelist-ul');
    const edgelistUl = document.getElementById('fc-edgelist-ul');
    expect(nodelistUl.querySelectorAll('li')).toHaveLength(0);
    expect(edgelistUl.querySelectorAll('li')).toHaveLength(0);

    store.addNode({ kind: 'process', x: 0, y: 0, label: 'X' });
    store.addNode({ kind: 'decision', x: 200, y: 0, label: 'Y' });
    expect(nodelistUl.querySelectorAll('li')).toHaveLength(2);

    store.connect(store.getGraph().nodes[0].id, store.getGraph().nodes[1].id, 'solid');
    expect(edgelistUl.querySelectorAll('li')).toHaveLength(1);

    store.removeNode(store.getGraph().nodes[0].id);
    expect(nodelistUl.querySelectorAll('li')).toHaveLength(1);
    // Removing a node cascades into removing its edges.
    expect(edgelistUl.querySelectorAll('li')).toHaveLength(0);
  });
});

// v4.12.0 — per-node fill color picker. The user asked for the ability to
// color individual nodes. The bundle renders a native <input type="color">
// per node row, and `input` events call store.setNodeColor. The default
// (newly-added) value is #ffffff.
describe('flowchart-bundle: per-node color picker (v4.12.0)', () => {
  const BUNDLE_PATH = path.join(__dirname, '..', 'src', 'renderer', 'flowchart-bundle.js');
  const HTML_PATH_BUNDLE = path.join(__dirname, '..', 'src', 'flowchart-generator.html');

  async function loadBundle(apiOverrides = {}) {
    const html = fs.readFileSync(HTML_PATH_BUNDLE, 'utf-8');
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
    const apiMock = {
      getUserDataPath: jest.fn(async () => '/userdata'),
      readFile: jest.fn(async () => null),
      writeFile: jest.fn(async () => undefined),
      insertAtCursor: jest.fn(),
      saveFile: jest.fn(async () => ({ canceled: false, path: '/tmp/out.mmd' })),
      ...apiOverrides,
    };
    window.electronAPI = { flowchart: apiMock };
    const bundleSrc = fs.readFileSync(BUNDLE_PATH, 'utf-8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', bundleSrc)(window, document);
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    return { store: window.FlowchartController.store, apiMock };
  }

  test('each node row exposes a color <input type="color">', async () => {
    const { store } = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const li = document.getElementById('fc-nodelist-ul').querySelector('li');
    const colorInput = li.querySelector('input[type="color"]');
    expect(colorInput).not.toBeNull();
    expect(colorInput.value).toBe('#ffffff');
  });

  test('changing the color <input> calls store.setNodeColor', async () => {
    const { store } = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const li = document.getElementById('fc-nodelist-ul').querySelector('li');
    const colorInput = li.querySelector('input[type="color"]');
    colorInput.value = '#336699';
    colorInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(store.getGraph().nodes[0].color).toBe('#336699');
  });

  test('the canvas SVG <rect> reflects the chosen color after a setNodeColor mutation', async () => {
    const { store } = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.setNodeColor(store.getGraph().nodes[0].id, '#abcdef');
    await Promise.resolve();
    const nodeG = document.querySelector('svg.flowchart-canvas g[data-node-id]');
    const rect = nodeG && nodeG.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect.getAttribute('fill')).toBe('#abcdef');
  });
});

// v4.12.0 — Save to File. The bundle wires #fc-btn-save to api.saveFile
// with the Mermaid-fenced source and a default filename of 'flowchart.mmd'.
// Cancel / error paths surface in the status text.
describe('flowchart-bundle: Save to File button (v4.12.0)', () => {
  const BUNDLE_PATH = path.join(__dirname, '..', 'src', 'renderer', 'flowchart-bundle.js');
  const HTML_PATH_BUNDLE = path.join(__dirname, '..', 'src', 'flowchart-generator.html');

  async function loadBundle(apiOverrides = {}) {
    const html = fs.readFileSync(HTML_PATH_BUNDLE, 'utf-8');
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    document.body.innerHTML = bodyMatch ? bodyMatch[1] : html;
    const apiMock = {
      getUserDataPath: jest.fn(async () => '/userdata'),
      readFile: jest.fn(async () => null),
      writeFile: jest.fn(async () => undefined),
      insertAtCursor: jest.fn(),
      saveFile: jest.fn(async () => ({ canceled: false, path: '/tmp/out.mmd' })),
      ...apiOverrides,
    };
    window.electronAPI = { flowchart: apiMock };
    const bundleSrc = fs.readFileSync(BUNDLE_PATH, 'utf-8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', bundleSrc)(window, document);
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
    return { store: window.FlowchartController.store, apiMock };
  }

  test('Save to File calls api.saveFile with the Mermaid-fenced source', async () => {
    const { store, apiMock } = await loadBundle();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'Save' });
    const btn = document.getElementById('fc-btn-save');
    expect(btn).not.toBeNull();
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(apiMock.saveFile).toHaveBeenCalledTimes(1);
    const [content, defaultName] = apiMock.saveFile.mock.calls[0];
    expect(typeof content).toBe('string');
    expect(content.startsWith('```mermaid\n')).toBe(true);
    expect(content.endsWith('\n```')).toBe(true);
    expect(content).toContain('flowchart TD');
    expect(content).toContain('A[Save]');
    expect(defaultName).toBe('flowchart.mmd');
  });

  test('Save to File surfaces "cancel" status when the user dismisses the dialog', async () => {
    const { apiMock } = await loadBundle({
      saveFile: jest.fn(async () => ({ canceled: true })),
    });
    document.getElementById('fc-btn-save').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(apiMock.saveFile).toHaveBeenCalledTimes(1);
    expect(document.getElementById('fc-status').textContent).toBe('Save cancelled');
  });

  test('Save to File surfaces the error when the IPC handler throws', async () => {
    const { apiMock } = await loadBundle({
      saveFile: jest.fn(async () => {
        throw new Error('disk full');
      }),
    });
    document.getElementById('fc-btn-save').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(apiMock.saveFile).toHaveBeenCalledTimes(1);
    expect(document.getElementById('fc-status').textContent).toBe('Save failed: disk full');
  });
});
