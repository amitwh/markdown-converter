# Phase 10 — Polish + Delete Legacy Design

> Companion to the parent plan: `docs/superpowers/plans/2026-06-05-react-ui-redesign.md` (Phase 10 is sketched at high level; this spec locks architecture, file map, deletion targets, and version strategy.)

**Date:** 2026-06-06
**Phase:** 10 of 10 (React + shadcn/ui UI redesign) — **FINAL**
**Tag (on completion):** `v5.0.0` (the first release tag, all prior phases were `phase-N-*` working tags)

---

## 1. Goal & Non-Goals

**Goal:** Finalize the React UI redesign. Decompose the legacy 146KB `src/main.js` into a feature-first modular structure under `src/main/`, remove the legacy vanilla-JS renderer and all dead IPC bridges, then ship **v5.0.0** with a CHANGELOG.

**Non-goals (Phase 10):**
- Adding new features (Phases 1-9 shipped all of them)
- A full main-process test suite (the existing main process is largely untested; adding tests is Phase 11+)
- Backwards compat shims for the legacy renderer
- Renderer-side refactor (already done)
- Migrating the renderer build pipeline further (vite configs are in place)

**Success criteria:**
- `src/main.js` is gone; `src/main/index.js` is the new entrypoint
- `package.json#main` points to `src/main/index.js`
- All 12 legacy renderer files are deleted
- All 9 dead IPC channels are removed from `preload.js` and `main.js`
- `src/index.html` is reduced to ~50 lines (just the Vite bootstrap)
- `package.json#version` is `5.0.0`
- `CHANGELOG.md` exists in Keep a Changelog 1.1.0 format
- `git grep -E "renderer\.js|command-palette|print-preview|welcome\.js|zen-mode|wordTemplate|ascii-generator|table-generator|styles\.css"` returns zero results
- All 305 tests still pass
- `npx vite build --config vite.renderer.config.ts` succeeds
- `npx electron .` launches and main window renders
- Tag `v5.0.0` pushed to origin

---

## 2. Target Architecture

### 2.1 `src/main/` (feature-first decomposition)

```
src/main/
├── index.js              # entrypoint: bootstraps store, app, window, ipc
├── store.js              # electron-store wrapper (preferences + wordTemplatePath)
├── ipc.js                # ipcMain.handle registration (composes from modules)
├── files/
│   ├── index.js          # file ops facade (read/write/list/pickFolder/pickFile)
│   ├── search.js         # recursive regex search (used by find-in-files)
│   ├── git.js            # git status porcelain parser
│   └── binary.js         # writeBuffer helper (Uint8Array → file)
├── menu/
│   ├── index.js          # buildMenu() — composes the app menu
│   └── items.js          # individual menu items (File, Edit, View, etc.)
├── window/
│   ├── index.js          # createMainWindow ONLY (createAsciiWindow/createTableWindow are DEAD)
│   └── state.js          # window state persistence
├── word-template/
│   ├── index.js          # WordTemplateExporter facade
│   ├── parser.js         # .dotx parsing
│   ├── converter.js      # markdown → docx
│   └── apply.js          # apply template styles to converted docx
└── utils/
    ├── paths.js          # path helpers
    ├── logger.js         # structured logging
    └── download.js       # tool downloader
```

**Module rules:**
- Each file has one clear responsibility (no god files; CLAUDE.md says >300 lines is the cap)
- `index.js` is the public face of a folder; deeper files are private
- `src/main/index.js` (top-level) wires everything together
- Cross-folder imports go through `index.js`, not directly to internals

### 2.2 Entry point change

**Before:**
```json
// package.json
"main": "src/main.js"
```

**After:**
```json
// package.json
"main": "src/main/index.js"
```

The new `src/main/index.js` runs the same `app.whenReady().then(...)` flow that the current `src/main.js` does, but composes the decomposed modules.

### 2.3 What becomes dead code (removed during decomposition)

When the legacy renderer files are deleted, these main-process functions become orphaned and are removed too:

