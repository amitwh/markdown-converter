# Phase 9 — Advanced Tools Design

> Companion to the parent plan: `docs/superpowers/plans/2026-06-05-react-ui-redesign.md` (Phase 9 is sketched at high level; this spec locks architecture, file map, and contracts so it can be planned task-by-task.)

**Date:** 2026-06-05
**Phase:** 9 of 10 (React + shadcn/ui UI redesign)
**Tag (on completion):** `phase-9-advanced-tools`

---

## 1. Goal & Non-Goals

**Goal:** Add 10 advanced tools to the React renderer. Group 1: Standalone dialogs (ASCII generator, Table generator, Word export, Find-in-files). Group 2: Global overlays (Zen mode, REPL, Print preview). Group 3: Editor/sidebar integrations (Minimap, Breadcrumbs-with-symbols, Git status). All triggered via the Phase 6 command store.

**Non-goals (Phase 9):**
- True undo/redo stack (still not in scope)
- Snippet/template library
- Custom REPL with full JS eval (we chose markdown snippet preview for safety)
- Custom diff/merge UI (just shows git status, no in-app diffing)
- Plug-in extensions
- Multi-cursor editing
- LSP / language server integration

**Decision summary (from brainstorming):**
- REPL = **markdown snippet preview** (no JS eval — safe in renderer)
- Word export = **`.docx` via `docx` lib in renderer**, with both Standard and Custom .dotx template modes
- Find-in-files = **recursive search with result navigation** (new IPC, regex support)

---

## 2. Architecture

### 2.1 Three mount strategies

| Category | Mount | Examples |
|---|---|---|
| **Dialogs** | `<ModalLayer />` (Phase 7 pattern) | ASCII gen, Table gen, Word export, Find-in-files |
| **Global overlays** | Top-level in `App.tsx` (like `<Toaster />`) | Zen mode, REPL panel, Print preview |
| **Editor/sidebar integrations** | Extend existing components | Minimap, Breadcrumbs, Git status |

The ModalLayer is the dispatcher for dialogs. The global overlays are mounted directly in `App.tsx` because they need to participate in the top-level layout (full-window, or pinned to the bottom).

### 2.2 ModalState union extension

The Phase 7 `ModalState` discriminated union (9 kinds) gets 4 new kinds for the new dialogs:

```ts
export type ModalState =
  | { kind: null }
  | { kind: 'export-pdf'; props: { sourcePath: string } }
  | { kind: 'export-docx'; props: { sourcePath: string } }
  | { kind: 'export-html'; props: { sourcePath: string } }
  | { kind: 'export-batch'; props: { sourcePaths: string[] } }
  | { kind: 'export-word'; props: { sourcePath: string } }   // NEW
  | { kind: 'ascii-generator' }                                  // NEW
  | { kind: 'table-generator' }                                  // NEW
  | { kind: 'find-in-files' }                                    // NEW
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'welcome' }
  | { kind: 'confirm'; props: ConfirmProps };
```

Three of the four new kinds (ascii, table, find-in-files) take no props — they read from the active buffer via `useExportSource` (for ascii/table) or from `useFileStore.rootPath` (for find-in-files). `export-word` takes `sourcePath` like the other export dialogs.

### 2.3 New commands in command store

| Command ID | Trigger | Opens |
|---|---|---|
| `tools.ascii` | new | `AsciiGeneratorDialog` |
| `tools.table` | new | `TableGeneratorDialog` |
| `tools.exportWord` | new | `WordExportDialog` |
| `tools.findInFiles` | new | `FindInFilesDialog` |
| `tools.repl` | new | toggles REPL panel |
| `view.zenMode` | existing (Phase 6) | toggles Zen mode overlay |
| `file.print` | new | opens `PrintPreview` overlay |
| `git.refresh` | new | re-fetches git status |

All registered in `src/renderer/lib/commands/register-menu-commands.ts`.

### 2.4 New IPC surface

