/**
 * Pure helpers for the maxGraph flowchart editor. The editor modules are ESM
 * (src/flowchart-editor/package.json sets "type": "module"), so they are
 * loaded with a dynamic import under Jest's experimental VM modules.
 */
describe('flowchart editor model helpers', () => {
  let shapes;
  let model;

  beforeAll(async () => {
    shapes = await import('../src/flowchart-editor/shapes.js');
    model = await import('../src/flowchart-editor/model.js');
  });

  test('palette has unique ids and a Mermaid kind for every shape', () => {
    const ids = shapes.SHAPES.map((shape) => shape.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('process');
    expect(ids).toContain('decision');
    expect(ids).toContain('document');
    for (const shape of shapes.SHAPES) {
      expect(typeof shape.mermaidKind).toBe('string');
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.height).toBeGreaterThan(0);
    }
  });

  test('getShape falls back to process for an unknown id', () => {
    expect(shapes.getShape('does-not-exist').id).toBe('process');
  });

  test('shapeForMermaidKind maps the Mermaid kinds the editor supports', () => {
    expect(shapes.shapeForMermaidKind('terminator').id).toBe('startEnd');
    expect(shapes.shapeForMermaidKind('decision').id).toBe('decision');
    expect(shapes.shapeForMermaidKind('document').id).toBe('document');
    expect(shapes.shapeForMermaidKind('subroutine').id).toBe('subprocess');
    expect(shapes.shapeForMermaidKind('unknown').id).toBe('process');
  });

  test('shapeIdForStyle prefers the explicit flowKind and falls back to shape', () => {
    expect(shapes.shapeIdForStyle({ flowKind: 'database', shape: 'rectangle' })).toBe('database');
    expect(shapes.shapeIdForStyle({ shape: 'rhombus' })).toBe('decision');
    expect(shapes.shapeIdForStyle({})).toBe('process');
  });

  test('edgeStyle and edgeKindForStyle round-trip solid/dotted/thick', () => {
    expect(model.edgeStyle('solid')).toMatchObject({ flowEdgeKind: 'solid' });
    expect(model.edgeStyle('dotted')).toMatchObject({ dashed: true, flowEdgeKind: 'dotted' });
    expect(model.edgeStyle('thick')).toMatchObject({ strokeWidth: 3, flowEdgeKind: 'thick' });

    expect(model.edgeKindForStyle({ flowEdgeKind: 'dotted' })).toBe('dotted');
    expect(model.edgeKindForStyle({ dashed: true })).toBe('dotted');
    expect(model.edgeKindForStyle({ strokeWidth: 3 })).toBe('thick');
    expect(model.edgeKindForStyle({})).toBe('solid');
  });

  test('flowModelFromGraph maps vertices and edges with styles', () => {
    const cells = [
      {
        id: 'n1',
        isVertex: () => true,
        isEdge: () => false,
        value: 'Start',
        geometry: { x: 10, y: 20, width: 120, height: 56 },
      },
      {
        id: 'n2',
        isVertex: () => true,
        isEdge: () => false,
        value: 'Done',
        geometry: { x: 300, y: 20, width: 140, height: 64 },
      },
      {
        id: 'e1',
        isVertex: () => false,
        isEdge: () => true,
        source: { id: 'n1' },
        target: { id: 'n2' },
        value: 'yes',
        geometry: {},
      },
    ];
    const styles = {
      n1: {
        shape: 'ellipse',
        flowKind: 'startEnd',
        fillColor: '#ffffff',
        strokeColor: '#475569',
        strokeWidth: 2,
        fontColor: '#111827',
        fontSize: 13,
      },
      n2: { shape: 'rectangle', flowKind: 'process', fillColor: '#ff0000' },
      e1: {
        flowEdgeKind: 'dotted',
        edgeStyle: 'elbowEdgeStyle',
        endArrow: 'open',
        strokeColor: '#334155',
        strokeWidth: 1.5,
        dashed: true,
      },
    };
    const graph = {
      getDefaultParent: () => ({}),
      getChildCells: () => cells,
      getCellStyle: (cell) => styles[cell.id] || {},
    };

    const flow = model.flowModelFromGraph(graph);
    expect(flow.nodes).toHaveLength(2);
    expect(flow.nodes[0]).toMatchObject({
      id: 'n1',
      shapeId: 'startEnd',
      kind: 'terminator',
      label: 'Start',
      x: 10,
      y: 20,
      width: 120,
      height: 56,
      fillColor: '#ffffff',
      strokeWidth: 2,
      fontSize: 13,
    });
    expect(flow.nodes[1]).toMatchObject({ id: 'n2', shapeId: 'process', color: '#ff0000' });
    expect(flow.edges).toEqual([
      expect.objectContaining({
        id: 'e1',
        fromNodeId: 'n1',
        toNodeId: 'n2',
        kind: 'dotted',
        label: 'yes',
        edgeStyle: 'elbowEdgeStyle',
        endArrow: 'open',
      }),
    ]);
  });

  test('serializeState emits a versioned JSON model, not maxGraph XML', () => {
    const graph = {
      getDefaultParent: () => ({}),
      getChildCells: () => [],
      getCellStyle: () => ({}),
      getView: () => ({ scale: 1, translate: { x: 5, y: 7 } }),
    };
    const state = model.serializeState(graph);
    expect(state).toMatchObject({
      version: 3,
      nodes: [],
      edges: [],
      view: { scale: 1, translate: { x: 5, y: 7 } },
    });
    expect(state.xml).toBeUndefined();
  });
});
