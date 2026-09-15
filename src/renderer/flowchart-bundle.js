/**
 * v4.11.0 — Bundled single-file Flowchart Generator loader.
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
        // Same reasoning as the node branch above: paint the edge highlight
        // immediately so a click-without-drag isn't invisible until the next
        // store mutation triggers a re-render.
        applySelectionHighlight();
        console.log('[flowchart] pointerdown on edge', selectedEdgeId);
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
        console.log('[flowchart] pointerdown on empty canvas — adding process node at', x, y);
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

  let _userDataPath = null;
  let _persistenceFile = null;
  let _previewTimer = null;
  let _persistTimer = null;
  let _store = null;
  let _canvas = null;
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
    console.log('[flowchart] bootstrap: canvas rendered');

    _store.subscribe(() => {
      debouncedPreview();
      debouncedPersist();
      // Keep the node-list panel in sync with every mutation.
      rerenderNodeList();
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

    // Keyboard shortcuts — Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z. Delete / Backspace
    // are intentionally NOT wired (v4.11.0 — there is no canvas selection
    // state anymore; use the × buttons in the node-list panel instead).
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