```ts
// src/renderer/lib/ipc.ts (additions)
ipc.file.search({ rootPath, query, isRegex, caseSensitive }: {
  rootPath: string;
  query: string;
  isRegex: boolean;
  caseSensitive: boolean;
}): Promise<IpcResult<Array<{ filePath: string; line: number; content: string }>>>;

ipc.file.gitStatus({ rootPath }: { rootPath: string }): Promise<IpcResult<Array<{ filePath: string; status: 'modified' | 'added' | 'deleted' | 'untracked' }>>>;

ipc.file.print({ html }: { html: string }): Promise<IpcResult<void>>;

ipc.file.writeBuffer({ path, buffer }: { path: string; buffer: Uint8Array }): Promise<IpcResult<void>>;
```

The main process counterparts are added to `src/main.js` (or a new `src/main/files-search.js`, etc.). For Phase 9, the spec covers the renderer-side design; main-process IPC handlers are assumed to follow the same `ipcMain.handle` pattern as the existing handlers.

### 2.5 Settings additions (`useSettingsStore`)

```ts
// zod schema additions:
docxCustomTemplatePath: z.string().nullable().default(null),  // path to user .dotx file
replOpen: z.boolean().default(false),                         // REPL panel visibility
breadcrumbSymbols: z.boolean().default(true),                  // breadcrumbs show code symbols
// minimap already exists from Phase 7 (useSettingsStore.minimap: z.boolean().default(true))
```

The `minimap` setting from Phase 7 is now wired (not just stored).

---

## 3. File Map

### 3.1 Created files

**Dialogs (in `src/renderer/components/modals/`):**
- `AsciiGeneratorDialog.tsx` — input textarea, font select, output preview with copy button
- `TableGeneratorDialog.tsx` — rows × cols inputs, header checkbox, output preview
- `WordExportDialog.tsx` — template select (Standard / Custom .dotx), options, preview, export
- `FindInFilesDialog.tsx` — query input, regex/case toggles, results list with click-to-navigate

**Global overlays (in `src/renderer/components/tools/`):**
- `ReplPanel.tsx` — bottom-pinned, textarea + rendered preview
- `PrintPreview.tsx` — full-window print preview

**Editor/sidebar integrations:**
- `src/renderer/components/layout/ZenMode.tsx` — wraps/controls the editor in zen mode (or modify `AppShell.tsx` to hide chrome)
- `src/renderer/components/sidebar/GitStatusPanel.tsx` — file list with status badges

**Lib:**
- `src/renderer/lib/docx-export.ts` — renderer-side `docx` lib integration (markdown → Blob)
- `src/renderer/hooks/use-zen-mode.ts` — small hook that reads `useSettingsStore.zenMode`

**Modifications:**
- `src/renderer/App.tsx` — mount `<ReplPanel />` and `<PrintPreview />` alongside `<ModalLayer />` and `<Toaster />`
- `src/renderer/components/layout/AppShell.tsx` — when `zenMode === true`, hide all chrome except the editor
- `src/renderer/components/editor/CodeMirrorEditor.tsx` — add `@codemirror/minimap` (or `@replit/codemirror-minimap`) when `useSettingsStore.minimap` is true
- `src/renderer/components/layout/Breadcrumb.tsx` — extend to show symbols (headings, code blocks) using `@codemirror/langs-data` or a simple markdown AST walk
- `src/renderer/components/sidebar/Sidebar.tsx` — add a "Git" tab to the existing tab list
- `src/renderer/stores/settings-store.ts` — add 3 new fields
- `src/renderer/lib/validators.ts` — add 3 new fields to `settingsSchema`
- `src/renderer/lib/ipc.ts` — add 4 new IPC methods
- `src/renderer/lib/commands/register-menu-commands.ts` — add 8 new commands
- `src/main.js` (or split files) — add 4 main-process IPC handlers

