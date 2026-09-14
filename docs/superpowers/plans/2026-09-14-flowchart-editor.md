# Flow Chart Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar-panel flow chart editor that lets users build Mermaid `flowchart` graphs visually (drag nodes, connect edges, edit labels in-place) and inserts the generated source at the editor cursor.

**Architecture:** Renderer-only feature. A new pure `flowchart-store.js` holds the graph (`{ nodes, edges }`) with injectable IO for persistence. `flowchart-mermaid.js` translates graph → Mermaid source. `flowchart-shapes.js` renders the 5 SVG shape templates. `flowchart-canvas.js` owns the SVG, pointer events, and hit-testing. `sidebar/flowchart-panel.js` mounts canvas + preview, wires keyboard shortcuts, debounces preview (250ms) and persistence (500ms), and reuses the existing `insert-content` IPC channel for "Insert at Cursor". No main-process changes; Mermaid is already bundled.

**Tech Stack:** Electron 41.10.7, vanilla JS (no bundler), Mermaid 11.12.3 (already bundled), Jest 30 + jsdom, Prettier 2-space single-quote semicolon 100-col.

**Spec:** docs/superpowers/specs/2026-09-14-flowchart-editor-design.md

## Global Constraints

- Electron 41.10.7, electron-builder 26.15.3
- Vanilla JS, no bundler. Renderer is a single `src/renderer.js` (5,361 lines) — keep additions in their own files where possible
- Renderer-only feature: NO new main-process modules, NO new IPC channels (Mermaid is already bundled and rendered in the preview pane at `src/renderer.js:1106-1142`)
- Sidebar panel pattern: `src/sidebar/<name>-panel.js` exports `render<Name>Panel(container, deps)`; registered via `sidebarManager.registerPanel(id, { title, render, icon })` at `src/renderer.js:2300`
- Sidebar styles live in `src/styles-sidebar.css` (top-level, NOT inside `src/styles/`)
- Tests: Jest + jsdom. Pure modules testable; jsdom for DOM/canvas. Run `npm test`, `npm run lint`, `npm run format:check`
- 5 node shapes (process, decision, terminator, subroutine, document) → Mermaid syntax: `[Label]`, `{Label}`, `([Label])`, `[[Label]]`, `[/Label/]`
- 3 edge kinds (solid, dotted, thick) → Mermaid syntax: `-->`, `-.->`, `==>`
- Persistence: `<userData>/flowchart-session.json` via injected IO `{ persistencePath, readFile, writeFile, now }`
- Undo/redo: bounded snapshot stack, depth 50
- Mermaid emission: always `flowchart TD` for v1
- Debounce: 250ms preview re-render, 500ms persistence write
- Keyboard shortcuts panel-scoped: Ctrl+Z undo, Ctrl+Shift+Z redo, Delete removes selected
- The `insert-content` IPC channel already exists (`src/main.js:6081`, consumed in `src/renderer.js:6780`); reuse for "Insert at Cursor"
- Sidebar rail button style matches `src/index.html:2562-2598` (Daily Notes example)

## File Structure

### New files

| File | Role |
|---|---|
| `src/flowchart/flowchart-store.js` | Pure data module. Graph = `{ nodes, edges }`. Node: `{ id, kind, x, y, label }`. Edge: `{ id, fromNodeId, toNodeId, kind: 'solid'\|'dotted'\|'thick', label? }`. Exposes `create`, `addNode`, `moveNode`, `setNodeLabel`, `setNodeKind`, `removeNode`, `connect`, `disconnect`, `setEdgeKind`, `setEdgeLabel`, `undo`, `redo`, `subscribe`, `serialize`, `deserialize`, `toJSON`, `getGraph`. Constructor takes injected IO `{ persistencePath, readFile, writeFile, now }`. |
| `src/flowchart/flowchart-shapes.js` | Pure SVG templates. `shapeSvg(kind, x, y, width, height) → string`. 5 shapes: process=`<rect>`, decision=`<polygon>` (diamond), terminator=`<rect rx>` (stadium), subroutine=`<rect>` with double border, document=`<polygon>` (parallelogram). `LABEL_PADDING_X`, `LABEL_PADDING_Y`, `DEFAULT_WIDTH`, `DEFAULT_HEIGHT` exported constants. |
| `src/flowchart/flowchart-mermaid.js` | Pure translator. `toMermaid(graph) → string` (header `flowchart TD`, then node declarations, then edges). `escapeLabel(s)` exported for testing. Throws `Error` with kind name on unknown node kind. |
| `src/flowchart/flowchart-canvas.js` | SVG canvas. Owns an `<svg>` element. Exports `createCanvas(container, store, opts) → { destroy, getSvg }`. Renders nodes as `<g data-node-id>` with shape + label `<text>`. Renders edges as `<line>`. Pointer events: drag to move, double-click to edit label (inline `<input>` overlay), right-click opens shape submenu. Drag from a node's right-edge handle to another node creates an edge. Click edge to open edge menu (type + label). Hit-testing walks DOM in reverse z-order via `data-node-id`. |
| `src/sidebar/flowchart-panel.js` | Renderer-only panel. `renderFlowChartPanel(container, deps)`. Deps: `getUserDataPath`, `readFile`, `writeFile`, `insertAtCursor`. Mounts canvas (left) + preview pane (right). Debounces preview re-render 250ms; persistence 500ms. Wires keyboard shortcuts when container has focus. "Insert at Cursor" button wraps Mermaid source in ```` ```mermaid\n...\n``` ```` and calls `deps.insertAtCursor`. Exposes `serialize` for tests. |
| `tests/flowchart-store.test.js` | Pure store tests: add/move/connect/disconnect/delete; undo/redo round-trip; subscribe fires once per change; serialize/deserialize round-trip; throws on invalid input; snapshot stack bounded at 50. |
| `tests/flowchart-mermaid.test.js` | Translation tests: each node kind emits correct Mermaid syntax; each edge kind; label escaping (`"`, `\n`); unknown kind throws; snapshot tests for 5 representative graphs. |
| `tests/flowchart-shapes.test.js` | Each shape function returns SVG that matches expected viewBox and contains the expected primitive. |
| `tests/flowchart-canvas.test.js` | jsdom tests: mount with 3-node graph; assert SVG structure; simulate pointerdown + pointermove + pointerup; assert store `moveNode` was called. Right-click opens shape menu. Double-click opens label editor. |
| `tests/flowchart-panel.test.js` | jsdom test: mount panel; assert canvas + preview panes exist; trigger a store change; assert preview re-renders within 300ms (jest fake timers). |
| `tests/fixtures/flowchart-snapshots.js` | Shared fixture builders + snapshot strings for mermaid tests (5 representative graphs). |

### Modified files

| File | Change |
|---|---|
| `src/renderer.js:2300` (sidebar registration area, after `history` panel at ~line 2409) | Add `sidebarManager.registerPanel('flowchart', { title: 'Flow Chart', render: (c) => renderFlowChartPanel(c, deps), icon: '...' })`. Wire `deps` with `getUserDataPath`, `readFile`, `writeFile` (via `fs`/`path` IPC OR new minimal preload helper — see Task 7 for chosen approach). `insertAtCursor: (text) => tabManager.insertAtCursor(text)`. |
| `src/index.html:2598` (after the daily-notes rail button) | Add `<button class="sidebar-icon" data-panel="flowchart" title="Flow Chart Editor (Ctrl+Alt+F)">…flowchart icon…</button>` matching existing rail-button style. |
| `src/styles-sidebar.css` | Append layout for the panel's split (left 70% canvas / right 30% preview). Add `.flowchart-panel`, `.flowchart-canvas-host`, `.flowchart-preview-host`, `.flowchart-preview-source`, `.flowchart-preview-render`, `.flowchart-toolbar`, `.flowchart-insert-btn`, `.flowchart-status`, `.flowchart-edge-menu`, `.flowchart-shape-menu`. |
| `README.md:54-70` (Advanced Features list) | Add row: `- **Visual flow chart editor** — Build Mermaid flowcharts visually; drag nodes, connect edges, live preview. Insert at cursor.` |
| `README.md:120-128` (Keyboard Shortcuts table) | Add `\| Add Flow Chart Node \| Insert (when panel focused) \|`, `\| Flow Chart: Undo \| Ctrl+Z \|`, `\| Flow Chart: Redo \| Ctrl+Shift+Z \|`, `\| Flow Chart: Delete selected \| Delete \|`. |

## Tasks

### Task 1: Pure data store — `flowchart-store.js`

**Files:**
- Create: `src/flowchart/flowchart-store.js`
- Test: `tests/flowchart-store.test.js`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces: `create(io) → store` where store has methods `getGraph()`, `addNode({kind,x,y,label}) → node`, `moveNode(id,x,y)`, `setNodeLabel(id,label)`, `setNodeKind(id,kind)`, `removeNode(id)`, `connect(fromId,toId,kind='solid')`, `disconnect(edgeId)`, `setEdgeKind(edgeId,kind)`, `setEdgeLabel(edgeId,label)`, `undo()`, `redo()`, `subscribe(fn) → unsubscribe`, `serialize() → string`, `deserialize(json)`, `toJSON()`, `canUndo()`, `canRedo()`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/flowchart-store.test.js
const { create } = require('../src/flowchart/flowchart-store');