| Function | File | Why dead |
|---|---|---|
| `createAsciiWindow()` | `src/main/window/index.js` | Loads deleted `src/ascii-generator.html` |
| `createTableWindow()` | `src/main/window/index.js` | Loads deleted `src/table-generator.html` |
| `ipcMain.on('open-ascii-generator', ...)` | `src/main/index.js` (after decomposition) | Replaced by React `<AsciiGeneratorDialog>` |
| `ipcMain.on('open-table-generator', ...)` | `src/main/index.js` (after decomposition) | Replaced by React `<TableGeneratorDialog>` |
| `webContents.send('print-preview')` | `src/main/menu/items.js` | Replaced by React `<PrintPreview>` |
| `webContents.send('print-preview-styled')` | `src/main/menu/items.js` | Replaced by React `<PrintPreview>` |
| `webContents.send('toggle-command-palette')` | `src/main/menu/items.js` | Replaced by `useCommandStore` |
| `require('./wordTemplateExporter')` | `src/main/index.js` (after decomposition) | Replaced by `src/main/word-template/` + renderer-side `lib/docx-export.ts` |

---

## 3. Legacy Deletion Map

### 3.1 Files to delete from `src/` (12 files, ~14,426 lines)

| File | Size | Lines | Replaced by |
|---|---|---|---|
| `src/renderer.js` | 213KB | 5319 | `src/renderer/` (Phases 1-9) |
| `src/styles.css` | 74KB | 3723 | `src/renderer/index.css` + Tailwind |
| `src/styles-modern.css` | 71KB | 2625 | Tailwind + shadcn/ui |
| `src/styles-concreteinfo.css` | 21KB | 969 | Tailwind theme tokens |
| `src/styles-sidebar.css` | 9.7KB | 304 | `<Sidebar>` component |
| `src/styles-zen.css` | 2.1KB | 102 | Zen mode in AppShell |
| `src/styles-welcome.css` | 2.2KB | 24 | Welcome dialog |
| `src/fonts.css` | 1.8KB | (imported elsewhere) | Tailwind font config |
| `src/command-palette.js` | (small) | 109 | `useCommandStore` |
| `src/print-preview.js` | (small) | 138 | `<PrintPreview>` |
| `src/welcome.js` | (small) | 78 | `<Welcome>` modal |
| `src/zen-mode.js` | (small) | 292 | `use-zen-mode` hook + AppShell |
| `src/wordTemplateExporter.js` | (small) | 743 | `src/main/word-template/` + renderer `lib/docx-export.ts` |
| `src/ascii-generator.html` | 34KB | (HTML) | `<AsciiGeneratorDialog>` |
| `src/table-generator.html` | 18KB | (HTML) | `<TableGeneratorDialog>` |
| `src/index.html` | 103KB | 1667 | `src/renderer/index.html` (already exists, Vite root) |

**Total: 13 files = ~16,093 lines / ~548KB**

`src/renderer/index.html` (the live Vite template) is NOT deleted.

### 3.2 Dead IPC channels to remove from `src/preload.js`

- `toggle-command-palette` (line 238)
- `open-ascii-generator` (line 89)
- `open-table-generator` (line 92)
- `print-preview` (line 173)
- `print-preview-styled` (line 174)
- `show-table-generator` (line 180)
- `show-ascii-generator-window` (line 217)
- `show-ascii-generator` (line 218)
- `show-table-generator-window` (line 221)

And from the exposed API surface:
- `openAscii: () => ipcRenderer.send('open-ascii-generator')` (line 445)
- `openTable: () => ipcRenderer.send('open-table-generator')` (line 446)

**9 channel names + 2 API entries to remove.**

### 3.3 Legacy references in `src/index.html` (16 places) — **the LEGACY file at project root, 1667 lines**

- `<link rel="stylesheet" href="styles.css">` (line ~6)
- `<link rel="stylesheet" href="styles-welcome.css">` (line ~7)
- `<div id="print-preview-overlay" class="modal hidden" ...>` block (~10 lines)
- `<div class="command-palette-overlay hidden" id="command-palette-overlay">` block (~5 lines)
- `<script src="renderer.js"></script>` (final script tag)

**All of these are removed by deleting the file `src/index.html` entirely.**