**Tests:**
- `tests/component/tools/ReplPanel.test.tsx` — smoke test
- `tests/component/tools/PrintPreview.test.tsx` — smoke test
- `tests/component/modals/AsciiGeneratorDialog.test.tsx` — 3 tests
- `tests/component/modals/TableGeneratorDialog.test.tsx` — 3 tests
- `tests/component/modals/WordExportDialog.test.tsx` — 4 tests
- `tests/component/modals/FindInFilesDialog.test.tsx` — 4 tests
- `tests/component/sidebar/GitStatusPanel.test.tsx` — 3 tests
- `tests/component/layout/Breadcrumb.test.tsx` — extend with symbols test
- `tests/integration/phase9-tools-smoke.test.tsx` — 6 tests (one per command-triggered tool)

---

## 4. Data Flow

### 4.1 Word export (most complex)

1. User triggers `tools.exportWord` → `registerMenuCommands` opens the export-word modal via `useAppStore.openModal('export-word', { sourcePath: activeTabId })`
2. **Wait** — we need a new modal kind `export-word` in the `ModalState` union. Add it.
3. `WordExportDialog` (mounted by ModalLayer) shows:
   - Template select: "Standard (bundled)" or "Custom .dotx (your file)" — pre-populated with `useSettingsStore.docxCustomTemplatePath`
   - "Choose custom template..." button (file picker, saves to settings)
   - Options: embed images (checkbox), include front matter (checkbox)
   - Preview area: shows the generated docx structure (sizes, table of contents)
