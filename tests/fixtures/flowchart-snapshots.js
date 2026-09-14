'use strict';

/**
 * Fixture graphs for flowchart-mermaid snapshot tests.
 * Mermaid IDs are 1-3 chars; here we use semantic names that match the
 * store's auto-generated ids but normalized to A/B/C form for readability.
 */

function normalizeIds(graph) {
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
