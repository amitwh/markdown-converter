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