4. On submit:
   - Renderer calls `lib/docx-export.ts#generateDocx(source, templatePath, options)` which uses the `docx` lib
   - The lib takes a `Document` AST and produces a Blob
   - ASCII tables are converted to monospace `<w:r>` runs (using `applyAsciiTransform` from Phase 7)
   - Images are extracted from markdown and embedded as base64
   - If a custom .dotx path is set, the renderer reads it via `ipc.file.read` and applies its styles (via `docx` lib's style support)
   - User picks output path via `ipc.app.showSaveDialog`
   - Writes Blob via `ipc.file.writeBuffer` (new)
   - Toast success/failure

### 4.2 Find-in-files

1. User triggers `tools.findInFiles` → ModalLayer opens `FindInFilesDialog`
2. User types query, picks regex/literal, case-sensitive toggle
3. On submit: `ipc.file.search({ rootPath: useFileStore.rootPath, query, isRegex, caseSensitive })`
4. Backend walks the disk recursively, applies regex/literal match, returns `Array<{ filePath, line, content }>`
5. Dialog shows result list (file:line:content, clickable)
6. Click a result:
   - `useFileStore.openFile(filePath)` if not already open
   - Set the cursor in the editor to the matched line
7. Close the dialog

### 4.3 REPL (markdown snippet preview)

1. User triggers `tools.repl` → toggles `useSettingsStore.replOpen` (or a new dedicated `useReplStore`)
2. `ReplPanel` (mounted in App.tsx) is visible when `replOpen === true`
3. The panel has:
   - Top half: textarea (user types/pastes markdown)
   - Bottom half: rendered preview (uses `lib/markdown.ts` from Phase 1 + DOMPurify)
4. Updates are debounced (300ms) for the preview
5. Pure renderer-side, no IPC

### 4.4 Zen mode

1. User triggers `view.zenMode` → toggles `useSettingsStore.zenMode`
2. `AppShell` reads `zenMode` from store; when true, hides all chrome (header, tabs, toolbar, breadcrumb, status bar, sidebar)
3. Editor goes fullscreen
4. Pressing Esc exits zen mode (keydown listener in `use-zen-mode` hook)

### 4.5 Print preview

1. User triggers `file.print` → opens `PrintPreview` (full-window overlay)
2. The preview renders the current buffer's content as it would appear in print
3. Two buttons: "Print" (calls `ipc.file.print({ html })` which opens native print dialog) and "Close"

### 4.6 Minimap

1. `useSettingsStore.minimap` (existing setting) is read by `CodeMirrorEditor`
2. When true, the editor's extension includes `@replit/codemirror-minimap` (or a simpler custom implementation)
3. The minimap shows a shrunk version of the document on the right side of the editor
4. Toggling the setting adds/removes the extension dynamically

### 4.7 Breadcrumbs-with-symbols

1. The current `Breadcrumb` shows the file path. Extend it to also show markdown symbols (headings, code blocks)
2. Use a simple AST walk of the current buffer to extract heading levels
3. Show as a path-like navigation: `file.md > H1: Title > H2: Section > #line`
4. The `useSettingsStore.breadcrumbSymbols` toggle (default true) controls whether symbols are shown

### 4.8 Git status

1. On sidebar Git tab open, fetch `ipc.file.gitStatus({ rootPath: useFileStore.rootPath })`
2. The main process runs `git status --porcelain` (or equivalent) and returns the list
3. Show file list with status badges (M, A, D, ?)
4. Click a file opens it via `useFileStore.openFile`
5. `git.refresh` re-fetches

---

## 5. Error Handling

- **Word export failures:** `lib/docx-export.ts` catches `docx` lib errors → toast.error
- **Word export missing .dotx:** if custom template path is set but file doesn't exist, show inline banner in the dialog
- **Find-in-files failures:** if `ipc.file.search` throws (regex syntax error, IO error), show inline banner in the dialog
- **REPL:** no IPC, no error handling needed
- **Git status:** if folder isn't a git repo, return empty array. Panel shows "Not a git repository" message
- **Print:** if `ipc.file.print` fails (no printer, user cancels), toast.error or silent close
- **Minimap, Breadcrumbs:** renderer-side, no errors

---

## 6. Testing Strategy

- **Unit tests:** `lib/docx-export.ts` (markdown → docx conversion, ASCII handling), `lib/ascii-table.ts` (already tested)
- **Component tests:** 1-2 smoke tests per new component
- **Integration test:** `phase9-tools-smoke.test.tsx` covering the 6 command-triggered tools (dispatch opens correct modal/overlay)
- **Editor integrations:** minimap toggle, breadcrumbs render with symbols, git status panel render
- **Target: +30-40 new tests**, total ~290

---

## 7. Risks & Open Questions

**Risks:**
- **`docx` lib bundle size (~500KB).** Acceptable for a desktop app but worth noting. Lazy-load if it becomes a concern.
- **Word export custom template parsing** — the `.dotx` format is a zip with XML inside. The `docx` lib may not fully support reading existing templates. v1 may need a simpler "styles only" extraction.
- **Find-in-files regex compilation** — invalid regex would throw. Validate on the renderer before calling IPC.
- **Minimap performance** — for large files, the minimap can slow down scrolling. CodeMirror's built-in minimap has performance options to configure.

**Open questions (deferrable):**
- **REPL persistence** — should the textarea content survive across modal close/reopen? → Decision: NO for v1. Keep simple.
- **Git status auto-refresh** — should it auto-refresh every N seconds? → Decision: NO for v1. Manual via `git.refresh` command.
- **Find-in-files result count limit** — what if there are 10,000 matches? → Decision: limit to 500 results for v1, show "X more matches" message.

---

## 8. Out of Scope (deferred to Phase 10 or later)

- Custom undo/redo (still not in scope)
- Snippet/template library
- Multi-cursor editing
- LSP / language server
- Phase 10 will delete legacy files including the old `src/print-preview.js`, `src/wordTemplateExporter.js`, `src/welcome.js`, `src/zen-mode.js`, etc.

---

## 9. Success Criteria

Phase 9 is complete when:
- All 10 features implemented and accessible via the command store
- `lib/docx-export.ts` generates valid `.docx` files
- Find-in-files returns results from a recursive disk walk
- REPL renders markdown snippet previews
- Zen mode hides all chrome and Esc exits
- Print preview opens native print dialog
- Minimap appears when `useSettingsStore.minimap` is true
- Breadcrumbs show symbols by default
- Git status panel shows modified/added/deleted/untracked files
- ~+30-40 new tests, total ~290
- `npx vite build` succeeds
- Branch tagged `phase-9-advanced-tools` and pushed to origin
