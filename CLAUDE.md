# CLAUDE.md — MarkdownConverter (master)

> **Single source of truth for project knowledge.** General code-quality, JavaScript, git, security, and testing standards are in the **global CLAUDE.md**; this file holds all project/branch/architecture/operations notes. `README.md` is the user-facing feature guide. `SOURCES.md`, `THIRD-PARTY-NOTICES.md`, and `third-party-licenses/` are legal-compliance files and must stay. No other project `.md` docs are maintained — history lives in git (`scripts/README.md` documents build tooling only).

## Project Overview

Electron desktop app for Markdown editing, PDF viewing/editing, and universal file conversion (Pandoc, FFmpeg, MarkItDown). Cross-platform (Win/macOS/Linux). Features: multi-tab CodeMirror 6 editor with live preview, 37 themes, PDF viewer/editor (merge/split/compress/rotate/delete/reorder/watermark/password/permissions), export to 20+ formats, batch conversion, Mermaid + visual flowchart generator, Git integration, quick switcher, inline AI assist, comments/wiki-links, version history, crash recovery, and a manifest-based plugin system.

- **Version:** 4.13.0 · **License:** MIT · **App ID:** `com.concreteinfo.markdownconverter`
- **Stack:** Electron 45, Node 24 LTS, vanilla CommonJS JavaScript, **no renderer framework/bundler except the maxGraph flowchart editor (esbuild)**, CodeMirror 6, Jest 30 (jsdom). Key libraries: maxGraph 0.25 (flowchart), marked 18, Mermaid 12, pdfjs-dist 6, KaTeX 0.19, simple-git 4, ESLint 10.

## Branch Roles

| Branch | Purpose |
|---|---|
| **`master`** (here) | Release line — vanilla Electron app. `src/main.js` + `src/renderer.js` monoliths. |
| `react-electron` | v5.0.1 rewrite: React 19 + TypeScript + Vite renderer, Vitest, `src/main/index.js`. Not Tauri. |
| `origin/dev` | Currently level with `master`. `origin/windows`, `origin/new-dev` also exist. |

The earlier React + Tauri + PWA design was **not** executed as written: the v5 rewrite landed as React + Electron on `react-electron`; there is no `src-tauri/` and no PWA service worker. The Flutter exploration was never pursued.

## Codebase Scale

| File | Lines |
|---|---|
| `src/main.js` — main process | 6,591 |
| `src/renderer.js` — renderer entry | 6,763 |
| `src/preload.js` — IPC bridge | 626 |
| `src/index.html` — single-page UI | 2,811 |
| `src/**` total (JS/HTML/CSS) | ~56,600 |
| Tests | 99 suites · 1,218 cases |

## Architecture

### Main process (`src/main.js` + `src/main/`)

`src/main.js` is one monolith: path/tool discovery, `validatePath` helpers, single-instance lock, `createWindow`, `createMenu` (~800 lines), export dispatcher (`performExportWithOptions`), batch conversion, CLI conversion, and **all 128 `ipcMain` registrations**. Extracted modules under `src/main/` are pure/Electron-free where possible and are injected with `fs`, `path`, `execFile`:

- Files/PDF/media: `PDFOperations`, `PDFBatchOperations`, `ImageOperations`, `AudioOperations`, `VideoOperations`, `PdfFontHeader`, `XlsxExporter`, `MarkItDown`.
- Documents/export: `PandocArgs`, `ExportThemes`, `ExportPresets`, `ExportCss`, `OdtStyling`, `DocxFontEmbedder`, `EpubFontEmbedder`, `MonospaceFontConfig`.
- Content/knowledge: `WorkspaceSearch`, `SemanticEngine`, `DocQA`, `UrlTitle`, `VersionHistory`, `DailyNotes`, `DailyNotesTemplates`, `AutosaveBuffer`, `collectFilesByExtension`.
- AI/system: `AiProviders`, `auto-updater`, `GitOperations`, `ThemeRegistry` + `ThemeRegistry.bootstrap` + `themeMenuBuilder`, `settings/monospaceSettings`, `AsciiArt*`.

### Preload (`src/preload.js`)

