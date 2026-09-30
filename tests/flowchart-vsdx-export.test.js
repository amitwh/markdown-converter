/**
 * @jest-environment node
 *
 * Tests the pure Visio .vsdx exporter (src/flowchart/flowchart-vsdx-export.js).
 * The pure module returns string XML; the main-process IPC handler wraps
 * it in a zip and writes bytes. These tests verify the geometry, escaping,
 * and shape / connect emission.
 */
const {
  toVisioPageXml,
  visioBoilerplate,
  graphBounds,
} = require('../src/flowchart/flowchart-vsdx-export');

describe('flowchart-vsdx-export: pure module', () => {
  test('graphBounds returns sensible defaults for empty graph', () => {
    expect(graphBounds({ nodes: [], edges: [] })).toEqual({ width: 200, height: 100 });
    expect(graphBounds(null)).toEqual({ width: 200, height: 100 });
  });

  test('graphBounds spans the union of node rectangles', () => {
    const bounds = graphBounds({
      nodes: [
        { id: 'a', x: 0, y: 0, width: 100, height: 60 },
        { id: 'b', x: 200, y: 100, width: 100, height: 60 },
      ],
      edges: [],
    });
    expect(bounds.width).toBe(300);
    expect(bounds.height).toBe(160);
  });

  test('toVisioPageXml emits a Shape per node with correct geometry', () => {
    const xml = toVisioPageXml({
      nodes: [{ id: 'n1', kind: 'process', x: 0, y: 0, width: 120, height: 60, label: 'Hello' }],
      edges: [],
    });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<PageContents');
    expect(xml).toContain('ID="n1"');
    expect(xml).toContain('NameU="Process"');
    expect(xml).toContain('PinX');
    expect(xml).toContain('PinY');
    expect(xml).toContain('<Text>Hello</Text>');
  });

  test('toVisioPageXml escapes XML-special characters in labels', () => {
    const xml = toVisioPageXml({
      nodes: [
        { id: 'n1', kind: 'process', x: 0, y: 0, width: 120, height: 60, label: 'A & B <c>' },
      ],
      edges: [],
    });
    expect(xml).toContain('A &amp; B &lt;c&gt;');
    expect(xml).not.toContain('<c>');
  });

  test('toVisioPageXml emits Connect entries for edges', () => {
    const xml = toVisioPageXml({
      nodes: [
        { id: 'a', kind: 'process', x: 0, y: 0, width: 120, height: 60, label: 'A' },
        { id: 'b', kind: 'process', x: 200, y: 0, width: 120, height: 60, label: 'B' },
      ],
      edges: [{ id: 'e1', fromNodeId: 'a', toNodeId: 'b', kind: 'solid' }],
    });
    expect(xml).toContain('<Connects>');
    expect(xml).toContain('FromSheet="a"');
    expect(xml).toContain('ToSheet="b"');
  });

  test('toVisioPageXml maps the 5 node kinds to distinct master names', () => {
    const kinds = ['process', 'decision', 'terminator', 'subroutine', 'document'];
    const names = new Set();
    for (const kind of kinds) {
      const xml = toVisioPageXml({
        nodes: [{ id: `n_${kind}`, kind, x: 0, y: 0, width: 120, height: 60, label: kind }],
        edges: [],
      });
      const match = xml.match(/NameU="([^"]+)"/);
      expect(match).not.toBeNull();
      names.add(match[1]);
    }
    expect(names.size).toBe(5);
  });

  test('visioBoilerplate returns all required static XML files', () => {
    const files = visioBoilerplate();
    const keys = Object.keys(files);
    expect(keys).toContain('[Content_Types].xml');
    expect(keys).toContain('_rels/.rels');
    expect(keys).toContain('visio/document.xml');
    expect(keys).toContain('visio/pages/pages.xml');
    expect(keys).toContain('visio/pages/_rels/pages.xml.rels');
    expect(keys).toContain('docProps/core.xml');
    expect(keys).toContain('docProps/app.xml');
    for (const body of Object.values(files)) {
      expect(body.startsWith('<?xml')).toBe(true);
    }
  });
});
