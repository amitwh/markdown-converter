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

'use strict';

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

// v4.9.6 UMD wrapper — same CommonJS export shape + browser global
// (window.FlowchartMermaid) so the standalone window's controller can load
// this module via <script> tag without nodeIntegration.
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  } else {
    root.FlowchartMermaid = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return { toMermaid, escapeLabel, nodeDeclaration, edgeDeclaration };
});
