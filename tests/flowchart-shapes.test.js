/**
 * @jest-environment node
 */
const {
  shapeSvg,
  SHAPE_KINDS,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
} = require('../src/flowchart/flowchart-shapes');

describe('flowchart-shapes: shapeSvg', () => {
  test('process emits a <rect> at the given coordinates', () => {
    const svg = shapeSvg('process', 10, 20, 100, 50);
    expect(svg).toMatch(/<rect/);
    expect(svg).toMatch(/x="10"/);
    expect(svg).toMatch(/y="20"/);
    expect(svg).toMatch(/width="100"/);
    expect(svg).toMatch(/height="50"/);
  });

  test('decision emits a <polygon> diamond', () => {
    const svg = shapeSvg('decision', 0, 0, 100, 60);
    expect(svg).toMatch(/<polygon/);
    // 4 points (diamond)
    const match = /points="([^"]+)"/.exec(svg);
    expect(match).not.toBeNull();
    expect(match[1].split(/\s+/).filter(Boolean)).toHaveLength(4);
  });

  test('terminator emits a <rect> with rx (stadium)', () => {
    const svg = shapeSvg('terminator', 0, 0, 120, 40);
    expect(svg).toMatch(/<rect/);
    expect(svg).toMatch(/rx="/);
  });

  test('subroutine emits two concentric <rect> elements (double border)', () => {
    const svg = shapeSvg('subroutine', 0, 0, 100, 50);
    const rects = svg.match(/<rect/g) || [];
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  test('document emits a <polygon> parallelogram', () => {
    const svg = shapeSvg('document', 0, 0, 120, 60);
    expect(svg).toMatch(/<polygon/);
    const match = /points="([^"]+)"/.exec(svg);
    expect(match[1].split(/\s+/).filter(Boolean)).toHaveLength(4);
  });

  test('unknown kind throws', () => {
    expect(() => shapeSvg('hexagon', 0, 0, 100, 50)).toThrow(/hexagon/);
  });

  test('SHAPE_KINDS lists all 5 shapes', () => {
    expect(SHAPE_KINDS.sort()).toEqual([
      'decision',
      'document',
      'process',
      'subroutine',
      'terminator',
    ]);
  });

  test('DEFAULT_WIDTH and DEFAULT_HEIGHT are positive numbers', () => {
    expect(DEFAULT_WIDTH).toBeGreaterThan(0);
    expect(DEFAULT_HEIGHT).toBeGreaterThan(0);
  });
});
