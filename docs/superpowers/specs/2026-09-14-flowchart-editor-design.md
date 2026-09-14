# MarkdownConverter — Flow Chart Editor Design

**Date:** 2026-09-14
**Status:** Draft — pending review
**Author:** Amit Haridas

## Overview

Add a sidebar-panel flow chart editor that lets users build flowcharts visually (drag nodes, connect edges, edit labels in-place) without writing Mermaid syntax by hand. The editor produces Mermaid `flowchart` source, which the existing preview pane already renders natively. Insert at cursor writes a ```` ```mermaid ```` fenced block. The feature is purely renderer-side — no main-process changes needed because Mermaid is already a bundled dependency.

## Goals

1. **Visual node editor.** Click to add nodes (5 shapes: process, decision, terminator, subroutine, document). Drag to move. Double-click to edit label inline. Right-click for shape submenu.
2. **Edge editor.** Drag from node edge handle to another node to connect. Click edge to set type (solid arrow, dotted arrow, thick arrow) and add a label.
3. **Live Mermaid preview.** Right pane of the sidebar panel shows the generated Mermaid source and re-renders the actual SVG on every change (debounced 250 ms). User can copy the source or insert it at the cursor.
4. **Undo / redo.** `Ctrl+Z` / `Ctrl+Shift+Z` within the panel. Snapshot-based, bounded depth (50 steps).
5. **Persistence.** The current flowchart is auto-saved to `<userData>/flowchart-session.json` so reopening the panel restores the user's work.
6. **Comprehensive tests.** Pure-data module (`flowchart-store.js`) and the Mermaid translator (`flowchart-mermaid.js`) are fully unit-tested. The canvas (`flowchart-canvas.js`) is DOM-tested with jsdom pointer events.

## Non-Goals (v1)

- No swimlanes / subgraphs (Mermaid supports them; deferring for v2).
- No collaboration / multi-user editing.
- No export to PNG/SVG (the preview pane already renders; "Save as SVG" is a thin wrapper that can come later).
- No import of existing Mermaid source (parse, validate, place into canvas) — defer to v2.
- No theme sync (the SVG renders in the preview pane, which already respects the active theme).
- No infinite canvas / zoom-pan — fixed viewport sized to the panel.
- No copy/paste of nodes between editor instances.

## Decisions Locked

| Decision | Choice | Reason |
|---|---|---|
| Side location | New sidebar panel `flowchart` | Matches the established `src/sidebar/<name>-panel.js` pattern (`search-panel`, `daily-notes-panel`, `git-panel`) |
| Canvas technology | SVG (no D3, no Konva, no library) | Hand-rolled SVG keeps the bundle small; the canvas is bounded (~100 nodes max); drag/drop is straightforward with pointer events |
| Graph model | Pure data structure (nodes + edges) stored in a single `flowchart-store.js` module | Matches the codebase's "pure module + injectable IO" pattern; trivially testable |
| Node shapes | 5 SVG shape templates per type, sized to text width | Mermaid supports many shapes; 5 covers 95% of real flowcharts |
| Edge routing | Straight lines between node centers (no orthogonal/Manhattan routing) | Simpler; orthogonal routing can come in v2; the visual is still clear |
| Undo/redo | Snapshot stack with bounded depth 50 | Predictable memory; matches editor undo conventions |
| Persistence | Auto-save to `<userData>/flowchart-session.json` on every change (debounced 500 ms) | Survives app restart; user doesn't lose work |
| Mermaid emission | Always `flowchart TD` (top-down) for v1 | Top-down is the most common flowchart direction; horizontal can be a per-node option in v2 |
| Debouncing | Preview re-render 250 ms; persistence 500 ms | Responsive but not jittery |
| Testing | Pure store/mermaid unit tests; canvas DOM tests with jsdom | No real-browser testing needed |
| Accessibility | Keyboard shortcuts for add/delete/undo; visible focus rings on nodes; ARIA labels on the SVG | The panel is mouse-first but keyboard-accessible |

## Architecture

```
   ┌──────────────────────────────────────────┐
   │  src/sidebar/flowchart-panel.js          │
   │  - mounts the panel                      │
   │  - splits left (canvas) | right (preview)│
   │  - wires pointer events to canvas        │
   │  - subscribes to store changes           │
   └──────────┬────────────────┬───────────────┘
              │                │
              ▼                ▼
   ┌──────────────────┐  ┌─────────────────────┐
   │ flowchart-       │  │ flowchart-mermaid.js│
   │ canvas.js        │  │ - toMermaid(graph)  │
   │ - renders SVG    │  │ - validate(shape)   │
   │ - pointer events │  └─────────────────────┘
   │ - hit-testing    │
   └────────┬─────────┘
            │ reads/writes
            ▼
   ┌──────────────────────────────────────────┐
   │ flowchart-store.js  (pure module)        │
   │ - graph { nodes, edges }                 │
   │ - addNode / moveNode / removeNode        │
   │ - connect / disconnect / setEdgeType     │
   │ - undo / redo (snapshot stack)           │
   │ - subscribe(fn) → emits on change        │
   │ - serialize() / deserialize(json)        │
   │ - persistence IO injected                │
   └──────────────────────────────────────────┘
            │
            │ debounced 500 ms write
            ▼
   ┌──────────────────────────────────────────┐
   │ <userData>/flowchart-session.json        │
   └──────────────────────────────────────────┘
