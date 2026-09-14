# MarkdownConverter — ASCII Art Generator Upgrade Design

**Date:** 2026-09-14
**Status:** Draft — pending review
**Author:** Amit Haridas

## Overview

Promote the ASCII Art Generator from "works but untested, dual-implemented, 5 fonts" to a full-fledged feature with 17 hand-coded fonts + 400+ FIGlet fonts, single source of truth, comprehensive test coverage, and three output paths (insert at cursor, copy to clipboard, save to file). Consolidate the dead-code in-app modal in favor of the existing standalone `BrowserWindow`.

## Goals

1. **Single implementation path.** Delete the dead `#ascii-art-dialog` modal markup, its `ModalManager` instance, the `showASCIIGenerator*` dead channels in `preload.js`, and the corresponding renderer controller at `renderer.js:5942-6727`. The standalone `ascii-generator.html` window remains the only path.
2. **Many more fonts.** Add 12 hand-coded fonts (Big, Small, Lean, Slant, Isometric1-4, 3-D, 3x5, ANSI Shadow, Calvin S) on top of the 5 existing (standard, banner, block, bubble, digital). Plus all `figlet` npm fonts (400+) accessible through a searchable picker.
3. **Three output destinations.** Insert at cursor (existing — wraps result in a fenced code block), Copy to clipboard (new), Save to `.txt` file (new).
4. **Comprehensive test coverage.** The current `textToASCII`, `createASCIIBox`, `getASCIITemplate`, and the new `figlet` adapter all have ZERO tests today. Add full coverage — snapshot tests for known outputs across all fonts, integration tests for copy/save/insert.
5. **Pure-module architecture.** Move all algorithm code from `renderer.js` into `src/main/AsciiArt.js` (pure module, IPC-coupled via `main.js`, mirroring the `DocQA`/`DailyNotes` pattern).

## Non-Goals (v1)

- No animated ASCII / motion ASCII.
- No color / ANSI escape codes (would break the markdown fenced code block contract).
- No font upload — only shipped fonts (hand-coded + `figlet` standard library).
- No image export (PNG/SVG of ASCII art) — text only.
- No undo history inside the modal — single-shot generation.
- No in-modal text editing of the generated ASCII (the user can paste into the editor instead).

## Decisions Locked

