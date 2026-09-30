/**
 * Pure graph store for the flow chart editor.
 *
 * Graph = { nodes: Node[], edges: Edge[] }
 *   Node: { id, kind, x, y, label, color? }   (color: CSS hex string, defaults to #ffffff)
 *   Edge: { id, fromNodeId, toNodeId, kind: 'solid'|'dotted'|'thick', label? }
 *
 * v4.12.0 — Nodes carry an optional `color` field (CSS hex string).
 *   `setNodeColor(id, color)` mutates it; `serialize`/`deserialize` round-trip it.
 *
 * IO is injected for unit tests + persistence:
 *   { persistencePath, readFile, writeFile, now }
 *
 * @module flowchart-store
 */

const NODE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
const EDGE_KINDS = ['solid', 'dotted', 'thick'];
const UNDO_LIMIT = 50;
const DEFAULT_NODE_COLOR = '#ffffff';

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

/**
 * Normalise a node's `color` field. Accepts a CSS hex string (with or without
 * the leading `#`), rejects anything else by falling back to the default.
 * Returns `undefined` when the input is falsy so callers can use the spread
 * operator (`{ ...node, ...normalizeColor(node.color) }`) without overwriting
 * existing fields with `undefined`.
 */
function normalizeColor(color) {
  if (typeof color !== 'string' || color.length === 0) return { color: DEFAULT_NODE_COLOR };
  const trimmed = color.trim();
  // Hex: #rgb / #rrggbb (case-insensitive). Anything else falls back to default.
  const hex = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed);
  if (!hex) return { color: DEFAULT_NODE_COLOR };
  return { color: trimmed.startsWith('#') ? trimmed : `#${trimmed}` };
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
      } catch {
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

  function addNode({ kind, x, y, label = '', color }) {
    if (!NODE_KINDS.includes(kind)) {
      throw new Error(`flowchart-store: unknown node kind "${kind}"`);
    }
    snapshot();
    const node = {
      id: newId('n'),
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
    if (!NODE_KINDS.includes(kind)) {
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

  /**
   * Resize a node by adjusting its width (v4.13.0). Height is derived from
   * the shape, so width is the only mutable dimension. Min 60 / max 600.
   */
  function setNodeWidth(id, width) {
    const idx = findNodeIndex(id);
    if (idx === -1) throw new Error(`flowchart-store: unknown node id "${id}"`);
    const w = Math.max(60, Math.min(600, Number(width) || 60));
    snapshot();
    graph.nodes[idx] = { ...graph.nodes[idx], width: w };
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
    } catch {
      graph = { nodes: [], edges: [] };
      return;
    }
    const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes.filter(isValidNode) : [];
    // v4.12.0 — normalise the optional `color` field on every node so the
    // rehydrated graph has a guaranteed valid color (#ffffff by default).
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
    return clone(graph);
  }

  return {
    getGraph,
    addNode,
    moveNode,
    setNodeLabel,
    setNodeKind,
    setNodeColor,
    setNodeWidth,
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

// v4.9.6 UMD wrapper — same CommonJS export shape + browser global
// (window.FlowchartStore) so the standalone window's controller can load
// this module via <script> tag without nodeIntegration.
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  } else {
    root.FlowchartStore = exported;
  }
  // v4.9.7 — also expose as window global when running in Electron renderer
  // (nodeIntegration:true makes `module` truthy so the else branch above never
  // runs; the controller still expects window.FlowchartStore).
  if (typeof window !== 'undefined') {
    window.FlowchartStore = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return { create, NODE_KINDS, EDGE_KINDS };
});