The CURRENT live renderer template is **`src/renderer/index.html`** (already correct: minimal, CSP, Plus Jakarta Sans font, `<script type="module" src="./main.tsx">`). This file is **NOT touched** in Phase 10. Vite's `root` is set to `src/renderer/` in `vite.renderer.config.ts`, so `src/renderer/index.html` is the HTML template Vite uses. The `src/index.html` at the project root is an orphan from the pre-Vite era.

**Verification:** after deleting `src/index.html`, the renderer build still works because Vite doesn't look at the project root — it uses `src/renderer/index.html`.

### 3.4 Main process rewiring

- Remove `require('./wordTemplateExporter')` from main entrypoint
- Remove `webContents.send('print-preview*')` and `webContents.send('toggle-command-palette')` from menu items
- Remove `ipcMain.on('open-ascii-generator', ...)` and `ipcMain.on('open-table-generator', ...)` handlers
- Remove `asciiGeneratorWindow` and `tableGeneratorWindow` global state (and any references to `loadFile(...ascii-generator.html)` / `loadFile(...table-generator.html)`)

---

## 4. `src/index.html` — DELETE (not rewrite)

The current `src/index.html` is 1667 lines of legacy markup and is **DELETED** (not rewritten). The renderer is already correctly served by `src/renderer/index.html` (the Vite root). Deleting the legacy root-level `src/index.html` is the action — no replacement file is needed.

`src/renderer/index.html` (already correct) is NOT modified:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; ...">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MarkdownConverter</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:..." rel="stylesheet">
</head>
<body class="font-sans antialiased">
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

---

## 5. Version Bump + CHANGELOG

### 5.1 `package.json`

```diff
-  "version": "4.4.2",
+  "version": "5.0.0",
```

Major version bump because the legacy renderer removal is a breaking change for anyone who had plugins/integrations pointing at `src/renderer.js`.

### 5.2 `CHANGELOG.md` (new file, Keep a Changelog 1.1.0 format)

```markdown
# Changelog

All notable changes to markdown-converter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.0] - 2026-06-06

### Added
- **Complete React 19 + Vite + TypeScript renderer** replacing the legacy vanilla-JS UI
- Native macOS/Windows/Linux menus with command palette and keyboard shortcuts
- Settings sheet (5 tabs: editor, theme, keybindings, advanced, about)
- Modal layer with 13 modal kinds (export PDF/DOCX/HTML/Word, batch, settings, about, welcome, confirm, ASCII gen, table gen, find in files)
- 10 advanced tools: ASCII generator, table generator, Word export, find-in-files, REPL, print preview, zen mode, minimap, breadcrumbs-with-symbols, git status
- Sonner toast notifications at 4 wire points
- 3 mount strategies: ModalLayer dialogs, App.tsx overlays, editor/sidebar integrations
- `ipc.file.writeBuffer` for renderer-side binary output
- `ipc.file.search` (recursive regex), `ipc.file.gitStatus`, `ipc.print.show`, `ipc.app.showSaveDialog`
- 305 unit + integration tests (vitest + React Testing Library)
- Per-package @radix-ui primitives
- shadcn/ui (new-york style) primitives

### Changed
- **BREAKING**: Renderer is now React-only.
- Main process decomposed from 146KB `src/main.js` into feature-first modules under `src/main/`
- `src/index.html` reduced from 1667 to ~50 lines
- IPC contract: handlers throw, `safeCall` catches → `{ ok, error }`
- Settings store: `useSettingsStore` (zustand persist with zod)
- Modal state: `useAppStore.modal: ModalState` discriminated union

### Removed
- `src/renderer.js` (legacy vanilla-JS renderer, 5319 lines) — and `src/index.html` (1667 lines of legacy markup, replaced by `src/renderer/index.html` which is already the live Vite template)
- 7 legacy stylesheets (styles.css, styles-modern.css, styles-concreteinfo.css, styles-sidebar.css, styles-zen.css, styles-welcome.css, fonts.css)
- 5 legacy scripts (command-palette.js, print-preview.js, welcome.js, zen-mode.js, wordTemplateExporter.js)
- 2 legacy HTMLs (ascii-generator.html, table-generator.html)
- 9 dead IPC channels (toggle-command-palette, open-*/show-* ascii/table, print-preview*)
```