| Decision | Choice | Reason |
|---|---|---|
| Library | `figlet` npm package (latest, ~400 KB unpacked) | Industry-standard JS port of the original C library; 400+ fonts; small footprint |
| Hand-coded fonts | Add 12 more, keep existing 5 as `legacy/` set | Hand-coded fonts have a distinct aesthetic (`figlet` doesn't 1:1 replicate all of them) and load with zero I/O |
| Font loading | Hand-coded: synchronous. `figlet`: lazy-loaded on font-picker open (async) | Avoids 400 KB of synchronous font loading at app startup |
| Module split | `src/main/AsciiArt.js` (pure), `src/renderer/ascii-controller.js` (UI), `src/ascii-generator.html` (already exists) | Matches established renderer-controller + main-module split |
| Single source of truth | Standalone window only; in-app modal deleted | Dead code is technical debt; consolidation is required for testability |
| Output destinations | Insert at cursor (existing) + Copy clipboard + Save to file | Covers all "I want this ASCII art in my markdown" use cases |
| Insert wrapper | Result wrapped in `\n\`\`\`\n…\n\`\`\`\n` (existing behaviour) | Preserves current markdown-fence contract |
| Persistence | None — the modal is stateless. Last-used font remembered via `electron-store` `ascii:lastFont` key (new). | Small UX win without adding persistence layer |
| Tests | jsdom + Jest, snapshot tests for known font outputs | Same pattern as existing `DocQA.test.js` |

## Architecture

```
                     ┌─────────────────────────┐
  Renderer (UI):     │  src/renderer/          │
  - ascii-generator  │   ascii-controller.js   │
    .html            │  - font-picker          │
  - ascii-           │  - input/options        │
    controller.js    │  - preview              │
                     │  - 3 action buttons     │
                     └────────┬────────────────┘
                              │ IPC: ascii:generate, ascii:list-fonts,
                              │      ascii:last-font, ascii:save
                              ▼
                     ┌─────────────────────────┐
  Main (pure):       │  src/main/AsciiArt.js   │
                     │   generate(text, font,  │
                     │            options)     │
                     │   listFonts()           │
                     │   getFontMeta(id)       │
                     └────────┬────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
       │ Hand-coded  │ │   figlet     │ │  Templates   │
       │ (sync)      │ │ (lazy async) │ │ (19 existing)│
       │ 17 fonts    │ │ 400+ fonts   │ │              │
       └─────────────┘ └──────────────┘ └──────────────┘
```

## New Modules

| File | Role |
|---|---|
| `src/main/AsciiArt.js` | Pure module. `generate({ text, font, options })` returns the ASCII string. `listFonts()` returns `{ id, label, kind: 'hand-coded'\|'figlet'\|'template', sample }[]`. `getFontMeta(id)` returns `{ kind, height, supportedChars }`. Lazy-loads `figlet` on first `figlet:*` font request; caches font list. |
| `src/main/AsciiArt.fonts.js` | Hand-coded font tables (5 existing + 12 new) extracted from `renderer.js:6005-6474`. Exports `HAND_CODED_FONTS` as `{ id → { height, chars: { 'A' → string[height], … } } }`. |
| `src/renderer/ascii-controller.js` | Renderer-side controller. Wires input/options/preview/action-buttons in the standalone window. Calls `window.api.ascii.generate(...)` etc. (new preload bindings). |
| `tests/ascii-art.test.js` | Unit tests for `AsciiArt.generate()` across hand-coded fonts (snapshot), `listFonts()` shape, `getFontMeta()`, figlet adapter (mocked), template adapter. |
| `tests/ascii-art.fonts.test.js` | Per-hand-coded-font known-output snapshot tests for the word "HELLO" (and a few edge cases: empty string, single char, mixed case, digits). |
| `tests/ascii-art.templates.test.js` | Per-template known-output snapshot for `getASCIITemplate('arrow-right', {})` etc. |
| `tests/preload-ascii.test.js` | Asserts the new `ascii:*` IPC channels are declared in `preload.js` allow-list. |

## Modified Modules

| File | Change |
|---|---|
| `src/ascii-generator.html` | Add: (a) searchable font picker dropdown (debounced 100 ms input filter over `listFonts()`), (b) two new buttons: "Copy to Clipboard" + "Save to File", (c) call `window.api.ascii.generate(...)` instead of running `textToASCII` inline. Layout otherwise unchanged. |
| `src/main.js:5584-5611` (`openAsciiGenerator`) | No structural change. The IPC channel name stays `open-ascii-generator`. |
| `src/main.js` (new IPC handlers, after line 5611) | Register: `ipcMain.handle('ascii:generate', …)`, `ipcMain.handle('ascii:list-fonts', …)`, `ipcMain.handle('ascii:get-font-meta', …)`, `ipcMain.handle('ascii:save', …)` (writes user-selected path), `ipcMain.handle('ascii:last-font', …)` (read + write via `electron-store`). |
| `src/main.js` (require block) | Add `const AsciiArt = require('./main/AsciiArt')` near `main.js:4005-4010`. |
| `src/preload.js:98-99,294-296` | **Delete** the dead `show-ascii-generator` and `show-ascii-generator-window` channels. Add new `ascii:generate`, `ascii:list-fonts`, `ascii:get-font-meta`, `ascii:save`, `ascii:last-font` to `validInvokeChannels`. Add the `generators.ascii` namespace helpers. |
| `src/renderer.js:2188` | **Delete** the `new ModalManager('#ascii-art-dialog')` instantiation. |
| `src/renderer.js:5942-6727` | **Delete** the entire in-app ASCII modal block: `showASCIIGenerator`, `hideASCIIGenerator`, `generateASCIIPreview`, `insertASCIIArt`, `createASCIIBox`, `getASCIITemplate`, `textToASCII`, all 5 font tables, the 19 template strings. (Total ~786 lines.) |
| `src/index.html:814-…` (`#ascii-art-dialog` markup) | **Delete** the entire modal markup block. |
| `src/styles.css` + other stylesheets | Remove any CSS tied only to the deleted modal. |
| `package.json` dependencies | Add `"figlet": "^1.8.0"` (or current latest). |
| `README.md:55-57` (ASCII Art Generator row) | Update to mention "17 hand-coded fonts + 400+ FIGlet fonts, copy/save/insert". |
| `README.md:124` (shortcut) | No change — `Ctrl+Shift+A` keeps working (existing standalone window path). |
| `electron-builder.config.js` | No change (pure-JS dep). |

## Hand-Coded Fonts (12 new)

Each is a `{ height, chars: { 'A': [...], 'B': [...], ... '0'..'9', ' ' } }` table. Heights vary 4–8 rows.

| id | label | height | source inspiration |
|---|---|---|---|
| `big` | Big | 8 | `figlet` "Big" |
| `small` | Small | 5 | `figlet` "Small" |
| `lean` | Lean | 6 | `figlet` "Lean" |
| `slant` | Slant | 6 | `figlet` "Slant" (skewed) |
| `isometric1` | Isometric 1 | 6 | `figlet` "Isometric1" |
| `isometric2` | Isometric 2 | 6 | `figlet` "Isometric2" |
| `isometric3` | Isometric 3 | 6 | `figlet` "Isometric3" |
| `isometric4` | Isometric 4 | 6 | `figlet` "Isometric4" |
| `three-d` | 3-D | 7 | `figlet` "3-D" |
| `three-x-five` | 3x5 | 5 | `figlet` "3x5" |
| `ansi-shadow` | ANSI Shadow | 8 | `figlet` "ANSI Shadow" |
| `calvin-s` | Calvin S | 7 | `figlet` "Calvin S" |

Plus the 5 existing (standard, banner, block, bubble, digital). Total 17 hand-coded.

## New UI Features

1. **Searchable font picker.** Dropdown with text input. Lists all `listFonts()` results (17 hand-coded + 400+ figlet = ~417). Fuzzy-match on label, debounced 100 ms. Selecting a font renders a 5-char preview (`"HELLO"`) inline.
2. **Copy to Clipboard button.** Copies the rendered ASCII art to the OS clipboard. Uses Electron's `clipboard.writeText()` (already available via `require('electron').clipboard` in main process — exposed as `window.api.ascii.copy(text)` via new preload helper).
3. **Save to File button.** Opens a `dialog.showSaveDialog` with default `.txt` extension, writes the rendered ASCII art. Returns the saved path on success.
4. **Last-used font memory.** New `electron-store` key `ascii:lastFont`. On window open, preselect the last-used font.

## Data Flow

1. User triggers `Ctrl+Shift+A` (existing) or Tools → ASCII Art Generator menu (existing).
2. `main.js:5584` `openAsciiGenerator()` creates/ focuses the standalone `BrowserWindow` (existing behaviour).
3. Renderer loads `src/ascii-generator.html`. The page calls `window.api.ascii.listFonts()` on mount, populates the font picker.
4. User types text, selects font, chooses options (box style, padding) → the preview pane debounces (200 ms) and calls `window.api.ascii.generate(...)`.
5. Click "Insert": renderer emits existing `insert-generated-content` IPC → main forwards to `mainWindow.webContents.send('insert-content', …)` → editor's `tabManager.insertAtCursor` runs, wrapped in fenced code block.
6. Click "Copy": renderer calls `window.api.ascii.copy(text)` → main process writes to clipboard via `clipboard.writeText`.
7. Click "Save": renderer calls `window.api.ascii.save(text)` → main shows save dialog → writes file → returns path. UI shows success toast.

## Error Handling

| Scenario | Handling |
|---|---|
| `figlet` fails to lazy-load (dep missing, native binding error) | `AsciiArt.listFonts()` returns hand-coded fonts only; logs a warning. Picker shows "FIGlet fonts unavailable" notice. |
| `figlet` font file missing (corrupt install) | `AsciiArt.generate({ font: 'figlet:Big' })` throws a structured error → controller shows toast + falls back to last working font. |
| User picks a font with unsupported characters (e.g. non-ASCII) | `generate()` substitutes `?` per character; controller shows a one-line warning above the preview. |
| Clipboard write fails (rare, OS lock) | `clipboard.writeText` returns synchronously and almost never throws; if it does, the controller shows a toast and falls back to "Save to File". |
| Save dialog cancelled | Returns `{ canceled: true }`; UI shows no error. |
| IPC channel not allowed | `preload.js` is the gate; renderer can only call declared channels. Lint catches new channel declarations missing from allow-list. |

## Testing

1. **Unit (`tests/ascii-art.test.js`)** — `generate({ text: 'HELLO', font: 'big', options: {} })` returns the expected ASCII string (snapshot); `listFonts()` returns `{ id, label, kind, sample }[]` with hand-coded first; `getFontMeta('big')` returns `{ kind: 'hand-coded', height: 8 }`.
2. **Snapshot (`tests/ascii-art.fonts.test.js`)** — One snapshot per hand-coded font for `generate({ text: 'HELLO', font: '<id>' })`. Snapshots are checked into `tests/__snapshots__/ascii-art.fonts.test.js.snap`. Edge cases: empty string, single char, mixed case, digits.
3. **Snapshot (`tests/ascii-art.templates.test.js`)** — One snapshot per existing template (`arrow-right`, `flowchart`, etc.).
4. **Adapter (`tests/ascii-art.figlet-adapter.test.js`)** — `figlet.generate` is mocked; assert the adapter calls through with correct options, handles the promise, handles errors.
5. **Integration (`tests/ascii-art.electron.test.js`)** — Spawn the actual `ascii-generator.html` window via `electron` binary in headless mode and assert the window loads without console errors. Skip if no display available.
6. **Preload (`tests/preload-ascii.test.js`)** — Asserts all new `ascii:*` channels are in `validInvokeChannels` allow-list; old `show-ascii-generator*` channels are gone.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hand-coded font tables are tedious to author and error-prone | Medium | Snapshot tests catch drift; visual review for first 4; the rest follow the pattern. |
| `figlet` npm package has unexpected transitive deps or native bindings | Low | `figlet` is pure JS in v1.x; no native deps. Verify with `npm ls figlet` after install. |
| Adding `figlet` increases bundle size (~400 KB unpacked, ~150 KB gzipped in asar) | Low | Acceptable: ASCII art is a featured function. Document in `THIRD-PARTY-NOTICES.md` (MIT license). |
| Deleting 786 lines from `renderer.js` might break something unrelated | Low | The deleted block is self-contained. `git grep "showASCIIGenerator\|textToASCII\|createASCIIBox\|getASCIITemplate"` after deletion should return only the new module location. |
| Snapshot tests for fonts become noisy (whitespace, line endings) | Medium | Normalize line endings to `\n`; trim trailing whitespace; commit a stable snapshot per font after manual review. |
| Standalone window cannot share state with the editor (last-used font, theme sync) | Low | The standalone window is its own `BrowserWindow`; use `electron-store` (already used app-wide) for cross-window state. Theme sync is out of scope (standalone window has its own theme via `body.theme-<id>` from Spec 1). |

## Acceptance Criteria

- [ ] `src/main/AsciiArt.js` exists with `generate`, `listFonts`, `getFontMeta` API.
- [ ] 17 hand-coded fonts (5 existing + 12 new) registered, each renders the test word "HELLO" correctly.
- [ ] `figlet` library loads lazily on first `figlet:*` font request; lists ~400+ fonts via `listFonts()`.
- [ ] In-app modal (`#ascii-art-dialog`, `showASCIIGenerator*`, `preload.js:294-296`) is fully deleted; `git grep` returns zero hits for these symbols outside the deletion commit.
- [ ] Standalone window has Copy to Clipboard, Save to File, and Insert buttons. All three work end-to-end.
- [ ] Last-used font is remembered across window opens via `electron-store` `ascii:lastFont`.
- [ ] `npm test` passes with the new test files added.
- [ ] `npm run lint` clean, `npm run format:check` clean.
- [ ] `npm run build:linux` succeeds (no native-binding surprises from `figlet`).
- [ ] README updated to mention the expanded font catalog and the new output destinations.