Exposes `window.electronAPI` namespaces (`file`, `theme`, `print`, `export`, `batch`, `converter`, `headerFooter`, `page`, `pdf`, `generators`/`ascii`, `flowchart`, `quickSwitcher`, `aiAssist`, `updates`, `aiAssistant`) plus generic `send/invoke/on`. Whitelists: **122 send / 64 receive** channels. Gotcha: each namespace calls `ipcRenderer` directly, so the whitelist does not gate them; the **main window does not load preload at all** — the bridge serves the auxiliary windows.

### Renderer

- `src/renderer.js`: `TabManager` (tabs `Map`, preview cache, debounce timers), preview pipeline (`marked` → `DOMPurify` → TOC → KaTeX → Mermaid → PlantUML → wiki-links → footnotes), autosave/session persistence, toolbar/find-replace, export/PDF/table/ASCII dialogs. Lazy `get*` accessors keep optional modules out of startup.
- `src/renderer/`: `autosave-client`, `ascii-controller`, `document-compare-dialog`, `export-presets`, `footnote-preview`, `inline-ai-controller`, `media-operations-dialog`, `pdf-batch-dialog`, plus the generated `flowchart-editor.bundle.js`.
- `src/sidebar/`: `SidebarManager` + explorer, search, git, outline, backlinks, history, daily-notes, daily-templates, snippets, templates, flowchart panels. Panels are re-rendered from scratch on expand (stateless).
- `src/editor/`: `codemirror-setup.js` (markdown, history, autocomplete, folding, Vim compartment, snippet-Tab) and `smart-paste.js` (CSV/TSV → table, URL → `[title](url)`).
- `src/flowchart-editor/`: maxGraph-based Visio-style editor (`shapes.js`, `model.js`, `exports.js`, `mermaid.js`, `index.js`). `scripts/build-flowchart-editor.js` bundles it with esbuild into `src/renderer/flowchart-editor.bundle.js`; regenerate with `npm run build:flowchart-editor`.
- `src/flowchart/`: pure Mermaid interop (`flowchart-mermaid`, `flowchart-mermaid-parse`) and Visio export (`flowchart-vsdx-export`).
- `src/quick-switcher/`: fuzzy matcher, overlay, workspace dir resolver/file lister (Ctrl+P).
- `src/ai-assist/`: inline popover + assist flows; `src/plugins/built-in/ai-assistant/` is the chat panel.
- `src/plugins/`: loader (manifest discovery), registry, context/command API, event bus, settings store, format registry. Built-ins: `writing-studio`, `ai-assistant`, `collaboration`, `_sample`.
- `src/styles/`: `tokens.css` (HSL tokens; primary is blue-purple, **not** brand `#e5461f`), layout CSS, `styles/themes/*.css` (37 themes applied via `body.theme-<id>`).
- Standalone windows: `flowchart-generator.html`, `ascii-generator.html`, `table-generator.html`; quick-note and CLI dialogs are built as data URLs.

### Feature Subsystem Notes

