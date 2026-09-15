# PanConverter - Updates & Changelog

## Version 4.11.1 (2026-09-15)

### Chore

- **Cleanup: removed stale debug-copy `flowchart-bundle.js` from project root.** The root-level file was an older v4.10.0 copy that had drifted from `src/renderer/flowchart-bundle.js` (now v4.11.0); the canonical bundle lives under `src/renderer/`, the root copy was never loaded by Electron and was just repo noise.
- **Cleanup: replaced `'place' + 'holder'` string-split hack with proper `'placeholder'` attribute.** The v4.10.0 / v4.11.0 bundles deliberately concatenated the attribute name at runtime to evade a static-source grep for the literal word "placeholder". The HTML attribute name itself is the standard HTML spec — no need to obfuscate it. Two call sites (node label input, edge label input) now use `.setAttribute('placeholder', 'Label')` directly. (No functional change.)

## Version 4.11.0 (2026-09-15)

### Feat

- **Standalone Flowchart Generator window: replaced click-on-canvas interaction with a button-driven node-list panel.** The v4.10.0 floating selection toolbar (which fired on SVG click hit-testing inside `#canvas-host`) was still unreliable in the user's Electron runtime — they reported seeing only rectangles, not the toolbar. Every mutation is now driven from an explicit control in `<div id="fc-nodelist">`, which sits between the canvas and the preview:
  - **Add Node** — 5 buttons (Process / Decision / Terminator / Subroutine / Document). Each click appends a node of that kind at the next free grid spot.
  - **Nodes** list — one `<li>` per node showing `id` + kind `<select>` + label `<input>` + red `×` delete button. The kind `<select>` change calls `store.setNodeKind`; the label `<input>` calls `store.setNodeLabel`; the delete `×` calls `store.removeNode`.
  - **Edges** list — one `<li>` per edge showing `from→to` short ids + kind `<select>` (Solid / Dotted / Thick) + label `<input>` + red `×` delete button.
  - **Connect form** — From `<select>` + To `<select>` + `+ Edge` button + `Refresh` button (rebuilds the dropdowns from the current graph). `+ Edge` calls `store.connect(from, to, 'solid')`; identical from/to is a no-op with a status hint.
- **Canvas is purely visual now.** Removed the v4.10.0 `<div id="fc-selection-toolbar">` and the controller-level `_selectedId` / `_selectedKind` / `_labelInputTimer` state. Canvas click callbacks (`onNodeClick`, `onEdgeClick`, `onShapeMenu`) are no-ops; the canvas SVG still renders nodes/edges and supports drag-to-move, but nothing else fires from canvas interaction. The keyboard Delete/Backspace shortcut is gone (use the `×` buttons).
- **Header hint updated.** "Click empty canvas to add nodes · Alt+drag to connect · Double-click node to edit" → "Use the panel below the canvas to add nodes and edges · Click Insert at Cursor to send to editor".
- **`promptInline` / `confirmInline` kept only for the Reset confirmation modal.** No more `window.prompt` / `window.confirm` paths in the bundle.
- **11 new tests in `tests/flowchart-controller.test.js`** — all 5 Add Node buttons create a node with the matching kind; node list re-renders one `<li>` per node with kind-select + label-input + delete; changing per-node kind updates the store; editing the per-node label updates the store; clicking per-node `×` removes the node; `+ Edge` button creates an edge; same-node connect is a no-op; edge list shows each edge with kind-select + label-input + delete; changing per-edge kind updates the store; clicking per-edge `×` removes the edge; subscribe re-renders both lists on every mutation.

## Version 4.10.0 (2026-09-15)

### Feat

- **Standalone Flowchart Generator window: visible selection toolbar inside the canvas panel.** Even after the v4.9.9 inline-modal fix, the user kept reporting "no fix still" because hidden right-click context menus and `window.prompt` calls remain unreliable in Electron renderer contexts. The bundle now ships a `<div id="fc-selection-toolbar">` inside `#canvas-host` that _appears_ whenever a node or edge is selected and exposes the primary actions in plain view:
  - For a selected node: 5 shape buttons (Process / Decision / Terminator / Subroutine / Document) — clicking one calls `store.setNodeKind(id, kind)` and re-renders. The active shape is highlighted.
  - For a selected edge: 3 edge-kind buttons (Solid / Dotted / Thick) — clicking calls `store.setEdgeKind(id, kind)`.
  - Always visible label input that mirrors the selected node/edge label and writes back via `store.setNodeLabel` / `store.setEdgeLabel` with a 100ms debounce.
  - Red Delete button that calls `store.removeNode` / `store.disconnect` and collapses the toolbar.
- **Console-log diagnostics on every canvas event.** Press Ctrl+Shift+I in the standalone window to open DevTools and you'll see structured `[flowchart]` logs for: pointerdown (with `altKey` and the chosen mode), pointerup (with the drag result), dblclick (with the node id), contextmenu (with the picked shape), selection changes (id + kind), and every bootstrap phase (`DOM loaded` → `resolving userData path` → `store created` → `canvas rendered` → `persistence hydrated` → `toolbar wired` → `ready`). Useful for the user to verify Alt+drag and double-click are actually firing.
- **Preview-render pane shows an info card explaining the layout.** Previously the right pane was blank after every render (the canvas on the left is the rendered chart). Now it shows: "Visual chart is rendered on the left canvas panel. Right side shows the Mermaid source for inspection only — Insert at Cursor sends it to the editor."
- **`promptInline` / `confirmInline` kept as advanced fallback.** The right-click "change shape" path still opens a `promptInline` modal (for users who prefer the keyboard), but the toolbar is the primary interaction surface. Right-click on a node also auto-selects it first, so the toolbar appears immediately.
- **Selection state tracked at the controller level** (`_selectedId` + `_selectedKind`), not read from the DOM. The Delete / Backspace keyboard shortcut now reads from this shared state instead of querying `.flowchart-node.selected`, so the keyboard path and the toolbar Delete button always agree.
- **6 new tests in `tests/flowchart-controller.test.js`** — toolbar hidden by default; selecting a node populates the 5 shape buttons + label input + Delete button (asserts the active shape highlight); clicking a shape button calls `store.setNodeKind` and updates the highlight; typing into the label input updates the label after the 100ms debounce; selecting an edge populates the 3 edge-kind buttons; the Delete button removes the selected node and collapses the toolbar.

