/**
 * @jest-environment node
 *
 * Viewport math — zoom/pan/snap pure functions.
 */

const {
  zoomAt,
  panBy,
  reset,
  wheelFactor,
  snap,
  MIN_SCALE,
  MAX_SCALE,
} = require('../src/flowchart/flowchart-viewport');

describe('reset', () => {
  test('returns identity transform', () => {
    expect(reset()).toEqual({ tx: 0, ty: 0, scale: 1 });
  });
});

describe('zoomAt', () => {
  test('zoom in by SCALE_STEP, keeping the world point under cursor fixed on screen', () => {
    // World coords: transform="translate(tx,ty) scale(scale)" maps a world
    // point (wx, wy) to screen (wx*scale + tx, wy*scale + ty). The
    // world point under cursor is ((sx-tx)/scale, (sy-ty)/scale). After
    // zoom that same world point should render at the same screen coords.
    const v = { tx: 100, ty: 50, scale: 1 };
    // Cursor at screen (300, 200) → world point (200, 150).
    const screenX = 300;
    const screenY = 200;
    const factor = wheelFactor(-100); // wheel up = zoom in
    const v2 = zoomAt(v, screenX, screenY, factor);
    expect(v2.scale).toBeCloseTo(factor, 5);
    // The world point under the cursor before zoom:
    const wx = (screenX - v.tx) / v.scale;
    const wy = (screenY - v.ty) / v.scale;
    // And after zoom, it must render at the same screen position.
    const screenAfter = { x: wx * v2.scale + v2.tx, y: wy * v2.scale + v2.ty };
    expect(screenAfter.x).toBeCloseTo(screenX, 5);
    expect(screenAfter.y).toBeCloseTo(screenY, 5);
  });

  test('clamps to MIN_SCALE', () => {
    const v = { tx: 0, ty: 0, scale: MIN_SCALE };
    const v2 = zoomAt(v, 0, 0, 0.1); // try to zoom way out
    expect(v2.scale).toBe(MIN_SCALE);
  });

  test('clamps to MAX_SCALE', () => {
    const v = { tx: 0, ty: 0, scale: MAX_SCALE };
    const v2 = zoomAt(v, 0, 0, 100); // try to zoom way in
    expect(v2.scale).toBe(MAX_SCALE);
  });
});

describe('panBy', () => {
  test('shifts translation by dx/dy', () => {
    const v = { tx: 10, ty: 20, scale: 1 };
    expect(panBy(v, 5, -3)).toEqual({ scale: 1, tx: 15, ty: 17 });
  });

  test('does not change scale', () => {
    const v = { tx: 0, ty: 0, scale: 2 };
    const v2 = panBy(v, 10, 10);
    expect(v2.scale).toBe(2);
  });
});

describe('wheelFactor', () => {
  test('wheel up (negative deltaY) zooms in', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
  });
  test('wheel down (positive deltaY) zooms out', () => {
    expect(wheelFactor(100)).toBeLessThan(1);
  });
  test('reciprocal relationship', () => {
    expect(wheelFactor(-100) * wheelFactor(100)).toBeCloseTo(1, 5);
  });
});

describe('snap', () => {
  test('snaps to nearest gridSize', () => {
    expect(snap(103, 10)).toBe(100);
    expect(snap(107, 10)).toBe(110);
    expect(snap(105, 10)).toBe(110); // ties round up
  });

  test('returns value unchanged when gridSize is 0', () => {
    expect(snap(42, 0)).toBe(42);
  });

  test('returns value unchanged when gridSize is negative', () => {
    expect(snap(42, -5)).toBe(42);
  });

  test('works with negative values', () => {
    expect(snap(-103, 10)).toBe(-100);
  });

  test('works with custom grid sizes', () => {
    expect(snap(23, 20)).toBe(20);
    expect(snap(27, 20)).toBe(20);
    expect(snap(31, 20)).toBe(40);
  });
});
