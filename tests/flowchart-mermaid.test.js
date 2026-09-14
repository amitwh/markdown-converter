const {
  toMermaid,
  escapeLabel,
  nodeDeclaration,
  edgeDeclaration,
} = require('../src/flowchart/flowchart-mermaid');
const {
  normalizeIds,
  linearChain,
  decisionDiamond,
  parallelBranches,
  cycle,
  largeGraph,
} = require('./fixtures/flowchart-snapshots');

describe('flowchart-mermaid: escapeLabel', () => {
  test('escapes double quotes', () => {
    expect(escapeLabel('say "hi"')).toBe('say #quot;hi#quot;');
  });

  test('escapes newlines to literal \\n', () => {
    expect(escapeLabel('line1\nline2')).toBe('line1\\nline2');
  });

  test('passes plain text through', () => {
    expect(escapeLabel('Hello world')).toBe('Hello world');
  });
});

describe('flowchart-mermaid: nodeDeclaration', () => {
  test('process → A[Label]', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'process', label: 'Step' })).toBe('A[Step]');
  });
  test('decision → A{Label}', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'decision', label: 'Yes?' })).toBe('A{Yes?}');
  });
  test('terminator → A([Label])', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'terminator', label: 'Start' })).toBe('A([Start])');
  });
  test('subroutine → A[[Label]]', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'subroutine', label: 'Do thing' })).toBe(
      'A[[Do thing]]'
    );
  });
  test('document → A[/Label/]', () => {
    expect(nodeDeclaration({ id: 'A', kind: 'document', label: 'Report' })).toBe('A[/Report/]');
  });
  test('unknown kind throws', () => {
    expect(() => nodeDeclaration({ id: 'A', kind: 'hexagon', label: 'x' })).toThrow(/hexagon/);
  });
});

describe('flowchart-mermaid: edgeDeclaration', () => {
  test('solid → A --> B', () => {
    expect(edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid' }, 'A', 'B')).toBe(
      'A --> B'
    );
  });
  test('dotted → A -.-> B', () => {
    expect(edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'dotted' }, 'A', 'B')).toBe(
      'A -.-> B'
    );
  });
  test('thick → A ==> B', () => {
    expect(edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'thick' }, 'A', 'B')).toBe(
      'A ==> B'
    );
  });
  test('with label → A -->|yes| B', () => {
    expect(
      edgeDeclaration({ fromNodeId: 'A', toNodeId: 'B', kind: 'solid', label: 'yes' }, 'A', 'B')
    ).toBe('A -->|yes| B');
  });
});

describe('flowchart-mermaid: toMermaid — full graphs', () => {
  test('linearChain', () => {
    const out = toMermaid(normalizeIds(linearChain));
    expect(out).toMatch(/^flowchart TD/);
    expect(out).toMatch(/A\(\[Start\]\)/);
    expect(out).toMatch(/B\[Step 1\]/);
    expect(out).toMatch(/C\[Step 2\]/);
    expect(out).toMatch(/D\(\[End\]\)/);
    expect(out).toMatch(/A --> B/);
    expect(out).toMatch(/B --> C/);
    expect(out).toMatch(/C --> D/);
  });

  test('decisionDiamond includes labeled branches', () => {
    const out = toMermaid(normalizeIds(decisionDiamond));
    expect(out).toMatch(/C\{Valid\?\}/);
    expect(out).toMatch(/C -->\|yes\| D/);
    expect(out).toMatch(/C -->\|no\| E/);
  });

  test('parallelBranches', () => {
    const out = toMermaid(normalizeIds(parallelBranches));
    expect(out).toMatch(/B --> C/);
    expect(out).toMatch(/B --> D/);
    expect(out).toMatch(/C --> E/);
    expect(out).toMatch(/D --> E/);
  });

  test('cycle uses dotted for the back-edge', () => {
    const out = toMermaid(normalizeIds(cycle));
    expect(out).toMatch(/A --> B/);
    expect(out).toMatch(/B -\.-> A/);
  });

  test('largeGraph(20) emits 20 nodes and 19 edges in order', () => {
    const out = toMermaid(normalizeIds(largeGraph(20)));
    const nodeCount = (out.match(/^[A-Z]\[/gm) || []).length;
    const edgeCount = (out.match(/ --> /g) || []).length;
    expect(nodeCount).toBe(20);
    expect(edgeCount).toBe(19);
  });

  test('empty graph still emits the header', () => {
    expect(toMermaid({ nodes: [], edges: [] })).toBe('flowchart TD');
  });

  test('label with embedded double-quote is escaped', () => {
    const out = toMermaid(
      normalizeIds({
        nodes: [{ id: 'n1', kind: 'process', x: 0, y: 0, label: 'say "hi"' }],
        edges: [],
      })
    );
    expect(out).toMatch(/A\[say #quot;hi#quot;\]/);
  });

  test('label with newline uses \\n escape', () => {
    const out = toMermaid(
      normalizeIds({
        nodes: [{ id: 'n1', kind: 'process', x: 0, y: 0, label: 'line1\nline2' }],
        edges: [],
      })
    );
    expect(out).toMatch(/A\[line1\\nline2\]/);
  });
});
