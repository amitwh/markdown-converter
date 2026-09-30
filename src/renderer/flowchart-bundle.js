/* global XMLSerializer */
/**
 * v4.12.0 — Bundled single-file Flowchart Generator loader.
 *
 * Inlines the four pure modules (flowchart-shapes / flowchart-mermaid /
 * flowchart-store / flowchart-canvas) plus the renderer controller
 * (src/renderer/flowchart-controller.js) into one script. Loads as a single
 * `<script src="renderer/flowchart-bundle.js">` tag in
 * src/flowchart-generator.html.
 *
 * History:
 *   v4.9.6 — split modules into UMD wrappers; standalone window loaded each
 *            via `<script>` tags.
 *   v4.9.7 — added the `window.FlowchartXxx = exported` guard inside every
 *            UMD wrapper so the global survives the `module` truthy
 *            (nodeIntegration:true) case in the renderer.
 *   v4.9.8 — even with the v4.9.7 guards the user kept reporting
 *            'modules not loaded' in the standalone window. Rather than
 *            rely on script-tag ordering / UMD quirks across all four files,
 *            brute-force bundle everything into one self-contained file. No
 *            cross-file script ordering, no UMD wrapper, no `require()`. The
 *            standalone window now has exactly one script dependency.
 *   v4.9.9 — Electron renderer contexts disable `window.prompt` and
 *            `window.confirm`, so shape change / edge kind / edge label /
 *            reset confirmation did nothing. Replaced with `promptInline`
 *            and `confirmInline` (custom DOM-overlay modals). Exposed as
 *            `window.FlowchartModals` for jsdom tests.
 *   v4.10.0 — User still reported "no fix still" because hidden right-
 *            click context menus and `window.prompt` were unreliable in
 *            Electron. Added a *visible* floating selection toolbar
 *            inside the canvas panel (`<div id="fc-selection-toolbar">`)
 *            that exposes shape buttons, edge-kind buttons, an inline
 *            label input, and a Delete button — no hidden UI affordance
 *            for the primary interactions. Added console-log diagnostics
 *            on every canvas event (pointerdown / pointerup / dblclick /
 *            contextmenu / selection change / bootstrap phase) so the
 *            user can open DevTools (Ctrl+Shift+I) and see what's firing.
 *            `promptInline` / `confirmInline` kept as advanced fallback
 *            for the right-click "change shape" path; the toolbar is now
 *            the primary interaction surface.
 *   v4.11.0 — The v4.10.0 floating toolbar was click-driven and the user
 *            reported it still showed only rectangles in their Electron
 *            runtime (SVG click hit-testing was unreliable). Replaced
 *            with a button-driven node-list panel (`#fc-nodelist`)
 *            between the canvas and the preview. Every mutation — add
 *            node, delete node, change kind, edit label, add edge,
 *            delete edge, change edge kind, edit edge label — is wired
 *            to explicit buttons and form controls. The canvas itself
 *            is now purely visual: no more click hit-testing, no more
 *            selection state, no more floating toolbar. `promptInline` /
 *            `confirmInline` are kept only for the Reset confirmation
 *            modal.
 *   v4.12.0 — User feedback: the v4.11.0 connect form (From dropdown +
 *            To dropdown + "+ Edge") was buried below the node/edge
 *            lists and they couldn't find it. Moved the connect form
 *            up to the second section in #fc-nodelist (right after Add
 *            Node). Also added (a) a per-node color picker in the
 *            node list (`<input type="color">` → `store.setNodeColor`)
 *            — `shapeSvg` now accepts an optional color arg and
 *            normalises `#ffffff` by default; (b) a "Save to File"
 *            button alongside "Insert at Cursor" that opens a system
 *            save dialog via a new `save-text-file` IPC channel. The
 *            standalone top toolbar was removed; Insert / Save / Reset
 *            now live inside the panel's new "Export" section.
 *
 * The legacy individual files under src/flowchart/* and
 * src/renderer/flowchart-controller.js are kept untouched — the
 * `src/renderer.js` sidebar still uses the CommonJS shape via require().
 *
 * Pure browser script — no require(), no module.exports, no Node APIs.
 */