```

## New Modules

| File | Role |
|---|---|
| `src/sidebar/flowchart-panel.js` | Renderer-only panel. Mounts the canvas + preview; registers keyboard shortcuts; wires the "Insert at Cursor" button. |
| `src/flowchart/flowchart-store.js` | Pure data module. The graph is `{ nodes: Node[], edges: Edge[] }`. Node: `{ id, kind, x, y, label }`. Edge: `{ id, fromNodeId, toNodeId, kind: 'solid'\|'dotted'\|'thick', label? }`. Exports `create()`, `addNode`, `moveNode`, `setNodeLabel`, `setNodeKind`, `removeNode`, `connect`, `disconnect`, `setEdgeKind`, `setEdgeLabel`, `undo`, `redo`, `subscribe`, `serialize`, `deserialize`, `toJSON`. Constructor takes injected IO `{ persistencePath, readFile, writeFile, now }`. |
| `src/flowchart/flowchart-canvas.js` | Renderer-only SVG canvas. Owns an `<svg>` element. Renders nodes as `<g>` containing shape `<path>`/`<rect>`/`<ellipse>` and a `<text>` label. Renders edges as `<line>` or `<polyline>`. Listens for pointer events: drag to move, double-click to edit label, right-click for shape menu. Hit-testing walks the DOM in reverse z-order. |
| `src/flowchart/flowchart-mermaid.js` | Pure translator. `toMermaid(graph)` returns the Mermaid `flowchart TD` source string. Validates each shape against the 5 supported kinds; throws on unknown kind. Handles label escaping (`"`, newlines → `\n`). |
| `src/flowchart/flowchart-shapes.js` | Pure module: `shapeSvg(kind, x, y, width, height) → string`. Defines the 5 SVG shape templates (process=rect, decision=diamond, terminator=stadium, subroutine=rect-with-double-border, document=parallelogram-approx). Pure functions; unit-tested. |
| `tests/flowchart-store.test.js` | Pure store tests: add/move/connect/disconnect/delete; undo/redo round-trip; subscribe fires once per change; serialize/deserialize round-trip; throws on invalid input. |
| `tests/flowchart-mermaid.test.js` | Translation tests: each node kind emits the correct Mermaid syntax (`[]`, `{}`, `(())`, `[[]]`, `[]/]`); edge kinds (`-->`, `-.->`, `==>`); label escaping. Snapshot tests for representative graphs. |
| `tests/flowchart-shapes.test.js` | Each shape function returns SVG that matches the expected viewBox and contains the expected primitive. |
| `tests/flowchart-canvas.test.js` | jsdom tests: mount canvas with a 3-node graph; assert SVG structure; simulate a `pointerdown` + `pointermove` + `pointerup`; assert store updated with new position. |
| `tests/flowchart-panel.test.js` | jsdom test: mount the panel; assert canvas + preview panes exist; assert preview re-renders on store change. |
| `tests/preload-flowchart.test.js` | (No new preload channels — feature is renderer-only.) |