---

## 6. Task Decomposition

**10 tasks** (each independently verifiable, one feature per commit, no bundling):

1. **Decompose main.js — `src/main/files/`** (file ops facade, search, git, binary)
2. **Decompose main.js — `src/main/menu/`** (buildMenu + items, with dead sends removed)
3. **Decompose main.js — `src/main/window/`** (createMainWindow ONLY — ascii/table windows removed)
4. **Decompose main.js — `src/main/word-template/`** (WordTemplateExporter split into parser/converter/apply)
5. **Decompose main.js — `src/main/utils/` + `store.js` + `ipc.js` + `index.js`** (glue + new entrypoint)
6. **Trim preload.js** — remove 9 dead IPC channels + 2 exposed API entries
7. **Delete legacy renderer files** (13 files: renderer.js, 7 styles, fonts.css, 4 scripts, 3 htmls)
8. **Verify src/renderer/index.html is the live template** (no action needed if it's already correct)
9. **Bump package.json version to 5.0.0 + write CHANGELOG.md**
10. **Final verification + tag v5.0.0** (build, tests, grep, electron smoke)

Tasks 1-5 are subagent-driven (decomposition is mechanical given a clear target structure). Tasks 6-9 are direct edits. Task 10 is a verification gate.

---

## 7. Verification Strategy

**Per task:**
- After each decomposition step: `npx vitest run` (305 still green)
- After main.js decomposition: `npx electron .` smoke — app starts, opens a file
- After deletions: `git grep -E "renderer\.js|command-palette|print-preview|welcome\.js|zen-mode|wordTemplate|ascii-generator|table-generator|styles\.css"` returns ZERO results

**Final (Task 10):**
- `npx vitest run` — 305 passing
- `npx vite build --config vite.renderer.config.ts` — succeeds
- `npx vite build --config vite.preload.config.ts` — succeeds
- `npx electron .` — app launches, main window renders
- Manual smoke: open a `.md` file, edit it, export to PDF/DOCX, use the command palette
- `git tag -a v5.0.0 -m "..."` and `git push origin v5.0.0`

---

## 8. Risks & Open Questions

**Risks:**
- **Decomposition regressions.** Splitting a 146KB main.js into 7+ files has surface area for missed imports / circular deps. Mitigation: tests stay green; electron smoke after each step.
- **Hidden legacy references.** `git grep` won't catch references inside minified bundles or in node_modules. Mitigation: vite build will fail if there's a dangling import.
- **`src/main/index.js` entrypoint change.** Anything in the build pipeline (electron-builder, scripts) that hardcodes `src/main.js` needs to be updated. Mitigation: grep all of `package.json`, `scripts/`, `vite.*.config.ts` for `main.js`.

**Open questions (resolved during brainstorming):**
- ~~Main process scope~~ → Full rewrite
- ~~Folder shape~~ → Feature-first
- ~~IPC migration~~ → Delete dead channels
- ~~Version strategy~~ → v5.0.0 with Keep a Changelog format
- ~~Order of work~~ → Decompose first, delete last

---

## 9. Out of Scope (deferred to Phase 11+)

- Main process test suite
- Renderer-side further refactor
- New features
- Migration to tauri (separate plan in `docs/plans/2026-03-15-react-tauri-pwa.md`)

---

## 10. Success Criteria

Phase 10 is complete when:
- All 10 tasks are committed, one per commit, no bundling
- `src/main/index.js` is the new entrypoint
- All 12 legacy files are deleted
- All 9 dead IPC channels are removed
- `package.json#version` is `5.0.0`, `package.json#main` is `src/main/index.js`
- `CHANGELOG.md` exists with a complete v5.0.0 entry
- 305 tests still pass
- `npx vite build` succeeds for both renderer and preload configs
- `npx electron .` launches and the app works end-to-end
- `git grep` for legacy references returns zero results
- Tag `v5.0.0` is created and pushed to origin
- Phase 10 is the LAST phase of the React UI redesign
