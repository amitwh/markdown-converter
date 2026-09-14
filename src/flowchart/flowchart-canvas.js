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

'use strict';

// v4.9.6 — CommonJS sibling import when running under Node (the renderer.js
// sidebar panel still uses require()), browser global fallback when loaded as
// a <script> tag in the standalone window (no nodeIntegration).
const shapesModule =
  (typeof window !== 'undefined' && window.FlowchartShapes) || require('./flowchart-shapes');
const { DEFAULT_WIDTH, DEFAULT_HEIGHT, shapeSvg, SHAPE_KINDS } = shapesModule;

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

// v4.9.6 UMD wrapper — same CommonJS export shape + browser global
// (window.FlowchartCanvas) so the standalone window's controller can load
// this module via <script> tag without nodeIntegration.
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  } else {
    root.FlowchartCanvas = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return { createCanvas, SHAPE_KINDS };
});