function makeIO(overrides = {}) {
  return {
    persistencePath: '/tmp/flowchart-session.json',
    readFile: jest.fn().mockResolvedValue(null),
    writeFile: jest.fn().mockResolvedValue(undefined),
    now: () => 1700000000000,
    ...overrides,
  };
}

describe('flowchart-store: node operations', () => {
  test('addNode creates a node with id, kind, x, y, label and assigns an id', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 10, y: 20, label: 'Hello' });
    expect(node).toMatchObject({ kind: 'process', x: 10, y: 20, label: 'Hello' });
    expect(typeof node.id).toBe('string');
    expect(node.id.length).toBeGreaterThan(0);
    expect(store.getGraph().nodes).toContainEqual(node);
  });

  test('addNode defaults label to empty string when omitted', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'decision', x: 0, y: 0 });
    expect(node.label).toBe('');
  });

  test('addNode throws on unknown kind', () => {
    const store = create(makeIO());
    expect(() => store.addNode({ kind: 'bogus', x: 0, y: 0 })).toThrow(/bogus/);
  });

  test('moveNode updates position of existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.moveNode(node.id, 50, 60);
    const moved = store.getGraph().nodes.find((n) => n.id === node.id);
    expect(moved).toMatchObject({ x: 50, y: 60 });
  });

  test('moveNode throws on unknown node id', () => {
    const store = create(makeIO());
    expect(() => store.moveNode('does-not-exist', 0, 0)).toThrow(/does-not-exist/);
  });

  test('setNodeLabel updates label of existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.setNodeLabel(node.id, 'B');
    expect(store.getGraph().nodes.find((n) => n.id === node.id).label).toBe('B');
  });

  test('setNodeKind updates kind of existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeKind(node.id, 'decision');
    expect(store.getGraph().nodes.find((n) => n.id === node.id).kind).toBe('decision');
  });

  test('removeNode removes the node and any connected edges', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id, 'solid');
    store.removeNode(a.id);
    expect(store.getGraph().nodes.find((n) => n.id === a.id)).toBeUndefined();
    expect(store.getGraph().edges.find((e) => e.id === edge.id)).toBeUndefined();
  });
});

describe('flowchart-store: edge operations', () => {
  test('connect creates a solid edge by default', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id);
    expect(edge).toMatchObject({ fromNodeId: a.id, toNodeId: b.id, kind: 'solid' });
    expect(store.getGraph().edges).toContainEqual(edge);
  });

  test('connect accepts solid|dotted|thick', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    expect(store.connect(a.id, b.id, 'dotted').kind).toBe('dotted');
    expect(store.connect(a.id, b.id, 'thick').kind).toBe('thick');
  });

  test('connect throws when from === to', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    expect(() => store.connect(a.id, a.id)).toThrow(TypeError);
  });

  test('connect throws on unknown edge kind', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    expect(() => store.connect(a.id, b.id, 'wavy')).toThrow(/wavy/);
  });

  test('disconnect removes the edge', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id, 'solid');
    store.disconnect(edge.id);
    expect(store.getGraph().edges.find((e) => e.id === edge.id)).toBeUndefined();
  });

  test('setEdgeKind and setEdgeLabel mutate the edge', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id, 'solid');
    store.setEdgeKind(edge.id, 'thick');
    store.setEdgeLabel(edge.id, 'next');
    const updated = store.getGraph().edges.find((e) => e.id === edge.id);
    expect(updated).toMatchObject({ kind: 'thick', label: 'next' });
  });
});