## Modified Modules

| File | Change |
|---|---|
| `src/renderer.js:2300` (sidebar registration) | Add `sidebarManager.registerPanel('flowchart', { title: 'Flow Chart', render: renderFlowChartPanel, icon: '<svg>…flowchart icon…</svg>' })`. |
| `src/index.html` | Add a sidebar rail button with `data-panel="flowchart"` and the matching icon. |
| `src/styles/sidebar.css` (or wherever sidebar styles live) | Add minimal layout for the panel's split: `display: flex; flex: 1;` with left pane ~70% (canvas) and right pane ~30% (preview). |
| `README.md:54-70` (Advanced Features) | Add row: "**Visual flow chart editor** — Build Mermaid flowcharts visually; drag nodes, connect edges, live preview. Insert at cursor." |
| `README.md:120-128` (Keyboard Shortcuts) | Add row: `\| Add Flow Chart Node \| Insert (when panel focused) \|`, `\| Undo \| Ctrl+Z \|`, `\| Redo \| Ctrl+Shift+Z \|` (panel-scoped). |

## Node Shapes

| kind | Mermaid syntax | SVG shape | Use case |
|---|---|---|---|
| `process` | `A[Label]` | `<rect>` | Generic step |
| `decision` | `A{Label}` | `<polygon points="…">` (diamond) | Yes/no, branch |
| `terminator` | `A([Label])` | `<rect rx=…>` (stadium) | Start/end |
| `subroutine` | `A[[Label]]` | `<rect>` with double border | Named subroutine call |
| `document` | `A[/Label/]` | `<polygon>` (parallelogram-approx) | Document/file reference |

Sizes auto-grow to fit the label text (measure with `getComputedTextLength()` on the `<text>` after first render).

## Edge Kinds

| kind | Mermaid syntax | SVG style |
|---|---|---|
| `solid` | `A --> B` | Solid `<line>` with marker arrow |
| `dotted` | `A -.-> B` | `stroke-dasharray="4,4"` |
| `thick` | `A ==> B` | `stroke-width="3"` |

Edge labels render as `<text>` at the midpoint of the edge with a small white background rect for legibility.

## Data Flow

1. User opens the panel via sidebar rail button (`data-panel="flowchart"`).
2. `flowchart-panel.js` constructs a `flowchart-store.js` instance, calls `deserialize()` with whatever is in `<userData>/flowchart-session.json` (empty graph if absent).
3. Panel mounts the canvas SVG and the preview pane side by side.
4. Canvas subscribes to store changes; on every change, re-renders the SVG and notifies the panel.
5. Panel debounces (250 ms) and calls `flowchart-mermaid.toMermaid(graph)`; updates the preview pane.
6. Panel debounces (500 ms) and calls `store.serialize()` → writes to `<userData>/flowchart-session.json` via injected `writeFile`.
7. User clicks "Insert at Cursor": panel emits `insert-content` IPC with the Mermaid source wrapped in a fenced code block (same pattern as ASCII art's insert).
8. User triggers undo/redo: panel sends `Ctrl+Z` / `Ctrl+Shift+Z` to the canvas's keyboard handler when the panel is focused (the editor's existing undo is left alone — undo only fires when the panel has focus).

## Error Handling

