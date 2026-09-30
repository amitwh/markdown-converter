/**
 * Pure viewport math for the flowchart canvas (v4.13.0).
 *
 * The SVG canvas keeps a fixed viewBox (1000×700). All content lives
 * inside a single <g transform="translate(tx,ty) scale(scale)"> so we
 * can zoom and pan without re-rendering.
 *
 * Pure module — no DOM, no globals — so the math is unit-testable.
 *
 * @module flowchart-viewport
 */

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 1.1; // multiplicative per Ctrl+wheel notch

/**
 * Zoom centred on a point in *screen* coordinates (the cursor position
 * inside the SVG viewport). The point under the cursor stays fixed on
 * screen as the scale changes.
 */
function zoomAt(view, screenX, screenY, factor) {
  const newScale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  const actualFactor = newScale / view.scale;
  // Derivation: world under cursor is ((sx-tx)/scale, ...). After zoom,
  // we want the same world to render at the same screen position.
  // Solving for tx' = sx - (sx - tx) * actualFactor.
  return {
    scale: newScale,
    tx: screenX - (screenX - view.tx) * actualFactor,
    ty: screenY - (screenY - view.ty) * actualFactor,
  };
}

function panBy(view, dx, dy) {
  return { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy };
}

function reset() {
  return { tx: 0, ty: 0, scale: 1 };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wheelFactor(deltaY) {
  // Standard "zoom in on scroll up" — positive deltaY zooms out.
  return deltaY < 0 ? SCALE_STEP : 1 / SCALE_STEP;
}

/**
 * Snap a value to the nearest multiple of gridSize.
 * Returns the value unchanged when gridSize is 0 (snap disabled).
 */
function snap(value, gridSize) {
  if (!gridSize || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

// v4.13.0 — UMD wrapper. The browser global fallback lets the standalone
// flowchart window load this via <script> tag (contextIsolation:true means
// the renderer cannot require()), and lets the controller's jsdom tests
// load it via new Function(...) without a Node `require`.
const _exported = { zoomAt, panBy, reset, wheelFactor, snap, MIN_SCALE, MAX_SCALE };
if (typeof module === 'object' && module.exports) {
  module.exports = _exported;
}
if (typeof window !== 'undefined') {
  window.FlowchartViewport = _exported;
}