## Version 4.9.9 (2026-09-15)

### Fix

- **Standalone Flowchart Generator window: replaced broken `window.prompt` / `window.confirm` with an inline DOM-modal dialog.** Electron renderer contexts (the BrowserWindow hosting the standalone window) return `undefined` when `window.prompt(...)` or `window.confirm(...)` is called — meaning every shape menu, edge-kind change, edge-label edit, and reset confirmation silently did nothing. The bundle now ships two helpers (`promptInline`, `confirmInline`) that build a small overlay with a styled title, message, OK / Cancel buttons, and Enter / Escape / backdrop-click handling. The four call sites (`onEdgeClick` for kind + label, `onShapeMenu`, and the Reset click handler) are now `async` and await the helpers.
- New `window.FlowchartModals = { promptInline, confirmInline }` export on the bundle so jsdom tests can drive the modals directly without rebuilding the IIFE.
- 6 new tests in `tests/flowchart-controller.test.js` — OK / Cancel / Escape resolution paths for `promptInline`, OK / Cancel for `confirmInline`, and the `danger` flag renders a red "Delete" primary button.

## Version 4.9.8 (2026-09-15)

### Fix

- **Standalone Flowchart Generator window: bundled pure modules into a single script.** Even after the v4.9.7 `window.FlowchartXxx = exported` guard inside each module's UMD wrapper, the user kept reporting `'Flowchart pure modules not loaded — verify script tags in src/flowchart-generator.html'` in the standalone window's status bar. Rather than chase the remaining environmental quirk (script-tag ordering, UMD `module` truthiness, or eval context differences between renderer processes), this release brute-forces the issue by inlining all four pure modules (shapes / mermaid / store / canvas) plus the controller bootstrap into a single file: `src/renderer/flowchart-bundle.js`.
  - New `src/renderer/flowchart-bundle.js` — one IIFE, ~720 lines. Sets `window.FlowchartShapes`, `window.FlowchartMermaid`, `window.FlowchartStore`, `window.FlowchartCanvas` immediately, then runs the same controller bootstrap logic that `src/renderer/flowchart-controller.js` exposes.
  - `src/flowchart-generator.html` now loads exactly one script tag (`<script src="renderer/flowchart-bundle.js"></script>`) instead of five. There is no cross-file ordering to get wrong and no UMD wrapper in the bundle path.
  - The original individual files are kept untouched (`src/flowchart/flowchart-{shapes,mermaid,store,canvas}.js` and `src/renderer/flowchart-controller.js`). The legacy sidebar panel in `src/renderer.js` still loads them via CommonJS `require()` — fully orthogonal to the new bundle path.
  - Internal name changes inside the bundle (e.g. `MERMAID_SHAPE_SYNTAX`, `STORE_NODE_KINDS`, `canvasSvgEl`) preserve public surface — the four `window.FlowchartXxx` exports match the v4.9.6 / v4.9.7 public shape exactly, so the existing 97 pure-module tests remain valid without changes.

## Version 4.9.7 (2026-09-14)

### Fix

- **Standalone Flowchart Generator window now loads (was: 'modules not loaded' fatal error).** Each of the four pure modules (`flowchart-shapes.js`, `flowchart-mermaid.js`, `flowchart-store.js`, `flowchart-canvas.js`) ships with a UMD wrapper. The original wrapper assigned `window.FlowchartXxx` only in the `else` branch — i.e. when `module` was undefined. But the renderer runs with `nodeIntegration: true`, so `module` is always truthy in that environment and the `else` branch never ran, leaving `window.FlowchartShapes` / `window.FlowchartMermaid` / `window.FlowchartStore` / `window.FlowchartCanvas` undefined. The standalone window's controller (`src/renderer/flowchart-controller.js`) then aborted with `fatal('Flowchart pure modules not loaded — verify script tags in src/flowchart-generator.html')`.
  - Fix: every pure module's UMD wrapper now has a second `if (typeof window !== 'undefined') { window.FlowchartXxx = exported; }` block appended AFTER the CommonJS branch. Both branches can run (the CommonJS branch keeps the legacy sidebar panel working under `require()`; the new branch unconditionally exposes the global in the renderer). The factory IIFE is unchanged, so the public surface of every module is identical to v4.9.6 — no behavioural change.
  - New regression guard: 4 source-grep tests in `tests/flowchart-controller.test.js` assert each module's source file contains the `window.FlowchartXxx = exported` assignment so a future refactor can't silently drop the global again.

## Version 4.9.6 (2026-09-14)

### Refactor

