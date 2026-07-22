# Changelog

All notable changes to markdown-converter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.0] - 2026-06-08

### Added
- Auto-update via electron-updater against GitHub Releases (default) or ConcreteInfo self-hosted feed.
- Light, skippable first-run wizard: theme, update channel, starter template.
- One-shot v4.4.1 → v5 settings migration with backup at `settings.v4.bak.json`.
- Local crash dump capture (cap 20, auto-prune) and a CrashReportModal.
- "Updates" section in Settings: channel picker, Check now, auto-check toggle.

## [5.0.0] - 2026-06-06

### Added
- **Complete React 19 + Vite + TypeScript renderer** replacing the legacy vanilla-JS UI (Phases 1-9 of the React UI redesign)
- Native macOS/Windows/Linux menus with command palette and keyboard shortcuts
- Settings sheet with 5 tabs (editor, theme, keybindings, advanced, about) and 17+ persisted fields
- Modal layer with 13 modal kinds (export PDF/DOCX/HTML/Word, batch, settings, about, welcome, confirm, ASCII gen, table gen, find in files)
- 10 advanced tools: ASCII generator (figlet), table generator, Word export (.docx via `docx` lib), find-in-files (recursive regex), REPL (markdown snippet preview), print preview, zen mode (Esc exits), minimap, breadcrumbs-with-symbols, git status (porcelain parser)
- Sonner toast notifications at 4 wire points (file save, open file/folder, 4 export dialogs)
- 3 mount strategies: ModalLayer dialogs, App.tsx global overlays, editor/sidebar integrations
- `ipc.file.writeBuffer` for renderer-side binary file output (used by Word .docx export)
- `ipc.file.search` (recursive regex), `ipc.file.gitStatus`, `ipc.print.show`, `ipc.app.showSaveDialog`
- 305 unit + integration tests (vitest + React Testing Library)
- Per-package @radix-ui primitives (checkbox, dialog, select, switch, tabs, radio-group, scroll-area, slider, collapsible, label, context-menu)
- shadcn/ui (new-york style) primitives, manually pasted (CLI broken on Node 24)
- Feature-first main process decomposition: `src/main/{files,menu,window,word-template,utils}/` + glue files

### Changed
- **BREAKING**: Renderer is now React-only. The legacy `src/renderer.js` (5319 lines) and all vanilla-JS UI scripts/styles are removed.
- Main process decomposed from a 4311-line `src/main.js` into feature-first modules under `src/main/`
- New entrypoint: `src/main/index.js` (was `src/main.js`)
- `src/index.html` (1667-line legacy orphan) removed; renderer served by `src/renderer/index.html` (Vite root)
- IPC contract: handlers throw on error, `safeCall` catches → returns `{ ok: false, error }`. `result.ok` is at top level, NOT nested in `result.data.ok`
- Settings store: `useSettingsStore` (zustand persist with zod validation), 17+ persisted fields
- Modal state: `useAppStore.modal: ModalState` discriminated union with 13 kinds; `openModal` uses TS conditional types to enforce prop requirements

### Removed
- `src/renderer.js` (legacy vanilla-JS renderer, 5319 lines)
- 8 legacy stylesheets: `src/styles.css`, `src/styles-modern.css`, `src/styles-concreteinfo.css`, `src/styles-sidebar.css`, `src/styles-zen.css`, `src/styles-welcome.css`, `src/fonts.css`
- 5 legacy scripts: `src/command-palette.js`, `src/print-preview.js`, `src/welcome.js`, `src/zen-mode.js`, `src/wordTemplateExporter.js`
- 2 legacy HTMLs: `src/ascii-generator.html`, `src/table-generator.html`
- `src/main.js` (4311-line god file, replaced by `src/main/index.js`)
- `src/index.html` (1667-line legacy orphan at project root, replaced by `src/renderer/index.html`)
- 9 dead IPC channels from `src/preload.js`: `toggle-command-palette`, `print-preview`, `print-preview-styled`, `open-ascii-generator`, `open-table-generator`, `show-ascii-generator`, `show-ascii-generator-window`, `show-table-generator`, `show-table-generator-window`

[5.0.0]: https://github.com/amitwh/markdown-converter/releases/tag/v5.0.0

## [5.1.0] - 2026-07-23 - react-electron parity

### Added
- **Monospace font embedding** — bundles JetBrains Mono + Fira Code TTFs and embeds the active font into PDF (xelatex fontspec), DOCX (post-pandoc zip patch with `fontTable.xml`), EPUB (`--epub-embed-font` + manifest), and HTML (woff2 base64 in CSS) exports. ASCII art and code blocks now render with the exact same font across machines.
- **Monospace settings** — `get-monospace-settings` / `set-monospace-settings` IPC, with `monospaceFont` (`jetbrains-mono` / `fira-code`) and `monospaceLigatures` (boolean).
- **Renderer body-class toggle** — `useMonospaceClasses` hook toggles `mono-jetbrains-mono` / `mono-fira-code` and `mono-ligatures-on` / `mono-ligatures-off` on `document.body`, driving `--font-mono-active` and `--font-mono-feature` CSS tokens.

### Changed
- **App renamed to Markdown Converter React** (`com.concreteinfo.markdownconverter.react`, npm name `markdown-converter-react`, deb `markdown-converter-react_*_amd64.deb`) so the dev build coexists with the installed `markdown-converter` deb without single-instance lock conflicts.
- Window title shows `Markdown Converter — React Dev` in dev mode.
- `download-tools.js` pins Fira Code to release `6.2` with SHA-256 digests verified before atomic rename; downloads refuse to start on digest mismatch.

### Security
- `PdfFontHeader` uses `fs.mkdtempSync` for an exclusive temp directory; the caller unlinks it after pandoc consumes the header (no racy `Date.now()+pid` filenames).
