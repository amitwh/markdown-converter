# Phase 7 — Modals Design

> Companion to the parent plan: `docs/superpowers/plans/2026-06-05-react-ui-redesign.md` (Phases 7+8+9+10 are sketched there at high level; this spec locks Phase 7's architecture, file map, and contracts so it can be planned task-by-task.)

**Date:** 2026-06-05
**Phase:** 7 of 10 (React + shadcn/ui UI redesign)
**Tag (on completion):** `phase-7-modals`

---

## 1. Goal & Non-Goals

**Goal:** Add a layered modal system to the React renderer. Wire 7 modal types (SettingsSheet + 4 Export dialogs + About + Welcome + Confirm) to a single `<ModalLayer />`. Add a persisted `useSettingsStore` for user preferences. The modals are opened via the command store (Phase 6 pattern), and the modals themselves read/write settings via the new store.

**Non-goals (Phase 7):**
- Implement the actual export pipelines (PDF/DOCX/HTML/PNG generation) — those are main-process concerns, already implemented. Phase 7 only adds the renderer-side dialog UI.
- Real plugin system — the Plugins tab is a placeholder ("Coming soon").
- Toast notifications — Phase 8.
- Advanced tools (Zen mode, REPL, ASCII/Table generators, Print preview) — Phase 9.

---

## 2. Architecture

### 2.1 Modal state lives in `useAppStore` (extended, not new store)

`useAppStore` is already the "global UI" store (sidebar, preview, zen, paneSizes). It's the right home for modal state because:
- It's already mounted.
- It's already persisted (via `zustand persist` with `partialize` for pane sizes).
- A separate `useUIStore` would be YAGNI.

**Add to `AppState`:**
- `modal: ModalState` (discriminated union — see §2.2)
- `openModal: <K extends ModalKind>(kind: K, props?: ModalPropsFor<K>) => void`
- `closeModal: () => void`

**Persistence:** `modal` is **runtime-only**, like `userBindings` in `useCommandStore`. We add it to the `partialize` function so only the persisted fields (`sidebarVisible`, `previewVisible`, `zenMode`, `paneSizes`) are saved. The modal kind never needs to survive a reload.

### 2.2 Discriminated-union modal shape

```ts
export type ModalState =
  | { kind: null }
  | { kind: 'export-pdf';     props: { sourcePath: string } }
  | { kind: 'export-docx';    props: { sourcePath: string } }
  | { kind: 'export-html';    props: { sourcePath: string } }
  | { kind: 'export-batch';   props: { sourcePaths: string[] } }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'welcome' }
  | { kind: 'confirm';        props: ConfirmProps };

export interface ConfirmProps {
  title: string;
  body: string;
  confirmLabel?: string;       // default "Confirm"
  cancelLabel?: string;        // default "Cancel"
  destructive?: boolean;       // switches confirm button to red variant
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}
```

**Why a discriminated union:** every component that opens a modal must pass the right `props` shape for the `kind` — TypeScript catches mismatches at compile time. A generic `{ open: boolean, type: string }` shape would defer the error to runtime.

### 2.3 Single `<ModalLayer />`

Mounted at the bottom of `App.tsx`. Reads `modal.kind` from `useAppStore`, renders the matching component (or `null`). Each child modal calls `closeModal()` on dismiss.

```tsx
// src/renderer/components/modals/ModalLayer.tsx (sketch)
export function ModalLayer() {
  const modal = useAppStore((s) => s.modal);
  switch (modal.kind) {
    case null: return null;
    case 'export-pdf':   return <ExportPdfDialog {...modal.props} />;
    // ... etc
  }
}
```

`<ModalLayer />` ensures only one modal is visible at a time (the store only holds one). This is correct for v1 — no need for stacking/replacement transitions in Phase 7.

### 2.4 Settings store (new, separate)

A new `useSettingsStore` for user preferences. **Why separate from `useAppStore`:** settings is a different lifecycle. `useAppStore` is "current view configuration"; `useSettingsStore` is "user preferences that survive across sessions and are read by many features". Same precedent as `useFileStore` (file tree state) being separate from `useAppStore` (UI chrome state).

**Persistence:** `zustand persist` with `partialize` to serialize only the leaf settings (matching the pattern in `useFileStore` and `useCommandStore`).

```ts
interface SettingsState {
  // Editor
  fontSize: number;            // 12-20, default 14
  tabSize: number;             // 2 | 4 | 8, default 4
  lineNumbers: boolean;        // default true
  wordWrap: boolean;           // default true
  minimap: boolean;            // default true
  // Theme
  theme: 'light' | 'dark' | 'auto';  // default 'auto'
  accentColor: 'brand' | 'blue' | 'green' | 'purple' | 'orange';  // default 'brand'
  fontFamily: 'system' | 'jetbrains' | 'fira';  // default 'system'
  // Export
  pdfFormat: 'letter' | 'a4' | 'legal';  // default 'a4'
  pdfMargins: 'normal' | 'narrow' | 'wide';  // default 'normal'
  pdfEmbedFonts: boolean;       // default true
  docxTemplate: 'standard' | 'minimal' | 'modern';  // default 'standard'
  htmlHighlightStyle: 'github' | 'monokai' | 'nord' | 'none';  // default 'github'
  // ASCII table formatting — applies to all 3 single-file export formats
  renderTablesAsAscii: boolean;  // default false
  // First-launch / Welcome
  welcomeDismissed: boolean;    // default false
  // Actions
  setSetting: <K extends keyof Omit<SettingsState, ...>>(...);
  resetToDefaults: () => void;
}
```

**Template-based exports** (per user request): `docxTemplate` is one of `'standard' | 'minimal' | 'modern'`. The export dialog shows a Select with the available templates. The IPC layer (`ipc.export.docx`) already accepts a `template` field; Phase 7 just exposes it. The main process maps these template names to actual `.docx` template files bundled with the app.

**ASCII table formatting** (per user request): `renderTablesAsAscii` is a toggle in the Settings sheet (Export tab) and in each of the 3 single-file export dialogs as an inline checkbox override. When true, the markdown AST's table nodes are converted to fixed-width monospace text (using a small `lib/ascii-table.ts` helper) *before* the export pipeline sees them. The preview pane is unaffected — this is export-time only.

### 2.5 WelcomeDialog trigger logic

A small `useEffect` in `App.tsx`:
```ts
useEffect(() => {
  if (!useSettingsStore.getState().welcomeDismissed) {
    useAppStore.getState().openModal('welcome');
  }
}, []);  // run once on mount
```

The Help menu registers a `help.welcome` command that simply calls `openModal('welcome')` — does NOT reset the `welcomeDismissed` flag. (Decision in §2.4 of the brainstorming.)

### 2.6 Commands trigger modals

The command store (Phase 6) gets new commands. Registered in `src/renderer/lib/commands/register-menu-commands.ts`:

| Command ID       | Handler                                              |
|------------------|------------------------------------------------------|
| `file.exportPdf`     | `openModal('export-pdf', { sourcePath: activePath })`  |
| `file.exportDocx`    | `openModal('export-docx', { sourcePath: activePath })` |
| `file.exportHtml`    | `openModal('export-html', { sourcePath: activePath })` |
| `file.exportBatch`   | `openModal('export-batch', { sourcePaths: openFiles })` |
| `settings.open`      | `openModal('settings')`                                  |
| `help.welcome`       | `openModal('welcome')`                                   |
| `help.about`         | `openModal('about')`                                     |
| `file.confirmClose`  | opens confirm dialog before closing a dirty tab        |
| `app.quit`           | opens confirm if dirty tabs exist, else quits          |

`settings.open` and `help.about` also get buttons in `AppHeader` (already partly done in Phase 6 — we just add new icons and wire to the new commands).

---

## 3. File Map

### 3.1 shadcn primitives (manually created, per the shadcn-CLI-blocked memory)

Created in `src/renderer/components/ui/`:
- `dialog.tsx`         — Radix Dialog wrapper with motion preset
- `sheet.tsx`          — Radix Dialog (side variant) for SettingsSheet
- `tabs.tsx`           — Radix Tabs for the 5-tab SettingsSheet
- `input.tsx`          — text input
- `textarea.tsx`       — multi-line input (for confirm body, welcome copy)
- `select.tsx`         — Radix Select for theme/font/template pickers
- `switch.tsx`         — Radix Switch for boolean settings
- `checkbox.tsx`       — Radix Checkbox for "don't show again" toggles
- `slider.tsx`         — Radix Slider for fontSize
- `label.tsx`          — Radix Label (always pair with form fields)
- `form.tsx`           — react-hook-form glue components (FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage)
- `radio-group.tsx`    — Radix RadioGroup for accent color / template

### 3.2 Modals (`src/renderer/components/modals/`)

- `ModalLayer.tsx`               — root, mounted by `App.tsx`
- `ExportPdfDialog.tsx`          — PDF options (format, margins, embed fonts, ascii tables)
- `ExportDocxDialog.tsx`         — DOCX options (template picker: standard/minimal/modern, ascii tables)
- `ExportHtmlDialog.tsx`         — HTML options (standalone, highlight style, ascii tables)
- `ExportBatchDialog.tsx`        — batch queue (format, concurrency, file list)
- `SettingsSheet.tsx`            — 5-tab sheet (side="right", 480px wide)
  - `EditorSettings.tsx`         — font size, tab size, line numbers, word wrap, minimap
  - `ThemeSettings.tsx`          — light/dark/auto, accent color, font family
  - `ExportSettings.tsx`         — pdf format, margins, embed fonts, docx template, html highlight, ascii tables
  - `PluginsSettings.tsx`        — "Coming soon" placeholder
  - `AboutSettings.tsx`          — app version, links, acknowledgements
- `AboutDialog.tsx`              — simple read-only dialog with version + GitHub link
- `WelcomeDialog.tsx`            — first-launch dialog with quick-start cards
- `ConfirmDialog.tsx`            — generic confirmation (title, body, destructive, onConfirm)
- `ExportDialogFooter.tsx`       — shared Cancel / Export button row used by the 4 export dialogs
- `useExportSource.ts`           — shared hook: reads active buffer, validates, returns source string + path

### 3.3 Stores

- **Modify** `src/renderer/stores/app-store.ts` — add `modal` + `openModal` + `closeModal`; update `partialize` to exclude `modal`
- **Create** `src/renderer/stores/settings-store.ts` — new

### 3.4 Lib

- **Create** `src/renderer/lib/validators.ts` — zod schemas:
  - `settingsSchema` (whole settings object)
  - `exportPdfSchema` (format, margins, embedFonts, renderTablesAsAscii)
  - `exportDocxSchema` (template, renderTablesAsAscii)
  - `exportHtmlSchema` (standalone, highlightStyle, renderTablesAsAscii)
  - `exportBatchSchema` (format, concurrency, file list)
  - `confirmPropsSchema` (for the confirm dialog)
- **Create** `src/renderer/lib/ascii-table.ts` — `toAsciiTable(rows: string[][]): string` (the small helper that converts a 2D string array to a fixed-width ASCII table)
- **Create** `src/renderer/lib/modal-triggers.ts` — small helpers: `useWelcomeTrigger()`, `useQuitGuard()`

### 3.5 Modified files

- **Modify** `src/renderer/App.tsx` — mount `<ModalLayer />` at the bottom; add the `useWelcomeTrigger` `useEffect` for first-launch
- **Modify** `src/renderer/lib/commands/register-menu-commands.ts` — add the 9 new commands (4 export + settings + welcome + about + confirmClose + quit)
- **Modify** `src/renderer/components/layout/AppHeader.tsx` — add Settings (gear) and About (info) icon buttons that dispatch the new commands
- **Modify** `src/main.js` (verify) — no changes expected; menu items already wire to `menu:action` channels that flow through `useBridgeNativeMenu`. If any new menu items need IPC channels, add them in the main process mirror.

### 3.6 Tests

**Unit (`tests/unit/`):**
- `stores/settings-store.test.ts` (5-6 tests: defaults, setSetting, resetToDefaults, persistence/partialize)
- `stores/app-store.test.ts` extended (3 tests: openModal sets state, closeModal clears, only one modal at a time)
- `lib/validators.test.ts` (3 tests: each schema rejects bad input)
- `lib/ascii-table.test.ts` (3 tests: simple table, alignment, empty input)

**Component (`tests/component/modals/`):**
- `ExportPdfDialog.test.tsx` (4 tests: renders with default settings, submit calls ipc.export.pdf with merged opts, error renders inline, ascii-table toggle flows through)
- `ExportDocxDialog.test.tsx` (3 tests: renders, submit includes template, ascii-table toggle)
- `ExportHtmlDialog.test.tsx` (3 tests: renders, highlight style select, ascii-table toggle)
- `ExportBatchDialog.test.tsx` (3 tests: renders file list, format selector, concurrency)
- `SettingsSheet.test.tsx` (6 tests: renders 5 tabs, each tab shows correct fields, settings change persists)
- `AboutDialog.test.tsx` (2 tests: renders version, links open external)
- `WelcomeDialog.test.tsx` (3 tests: renders, dismiss sets welcomeDismissed, "don't show again" checked)
- `ConfirmDialog.test.tsx` (3 tests: confirm calls onConfirm and closes, cancel calls closeModal, destructive variant)
- `ModalLayer.test.tsx` (3 integration tests: null kind renders nothing, switching kinds replaces modal, modal unmounts on close)

**Integration (`tests/integration/`):**
- `phase7-modals-smoke.test.tsx` (4 tests: dispatch command opens modal, command store + settings store + IPC all wired, app.tsx mount triggers welcome on first launch, modal layer end-to-end)

---

## 4. Data Flow

### 4.1 Open a modal
```ts
// From any command handler in register-menu-commands.ts:
useAppStore.getState().openModal('export-pdf', { sourcePath: activePath });
```

### 4.2 The dialog reads source
```ts
// ExportPdfDialog.tsx
const { source, path } = useExportSource();
if (!source) return <EmptySourceFallback />;
```

`useExportSource` is a small hook that:
1. Reads `useFileStore.activeTabId` + `useEditorStore.buffers`
2. If no active buffer, prompts the user to open a file (uses confirm dialog)
3. Returns `{ source: string, path: string } | null`

### 4.3 Settings change
```ts
// EditorSettings.tsx — switches/inputs call setSetting
const [fontSize, setFontSize] = useSettingsStore(s => [s.fontSize, s.setSetting]);
// or
setSetting('fontSize', 16);
```

Editor and preview subscribe to specific slices. The `useTheme` hook from `next-themes` is augmented to read `theme: 'light' | 'dark' | 'auto'` from `useSettingsStore` (replacing the standalone next-themes default).

### 4.4 Export flow
```ts
// ExportPdfDialog on submit:
const settings = useSettingsStore.getState();
const result = await ipc.export.pdf({
  inputPath: path,
  outputPath: chosenOutputPath,
  format: dialogFormat ?? settings.pdfFormat,
  margins: MARGIN_PRESETS[dialogMargins ?? settings.pdfMargins],
  embedFonts: dialogEmbed ?? settings.pdfEmbedFonts,
  renderTablesAsAscii: dialogAscii ?? settings.renderTablesAsAscii,
});
if (!result.ok) setError(result.error.message);
else { closeModal(); /* toast in Phase 8 */ }
```

The dialog-level overrides fall through to settings defaults when not explicitly chosen.

### 4.5 ASCII table transformation
The transformation happens in the **renderer** (pre-IPC), so the main process doesn't need to know about ASCII mode:
```ts
// In ExportPdfDialog before submitting:
const finalSource = renderTablesAsAscii
  ? applyAsciiTransform(source)   // walks AST, replaces <table> blocks
  : source;
```
`applyAsciiTransform` is a small function (10-20 lines) that:
1. Parses markdown source for `|...|` table syntax via a small regex
2. Replaces each table block with a fenced code block containing the ASCII table
3. Returns the modified source

(No AST walker needed — markdown tables are line-based and a regex per line + simple width calc is sufficient.)

### 4.6 DOCX template selection
The dialog shows a Select with 3 options (standard, minimal, modern). The main process maps these names to bundled `.docx` template files. The IPC contract is unchanged — `DocxOptions.template: string` was already defined in `types/ipc.ts` during Phase 1.

### 4.7 Confirm flow
```ts
// In a command handler:
const activeTab = ...;
if (activeTab?.dirty) {
  useAppStore.getState().openModal('confirm', {
    title: 'Discard unsaved changes?',
    body: `"${activeTab.title}" has unsaved changes. Close without saving?`,
    confirmLabel: 'Discard',
    destructive: true,
    onConfirm: () => doCloseTab(),
  });
} else {
  doCloseTab();
}
```

### 4.8 Welcome first-launch
`useEffect` in `App.tsx` (run once on mount) checks `welcomeDismissed` from `useSettingsStore`. If false, calls `openModal('welcome')`. The Welcome dialog has a "Don't show again" checkbox that sets `welcomeDismissed: true` and closes.

---

## 5. Error Handling

- **IPC errors in export dialogs:** inline error banner below the submit button. `IpcResult<T>` discriminated union makes this easy. Banner shows `result.error.message` and a "Try again" button that re-submits.
- **Settings validation:** zod schemas in `validators.ts`. Each form field shows `aria-invalid` + red border on error. Form-level errors via react-hook-form's `formState.errors`.
- **Confirm dialog cancel:** just calls `closeModal()`. No state mutation. Optional `onCancel` callback for "remember my choice" patterns (not used in Phase 7).
- **Welcome "don't show again":** persists `welcomeDismissed: true`. Help menu can re-open Welcome (without resetting the flag).
- **Settings corruption on load (bad localStorage data):** `useSettingsStore` is built with a `partialize` that also acts as a whitelist — only known fields are deserialized. Unknown fields are dropped. If a persisted value fails zod validation, fall back to defaults (logged as a warning).

---

## 6. Testing Strategy

TDD per the established pattern (Phases 1-6). Every component test:
- Renders with empty/default state
- One happy-path interaction (form submit, button click)
- One error/edge case (validation fail, IPC error, cancel)

Store tests focus on pure logic (state transitions, persistence, partialize). Settings store test specifically verifies:
- Defaults match schema
- `setSetting` works for leaf keys
- `resetToDefaults` clears to initial state
- Persisted payload (from `partialize`) contains exactly the leaf fields
- Hydration from a partial/corrupt payload doesn't throw

Component tests use `render` + `userEvent`, mock `window.electronAPI` for IPC.

ModalLayer integration test verifies:
1. Mounting with `kind: null` renders nothing (query container, expect empty)
2. Mounting with `kind: 'about'` renders `<AboutDialog>` (aria-label match)
3. Switching from `kind: 'about'` to `kind: 'settings'` unmounts About, mounts Settings (verified by role/aria-label transitions)
4. Confirm dialog calls `onConfirm` and `closeModal` on success

---

## 7. Risks & Open Questions

**Risks:**
- **Form library complexity.** react-hook-form + zod is powerful but adds learning curve. Mitigation: a single shared `<SettingsForm>` wrapper reduces cognitive load; export dialogs use simple `useState` (no need for the full form infra).
- **shadcn Dialog animation jank with our motion presets.** Radix Dialog has its own `data-state` attributes for open/closed. We compose with our `modalPop` preset via `forceMount` + Motion. Need to verify no double-animation.
- **Settings store hydration race.** If a component reads a setting on first render before hydration completes, it gets the default. For Phase 7 this is fine — defaults are sensible.

**Open questions (deferrable):**
- Should the "ascii table" output include alignment row separators (`+---+---+`) or just be a `| a | b |`-style table? → Decision: use the `|---|` separator form (more compact, common in plain-text email).
- Should ExportBatchDialog be a Sheet (queue progress) or a Dialog (form)? → Decision: Dialog with a form; progress is shown inline (not a streaming queue). Phase 9 could revisit.
- Should `welcomeDismissed` be per-user-account or per-install? → Per-install (localStorage). No multi-user concept in v1.

---

## 8. Out of Scope (deferred to later phases)

- Phase 8: Toast notifications on export success/failure (the dialog's inline error is v1; toasts are a follow-up).
- Phase 9: ASCII art generator (figlet) is separate from ASCII table rendering. This spec is about table formatting.
- Phase 9: Word export uses a `.docx` template *generation* step (WordExportDialog), not the IPC `ipc.export.docx` path. Distinct.
- Phase 10: Delete legacy `src/print-preview.js`, `src/wordTemplateExporter.js`, etc.

---

## 9. Success Criteria

Phase 7 is complete when:
- All listed shadcn primitives exist in `src/renderer/components/ui/` with tests
- `useSettingsStore` is implemented, tested, and persisted
- `useAppStore` extended with `modal` discriminated union and tested
- All 7 modal components implemented, tested, and accessible (aria-labels, keyboard nav)
- 4 export dialogs (PDF/DOCX/HTML/Batch) all submit through the command store and call IPC correctly
- `ModalLayer` mounted in `App.tsx` and integrated with command triggers
- Welcome dialog shows on first launch, dismissible, re-openable from Help menu
- Confirm dialog used by quit-with-dirty and close-with-dirty flows
- ASCII table rendering works (toggle in settings, override in export dialogs)
- DOCX template picker in ExportDocxDialog submits the correct `template` field
- `npx vite build` succeeds, `npx vitest run` shows **all tests green** (target: +50 new tests, total ~220)
- Branch tagged `phase-7-modals` and pushed to origin
