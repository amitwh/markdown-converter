/**
 * Pure clipboard serialiser for the flowchart editor (v4.13.0).
 *
 * Serialises the selected node + its edges to a JSON envelope that
 * survives a paste-into-new-graph round trip. Uses a fresh id-mangling
 * pass on paste so duplicates don't collide with the originals.
 *
 * Pure module — no DOM, no globals.
 *
 * @module flowchart-clipboard
 */

const CLIPBOARD_VERSION = 1;

/**
 * @param {object} graph  current graph from store
 * @param {{nodeId?:string, edgeId?:string}} selection  canvas selection
 * @returns {object|null}  clipboard payload or null when nothing useful
 *   is selected
 */
function copySelection(graph, selection) {
  if (!graph || !selection) return null;
  if (selection.nodeId) {
    const node = graph.nodes.find((n) => n.id === selection.nodeId);
    if (!node) return null;
    const connectedEdges = graph.edges.filter(
      (e) => e.fromNodeId === node.id || e.toNodeId === node.id
    );
    return {
      version: CLIPBOARD_VERSION,
      kind: 'node-with-edges',
      node,
      edges: connectedEdges,
    };
  }
  if (selection.edgeId) {
    const edge = graph.edges.find((e) => e.id === selection.edgeId);
    if (!edge) return null;
    return { version: CLIPBOARD_VERSION, kind: 'edge', edge };
  }
  return null;
}

/**
 * Apply a clipboard payload to a graph + selection. Returns the new
 * node(s) created so the controller can move the selection.
 *
 * @param {object} payload from copySelection()
 * @param {object} graph current graph
 * @param {object} store store with addNode / connect APIs
 * @param {{offsetX?:number, offsetY?:number}} [opts]
 * @returns {Array<{id:string}>} ids of newly created nodes (empty for edge-only paste)
 */
function pasteSelection(payload, graph, store, opts = {}) {
  if (!payload) return [];
  const dx = opts.offsetX || 24;
  const dy = opts.offsetY || 24;

  if (payload.kind === 'node-with-edges' && payload.node) {
    const oldNode = payload.node;
    const newNode = store.addNode({
      kind: oldNode.kind,
      x: (oldNode.x || 0) + dx,
      y: (oldNode.y || 0) + dy,
      label: oldNode.label,
      color: oldNode.color,
    });
    // Re-attach edges: each connected edge maps its endpoint to either
    // the new node (when it was the original) or to the existing neighbour.
    const idRemap = new Map([[oldNode.id, newNode.id]]);
    const edges = payload.edges || [];
    for (const e of edges) {
      const from = idRemap.get(e.fromNodeId) || e.fromNodeId;
      const to = idRemap.get(e.toNodeId) || e.toNodeId;
      // Both endpoints must still exist in the current graph
      if (graph.nodes.find((n) => n.id === from) && graph.nodes.find((n) => n.id === to)) {
        store.connect(from, to, e.kind);
      }
    }
    return [{ id: newNode.id }];
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

module.exports = { copySelection, pasteSelection, CLIPBOARD_VERSION };