describe('flowchart-store: subscribe', () => {
  test('subscribe fires once per mutation', () => {
    const store = create(makeIO());
    const fn = jest.fn();
    store.subscribe(fn);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.addNode({ kind: 'process', x: 10, y: 10, label: 'B' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('unsubscribe stops further notifications', () => {
    const store = create(makeIO());
    const fn = jest.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('flowchart-store: undo / redo', () => {
  test('undo restores prior state after addNode', () => {
    const store = create(makeIO());
    expect(store.getGraph().nodes).toHaveLength(0);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(store.getGraph().nodes).toHaveLength(1);
    store.undo();
    expect(store.getGraph().nodes).toHaveLength(0);
  });

  test('redo replays the undone mutation', () => {
    const store = create(makeIO());
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.undo();
    store.redo();
    expect(store.getGraph().nodes).toHaveLength(1);
  });

  test('canUndo and canRedo reflect stack state', () => {
    const store = create(makeIO());
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
  });

  test('new mutation after undo drops the redo stack', () => {
    const store = create(makeIO());
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.undo();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    expect(store.canRedo()).toBe(false);
  });

  test('snapshot stack is bounded at depth 50', () => {
    const store = create(makeIO());
    for (let i = 0; i < 60; i += 1) {
      store.addNode({ kind: 'process', x: i, y: 0, label: `n${i}` });
    }
    let undoCount = 0;
    while (store.canUndo()) {
      store.undo();
      undoCount += 1;
      if (undoCount > 100) throw new Error('undo did not terminate');
    }
    expect(undoCount).toBeLessThanOrEqual(50);
  });
});

describe('flowchart-store: serialize / deserialize', () => {
  test('serialize → deserialize round-trip preserves graph', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 10, y: 20, label: 'A' });
    const b = store.addNode({ kind: 'decision', x: 30, y: 40, label: 'B?' });
    store.connect(a.id, b.id, 'thick');
    const json = store.serialize();
    const restored = create(makeIO());
    restored.deserialize(json);
    expect(restored.getGraph()).toEqual(store.getGraph());
  });

  test('deserialize handles corrupt JSON by returning empty graph', () => {
    const store = create(makeIO());
    expect(() => store.deserialize('{not-json')).not.toThrow();
    expect(store.getGraph()).toEqual({ nodes: [], edges: [] });
  });

  test('deserialize validates node kinds and drops invalid nodes', () => {
    const store = create(makeIO());
    store.deserialize(
      JSON.stringify({
        nodes: [
          { id: 'n1', kind: 'process', x: 0, y: 0, label: 'A' },
          { id: 'n2', kind: 'bogus', x: 0, y: 0, label: 'X' },
        ],
        edges: [],
      })
    );
    expect(store.getGraph().nodes).toHaveLength(1);
  });
});

describe('flowchart-store: persistence (injected IO)', () => {
  test('writeFile is called with serialized graph when subscribing to persistence', async () => {
    const io = makeIO();
    const store = create(io);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    // Persistence is debounced inside the panel; the store itself does not
    // auto-write. Verify only that the IO is wired through.
    expect(io.persistencePath).toBe('/tmp/flowchart-session.json');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-store.test.js 2>&1 | tail -30
```

Expected: `Cannot find module '../src/flowchart/flowchart-store'` and zero tests pass.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/flowchart/flowchart-store.js
'use strict';

/**
 * Pure graph store for the flow chart editor.
 *
 * Graph = { nodes: Node[], edges: Edge[] }
 *   Node: { id, kind, x, y, label }
 *   Edge: { id, fromNodeId, toNodeId, kind: 'solid'|'dotted'|'thick', label? }
 *
 * IO is injected for unit tests + persistence:
 *   { persistencePath, readFile, writeFile, now }
 *
 * @module flowchart-store
 */

const NODE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
const EDGE_KINDS = ['solid', 'dotted', 'thick'];
const UNDO_LIMIT = 50;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function newId(prefix) {
  // 12 hex chars; monotonic enough for in-memory use.
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
}

function isValidNode(node) {
  return (
    node &&
    typeof node.id === 'string' &&
    NODE_KINDS.includes(node.kind) &&
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    typeof node.label === 'string'
  );
}

function isValidEdge(edge) {
  return (
    edge &&
    typeof edge.id === 'string' &&
    typeof edge.fromNodeId === 'string' &&
    typeof edge.toNodeId === 'string' &&
    EDGE_KINDS.includes(edge.kind)
  );
}

/**
 * @param {object} io
 * @param {string} io.persistencePath Absolute path for auto-save JSON.
 * @param {(path:string) => Promise<string|null>} io.readFile
 * @param {(path:string, content:string) => Promise<void>} io.writeFile
 * @param {() => number} io.now
 */
function create(io) {
  if (!io || typeof io !== 'object') {
    throw new Error('flowchart-store: io bundle is required');
  }

  let graph = { nodes: [], edges: [] };
  const undoStack = [];
  const redoStack = [];
  const listeners = new Set();

  function emit() {
    for (const fn of listeners) {
      try {
        fn(getGraph());
      } catch (err) {
        // Don't let a subscriber crash the store.
      }
    }
  }

  function snapshot() {
    undoStack.push(clone(graph));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
  }

  function getGraph() {
    return clone(graph);
  }

  function addNode({ kind, x, y, label = '' }) {
    if (!NODE_KINDS.includes(kind)) {
      throw new Error(`flowchart-store: unknown node kind "${kind}"`);
    }
    snapshot();
    const node = { id: newId('n'), kind, x, y, label };
    graph.nodes.push(node);
    emit();
    return node;
  }

  function findNodeIndex(id) {
    return graph.nodes.findIndex((n) => n.id === id);
  }

  function findEdgeIndex(id) {
    return graph.edges.findIndex((e) => e.id === id);
  }

  function moveNode(id, x, y) {
    const idx = findNodeIndex(id);
    if (idx === -1) throw new Error(`flowchart-store: unknown node id "${id}"`);
    snapshot();
    graph.nodes[idx] = { ...graph.nodes[idx], x, y };
    emit();
  }

  function setNodeLabel(id, label) {
    const idx = findNodeIndex(id);
    if (idx === -1) throw new Error(`flowchart-store: unknown node id "${id}"`);
    snapshot();
    graph.nodes[idx] = { ...graph.nodes[idx], label };
    emit();
  }

  function setNodeKind(id, kind) {
    if (!NODE_KINDS.includes(kind)) {
      throw new Error(`flowchart-store: unknown node kind "${kind}"`);
    }
    const idx = findNodeIndex(id);
    if (idx === -1) throw new Error(`flowchart-store: unknown node id "${id}"`);
    snapshot();
    graph.nodes[idx] = { ...graph.nodes[idx], kind };
    emit();
  }

  function removeNode(id) {
    const idx = findNodeIndex(id);
    if (idx === -1) return;
    snapshot();
    graph.nodes.splice(idx, 1);
    graph.edges = graph.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id);
    emit();
  }

  function connect(fromNodeId, toNodeId, kind = 'solid') {
    if (fromNodeId === toNodeId) {
      throw new TypeError('flowchart-store: cannot connect a node to itself');
    }
    if (!EDGE_KINDS.includes(kind)) {
      throw new Error(`flowchart-store: unknown edge kind "${kind}"`);
    }
    snapshot();
    const edge = { id: newId('e'), fromNodeId, toNodeId, kind };
    graph.edges.push(edge);
    emit();
    return edge;
  }

  function disconnect(edgeId) {
    const idx = findEdgeIndex(edgeId);
    if (idx === -1) return;
    snapshot();
    graph.edges.splice(idx, 1);
    emit();
  }

  function setEdgeKind(edgeId, kind) {
    if (!EDGE_KINDS.includes(kind)) {
      throw new Error(`flowchart-store: unknown edge kind "${kind}"`);
    }
    const idx = findEdgeIndex(edgeId);
    if (idx === -1) throw new Error(`flowchart-store: unknown edge id "${edgeId}"`);
    snapshot();
    graph.edges[idx] = { ...graph.edges[idx], kind };
    emit();
  }

  function setEdgeLabel(edgeId, label) {
    const idx = findEdgeIndex(edgeId);
    if (idx === -1) throw new Error(`flowchart-store: unknown edge id "${edgeId}"`);
    snapshot();
    graph.edges[idx] = { ...graph.edges[idx], label };
    emit();
  }

  function undo() {
    const prior = undoStack.pop();
    if (!prior) return;
    redoStack.push(clone(graph));
    graph = prior;
    emit();
  }

  function redo() {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(clone(graph));
    graph = next;
    emit();
  }

  function canUndo() {
    return undoStack.length > 0;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function serialize() {
    return JSON.stringify(graph);
  }

  function deserialize(json) {
    let parsed;
    try {
      parsed = typeof json === 'object' ? json : JSON.parse(json);
    } catch (err) {
      graph = { nodes: [], edges: [] };
      return;
    }
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes.filter(isValidNode) : [];
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = Array.isArray(parsed.edges)
      ? parsed.edges.filter(
          (e) => isValidEdge(e) && nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
        )
      : [];
    graph = { nodes, edges };
    undoStack.length = 0;
    redoStack.length = 0;
    emit();
  }

  function toJSON() {
    return clone(graph);
  }

  return {
    getGraph,
    addNode,
    moveNode,
    setNodeLabel,
    setNodeKind,
    removeNode,
    connect,
    disconnect,
    setEdgeKind,
    setEdgeLabel,
    undo,
    redo,
    canUndo,
    canRedo,
    subscribe,
    serialize,
    deserialize,
    toJSON,
  };
}

module.exports = { create, NODE_KINDS, EDGE_KINDS };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-store.test.js 2>&1 | tail -15
```

Expected: `Tests: … passed`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/flowchart/flowchart-store.js tests/flowchart-store.test.js && git commit -m "feat(flowchart): pure graph store with undo/redo + injectable IO"
```

### Task 2: SVG shape templates — `flowchart-shapes.js`

**Files:**
- Create: `src/flowchart/flowchart-shapes.js`
- Test: `tests/flowchart-shapes.test.js`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces: `shapeSvg(kind, x, y, width, height) → string` (one SVG element string), `SHAPE_KINDS` (exported list), `DEFAULT_WIDTH`, `DEFAULT_HEIGHT`, `LABEL_PADDING_X`, `LABEL_PADDING_Y`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/flowchart-shapes.test.js
const {
  shapeSvg,
  SHAPE_KINDS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} = require('../src/flowchart/flowchart-shapes');

describe('flowchart-shapes: shapeSvg', () => {
  test('process emits a <rect> at the given coordinates', () => {
    const svg = shapeSvg('process', 10, 20, 100, 50);
    expect(svg).toMatch(/<rect/);
    expect(svg).toMatch(/x="10"/);
    expect(svg).toMatch(/y="20"/);
    expect(svg).toMatch(/width="100"/);
    expect(svg).toMatch(/height="50"/);
  });

  test('decision emits a <polygon> diamond', () => {
    const svg = shapeSvg('decision', 0, 0, 100, 60);
    expect(svg).toMatch(/<polygon/);
    // 4 points (diamond)
    const match = /points="([^"]+)"/.exec(svg);
    expect(match).not.toBeNull();
    expect(match[1].split(/\s+/).filter(Boolean)).toHaveLength(4);
  });

  test('terminator emits a <rect> with rx (stadium)', () => {
    const svg = shapeSvg('terminator', 0, 0, 120, 40);
    expect(svg).toMatch(/<rect/);
    expect(svg).toMatch(/rx="/);
  });

  test('subroutine emits two concentric <rect> elements (double border)', () => {
    const svg = shapeSvg('subroutine', 0, 0, 100, 50);
    const rects = svg.match(/<rect/g) || [];
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  test('document emits a <polygon> parallelogram', () => {
    const svg = shapeSvg('document', 0, 0, 120, 60);
    expect(svg).toMatch(/<polygon/);
    const match = /points="([^"]+)"/.exec(svg);
    expect(match[1].split(/\s+/).filter(Boolean)).toHaveLength(4);
  });

  test('unknown kind throws', () => {
    expect(() => shapeSvg('hexagon', 0, 0, 100, 50)).toThrow(/hexagon/);
  });

  test('SHAPE_KINDS lists all 5 shapes', () => {
    expect(SHAPE_KINDS.sort()).toEqual(
      ['decision', 'document', 'process', 'subroutine', 'terminator']
    );
  });

  test('DEFAULT_WIDTH and DEFAULT_HEIGHT are positive numbers', () => {
    expect(DEFAULT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_HEIGHT).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-shapes.test.js 2>&1 | tail -10
```

Expected: `Cannot find module '../src/flowchart/flowchart-shapes'` and zero tests pass.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/flowchart/flowchart-shapes.js
'use strict';

/**
 * SVG shape templates for the 5 supported Mermaid flowchart node kinds.
 * Each `shapeSvg` returns ONE SVG element string — the canvas wraps it in a
 * <g data-node-id="…"> alongside a <text> label.
 *
 * Pure module: no DOM, no globals, no side effects.
 *
 * @module flowchart-shapes
 */

const SHAPE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 60;
const LABEL_PADDING_X = 16;
const LABEL_PADDING_Y = 12;

function shapeSvg(kind, x, y, width, height) {
  if (!SHAPE_KINDS.includes(kind)) {
    throw new Error(`flowchart-shapes: unknown shape kind "${kind}"`);
  }
  switch (kind) {
    case 'process':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" ry="4" />`;
    case 'terminator':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" ry="${height / 2}" />`;
    case 'subroutine': {
      const inset = 4;
      return (
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" ry="4" />` +
        `<rect x="${x + inset}" y="${y + inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" rx="4" ry="4" />`
      );
    }
    case 'decision': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const left = `${x},${cy}`;
      const top = `${cx},${y}`;
      const right = `${x + width},${cy}`;
      const bottom = `${cx},${y + height}`;
      return `<polygon points="${left} ${top} ${right} ${bottom}" />`;
    }
    case 'document': {
      // Parallelogram: top-right and bottom-right indented by ~20% of height.
      const skew = Math.max(10, Math.round(height * 0.25));
      const tl = `${x + skew},${y}`;
      const tr = `${x + width},${y}`;
      const br = `${x + width - skew},${y + height}`;
      const bl = `${x},${y + height}`;
      return `<polygon points="${tl} ${tr} ${br} ${bl}" />`;
    }
    default:
      throw new Error(`flowchart-shapes: unknown shape kind "${kind}"`);
  }
}

module.exports = {
  shapeSvg,
  SHAPE_KINDS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  LABEL_PADDING_X,
  LABEL_PADDING_Y,
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-shapes.test.js 2>&1 | tail -10
```

Expected: `Tests: … passed`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/flowchart/flowchart-shapes.js tests/flowchart-shapes.test.js && git commit -m "feat(flowchart): 5 SVG shape templates (process/decision/terminator/subroutine/document)"
```

### Task 3: Mermaid translator — `flowchart-mermaid.js`

**Files:**
- Create: `src/flowchart/flowchart-mermaid.js`
- Create: `tests/fixtures/flowchart-snapshots.js`
- Test: `tests/flowchart-mermaid.test.js`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces: `toMermaid(graph) → string`, `escapeLabel(s) → string`, `nodeDeclaration(node) → string`, `edgeDeclaration(edge, fromId, toId) → string`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/fixtures/flowchart-snapshots.js
'use strict';

/**
 * Fixture graphs for flowchart-mermaid snapshot tests.
 * Mermaid IDs are 1-3 chars; here we use semantic names that match the
 * store's auto-generated ids but normalized to A/B/C form for readability.
 */

function normalizeIds(graph) {
  // Map arbitrary ids to A/B/C/.../Z for stable snapshots.
  const map = new Map();
  const normNode = (n, i) => {
    const id = String.fromCharCode(65 + i);
    map.set(n.id, id);
    return { ...n, id };
  };
  const normEdge = (e) => ({
    ...e,
    fromNodeId: map.get(e.fromNodeId),
    toNodeId: map.get(e.toNodeId),
  });
  return {
    nodes: graph.nodes.map(normNode),
    edges: graph.edges.map(normEdge),
  };
}

const linearChain = {
  nodes: [
    { id: 'n1', kind: 'terminator', x: 0, y: 0, label: 'Start' },
    { id: 'n2', kind: 'process', x: 0, y: 0, label: 'Step 1' },
    { id: 'n3', kind: 'process', x: 0, y: 0, label: 'Step 2' },
    { id: 'n4', kind: 'terminator', x: 0, y: 0, label: 'End' },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'solid' },
    { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3', kind: 'solid' },
    { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4', kind: 'solid' },
  ],
};

const decisionDiamond = {
  nodes: [
    { id: 'n1', kind: 'terminator', x: 0, y: 0, label: 'Start' },
    { id: 'n2', kind: 'process', x: 0, y: 0, label: 'Get input' },
    { id: 'n3', kind: 'decision', x: 0, y: 0, label: 'Valid?' },
    { id: 'n4', kind: 'process', x: 0, y: 0, label: 'Process' },
    { id: 'n5', kind: 'process', x: 0, y: 0, label: 'Show error' },
    { id: 'n6', kind: 'terminator', x: 0, y: 0, label: 'End' },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'solid' },
    { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3', kind: 'solid' },
    { id: 'e3', fromNodeId: 'n3', toNodeId: 'n4', kind: 'solid', label: 'yes' },
    { id: 'e4', fromNodeId: 'n3', toNodeId: 'n5', kind: 'solid', label: 'no' },
    { id: 'e5', fromNodeId: 'n4', toNodeId: 'n6', kind: 'solid' },
  ],
};

const parallelBranches = {
  nodes: [
    { id: 'n1', kind: 'terminator', x: 0, y: 0, label: 'Start' },
    { id: 'n2', kind: 'process', x: 0, y: 0, label: 'Fork' },
    { id: 'n3', kind: 'process', x: 0, y: 0, label: 'Branch A' },
    { id: 'n4', kind: 'process', x: 0, y: 0, label: 'Branch B' },
    { id: 'n5', kind: 'terminator', x: 0, y: 0, label: 'End' },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'solid' },
    { id: 'e2', fromNodeId: 'n2', toNodeId: 'n3', kind: 'solid' },
    { id: 'e3', fromNodeId: 'n2', toNodeId: 'n4', kind: 'solid' },
    { id: 'e4', fromNodeId: 'n3', toNodeId: 'n5', kind: 'solid' },
    { id: 'e5', fromNodeId: 'n4', toNodeId: 'n5', kind: 'solid' },
  ],
};

const cycle = {
  nodes: [
    { id: 'n1', kind: 'process', x: 0, y: 0, label: 'A' },
    { id: 'n2', kind: 'process', x: 0, y: 0, label: 'B' },
  ],
  edges: [
    { id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'solid' },
    { id: 'e2', fromNodeId: 'n2', toNodeId: 'n1', kind: 'dotted' },
  ],
};

function largeGraph(n) {
  const nodes = [];
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    nodes.push({ id: `n${i}`, kind: 'process', x: 0, y: 0, label: `Step ${i}` });
    if (i > 0) {
      edges.push({
        id: `e${i}`,
        fromNodeId: `n${i - 1}`,
        toNodeId: `n${i}`,
        kind: 'solid',
      });
    }
  }
  return { nodes, edges };
}

module.exports = {
  normalizeIds,
  linearChain,
  decisionDiamond,
  parallelBranches,
  cycle,
  largeGraph,
};
```

```javascript
// tests/flowchart-mermaid.test.js
const { toMermaid, escapeLabel, nodeDeclaration, edgeDeclaration } = require('../src/flowchart/flowchart-mermaid');
const {
  normalizeIds,
  linearChain,
  decisionDiamond,
  parallelBranches,
  cycle,
  largeGraph,
} = require('./fixtures/flowchart-snapshots');

describe('flowchart-mermaid: escapeLabel', () => {
  test('escapes double quotes', () => {
    expect(escapeLabel('say "hi"')).toBe('say #quot;hi#quot;');
  });

  test('escapes newlines to literal \\n', () => {
    expect(escapeLabel('line1\nline2')).toBe('line1\\nline2');
  });

  test('passes plain text through', () => {
    expect(escapeLabel('Hello world')).toBe('Hello world');
  });
});

describe('flowchart-mermaid: nodeDeclaration', () => {
  test('process → A[Label]', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'process', label: 'Step' })).toBe('A[Step]');
  });
  test('decision → A{Label}', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'decision', label: 'Yes?' })).toBe('A{Yes?}');
  });
  test('terminator → A([Label])', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'terminator', label: 'Start' })).toBe('A([Start])');
  });
  test('subroutine → A[[Label]]', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'subroutine', label: 'Do thing' })).toBe(
      'A[[Do thing]]'
    );
  });
  test('document → A[/Label/]', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'document', label: 'Report' })).toBe('A[/Report/]');
  });
  test('unknown kind throws', () => {
    expect(() => nodeDeclaration({ id: 'A', kind: 'hexagon', label: 'x' })).toThrow(/hexagon/);
  });
});