- **Flowchart:** standalone maxGraph editor (Apache-2.0) in a sandboxed window. `src/flowchart-editor/model.js` configures the graph (grid snap, alignment guides, panning, orthogonal edges, undo/redo, 200-step history), `shapes.js` registers custom Visio-style shapes, `exports.js` writes clean SVG/PNG/JPG via `ImageExport`, and `mermaid.js` keeps Mermaid import/export as interop only. Persists versioned JSON (`version: 3`, nodes/edges/styles) to `<userData>/flowchart-session.json` (600 ms debounce); open/save `.flowjson`; VSDX uses `flowchart-vsdx-export.js`. Mermaid remains lossy for positions, widths and shape colours by design.
- **AI assist:** providers OpenAI/Anthropic/Ollama/LM Studio plus compatible endpoints (`AiProviders.js`, main-process only, 200 KB / 120 s caps). SSE streaming over `ai-assist-stream:start|cancel` → `chunk|done|error`; surfaces are Cmd+K inline popover (rewrite/shorten/expand) and the chat sidebar. Keys are plaintext in `settings.json`; the settings modal reads the key back across IPC. Known bugs: the inline controller listens on channels missing from `ALLOWED_RECEIVE_CHANNELS` (preload drops them — tests stub `on()` and mask it); first-use confirmation uses `window.confirm`, which Electron disables; chat panel ignores `{error, code}` responses.
- **Quick switcher:** fuzzy matcher scores basenames only (exact/stem 1.0, prefix 0.8, subsequence 0.5, boundary/consecutive bonuses, recents ×2, open tabs ×1.5); workspace listing caps at 2,000 Markdown/text files; Ctrl+P.
- **Comments:** `.comments/<doc>.md.json` sidecar with line + `anchorText` anchoring, F8 next-unresolved navigation, single identity (`'me'`), no threads.
- **Wiki links/backlinks:** `[[target]]`, `[[target|alias]]`, `[[target#section]]`; relative paths only; backlinks panel does bounded BFS (depth 3, 500 files, 1 MB) on every render.
- **Session/version/autosave:** localStorage `editor-session` v1 (2 MB budget); version snapshots at `<userData>/versions/by-path/<sha1>/` (keep 20); crash recovery at `<userData>/autosave/by-path/<sha1>/recovery.md`.
- **Search/DocQA:** `WorkspaceSearch` TF-IDF ranking with facets; DocQA is retrieval-only (no generative answer); `SemanticEngine` neural mode needs `@xenova/transformers`, which is **not** in `package.json`, so it silently stays TF-IDF. MarkItDown is optional and this checkout has no bundled binary, so it falls back to a system install.

### Persistence

Custom JSON store (not `electron-store`) under Electron `userData`:
`settings.json` (theme, vim mode, monospace, word/page/header-footer, export presets, last ASCII font, `plugins.ai-assistant.*`), `recent-files.json`, `snippets.json`, plus autosave/version-history/daily-notes data. **AI provider API keys are stored in plaintext in `settings.json`.**

## Security Model (as implemented — audit before touching)

- **Main window is deliberately insecure:** `nodeIntegration: true`, `contextIsolation: false`, no preload (`src/main.js:603-614`). CSP allows `unsafe-inline` + `unsafe-eval` and remote PlantUML (`src/index.html:5-11`). Any XSS = RCE. The hidden PDF-export window, quick-note data-URL window, and CLI dialog are also Node-enabled.
- **Auxiliary windows are hardened:** flowchart/ASCII/table/about/notices use `nodeIntegration: false`, `contextIsolation: true` + preload.
- `validatePath` only normalizes and checks existence — it does **not** realpath symlinks and has no root allowlist. `isPathAccessible` is a small prefix blocklist (`/etc/passwd`, `/root`, `C:\Windows\System32`, …), bypassable.
- `save-file` / `save-current-file` write renderer-supplied paths **without validation**; `save-pasted-image` trusts `currentFile`.
- `read-text-file` / `write-text-file` compare with `startsWith(userData)` without a trailing separator; symlinks escape.
- External commands use `execFile` with fixed argv (good); `execute-code` intentionally runs arbitrary Node/Python/Bash for the REPL.
- Global 2-second rate limiter covers only 8 call sites; the 50 MB limit has gaps (`read-file`, autosave, version history, single PDF ops).
- Permission handler allows only clipboard read/write. There is **no** `will-navigate`, `setWindowOpenHandler`, or `setPermissionCheckHandler`.
- DOMPurify sanitizes preview HTML; PlantUML can fetch from `plantuml.com` when local CLI is absent.

Do not add new privileged renderer code, new `eval`-like paths, or new unvalidated filesystem IPC without addressing the above.

**Historical CVE register** (STRIDE assessment, 2026-03-15; status re-verified 2026-11-21):

