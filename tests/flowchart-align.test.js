/**
 * @jest-environment node
 *
 * Pure tests for the alignment + distribution helpers.
 * Each function takes nodes and returns a new array with positions
 * adjusted — no store interaction, no DOM.
 */
const {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  alignCenterHorizontal,
  alignCenterVertical,
  distributeHorizontally,
  distributeVertically,
} = require('../src/flowchart/flowchart-align');

const n = (id, x, y, w = 120) => ({ id, x, y, width: w, label: id });

describe('flowchart-align: alignLeft', () => {
  test('aligns all nodes to the leftmost x', () => {
    const out = alignLeft([n('a', 100, 50), n('b', 200, 80), n('c', 300, 30)]);
    expect(out.map((node) => node.x)).toEqual([100, 100, 100]);
  });
  test('preserves y positions and other fields', () => {
    const out = alignLeft([n('a', 100, 50), n('b', 200, 80)]);
    expect(out[0]).toMatchObject({ id: 'a', x: 100, y: 50 });
    expect(out[1]).toMatchObject({ id: 'b', x: 100, y: 80 });
  });
  test('no-op for 0 or 1 nodes', () => {
    expect(alignLeft([])).toEqual([]);
    expect(alignLeft([n('a', 100, 50)])).toEqual([n('a', 100, 50)]);
  });
  test('returns a new array — does not mutate inputs', () => {
    const inputs = [n('a', 100, 50), n('b', 200, 80)];
    const snapshot = JSON.parse(JSON.stringify(inputs));
    alignLeft(inputs);
    expect(inputs).toEqual(snapshot);
  });
});

describe('flowchart-align: alignRight', () => {
  test('aligns all nodes to the rightmost (x + width)', () => {
    const out = alignRight([n('a', 100, 50), n('b', 200, 80), n('c', 250, 30, 200)]);
    // maxRight = 250 + 200 = 450
    expect(out.map((node) => node.x + node.width)).toEqual([450, 450, 450]);
  });
  test('no-op for single node', () => {
    expect(alignRight([n('a', 100, 50)])).toEqual([n('a', 100, 50)]);
  });
});

describe('flowchart-align: alignTop / alignBottom', () => {
  test('alignTop pins to the topmost y', () => {
    const out = alignTop([n('a', 50, 100), n('b', 80, 200), n('c', 30, 50)]);
    expect(out.map((node) => node.y)).toEqual([50, 50, 50]);
  });
  test('alignBottom pins to the bottommost y + 60', () => {
    const out = alignBottom([n('a', 50, 100), n('b', 80, 200), n('c', 30, 150)]);
    expect(out.map((node) => node.y)).toEqual([200, 200, 200]);
  });
});

describe('flowchart-align: alignCenterHorizontal / alignCenterVertical', () => {
  test('alignCenterHorizontal averages centers', () => {
    const out = alignCenterHorizontal([
      n('a', 0, 0, 100),
      n('b', 100, 0, 100),
      n('c', 200, 0, 100),
    ]);
    // centers: 50, 150, 250 → avg = 150
    expect(out.map((node) => node.x + node.width / 2)).toEqual([150, 150, 150]);
  });
  test('alignCenterVertical averages centers', () => {
    const out = alignCenterVertical([n('a', 0, 0), n('b', 0, 60), n('c', 0, 120)]);
    // centers: 30, 90, 150 → avg = 90
    expect(out.map((node) => node.y + 30)).toEqual([90, 90, 90]);
  });
});

describe('flowchart-align: distributeHorizontally', () => {
  test('spaces 4 nodes evenly between leftmost and rightmost', () => {
    const out = distributeHorizontally([
      n('a', 0, 0),
      n('b', 100, 0),
      n('c', 500, 0),
      n('d', 900, 0),
    ]);
    // gap = (900 - 0) / 3 = 300
    expect(out.map((node) => node.x)).toEqual([0, 300, 600, 900]);
  });
  test('handles unsorted input by sorting first', () => {
    const out = distributeHorizontally([n('a', 500, 0), n('b', 0, 0), n('c', 900, 0)]);
    // sorted: 0, 500, 900 → gap = 450 → x = [0, 450, 900]
    expect(out.map((node) => node.x)).toEqual([0, 450, 900]);
  });
  test('no-op for fewer than 3 nodes', () => {
    expect(distributeHorizontally([n('a', 0, 0), n('b', 100, 0)])).toEqual([
      n('a', 0, 0),
      n('b', 100, 0),
    ]);
  });
});

describe('flowchart-align: distributeVertically', () => {
  test('spaces 4 nodes evenly between topmost and bottommost', () => {
    const out = distributeVertically([n('a', 0, 0), n('b', 0, 60), n('c', 0, 300), n('d', 0, 900)]);
    // gap = 900 / 3 = 300
    expect(out.map((node) => node.y)).toEqual([0, 300, 600, 900]);
  });
});
