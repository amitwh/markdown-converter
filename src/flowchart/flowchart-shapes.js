/**
 * SVG shape templates for the 5 supported Mermaid flowchart node kinds.
 * Each `shapeSvg` returns ONE SVG element string — the canvas wraps it in a
 * <g data-node-id="…"> alongside a <text> label.
 *
 * v4.12.0 — Added an optional `color` (6th) argument so callers can set a
 * per-node fill color. Falls back to `#ffffff` when omitted so callers that
 * don't care about color (the existing tests, the sidebar panel) keep
 * working unchanged.
 *
 * Pure module: no DOM, no globals, no side effects.
 *
 * @module flowchart-shapes
 */

'use strict';

const SHAPE_KINDS = ['process', 'decision', 'terminator', 'subroutine', 'document'];
const DEFAULT_WIDTH = 140;
const DEFAULT_HEIGHT = 60;
const LABEL_PADDING_X = 16;
const LABEL_PADDING_Y = 12;
const DEFAULT_FILL = '#ffffff';

function shapeSvg(kind, x, y, width, height, color) {
  if (!SHAPE_KINDS.includes(kind)) {
    throw new Error(`flowchart-shapes: unknown shape kind "${kind}"`);
  }
  const fill = typeof color === 'string' && color.length > 0 ? color : DEFAULT_FILL;
  switch (kind) {
    case 'process':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" ry="4" fill="${fill}" />`;
    case 'terminator':
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" ry="${height / 2}" fill="${fill}" />`;
    case 'subroutine': {
      const inset = 4;
      return (
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" ry="4" fill="${fill}" />` +
        `<rect x="${x + inset}" y="${y + inset}" width="${width - 2 * inset}" height="${height - 2 * inset}" rx="4" ry="4" fill="${fill}" />`
      );
    }
    case 'decision': {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const left = `${x},${cy}`;
      const top = `${cx},${y}`;
      const right = `${x + width},${cy}`;
      const bottom = `${cx},${y + height}`;
      return `<polygon points="${left} ${top} ${right} ${bottom}" fill="${fill}" />`;
    }
    case 'document': {
      // Parallelogram: top-right and bottom-right indented by ~20% of height.
      const skew = Math.max(10, Math.round(height * 0.25));
      const tl = `${x + skew},${y}`;
      const tr = `${x + width},${y}`;
      const br = `${x + width - skew},${y + height}`;
      const bl = `${x},${y + height}`;
      return `<polygon points="${tl} ${tr} ${br} ${bl}" fill="${fill}" />`;
    }
    default:
      throw new Error(`flowchart-shapes: unknown shape kind "${kind}"`);
  }
}

// v4.9.6 UMD wrapper — exposes the same surface as a CommonJS module
// (used by src/sidebar/flowchart-panel.js via require()) AND as a browser
// global (used by src/renderer/flowchart-controller.js via <script> tag).
// The standalone BrowserWindow runs with contextIsolation:true +
// nodeIntegration:false, so the renderer cannot require() these modules;
// loading them as <script> tags in src/flowchart-generator.html attaches
// them to window.FlowchartShapes.
(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  } else {
    root.FlowchartShapes = exported;
  }
  // v4.9.7 — also expose as window global when running in Electron renderer
  // (nodeIntegration:true makes `module` truthy so the else branch above never
  // runs; the controller still expects window.FlowchartShapes).
  if (typeof window !== 'undefined') {
    window.FlowchartShapes = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return {
    shapeSvg,
    SHAPE_KINDS,
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    LABEL_PADDING_X,
    LABEL_PADDING_Y,
  };
});
