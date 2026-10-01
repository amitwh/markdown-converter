/**
 * Pure alignment + distribution helpers for the flowchart editor (v4.13.0).
 *
 * Each function takes an array of node objects and returns a new array
 * with the same nodes but their (x, y) adjusted per the operation.
 * Pure module — no DOM, no globals, no store mutation — so it's
 * unit-testable in isolation and the caller decides how to apply the
 * result (one moveNode per node, or a future batch API).
 *
 * All operations are no-ops when given fewer than two nodes (nothing
 * to align against). Distribute needs three or more to have a meaningful
 * "even space" between extremes.
 *
 * Coordinates are SVG units. A node's height is the canvas default
 * (60px) since the editor doesn't store height — only width.
 *
 * @module flowchart-align
 */

'use strict';

// v4.13.1 — DEFAULT_HEIGHT constant removed and inlined as 60 to avoid
// colliding with shapes.js's identically-named const when the build
// script concatenates both into the bundle.
function nodeWidth(node) {
  return Number(node.width) > 0 ? Number(node.width) : 120;
}

function nodeHeight(_node) {
  return 60;
}

function clone(node) {
  return { ...node };
}

/** All nodes line up at the leftmost x. */
function alignLeft(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const minX = Math.min(...nodes.map((n) => n.x));
  return nodes.map((n) => Object.assign(clone(n), { x: minX }));
}

/** All nodes line up at the rightmost (x + width). */
function alignRight(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const maxRight = Math.max(...nodes.map((n) => n.x + nodeWidth(n)));
  return nodes.map((n) => Object.assign(clone(n), { x: maxRight - nodeWidth(n) }));
}

/** All nodes line up at the topmost y. */
function alignTop(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const minY = Math.min(...nodes.map((n) => n.y));
  return nodes.map((n) => Object.assign(clone(n), { y: minY }));
}

/** All nodes line up at the bottommost (y + height). */
function alignBottom(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const maxBottom = Math.max(...nodes.map((n) => n.y + nodeHeight(n)));
  return nodes.map((n) => Object.assign(clone(n), { y: maxBottom - nodeHeight(n) }));
}

/** All nodes share the same horizontal center (mean of centers). */
function alignCenterHorizontal(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const centers = nodes.map((n) => n.x + nodeWidth(n) / 2);
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  return nodes.map((n) => Object.assign(clone(n), { x: avg - nodeWidth(n) / 2 }));
}

/** All nodes share the same vertical center (mean of centers). */
function alignCenterVertical(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 2) return nodes;
  const centers = nodes.map((n) => n.y + nodeHeight(n) / 2);
  const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
  return nodes.map((n) => Object.assign(clone(n), { y: avg - nodeHeight(n) / 2 }));
}

/**
 * Distribute horizontally — equal gap between consecutive node left edges.
 * The first and last nodes keep their positions; everything in between
 * is spaced evenly.
 */
function distributeHorizontally(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 3) return nodes;
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  const leftmost = sorted[0].x;
  const rightmost = sorted[sorted.length - 1].x;
  const gap = (rightmost - leftmost) / (sorted.length - 1);
  return sorted.map((n, i) => Object.assign(clone(n), { x: leftmost + gap * i }));
}

/**
 * Distribute vertically — equal gap between consecutive node top edges.
 * Same first/last-anchored semantics as the horizontal version.
 */
function distributeVertically(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 3) return nodes;
  const sorted = [...nodes].sort((a, b) => a.y - b.y);
  const topmost = sorted[0].y;
  const bottommost = sorted[sorted.length - 1].y;
  const gap = (bottommost - topmost) / (sorted.length - 1);
  return sorted.map((n, i) => Object.assign(clone(n), { y: topmost + gap * i }));
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    alignLeft,
    alignRight,
    alignTop,
    alignBottom,
    alignCenterHorizontal,
    alignCenterVertical,
    distributeHorizontally,
    distributeVertically,
    nodeWidth,
    nodeHeight,
  };
}
if (typeof window !== 'undefined') {
  window.FlowchartAlign = {
    alignLeft,
    alignRight,
    alignTop,
    alignBottom,
    alignCenterHorizontal,
    alignCenterVertical,
    distributeHorizontally,
    distributeVertically,
    nodeWidth,
    nodeHeight,
  };
}
