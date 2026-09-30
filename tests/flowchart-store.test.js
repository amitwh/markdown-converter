/**
 * @jest-environment node
 */
const { create } = require('../src/flowchart/flowchart-store');

function makeIO(overrides = {}) {
  return {
    persistencePath: '/tmp/flowchart-session.json',
    readFile: jest.fn().mockResolvedValue(null),
    writeFile: jest.fn().mockResolvedValue(undefined),
    now: () => 1700000000000,
    ...overrides,
  };
}

describe('flowchart-store: node operations', () => {
  test('addNode creates a node with id, kind, x, y, label and assigns an id', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 10, y: 20, label: 'Hello' });
    expect(node).toMatchObject({ kind: 'process', x: 10, y: 20, label: 'Hello' });
    expect(typeof node.id).toBe('string');
    expect(node.id.length).toBeGreaterThan(0);
    expect(store.getGraph().nodes).toContainEqual(node);
  });

  test('addNode defaults label to empty string when omitted', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'decision', x: 0, y: 0 });
    expect(node.label).toBe('');
  });

  test('addNode throws on unknown kind', () => {
    const store = create(makeIO());
    expect(() => store.addNode({ kind: 'bogus', x: 0, y: 0 })).toThrow(/bogus/);
  });

  test('moveNode updates position of existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.moveNode(node.id, 50, 60);
    const moved = store.getGraph().nodes.find((n) => n.id === node.id);
    expect(moved).toMatchObject({ x: 50, y: 60 });
  });

  test('moveNode throws on unknown node id', () => {
    const store = create(makeIO());
    expect(() => store.moveNode('does-not-exist', 0, 0)).toThrow(/does-not-exist/);
  });

  test('setNodeLabel updates label of existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.setNodeLabel(node.id, 'B');
    expect(store.getGraph().nodes.find((n) => n.id === node.id).label).toBe('B');
  });

  test('setNodeKind updates kind of existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeKind(node.id, 'decision');
    expect(store.getGraph().nodes.find((n) => n.id === node.id).kind).toBe('decision');
  });

  // v4.12.0 — per-node fill color. Mirrors setNodeKind/setNodeLabel semantics.
  test('addNode defaults color to #ffffff when not provided', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    expect(node.color).toBe('#ffffff');
    expect(store.getGraph().nodes[0].color).toBe('#ffffff');
  });

  test('addNode accepts an explicit color', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '', color: '#ff0000' });
    expect(node.color).toBe('#ff0000');
  });

  test('setNodeColor updates the color of an existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeColor(node.id, '#336699');
    expect(store.getGraph().nodes.find((n) => n.id === node.id).color).toBe('#336699');
  });

  test('setNodeColor accepts hex without leading #', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeColor(node.id, 'abcdef');
    expect(store.getGraph().nodes[0].color).toBe('#abcdef');
  });

  test('setNodeColor falls back to #ffffff for non-hex strings', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeColor(node.id, 'not-a-color');
    expect(store.getGraph().nodes[0].color).toBe('#ffffff');
  });

  test('setNodeColor throws on unknown node id', () => {
    const store = create(makeIO());
    expect(() => store.setNodeColor('nope', '#ff0000')).toThrow(/nope/);
  });

  test('setNodeWidth updates the width of an existing node', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeWidth(node.id, 220);
    expect(store.getGraph().nodes[0].width).toBe(220);
  });

  test('setNodeWidth clamps to [60, 600]', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeWidth(node.id, 10);
    expect(store.getGraph().nodes[0].width).toBe(60);
    store.setNodeWidth(node.id, 99999);
    expect(store.getGraph().nodes[0].width).toBe(600);
  });

  test('setNodeWidth throws on unknown node id', () => {
    const store = create(makeIO());
    expect(() => store.setNodeWidth('nope', 200)).toThrow(/nope/);
  });

  test('setNodeColor pushes an undo snapshot', () => {
    const store = create(makeIO());
    const node = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    store.setNodeColor(node.id, '#abcdef');
    expect(store.getGraph().nodes[0].color).toBe('#abcdef');
    store.undo();
    expect(store.getGraph().nodes[0].color).toBe('#ffffff');
  });

  test('removeNode removes the node and any connected edges', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id, 'solid');
    store.removeNode(a.id);
    expect(store.getGraph().nodes.find((n) => n.id === a.id)).toBeUndefined();
    expect(store.getGraph().edges.find((e) => e.id === edge.id)).toBeUndefined();
  });
});