| CVE | Finding | CVSS | Current status |
|---|---|---|---|
| MC-001 | Insecure Electron config (`nodeIntegration: true` / `contextIsolation: false`) | 9.6 | **Open** in the main window; auxiliary windows fixed |
| MC-002 | Arbitrary code execution via REPL (`execute-code`) | 9.3 | **Open by design** (10 s timeout); no confirmation gate |
| MC-003 | XSS in Markdown preview | 8.0 | Mitigated by DOMPurify; residual risk because CSP allows inline/eval |
| MC-004 | Path traversal | 7.8 | Partial — `validatePath`/prefix blocklist only, no realpath/allowlist |
| MC-005 | Weak CSP (`unsafe-inline`/`unsafe-eval`, remote PlantUML) | 7.5 | **Open** |
| MC-006 | PDF export window exploitation | 6.5 | Windows hardened elsewhere, hidden PDF window still Node-enabled |
| MC-007 | PlantUML information disclosure | 5.3 | Open when local PlantUML is absent |
| MC-008 | Inconsistent input validation | 5.5 | Partial — save paths still unvalidated |
| MC-009 | Command execution surface | 4.4 | Mitigated — all external tools use `execFile` with argv arrays |
| MC-010 | Dependency risk | 3.5 | Monitor — see dependency-vetting rule in global instructions |

Git-panel XSS (repo-derived names/messages rendered unescaped) was fixed with `escapeHtml` across all sinks.

## Build & Packaging

Config: `electron-builder.config.js` (**not** inline in `package.json`). Output `dist/`.

- **Windows:** NSIS + portable + zip (x64). **macOS:** dmg, unsigned (`identity: null`), macOS 13+ (`minimumSystemVersion`). **Linux:** deb + AppImage + snap (strict/stable).
- `files`: `src`, `assets`, `scripts`, all `node_modules`, legal docs. `asarUnpack`: `ffmpeg-static`, `sharp`, `@img`, `@napi-rs`, `assets/fonts`.
- Tool binaries via `extraFiles`: Pandoc always; MarkItDown only when built for that platform (runtime falls back to system MarkItDown).
- File associations: `.md`, `.markdown`, `.pdf`.
- Auto-update: `electron-updater`, `publish.provider: github` with `owner: concreteinfo`, `repo: markdownconverter`. **Mismatch:** `package.json` repository points to `amitwh/markdown-converter`, so update checks can read the wrong Releases page.
- No custom NSIS `include`; installer options live entirely in `electron-builder.config.js`.

## System Dependencies

| Dependency | Required | Notes |
|---|---|---|
| **Node.js** | >= 24 | `engines` in package.json; CI workflows use Node 24. Electron 45 bundles Node 24.22. |
| **Pandoc** | Bundled | 3.9.0.2 via `npm run download-tools` → `bin/<platform>/pandoc`; SHA-256 pinned except darwin. Falls back to system PATH. |
| **FFmpeg** | Bundled | `ffmpeg-static`, asar-unpacked. |
| **MarkItDown** | Bundled (optional) | `npm run bundle:markitdown` (PyInstaller); core formats work; audio/OCR need system `markitdown[all]`. |
| **sharp** | Bundled | Image tooling; native binaries asar-unpacked. |
| MiKTeX / TeX Live | Optional | LaTeX PDF; MiKTeX PATH injected on Windows. |
| ImageMagick / LibreOffice | Optional | Extra conversion; deb dependencies. |
| PlantUML + Java, Calibre | Optional | Local diagrams, MOBI. |

## Commands

```bash
npm start                  # Electron dev launch
npm test                   # Jest (106 suites)
npm run test:watch | test:coverage
npm run lint | lint:fix    # ESLint flat config (src + tests)
npm run format | format:check
npm run build              # electron-builder, current platform
npm run build:win | build:mac | build:linux
npm run dist | dist:all
npm run download-tools     # fetch Pandoc 3.9.0.2
npm run bundle:markitdown  # optional PyInstaller bundle
npm run build:flowchart-editor  # bundle the maxGraph flowchart editor
npm run release:local      # bump version, tag, build local deb + AppImage
npm run generate-icons
```

Release flow: `npm run release:local` (optionally `-- --bump minor`) refuses a
dirty tree, runs tests + lint, bumps the version, stamps `buildInfo` (date,
commit, Electron version) for the About dialog, commits, tags, and builds
`dist/*.deb` + `dist/*.AppImage`. Add `-- --publish` to push the branch and tag
so GitHub Actions creates the release. Local artifacts are always built and
verified before CI/CD is used.

## Testing, Lint & Quality Gates