(function () {
  'use strict';

  // ========== flowchart-shapes (inlined) ==========
  // v4.12.0 — accepts an optional `color` (6th) arg so the canvas can paint
  // each node with its per-node fill color. Falls back to `#ffffff`.
  const SHAPE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
  const DEFAULT_WIDTH = 140;
  const DEFAULT_HEIGHT = 60;
  const LABEL_PADDING_X = 16;
  const LABEL_PADDING_Y = 12;
  const DEFAULT_FILL = '#ffffff';

  function shapeSvg(kind, x, y, width, height, color) {
    if (!SHAPE_KINDS.includes(kind)) {
      throw new Error(`flowchart-shapes: unknown shape kind "${kind}"`);
    }
    const fill = typeof color === 'string' && color.length > 0 ? color : DEFAULT_FILL;
    switch (kind) {
      case 'process':
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" ry="4" fill="${fill}" />`;
      case 'terminator':
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" ry="${height / 2}" fill="${fill}" />`;
      case 'subroutine': {
        const inset = 4;
        return (
          `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" ry="4" fill="${fill}" />` +
          `<rect x="${x + inset}" y="${y + inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" rx="4" ry="4" fill="${fill}" />`
        );
      }
      case 'decision': {
        const cx = x + width / 2;
        const cy = y + height / 2;
        const left = `${x},${cy}`;
        const top = `${cx},${y}`;
        const right = `${x + width},${cy}`;
        const bottom = `${cx},${y + height}`;
        return `<polygon points="${left} ${top} ${right} ${bottom}" fill="${fill}" />`;
      }
      case 'document': {
        // Parallelogram: top-right and bottom-right indented by ~20% of height.
        const skew = Math.max(10, Math.round(height * 0.25));
        const tl = `${x + skew},${y}`;
        const tr = `${x + width},${y}`;
        const br = `${x + width - skew},${y + height}`;
        const bl = `${x},${y + height}`;
        return `<polygon points="${tl} ${tr} ${br} ${bl}" fill="${fill}" />`;
      }
      default:
        throw new Error(`flowchart-shapes: unknown shape kind "${kind}"`);
    }
  }

  // Exposed for the controller (and any other bundle consumer).
  window.FlowchartShapes = {
    shapeSvg,
    SHAPE_KINDS,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
  };

  // ========== flowchart-mermaid (inlined) ==========
  const MERMAID_SHAPE_SYNTAX = {
    process: (id, label) => `${id}[${label}]`,
    decision: (id, label) => `${id}{${label}}`,
    terminator: (id, label) => `${id}([${label}])`,
    subroutine: (id, label) => `${id}[[${label}]]`,
    document: (id, label) => `${id}[/${label}/]`,
  };

  const MERMAID_EDGE_ARROW = {
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
    const fn = MERMAID_SHAPE_SYNTAX[node.kind];
    if (!fn) throw new Error(`flowchart-mermaid: unknown node kind "${node.kind}"`);
    return fn(node.id, escapeLabel(node.label));
  }

  function edgeDeclaration(edge, fromId, toId) {
    const arrow = MERMAID_EDGE_ARROW[edge.kind];
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

  window.FlowchartMermaid = { toMermaid, escapeLabel, nodeDeclaration, edgeDeclaration };

  // ========== flowchart-mermaid-parse (inlined v4.13.0) ==========
  // Inverse of toMermaid. Hand-edited to drop the duplicate parser code —
  // re-import this from src/flowchart/flowchart-mermaid-parse.js as a
  // pure function bundle step. Since this is a bundle, we replicate the
  // minimal API surface needed by the renderer here.
  function unescapeLabel(label) {
    return String(label || '')
      .replace(/#quot;/g, '"')
      .replace(/\\n/g, '\n');
  }
  function fromMermaid(source) {
    const nodes = [];
    const edges = [];
    const idMap = new Map();
    if (typeof source !== 'string') return { nodes, edges };
    const lines = source
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('%%'));
    const SHAPES = [
      { p: '[[', s: ']]', k: 'subroutine' },
      { p: '([', s: '])', k: 'terminator' },
      { p: '[/', s: '/]', k: 'document' },
      { p: '{', s: '}', k: 'decision' },
      { p: '[', s: ']', k: 'process' },
    ];
    const ARROWS = { '-->': 'solid', '-.->': 'dotted', '==>': 'thick' };
    let auto = 0;
    for (const line of lines) {
      if (/^flowchart\s+(TD|LR|BT|RL)/i.test(line)) continue;
      let arrow = null,
        arrowAt = -1;
      for (const a of Object.keys(ARROWS)) {
        const i = line.indexOf(a);
        if (i !== -1 && (arrowAt === -1 || i < arrowAt)) {
          arrow = a;
          arrowAt = i;
        }
      }
      if (arrow) {
        const before = line.slice(0, arrowAt).trim();
        const after = line.slice(arrowAt + arrow.length).trim();
        const beforeLabel = /\|([^|]*)\|/.exec(before);
        const afterLabel = /\|([^|]*)\|/.exec(after);
        const from = beforeLabel ? before.replace(beforeLabel[0], '').trim() : before;
        const to = afterLabel ? after.replace(afterLabel[0], '').trim() : after;
        const label = (afterLabel && afterLabel[1]) || (beforeLabel && beforeLabel[1]) || '';
        const fid = ensureId(from, idMap, nodes, () => autoNode(auto++));
        const tid = ensureId(to, idMap, nodes, () => autoNode(auto++));
        edges.push({
          id: 'e_' + edges.length,
          fromNodeId: fid,
          toNodeId: tid,
          kind: ARROWS[arrow],
          label,
        });
        continue;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(line);
      if (m) {
        const id = m[1];
        const body = m[2];
        for (const sh of SHAPES) {
          if (body.startsWith(sh.p) && body.endsWith(sh.s)) {
            const label = unescapeLabel(body.slice(sh.p.length, body.length - sh.s.length));
            idMap.set(id, 'n_' + id);
            if (!nodes.find((n) => n.id === 'n_' + id)) {
              nodes.push({
                id: 'n_' + id,
                kind: sh.k,
                x: 40 + (nodes.length % 5) * 160,
                y: 40 + Math.floor(nodes.length / 5) * 100,
                label,
              });
            }
            break;
          }
        }
      }
    }
    function ensureId(mid, map, ns, mk) {
      if (map.has(mid)) return map.get(mid);
      const n = mk();
      ns.push(n);
      map.set(mid, n.id);
      return n.id;
    }
    function autoNode(n) {
      return {
        id: 'n_auto_' + n,
        kind: 'process',
        x: 40 + (n % 5) * 160,
        y: 40 + Math.floor(n / 5) * 100,
        label: '',
      };
    }
    return { nodes, edges };
  }

  // ========== flowchart-store (inlined) ==========
  // v4.12.0 — Nodes carry an optional `color` field; `setNodeColor(id, color)`
  // mutates it, and serialize/deserialize round-trip it.
  const STORE_NODE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
  const STORE_EDGE_KINDS = ['solid', 'dotted', 'thick'];
  const STORE_UNDO_LIMIT = 50;
  const STORE_DEFAULT_COLOR = '#ffffff';

  function storeClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function storeNewId(prefix) {
    // 12 hex chars; monotonic enough for in-memory use.
    return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
  }

  function isValidNode(node) {
    return (
      node &&
      typeof node.id === 'string' &&
      STORE_NODE_KINDS.includes(node.kind) &&
      Number.isFinite(node.x) &&
      Number.isFinite(node.y) &&
      typeof node.label === 'string'
    );
  }

  function normalizeColor(color) {
    if (typeof color !== 'string' || color.length === 0) {
      return { color: STORE_DEFAULT_COLOR };
    }
    const trimmed = color.trim();
    const hex = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed);
    if (!hex) return { color: STORE_DEFAULT_COLOR };
    return { color: trimmed.startsWith('#') ? trimmed : `#${trimmed}` };
  }

  function isValidEdge(edge) {
    return (
      edge &&
      typeof edge.id === 'string' &&
      typeof edge.fromNodeId === 'string' &&
      typeof edge.toNodeId === 'string' &&
      STORE_EDGE_KINDS.includes(edge.kind)
    );
  }

  /**
   * @param {object} io
   * @param {string} io.persistencePath Absolute path for auto-save JSON.
   * @param {(path:string) => Promise<string|null>} io.readFile
   * @param {(path:string, content:string) => Promise<void>} io.writeFile
   * @param {() => number} io.now
   */
  function createStore(io) {
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
        } catch {
          // Don't let a subscriber crash the store.
        }
      }
    }

    function snapshot() {
      undoStack.push(storeClone(graph));
      if (undoStack.length > STORE_UNDO_LIMIT) undoStack.shift();
      redoStack.length = 0;
    }

    function getGraph() {
      return storeClone(graph);
    }

    function addNode({ kind, x, y, label = '', color }) {
      if (!STORE_NODE_KINDS.includes(kind)) {
        throw new Error(`flowchart-store: unknown node kind "${kind}"`);
      }
      snapshot();
      const node = {
        id: storeNewId('n'),
        kind,
        x,
        y,
        label,
        ...normalizeColor(color),
      };
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
      if (!STORE_NODE_KINDS.includes(kind)) {
        throw new Error(`flowchart-store: unknown node kind "${kind}"`);
      }
      const idx = findNodeIndex(id);
      if (idx === -1) throw new Error(`flowchart-store: unknown node id "${id}"`);
      snapshot();
      graph.nodes[idx] = { ...graph.nodes[idx], kind };
      emit();
    }

    function setNodeColor(id, color) {
      const idx = findNodeIndex(id);
      if (idx === -1) throw new Error(`flowchart-store: unknown node id "${id}"`);
      snapshot();
      graph.nodes[idx] = { ...graph.nodes[idx], ...normalizeColor(color) };
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
      if (!STORE_EDGE_KINDS.includes(kind)) {
        throw new Error(`flowchart-store: unknown edge kind "${kind}"`);
      }
      snapshot();
      const edge = { id: storeNewId('e'), fromNodeId, toNodeId, kind };
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
      if (!STORE_EDGE_KINDS.includes(kind)) {
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
      redoStack.push(storeClone(graph));
      graph = prior;
      emit();
    }

    function redo() {
      const next = redoStack.pop();
      if (!next) return;
      undoStack.push(storeClone(graph));
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
      } catch {
        graph = { nodes: [], edges: [] };
        return;
      }
      const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes.filter(isValidNode) : [];
      const nodes = rawNodes.map((n) => ({ ...n, ...normalizeColor(n.color) }));
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
      return storeClone(graph);
    }

    return {
      getGraph,
      addNode,
      moveNode,
      setNodeLabel,
      setNodeKind,
      setNodeColor,
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

  window.FlowchartStore = {
    create: createStore,
    NODE_KINDS: STORE_NODE_KINDS,
    EDGE_KINDS: STORE_EDGE_KINDS,
  };

  // ========== flowchart-canvas (inlined, no require) ==========
  const CANVAS_SVG_NS = 'http://www.w3.org/2000/svg';

  function canvasSvgEl(tag, attrs = {}) {
    const el = document.createElementNS(CANVAS_SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined) continue;
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function canvasEdgeStyle(kind) {
    if (kind === 'dotted') return { 'stroke-dasharray': '4,4', 'stroke-width': 1 };
    if (kind === 'thick') return { 'stroke-width': 3 };
    return { 'stroke-width': 1 };
  }

  function canvasNodeCenter(node) {
    return { x: node.x + DEFAULT_WIDTH / 2, y: node.y + DEFAULT_HEIGHT / 2 };
  }

  function createCanvas(container, store, opts = {}) {
    const svg = canvasSvgEl('svg', {
      class: 'flowchart-canvas',
      width: '100%',
      height: '100%',
      viewBox: '0 0 1000 700',
      role: 'img',
      'aria-label': 'Flow chart canvas',
    });
    container.appendChild(svg);

    // Layer order: edges first (under nodes), then nodes.
    const edgesLayer = canvasSvgEl('g', { class: 'flowchart-edges' });
    const nodesLayer = canvasSvgEl('g', { class: 'flowchart-nodes' });
    svg.appendChild(edgesLayer);
    svg.appendChild(nodesLayer);

    let selectedNodeId = null;
    let selectedEdgeId = null;
    let unsubscribe = null;
    let destroyed = false;
    // v4.13.0 — multi-selection Set + drag-rect state. Mirrors the
    // canonical src/flowchart/flowchart-canvas.js so the standalone
    // window gets shift+click toggle and drag-rect multi-select.
    const selectedNodeIds = new Set();
    let onSelectionChange = null;
    let rectSelectState = null;
    let rectOverlay = null;

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
        const fc = canvasNodeCenter(from);
        const tc = canvasNodeCenter(to);
        const line = canvasSvgEl('line', {
          x1: fc.x,
          y1: fc.y,
          x2: tc.x,
          y2: tc.y,
          stroke: 'currentColor',
          'data-edge-id': edge.id,
          ...canvasEdgeStyle(edge.kind),
          class: 'flowchart-edge' + (edge.id === selectedEdgeId ? ' selected' : ''),
        });
        edgesLayer.appendChild(line);
        if (edge.label) {
          const mx = (fc.x + tc.x) / 2;
          const my = (fc.y + tc.y) / 2;
          const bg = canvasSvgEl('rect', {
            x: mx - 20,
            y: my - 8,
            width: 40,
            height: 16,
            fill: 'var(--bg-primary, #fff)',
            'data-edge-label-bg': edge.id,
          });
          edgesLayer.appendChild(bg);
          const t = canvasSvgEl('text', {
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
        const g = canvasSvgEl('g', {
          'data-node-id': node.id,
          transform: `translate(${node.x},${node.y})`,
          class: 'flowchart-node' + (node.id === selectedNodeId ? ' selected' : ''),
          tabindex: '0',
          'aria-label': `${node.kind}: ${node.label || '(no label)'}`,
        });
        // v4.12.0 — pass the per-node fill color through to the shape SVG.
        // `shapeSvg` itself falls back to #ffffff when the color is missing
        // or invalid, so old (uncolored) sessions keep rendering correctly.
        g.innerHTML = shapeSvg(node.kind, 0, 0, DEFAULT_WIDTH, DEFAULT_HEIGHT, node.color);
        const text = canvasSvgEl('text', {
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

    // Surgical selection highlight — toggles the `.selected` class on the
    // existing SVG <g> / <line> elements without going through render() (which
    // replaces all children and would detach the very element the user's
    // pointer is still on, breaking pointermove/pointerup bubbling on the
    // same node during a drag). Called from onPointerDown after the internal
    // selectedNodeId/selectedEdgeId update. The existing
    // .flowchart-node.selected / .flowchart-edge.selected CSS rules (see
    // src/styles-sidebar.css) handle the visual highlight.
    function applySelectionHighlight() {
      if (destroyed) return;
      const nodeEls = nodesLayer.querySelectorAll('g[data-node-id]');
      nodeEls.forEach((g) => {
        const id = g.getAttribute('data-node-id');
        g.classList.toggle('selected', selectedNodeIds.has(id));
      });
      const edgeEls = edgesLayer.querySelectorAll('line[data-edge-id]');
      edgeEls.forEach((l) => {
        const id = l.getAttribute('data-edge-id');
        l.classList.toggle('selected', id === selectedEdgeId);
      });
    }
    // v4.13.0 — multi-selection helpers. emitSelectionChange is
    // called whenever the selection changes so the bundle's
    // _selectedNodeIds can stay in sync.
    function emitSelectionChange() {
      if (typeof onSelectionChange === 'function') {
        try {
          onSelectionChange({
            nodeId: selectedNodeId,
            edgeId: selectedEdgeId,
            nodeIds: Array.from(selectedNodeIds),
          });
        } catch {
          // never let a caller bug kill the canvas
        }
      }
    }
    function setMultiSelection(nodeIds) {
      selectedNodeIds.clear();
      if (Array.isArray(nodeIds)) {
        for (const id of nodeIds) {
          if (typeof id === 'string' && id.length > 0) selectedNodeIds.add(id);
        }
      }
      selectedNodeId = selectedNodeIds.size > 0 ? Array.from(selectedNodeIds)[0] : null;
      selectedEdgeId = null;
      applySelectionHighlight();
      emitSelectionChange();
    }
    function clearMultiSelection() {
      selectedNodeIds.clear();
      selectedNodeId = null;
      selectedEdgeId = null;
      applySelectionHighlight();
      emitSelectionChange();
    }
    function getMultiSelection() {
      return Array.from(selectedNodeIds);
    }
    function setOnSelectionChange(cb) {
      onSelectionChange = typeof cb === 'function' ? cb : null;
    }
    // Rect-select overlay helpers.
    function ensureRectOverlay() {
      if (rectOverlay) return rectOverlay;
      rectOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectOverlay.setAttribute('fill', 'rgba(37, 99, 235, 0.12)');
      rectOverlay.setAttribute('stroke', '#2563eb');
      rectOverlay.setAttribute('stroke-width', '1');
      rectOverlay.setAttribute('stroke-dasharray', '4 3');
      rectOverlay.setAttribute('pointer-events', 'none');
      rectOverlay.setAttribute('class', 'flowchart-rect-select');
      rectOverlay.setAttribute('x', '0');
      rectOverlay.setAttribute('y', '0');
      rectOverlay.setAttribute('width', '0');
      rectOverlay.setAttribute('height', '0');
      svg.appendChild(rectOverlay);
      return rectOverlay;
    }
    function updateRectOverlay(x, y, w, h) {
      const overlay = ensureRectOverlay();
      overlay.setAttribute('x', String(x));
      overlay.setAttribute('y', String(y));
      overlay.setAttribute('width', String(Math.max(0, w)));
      overlay.setAttribute('height', String(Math.max(0, h)));
    }
    function clearRectOverlay() {
      if (rectOverlay && rectOverlay.parentNode) {
        rectOverlay.parentNode.removeChild(rectOverlay);
      }
      rectOverlay = null;
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
        // v4.13.0 — shift+click toggles membership in the multi-selection.
        // Plain click replaces the selection with just this node.
        if (ev.shiftKey) {
          if (selectedNodeIds.has(nodeId)) {
            selectedNodeIds.delete(nodeId);
            if (selectedNodeId === nodeId) {
              const remaining = Array.from(selectedNodeIds);
              selectedNodeId = remaining.length > 0 ? remaining[0] : null;
            }
          } else {
            selectedNodeIds.add(nodeId);
            selectedNodeId = nodeId;
          }
        } else {
          selectedNodeIds.clear();
          selectedNodeIds.add(nodeId);
          selectedNodeId = nodeId;
        }
        selectedEdgeId = null;
        // Paint the .flowchart-node.selected highlight immediately on a bare
        // click (without a drag). store.subscribe would normally trigger
        // render() after moveNode; a click-only path has no store mutation, so
        // we apply the highlight ourselves. Surgical toggle — not a full
        // render() — so the pointerdown target stays attached and subsequent
        // pointermove/pointerup can still bubble on the same element.
        applySelectionHighlight();
        emitSelectionChange();
        const start = getSvgPoint(ev.clientX, ev.clientY);
        if (ev.altKey) {
          // Alt+drag = create a new edge from this node to wherever the pointer
          // is released. Track source node only; movement does not move nodes.
          dragState = { mode: 'connect', sourceNodeId: nodeId };
          console.log('[flowchart] pointerdown on node', nodeId, '— altKey=true (connect mode)');
        } else {
          dragState = {
            mode: 'move',
            nodeId,
            startX: node.x,
            startY: node.y,
            pointerX: start.x,
            pointerY: start.y,
          };
          console.log('[flowchart] pointerdown on node', nodeId, '— altKey=false (move mode)');
        }
        // Notify the panel so its internal selection state (used by Delete /
        // Backspace keyboard shortcuts) tracks the canvas selection.
        if (typeof opts.onNodeClick === 'function') {
          opts.onNodeClick(nodeId, ev);
        }
        ev.preventDefault();
        return;
      }
      const edgeLine = ev.target.closest('line[data-edge-id]');
      if (edgeLine) {
        selectedEdgeId = edgeLine.getAttribute('data-edge-id');
        selectedNodeId = null;
        selectedNodeIds.clear();
        // Same reasoning as the node branch above: paint the edge highlight
        // immediately so a click-without-drag isn't invisible until the next
        // store mutation triggers a re-render.
        applySelectionHighlight();
        emitSelectionChange();
        console.log('[flowchart] pointerdown on edge', selectedEdgeId);
        if (typeof opts.onEdgeClick === 'function') {
          opts.onEdgeClick(selectedEdgeId, ev);
        }
        ev.preventDefault();
        return;
      }
      // Click on empty canvas: start a drag-rect. If the user releases
      // without moving, fall back to the legacy "click adds a process
      // node" affordance. v4.13.0 — multi-select via drag-rect.
      if (ev.target === svg || ev.target === nodesLayer || ev.target === edgesLayer) {
        const p = getSvgPoint(ev.clientX, ev.clientY);
        rectSelectState = {
          startX: p.x,
          startY: p.y,
          additive: ev.shiftKey,
          moved: false,
        };
        ev.preventDefault();
      }
    }

    function onPointerMove(ev) {
      if (rectSelectState) {
        const p = getSvgPoint(ev.clientX, ev.clientY);
        const x0 = Math.min(rectSelectState.startX, p.x);
        const x1 = Math.max(rectSelectState.startX, p.x);
        const y0 = Math.min(rectSelectState.startY, p.y);
        const y1 = Math.max(rectSelectState.startY, p.y);
        rectSelectState.moved = true;
        updateRectOverlay(x0, y0, x1 - x0, y1 - y0);
        return;
      }
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
              const edge = store.connect(dragState.sourceNodeId, targetId, 'solid');
              console.log(
                '[flowchart] pointerup connect:',
                dragState.sourceNodeId,
                '->',
                targetId,
                'new edge',
                edge && edge.id
              );
            } catch (err) {
              console.log('[flowchart] pointerup connect failed:', err && err.message);
            }
          } else {
            console.log('[flowchart] pointerup connect dropped (self-loop or no target)', targetId);
          }
        } else {
          console.log('[flowchart] pointerup connect dropped (no target node under pointer)');
        }
      } else if (dragState && dragState.mode === 'move') {
        console.log('[flowchart] pointerup move complete for node', dragState.nodeId);
      }
      // v4.13.0 — finalize drag-rect. If the rect is small (treat as a
      // bare click) fall back to the legacy "click adds a process node"
      // affordance. Otherwise intersect against every node centre.
      if (rectSelectState) {
        const p = getSvgPoint(ev.clientX, ev.clientY);
        const x0 = Math.min(rectSelectState.startX, p.x);
        const x1 = Math.max(rectSelectState.startX, p.x);
        const y0 = Math.min(rectSelectState.startY, p.y);
        const y1 = Math.max(rectSelectState.startY, p.y);
        const width = x1 - x0;
        const height = y1 - y0;
        clearRectOverlay();
        if (!rectSelectState.moved && width < 3 && height < 3) {
          if (!rectSelectState.additive) clearMultiSelection();
          const x = Math.max(0, p.x - DEFAULT_WIDTH / 2);
          const y = Math.max(0, p.y - DEFAULT_HEIGHT / 2);
          console.log('[flowchart] bare click on empty — adding process node at', x, y);
          store.addNode({ kind: 'process', x, y, label: 'Node' });
        } else {
          const hits = [];
          for (const node of store.getGraph().nodes) {
            const cx = node.x + DEFAULT_WIDTH / 2;
            const cy = node.y + DEFAULT_HEIGHT / 2;
            if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) hits.push(node.id);
          }
          if (rectSelectState.additive) {
            const next = new Set(selectedNodeIds);
            for (const id of hits) next.add(id);
            setMultiSelection(Array.from(next));
          } else {
            setMultiSelection(hits);
          }
        }
        rectSelectState = null;
      }
      dragState = null;
    }

    function onDblClick(ev) {
      const nodeG = ev.target.closest('g[data-node-id]');
      if (!nodeG) return;
      const nodeId = nodeG.getAttribute('data-node-id');
      const node = store.getGraph().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      console.log('[flowchart] dblclick on node', nodeId, '— opening label editor');
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
        console.log('[flowchart] contextmenu on node', nodeId, '— opening shape picker');
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

    return {
      destroy,
      getSvg: () => svg,
      getMultiSelection,
      setMultiSelection,
      clearMultiSelection,
      setOnSelectionChange,
    };
  }

  // ========== flowchart-align (inlined v4.13.0) ==========
  // Pure alignment + distribution helpers. The full module lives in
  // src/flowchart/flowchart-align.js (14 tests); this inlining keeps the
  // standalone window functional without a rebuild step.
  const ALIGN_DEFAULT_HEIGHT = 60;
  function _alignNodeWidth(node) {
    return Number(node.width) > 0 ? Number(node.width) : 120;
  }
  function _alignClone(node) {
    return Object.assign({}, node);
  }
  function alignLeft(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    const minX = Math.min.apply(
      null,
      nodes.map(function (n) {
        return n.x;
      })
    );
    return nodes.map(function (n) {
      return Object.assign(_alignClone(n), { x: minX });
    });
  }
  function alignRight(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    let maxRight = -Infinity;
    for (const n of nodes) maxRight = Math.max(maxRight, n.x + _alignNodeWidth(n));
    return nodes.map(function (n) {
      return Object.assign(_alignClone(n), { x: maxRight - _alignNodeWidth(n) });
    });
  }
  function alignTop(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    const minY = Math.min.apply(
      null,
      nodes.map(function (n) {
        return n.y;
      })
    );
    return nodes.map(function (n) {
      return Object.assign(_alignClone(n), { y: minY });
    });
  }
  function alignBottom(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    let maxBottom = -Infinity;
    for (const n of nodes) maxBottom = Math.max(maxBottom, n.y + ALIGN_DEFAULT_HEIGHT);
    return nodes.map(function (n) {
      return Object.assign(_alignClone(n), { y: maxBottom - ALIGN_DEFAULT_HEIGHT });
    });
  }
  function alignCenterHorizontal(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    let sum = 0;
    for (const n of nodes) sum += n.x + _alignNodeWidth(n) / 2;
    const avg = sum / nodes.length;
    return nodes.map(function (n) {
      return Object.assign(_alignClone(n), { x: avg - _alignNodeWidth(n) / 2 });
    });
  }
  function alignCenterVertical(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
    let sum = 0;
    for (const n of nodes) sum += n.y + ALIGN_DEFAULT_HEIGHT / 2;
    const avg = sum / nodes.length;
    return nodes.map(function (n) {
      return Object.assign(_alignClone(n), { y: avg - ALIGN_DEFAULT_HEIGHT / 2 });
    });
  }
  function distributeHorizontally(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 3) return nodes;
    const sorted = nodes.slice().sort(function (a, b) {
      return a.x - b.x;
    });
    const leftmost = sorted[0].x;
    const rightmost = sorted[sorted.length - 1].x;
    const gap = (rightmost - leftmost) / (sorted.length - 1);
    return sorted.map(function (n, i) {
      return Object.assign(_alignClone(n), { x: leftmost + gap * i });
    });
  }
  function distributeVertically(nodes) {
    if (!Array.isArray(nodes) || nodes.length < 3) return nodes;
    const sorted = nodes.slice().sort(function (a, b) {
      return a.y - b.y;
    });
    const topmost = sorted[0].y;
    const bottommost = sorted[sorted.length - 1].y;
    const gap = (bottommost - topmost) / (sorted.length - 1);
    return sorted.map(function (n, i) {
      return Object.assign(_alignClone(n), { y: topmost + gap * i });
    });
  }

  // ========== Globals — set BEFORE the controller boots ==========
  window.FlowchartCanvas = { createCanvas, SHAPE_KINDS };
  window.FlowchartAlign = {
    alignLeft: alignLeft,
    alignRight: alignRight,
    alignTop: alignTop,
    alignBottom: alignBottom,
    alignCenterHorizontal: alignCenterHorizontal,
    alignCenterVertical: alignCenterVertical,
    distributeHorizontally: distributeHorizontally,
    distributeVertically: distributeVertically,
  };

  // ========== Controller bootstrap (inline) ==========
  const api =
    window.electronAPI && window.electronAPI.flowchart ? window.electronAPI.flowchart : null;

  const els = {
    canvasHost: document.getElementById('canvas-host'),
    previewSource: document.getElementById('preview-source'),
    previewRender: document.getElementById('preview-render'),
    btnInsert: document.getElementById('fc-btn-insert'),
    btnSave: document.getElementById('fc-btn-save'),
    btnOpen: document.getElementById('fc-btn-open'),
    btnReset: document.getElementById('fc-btn-reset'),
    // v4.13.0 — image export buttons (SVG / PNG / JPG). All three use the
    // same SVG→string serializer; PNG/JPG additionally rasterise through
    // Image + canvas via the binary IPC bridge.
    btnExportSvg: document.getElementById('fc-btn-export-svg'),
    btnExportPng: document.getElementById('fc-btn-export-png'),
    btnExportJpg: document.getElementById('fc-btn-export-jpg'),
    btnExportVsdx: document.getElementById('fc-btn-export-vsdx'),
    // v4.13.0 — alignment + distribution buttons. Multi-select is
    // required for these to be useful; the Set is empty by default
    // and the user can click "Select All" to operate on every node.
    btnAlignLeft: document.getElementById('fc-btn-align-left'),
    btnAlignRight: document.getElementById('fc-btn-align-right'),
    btnAlignTop: document.getElementById('fc-btn-align-top'),
    btnAlignBottom: document.getElementById('fc-btn-align-bottom'),
    btnAlignCenterH: document.getElementById('fc-btn-align-center-h'),
    btnAlignCenterV: document.getElementById('fc-btn-align-center-v'),
    btnDistributeH: document.getElementById('fc-btn-distribute-h'),
    btnDistributeV: document.getElementById('fc-btn-distribute-v'),
    btnSelectAll: document.getElementById('fc-btn-select-all'),
    btnUndo: document.getElementById('fc-btn-undo'),
    btnRedo: document.getElementById('fc-btn-redo'),
    historyCount: document.getElementById('fc-history-count'),
    status: document.getElementById('fc-status'),
    // v4.11.0 — node-list panel (button-driven UI). Every mutation goes
    // through controls in this panel; the canvas is purely visual.
    nodelistUl: document.getElementById('fc-nodelist-ul'),
    edgelistUl: document.getElementById('fc-edgelist-ul'),
    nodeCountEl: document.getElementById('fc-node-count'),
    edgeCountEl: document.getElementById('fc-edge-count'),
    connectFromSel: document.getElementById('fc-connect-from'),
    connectToSel: document.getElementById('fc-connect-to'),
    connectBtn: document.getElementById('fc-connect-btn'),
    connectCancelBtn: document.getElementById('fc-connect-cancel'),
  };

  console.log('[flowchart] DOM loaded');

  // Guard rails — these should never be null in a correctly-launched window.
  // Fail loudly with a visible status message rather than silently no-op'ing
  // if the HTML or the preload bridge are misconfigured.
  function fatal(msg) {
    if (els.status) els.status.textContent = msg;
    console.error('[flowchart-controller]', msg);
  }
  if (!els.canvasHost || !els.previewSource || !els.previewRender) {
    fatal('Required DOM elements missing — check src/flowchart-generator.html');
    return;
  }
  // v4.9.8 — since the pure modules are bundled into this file, the four
  // window.FlowchartXxx globals are guaranteed to be set above. The guard
  // below is now belt-and-braces (it still trips if this file is loaded in
  // some weird context that strips `window`).
  if (
    !window.FlowchartStore ||
    !window.FlowchartCanvas ||
    !window.FlowchartMermaid ||
    !window.FlowchartShapes
  ) {
    fatal('Flowchart pure modules not loaded — verify flowchart-bundle.js ran in full');
    return;
  }
  if (!api) {
    fatal('window.electronAPI.flowchart missing — check src/preload.js');
    return;
  }

  const PREVIEW_DEBOUNCE_MS = 250;
  const PERSIST_DEBOUNCE_MS = 500;
  const PERSISTENCE_FILENAME = 'flowchart-session.json';

  // v4.13.0 — minimal CSS inlined into exported SVG/PNG/JPG so the file
  // renders the same way without the editor stylesheet. Kept terse on
  // purpose: only the rules that affect visible geometry (fills, strokes,
  // label positions). Font fallbacks are conservative — the user-agent
  // default sans-serif is the most portable choice for a portable diagram.
  const EXPORT_CSS = [
    '.flowchart-canvas { background: #ffffff; }',
    '.flowchart-node-shape { stroke: #1f2937; stroke-width: 1.5; }',
    '.flowchart-node-label { font: 14px sans-serif; fill: #111827; text-anchor: middle; dominant-baseline: middle; }',
    '.flowchart-edge-line { stroke: #1f2937; fill: none; }',
    '.flowchart-edge-label-bg { fill: #ffffff; stroke: none; }',
    '.flowchart-edge-label { font: 12px sans-serif; fill: #111827; text-anchor: middle; dominant-baseline: middle; }',
    '.flowchart-connect-preview { stroke: #2563eb; stroke-dasharray: 6 4; stroke-width: 2; fill: none; }',
    '.flowchart-selection-ring { stroke: #2563eb; stroke-width: 2; fill: none; }',
  ].join('\n');
  const EXPORT_PADDING = 24;
  const EXPORT_DEFAULT_WIDTH = 1000;
  const EXPORT_DEFAULT_HEIGHT = 700;

  let _userDataPath = null;
  let _persistenceFile = null;
  let _previewTimer = null;
  let _persistTimer = null;
  let _store = null;
  let _canvas = null;
  // v4.13.0 — selection state for multi-select + alignment. The canvas
  // still owns single-click visual selection; this Set tracks the set
  // the alignment / distribute buttons operate on. Empty by default;
  // populated by "Select All" or canvas shift+click (item 1 below).
  let _selectedNodeIds = new Set();
  // v4.11.0 — no more selection state. Every mutation is initiated from
  // a button in the #fc-nodelist panel; the canvas is purely visual.

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || '';
    if (msg) setTimeout(() => setStatus(''), 2500);
  }

  function runPreview() {
    if (!_store || !els.previewSource || !els.previewRender) return;
    const graph = _store.getGraph();
    const source = toMermaid(graph);
    els.previewSource.textContent = source;
    // v4.10.0 — the canvas on the left IS the rendered chart (hand-rolled
    // SVG, no Mermaid runtime needed in this window). The right pane
    // shows the Mermaid source for inspection only — seed a static info
    // card explaining the layout so users don't think the right pane is
    // broken / blank.
    if (els.previewRender.firstElementChild === null) {
      els.previewRender.innerHTML =
        '<div class="fc-preview-render-note">' +
        'Visual chart is rendered on the left canvas panel. ' +
        'Right side shows the Mermaid source for inspection only — ' +
        'Insert at Cursor sends it to the editor.' +
        '</div>';
    }
  }

  function debouncedPreview() {
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      _previewTimer = null;
      runPreview();
    }, PREVIEW_DEBOUNCE_MS);
  }

  function debouncedPersist() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      if (!_store || !_persistenceFile) return;
      api
        .writeFile(_persistenceFile, _store.serialize())
        .then(() => setStatus('Saved'))
        .catch((err) => setStatus(`Save failed: ${err && err.message ? err.message : err}`));
    }, PERSIST_DEBOUNCE_MS);
  }

  // ========== Inline modal dialog (replacement for window.prompt/confirm) ==========
  // v4.9.9 — window.prompt and window.confirm are disabled in Electron
  // renderer contexts (the BrowserWindow of a BrowserView/WebContentsView
  // returns undefined when called). Build minimal modal interactions on top
  // of plain DOM nodes. Resolves with the entered string (or null on
  // cancel/Esc/backdrop-click) for promptInline, and with a boolean for
  // confirmInline.
  function promptInline({ title, message, defaultValue = '', kind = 'text' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      });
      const box = document.createElement('div');
      Object.assign(box.style, {
        background: '#ffffff',
        color: '#1f2328',
        border: '1px solid #d0d7de',
        borderRadius: '8px',
        padding: '20px 24px',
        minWidth: '320px',
        maxWidth: '480px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        fontFamily: 'system-ui, sans-serif',
      });
      if (title) {
        const h = document.createElement('div');
        h.textContent = title;
        Object.assign(h.style, { fontSize: '14px', fontWeight: '600', marginBottom: '12px' });
        box.appendChild(h);
      }
      if (message) {
        const m = document.createElement('div');
        m.textContent = message;
        Object.assign(m.style, {
          fontSize: '12px',
          color: '#57606a',
          marginBottom: '12px',
          whiteSpace: 'pre-wrap',
        });
        box.appendChild(m);
      }
      const input = document.createElement('input');
      input.type = kind === 'number' ? 'number' : 'text';
      input.value = defaultValue;
      Object.assign(input.style, {
        width: '100%',
        padding: '8px 10px',
        fontSize: '13px',
        border: '1px solid #d0d7de',
        borderRadius: '4px',
        boxSizing: 'border-box',
      });
      box.appendChild(input);

      const buttons = document.createElement('div');
      Object.assign(buttons.style, {
        marginTop: '14px',
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end',
      });
      const ok = document.createElement('button');
      ok.textContent = 'OK';
      Object.assign(ok.style, {
        padding: '6px 14px',
        border: 'none',
        borderRadius: '4px',
        background: '#1f883d',
        color: '#ffffff',
        fontSize: '13px',
        cursor: 'pointer',
      });
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      Object.assign(cancel.style, {
        padding: '6px 14px',
        border: '1px solid #d0d7de',
        borderRadius: '4px',
        background: '#f6f8fa',
        color: '#1f2328',
        fontSize: '13px',
        cursor: 'pointer',
      });
      buttons.appendChild(cancel);
      buttons.appendChild(ok);
      box.appendChild(buttons);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      let resolved = false;
      const cleanup = (val) => {
        if (resolved) return;
        resolved = true;
        document.body.removeChild(overlay);
        resolve(val);
      };
      ok.addEventListener('click', () => cleanup(input.value || null));
      cancel.addEventListener('click', () => cleanup(null));
      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) cleanup(null);
      });
      input.addEventListener('keydown', (kev) => {
        if (kev.key === 'Enter') cleanup(input.value || null);
        if (kev.key === 'Escape') cleanup(null);
      });
      setTimeout(() => input.focus(), 0);
    });
  }

  function confirmInline({ title, message, danger = false }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      });
      const box = document.createElement('div');
      Object.assign(box.style, {
        background: '#ffffff',
        color: '#1f2328',
        border: '1px solid #d0d7de',
        borderRadius: '8px',
        padding: '20px 24px',
        minWidth: '320px',
        maxWidth: '480px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        fontFamily: 'system-ui, sans-serif',
      });
      if (title) {
        const h = document.createElement('div');
        h.textContent = title;
        Object.assign(h.style, { fontSize: '14px', fontWeight: '600', marginBottom: '12px' });
        box.appendChild(h);
      }
      if (message) {
        const m = document.createElement('div');
        m.textContent = message;
        Object.assign(m.style, {
          fontSize: '13px',
          color: '#1f2328',
          marginBottom: '14px',
          whiteSpace: 'pre-wrap',
        });
        box.appendChild(m);
      }
      const buttons = document.createElement('div');
      Object.assign(buttons.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end' });
      const ok = document.createElement('button');
      ok.textContent = danger ? 'Delete' : 'OK';
      Object.assign(ok.style, {
        padding: '6px 14px',
        border: 'none',
        borderRadius: '4px',
        background: danger ? '#cf222e' : '#1f883d',
        color: '#ffffff',
        fontSize: '13px',
        cursor: 'pointer',
      });
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      Object.assign(cancel.style, {
        padding: '6px 14px',
        border: '1px solid #d0d7de',
        borderRadius: '4px',
        background: '#f6f8fa',
        color: '#1f2328',
        fontSize: '13px',
        cursor: 'pointer',
      });
      buttons.appendChild(cancel);
      buttons.appendChild(ok);
      box.appendChild(buttons);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      let resolved = false;
      const cleanup = (val) => {
        if (resolved) return;
        resolved = true;
        document.body.removeChild(overlay);
        resolve(val);
      };
      ok.addEventListener('click', () => cleanup(true));
      cancel.addEventListener('click', () => cleanup(false));
      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) cleanup(false);
      });
      document.addEventListener('keydown', function onKey(ev) {
        if (ev.key === 'Enter') {
          cleanup(true);
          document.removeEventListener('keydown', onKey);
        }
        if (ev.key === 'Escape') {
          cleanup(false);
          document.removeEventListener('keydown', onKey);
        }
      });
    });
  }

  // ========== Node-list panel (v4.11.0) ==========
  // Button-driven UI. The #fc-nodelist panel below the canvas hosts
  // every mutation: add/delete node, change kind, edit label,
  // add/delete edge, change edge kind, edit edge label. The canvas
  // itself is purely visual — no click hit-testing, no selection
  // state. The panel is re-rendered on every store mutation.

  const SHAPE_LABEL = {
    process: 'Process',
    decision: 'Decision',
    terminator: 'Terminator',
    subroutine: 'Subroutine',
    document: 'Document',
  };
  const EDGE_LABEL = {
    solid: 'Solid',
    dotted: 'Dotted',
    thick: 'Thick',
  };
  const SHAPE_KINDS_FOR_UI = Object.keys(SHAPE_LABEL);
  const EDGE_KINDS_FOR_UI = Object.keys(EDGE_LABEL);

  function shapeLabel(kind) {
    return SHAPE_LABEL[kind] || kind;
  }
  function edgeLabel(kind) {
    return EDGE_LABEL[kind] || kind;
  }

  function rerenderNodeList() {
    if (!_store) return;
    const graph = _store.getGraph();

    if (els.nodeCountEl) els.nodeCountEl.textContent = String(graph.nodes.length);
    if (els.edgeCountEl) els.edgeCountEl.textContent = String(graph.edges.length);

    // --- Nodes list ---
    if (els.nodelistUl) {
      els.nodelistUl.replaceChildren();
      for (const node of graph.nodes) {
        const li = document.createElement('li');

        const idSpan = document.createElement('span');
        idSpan.className = 'fc-node-id';
        idSpan.textContent = node.id.slice(0, 8);
        li.appendChild(idSpan);

        const kindSel = document.createElement('select');
        for (const k of SHAPE_KINDS_FOR_UI) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = shapeLabel(k);
          if (k === node.kind) opt.selected = true;
          kindSel.appendChild(opt);
        }
        kindSel.addEventListener('change', () => {
          if (_store) _store.setNodeKind(node.id, kindSel.value);
        });
        li.appendChild(kindSel);

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = node.label || '';
        labelInput.setAttribute('placeholder', 'Label');
        labelInput.addEventListener('input', () => {
          if (_store) _store.setNodeLabel(node.id, labelInput.value);
        });
        li.appendChild(labelInput);

        // v4.12.0 — per-node fill color. Native <input type="color"> opens a
        // platform color picker (presets + custom). We listen for `input`
        // (continuous as the user drags) so the canvas re-renders live.
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = node.color || '#ffffff';
        colorInput.title = 'Node fill color';
        colorInput.setAttribute('aria-label', 'Node fill color');
        colorInput.addEventListener('input', () => {
          if (_store) _store.setNodeColor(node.id, colorInput.value);
        });
        li.appendChild(colorInput);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '×';
        delBtn.className = 'fc-delete';
        delBtn.title = 'Delete this node';
        delBtn.addEventListener('click', () => {
          if (_store) _store.removeNode(node.id);
        });
        li.appendChild(delBtn);

        els.nodelistUl.appendChild(li);
      }
    }

    // --- Edges list ---
    if (els.edgelistUl) {
      els.edgelistUl.replaceChildren();
      for (const edge of graph.edges) {
        const li = document.createElement('li');

        const idSpan = document.createElement('span');
        idSpan.className = 'fc-node-id';
        const fromShort = edge.fromNodeId ? edge.fromNodeId.slice(0, 4) : '?';
        const toShort = edge.toNodeId ? edge.toNodeId.slice(0, 4) : '?';
        idSpan.textContent = `${fromShort}→${toShort}`;
        li.appendChild(idSpan);

        const kindSel = document.createElement('select');
        for (const k of EDGE_KINDS_FOR_UI) {
          const opt = document.createElement('option');
          opt.value = k;
          opt.textContent = edgeLabel(k);
          if (k === edge.kind) opt.selected = true;
          kindSel.appendChild(opt);
        }
        kindSel.addEventListener('change', () => {
          if (_store) _store.setEdgeKind(edge.id, kindSel.value);
        });
        li.appendChild(kindSel);

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = edge.label || '';
        labelInput.setAttribute('placeholder', 'Label');
        labelInput.addEventListener('input', () => {
          if (_store) _store.setEdgeLabel(edge.id, labelInput.value);
        });
        li.appendChild(labelInput);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '×';
        delBtn.className = 'fc-delete';
        delBtn.title = 'Delete this edge';
        delBtn.addEventListener('click', () => {
          if (_store) _store.disconnect(edge.id);
        });
        li.appendChild(delBtn);

        els.edgelistUl.appendChild(li);
      }
    }

    // --- Connect dropdowns (from / to) ---
    if (els.connectFromSel && els.connectToSel) {
      const prevFrom = els.connectFromSel.value;
      const prevTo = els.connectToSel.value;
      els.connectFromSel.replaceChildren();
      els.connectToSel.replaceChildren();
      for (const n of graph.nodes) {
        const o1 = document.createElement('option');
        o1.value = n.id;
        o1.textContent = `${n.id.slice(0, 8)} (${shapeLabel(n.kind)})`;
        els.connectFromSel.appendChild(o1);

        const o2 = document.createElement('option');
        o2.value = n.id;
        o2.textContent = `${n.id.slice(0, 8)} (${shapeLabel(n.kind)})`;
        els.connectToSel.appendChild(o2);
      }
      // Restore previous selection if the node still exists.
      const stillExists = (id) => id && graph.nodes.some((n) => n.id === id);
      if (stillExists(prevFrom)) els.connectFromSel.value = prevFrom;
      if (stillExists(prevTo)) els.connectToSel.value = prevTo;
    }
  }

  // Wire add-node buttons (in the add-row).
  document.querySelectorAll('.fc-add-row .fc-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!_store) return;
      const kind = btn.getAttribute('data-add');
      if (!kind || !SHAPE_KINDS_FOR_UI.includes(kind)) return;
      // Place new node at the next free spot (simple grid layout).
      const graph = _store.getGraph();
      const idx = graph.nodes.length;
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      _store.addNode({
        kind,
        x: 50 + col * 180,
        y: 50 + row * 100,
        label: shapeLabel(kind),
      });
    });
  });

  // Wire connect-edge button.
  if (els.connectBtn) {
    els.connectBtn.addEventListener('click', () => {
      if (!_store || !els.connectFromSel || !els.connectToSel) return;
      const from = els.connectFromSel.value;
      const to = els.connectToSel.value;
      if (!from || !to) {
        setStatus('Add at least two nodes first');
        return;
      }
      if (from === to) {
        setStatus('Select two different nodes to connect');
        return;
      }
      try {
        _store.connect(from, to, 'solid');
      } catch (err) {
        setStatus(`Connect failed: ${err && err.message ? err.message : err}`);
      }
    });
  }
  if (els.connectCancelBtn) {
    els.connectCancelBtn.addEventListener('click', () => {
      // Just rebuild the dropdowns from the current graph.
      rerenderNodeList();
    });
  }

  async function bootstrap() {
    console.log('[flowchart] bootstrap: resolving userData path');
    // Resolve the userData path ONCE on mount. The persistence path is
    // interpolated into a string on every read/write; calling the async
    // api.getUserDataPath() directly would coerce the Promise to
    // "[object Promise]" and break the userData sandbox check in
    // main.js:write-text-file.
    try {
      _userDataPath = await api.getUserDataPath();
    } catch (err) {
      fatal(`Could not resolve userData path: ${err && err.message ? err.message : err}`);
      return;
    }
    _persistenceFile = `${_userDataPath}/${PERSISTENCE_FILENAME}`;
    console.log('[flowchart] bootstrap: persistence file =', _persistenceFile);

    _store = createStore({
      persistencePath: _persistenceFile,
      readFile: api.readFile,
      writeFile: api.writeFile,
      now: () => Date.now(),
    });
    console.log('[flowchart] bootstrap: store created');

    _canvas = createCanvas(els.canvasHost, _store, {
      // v4.11.0 — the canvas is purely visual. All mutations are driven
      // from the #fc-nodelist panel below the canvas (see the wiring
      // above). Canvas click handlers exist for drag-to-move but the
      // selection / shape-menu callbacks are no-ops now.
      onNodeClick: () => {},
      onEdgeClick: () => {},
      onShapeMenu: () => {},
    });
    // v4.13.0 — keep the bundle's _selectedNodeIds in sync with the
    // canvas selection. The canvas is the source of truth for shift+click
    // and drag-rect; the bundle tracks the set so the alignment /
    // distribute buttons have a target.
    if (typeof _canvas.setOnSelectionChange === 'function') {
      _canvas.setOnSelectionChange(function (sel) {
        _selectedNodeIds = new Set(sel.nodeIds || []);
      });
    }
    console.log('[flowchart] bootstrap: canvas rendered');

    _store.subscribe(() => {
      debouncedPreview();
      debouncedPersist();
      // Keep the node-list panel in sync with every mutation.
      rerenderNodeList();
      // v4.13.0 — keep the undo/redo buttons enabled-state in sync.
      updateHistoryUI();
    });

    // Hydrate from disk (defensively — corrupt JSON is caught by the store).
    try {
      const json = await api.readFile(_persistenceFile);
      if (json) _store.deserialize(json);
      console.log('[flowchart] bootstrap: persistence hydrated');
    } catch (err) {
      console.warn('[flowchart-controller] failed to read session:', err);
    }

    if (els.btnInsert) {
      els.btnInsert.addEventListener('click', () => {
        if (!_store) return;
        const source = toMermaid(_store.getGraph());
        const fenced = '```mermaid\n' + source + '\n```';
        if (api.insertAtCursor) api.insertAtCursor(fenced);
        setStatus('Inserted');
      });
    }

    // v4.12.0 — Save to File. Pops a system save dialog and writes the
    // Mermaid-fenced source to the user-chosen path via the generic
    // 'save-text-file' IPC channel. The main-process handler resolves with
    // `{ canceled: true }` if the user dismissed the dialog.
    if (els.btnSave) {
      els.btnSave.addEventListener('click', async () => {
        if (!_store || !api.saveFile) return;
        const source = toMermaid(_store.getGraph());
        const fenced = '```mermaid\n' + source + '\n```';
        try {
          const result = await api.saveFile(fenced, 'flowchart.mmd');
          if (result && result.canceled) {
            setStatus('Save cancelled');
          } else if (result && result.path) {
            setStatus(`Saved to ${result.path}`);
          } else {
            setStatus('Saved');
          }
        } catch (err) {
          setStatus(`Save failed: ${err && err.message ? err.message : err}`);
        }
      });
    }

    // v4.13.0 — Export the canvas as SVG / PNG / JPG. SVG is a direct
    // clone-and-serialise; PNG / JPG rasterise through Image + Canvas
    // to produce a data URL the main process can write as bytes.
    function getSvgStringForExport() {
      if (!_canvas) return '';
      const svg = _canvas.getSvg();
      if (!svg) return '';
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.textContent = EXPORT_CSS;
      clone.insertBefore(styleEl, clone.firstChild);
      return (
        '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
      );
    }

    function rasterizeSvg(svgString, mime, quality) {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const w = EXPORT_DEFAULT_WIDTH + EXPORT_PADDING * 2;
          const h = EXPORT_DEFAULT_HEIGHT + EXPORT_PADDING * 2;
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (mime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
          }
          ctx.drawImage(
            img,
            EXPORT_PADDING,
            EXPORT_PADDING,
            EXPORT_DEFAULT_WIDTH,
            EXPORT_DEFAULT_HEIGHT
          );
          try {
            resolve(canvas.toDataURL(mime, quality));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('failed to load SVG for rasterisation'));
        img.src = url;
      }).finally(() => URL.revokeObjectURL(url));
    }

    async function handleSvgExport() {
      if (!_canvas || !api.saveFile) return;
      try {
        const svgString = getSvgStringForExport();
        const result = await api.saveFile(svgString, 'flowchart.svg');
        if (!result || result.canceled) {
          setStatus('Export cancelled');
        } else if (result.path) {
          setStatus('Saved SVG to ' + result.path);
        } else {
          setStatus('Saved SVG');
        }
      } catch (err) {
        setStatus('SVG export failed: ' + (err && err.message ? err.message : err));
      }
    }

    async function handleRasterExport(mime, ext, label) {
      if (!_canvas || !api.saveBinary) return;
      try {
        const svgString = getSvgStringForExport();
        const dataUrl = await rasterizeSvg(
          svgString,
          mime,
          mime === 'image/jpeg' ? 0.92 : undefined
        );
        const result = await api.saveBinary(dataUrl, 'flowchart.' + ext, [
          { name: label, extensions: [ext] },
          { name: 'All Files', extensions: ['*'] },
        ]);
        if (!result || result.canceled) {
          setStatus('Export cancelled');
        } else if (result.path) {
          setStatus('Saved ' + label + ' to ' + result.path);
        } else if (result.error) {
          setStatus('Export failed: ' + result.error);
        } else {
          setStatus('Saved ' + label);
        }
      } catch (err) {
        setStatus(label + ' export failed: ' + (err && err.message ? err.message : err));
      }
    }

    if (els.btnExportSvg) els.btnExportSvg.addEventListener('click', handleSvgExport);
    if (els.btnExportPng) {
      els.btnExportPng.addEventListener('click', () =>
        handleRasterExport('image/png', 'png', 'PNG')
      );
    }
    if (els.btnExportJpg) {
      els.btnExportJpg.addEventListener('click', () =>
        handleRasterExport('image/jpeg', 'jpg', 'JPEG')
      );
    }

    // v4.13.0 — Export to editable Visio .vsdx. Sends the graph JSON to
    // the main process which generates the OOXML zip and writes it.
    if (els.btnExportVsdx) {
      els.btnExportVsdx.addEventListener('click', async () => {
        if (!_store || !api.exportVsdx) return;
        try {
          const graph = _store.getGraph();
          const result = await api.exportVsdx(graph);
          if (!result || result.canceled) {
            setStatus('Export cancelled');
          } else if (result.path) {
            setStatus('Saved Visio to ' + result.path);
          } else if (result.error) {
            setStatus('Export failed: ' + result.error);
          } else {
            setStatus('Saved Visio');
          }
        } catch (err) {
          setStatus('Visio export failed: ' + (err && err.message ? err.message : err));
        }
      });
    }

    // v4.13.0 — Alignment + distribution buttons. Each operates on the
    // current selection (_selectedNodeIds). If the selection is empty,
    // the buttons no-op with a status hint — otherwise they mutate the
    // graph via _store.moveNode() once per affected node. Each call
    // creates its own undo snapshot, which is fine for the typical
    // 2-10 node selection.
    function getSelectedNodes() {
      if (!_store) return [];
      const graph = _store.getGraph();
      return graph.nodes.filter((node) => _selectedNodeIds.has(node.id));
    }

    function applyAlignment(transform) {
      if (!_store) return;
      const targets = getSelectedNodes();
      if (targets.length < 2) {
        setStatus('Select 2+ nodes first (try Select All)');
        return;
      }
      const updates = transform(targets);
      for (const updated of updates) {
        _store.moveNode(updated.id, updated.x, updated.y);
      }
      setStatus('Aligned ' + updates.length + ' nodes');
    }

    const ALIGN = window.FlowchartAlign;
    if (els.btnAlignLeft && ALIGN) {
      els.btnAlignLeft.addEventListener('click', () => applyAlignment(ALIGN.alignLeft));
    }
    if (els.btnAlignRight && ALIGN) {
      els.btnAlignRight.addEventListener('click', () => applyAlignment(ALIGN.alignRight));
    }
    if (els.btnAlignTop && ALIGN) {
      els.btnAlignTop.addEventListener('click', () => applyAlignment(ALIGN.alignTop));
    }
    if (els.btnAlignBottom && ALIGN) {
      els.btnAlignBottom.addEventListener('click', () => applyAlignment(ALIGN.alignBottom));
    }
    if (els.btnAlignCenterH && ALIGN) {
      els.btnAlignCenterH.addEventListener('click', () =>
        applyAlignment(ALIGN.alignCenterHorizontal)
      );
    }
    if (els.btnAlignCenterV && ALIGN) {
      els.btnAlignCenterV.addEventListener('click', () =>
        applyAlignment(ALIGN.alignCenterVertical)
      );
    }
    if (els.btnDistributeH && ALIGN) {
      els.btnDistributeH.addEventListener('click', () =>
        applyAlignment(ALIGN.distributeHorizontally)
      );
    }
    if (els.btnDistributeV && ALIGN) {
      els.btnDistributeV.addEventListener('click', () =>
        applyAlignment(ALIGN.distributeVertically)
      );
    }
    if (els.btnSelectAll) {
      els.btnSelectAll.addEventListener('click', () => {
        if (!_store) return;
        const graph = _store.getGraph();
        _selectedNodeIds = new Set(graph.nodes.map((node) => node.id));
        if (_canvas && typeof _canvas.setMultiSelection === 'function') {
          _canvas.setMultiSelection(Array.from(_selectedNodeIds));
        }
        setStatus('Selected ' + _selectedNodeIds.size + ' nodes');
        rerenderNodeList();
      });
    }

    // v4.13.0 — Open from .mmd/.md file. Pops a system Open dialog,
    // strips the ```mermaid fence (if any), parses via fromMermaid()
    // (inlined above) and replaces the current graph. Confirms
    // overwrite before destroying unsaved work.
    if (els.btnOpen) {
      els.btnOpen.addEventListener('click', async () => {
        if (!_store || !api.openFile) return;
        let result;
        try {
          result = await api.openFile();
        } catch (err) {
          setStatus(`Open failed: ${err && err.message ? err.message : err}`);
          return;
        }
        if (!result) {
          setStatus('Open cancelled');
          return;
        }
        const graph = _store.getGraph();
        if (graph.nodes.length > 0 || graph.edges.length > 0) {
          const ok = await confirmInline({
            title: 'Open file',
            message: 'This will replace the current diagram. Continue?',
            danger: true,
          });
          if (!ok) return;
        }
        // Strip the ```mermaid fence if present
        let source = result.content || '';
        const fence = source.match(/```(?:mermaid)?\s*\n?([\s\S]*?)\n?```/);
        if (fence) source = fence[1];
        const parsed = fromMermaid(source);
        _store.deserialize(parsed);
        setStatus(`Loaded ${result.path}`);
      });
    }

    if (els.btnReset) {
      els.btnReset.addEventListener('click', async () => {
        if (!_store) return;
        const ok = await confirmInline({
          title: 'Reset diagram',
          message: 'Clear all nodes and edges? This cannot be undone.',
          danger: true,
        });
        if (!ok) return;
        _store.deserialize({ nodes: [], edges: [] });
        setStatus('Reset');
      });
    }

    // v4.13.0 — toolbar undo/redo buttons + history counter. Both wired
    // here so they share state with the existing keyboard shortcuts.
    if (els.btnUndo) {
      els.btnUndo.addEventListener('click', () => {
        if (!_store) return;
        _store.undo();
      });
    }
    if (els.btnRedo) {
      els.btnRedo.addEventListener('click', () => {
        if (!_store) return;
        _store.redo();
      });
    }
    function updateHistoryUI() {
      if (els.historyCount) {
        // The store exposes canUndo()/canRedo(); show the stack depth as
        // a vague "edit count" so the user has feedback that their work
        // is being captured.
        const u = _store.canUndo() ? 1 : 0;
        const r = _store.canRedo() ? 1 : 0;
        els.historyCount.textContent = `${u}↶ / ${r}↷`;
      }
      if (els.btnUndo) els.btnUndo.disabled = !_store.canUndo();
      if (els.btnRedo) els.btnRedo.disabled = !_store.canRedo();
    }

    // Keyboard shortcuts — Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z. v4.13.0 — added
    // copy/paste/duplicate (Cmd+C / Cmd+V / Cmd+D) plus Delete/Backspace
    // for the canvas-owned selection (replaces the old DOM .selected read).
    let _clipboard = null; // module-level clipboard for Cmd+C/V/D
    document.addEventListener('keydown', (ev) => {
      if (!_store) return;
      const meta = ev.ctrlKey || ev.metaKey;
      if (meta && !ev.shiftKey && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        _store.undo();
        return;
      }
      if (meta && ev.shiftKey && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        _store.redo();
        return;
      }
      if (meta && !ev.shiftKey && ev.key.toLowerCase() === 'c') {
        const sel = _canvas ? _canvas.getSelection() : { nodeId: null, edgeId: null };
        const payload = copySelection(_store.getGraph(), sel);
        if (payload) {
          _clipboard = payload;
          setStatus('Copied');
          ev.preventDefault();
        }
        return;
      }
      if (meta && !ev.shiftKey && ev.key.toLowerCase() === 'v') {
        if (!_clipboard) return;
        const created = pasteSelection(_clipboard, _store.getGraph(), _store);
        if (created.length > 0) {
          setStatus('Pasted');
          ev.preventDefault();
        }
        return;
      }
      if (meta && !ev.shiftKey && ev.key.toLowerCase() === 'd') {
        const sel = _canvas ? _canvas.getSelection() : { nodeId: null, edgeId: null };
        const payload = copySelection(_store.getGraph(), sel);
        if (payload) {
          const created = pasteSelection(payload, _store.getGraph(), _store);
          if (created.length > 0) {
            setStatus('Duplicated');
            ev.preventDefault();
          }
        }
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        const sel = _canvas ? _canvas.getSelection() : { nodeId: null, edgeId: null };
        if (sel.nodeId) {
          ev.preventDefault();
          _store.removeNode(sel.nodeId);
        } else if (sel.edgeId) {
          ev.preventDefault();
          _store.disconnect(sel.edgeId);
        }
      }
    });

    console.log('[flowchart] bootstrap: panel wired');
    rerenderNodeList();
    runPreview();
    setStatus('Ready');
    console.log('[flowchart] bootstrap: ready');
  }

  // Expose a minimal handle for tests (mirrors ascii-controller.js pattern).
  // v4.11.0 — selection state is gone. Tests interact with the panel
  // via the real DOM (`#fc-nodelist-ul`, `#fc-edgelist-ul`,
  // `#fc-connect-from`, etc.) and assert against `_store` directly.
  window.FlowchartController = {
    bootstrap,
    rerenderNodeList,
    get store() {
      return _store;
    },
    get canvas() {
      return _canvas;
    },
  };

  // Expose the inline modal helpers (v4.9.9) so jsdom tests can drive them
  // directly without rebuilding the bundle's IIFE. Production code accesses
  // these by closure; this handle exists purely for unit tests.
  window.FlowchartModals = { promptInline, confirmInline };

  // ========== flowchart-clipboard (inlined v4.13.0) ==========
  // Same source as src/flowchart/flowchart-clipboard.js (9 tests there).
  // Duplicated into the bundle so the standalone window doesn't need a
  // rebuild step. Logic stays in sync with the pure module.
  function copySelection(graph, selection) {
    if (!graph || !selection) return null;
    if (selection.nodeId) {
      const node = graph.nodes.find((n) => n.id === selection.nodeId);
      if (!node) return null;
      const connectedEdges = graph.edges.filter(
        (e) => e.fromNodeId === node.id || e.toNodeId === node.id
      );
      return { version: 1, kind: 'node-with-edges', node, edges: connectedEdges };
    }
    if (selection.edgeId) {
      const edge = graph.edges.find((e) => e.id === selection.edgeId);
      if (!edge) return null;
      return { version: 1, kind: 'edge', edge };
    }
    return null;
  }
  function pasteSelection(payload, graph, store, opts) {
    if (!payload) return [];
    const dx = (opts && opts.offsetX) || 24;
    const dy = (opts && opts.offsetY) || 24;
    if (payload.kind === 'node-with-edges' && payload.node) {
      const old = payload.node;
      const created = store.addNode({
        kind: old.kind,
        x: (old.x || 0) + dx,
        y: (old.y || 0) + dy,
        label: old.label,
        color: old.color,
      });
      const remap = new Map([[old.id, created.id]]);
      for (const e of payload.edges || []) {
        const from = remap.get(e.fromNodeId) || e.fromNodeId;
        const to = remap.get(e.toNodeId) || e.toNodeId;
        if (graph.nodes.find((n) => n.id === from) && graph.nodes.find((n) => n.id === to)) {
          store.connect(from, to, e.kind);
        }
      }
      return [{ id: created.id }];
    }
    if (payload.kind === 'edge' && payload.edge) {
      const e = payload.edge;
      if (
        graph.nodes.find((n) => n.id === e.fromNodeId) &&
        graph.nodes.find((n) => n.id === e.toNodeId)
      ) {
        store.connect(e.fromNodeId, e.toNodeId, e.kind);
      }
      return [];
    }
    return [];
  }
  window.FlowchartClipboard = { copySelection, pasteSelection };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
