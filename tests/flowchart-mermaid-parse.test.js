/**
 * @jest-environment node
 *
 * Mermaid → graph parser.
 */

const {
  fromMermaid,
  parseEdgeLine,
  parseNodeDeclaration,
  EDGE_FROM_ARROW,
} = require('../src/flowchart/flowchart-mermaid-parse');

describe('parseEdgeLine', () => {
  test('parses a solid edge with no label', () => {
    const out = parseEdgeLine('A --> B');
    expect(out).toEqual({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid', label: '' });
  });

  test('parses a dotted edge', () => {
    expect(parseEdgeLine('A -.-> B').kind).toBe('dotted');
  });

  test('parses a thick edge', () => {
    expect(parseEdgeLine('A ==> B').kind).toBe('thick');
  });

  test('parses edge with label after arrow', () => {
    const out = parseEdgeLine('A -->|yes| B');
    expect(out).toMatchObject({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid', label: 'yes' });
  });

  test('parses edge with label before arrow', () => {
    const out = parseEdgeLine('A |label|--> B');
    expect(out).toMatchObject({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid', label: 'label' });
  });

  test('returns null for non-edge content', () => {
    expect(parseEdgeLine('A[hello]')).toBeNull();
  });

  test('EDGE_FROM_ARROW is solid / dotted / thick', () => {
    expect(Object.keys(EDGE_FROM_ARROW).sort()).toEqual(['-->', '-.->', '==>'].sort());
  });
});

describe('parseNodeDeclaration', () => {
  test('process shape (rectangle)', () => {
    expect(parseNodeDeclaration('A[Step]')).toEqual({ id: 'A', label: 'Step', kind: 'process' });
  });

  test('decision shape (diamond)', () => {
    expect(parseNodeDeclaration('A{Valid?}')).toEqual({
      id: 'A',
      label: 'Valid?',
      kind: 'decision',
    });
  });

  test('terminator shape (stadium)', () => {
    expect(parseNodeDeclaration('A([Start])')).toEqual({
      id: 'A',
      label: 'Start',
      kind: 'terminator',
    });
  });

  test('subroutine shape (double brackets)', () => {
    expect(parseNodeDeclaration('A[[Do thing]]')).toEqual({
      id: 'A',
      label: 'Do thing',
      kind: 'subroutine',
    });
  });

  test('document shape (parallelogram)', () => {
    expect(parseNodeDeclaration('A[/Report/]')).toEqual({
      id: 'A',
      label: 'Report',
      kind: 'document',
    });
  });

  test('unescapes quotes and newlines in labels', () => {
    expect(parseNodeDeclaration('A[he said #quot;hi#quot; \\n bye]')).toEqual({
      id: 'A',
      label: 'he said "hi" \n bye',
      kind: 'process',
    });
  });

  test('returns null for malformed input', () => {
    expect(parseNodeDeclaration('garbage')).toBeNull();
    expect(parseNodeDeclaration('')).toBeNull();
  });

  test('subroutine is not matched as process', () => {
    // Regression: `[[Do thing]]` must not fall through to process `[...]`
    // by matching the leading `[` and trailing `]`.
    const r = parseNodeDeclaration('A[[Do thing]]');
    expect(r.kind).toBe('subroutine');
  });
});

describe('fromMermaid', () => {
  test('parses a minimal flowchart', () => {
    const src = `flowchart TD
A[Step 1]
B[Step 2]
A --> B`;
    const graph = fromMermaid(src);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0]).toMatchObject({ kind: 'process', label: 'Step 1' });
    expect(graph.nodes[1]).toMatchObject({ kind: 'process', label: 'Step 2' });
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      fromNodeId: graph.nodes[0].id,
      toNodeId: graph.nodes[1].id,
      kind: 'solid',
    });
  });

  test('parses mixed shapes', () => {
    const src = `flowchart TD
A([Start])
B{Valid?}
C[Process]
C --> B
B -->|yes| A`;
    const graph = fromMermaid(src);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find((n) => n.kind === 'terminator')).toBeTruthy();
    expect(graph.nodes.find((n) => n.kind === 'decision')).toBeTruthy();
    expect(graph.nodes.find((n) => n.kind === 'process')).toBeTruthy();
    expect(graph.edges).toHaveLength(2);
  });

  test('handles inline edges without explicit node declarations', () => {
    // Some users write the edge in one line with implicit source/target.
    // fromMermaid auto-creates the missing nodes.
    const src = `flowchart TD
A --> B`;
    const graph = fromMermaid(src);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  test('skips the flowchart header line', () => {
    const graph = fromMermaid('flowchart TD\nA[Step]');
    expect(graph.nodes).toHaveLength(1);
  });

  test('skips comment lines (%%)', () => {
    const src = `flowchart TD
%% this is a comment
A[Step]`;
    const graph = fromMermaid(src);
    expect(graph.nodes).toHaveLength(1);
  });

  test('handles dotted and thick edges', () => {
    const src = `flowchart TD
A -.-> B
C ==> D`;
    expect(fromMermaid(src).edges.find((e) => e.kind === 'dotted')).toBeTruthy();
    expect(fromMermaid(src).edges.find((e) => e.kind === 'thick')).toBeTruthy();
  });

  test('returns empty graph for empty source', () => {
    expect(fromMermaid('')).toEqual({ nodes: [], edges: [] });
  });

  test('returns empty graph for non-string', () => {
    expect(fromMermaid(null)).toEqual({ nodes: [], edges: [] });
    expect(fromMermaid(undefined)).toEqual({ nodes: [], edges: [] });
  });
});