- Jest + jsdom; `testMatch tests/**/*.test.js`; no transform; `tests/setup.js` mocks `electronAPI`, marked, DOMPurify, hljs, localStorage.
- Main-process modules are tested under `@jest-environment node` with injected runners (no real processes/network).
- Coverage **excludes** `src/main.js`, `src/renderer.js`, `src/preload.js`; thresholds 10% branches / 15% functions-lines-statements.
- No automated E2E; `tests/smoke-e2e-monospace.js` is a manual script.
- `tests/lint-quality.test.js` fails on any ESLint "warning" text; `tests/no-diagnostic-logs.test.js` scans only `src/main.js` + `src/renderer.js`.
- ESLint 10 flat config uses `sourceType: 'commonjs'` and `ecmaVersion: 'latest'`; `eslint-plugin-prettier` is installed but unused.
- **Local baseline (2026-11-21, upgraded stack):** 1,211 passed / 7 skipped, 0 failures.

## Known Gotchas / Drift

- **Shortcut conflict:** `Ctrl+Shift+A` is both Tools → ASCII Art Generator (menu accelerator, wins) and the command-palette entry for Writing Analytics. `Ctrl+P` moved from Print to Quick Switcher; Print has no default accelerator. README now reflects this.
- Flowchart sidebar panel is unregistered, but a `data-panel="flowchart"` rail icon remains (dead click).
- `styles-concreteinfo.css` defines `--ci-accent:#e5461f` but the main window never applies `theme-concreteinfo`; only `flowchart-generator.html` links it. `styles-zen.css` is included twice.
- Theme switching assigns `document.body.className`, wiping `mono-*`/`zen-mode` classes.
- `const outlinePanelContainer = null` shadows the real panel container, so tab-creation outline refreshes are dead.
- Two save conventions coexist: `save-file` (with `path`) and `save-current-file` (with `filePath`). Duplicate 30s autosave loops exist.
- Preload whitelists `menu-open`/`export`/`show-table-generator` with no matching main listener/sender; conversely, `ai-assist-stream:*` listeners are used by the inline AI controller but absent from `ALLOWED_RECEIVE_CHANNELS`, so they are silently dropped.
- Flowchart snap-to-grid is coded but unreachable from the UI; Mermaid export/import loses node colours and widths; SVG/PNG export includes selection rings/grips because it clones the live canvas.
- Neural search and generative DocQA are not actually available: `@xenova/transformers` is not a dependency and DocQA only retrieves passages. MarkItDown is optional and not bundled in this checkout (`bin/linux` contains pandoc only).
- No generated symbol map or changelog is checked in. If one is needed: install `universal-ctags`, run `~/.claude-shared/scripts/repo-map.sh . JavaScript > /tmp/repo-map.md`, use it, and discard it — checked-in maps rot silently.
- Legacy context-menu scripts and the custom NSIS include were removed: `electron-builder.config.js` never referenced them and they targeted `PanConverter.exe` paths.
- **Electron 42+ no longer downloads its binary in `postinstall`** — it downloads on first `npx electron`/`npm start`. CI builds still work; offline dev must run Electron once before packaging.
- **npm 12 blocks install scripts by default.** `package.json` has `allowScripts: { "ffmpeg-static": true }` so the FFmpeg binary can download; other blocked scripts (`electron`, `electron-winstaller`, `@parcel/watcher`, `unrs-resolver`) are not required locally.
- **Dependency cleanup (4.14):** removed unused `electron-store`, `docx`, `pdfkit`, `html2pdf.js`, `core-util-is`, `tslib`, `codemirror`, `@codemirror/lint`, and `@testing-library/dom`.
- **Mermaid 12 defaults to ELK layout**; `renderer.js` pins `layout: 'dagre'` to preserve existing document appearance. Mermaid 12 requires ES2024 (Electron 45’s Chromium 156 is fine).
- **Flowchart editor uses maxGraph** (added 4.14): `Graph` (not `BaseGraph`) for built-in plugins/shapes; bundled with esbuild because the standalone window is sandboxed. The old custom SVG canvas/store/bundle modules and their 8 test suites were removed.
- **pdfjs-dist 6** is ESM-first; the main process uses `legacy/build/pdf.mjs`, and the renderer relies on Node 24's `require(ESM)` support.
- `CLAUDE.md` is the tracked single source of truth (removed from `.gitignore`); `.remember/` holds local session memory and is gitignored.