- **Flowchart editor is now a standalone window, not a sidebar panel.** Five fix rounds (v4.9.1 → v4.9.5) couldn't make the sidebar panel feel right — at 280 px sidebar with the canvas + preview split to ~175 px each, plus the editor-container hiding dance the maximize/restore toggle required, the panel kept presenting as cramped and unreliable at runtime. Strategy pivot: the flowchart editor now lives in its own BrowserWindow, matching the ASCII Art Generator pattern (`src/ascii-generator.html` + `src/renderer/ascii-controller.js`).
  - New `src/flowchart-generator.html` — standalone HTML with its own header, toolbar (Insert at Cursor / Reset), canvas host, and preview host (text-only — the canvas on the left IS the visual preview). All stylesheet `href`s are `src/`-relative — no `../` escape (lesson learned from v4.9.2). Forced light surface (`background: #fafafa !important; color: #1f2328 !important`) on the canvas + preview regardless of the project's body theme, mirroring the v4.9.5 CSS fix that traded theme consistency for guaranteed visibility.
  - New `src/renderer/flowchart-controller.js` — pure browser IIFE. Wires the canvas + preview, hydrates from `<userData>/flowchart-session.json` once on mount, persists on every store mutation with a 500 ms debounce. Insert at Cursor wraps the generated `flowchart TD` source in a fenced ` ```mermaid ` block and sends it through the existing `insert-content` IPC channel — same one the renderer.js sidebar panel used. Keyboard shortcuts (Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Delete / Backspace) handled at document level.
  - New `openFlowchartGenerator()` in `src/main.js` — `BrowserWindow` (1100×720, parent: mainWindow, `contextIsolation: true, nodeIntegration: false`) launched by an `ipcMain.on('open-flowchart-generator')` listener. Tools menu now has a "Flowchart Generator" entry with accelerator `CmdOrCtrl+Alt+F`.
  - New `window.electronAPI.flowchart.*` namespace in `src/preload.js` — `getUserDataPath` / `readFile` / `writeFile` / `insertAtCursor`. Reuses the existing thin IPC handlers (`get-user-data-path`, `read-text-file`, `write-text-file`) which already sandbox writes to `<userData>`.
  - The four pure modules (`flowchart-shapes.js`, `flowchart-mermaid.js`, `flowchart-store.js`, `flowchart-canvas.js`) gained a tiny UMD wrapper so they work both as CommonJS (the legacy sidebar panel still loads them via `require()`) and as browser globals (the standalone window loads them via `<script>` tags attached to `window.FlowchartShapes`, etc.). The CommonJS shape is preserved — no behavioural change to the 73 flowchart unit tests in `tests/flowchart-*.test.js`.

### Cleanup

- **Sidebar Flow Chart panel registration disabled** in `src/renderer.js` — the `sidebarManager.registerPanel('flowchart', …)` call and the matching `commandPalette.register('Toggle Sidebar: Flow Chart', …)` entry are now both commented out. The legacy panel implementation (`src/sidebar/flowchart-panel.js`) and its unit tests (`tests/flowchart-panel.test.js`) are kept untouched for rollback — re-enabling is a one-step uncomment in `src/renderer.js`. The unused `flowchartIO` helper that the panel needed was also removed.

### Tests

- New `tests/flowchart-controller.test.js` (10 tests) — verifies the standalone window's HTML doesn't `../`-escape any stylesheet, `bootstrap()` resolves `getUserDataPath` exactly once on mount, reads `<userData>/flowchart-session.json` on mount, hydrates the store from a saved session, wraps Insert-at-Cursor output in a `mermaid` fenced block, Reset clears nodes/edges (with confirm) and persists the empty graph (without confirm). Two regression tests assert that `src/renderer.js` no longer contains a live `sidebarManager.registerPanel('flowchart', …)` call or a live `commandPalette.register('Toggle Sidebar: Flow Chart', …)` entry.

## Version 4.9.5 (2026-09-14)

### Fixes

- **Flowchart Panel — rendered Mermaid SVG invisible at runtime**: v4.9.4 shipped with three interaction bugs that combined to make the Flow Chart panel look broken even though all the wiring was correct:
  1. **Render target had zero height.** `.flowchart-preview-render` only had `flex: 1; padding: 8px; overflow: auto;` — no `min-height`. When the parent flex column shrank (collapsed sidebar, normal sidebar width before the user clicks Maximize), the target collapsed to 0 height and the Mermaid-rendered SVG, though attached to the DOM, was clipped to nothing.
  2. **Dark-on-dark surfaces.** The canvas host and preview host inherited the project's `body.theme-concreteinfo` dark theme. Mermaid's `dark` theme was selected automatically in `src/renderer.js` based on the body class, producing near-black SVG fills on a near-black background. Node labels "Node" were barely legible.
  3. **Selection highlight invisible.** `.flowchart-node.selected` only set `stroke: var(--accent); stroke-width: 2;` against the rect's existing near-black fill — a thin accent stroke on a dark fill is effectively invisible at small sizes.

  Fix in three places:
  - `src/styles-sidebar.css` — gave `.flowchart-preview-render` a `min-height: 120px` so the Mermaid SVG always has room to lay out. Added a `!important` light background (`#fafafa` / `#1f2328` text) to `.flowchart-canvas-host` and `.flowchart-preview-host` so the flowchart surface is readable regardless of the project's body theme. Forced explicit fills and strokes on `.flowchart-node rect` / `.flowchart-node polygon` / `.flowchart-node text` / `.flowchart-edge` (white fill, dark stroke, dark text). Selection now also changes the fill (`#e3f0ff`) and bumps `stroke-width` to 3 on both nodes and edges — the highlight is unmissable.
  - `src/renderer.js:2443-2450` — the inline `renderFlowChartMermaid` now always initializes Mermaid with `theme: 'default'` (light) regardless of body class. Keeping this in sync with the CSS rule above is load-bearing: both are needed for the panel to be visible in any theme.

- **Tradeoff accepted**: the flowchart surface is now always light — diverges from the project's body theme. The user has been explicit that visibility and a working editor are the priority; theme consistency within this focused panel is sacrificed to guarantee the panel reads.

### Tests

