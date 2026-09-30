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
const viewportModule =
  (typeof window !== 'undefined' && window.FlowchartViewport) || require('./flowchart-viewport');
const { DEFAULT_WIDTH, DEFAULT_HEIGHT, shapeSvg, SHAPE_KINDS } = shapesModule;
const {
  zoomAt: vpZoomAt,
  panBy: vpPanBy,
  wheelFactor: vpWheelFactor,
  snap: vpSnap,
} = viewportModule;

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

function nodeWidth(node) {
  return Number(node.width) || DEFAULT_WIDTH;
}

function nodeCenter(node) {
  return { x: node.x + nodeWidth(node) / 2, y: node.y + DEFAULT_HEIGHT / 2 };
}

/**
 * Compute the point on a node's bounding-rectangle boundary in the direction
 * (dx, dy). v4.13.0 — replaces the centre-to-centre lines that visually cut
 * through nodes. All five supported shapes use the same bounding-rect
 * approximation; for the diamond (decision) and parallelogram (document)
 * this means the line lands a few pixels inside the visible shape, which
 * is a fine visual trade for the simplicity.
 */
function boundaryPoint(node, dx, dy) {
  const w = nodeWidth(node);
  const cx = node.x + w / 2;
  const cy = node.y + DEFAULT_HEIGHT / 2;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const scaleX = absDx > 0 ? w / 2 / absDx : Infinity;
  const scaleY = absDy > 0 ? DEFAULT_HEIGHT / 2 / absDy : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Compute edge endpoint coordinates so the line starts on the source
 * shape's boundary and ends on the target's boundary, both pointing
 * toward the other node.
 */
function edgeEndpoints(fromNode, toNode) {
  const fc = nodeCenter(fromNode);
  const tc = nodeCenter(toNode);
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  return {
    from: boundaryPoint(fromNode, dx, dy),
    to: boundaryPoint(toNode, -dx, -dy),
  };
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

  // v4.13.0 — viewport wrapper. Edges/nodes live inside a single <g> whose
  // transform reflects the current zoom + pan. SVG mouse coordinates are
  // already in viewBox space (1000×700) so this stays in viewport units.
  const view = viewportModule.reset();
  const content = svgEl('g', {
    class: 'flowchart-content',
    transform: `translate(${view.tx},${view.ty}) scale(${view.scale})`,
  });
  svg.appendChild(content);

  // Layer order: edges first (under nodes), then nodes.
  const edgesLayer = svgEl('g', { class: 'flowchart-edges' });
  const nodesLayer = svgEl('g', { class: 'flowchart-nodes' });
  content.appendChild(edgesLayer);
  content.appendChild(nodesLayer);

  // v4.13.0 — snap-to-grid toggle. Off by default; controller can flip via
  // setSnapEnabled(). When enabled, moveNode + addNode clamp coords to a
  // 10-unit grid.
  let snapEnabled = false;
  const GRID_SIZE = 10;
  function setSnapEnabled(enabled) {
    snapEnabled = !!enabled;
  }

  let selectedNodeId = null;
  let selectedEdgeId = null;
  let unsubscribe = null;
  let destroyed = false;
  let panState = null; // v4.13.0 — drag-to-pan state on empty canvas

  // v4.13.0 — selection lives on the canvas, not in the DOM. The controller
  // asks via getSelection() rather than reading .selected class names.
  function setSelection({ nodeId = null, edgeId = null } = {}) {
    if (selectedNodeId !== nodeId || selectedEdgeId !== edgeId) {
      selectedNodeId = nodeId;
      selectedEdgeId = edgeId;
      applySelectionHighlight();
    }
  }
  function getSelection() {
    return { nodeId: selectedNodeId, edgeId: selectedEdgeId };
  }

  // v4.13.0 — apply the current viewport to the content <g>'s transform.
  function applyView() {
    content.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.scale})`);
  }

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
      const { from: fp, to: tp } = edgeEndpoints(from, to);
      const line = svgEl('line', {
        x1: fp.x,
        y1: fp.y,
        x2: tp.x,
        y2: tp.y,
        stroke: 'currentColor',
        'data-edge-id': edge.id,
        ...edgeStyle(edge.kind),
        class: 'flowchart-edge' + (edge.id === selectedEdgeId ? ' selected' : ''),
      });
      edgesLayer.appendChild(line);
      if (edge.label) {
        // v4.13.0 — auto-size the label background based on the text
        // length (no more fixed 40×16 box that overflows long labels).
        const labelText = edge.label;
        const labelWidth = Math.max(20, labelText.length * 6.5 + 8);
        const labelHeight = 16;
        const mx = (fp.x + tp.x) / 2;
        const my = (fp.y + tp.y) / 2;
        const bg = svgEl('rect', {
          x: mx - labelWidth / 2,
          y: my - labelHeight / 2,
          width: labelWidth,
          height: labelHeight,
          rx: 3,
          ry: 3,
          fill: '#ffffff',
          stroke: 'currentColor',
          'stroke-opacity': '0.2',
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
        t.textContent = labelText;
        edgesLayer.appendChild(t);
      }
    }

    for (const node of graph.nodes) {
      const w = nodeWidth(node);
      const g = svgEl('g', {
        'data-node-id': node.id,
        transform: `translate(${node.x},${node.y})`,
        class: 'flowchart-node' + (node.id === selectedNodeId ? ' selected' : ''),
        tabindex: '0',
        'aria-label': `${node.kind}: ${node.label || '(no label)'}`,
      });
      g.innerHTML = shapeSvg(node.kind, 0, 0, w, DEFAULT_HEIGHT);
      const text = svgEl('text', {
        x: w / 2,
        y: DEFAULT_HEIGHT / 2 + 4,
        'text-anchor': 'middle',
        'font-size': 13,
        fill: 'currentColor',
        'pointer-events': 'none',
      });
      text.textContent = node.label || ' ';
      g.appendChild(text);

      // v4.13.0 — bottom-right resize handle on the selected node. A
      // single square handle is enough for v1; multi-handle (4 corners
      // + 4 edges) is a follow-up. Width is the only mutable dimension.
      // Two rects: a larger transparent hit area (24px) so the handle is
      // easier to grab, plus a smaller visible grip (10px) styled via CSS.
      if (node.id === selectedNodeId) {
        const gripSize = 10;
        const hitSize = 24;
        const hit = svgEl('rect', {
          x: w - hitSize / 2,
          y: DEFAULT_HEIGHT - hitSize / 2,
          width: hitSize,
          height: hitSize,
          class: 'flowchart-resize-handle flowchart-resize-handle-hit',
          'data-resize-node': node.id,
        });
        const grip = svgEl('rect', {
          x: w - gripSize / 2,
          y: DEFAULT_HEIGHT - gripSize / 2,
          width: gripSize,
          height: gripSize,
          rx: 2,
          class: 'flowchart-resize-handle flowchart-resize-handle-grip',
        });
        g.appendChild(hit);
        g.appendChild(grip);
      }

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
    // v4.13.0 — resize handle on the selected node. Detected before the
    // generic node drag so the bottom-right square doesn't accidentally
    // start a move on the node.
    const handleEl = ev.target.closest('[data-resize-node]');
    if (handleEl) {
      const nodeId = handleEl.getAttribute('data-resize-node');
      const node = store.getGraph().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setSelection({ nodeId });
      const startW = nodeWidth(node);
      const startX = ev.clientX;
      dragState = {
        mode: 'resize',
        nodeId,
        startW,
        startClientX: startX,
      };
      ev.preventDefault();
      return;
    }

    const nodeG = ev.target.closest('g[data-node-id]');
    if (nodeG) {
      const nodeId = nodeG.getAttribute('data-node-id');
      const node = store.getGraph().nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setSelection({ nodeId });
      const start = getSvgPoint(ev.clientX, ev.clientY);
      if (ev.altKey) {
        // Alt+drag = create a new edge from this node to wherever the pointer
        // is released. Show a preview line while dragging (v4.13.0 — was
        // "visual feedback deferred to v2"). Movement does not move nodes.
        dragState = { mode: 'connect', sourceNodeId: nodeId };
        previewLine = svgEl('line', {
          x1: boundaryPoint(node, 0, 0).x, // unused; updated in pointermove
          y1: 0,
          x2: start.x,
          y2: start.y,
          stroke: 'currentColor',
          'stroke-dasharray': '4,4',
          'stroke-width': 1,
          'pointer-events': 'none',
          class: 'flowchart-connect-preview',
        });
        edgesLayer.appendChild(previewLine);
        updatePreviewLine(node, start);
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
      setSelection({ edgeId: edgeLine.getAttribute('data-edge-id') });
      if (typeof opts.onEdgeClick === 'function') {
        opts.onEdgeClick(selectedEdgeId, ev);
      }
      ev.preventDefault();
      return;
    }
    // Click on empty canvas: middle-mouse OR Space-held = pan; otherwise
    // prompt for a new node. v4.13.0 — empty-canvas drag-pan replaces the
    // old auto-add-process behaviour.
    if (ev.target === svg || ev.target === nodesLayer || ev.target === edgesLayer) {
      const isPan = ev.button === 1 || ev.shiftKey; // middle OR shift-drag
      if (isPan) {
        const p = getSvgPoint(ev.clientX, ev.clientY);
        panState = { startX: p.x, startY: p.y, viewTx: view.tx, viewTy: view.ty };
        setSelection({});
        ev.preventDefault();
        return;
      }
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const x = Math.max(0, p.x - DEFAULT_WIDTH / 2);
      const y = Math.max(0, p.y - DEFAULT_HEIGHT / 2);
      const finalX = snapEnabled ? vpSnap(x, GRID_SIZE) : x;
      const finalY = snapEnabled ? vpSnap(y, GRID_SIZE) : y;
      if (typeof opts.onEmptyClick === 'function') {
        opts.onEmptyClick(finalX, finalY, ev);
      }
      ev.preventDefault();
    }
  }

  // v4.13.0 — connect-mode preview line. Re-anchored each move to the source
  // node's boundary in the direction of the pointer.
  let previewLine = null;
  function updatePreviewLine(sourceNode, pointerSvg) {
    if (!previewLine) return;
    const fp = boundaryPoint(
      sourceNode,
      pointerSvg.x - sourceNode.x - DEFAULT_WIDTH / 2,
      pointerSvg.y - sourceNode.y - DEFAULT_HEIGHT / 2
    );
    previewLine.setAttribute('x1', fp.x);
    previewLine.setAttribute('y1', fp.y);
    previewLine.setAttribute('x2', pointerSvg.x);
    previewLine.setAttribute('y2', pointerSvg.y);
  }
  function removePreviewLine() {
    if (previewLine && previewLine.parentNode) {
      previewLine.parentNode.removeChild(previewLine);
    }
    previewLine = null;
  }

  function onPointerMove(ev) {
    if (panState) {
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const dx = p.x - panState.startX;
      const dy = p.y - panState.startY;
      const next = vpPanBy(view, dx, dy);
      view.tx = next.tx - panState.viewTx + view.tx; // accumulate deltas
      view.ty = next.ty - panState.viewTy + view.ty;
      // Reset view.tx/ty based on absolute computation from panState
      view.tx = panState.viewTx + dx;
      view.ty = panState.viewTy + dy;
      applyView();
      return;
    }
    if (!dragState) return;
    if (dragState.mode === 'resize') {
      // Width delta in screen units, then convert to SVG via the
      // viewport-aware viewBox-to-screen ratio.
      const dxScreen = ev.clientX - dragState.startClientX;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width / rect.width;
      const newW = Math.max(60, Math.min(600, dragState.startW + dxScreen * scaleX));
      store.setNodeWidth(dragState.nodeId, newW);
      return;
    }
    if (dragState.mode === 'move') {
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const dx = p.x - dragState.pointerX;
      const dy = p.y - dragState.pointerY;
      let nx = dragState.startX + dx;
      let ny = dragState.startY + dy;
      if (snapEnabled) {
        nx = vpSnap(nx, GRID_SIZE);
        ny = vpSnap(ny, GRID_SIZE);
      }
      store.moveNode(dragState.nodeId, nx, ny);
    } else if (dragState.mode === 'connect' && previewLine) {
      const p = getSvgPoint(ev.clientX, ev.clientY);
      const sourceNode = store.getGraph().nodes.find((n) => n.id === dragState.sourceNodeId);
      if (sourceNode) updatePreviewLine(sourceNode, p);
    }
  }

  // v4.13.0 — Ctrl+wheel zooms around the cursor position.
  function onWheel(ev) {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    const p = getSvgPoint(ev.clientX, ev.clientY);
    const factor = vpWheelFactor(ev.deltaY);
    const next = vpZoomAt(view, p.x, p.y, factor);
    view.tx = next.tx;
    view.ty = next.ty;
    view.scale = next.scale;
    applyView();
  }

  function onPointerUp(ev) {
    if (panState) {
      panState = null;
      return;
    }
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
    removePreviewLine();
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
  svg.addEventListener('wheel', onWheel, { passive: false });

  unsubscribe = store.subscribe(render);
  render();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (typeof unsubscribe === 'function') unsubscribe();
    removePreviewLine();
    svg.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    svg.removeEventListener('dblclick', onDblClick);
    svg.removeEventListener('contextmenu', onContextMenu);
    svg.removeEventListener('wheel', onWheel);
    svg.remove();
  }

  return { destroy, getSvg: () => svg, getSelection, setSnapEnabled };
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
  // v4.9.7 — also expose as window global when running in Electron renderer
  // (nodeIntegration:true makes `module` truthy so the else branch above never
  // runs; the controller still expects window.FlowchartCanvas).
  if (typeof window !== 'undefined') {
    window.FlowchartCanvas = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return { createCanvas, SHAPE_KINDS };
});