## Release History (condensed)

Full detail is in git history; this is the shape of the product.

| Version | Date | Highlights |
|---|---|---|
| **4.14.0** | 2026-11-21 | Visio-style flowchart editor rebuilt on maxGraph 0.25 (direct manipulation, resize, snap/guides, inspector, multi-select, clean SVG/PNG/JPG, VSDX, versioned JSON persistence, Mermaid interop); legacy SVG canvas/store/bundle and 8 test suites removed. Dependency/platform refresh: Electron 45, Node 24 LTS, ESLint 10, Mermaid 12 (dagre pinned), pdfjs-dist 6, marked 18, KaTeX 0.19, simple-git 4, electron-builder 26.18, electron-updater 6.8; 9 unused packages removed. Added `release:local` (version bump + tag + local deb/AppImage) and build metadata in the About dialog. |
| **4.13.0** | 2026-10-01 | Quick switcher (Ctrl+P), inline AI assist (Cmd+K), electron-updater wiring, flowchart C1–C19/D1 (undo/redo, zoom/pan/snap, clipboard, Mermaid import, resize, multi-select, align/distribute, SVG/PNG/JPG/VSDX export), Node 22 engines. |
| 4.12.0 | 2026-09-15 | Flowchart: discoverable connect form, per-node colour, save-to-file export. |
| 4.11.x | 2026-09-15 | Flowchart panel-driven interaction; removed `window.prompt`; debug-copy cleanup. |
| 4.10.0 | 2026-09-15 | Flowchart selection toolbar, inline modals, bootstrap diagnostics. |
| 4.9.x | 2026-09-14 | Standalone flowchart generator window, ASCII art upgrade, 37-theme registry. |
| 4.6.0 | — | AI assistant, collaboration comments, knowledge-base/wiki-links, daily notes, version history, quick note. |
| 4.2.0 | — | Writing Studio feature pack (zen mode, outline, analytics). |
| 4.0.0 | — | Unified modal system (`ModalManager`). |

## Historical Plans (consolidated outcomes)

These design/implementation plans were removed as standalone files; their outcomes are:

| Area | Outcome |
|---|---|
| Modal system (2026-03-24) | Implemented — `src/utils/ModalManager.js` + `src/styles/modal.css`, tested. |
| Writing Studio pack (2026-04-06) | Implemented — `src/zen-mode.js`, `src/sidebar/outline-panel.js`, `src/analytics/`, `src/plugins/built-in/writing-studio/`. |
| Plugin system (2026-04-14) | Implemented — loader/registry/context/event bus/format registry; manifests' `extensionPoints`/`settings` remain declarative only. |
| v5 platform design (2026-04-14) | Partially delivered; broader platform work diverged to `react-electron`. |
| Monospace font embedding (2026-06-30) | Implemented — settings, CSS generation, DOCX/EPUB font embedding. |
| Theme registry (2026-09-14) | Implemented — 37 themes via `ThemeRegistry.bootstrap.js`. |
| ASCII art upgrade (2026-09-14) | Implemented — 17 hand-coded + FIGlet fonts, standalone window. |
| Flowchart editor (2026-09-14) | Implemented but diverged — standalone window, not the sidebar panel; sidebar registration disabled. |
| Quick switcher + inline AI (2026-09-30) | Implemented in 4.13.0; known follow-ups listed in Known Gotchas. |
| Feature audit & hardening (2026-08-23) | Largely implemented; `git-diff` remains dead, main-window isolation and CSP remain open. |
| React + Tauri + PWA (2026-03-15) | Not executed as written — v5 is React + Electron; no Tauri/PWA. |
| V4 + Flutter (2026-03-24) | Flutter not pursued; V4 enhancements shipped on Electron. |

## Documentation (what remains)

- `README.md` — user-facing features, shortcuts, themes, licensing.
- `SOURCES.md`, `THIRD-PARTY-NOTICES.md`, `third-party-licenses/` — GPL/third-party compliance (packaged with the app).
- `LICENSE` — MIT.
- This file — everything else.