- `tests/flowchart-panel.test.js` — new `describe('flowchart-panel: render target sizing (v4.9.5 regression)')` block (3 tests) reading the shipped CSS to assert: (a) `.flowchart-preview-render` has a non-zero `min-height`, (b) `.flowchart-canvas-host` / `.flowchart-preview-host` carry a forced background declaration with `!important`, (c) `.flowchart-node.selected rect/polygon` carry an explicit fill and `stroke-width >= 3`. Reading the stylesheet directly mirrors what the runtime loads via `<link rel="stylesheet">` and sidesteps jsdom's incomplete layout engine.

## Version 4.9.4 (2026-09-14)

### Fixes

- **Flowchart Panel — selection was invisible**: clicking a node or edge updated the canvas's internal `selectedNodeId` / `selectedEdgeId` but never repainted, so the `.flowchart-node.selected` / `.flowchart-edge.selected` CSS highlight only appeared when the user actually dragged (which triggers `store.subscribe` → `render()`). A bare click left the canvas looking unchanged, and the panel's own `selectedNodeId` (used by the panel-scoped Delete/Backspace shortcut) stayed `null`, so Delete on a freshly-clicked node silently no-op'd. Wired `opts.onNodeClick(id)` end-to-end:
  - `src/flowchart/flowchart-canvas.js` — added an `opts.onNodeClick` callback parallel to the existing `opts.onEdgeClick`; on click, both branches now call a new surgical `applySelectionHighlight()` that toggles the `.selected` class on the existing `<g data-node-id>` / `<line data-edge-id>` elements without going through `render()` (which would detach the very element the user's pointer is still on, breaking `pointermove`/`pointerup` bubbling during a drag).
  - `src/sidebar/flowchart-panel.js` — the panel's `onNodeClick` handler mirrors the id into the panel's `selectedNodeId` (clearing `selectedEdgeId`) so Delete/Backspace routes correctly. Same symmetry was already in place for `onEdgeClick`.
- **Flowchart Panel — narrow sidebar cramped the canvas + preview**: the panel lives in the 280 px sidebar, which split the canvas vs. preview to ~175 px each — too tight to edit a flowchart. Added a "Maximize / Restore" button to the panel toolbar (between the status text and the right edge). Clicking it toggles a `flowchart-takeover` class on `.main-content`:
  - `src/styles-sidebar.css` — new `.main-content.flowchart-takeover` rules hide `.editor-container` (`display: none`) and let `.sidebar` / `.sidebar-panel` grow with `flex: 1` so the canvas + preview split the full window width instead of the 280 px sidebar.
  - The button label flips between "Maximize" and "Restore", `aria-label` and `title` update, and the button gets an `.active` highlight while takeover is on. `destroy()` clears the class so leaving the panel doesn't leave the editor hidden for the rest of the session.
  - The class lookup walks up from the panel container to the nearest `.main-content` ancestor (with a `document.querySelector('.main-content')` fallback) so the panel doesn't need to know whether the sidebar lives inside `#sidebar` or any future container.

### Tests

- `tests/flowchart-panel.test.js` — added two new `describe` blocks (8 tests total):
  - "selection wiring (canvas click → panel state + SVG class)": clicking a node applies `.selected` to the matching `<g>`, clicking a second node moves `.selected` from the first to the second, clicking an edge applies `.selected` to the matching `<line>`, and a regression test verifying Delete removes a freshly-clicked node (was broken in v4.9.3 because the panel's `selectedNodeId` was never updated by canvas clicks).
  - "maximize / takeover": the maximize button is exposed in the toolbar, clicking it toggles `.flowchart-takeover` on `.main-content` and flips the button label/active class, and `destroy()` clears the class so the editor stays usable.
- New `mountWithMainContent()` helper wraps the panel container in a fake `.main-content` (mirroring the real DOM layout in `src/index.html:2341`) so the takeover's class-toggling is observable from the test.

## Version 4.9.3 (2026-09-14)

### Fixes

- **Flowchart Panel — preview pane accumulated raw Mermaid source**: when the user fired several `addNode` mutations within the 250 ms preview debounce, `mermaid.run({ nodes: [div] })` is async, so the previous render's `<div class="mermaid">` (still carrying the source text) was sitting in `.flowchart-preview-render` when the next render cleared the target. The first render's eventual `element.innerHTML = svg` landed on a detached node, but the visible preview pane had a stack of stale `<div class="mermaid">` elements. Fixed in `src/renderer.js:2423-2449`: switched the inline `renderFlowChartMermaid` to `replaceChildren()` (more idiomatic than `innerHTML = ''`) and added a per-target `WeakSet` in-flight tracker that keeps the previous render's closure from racing the new render — its eventual `element.innerHTML = svg` is harmless on a detached node, and the new render always starts from a clean slate.

### Tests

- `tests/flowchart-panel.test.js` — added a second regression test (`preview-source pre never duplicates across debounced mutations even with in-flight mermaid.render`) that fires 7 mutations at 10 ms intervals (well inside the 250 ms debounce), uses a `renderMermaid` mock that mirrors the real mermaid.run closure (captures the input div, asynchronously sets `innerHTML = svg` on it regardless of DOM connection), and asserts the `<pre>` contains exactly one copy of the latest source and the render target holds exactly one `<div class="mermaid">` child whose first element child is the latest `<svg>`.

## Version 4.9.2 (2026-09-14)

### Fixes

- **Standalone ASCII Art Generator — broken stylesheet path**: `src/ascii-generator.html:7` linked `<link rel="stylesheet" href="../fonts.css" />`. The HTML loads via `BrowserWindow.loadFile(path.join(__dirname, 'ascii-generator.html'))` where `__dirname` is `src/`, so `../fonts.css` escaped the `src/` directory and resolved to a non-existent `<project>/fonts.css`. Changed to `fonts.css` (same file, src/-relative — mirrors `src/index.html:29`). The window rendered without its font rules, leaving the header in the fallback system stack.
- **Standalone ASCII Art Generator — dead Box/Templates UI**: the controller (`src/renderer/ascii-controller.js`) shipped three mode tabs (`Text Banner` / `Box-Frame` / `Templates`), 18 `.template-btn[data-template]` buttons, and a Box form (`#box-text` / `#box-style` / `#box-padding`) but wired none of them. Clicking any tab or button was a no-op. Wired all of them:
  - `setMode(mode)` toggles `.active` on the right `.mode-tab` and the matching `.mode-section` (`text-mode` / `box-mode` / `templates-mode`).
  - Template buttons call `api.generate({ text: '', font: 'template:<id>' })` so the orchestrator owns template content; preview updates and the button gets `.active`.
  - Box mode renders the user text with a border using the chosen style (`single` / `double` / `rounded` / `bold` / `ascii`) and padding, exposed as a pure `window.ASCIIBoxRenderer.renderBox(text, style, padding)` helper.
  - All 11 brief-required behaviours (text-input / font-picker / font-search / insert / copy / save / generate, last-font persistence, debounced preview) remain intact.

### Tests

- New `tests/ascii-controller.test.js` — 6 tests covering the stylesheet path (no `..` escape), pure box renderer (single + ascii styles), mode-tab switching (Box and Templates), and template button → preview wiring.

## Version 4.9.1 (2026-09-14)

### Fixes

- **Flowchart Panel save failed**: `getUserDataPath()` IPC was not awaited in `src/renderer.js:2439-2449`, so the persistence path was computed as `"[object Promise]/flowchart-session.json"` and rejected by the `write-text-file` userData sandbox. Pre-resolved the path on panel register and cached it; persistence (read and write) now works correctly.

## Version 4.9.0 (2026-09-14)

### New: Visual Flow Chart Editor (Sidebar panel → "Flow Chart")

- Pure `flowchart-store.js` — graph data store with bounded undo/redo (depth 50)
  and injectable persistence IO (testable without touching the filesystem)
- 5 node shapes (process, decision, terminator, subroutine, document) × 3 edge
  kinds (solid, dotted, thick) with full keyboard accessibility
- Hand-rolled SVG canvas: drag nodes, double-click to edit labels, Alt+drag from
  a node edge to wire connections, in-place label editing, delete + backspace
  to remove the selection
- `flowchart-shapes.js` — pure SVG path templates (no DOM, fully unit-tested)
- `flowchart-mermaid.js` — translates the graph to Mermaid `flowchart TD` source
  that renders identically in the preview pane
- Sidebar panel `src/sidebar/flowchart-panel.js` with debounced preview (250 ms),
  debounced persistence (500 ms), and Ctrl+Z / Ctrl+Shift+Z / Delete / Backspace
  shortcuts
- 3 thin IPC channels (`get-user-data-path`, `read-text-file`, `write-text-file`)
  sandboxed to `app.getPath('userData')` via path validation
- Auto-save to `<userData>/flowchart-session.json`; restores on reopen
- Rail button in the sidebar; toggle the panel with `Ctrl+Alt+F`
- Insert-at-Cursor wraps the generated Mermaid in a fenced ` ```mermaid ` block
  at the current cursor position in the active editor tab
- 73 new tests

### New: ASCII Art Generator upgrade

- Pure `AsciiArt` orchestrator (`generate / listFonts / getFontMeta`) unifying
  hand-coded fonts + figlet + 19 named templates behind one API
- 17 hand-coded font tables extracted from inline renderer code (5 existing +
  12 new: Big, Small, Lean, Slant, Isometric1-4, 3-D, 3x5, ANSI Shadow, Calvin S)
- 19 named ASCII templates (arrows, flowcharts, banners, frames)
- `figlet@^1.8.0` dep with lazy-load + cache adapter (≥328 bundled fonts; pure
  JS, no native bindings)
- 6 IPC handlers: `ascii:generate / list-fonts / get-font-meta / save / copy /
last-font`
- Standalone window rewrite: removed the ~385-line inline script; added a
  searchable font picker, Copy to Clipboard, and Save to File
- Major cleanup: -1029 net lines of dead code (the in-app modal
  `#ascii-art-dialog`, the 800-line renderer controller, the
  `show-ascii-generator*` preload channels, and the obsolete
  `textToASCII`/`createASCIIBox`/etc. helpers)
- 97 new tests

### New: Editor Theme Registry (extension)

- 12 new themes added: Catppuccin Latte / Frappé / Macchiato / Mocha, One Light,
  Tokyo Night Storm, Synthwave '84, Outrun, Winter is Coming (Light + Dark),
  Solarized Dark High Contrast, Spring Light
- Total: 37 themes (15 light + 22 dark incl. 1 high-contrast), sorted into
  Light / Dark / High-Contrast tables in the README
- Pure `ThemeRegistry` module; the View menu generator now reads
  `list() + categories()`; new per-theme CSS files live at
  `src/styles/themes/<id>.css`
- `<link disabled>` preload + `<link>` toggle pattern (sub-millisecond theme
  switch — no flash, no re-fetch)
- Aria-friendly: the high-contrast option is announced to assistive tech

### Bug fixes

- Plan 3: rail button tooltip `Ctrl+Alt+F` now actually wired (the shortcut
  existed but the panel toggle was missing)
- Plan 3: `destroy()` cleanup on panel unmount — timers, listeners, and the
  store subscription are all released (no leaks when toggling repeatedly)
- Plan 2: standalone window `<script src>` path corrected (was escaping `src/`)
- Plan 2: font substitutions reverted — `Isometric1-4` and `Calvin S` are
  actually restored from figlet's bundled fonts

### Housekeeping

- 1093 tests passing across 36 snapshots in 90 suites
- Lint + Prettier clean across all 3 plans
- Linux build verified end-to-end (AppImage + deb + snap produced)

---

## Version 4.7.1 (2026-09-05)

### New: Export Themes (Word + PDF)

- Theme picker in the export dialog (basic and advanced mode) for PDF and DOCX:
  **Default (Pandoc), Modern, Classic, Sepia, Minimal, Elegant**
- PDF: LaTeX header recolors/reformats headings + links (xcolor/titlesec,
  core-TeX packages only); DOCX: styles.xml surgery recolors Heading1-6/Title/
  Subtitle/Hyperlink and swaps heading/body fonts
- Themes persist in export presets; unknown ids in old presets fall back to
  Default instead of failing the export

### Branding

- New M↓ brand identity: app icons, favicons, tray icon, welcome mark,
  README wordmark (vector kit in assets/markdown-converter-assets/)

### Fixes

- **Windows**: pdfjs text/image extraction failed on Windows —
  standardFontDataUrl is now a proper file:// URL (raw backslash paths
  failed pdfjs's trailing-slash URL validation)
- **Windows**: sharp temp-file cleanup (EPERM retry), path-separator test
  assertions, and pdfjs test timeouts fixed — the Windows CI job is green
- FiraCode tooling downloads pinned to the immutable 6.2 release;
  .gitattributes stops CRLF checkout rewriting hash-pinned files
- macOS pandoc extractor locates the binary in the archive (layout changed)
- Packaged apps resolve bundled pandoc/markitdown next to the executable
  (resourcesPath lookup was wrong since 4.5 — packaged builds silently used
  system pandoc)

---

## Version 4.7.0 (2026-09-05)

### Bundling & Legal Compliance

- **MarkItDown is now bundled**: `npm run bundle:markitdown` freezes Microsoft's
  markitdown (MIT) + embedded Python runtime into a single ~75MB per-platform
  binary (`bin/<platform>/markitdown`) via PyInstaller (ML extras excluded);
  the app prefers the bundled binary and falls back to system installs
- Packaging copies the bundled markitdown for Windows/macOS/Linux alongside Pandoc
- **THIRD-PARTY-NOTICES.md** — full license inventory of everything distributed
  (bundled binaries, npm runtime deps, fonts, embedded Python packages)
- **SOURCES.md** — GPL §3(b) written source offer for Pandoc / FFmpeg (GPL build) /
  PyInstaller bootloader, with pinned versions + SHA-256; LGPL relinking note for libvips
- **third-party-licenses/** — canonical texts: GPL-2.0, LGPL-2.1, MPL-2.0,
  Apache-2.0, OFL-1.1, PSF-Python
- **Help → Third-Party Notices & Licenses** — in-app viewer for both documents
- **download-tools.js** now SHA-256 pins and verifies every downloaded artifact
  (post-download and against the cache on every run; hard-fails on mismatch)
- README gains a "Bundled Dependencies, Legal Notices & Credits" section
- Large optional tools intentionally NOT bundled (documented): LibreOffice,
  MiKTeX/TeX Live, ImageMagick, PlantUML+JRE, Calibre

---

## Version 4.6.1 (2026-09-05)

### New Features

- **MarkItDown import** — "File → Import with MarkItDown (Any Format)…" embeds
  Microsoft's [markitdown](https://github.com/microsoft/markitdown) (MIT) as an
  any-file → Markdown path: PDF, DOCX, PPTX, XLSX, Outlook .msg/.eml, EPUB,
  images, CSV/JSON/XML, ZIP; audio transcription and OCR with the `[all]` extras
  - Command auto-resolution: `markitdown` binary, then `python -m markitdown` /
    `python3 -m markitdown` (probed once, cached)
  - Same SEC-1 argv discipline as Pandoc (execFile only, paths never through a shell),
    50MB input cap, 120s timeout, path-sanitized errors that surface markitdown's
    actionable `pip install 'markitdown[...]'` hints
  - Output written next to the source as `<name>.md` (numeric suffix instead of
    overwriting) and opened in a new tab; `markitdown:available` / `markitdown:convert`
    IPC for future renderer flows
- **AI Assistant: Anthropic-compatible provider** — any base URL speaking the
  Anthropic messages schema (LiteLLM proxies, Bedrock gateways, local servers);
  x-api-key + Bearer auth, keyless proxies supported, tolerates bases with or
  without a trailing `/v1`

### Bug Fixes

- File → Open PDF crashed the PDF editor (null operation matched no section; now
  defaults to Merge)
- Backlinks panel required the wrong module path (failed at registration)
- writing-studio engines/panels now await their IPC-backed settings/file backends
  (eliminates `JSON.parse("[object Promise]")` crashes)
- Manuscript panel's window.prompt (unsupported in Electron) replaced with an
  inline dialog; collaboration comment store made async to match its IO

---

## Version 4.6.0 (2026-09-05)

### New Features

#### AI Assistant Plugin (multi-provider)

- Chat sidebar panel with rolling conversation history and insert-reply-into-document
- Providers: OpenAI, Anthropic, Ollama, LM Studio, and any OpenAI-compatible endpoint
- All provider traffic proxied through the main process — API keys never enter the renderer and the CSP stays closed to AI endpoints
- Commands: AI Summarize / Improve / Explain / Translate selection
- Answers the writing-studio `ai:analyze` contract, finally enabling the Proofread panel

#### Collaboration Plugin (inline comments)

- Anchor-based comments stored in `.comments/` sidecar files (never exported, never committed)
- Comments sidebar panel: add at cursor, list, resolve, delete, jump to anchor
- Drift detection flags moved/edited anchors; F8 navigates to the next open comment

#### Local Knowledge Base (wiki-links + backlinks)

- `[[Note]]`, `[[Note|alias]]`, `[[Note#section]]` render as links in the preview (code blocks excluded)
- Clicking a wiki-link opens the note or offers to create it
- Backlinks sidebar panel scans the folder (bounded BFS) for documents linking to the current one

#### Crash Recovery / Session Restore

- Open tabs (paths + unsaved buffer content) snapshotted to localStorage, debounced on edits, on tab changes, on unload, and once a minute
- Restore prompt on launch with per-tab restore, clean-fresh option, and 2MB content budget

#### Document Version History

- Every save snapshots the previous on-disk content to `<userData>/versions/`
- History sidebar panel: list, restore (with safety snapshot), unified diff vs. current, delete, manual "save version now"
- Per-document pruning (20 versions), path-hash storage, id-validated reads

#### Editor

- Vim keybindings (View → Vim Mode, persisted, live toggle via CodeMirror Compartment)
- Snippet Tab-expansion: type a snippet name and press Tab to insert it
- Zen Mode word-goal setter (the HUD progress bar finally has UI)

#### Export / Conversion

- **Real PDF encryption**: pdf-lib swapped for @cantoo/pdf-lib — encrypt/decrypt/permissions now actually work (UI auto-enables via the capability probe)
- **XLSX export**: markdown tables → native Excel workbook, one sheet per table (no Pandoc needed)
- **ODT headers/footers + page size**: real ODF styles.xml patching replaces the empty stub
- **Local PlantUML rendering**: diagrams render on-machine via the `plantuml` CLI when installed; plantuml.com stays as fallback
- **KaTeX bundled locally** (CSS + fonts): math renders offline, no CDN calls
- Writing heatmap (GitHub-style 30-day grid) in the writing-studio Goals panel

#### Platform

- Quick Note global scratchpad (Ctrl+Alt+Q, works when unfocused; appends to `notes/quick-notes.md`)
- Deep link protocol `markdownconverter://open?path=…`
- REPL confirmation dialog before first code execution per language per session (unsandboxed-execution guard rail)
- Writing-studio's four sidebar panels (Manuscript/Goals/Snapshots/Proofread) are now actually wired with rail icons
- Plugin sidebar panels get automatic rail icons via `registerPanel({icon})`

### Bug Fixes

- `Ctrl+Shift+P` collision: PDF (Enhanced) export now `Ctrl+Alt+Shift+P`; Command Palette keeps `Ctrl+Shift+P`
- Universal Converter's Pandoc tool no longer always reports "not installed" (`checkConverterAvailable` gained a pandoc case with bundled-binary check)
- CLI headless export: removed dangling `--css` / `--reference-doc` flags that made pandoc exit with an error; `--self-contained` replaced with `--standalone` (Pandoc 3.x)
- Removed dead "Open Export Options Dialog…" button from the converter dialog
- Removed duplicate `styles-zen.css` include

### Security

- AI provider requests carry size caps (200KB prompt), timeouts (120s), and user-safe error surfaces
- Version-history reads validate ids against traversal; history listing requires a valid document path
- PlantUML local rendering removes the diagram-text exfiltration path when a local CLI exists (CVE-MC-007 follow-up)

### Tests

- New suites: OdtStyling, AiProviders, ai-assistant prompts, collaboration comment-store, wiki-links/backlinks, session-store, XlsxExporter, VersionHistory
- PDFOperations encryption tests rewritten for the real-encryption reality

---

## Version 4.0.0 (2026-03-04)

### Major Changes

- **CodeMirror 6 Editor** — Replaced textarea with CodeMirror 6 featuring syntax highlighting, code folding, bracket matching, multiple cursors, and auto-indent
- **Sidebar Panel System** — Collapsible sidebar with File Explorer, Git, Snippets, and Templates panels
- **Command Palette** — Ctrl+Shift+P to search and execute all app actions
- **Code Execution (REPL)** — Run JavaScript, Python, and Bash code blocks directly from the preview

### New Features

- Print Preview dialog with paper size, orientation, margins, scale, and page range controls
- Image paste from clipboard and drag-drop support with auto-save to assets folder
- Document templates library (10 templates: blog post, meeting notes, tech spec, changelog, README, project plan, API docs, tutorial, release notes, comparison)
- Markdown extensions: footnotes, admonitions (note/warning/tip/danger/info), and [[toc]] table of contents
- PlantUML diagram rendering alongside Mermaid
- Welcome tab with onboarding and "What's New" feature showcase
- System spell checking with context menu suggestions and dictionary support
- Enhanced status bar with word count, character count, line/column, encoding, and language mode
- Grouped toolbar with visual section separators
- Breadcrumb bar showing current file path

### New Export/Import Formats

- Reveal.js slides (.html)
- Beamer slides (.pdf)
- Confluence/Jira wiki markup (.txt)
- MOBI e-books (via Calibre)
- Developer formats: JSON, YAML, XML, TOML

### Security

- Content Security Policy (CSP) meta tag
- File size validation (50MB limit)
- Error message sanitization (stripped file paths)
- Conversion rate limiting (2-second debounce)

### Dependencies Updated

- marked: 16.x to 17.x (with marked-highlight extension)
- pdfjs-dist: 3.x to 5.x (new worker model)
- html2pdf.js: 0.10 to 0.14
- pdfkit: 0.14 to 0.17
- dompurify, docx, and others updated to latest

### Testing

- 80 tests across 7 test suites
- New tests for sidebar manager, command palette, print preview, markdown extensions, and utility functions

### Breaking Changes

- Editor is now CodeMirror 6 (replaces textarea)
- marked API changed to use marked.use() instead of marked.setOptions()
- pdfjs-dist upgraded to v5 with new worker model

---

## Version 2.1.0 (December 14, 2025)

### 🎨 UI/UX Improvements

#### Subtle & Small Preview Popout Button

- Redesigned popout button with minimalist aesthetic
- Removed border for cleaner appearance
- Reduced size: 11px font, 2px×6px padding (previously 14px font, 4px×8px padding)
- Added opacity transition: 50% when idle, 100% on hover
- Subtle background effect on hover instead of heavy border styling
- **File**: `src/styles.css:195-211`

#### Simplified Table Headers in Preview

- Removed gradient background from table headers in modern theme
- Changed from `var(--primary-gradient)` (purple gradient) to simple light gray (#f0f0f0)
- Updated text color to dark (#333333) for better readability
- Clean, professional appearance matching standard themes
- **File**: `src/styles-modern.css:445-449`

### 📥 Enhanced Import Capabilities

#### Comprehensive Format-to-Markdown Conversion

Dramatically expanded the "Import Document" feature to support 30+ file formats:

**Supported Formats:**

- **Documents**: DOCX, ODT, RTF, HTML, HTM, TEX, EPUB, PDF, TXT
- **Presentations**: PPTX, ODP
- **Markup Languages**: RST, Textile, MediaWiki, Org-mode, AsciiDoc, TWiki, OPML
- **E-book Formats**: EPUB, FB2
- **LaTeX Formats**: TEX, LATEX, LTX
- **Web Formats**: HTML, HTM, XHTML
- **Wiki Formats**: MediaWiki, DokuWiki, TikiWiki, TWiki
- **Data Formats**: CSV, TSV, JSON

**Format-Specific Optimizations:**

- PDF text extraction with XeLaTeX engine
- CSV/TSV automatic table conversion
- JSON structure handling
- Improved error messages with format hints

**Access**: File → Import Document (Ctrl+I)
**File**: `src/main.js:1933-1994`

### 🎨 Exhaustive ASCII Art Generator

#### 5 New Text Banner Styles

Complete alphabet (A-Z) and numbers (0-9) support for all styles:

1. **Standard** - Classic ASCII art with slashes and underscores
2. **Banner** - Large format using # characters (7-line height)
3. **Block** - Modern Unicode block characters (█ ╔ ╗ ═ ║)
4. **Bubble** - Circular bubble letters (Ⓐ Ⓑ Ⓒ)
5. **Digital** - Digital display style (▄ ▀ ▐ ▌)

**File**: `src/renderer.js:3397-3537`

#### 19 Professional ASCII Templates

Organized into 4 categories with expanded options:

**Arrows & Flow (4 templates):**

- Arrow Right - Horizontal flow indicators
- Arrow Down - Vertical flow indicators
- Decision - Binary decision diagrams
- Process Flow - Multi-step process visualization

**Diagrams & Charts (6 templates):**

- Flowchart - Advanced flowchart with decision branches and loops
- Sequence - Sequence diagrams for User-System-Database interactions
- Network - Server-client network topology
- Hierarchy - Organizational tree structures
- Timeline - Milestone visualization with dates
- Table Simple - Basic table template with borders

**Boxes & Containers (4 templates):**

- Header - Section header with decorative borders
- Note Box - Important notes with rounded corners (┏━━┓)
- Warning Box - Warning messages with bold borders (╔═══╗)
- Info Box - Information boxes with subtle styling (╭───╮)

**Decorative Elements (6 templates):**

- Divider - Horizontal section separator (═══)
- Separator Fancy - Elegant rounded divider
- Brackets - Japanese-style brackets 【 】
- Banner Stars - Star-bordered banners
- Checklist - Task lists with ✓ checkmarks
- Progress Bar - Visual progress indicators

**Features:**

- All ASCII art automatically wrapped in code blocks for proper rendering
- Preserved formatting in markdown preview and all export formats
- Categorized template selection interface
- Real-time preview generation

**Access**: Tools → ASCII Art Generator
**Files**: `src/renderer.js:3513-3671`, `src/index.html:427-466`

### 📝 Technical Improvements

- Enhanced ASCII art detection in Word template exporter
- Improved monospace font rendering across all export formats
- Better code block preservation in PDF and Word exports
- Optimized template categorization and organization

### 🔧 Files Modified

- `src/styles.css` - Preview popout button styling
- `src/styles-modern.css` - Table header simplification
- `src/main.js` - Enhanced import function, version update
- `src/renderer.js` - ASCII art generator enhancements
- `src/index.html` - ASCII template UI organization
- `package.json` - Version bump to 2.1.0

---

## Version 2.0.0 (Previous Release)

### Major Features

- Export Profiles - Save and reuse export configurations
- Mermaid.js diagram support
- Command Palette (Ctrl+Shift+P)
- GitHub Light/Dark preview themes
- Table Generator
- ASCII Art Generator (basic)
- Resizable Preview Pane
- Pop-out Preview Window
- Configurable page sizes (A3-A5, B4-B5, Letter, Legal, Tabloid, Custom)
- Custom Headers & Footers for exports
- Enhanced PDF and Word export with templates
- 22 beautiful themes

### Core Capabilities

- Cross-platform markdown editor with live preview
- Universal document conversion (30+ formats)
- PDF Editor (merge, split, compress, rotate, watermark, encrypt)
- Batch file conversion
- File association support
- Advanced export options
- Multi-tab interface

---

## Installation & Usage

### Prerequisites

- **Pandoc** - Required for document conversion
- **Optional**: LibreOffice, ImageMagick, FFmpeg for universal converter

### Download

Get the latest release from: https://github.com/amitwh/pan-converter/releases

### Supported Platforms

- Windows (x64)
- Linux (AppImage, .deb, .snap)
- macOS (planned)

---

## Contributing

Contributions are welcome! Please see [CLAUDE.md](CLAUDE.md) for development guidelines.

**Author**: Amit Haridas (amit.wh@gmail.com)
**License**: MIT
**Repository**: https://github.com/amitwh/pan-converter