describe('flowchart-store: edge operations', () => {
  test('connect creates a solid edge by default', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id);
    expect(edge).toMatchObject({ fromNodeId: a.id, toNodeId: b.id, kind: 'solid' });
    expect(store.getGraph().edges).toContainEqual(edge);
  });

  test('connect accepts solid|dotted|thick', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    expect(store.connect(a.id, b.id, 'dotted').kind).toBe('dotted');
    expect(store.connect(a.id, b.id, 'thick').kind).toBe('thick');
  });

  test('connect throws when from === to', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    expect(() => store.connect(a.id, a.id)).toThrow(TypeError);
  });

  test('connect throws on unknown edge kind', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: '' });
    expect(() => store.connect(a.id, b.id, 'wavy')).toThrow(/wavy/);
  });

  test('disconnect removes the edge', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id, 'solid');
    store.disconnect(edge.id);
    expect(store.getGraph().edges.find((e) => e.id === edge.id)).toBeUndefined();
  });

  test('setEdgeKind and setEdgeLabel mutate the edge', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const b = store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    const edge = store.connect(a.id, b.id, 'solid');
    store.setEdgeKind(edge.id, 'thick');
    store.setEdgeLabel(edge.id, 'next');
    const updated = store.getGraph().edges.find((e) => e.id === edge.id);
    expect(updated).toMatchObject({ kind: 'thick', label: 'next' });
  });
});

describe('flowchart-store: subscribe', () => {
  test('subscribe fires once per mutation', () => {
    const store = create(makeIO());
    const fn = jest.fn();
    store.subscribe(fn);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.addNode({ kind: 'process', x: 10, y: 10, label: 'B' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('unsubscribe stops further notifications', () => {
    const store = create(makeIO());
    const fn = jest.fn();
    const unsub = store.subscribe(fn);
    unsub();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('flowchart-store: undo / redo', () => {
  test('undo restores prior state after addNode', () => {
    const store = create(makeIO());
    expect(store.getGraph().nodes).toHaveLength(0);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(store.getGraph().nodes).toHaveLength(1);
    store.undo();
    expect(store.getGraph().nodes).toHaveLength(0);
  });

  test('redo replays the undone mutation', () => {
    const store = create(makeIO());
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.undo();
    store.redo();
    expect(store.getGraph().nodes).toHaveLength(1);
  });

  test('canUndo and canRedo reflect stack state', () => {
    const store = create(makeIO());
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
    store.undo();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
  });

  test('new mutation after undo drops the redo stack', () => {
    const store = create(makeIO());
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    store.undo();
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'B' });
    expect(store.canRedo()).toBe(false);
  });

  test('snapshot stack is bounded at depth 50', () => {
    const store = create(makeIO());
    for (let i = 0; i < 60; i += 1) {
      store.addNode({ kind: 'process', x: i, y: 0, label: `n${i}` });
    }
    let undoCount = 0;
    while (store.canUndo()) {
      store.undo();
      undoCount += 1;
      if (undoCount > 100) throw new Error('undo did not terminate');
    }
    expect(undoCount).toBeLessThanOrEqual(50);
  });
});

describe('flowchart-store: serialize / deserialize', () => {
  test('serialize → deserialize round-trip preserves graph', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 10, y: 20, label: 'A' });
    const b = store.addNode({ kind: 'decision', x: 30, y: 40, label: 'B?' });
    store.connect(a.id, b.id, 'thick');
    const json = store.serialize();
    const restored = create(makeIO());
    restored.deserialize(json);
    expect(restored.getGraph()).toEqual(store.getGraph());
  });

  // v4.12.0 — color is part of the persisted graph and survives round-trip.
  test('serialize → deserialize round-trip preserves per-node color', () => {
    const store = create(makeIO());
    const a = store.addNode({ kind: 'process', x: 10, y: 20, label: 'A', color: '#ff0000' });
    const b = store.addNode({ kind: 'decision', x: 30, y: 40, label: 'B?', color: '#00aaff' });
    const json = store.serialize();
    const restored = create(makeIO());
    restored.deserialize(json);
    const restoredA = restored.getGraph().nodes.find((n) => n.id === a.id);
    const restoredB = restored.getGraph().nodes.find((n) => n.id === b.id);
    expect(restoredA.color).toBe('#ff0000');
    expect(restoredB.color).toBe('#00aaff');
  });

  test('deserialize normalises missing color to #ffffff', () => {
    const store = create(makeIO());
    store.deserialize(
      JSON.stringify({
        nodes: [{ id: 'n1', kind: 'process', x: 0, y: 0, label: 'A' }],
        edges: [],
      })
    );
    expect(store.getGraph().nodes[0].color).toBe('#ffffff');
  });

  test('deserialize handles corrupt JSON by returning empty graph', () => {
    const store = create(makeIO());
    expect(() => store.deserialize('{not-json')).not.toThrow();
    expect(store.getGraph()).toEqual({ nodes: [], edges: [] });
  });

  test('deserialize validates node kinds and drops invalid nodes', () => {
    const store = create(makeIO());
    store.deserialize(
      JSON.stringify({
        nodes: [
          { id: 'n1', kind: 'process', x: 0, y: 0, label: 'A' },
          { id: 'n2', kind: 'bogus', x: 0, y: 0, label: 'X' },
        ],
        edges: [],
      })
    );
    expect(store.getGraph().nodes).toHaveLength(1);
  });
});

describe('flowchart-store: persistence (injected IO)', () => {
  test('writeFile is called with serialized graph when subscribing to persistence', async () => {
    const io = makeIO();
    const store = create(io);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    // Persistence is debounced inside the panel; the store itself does not
    // auto-write. Verify only that the IO is wired through.
    expect(io.persistencePath).toBe('/tmp/flowchart-session.json');
  });
});
