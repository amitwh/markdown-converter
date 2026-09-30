/**
 * @jest-environment jsdom
 */
const { create } = require('../src/flowchart/flowchart-store');
const { createCanvas } = require('../src/flowchart/flowchart-canvas');

function makeStore(graph) {
  const store = create({
    persistencePath: '/tmp/x.json',
    readFile: async () => null,
    writeFile: async () => undefined,
    now: () => 0,
  });
  if (graph) store.deserialize(JSON.stringify(graph));
  return store;
}

function mount(store) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const api = createCanvas(container, store, {
    onEdgeClick: jest.fn(),
    onShapeMenu: jest.fn(),
  });
  return { container, api };
}

describe('flowchart-canvas: rendering', () => {
  test('mounts an <svg> inside the container', () => {
    const store = makeStore();
    const { container } = mount(store);
    expect(container.querySelector('svg.flowchart-canvas')).not.toBeNull();
  });

  test('renders one <g data-node-id> per node', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'decision', x: 50, y: 50, label: 'B' },
        { id: 'n3', kind: 'terminator', x: 90, y: 80, label: 'C' },
      ],
      edges: [],
    });
    const { container } = mount(store);
    const groups = container.querySelectorAll('g[data-node-id]');
    expect(groups).toHaveLength(3);
  });

  test('renders edges as <line> elements', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'process', x: 100, y: 100, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'solid' }],
    });
    const { container } = mount(store);
    expect(container.querySelectorAll('line[data-edge-id]')).toHaveLength(1);
  });

  test('thick edges get stroke-width="3"', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'process', x: 100, y: 100, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'thick' }],
    });
    const { container } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    expect(line.getAttribute('stroke-width')).toBe('3');
  });

  test('dotted edges get stroke-dasharray', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 10, y: 20, label: 'A' },
        { id: 'n2', kind: 'process', x: 100, y: 100, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'n1', toNodeId: 'n2', kind: 'dotted' }],
    });
    const { container } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    expect(line.getAttribute('stroke-dasharray')).toBe('4,4');
  });
});

describe('flowchart-canvas: pointer events', () => {
  function stubLayout(container, nodes) {
    // Match the SVG viewBox (1000 x 700) so client→svg mapping is 1:1.
    container.querySelector('svg').getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      top: 0,
      left: 0,
      bottom: 700,
      right: 1000,
    });
    for (const n of nodes) {
      const g = container.querySelector(`g[data-node-id="${n.id}"]`);
      g.getBoundingClientRect = () => ({
        x: n.x,
        y: n.y,
        width: 80,
        height: 40,
        top: n.y,
        left: n.x,
        bottom: n.y + 40,
        right: n.x + 80,
      });
    }
  }
  function dispatch(target, type, opts) {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, opts || {});
    target.dispatchEvent(ev);
  }

  test('pointerdown + pointermove + pointerup on a node moves it', () => {
    const store = makeStore({
      nodes: [{ id: 'n1', kind: 'process', x: 100, y: 100, label: 'A' }],
      edges: [],
    });
    const { container } = mount(store);
    const nodeG = container.querySelector('g[data-node-id="n1"]');
    stubLayout(container, [{ id: 'n1', x: 100, y: 100 }]);
    dispatch(nodeG, 'pointerdown', { clientX: 120, clientY: 110, pointerId: 1 });
    dispatch(nodeG, 'pointermove', { clientX: 170, clientY: 160, pointerId: 1 });
    dispatch(nodeG, 'pointerup', { clientX: 170, clientY: 160, pointerId: 1 });
    const moved = store.getGraph().nodes.find((n) => n.id === 'n1');
    expect(moved.x).toBe(150);
    expect(moved.y).toBe(150);
  });

  test('Alt+drag from node A center to node B creates a solid edge', () => {
    const store = makeStore({
      nodes: [
        { id: 'n1', kind: 'process', x: 100, y: 100, label: 'A' },
        { id: 'n2', kind: 'process', x: 400, y: 100, label: 'B' },
      ],
      edges: [],
    });
    const { container } = mount(store);
    stubLayout(container, [
      { id: 'n1', x: 100, y: 100 },
      { id: 'n2', x: 400, y: 100 },
    ]);
    const a = container.querySelector('g[data-node-id="n1"]');
    const b = container.querySelector('g[data-node-id="n2"]');
    dispatch(a, 'pointerdown', { clientX: 140, clientY: 120, altKey: true, pointerId: 1 });
    // pointermove over node B's center
    dispatch(a, 'pointermove', { clientX: 440, clientY: 120, altKey: true, pointerId: 1 });
    // pointerup on node B
    dispatch(b, 'pointerup', { clientX: 440, clientY: 120, altKey: true, pointerId: 1 });
    expect(store.getGraph().edges).toHaveLength(1);
    expect(store.getGraph().edges[0]).toMatchObject({
      fromNodeId: 'n1',
      toNodeId: 'n2',
      kind: 'solid',
    });
  });
});

