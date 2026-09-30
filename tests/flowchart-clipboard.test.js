/**
 * @jest-environment node
 *
 * Flowchart clipboard — copy/paste pure functions.
 */

const {
  copySelection,
  pasteSelection,
  CLIPBOARD_VERSION,
} = require('../src/flowchart/flowchart-clipboard');

function makeStore() {
  const state = { nodes: [], edges: [] };
  return {
    state,
    addNode: ({ kind, x, y, label, color }) => {
      const node = { id: 'n_' + state.nodes.length, kind, x, y, label, color };
      state.nodes.push(node);
      return node;
    },
    connect: (fromNodeId, toNodeId, kind) => {
      const edge = {
        id: 'e_' + state.edges.length,
        fromNodeId,
        toNodeId,
        kind,
      };
      state.edges.push(edge);
      return edge;
    },
    getGraph: () => state,
  };
}

describe('copySelection', () => {
  test('returns null when no selection', () => {
    expect(copySelection({ nodes: [], edges: [] }, {})).toBeNull();
  });

  test('returns null when selection.nodeId not in graph', () => {
    expect(copySelection({ nodes: [], edges: [] }, { nodeId: 'missing' })).toBeNull();
  });

  test('captures a node plus its connected edges', () => {
    const graph = {
      nodes: [
        { id: 'a', kind: 'process', x: 0, y: 0, label: 'A' },
        { id: 'b', kind: 'process', x: 100, y: 0, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'b', kind: 'solid' }],
    };
    const out = copySelection(graph, { nodeId: 'a' });
    expect(out.kind).toBe('node-with-edges');
    expect(out.node).toEqual(graph.nodes[0]);
    expect(out.edges).toHaveLength(1);
    expect(out.version).toBe(CLIPBOARD_VERSION);
  });

  test('captures only a single edge when selection is edge', () => {
    const graph = {
      nodes: [
        { id: 'a', kind: 'process', x: 0, y: 0, label: 'A' },
        { id: 'b', kind: 'process', x: 100, y: 0, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'b', kind: 'solid' }],
    };
    const out = copySelection(graph, { edgeId: 'e1' });
    expect(out.kind).toBe('edge');
    expect(out.edge.id).toBe('e1');
  });
});

describe('pasteSelection', () => {
  test('creates a new node offset from the original', () => {
    const graph = {
      nodes: [{ id: 'a', kind: 'process', x: 0, y: 0, label: 'A' }],
      edges: [],
    };
    const store = makeStore();
    store.state.nodes = graph.nodes;
    const payload = copySelection(graph, { nodeId: 'a' });
    const created = pasteSelection(payload, graph, store);
    expect(created).toHaveLength(1);
    expect(store.state.nodes).toHaveLength(2);
    // The new node should be offset from the original.
    const newNode = store.state.nodes[1];
    expect(newNode.x).toBeGreaterThan(0);
    expect(newNode.y).toBeGreaterThan(0);
  });

  test('re-attaches edges to the new node', () => {
    const graph = {
      nodes: [
        { id: 'a', kind: 'process', x: 0, y: 0, label: 'A' },
        { id: 'b', kind: 'process', x: 100, y: 0, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'b', kind: 'solid' }],
    };
    const store = makeStore();
    store.state.nodes = graph.nodes;
    store.state.edges = [...graph.edges];
    const payload = copySelection(graph, { nodeId: 'a' });
    pasteSelection(payload, graph, store);
    // After paste: 3 nodes (a, b, a'), 2 edges (original a→b + new a'→b).
    // The original edge stays put; the new one connects a' → b because b
    // is the only neighbour that wasn't in the selection.
    expect(store.state.nodes).toHaveLength(3);
    expect(store.state.edges).toHaveLength(2);
    const newEdges = store.state.edges.filter(
      (e) => e.fromNodeId === 'n_2' || e.toNodeId === 'n_2'
    );
    expect(newEdges).toHaveLength(1);
    expect(newEdges[0].toNodeId).toBe('b');
  });

  test('pasting an edge only adds the edge if both endpoints exist', () => {
    const graph = {
      nodes: [
        { id: 'a', kind: 'process', x: 0, y: 0, label: 'A' },
        { id: 'b', kind: 'process', x: 100, y: 0, label: 'B' },
      ],
      edges: [],
    };
    const store = makeStore();
    store.state.nodes = graph.nodes;
    const payload = copySelection(
      { ...graph, edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'b', kind: 'solid' }] },
      { edgeId: 'e1' }
    );
    pasteSelection(payload, graph, store);
    expect(store.state.edges).toHaveLength(1);
  });

  test('null payload is a no-op', () => {
    const store = makeStore();
    expect(pasteSelection(null, { nodes: [], edges: [] }, store)).toEqual([]);
  });

  test('preserves node color on paste', () => {
    const graph = {
      nodes: [{ id: 'a', kind: 'process', x: 0, y: 0, label: 'A', color: '#ff0000' }],
      edges: [],
    };
    const store = makeStore();
    store.state.nodes = graph.nodes;
    const payload = copySelection(graph, { nodeId: 'a' });
    pasteSelection(payload, graph, store);
    const newNode = store.state.nodes[1];
    expect(newNode.color).toBe('#ff0000');
  });
});
