#!/usr/bin/env node
// v4.13.1 — Flowchart bundle generator.
//
// Reads the pure modules from src/flowchart/ and the unique "tail"
// (controller bootstrap + modal helpers + node-list panel) from
// src/renderer/flowchart-bundle-tail.js, then concatenates them into
// the final src/renderer/flowchart-bundle.js that the standalone
// BrowserWindow loads as a single <script> tag.
//
// Why this exists: before this script, the bundle manually inlined
// ~1100 lines of pure modules at the top. Every change to a pure
// module required a manual re-sync, which led to drift (the C17
// multi-select change had to be applied in two places, and a missed
// sync would silently break the standalone window).
//
// Usage: npm run build:bundle
// Output: src/renderer/flowchart-bundle.js
//
// @module build-flowchart-bundle

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const FLOWCHART_DIR = path.join(SRC, 'flowchart');
const TAIL_PATH = path.join(SRC, 'renderer', 'flowchart-bundle-tail.js');
const OUTPUT_PATH = path.join(SRC, 'renderer', 'flowchart-bundle.js');

// Pure modules in load order. flowchart-vsdx-export is intentionally
// excluded — it runs in the main process only (consumed by the IPC
// handler), never by the renderer. The remaining modules are
// collision-free at the top level (each declares its own unique
// constants) so they can be concatenated without IIFE wrapping.
const PURE_MODULES = [
  'flowchart-shapes.js',
  'flowchart-viewport.js',
  'flowchart-mermaid.js',
  'flowchart-mermaid-parse.js',
  'flowchart-clipboard.js',
  'flowchart-store.js',
  'flowchart-canvas.js',
  'flowchart-align.js',
];

function readModule(filename) {
  const filePath = path.join(FLOWCHART_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error('build-flowchart-bundle: missing pure module ' + filePath);
  }
  let source = fs.readFileSync(filePath, 'utf-8');
  const basename = filename.replace(/\.js$/, '');
  // Camel-case the basename for the window global: flowchart-mermaid-parse
  // -> FlowchartMermaidParse, flowchart-clipboard -> FlowchartClipboard.
  const windowName = 'window.Flowchart' + basename
    .replace(/^flowchart-/, '')
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

  // v4.13.1 — strip CommonJS-isms before concatenating into the bundle.
  // The bundle is a browser-only script (no Node `module` / `require`),
  // so we have to:
  //   1. Replace `const shapesModule = (typeof window !== 'undefined'
  //      && window.FlowchartShapes) || require('./flowchart-shapes')`
  //      with the pure browser form so canvas can still pick up
  //      SHAPE_KINDS / DEFAULT_WIDTH / etc. from the shapes module
  //      that was inlined just above.
  //   2. Replace any top-level `module.exports = ...` lines that some
  //      modules (mermaid-parse, vsdx-export) have without a UMD
  //      guard with an equivalent `window.X = ...` assignment so the
  //      bundle's tail can still find the module's exports.
  // The CommonJS paths stay intact for tests + the sidebar panel.
  if (filename === 'flowchart-canvas.js') {
    source = source.replace(
      /const shapesModule =\s*\n?\s*\(typeof window[\s\S]*?require\('\.\/flowchart-shapes'\);/,
      'const shapesModule = window.FlowchartShapes;'
    );
    source = source.replace(
      /const viewportModule =\s*\n?\s*\(typeof window[\s\S]*?require\('\.\/flowchart-viewport'\);/,
      'const viewportModule = window.FlowchartViewport;'
    );
  }
  // Replace bare `module.exports = X;` with `window.X = X;` so the
  // tail can pick up the module's exports from window globals.
  source = source.replace(
    /^module\.exports\s*=\s*([^\n;]+);?\s*$/gm,
    windowName + ' = $1;'
  );
  source = source.replace(/\n{3,}/g, '\n\n');

  return source;
}

function buildHeader() {
  const parts = [
    '// v4.13.1 — AUTO-GENERATED FILE. DO NOT EDIT.',
    '//',
    '// This file is the concatenation of every pure module in',
    '// src/flowchart/ plus the unique tail from',
    '// src/renderer/flowchart-bundle-tail.js. Regenerate it by running',
    "// `npm run build:bundle` whenever a pure module changes.",
    '//',
    '// Each pure module is wrapped in its own IIFE so top-level',
    '// `const` declarations (DEFAULT_WIDTH, DEFAULT_HEIGHT, SHAPE_KINDS,',
    '// etc.) stay local to that module and do not collide with',
    '// identically-named declarations in other modules. The UMD',
    '// wrappers inside each module continue to expose the public API',
    '// as window.FlowchartXxx, which the tail consumes.',
  ];
  for (const filename of PURE_MODULES) {
    const basename = filename.replace(/\.js$/, '');
    parts.push('');
    parts.push('  // ========== ' + basename + ' (inlined by build script) ==========');
    // Wrap each module in its own IIFE for scope isolation. The UMD
    // wrapper inside still runs and assigns to window.FlowchartXxx
    // on the outer window object.
    parts.push('(function () {');
    parts.push(readModule(filename));
    parts.push('})();');
  }
  return parts.join('\n');
}

function buildTail() {
  if (!fs.existsSync(TAIL_PATH)) {
    throw new Error('build-flowchart-bundle: missing tail ' + TAIL_PATH);
  }
  return fs.readFileSync(TAIL_PATH, 'utf-8');
}

function main() {
  const header = buildHeader();
  const tail = buildTail();
  const output = header + '\n' + tail;
  fs.writeFileSync(OUTPUT_PATH, output);
  const stat = fs.statSync(OUTPUT_PATH);
  console.log(
    'build-flowchart-bundle: wrote ' +
      path.relative(ROOT, OUTPUT_PATH) +
      ' (' +
      stat.size +
      ' bytes, ' +
      PURE_MODULES.length +
      ' pure modules + tail)'
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { main, PURE_MODULES };
