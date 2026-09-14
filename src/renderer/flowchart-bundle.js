/**
 * v4.9.8 — Bundled single-file Flowchart Generator loader.
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

  // ========== flowchart-store (inlined) ==========
  const STORE_NODE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
  const STORE_EDGE_KINDS = ['solid', 'dotted', 'thick'];
  const STORE_UNDO_LIMIT = 50;

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

    function addNode({ kind, x, y, label = '' }) {
      if (!STORE_NODE_KINDS.includes(kind)) {
        throw new Error(`flowchart-store: unknown node kind "${kind}"`);
      }
      snapshot();
      const node = { id: storeNewId('n'), kind, x, y, label };
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
      return storeClone(graph);
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
        g.innerHTML = shapeSvg(node.kind, 0, 0, DEFAULT_WIDTH, DEFAULT_HEIGHT);
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
        g.classList.toggle('selected', id === selectedNodeId);
      });
      const edgeEls = edgesLayer.querySelectorAll('line[data-edge-id]');
      edgeEls.forEach((l) => {
        const id = l.getAttribute('data-edge-id');
        l.classList.toggle('selected', id === selectedEdgeId);
      });
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
        // Paint the .flowchart-node.selected highlight immediately on a bare
        // click (without a drag). store.subscribe would normally trigger
        // render() after moveNode; a click-only path has no store mutation, so
        // we apply the highlight ourselves. Surgical toggle — not a full
        // render() — so the pointerdown target stays attached and subsequent
        // pointermove/pointerup can still bubble on the same element.
        applySelectionHighlight();
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
        // Same reasoning as the node branch above: paint the edge highlight
        // immediately so a click-without-drag isn't invisible until the next
        // store mutation triggers a re-render.
        applySelectionHighlight();
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
            } catch {
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

  // ========== Globals — set BEFORE the controller boots ==========
  window.FlowchartCanvas = { createCanvas, SHAPE_KINDS };

  // ========== Controller bootstrap (inline) ==========
  const api =
    window.electronAPI && window.electronAPI.flowchart ? window.electronAPI.flowchart : null;

  const els = {
    canvasHost: document.getElementById('canvas-host'),
    previewSource: document.getElementById('preview-source'),
    previewRender: document.getElementById('preview-render'),
    btnInsert: document.getElementById('fc-btn-insert'),
    btnReset: document.getElementById('fc-btn-reset'),
    status: document.getElementById('fc-status'),
  };

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

  let _userDataPath = null;
  let _persistenceFile = null;
  let _previewTimer = null;
  let _persistTimer = null;
  let _store = null;
  let _canvas = null;

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || '';
    if (msg) setTimeout(() => setStatus(''), 2500);
  }

  function runPreview() {
    if (!_store || !els.previewSource || !els.previewRender) return;
    const graph = _store.getGraph();
    const source = toMermaid(graph);
    els.previewSource.textContent = source;
    // v4.9.6 — text preview only. The SVG canvas on the left is the
    // visual preview (hand-rolled, no Mermaid runtime needed in this
    // window's renderer). Mirrors the v4.9.5 fix that forced a light
    // surface to guarantee visibility.
    els.previewRender.textContent = '';
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

  async function bootstrap() {
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

    _store = createStore({
      persistencePath: _persistenceFile,
      readFile: api.readFile,
      writeFile: api.writeFile,
      now: () => Date.now(),
    });

    _canvas = createCanvas(els.canvasHost, _store, {
      onEdgeClick: (edgeId) => {
        const edge = _store.getGraph().edges.find((e) => e.id === edgeId);
        if (!edge) return;
        const nextKind = window.prompt('Edge kind (solid, dotted, thick):', edge.kind);
        if (nextKind && ['solid', 'dotted', 'thick'].includes(nextKind)) {
          _store.setEdgeKind(edgeId, nextKind);
        }
        const nextLabel = window.prompt('Edge label (empty to clear):', edge.label || '');
        if (nextLabel !== null) {
          _store.setEdgeLabel(edgeId, nextLabel);
        }
      },
      onNodeClick: () => {
        // Canvas already paints the .selected highlight; nothing else
        // needed here for selection state.
      },
      onShapeMenu: (nodeId) => {
        const next = window.prompt(
          'New shape (process, decision, terminator, subroutine, document):'
        );
        if (next) _store.setNodeKind(nodeId, next);
      },
    });

    _store.subscribe(() => {
      debouncedPreview();
      debouncedPersist();
    });

    // Hydrate from disk (defensively — corrupt JSON is caught by the store).
    try {
      const json = await api.readFile(_persistenceFile);
      if (json) _store.deserialize(json);
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

    if (els.btnReset) {
      els.btnReset.addEventListener('click', () => {
        if (!_store) return;
        if (!window.confirm('Clear all nodes and edges?')) return;
        _store.deserialize({ nodes: [], edges: [] });
        setStatus('Reset');
      });
    }

    // Keyboard shortcuts — Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Delete / Backspace.
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
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        // Delete applies to the canvas's currently-selected node/edge.
        // The canvas doesn't expose selection state directly; we read
        // it from the DOM .selected class.
        const selectedNode = els.canvasHost.querySelector('.flowchart-node.selected');
        if (selectedNode) {
          const id = selectedNode.getAttribute('data-node-id');
          if (id) {
            ev.preventDefault();
            _store.removeNode(id);
          }
          return;
        }
        const selectedEdge = els.canvasHost.querySelector('.flowchart-edge.selected');
        if (selectedEdge) {
          const id = selectedEdge.getAttribute('data-edge-id');
          if (id) {
            ev.preventDefault();
            _store.disconnect(id);
          }
        }
      }
    });

    runPreview();
    setStatus('Ready');
  }

  // Expose a minimal handle for tests (mirrors ascii-controller.js pattern).
  window.FlowchartController = {
    bootstrap,
    get store() {
      return _store;
    },
    get canvas() {
      return _canvas;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