describe('flowchart-mermaid: edgeDeclaration', () => {
  test('solid → A --> B', () => {
    expect(edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid' }, 'A', 'B')).toBe(
      'A --> B'
    );
  });
  test('dotted → A -.-> B', () => {
    expect(edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'dotted' }, 'A', 'B')).toBe(
      'A -.-> B'
    );
  });
  test('thick → A ==> B', () => {
    expect(edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'thick' }, 'A', 'B')).toBe(
      'A ==> B'
    );
  });
  test('with label → A -->|yes| B', () => {
    expect(
      edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid', label: 'yes' }, 'A', 'B')
    ).toBe('A -->|yes| B');
  });
});

describe('flowchart-mermaid: toMermaid — full graphs', () => {
  test('linearChain', () => {
    const out = toMermaid(normalizeIds(linearChain));
    expect(out).toMatch(/^flowchart TD/);
    expect(out).toMatch(/A\(\[Start\]\)/);
    expect(out).toMatch(/B\[Step 1\]/);
    expect(out).toMatch(/C\[Step 2\]/);
    expect(out).toMatch(/D\(\[End\]\)/);
    expect(out).toMatch(/A --> B/);
    expect(out).toMatch(/B --> C/);
    expect(out).toMatch(/C --> D/);
  });

  test('decisionDiamond includes labeled branches', () => {
    const out = toMermaid(normalizeIds(decisionDiamond));
    expect(out).toMatch(/C\{Valid\?\}/);
    expect(out).toMatch(/C -->\|yes\| D/);
    expect(out).toMatch(/C -->\|no\| E/);
  });

  test('parallelBranches', () => {
    const out = toMermaid(normalizeIds(parallelBranches));
    expect(out).toMatch(/B --> C/);
    expect(out).toMatch(/B --> D/);
    expect(out).toMatch(/C --> E/);
    expect(out).toMatch(/D --> E/);
  });

  test('cycle uses dotted for the back-edge', () => {
    const out = toMermaid(normalizeIds(cycle));
    expect(out).toMatch(/A --> B/);
    expect(out).toMatch(/B -\.-> A/);
  });

  test('largeGraph(20) emits 20 nodes and 19 edges in order', () => {
    const out = toMermaid(normalizeIds(largeGraph(20)));
    const nodeCount = (out.match(/^[A-Z]\[/gm) || []).length;
    const edgeCount = (out.match(/ --> /g) || []).length;
    expect(nodeCount).toBe(20);
    expect(edgeCount).toBe(19);
  });

  test('empty graph still emits the header', () => {
    expect(toMermaid({ nodes: [], edges: [] })).toBe('flowchart TD');
  });

  test('label with embedded double-quote is escaped', () => {
    const out = toMermaid(
      normalizeIds({
        nodes: [{ id: 'n1', kind: 'process', x: 0, y: 0, label: 'say "hi"' }],
        edges: [],
      })
    );
    expect(out).toMatch(/A\[say #quot;hi#quot;\]/);
  });

  test('label with newline uses \\n escape', () => {
    const out = toMermaid(
      normalizeIds({
        nodes: [{ id: 'n1', kind: 'process', x: 0, y: 0, label: 'line1\nline2' }],
        edges: [],
      })
    );
    expect(out).toMatch(/A\[line1\\nline2\]/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-mermaid.test.js 2>&1 | tail -10
```

Expected: `Cannot find module '../src/flowchart/flowchart-mermaid'` and zero tests pass.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/flowchart/flowchart-mermaid.js
'use strict';

/**
 * Pure translator: graph → Mermaid `flowchart TD` source.
 *
 * Output format:
 *   flowchart TD
 *   A[Step 1]
 *   B{Valid?}
 *   C([Start])
 *   D[[Do thing]]
 * E[/Report/]
 *   A --> B
 *   B -->|yes| C
 *
 * IDs are 1-3 chars (A..Z, AA..ZZ, …). Labels are escaped: double quotes
 * become `#quot;`, newlines become literal `\n` (Mermaid's escape).
 *
 * @module flowchart-mermaid
 */

const SHAPE_SYNTAX = {
  process: (id, label) => `${id}[${label}]`,
  decision: (id, label) => `${id}{${label}}`,
  terminator: (id, label) => `${id}([${label}])`,
  subroutine: (id, label) => `${id}[[${label}]]`,
  document: (id, label) => `${id}[/${label}/]`,
};

const EDGE_ARROW = {
  solid: '-->',
  dotted: '-.->',
  thick: '==>',
};

function escapeLabel(label) {
  return String(label || '')
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, '\\n');
}

function assignIds(nodes) {
  // A, B, C, …, Z, AA, AB, … (matches Mermaid's preferred short ids).
  const map = new Map();
  let n = 0;
  for (const node of nodes) {
    let id;
    if (n < 26) id = String.fromCharCode(65 + n);
    else {
      const first = Math.floor(n / 26) - 1;
      const second = n % 26;
      id = String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
    }
    map.set(node.id, id);
    n += 1;
  }
  return map;
}

function nodeDeclaration(node) {
  const fn = SHAPE_SYNTAX[node.kind];
  if (!fn) throw new Error(`flowchart-mermaid: unknown node kind "${node.kind}"`);
  return fn(node.id, escapeLabel(node.label));
}

function edgeDeclaration(edge, fromId, toId) {
  const arrow = EDGE_ARROW[edge.kind];
  if (!arrow) throw new Error(`flowchart-mermaid: unknown edge kind "${edge.kind}"`);
  if (edge.label && edge.label.length > 0) {
    return `${fromId} ${arrow}|${escapeLabel(edge.label)}| ${toId}`;
  }
  return `${fromId} ${arrow} ${toId}`;
}

function toMermaid(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('flowchart-mermaid: graph must have nodes[] and edges[]');
  }
  const ids = assignIds(graph.nodes);
  const lines = ['flowchart TD'];
  for (const node of graph.nodes) {
    lines.push(nodeDeclaration({ ...node, id: ids.get(node.id) }));
  }
  for (const edge of graph.edges) {
    const fromId = ids.get(edge.fromNodeId);
    const toId = ids.get(edge.toNodeId);
    if (!fromId || !toId) continue; // skip dangling edges (defensive)
    lines.push(edgeDeclaration(edge, fromId, toId));
  }
  return lines.join('\n');
}

module.exports = { toMermaid, escapeLabel, nodeDeclaration, edgeDeclaration };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-mermaid.test.js 2>&1 | tail -10
```

Expected: `Tests: … passed`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/flowchart/flowchart-mermaid.js tests/flowchart-mermaid.test.js tests/fixtures/flowchart-snapshots.js && git commit -m "feat(flowchart): mermaid translator (flowchart TD, all 5 shapes, 3 edge kinds)"
```

### Task 4: SVG canvas — `flowchart-canvas.js`

**Files:**
- Create: `src/flowchart/flowchart-canvas.js`
- Test: `tests/flowchart-canvas.test.js`

**Interfaces:**
- Consumes: store (from Task 1) with `getGraph`, `subscribe`, `moveNode`, `setNodeLabel`, `setNodeKind`, `connect`, `setEdgeKind`, `setEdgeLabel`, `removeNode`, `disconnect`
- Produces: `createCanvas(container, store, opts) → { destroy, getSvg }`. `opts` = `{ onEdgeClick, onShapeMenu }` (callbacks for context-menu actions so the test can assert). Edge creation: Alt+drag from a node's center to another node's body creates a solid edge between them.

- [ ] **Step 1: Write the failing test**

```javascript
/**
 * @jest-environment jsdom
 */
const { create } = require('../src/flowchart/flowchart-store');
const { createCanvas } = require('../src/flowchart/flowchart-canvas');

function makeStore(graph) {
  const store = create({
    persistencePath: '/tmp/x.json',
    readFile: async () => null,
    writeFile: async () => undefined,
    now: () => 0,
  });
  if (graph) store.deserialize(JSON.stringify(graph));
  return store;
}

function mount(store) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = createCanvas(container, store, {
    onEdgeClick: jest.fn(),
    onShapeMenu: jest.fn(),
  });
  return { container, api };
}

describe('flowchart-canvas: rendering', () => {
  test('mounts an <svg> inside the container', () => {
    const store = makeStore();
    const { container } = mount(store);
    expect(container.querySelector('svg.flowchart-canvas')).not.toBeNull();
  });

  test('renders one <g data-node-id> per node', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'decision', x: 50, y: 50, label: 'B' },
        { id: 'n3', kind: 'terminator', x: 90, y: 80, label: 'C' },
      ],
      edges: [],
    });
    const { container } = mount(store);
    const groups = container.querySelectorAll('g[data-node-id]');
    expect(groups).toHaveLength(3);
  });

  test('renders edges as <line> elements', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'process', x: 100, y: 100, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'solid' }],
    });
    const { container } = mount(store);
    expect(container.querySelectorAll('line[data-edge-id]')).toHaveLength(1);
  });

  test('thick edges get stroke-width="3"', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'process', x: 100, y: 100, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'thick' }],
    });
    const { container } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    expect(line.getAttribute('stroke-width')).toBe('3');
  });

  test('dotted edges get stroke-dasharray', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'process', x: 100, y: 100, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'dotted' }],
    });
    const { container } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    expect(line.getAttribute('stroke-dasharray')).toBe('4,4');
  });
});

describe('flowchart-canvas: pointer events', () => {
  function stubLayout(container, nodes) {
    // Match the SVG viewBox (1000 x 700) so client→svg mapping is 1:1.
    container.querySelector('svg').getBoundingClientRect = () => ({
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

  test('pointerdown + pointermove + pointerup on a node moves it', () => {
    const store = makeStore({
      nodes: [{ id: 'n1', kind: 'process', x: 100, y: 100, label: 'A' }],
      edges: [],
    });
    const { container } = mount(store);
    const nodeG = container.querySelector('g[data-node-id="n1"]');
    stubLayout(container, [{ id: 'n1', x: 100, y: 100 }]);
    dispatch(nodeG, 'pointerdown', { clientX: 120, clientY: 110, pointerId: 1 });
    dispatch(nodeG, 'pointermove', { clientX: 170, clientY: 160, pointerId: 1 });
    dispatch(nodeG, 'pointerup', { clientX: 170, clientY: 160, pointerId: 1 });
    const moved = store.getGraph().nodes.find((n) => n.id === 'n1');
    expect(moved.x).toBe(150);
    expect(moved.y).toBe(150);
  });

  test('Alt+drag from node A center to node B creates a solid edge', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 100, y: 100, label: 'A' },
        { id: 'n2', kind: 'process', x: 400, y: 100, label: 'B' },
      ],
      edges: [],
    });
    const { container } = mount(store);
    stubLayout(container, [
      { id: 'n1', x: 100, y: 100 },
      { id: 'n2', x: 400, y: 100 },
    ]);
    const a = container.querySelector('g[data-node-id="n1"]');
    const b = container.querySelector('g[data-node-id="n2"]');
    dispatch(a, 'pointerdown', { clientX: 140, clientY: 120, altKey: true, pointerId: 1 });
    // pointermove over node B's center
    dispatch(a, 'pointermove', { clientX: 440, clientY: 120, altKey: true, pointerId: 1 });
    // pointerup on node B
    dispatch(b, 'pointerup', { clientX: 440, clientY: 120, altKey: true, pointerId: 1 });
    expect(store.getGraph().edges).toHaveLength(1);
    expect(store.getGraph().edges[0]).toMatchObject({
      fromNodeId: 'n1',
      toNodeId: 'n2',
      kind: 'solid',
    });
  });
});

describe('flowchart-canvas: subscribe re-renders on store change', () => {
  test('addNode causes a new <g> to appear', () => {
    const store = makeStore();
    const { container } = mount(store);
    expect(container.querySelectorAll('g[data-node-id]')).toHaveLength(0);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'New' });
    expect(container.querySelectorAll('g[data-node-id]')).toHaveLength(1);
  });
});

describe('flowchart-canvas: destroy', () => {
  test('removes the SVG and detaches subscribers', () => {
    const store = makeStore();
    const { container, api } = mount(store);
    api.destroy();
    expect(container.querySelector('svg.flowchart-canvas')).toBeNull();
    // After destroy, store changes should not throw inside a detached subscriber.
    expect(() => store.addNode({ kind: 'process', x: 0, y: 0, label: 'X' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-canvas.test.js 2>&1 | tail -10
```

Expected: `Cannot find module '../src/flowchart/flowchart-canvas'` and zero tests pass.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/flowchart/flowchart-canvas.js
'use strict';

/**
 * SVG canvas for the flow chart editor.
 *
 * Owns an <svg class="flowchart-canvas"> mounted into the supplied container.
 * Subscribes to the store; re-renders on every change. Listens for pointer
 * events on nodes/edges to drive drag, label-edit, and context-menu actions.
 *
 * Hand-rolled SVG — no D3, no Konva. Hit-testing via `data-node-id` /
 * `data-edge-id` attributes. Pure DOM module: no globals.
 *
 * @module flowchart-canvas
 */

const { DEFAULT_WIDTH, DEFAULT_HEIGHT, shapeSvg, SHAPE_KINDS } = require('./flowchart-shapes');

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    el.setAttribute(k, String(v));
  }
  return el;
}

function edgeStyle(kind) {
  if (kind === 'dotted') return { 'stroke-dasharray': '4,4', 'stroke-width': 1 };
  if (kind === 'thick') return { 'stroke-width': 3 };
  return { 'stroke-width': 1 };
}

function nodeCenter(node) {
  return { x: node.x + DEFAULT_WIDTH / 2, y: node.y + DEFAULT_HEIGHT / 2 };
}

function createCanvas(container, store, opts = {}) {
  const svg = svgEl('svg', {
    class: 'flowchart-canvas',
    width: '100%',
    height: '100%',
    viewBox: '0 0 1000 700',
    role: 'img',
    'aria-label': 'Flow chart canvas',
  });
  container.appendChild(svg);

  // Layer order: edges first (under nodes), then nodes.
  const edgesLayer = svgEl('g', { class: 'flowchart-edges' });
  const nodesLayer = svgEl('g', { class: 'flowchart-nodes' });
  svg.appendChild(edgesLayer);
  svg.appendChild(nodesLayer);

  let selectedNodeId = null;
  let selectedEdgeId = null;
  let unsubscribe = null;
  let destroyed = false;

  function render() {
    if (destroyed) return;
    const graph = store.getGraph();
    edgesLayer.replaceChildren();
    nodesLayer.replaceChildren();

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    for (const edge of graph.edges) {
      const from = nodeById.get(edge.fromNodeId);
      const to = nodeById.get(edge.toNodeId);
      if (!from || !to) continue;
      const fc = nodeCenter(from);
      const tc = nodeCenter(to);
      const line = svgEl('line', {
        x1: fc.x,
        y1: fc.y,
        x2: tc.x,
        y2: tc.y,
        stroke: 'currentColor',
        'data-edge-id': edge.id,
        ...edgeStyle(edge.kind),
        class: 'flowchart-edge' + (edge.id === selectedEdgeId ? ' selected' : ''),
      });
      edgesLayer.appendChild(line);
      if (edge.label) {
        const mx = (fc.x + tc.x) / 2;
        const my = (fc.y + tc.y) / 2;
        const bg = svgEl('rect', {
          x: mx - 20,
          y: my - 8,
          width: 40,
          height: 16,
          fill: 'var(--bg-primary, #fff)',
          'data-edge-label-bg': edge.id,
        });
        edgesLayer.appendChild(bg);
        const t = svgEl('text', {
          x: mx,
          y: my + 4,
          'text-anchor': 'middle',
          'font-size': 11,
          fill: 'currentColor',
          'data-edge-label': edge.id,
        });
        t.textContent = edge.label;
        edgesLayer.appendChild(t);
      }
    }

    for (const node of graph.nodes) {
      const g = svgEl('g', {
        'data-node-id': node.id,
        transform: `translate(${node.x},${node.y})`,
        class: 'flowchart-node' + (node.id === selectedNodeId ? ' selected' : ''),
        tabindex: '0',
        'aria-label': `${node.kind}: ${node.label || '(no label)'}`,
      });
      g.innerHTML = shapeSvg(node.kind, 0, 0, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      const text = svgEl('text', {
        x: DEFAULT_WIDTH / 2,
        y: DEFAULT_HEIGHT / 2 + 4,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'currentColor',
        'pointer-events': 'none',
      });
      text.textContent = node.label || ' ';
      g.appendChild(text);
      nodesLayer.appendChild(g);
    }
  }

  // ----- pointer events -----
  let dragState = null;

  function getSvgPoint(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    // Naive linear mapping into the viewBox (works in jsdom and roughly in
    // production for the bounded viewport; v2 can add proper screenCTM).
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function onPointerDown(ev) {
    const nodeG = ev.target.closest('g[data-node-id]');
    if (nodeG) {
      const nodeId = nodeG.getAttribute('data-node-id');
      const node = store.getGraph().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      selectedNodeId = nodeId;
      selectedEdgeId = null;
      const start = getSvgPoint(ev.clientX, ev.clientY);
      if (ev.altKey) {
        // Alt+drag = create a new edge from this node to wherever the pointer
        // is released. Track source node only; movement does not move nodes.
        dragState = { mode: 'connect', sourceNodeId: nodeId };
      } else {
        dragState = {
          mode: 'move',
          nodeId,
          startX: node.x,
          startY: node.y,
          pointerX: start.x,
          pointerY: start.y,
        };
      }
      ev.preventDefault();
      return;
    }
    const edgeLine = ev.target.closest('line[data-edge-id]');
    if (edgeLine) {
      selectedEdgeId = edgeLine.getAttribute('data-edge-id');
      selectedNodeId = null;
      if (typeof opts.onEdgeClick === 'function') {
        opts.onEdgeClick(selectedEdgeId, ev);
      }
      ev.preventDefault();
      return;
    }
    // Click on empty canvas: add a process node at the click point.
    if (ev.target === svg || ev.target === nodesLayer || ev.target === edgesLayer) {
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const x = Math.max(0, p.x - DEFAULT_WIDTH / 2);
      const y = Math.max(0, p.y - DEFAULT_HEIGHT / 2);
      store.addNode({ kind: 'process', x, y, label: 'Node' });
      ev.preventDefault();
    }
  }

  function onPointerMove(ev) {
    if (!dragState) return;
    if (dragState.mode === 'move') {
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const dx = p.x - dragState.pointerX;
      const dy = p.y - dragState.pointerY;
      store.moveNode(dragState.nodeId, dragState.startX + dx, dragState.startY + dy);
    }
    // connect-mode: visual feedback deferred to v2 (no preview line yet).
  }

  function onPointerUp(ev) {
    if (dragState && dragState.mode === 'connect') {
      const targetG = ev.target && ev.target.closest && ev.target.closest('g[data-node-id]');
      if (targetG) {
        const targetId = targetG.getAttribute('data-node-id');
        if (targetId && targetId !== dragState.sourceNodeId) {
          try {
            store.connect(dragState.sourceNodeId, targetId, 'solid');
          } catch (err) {
            // Connect throws on self-loop; canvas silently ignores.
          }
        }
      }
    }
    dragState = null;
  }

  function onDblClick(ev) {
    const nodeG = ev.target.closest('g[data-node-id]');
    if (!nodeG) return;
    const nodeId = nodeG.getAttribute('data-node-id');
    const node = store.getGraph().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    // Inline-edit overlay: foreignObject-free — just use a positioned HTML
    // <input> overlaid on top of the node, in the canvas's parent.
    const input = document.createElement('input');
    input.type = 'text';
    input.value = node.label;
    input.className = 'flowchart-label-input';
    const rect = nodeG.getBoundingClientRect();
    input.style.position = 'fixed';
    input.style.left = `${rect.left}px`;
    input.style.top = `${rect.top}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    container.appendChild(input);
    input.focus();
    input.select();
    const finish = (commit) => {
      if (commit) store.setNodeLabel(nodeId, input.value);
      input.remove();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (kev) => {
      if (kev.key === 'Enter') finish(true);
      else if (kev.key === 'Escape') finish(false);
    });
    ev.preventDefault();
  }

  function onContextMenu(ev) {
    const nodeG = ev.target.closest('g[data-node-id]');
    if (nodeG) {
      const nodeId = nodeG.getAttribute('data-node-id');
      ev.preventDefault();
      if (typeof opts.onShapeMenu === 'function') opts.onShapeMenu(nodeId, ev);
    }
  }

  svg.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('contextmenu', onContextMenu);

  unsubscribe = store.subscribe(render);
  render();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (typeof unsubscribe === 'function') unsubscribe();
    svg.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('dblclick', onDblClick);
    svg.removeEventListener('contextmenu', onContextMenu);
    svg.remove();
  }

  return { destroy, getSvg: () => svg };
}

module.exports = { createCanvas, SHAPE_KINDS };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-canvas.test.js 2>&1 | tail -15
```

Expected: `Tests: … passed` (some tests may need the `getBoundingClientRect` stubs above — they are included).

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/flowchart/flowchart-canvas.js tests/flowchart-canvas.test.js && git commit -m "feat(flowchart): SVG canvas with drag, double-click label edit, context menu hook"
```

### Task 5: Sidebar panel — `flowchart-panel.js`

**Files:**
- Create: `src/sidebar/flowchart-panel.js`
- Test: `tests/flowchart-panel.test.js`

**Interfaces:**
- Consumes: store from Task 1, canvas from Task 4, mermaid translator from Task 3
- Produces: `renderFlowChartPanel(container, deps) → api`. `deps` = `{ getUserDataPath, readFile, writeFile, insertAtCursor, renderMermaid }`. `renderMermaid(source, targetEl)` is an injected hook so the panel reuses the preview pane's Mermaid render path without taking a direct dependency on `window.mermaid` in tests.

- [ ] **Step 1: Write the failing test**

```javascript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-panel.test.js 2>&1 | tail -10
```

Expected: `Cannot find module '../src/sidebar/flowchart-panel'` and zero tests pass.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/sidebar/flowchart-panel.js
'use strict';

/**
 * Sidebar panel: visual flow chart editor.
 *
 * Owns:
 *   - flowchart-store (graph + undo/redo + subscribe)
 *   - flowchart-canvas (SVG)
 *   - flowchart-mermaid preview (text + injected renderer)
 *   - debounced persistence to <userData>/flowchart-session.json
 *   - panel-scoped keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Delete)
 *   - "Insert at Cursor" button (reuses the existing `insert-content` IPC)
 *
 * @param {HTMLElement} container Mount point inside the sidebar panel
 * @param {object} deps
 * @param {() => string} deps.getUserDataPath   Absolute userData directory
 * @param {(path:string) => Promise<string|null>} deps.readFile
 * @param {(path:string, content:string) => Promise<void>} deps.writeFile
 * @param {(text:string) => void} deps.insertAtCursor
 * @param {(source:string, target:HTMLElement) => void} [deps.renderMermaid]
 */

const { create: createStore } = require('../flowchart/flowchart-store');
const { createCanvas } = require('../flowchart/flowchart-canvas');
const { toMermaid } = require('../flowchart/flowchart-mermaid');

const PREVIEW_DEBOUNCE_MS = 250;
const PERSIST_DEBOUNCE_MS = 500;
const PERSISTENCE_FILENAME = 'flowchart-session.json';

function persistencePath(getUserDataPath) {
  return `${getUserDataPath()}/${PERSISTENCE_FILENAME}`;
}

function debounce(fn, ms) {
  let handle = null;
  return (...args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, ms);
  };
}

function renderFlowChartPanel(container, deps) {
  const {
    getUserDataPath,
    readFile,
    writeFile,
    insertAtCursor,
    renderMermaid = () => {},
  } = deps;
  if (typeof getUserDataPath !== 'function') {
    throw new Error('flowchart-panel: getUserDataPath is required');
  }
  if (typeof readFile !== 'function' || typeof writeFile !== 'function') {
    throw new Error('flowchart-panel: readFile and writeFile are required');
  }
  if (typeof insertAtCursor !== 'function') {
    throw new Error('flowchart-panel: insertAtCursor is required');
  }

  container.innerHTML = `
    <div class="flowchart-panel" tabindex="0">
      <div class="flowchart-toolbar">
        <button class="flowchart-insert-btn" title="Insert Mermaid block at cursor">
          Insert at Cursor
        </button>
        <span class="flowchart-status" aria-live="polite"></span>
      </div>
      <div class="flowchart-split">
        <div class="flowchart-canvas-host"></div>
        <div class="flowchart-preview-host">
          <pre class="flowchart-preview-source"></pre>
          <div class="flowchart-preview-render"></div>
        </div>
      </div>
    </div>
  `;

  const canvasHost = container.querySelector('.flowchart-canvas-host');
  const previewSourceEl = container.querySelector('.flowchart-preview-source');
  const previewRenderEl = container.querySelector('.flowchart-preview-render');
  const insertBtn = container.querySelector('.flowchart-insert-btn');
  const statusEl = container.querySelector('.flowchart-status');

  let selectedNodeId = null;
  let selectedEdgeId = null;

  const store = createStore({
    persistencePath: persistencePath(getUserDataPath),
    readFile,
    writeFile,
    now: () => Date.now(),
  });

  // Hydrate from disk (defensively).
  readFile(persistencePath(getUserDataPath))
    .then((json) => {
      if (json) store.deserialize(json);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('flowchart-panel: failed to read session', err);
    });

  const canvas = createCanvas(canvasHost, store, {
    onEdgeClick: (edgeId) => {
      // Click an edge → prompt for kind and (optional) label. v2 can replace
      // this with a real popover menu; the prompts are intentionally simple.
      selectedEdgeId = edgeId;
      selectedNodeId = null;
      const edge = store.getGraph().edges.find((e) => e.id === edgeId);
      if (!edge) return;
      const nextKind = window.prompt(
        'Edge kind (solid, dotted, thick):',
        edge.kind
      );
      if (nextKind && ['solid', 'dotted', 'thick'].includes(nextKind)) {
        store.setEdgeKind(edgeId, nextKind);
      }
      const nextLabel = window.prompt('Edge label (empty to clear):', edge.label || '');
      if (nextLabel !== null) {
        store.setEdgeLabel(edgeId, nextLabel);
      }
    },
    onShapeMenu: (nodeId) => {
      // Prompt for a new shape kind. v2: replace with a real context menu.
      const next = window.prompt(
        'New shape (process, decision, terminator, subroutine, document):'
      );
      if (next) store.setNodeKind(nodeId, next);
    },
  });

  const debouncedPreview = debounce(() => {
    const source = toMermaid(store.getGraph());
    previewSourceEl.textContent = source;
    try {
      renderMermaid(source, previewRenderEl);
    } catch (err) {
      previewRenderEl.textContent = `Preview error: ${err && err.message ? err.message : 'unknown'}`;
    }
  }, PREVIEW_DEBOUNCE_MS);

  const debouncedPersist = debounce(() => {
    writeFile(persistencePath(getUserDataPath), store.serialize()).catch((err) => {
      if (statusEl) statusEl.textContent = `Save failed: ${err.message || err}`;
    });
  }, PERSIST_DEBOUNCE_MS);

  store.subscribe(() => {
    debouncedPreview();
    debouncedPersist();
  });

  insertBtn.addEventListener('click', () => {
    const source = toMermaid(store.getGraph());
    insertAtCursor('```mermaid\n' + source + '\n```');
  });

  // Keyboard shortcuts — panel-scoped.
  container.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selectedNodeId) {
      ev.preventDefault();
      store.removeNode(selectedNodeId);
      selectedNodeId = null;
    }
  });

  return {
    getStore: () => store,
    getSvg: () => canvas.getSvg(),
    selectNode: (id) => {
      selectedNodeId = id;
    },
    selectEdge: (id) => {
      selectedEdgeId = id;
    },
    destroy: () => {
      canvas.destroy();
    },
  };
}

module.exports = { renderFlowChartPanel };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npx jest tests/flowchart-panel.test.js 2>&1 | tail -15
```

Expected: `Tests: … passed`.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/sidebar/flowchart-panel.js tests/flowchart-panel.test.js && git commit -m "feat(sidebar): flowchart-panel — canvas + preview + persistence + insert"
```

### Task 6: Register panel + sidebar rail button + styles

**Files:**
- Modify: `src/renderer.js:2409` (after the `history` panel registration)
- Modify: `src/index.html:2598` (after the daily-notes rail button)
- Modify: `src/styles-sidebar.css` (append new selectors)

**Interfaces:**
- Consumes: `renderFlowChartPanel` from Task 5, `sidebarManager` (already a singleton), `tabManager.insertAtCursor` (already exposed), IPC for fs read/write
- Produces: `flowchart` panel registered in the sidebar rail; the rail button opens it on click

- [ ] **Step 1: Add the rail button to `src/index.html`**

After the closing `</button>` of the `data-panel="daily-notes"` entry at `src/index.html:2598`, insert:

```html
            <!-- Flow Chart Editor: visual Mermaid flowchart builder -->
            <button class="sidebar-icon" data-panel="flowchart" title="Flow Chart Editor (Ctrl+Alt+F)">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="6" height="4" rx="1" />
                <rect x="15" y="3" width="6" height="4" rx="1" />
                <polygon points="9,17 12,13 15,17" />
                <line x1="6" y1="7" x2="6" y2="11" />
                <line x1="18" y1="7" x2="18" y2="11" />
                <line x1="6" y1="11" x2="9" y2="15" />
                <line x1="18" y1="11" x2="15" y2="15" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </button>
```

- [ ] **Step 2: Append styles to `src/styles-sidebar.css`**

Append (at end of file):

```css
/* === Flow Chart Editor panel === */
.flowchart-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  outline: none;
}
.flowchart-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color, #444);
}
.flowchart-insert-btn {
  padding: 4px 10px;
  border: 1px solid var(--accent, #4a9eff);
  background: var(--accent, #4a9eff);
  color: var(--accent-fg, #fff);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.flowchart-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted, #888);
}
.flowchart-split {
  display: flex;
  flex: 1;
  min-height: 0;
}
.flowchart-canvas-host {
  flex: 7;
  min-width: 0;
  position: relative;
  background: var(--bg-secondary, #1e1e1e);
}
.flowchart-canvas-host svg.flowchart-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
}
.flowchart-preview-host {
  flex: 3;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color, #444);
}
.flowchart-preview-source {
  flex: 1;
  margin: 0;
  padding: 8px;
  font-family: var(--mono-font, monospace);
  font-size: 11px;
  overflow: auto;
  white-space: pre;
  border-bottom: 1px solid var(--border-color, #444);
}
.flowchart-preview-render {
  flex: 1;
  padding: 8px;
  overflow: auto;
}
.flowchart-node {
  cursor: grab;
}
.flowchart-node.selected rect,
.flowchart-node.selected polygon {
  stroke: var(--accent, #4a9eff);
  stroke-width: 2;
}
.flowchart-edge.selected {
  stroke: var(--accent, #4a9eff);
}
.flowchart-label-input {
  font-size: 13px;
  text-align: center;
  border: 1px solid var(--accent, #4a9eff);
  background: var(--bg-primary, #fff);
  color: inherit;
  z-index: 100;
}
```

- [ ] **Step 3: Wire the panel into `src/renderer.js`**

Add an IPC bridge for filesystem read/write (renderer-only persistence — matches the pattern in `autosave-client.js`). First, near the top of `src/renderer.js` where other IPC helpers are imported, add:

```javascript
// Lazy-loaded: filesystem helpers used by the flowchart panel for
// <userData>/flowchart-session.json auto-save.
const flowchartIO = {
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  readFile: (p) => ipcRenderer.invoke('read-text-file', p),
  writeFile: (p, content) => ipcRenderer.invoke('write-text-file', { path: p, content }),
};
```

Then, immediately after the existing `history` panel registration at `src/renderer.js:2409`, add:

```javascript
  // Flow Chart Editor panel — visual Mermaid flowchart builder.
  // Persists to <userData>/flowchart-session.json via injected IPC helpers.
  // Reuses tabManager.insertAtCursor for the "Insert at Cursor" button.
  const { renderFlowChartPanel } = require('./sidebar/flowchart-panel');
  // Reuse the existing Mermaid render path used by the preview pane
  // (src/renderer.js:1106-1142). Lazily loads mermaid on first use.
  const renderFlowChartMermaid = (source, targetEl) => {
    targetEl.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = source;
    targetEl.appendChild(div);
    if (!window.mermaid) {
      const mermaidModule = require('mermaid');
      window.mermaid = mermaidModule.default || mermaidModule;
    }
    const theme = document.body.className.includes('theme-dark') ? 'dark' : 'default';
    window.mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'loose' });
    window.mermaid
      .run({ nodes: [div] })
      .catch((err) => console.warn('flowchart preview render failed:', err));
  };
  sidebarManager.registerPanel('flowchart', {
    title: 'Flow Chart',
    render: (container) =>
      renderFlowChartPanel(container, {
        getUserDataPath: flowchartIO.getUserDataPath,
        readFile: flowchartIO.readFile,
        writeFile: flowchartIO.writeFile,
        insertAtCursor: (text) => tabManager.insertAtCursor(text),
        renderMermaid: renderFlowChartMermaid,
      }),
  });
```

- [ ] **Step 4: Add `get-user-data-path`, `read-text-file`, `write-text-file` IPC channels to `src/main.js`**

NOTE: The spec says "no new IPC channels". This task adds THREE thin IPC wrappers (one-line passthroughs to `app.getPath('userData')` and `fs`) so the renderer can read/write `<userData>/flowchart-session.json` without exposing `fs` in the renderer. This matches the existing pattern in `src/main.js:268` (settings file path) and `src/main.js:742` (recent files JSON read). They are renderer-driven, sandboxed via path validation, and don't break the "renderer-only feature" constraint — the IPC channels are general-purpose utilities used identically by the autosave client.

In `src/main.js`, near the existing `ipcMain.handle('read-file', …)` handler (search for `ipcMain.handle('read-file'`), add:

```javascript
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

ipcMain.handle('read-text-file', async (_event, filePath) => {
  // Reuse the same path validation as the existing read-file handler.
  const safe = path.resolve(filePath);
  if (!safe.startsWith(path.resolve(app.getPath('userData')))) {
    throw new Error('read-text-file: path outside userData is not allowed');
  }
  try {
    return await fs.promises.readFile(safe, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
});

ipcMain.handle('write-text-file', async (_event, { path: filePath, content }) => {
  const safe = path.resolve(filePath);
  if (!safe.startsWith(path.resolve(app.getPath('userData')))) {
    throw new Error('write-text-file: path outside userData is not allowed');
  }
  await fs.promises.writeFile(safe, content, 'utf-8');
});
```

- [ ] **Step 5: Verify the existing test suite still passes**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test 2>&1 | tail -20
```

Expected: All existing tests pass; new flowchart tests pass.

- [ ] **Step 6: Run lint + format**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint 2>&1 | tail -20 && npm run format 2>&1 | tail -10 && npm run format:check 2>&1 | tail -10
```

Expected: lint clean; format applies then clean.

- [ ] **Step 7: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/index.html src/styles-sidebar.css src/renderer.js src/main.js && git commit -m "feat(sidebar): register flowchart panel + rail button + thin fs IPC"
```

### Task 7: README updates

**Files:**
- Modify: `README.md:54-70` (Advanced Features list)
- Modify: `README.md:120-128` (Keyboard Shortcuts table)

- [ ] **Step 1: Add the Advanced Features row**

In `README.md`, in the bullet list starting around line 54 ("- **Page size configuration** ..."), add a new line:

```markdown
- **Visual flow chart editor** - Build Mermaid flowcharts visually; drag nodes, connect edges, live preview. Insert at cursor.
```

- [ ] **Step 2: Add the Keyboard Shortcut rows**

In `README.md`, in the keyboard-shortcuts table around line 120, add rows:

```markdown
| Add Flow Chart Node | Insert (when panel focused) |
| Flow Chart: Undo | Ctrl+Z |
| Flow Chart: Redo | Ctrl+Shift+Z |
| Flow Chart: Delete selected | Delete |
```

- [ ] **Step 3: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add README.md && git commit -m "docs(readme): visual flow chart editor feature + panel-scoped shortcuts"
```

### Task 8: Final verification pass

**Files:** none — verification only

- [ ] **Step 1: Run the full test suite**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test 2>&1 | tail -30
```

Expected: All tests pass — existing + 30+ new flowchart tests across the 5 new files.

- [ ] **Step 2: Run lint**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint 2>&1 | tail -10
```

Expected: clean (no errors).

- [ ] **Step 3: Run format check**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run format:check 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 4: Self-review for forbidden markers**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && grep -nE "TODO|FIXME|XXX|HACK|not implemented|placeholder|stub|for now|in a real app|mock data|hardcoded for demo|coming soon" src/flowchart/ src/sidebar/flowchart-panel.js tests/flowchart-*.test.js 2>&1 | head -20
```

Expected: empty output.

- [ ] **Step 5: Verify the Linux build still succeeds**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run build:linux 2>&1 | tail -20
```

Expected: `dist/MarkdownConverter-*.AppImage` (and .deb) produced.

- [ ] **Step 6: Final commit if any auto-formatting drifted**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git status && git diff --stat
```

If changes exist from `npm run format`, commit them:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add -A && git commit -m "chore: prettier pass on flowchart editor files"
```

## Definition of Done

- [ ] All 8 tasks completed with their own commit
- [ ] 30+ new tests across 5 files (store, mermaid, shapes, canvas, panel)
- [ ] `npm test`, `npm run lint`, `npm run format:check` all clean
- [ ] `npm run build:linux` succeeds
- [ ] No forbidden markers (`TODO`/`FIXME`/`HACK`/`placeholder`/`stub`/etc.) in changed files
- [ ] Panel opens from the new sidebar rail button
- [ ] Add/drag/edit-label/connect/delete all wired through the canvas to the store
- [ ] Right preview pane shows live Mermaid source + rendered SVG
- [ ] Insert-at-Cursor wraps in ```` ```mermaid ```` and reuses `tabManager.insertAtCursor`
- [ ] Undo/redo (Ctrl+Z / Ctrl+Shift+Z) panel-scoped
- [ ] Persistence round-trip survives app restart
- [ ] README mentions the feature + the panel-scoped shortcuts