| Scenario | Handling |
|---|---|
| Persistence file is corrupt JSON | `deserialize()` catches, logs warning, returns empty graph. User loses prior session but can start fresh. |
| Persistence write fails (disk full, perms) | `writeFile` rejects; the panel logs the error but continues functioning. The next save attempt retries. |
| `toMermaid()` encounters unknown node kind | Throws a typed error; the preview pane shows "Invalid graph: <message>"; the canvas still renders. User must fix the kind (e.g. via right-click menu). |
| `toMermaid()` label contains newlines | Escapes `\n` to literal `\n` (Mermaid's escape). |
| Canvas hit-test misidentifies a node | Defensive: the canvas uses `data-node-id` attribute on every `<g>`; lookup by id is O(1). |
| User adds a node with empty label | Allowed; rendered as a single space. Mermaid will accept it. |
| User tries to connect a node to itself | `connect()` throws `TypeError`; canvas shows toast. |
| Undo stack overflow (>50 entries) | Oldest snapshot dropped; no memory growth. |

## Testing

1. **Unit (`tests/flowchart-store.test.js`)** — Pure store operations. 30+ tests across add/move/connect/disconnect/delete/undo/redo/subscribe/serialize/deserialize. Includes invalid-input rejection.
2. **Unit (`tests/flowchart-mermaid.test.js`)** — Translation for each shape kind × each edge kind × with-label × without-label. Snapshot tests for 5 representative graphs (linear chain, decision diamond, parallel branches, cycle, large 20-node graph).
3. **Unit (`tests/flowchart-shapes.test.js`)** — `shapeSvg('process', 10, 10, 100, 50)` returns SVG containing a `<rect>` at the right coordinates.
4. **DOM (`tests/flowchart-canvas.test.js`)** — Mount with 3-node graph; assert `<svg>` contains 3 `<g data-node-id="…">`. Simulate `pointerdown` on node 1's center, `pointermove` +100px, `pointerup`; assert store's `moveNode` was called with the new position.
5. **DOM (`tests/flowchart-panel.test.js`)** — Mount panel; assert two panes exist; trigger a store change; assert preview re-renders within 300 ms (jest fake timers).

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Drag/drop in jsdom is fragile (no real layout) | Medium | Use `getBoundingClientRect()` mocks; canvas tests focus on store wiring, not pixel-perfect rendering. |
| Hand-rolled SVG shapes look amateurish next to Mermaid's rendered output | Medium | Use the same color tokens as the active theme via CSS variables; reuse `--accent`, `--text-primary` from the theme CSS. |
| Undo/redo memory growth on large graphs | Low | Bounded depth (50 snapshots) + snapshot diff-based compression (only store changed nodes). |
| Persistence path conflicts on multi-window future | Low | Use `<userData>/flowchart-session.json` — single user, single app instance. |
| Mermaid preview re-render flickers on every keystroke | Medium | Debounce 250 ms; show a "Rendering…" status indicator during re-render. |
| Edge routing looks ugly on dense graphs | Medium | Document as a known limitation in the panel tooltip; v2 orthogonal routing is on the roadmap. |

## Acceptance Criteria

- [ ] `src/sidebar/flowchart-panel.js` exists and is registered via `sidebarManager.registerPanel('flowchart', …)`.
- [ ] Sidebar rail button with `data-panel="flowchart"` added to `src/index.html`; clicking it opens the panel.
- [ ] User can add a node by clicking the canvas (default: process shape at click position).
- [ ] User can drag a node to a new position; the store's `moveNode` is called with correct coordinates.
- [ ] User can double-click a node to edit its label inline; on blur or Enter, the store is updated.
- [ ] User can right-click a node to change its shape (5 options: process, decision, terminator, subroutine, document).
- [ ] User can drag from a node's edge handle to another node to create an edge.
- [ ] User can click an edge to change its type (3 options: solid, dotted, thick) and add an optional label.
- [ ] `Ctrl+Z` / `Ctrl+Shift+Z` (when panel is focused) undoes / redoes the last change.
- [ ] The right preview pane shows the current Mermaid source as text AND renders the SVG via the existing Mermaid render path.
- [ ] "Insert at Cursor" wraps the Mermaid source in a ```` ```mermaid ```` fenced code block and inserts it at the editor cursor.
- [ ] Closing and reopening the app restores the last graph from `<userData>/flowchart-session.json`.
- [ ] `npm test` passes with the new test files added (target +30 new tests across 5 files).
- [ ] `npm run lint` clean, `npm run format:check` clean.
- [ ] `npm run build:linux` succeeds.
- [ ] README updated to mention the visual flow chart editor.