describe('flowchart-canvas: subscribe re-renders on store change', () => {
  test('addNode causes a new <g> to appear', () => {
    const store = makeStore();
    const { container } = mount(store);
    expect(container.querySelectorAll('g[data-node-id]')).toHaveLength(0);
    store.addNode({ kind: 'process', x: 0, y: 0, label: 'New' });
    expect(container.querySelectorAll('g[data-node-id]')).toHaveLength(1);
  });
});

describe('flowchart-canvas: destroy', () => {
  test('removes the SVG and detaches subscribers', () => {
    const store = makeStore();
    const { container, api } = mount(store);
    api.destroy();
    expect(container.querySelector('svg.flowchart-canvas')).toBeNull();
    // After destroy, store changes should not throw inside a detached subscriber.
    expect(() => store.addNode({ kind: 'process', x: 0, y: 0, label: 'X' })).not.toThrow();
  });
});

describe('flowchart-canvas: edge geometry (v4.13.0)', () => {
  test('edge starts at source boundary, not centre', () => {
    const store = makeStore();
    const from = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const to = store.addNode({ kind: 'process', x: 300, y: 0, label: 'B' });
    store.connect(from.id, to.id, 'solid');
    const { container, api } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    expect(line).not.toBeNull();
    // Source centre is at (70, 30); line should start further right (toward B).
    const x1 = parseFloat(line.getAttribute('x1'));
    const y1 = parseFloat(line.getAttribute('y1'));
    expect(x1).toBeGreaterThan(70); // started past the source centre
    expect(y1).toBeCloseTo(30, 0); // horizontal edge stays at the centre y
    api.destroy();
  });

  test('edge ends at target boundary, not centre', () => {
    const store = makeStore();
    const from = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const to = store.addNode({ kind: 'process', x: 300, y: 0, label: 'B' });
    store.connect(from.id, to.id, 'solid');
    const { container, api } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    const x2 = parseFloat(line.getAttribute('x2'));
    // Target centre is at (370, 30); line should end before that.
    expect(x2).toBeLessThan(370);
    api.destroy();
  });

  test('vertical edge connects at top/bottom boundary', () => {
    const store = makeStore();
    const from = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const to = store.addNode({ kind: 'process', x: 0, y: 300, label: 'B' });
    store.connect(from.id, to.id, 'solid');
    const { container, api } = mount(store);
    const line = container.querySelector('line[data-edge-id]');
    const y1 = parseFloat(line.getAttribute('y1'));
    const y2 = parseFloat(line.getAttribute('y2'));
    expect(y1).toBeGreaterThan(30); // source's bottom boundary is at y=60
    expect(y2).toBeLessThan(330); // target's top boundary is at y=300
    api.destroy();
  });

  test('edge label background auto-sizes for long labels', () => {
    const store = makeStore();
    const from = store.addNode({ kind: 'process', x: 0, y: 0, label: 'A' });
    const to = store.addNode({ kind: 'process', x: 300, y: 0, label: 'B' });
    store.connect(from.id, to.id, 'solid');
    store.setEdgeLabel(store.getGraph().edges[0].id, 'a very long label');
    const { container, api } = mount(store);
    const bg = container.querySelector('rect[data-edge-label-bg]');
    const longBg = bg.getAttribute('width');
    // Set a short label and re-render — bg should be smaller
    store.setEdgeLabel(store.getGraph().edges[0].id, 'x');
    const bg2 = container.querySelector('rect[data-edge-label-bg]');
    const shortBg = bg2.getAttribute('width');
    expect(parseFloat(longBg)).toBeGreaterThan(parseFloat(shortBg));
    api.destroy();
  });
});

describe('flowchart-canvas: selection ownership (v4.13.0)', () => {
  test('canvas owns selection state, not DOM', () => {
    const store = makeStore();
    const { api, container } = mount(store);
    expect(api.getSelection()).toEqual({ nodeId: null, edgeId: null });
    // Simulate pointerdown via dispatching the event on the SVG
    const node = store.addNode({ kind: 'process', x: 10, y: 10, label: 'X' });
    store.subscribe(() => {}); // noop; the canvas subscriber re-renders
    // Manually call internal logic via a re-render trigger: we set selection
    // through the public pointerdown handler.
    const svg = container.querySelector('svg.flowchart-canvas');
    const nodeEl = container.querySelector('g[data-node-id]');
    // Build a synthetic pointerdown on the node element
    const ev = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: nodeEl });
    Object.defineProperty(ev, 'clientX', { value: 10 });
    Object.defineProperty(ev, 'clientY', { value: 10 });
    svg.dispatchEvent(ev);
    expect(api.getSelection().nodeId).toBe(node.id);
    api.destroy();
  });
});
