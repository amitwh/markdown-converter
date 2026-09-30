/**
 * Pure parser: Mermaid `flowchart TD` source → graph.
 *
 * Inverse of flowchart-mermaid.js's toMermaid(). Recognises the 5
 * node shapes (process / decision / subroutine / terminator / document)
 * and the 3 edge kinds (solid / dotted / thick).
 *
 * Pure module — no DOM, no globals. Defensive: unrecognised lines are
 * skipped, not thrown on, so partial / hand-edited source still loads
 * whatever it can.
 *
 * Inverse of flowchart-mermaid.js toMermaid():
 *   id assignment: A..Z, AA..ZZ, ...
 *   escape:        #quot; → ", \\n → \n
 *
 * @module flowchart-mermaid-parse
 */

// Order matters: longest prefix first so `[[label]]` doesn't get
// matched as `process` `[label]` first.
const SHAPE_FROM_SYNTAX = [
  { prefix: '[[', suffix: ']]', kind: 'subroutine' }, // [[label]]
  { prefix: '([', suffix: '])', kind: 'terminator' }, // ([label])
  { prefix: '[/', suffix: '/]', kind: 'document' }, // [/label/]
  { prefix: '{', suffix: '}', kind: 'decision' }, // {label}
  { prefix: '[', suffix: ']', kind: 'process' }, // [label]
];

const EDGE_FROM_ARROW = {
  '-->': 'solid',
  '-.->': 'dotted',
  '==>': 'thick',
};

function unescapeLabel(label) {
  return String(label || '')
    .replace(/#quot;/g, '"')
    .replace(/\\n/g, '\n');
}

/**
 * Recognise a node declaration like `A[Step 1]`, `B{Valid?}`,
 * `C([Start])`, etc. The id is the leading run of identifier chars.
 *
 * Returns the matched id + label + kind, or null on no match.
 */
function parseNodeDeclaration(line) {
  const idBody = splitId(line);
  if (!idBody) return null;
  const brackets = idBody.body;
  for (const shape of SHAPE_FROM_SYNTAX) {
    if (brackets.startsWith(shape.prefix) && brackets.endsWith(shape.suffix)) {
      const label = brackets.slice(shape.prefix.length, brackets.length - shape.suffix.length);
      return { id: idBody.id, label: unescapeLabel(label), kind: shape.kind };
    }
  }
  return null;
}

/**
 * Split a line into id, body. The id is the leading run of [A-Za-z0-9_].
 * Everything after is the body.
 */
function splitId(line) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(line);
  if (!m) return null;
  return { id: m[1], body: m[2] };
}

/**
 * Parse a single Mermaid edge with optional label `|label|`.
 * Handles `-->`, `-.->`, `==>`.
 * Returns { fromId, toId, kind, label } or null.
 */
function parseEdgeLine(body) {
  // Find an edge arrow. The label, when present, is `|label|` between
  // the source id and the arrow OR between the arrow and the target id.
  // We accept both orderings for robustness.
  const labelRe = /\|([^|]*)\|/;

  // Find arrow first
  let arrow = null;
  let arrowIdx = -1;
  for (const candidate of Object.keys(EDGE_FROM_ARROW)) {
    const idx = body.indexOf(candidate);
    if (idx !== -1 && (arrowIdx === -1 || idx < arrowIdx)) {
      arrow = candidate;
      arrowIdx = idx;
    }
  }
  if (!arrow) return null;

  const before = body.slice(0, arrowIdx).trim();
  const after = body.slice(arrowIdx + arrow.length).trim();

  // Source id: strip the source id + optional label
  const beforeLabel = labelRe.exec(before);
  const beforeLabelStr = beforeLabel ? beforeLabel[0] : null;
  const sourceStr = beforeLabelStr ? before.replace(beforeLabelStr, '').trim() : before;

  const afterLabel = labelRe.exec(after);
  const afterLabelStr = afterLabel ? afterLabel[0] : null;
  const targetStr = afterLabelStr ? after.replace(afterLabelStr, '').trim() : after;

  if (!sourceStr || !targetStr) return null;

  // Find the label (prefer the one nearer to the arrow)
  let label = null;
  if (afterLabelStr) {
    label = unescapeLabel(afterLabel[1]);
  } else if (beforeLabelStr) {
    label = unescapeLabel(beforeLabel[1]);
  }

  return {
    fromNodeId: sourceStr,
    toNodeId: targetStr,
    kind: EDGE_FROM_ARROW[arrow],
    label: label || '',
  };
}

/**
 * Parse a full Mermaid source string into a graph object.
 *
 * @param {string} source
 * @returns {{nodes:Array, edges:Array}}
 */
function fromMermaid(source) {
  const nodes = [];
  const edges = [];
  const nodeByMermaidId = new Map(); // mermaid id → generated store id
  let layoutCounter = 0;

  if (typeof source !== 'string') {
    return { nodes, edges };
  }

  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('%%') /* mermaid comment */);

  for (const line of lines) {
    // Skip the header
    if (/^flowchart\s+(TD|LR|BT|RL)/i.test(line)) continue;

    // Edge line?
    const edge = parseEdgeLine(line);
    if (edge) {
      // Mermaid-side id → store-side id (assign on demand)
      const fromId = ensureNodeId(edge.fromNodeId, nodeByMermaidId, nodes, () =>
        makeAutoNode(nextLayoutPos(layoutCounter++))
      );
      const toId = ensureNodeId(edge.toNodeId, nodeByMermaidId, nodes, () =>
        makeAutoNode(nextLayoutPos(layoutCounter++))
      );
      edges.push({
        id: 'e_' + edges.length + '_' + Date.now().toString(36),
        fromNodeId: fromId,
        toNodeId: toId,
        kind: edge.kind,
        label: edge.label,
      });
      continue;
    }

    // Node declaration?
    const parsed = parseNodeDeclaration(line);
    if (parsed) {
      const storeId = 'n_' + parsed.id;
      nodeByMermaidId.set(parsed.id, storeId);
      if (!nodes.find((n) => n.id === storeId)) {
        nodes.push({
          id: storeId,
          kind: parsed.kind,
          x: 40 + (nodes.length % 5) * 160,
          y: 40 + Math.floor(nodes.length / 5) * 100,
          label: parsed.label,
        });
      }
    }
  }
  return { nodes, edges };
}

function ensureNodeId(mermaidId, map, nodes, createFn) {
  if (map.has(mermaidId)) return map.get(mermaidId);
  const node = createFn();
  nodes.push(node);
  map.set(mermaidId, node.id);
  return node.id;
}

function makeAutoNode(pos) {
  return {
    id: 'n_auto_' + Math.random().toString(36).slice(2, 8),
    kind: 'process',
    x: pos.x,
    y: pos.y,
    label: '',
  };
}

function nextLayoutPos(n) {
  return { x: 40 + (n % 5) * 160, y: 40 + Math.floor(n / 5) * 100 };
}

module.exports = { fromMermaid, parseEdgeLine, parseNodeDeclaration, EDGE_FROM_ARROW };
