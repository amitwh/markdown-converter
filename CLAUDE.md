# CLAUDE.md — MarkdownConverter (master)

> **Single source of truth for project knowledge.** General code-quality, JavaScript, git, security, and testing standards are in the **global CLAUDE.md**; this file holds all project/branch/architecture/operations notes. `README.md` is the user-facing feature guide. `SOURCES.md`, `THIRD-PARTY-NOTICES.md`, and `third-party-licenses/` are legal-compliance files and must stay. No other project `.md` docs are maintained — history lives in git (`scripts/README.md` documents build tooling only).

## Project Overview

Electron desktop app for Markdown editing, PDF viewing/editing, and universal file conversion (Pandoc, FFmpeg, MarkItDown). Cross-platform (Win/macOS/Linux). Features: multi-tab CodeMirror 6 editor with live preview, 37 themes, PDF viewer/editor (merge/split/compress/rotate/delete/reorder/watermark/password/permissions), export to 20+ formats, batch conversion, Mermaid + visual flowchart generator, Git integration, quick switcher, inline AI assist, comments/wiki-links, version history, crash recovery, and a manifest-based plugin system.

- **Version:** 4.17.3 · **License:** MIT · **App ID:** `com.concreteinfo.markdownconverter`
- **Stack:** Electron 45, Node 24 LTS, vanilla CommonJS JavaScript, **no renderer framework/bundler except the esbuild bundles (maxGraph flowchart + Lucide icons)**, CodeMirror 6, Jest 30 (jsdom). Key libraries: maxGraph 0.25 (flowchart), Lucide 1.77 (bundled icons), marked 18, Mermaid 12, pdfjs-dist 6, KaTeX 0.19, simple-git 4, ESLint 10.

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
| `src/main.js` — main process | 6,885 |
| `src/renderer.js` — renderer entry | 6,798 |
| `src/preload.js` — IPC bridge | 639 |
| `src/index.html` — single-page UI | 2,499 |
| `src/**` total (JS/HTML/CSS, excl. generated bundles) | ~54,600 |
| Tests | 102 suites · 1,260 cases |

## Architecture

### Main process (`src/main.js` + `src/main/`)

`src/main.js` is one monolith: path/tool discovery, `validatePath` helpers, single-instance lock, `createWindow`, `createMenu` (~800 lines), export dispatcher (`performExportWithOptions`), batch conversion, CLI conversion, and **all 128 `ipcMain` registrations**. Extracted modules under `src/main/` are pure/Electron-free where possible and are injected with `fs`, `path`, `execFile`:

- Files/PDF/media: `PDFOperations`, `PDFBatchOperations`, `ImageOperations`, `AudioOperations`, `VideoOperations`, `PdfFontHeader`, `XlsxExporter`, `MarkItDown`, `MetadataStripper`.
- Documents/export: `PandocArgs`, `ExportThemes`, `ExportPresets`, `ExportCss`, `OdtStyling`, `DocxFontEmbedder`, `EpubFontEmbedder`, `MonospaceFontConfig`, `DataExport` (valid YAML/TOML documents — Pandoc has no writer for either), `AboutDialog` (pure HTML builder for the standalone About window, which cannot inherit the app stylesheet).
- ASCII: `AsciiArt` (orchestrator: hand-coded fonts, `template:<id>`, `figlet:<font>` with width/layout/spacing/justify options), `AsciiArt.fonts`, `AsciiArt.templates`, `AsciiArt.figlet-adapter`, plus `renderer/ascii-controller.js` driving the standalone studio window.
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
- `src/styles/`: `tokens.css` (legacy HSL tokens), `cams2-theme.css` (CAMS2 shell: `#e5461f`, warm grays, Inter, 8–16 px radii, modern dialogs, app light/dark via `body[data-app-theme]`), layout CSS, `styles/themes/*.css` (37 editor themes applied via `body.theme-<id>`).
- `src/icons/lucide-entry.js` → `src/renderer/lucide-icons.bundle.js` (esbuild, ~35 KB): selected Lucide icons for the vanilla renderer, exposed as `window.Lucide`; markup uses `<i data-lucide="…">`, replaced by `createIcons()`.
- Standalone windows: `flowchart-generator.html`, `ascii-generator.html`, `table-generator.html`; quick-note and CLI dialogs are built as data URLs.

### Feature Subsystem Notes

- **Flowchart:** standalone maxGraph editor (Apache-2.0) in a sandboxed window. `src/flowchart-editor/model.js` configures the graph (grid snap, alignment guides, panning, orthogonal edges, undo/redo, 200-step history), `shapes.js` registers custom Visio-style shapes, `exports.js` writes clean SVG/PNG/JPG via `ImageExport`, and `mermaid.js` keeps Mermaid import/export as interop only. Persists versioned JSON (`version: 3`, nodes/edges/styles) to `<userData>/flowchart-session.json` (600 ms debounce); open/save `.flowjson`; VSDX uses `flowchart-vsdx-export.js`. Mermaid remains lossy for positions, widths and shape colours by design. Connectors: `createEditorGraph` sets a `ConnectionHandler.connectImage` (centre dot) because maxGraph creates no handle without one; `index.js` adds the Connector tool (`connector` toolbar action, `C` key) that listens for `InternalEvent.CLICK` and calls `addEdge` on vertex→vertex clicks.
- **AI assist:** providers OpenAI/Anthropic/Ollama/LM Studio plus compatible endpoints (`AiProviders.js`, main-process only, 200 KB / 120 s caps). SSE streaming over `ai-assist-stream:start|cancel` → `chunk|done|error`; surfaces are Cmd+K inline popover (rewrite/shorten/expand) and the chat sidebar. Keys are plaintext in `settings.json`; the settings modal reads the key back across IPC. Known bugs: the inline controller listens on channels missing from `ALLOWED_RECEIVE_CHANNELS` (preload drops them — tests stub `on()` and mask it); first-use confirmation uses `window.confirm`, which Electron disables; chat panel ignores `{error, code}` responses.
- **Export matrix:** every Export-menu format resolves to a real writer. `PandocArgs.SIMPLE_TARGET_FORMATS` pins explicit `-t` targets for markup (asciidoc/rst/mediawiki/org/textile/man/ipynb) and `confluence`→jira; JSON uses `-t json`; XML is standalone JATS (`-t jats -s`); YAML/TOML go through `DataExport` because Pandoc has no writer for them. **ODP is not a Pandoc format** — the app renders a PPTX then converts it with LibreOffice (`soffice --convert-to odp`) and fails loudly when LibreOffice is absent. The universal converter's `convertWithPandoc` adds `-t` for extensions Pandoc does not infer (`.mediawiki`, `.docbook`, `.man`, `.latex`) so it never writes HTML into those files.
- **ASCII studio:** standalone hardened window (`AsciiArt` orchestrator + `ascii-controller.js`). Text mode renders hand-coded or FIGlet fonts with wrap width, letter spacing, alignment and smushing; the font gallery previews the current text in each of the ~349 FIGlet faces (24 per page). Box mode draws single/double/rounded/heavy/shadow/ASCII frames with padding, alignment and minimum width. Template mode shows 16 diagram fragments rendered as thumbnails. Options persist through `ascii:options`; Insert sends the text (fenced code block by default) over `insert-generated-content`, and auxiliary windows reach the editor through the `insert-content` forwarder in `main.js`.
- **Quick switcher:** fuzzy matcher scores basenames only (exact/stem 1.0, prefix 0.8, subsequence 0.5, boundary/consecutive bonuses, recents ×2, open tabs ×1.5); workspace listing caps at 2,000 Markdown/text files; Ctrl+P.
- **Comments:** `.comments/<doc>.md.json` sidecar with line + `anchorText` anchoring, F8 next-unresolved navigation, single identity (`'me'`), no threads.
- **Wiki links/backlinks:** `[[target]]`, `[[target|alias]]`, `[[target#section]]`; relative paths only; backlinks panel does bounded BFS (depth 3, 500 files, 1 MB) on every render.
- **Session/version/autosave:** localStorage `editor-session` v1 (2 MB budget); version snapshots at `<userData>/versions/by-path/<sha1>/` (keep 20); crash recovery at `<userData>/autosave/by-path/<sha1>/recovery.md`.
- **Search/DocQA:** `WorkspaceSearch` TF-IDF ranking with facets; DocQA is retrieval-only (no generative answer); `SemanticEngine` neural mode needs `@xenova/transformers`, which is **not** in `package.json`, so it silently stays TF-IDF. MarkItDown is optional and this checkout has no bundled binary, so it falls back to a system install.
- **Metadata stripping:** `MetadataStripper` removes AI/provenance containers losslessly and verifies the content payload: PNG (`caBX`/`tEXt`/`iTXt`/`zTXt`/`eXIf`), JPEG (APP1/APP3–15/COM), WebP (EXIF/XMP + VP8X flags), SVG `<metadata>`, PDF Info + XMP, DOCX `docProps`, EPUB generator meta/`META-INF/metadata.xml`, MP3 ID3, WAV LIST/id3, MP4/MOV/M4A ffmpeg remux, and Markdown/HTML AI frontmatter keys + provenance comments. Tools → Strip AI Metadata… runs a batch; `clean metadata on export` is on by default (`stripMetadataOnExport`).
- **Visible marks:** PDF → Remove Watermark Annotations removes separate `/Watermark` annotation objects; PDF → Cover Area paints a rectangle; Image Tools has Crop and Cover Area. These alter content and cannot guarantee removal of burned-in/pixel watermarks. AI Assistant “Paraphrase Selection” is a mitigation only — statistical text watermarks are not reliably removable.
- **CAMS2 shell:** `styles/cams2-theme.css` loads last and owns the app chrome, dialogs, command palette, AI settings and shared controls. The Find & Replace dialog (`.find-modal` / `.find-*`) is styled there too: it previously had **no rules in any stylesheet**, so its inputs inherited only the shared `.modal-body input` rule while its buttons fell through to native OS widgets. App appearance is persisted as `appTheme` (`light|dark|system`) and applied as `body[data-app-theme]` so editor theme class churn cannot wipe it. Dark shell auto-switches a light editor theme to `onedark` and restores it on return to light (only if the user hasn't picked another theme meanwhile). Dialogs intentionally keep a **light** surface (`--modal-bg`) in both appearances for form legibility, while accents/shadows/backdrop follow the theme; legacy `--primary-dark`/`--accent-blue` now resolve to the CAMS2 brand. Lucide icons are created from `<i data-lucide="…">` placeholders by `window.Lucide.createIcons()`; a MutationObserver handles dynamic dialogs.

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
npm run build:icons        # bundle the selected Lucide icons
npm run build:deb:local    # bump + stamp buildInfo + local deb only (no GitHub release)
npm run release:local      # optional: tag + local deb/AppImage when GitHub Releases are re-enabled
npm run generate-icons
```

Current release flow: `npm run build:deb:local` (optionally `-- --bump minor`)
runs tests + lint, bumps the version, stamps `buildInfo` for the About dialog,
and builds `dist/*.deb`. It does **not** create a git tag, push, or publish a
GitHub Release. `release:local` remains for the tag/CI flow; use `--publish`
only when GitHub Releases are intentionally re-enabled.

## Testing, Lint & Quality Gates

- Jest + jsdom; `testMatch tests/**/*.test.js`; no transform; `tests/setup.js` mocks `electronAPI`, marked, DOMPurify, hljs, localStorage.
- Main-process modules are tested under `@jest-environment node` with injected runners (no real processes/network).
- Coverage **excludes** `src/main.js`, `src/renderer.js`, `src/preload.js`; thresholds 10% branches / 15% functions-lines-statements.
- No automated E2E; `tests/smoke-e2e-monospace.js` is a manual script.
- `tests/lint-quality.test.js` fails on any ESLint "warning" text; `tests/no-diagnostic-logs.test.js` scans only `src/main.js` + `src/renderer.js`.
- ESLint 10 flat config uses `sourceType: 'commonjs'` and `ecmaVersion: 'latest'`; `eslint-plugin-prettier` is installed but unused.
- **Local baseline (2026-11-21, v4.17.2):** 1,258 passed / 2 skipped, 0 failures.
- `npm audit --omit=dev` is clean (0 vulnerabilities). `npm audit` still reports 23 moderate advisories confined to the `electron-builder`/Jest dev toolchain (transitive `minimatch`/`glob`); they do not ship in the app.

## Known Gotchas / Drift

- **Shortcut conflict:** `Ctrl+Shift+A` is both Tools → ASCII Art Generator (menu accelerator, wins) and the command-palette entry for Writing Analytics. `Ctrl+P` moved from Print to Quick Switcher; Print has no default accelerator. README now reflects this.
- Flowchart sidebar panel is unregistered, but a `data-panel="flowchart"` rail icon remains (dead click).
- `styles-concreteinfo.css` defines `--ci-accent:#e5461f` but the main window never applies `theme-concreteinfo`; only `flowchart-generator.html` links it. `styles-zen.css` is included twice.
- Theme switching assigns `document.body.className`, wiping `mono-*`/`zen-mode` classes.
- `const outlinePanelContainer = null` shadows the real panel container, so tab-creation outline refreshes are dead.
- Two save conventions coexist: `save-file` (with `path`) and `save-current-file` (with `filePath`). Duplicate 30s autosave loops exist.
- `menu-open` / `export` now have main-process listeners (command-palette Open File and Export work); `show-table-generator` remains a listener with no sender. Conversely, `ai-assist-stream:*` listeners are used by the inline AI controller but absent from `ALLOWED_RECEIVE_CHANNELS`, so they are silently dropped.
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
| **4.17.3** | 2026-11-21 | Dialog sizing and About window. `.modal-content.full` (PDF Editor, print preview) spanned 96vw, so the single-column PDF operations floated in dead space: the PDF Editor now sizes to its form (900 px, 1240 px when the thumbnail pane is active, via `:has(.side-by-side)`) and print preview caps at 1100 px. The About window is a data-URL `BrowserWindow` that never loaded the theme stylesheet and carried a hardcoded dark gradient — its markup moved to the pure `src/main/AboutDialog.js` `buildAboutHtml()` and now renders the light CAMS2 dialog surface. |
| **4.17.2** | 2026-11-21 | Find & Replace dialog rebuilt on CAMS2 controls: `.find-controls` had no stylesheet rule at all, so its buttons fell through to native OS widgets. Inputs now carry Lucide affordances (`search`, `replace`), match navigation is a pair of 32 px icon buttons with shortcut tooltips, "All" became the brand-accent **Replace All**, and the live match counter (`aria-live`) moved into the action row. Dialog widened to 380–460 px. README corrected: the finder is plain-text, not regex. |
| **4.17.1** | 2026-11-21 | Flowchart connectors fixed: maxGraph ships no visible connect handle unless `connectImage` is set, so shapes could not be linked at all. `createEditorGraph` now installs a centre drag handle, and a new Connector tool (`C`) links shapes by click-source-then-click-target, chaining without re-arming. Shape-body drags still move nodes. |
| **4.17.0** | 2026-11-21 | ASCII Art Studio rebuilt (live preview, 17 built-in + ~349 FIGlet fonts, searchable font gallery, wrap/spacing/align/smushing, six box styles incl. shadow, 16 template thumbnails, persisted options, Ctrl+Enter/Ctrl+Shift+C shortcuts). Export matrix corrected: ODP now converts PPTX→ODP via LibreOffice instead of writing HTML, XML exports real standalone JATS, YAML/TOML emit valid data documents (`DataExport`), universal converter pins `-t` writers for non-inferable extensions. Menu wiring fixed: command-palette Open File and Export now reach main-process handlers, and `insert-content` forwards from auxiliary windows to the editor. |
| **4.16.1** | 2026-11-21 | Fix pdfjs-dist 6 document loading (`{data}` instead of a bare path), so PDF tabs render again. Light theme-aware dialogs in both appearances; brand-accent buttons replace legacy blue `--primary-dark`; sidebar icon outlines/inset borders removed; one-sided sidebar borders replaced with shadow; modern “Advanced…” controls and session-restore prompt. |
| **4.16.0** | 2026-11-21 | CAMS2 app shell: brand `#e5461f`, warm gray scale, Inter UI, 8–16 px radii, modern dialogs; app Light/Dark/Follow System independent of editor themes; Lucide icon set replaces inline/unicode chrome icons (esbuild bundle). |
| **4.15.0** | 2026-11-21 | AI/provenance metadata stripper (PNG/JPEG/WebP/SVG/PDF/DOCX/EPUB/MP3/WAV/MP4 + Markdown/HTML), lossless with content verification; clean-on-export default; PDF watermark-annotation removal + cover area; image crop/cover; AI paraphrase mitigation. Local-deb release flow (`build:deb:local`); GitHub Releases paused. |
| **4.14.1** | 2026-11-21 | CI fixes: Windows pandoc extraction via bsdtar, MarkItDown smoke-failure cleanup and pandas inclusion; full Windows/macOS/Linux release. |
| **4.14.0** | 2026-11-21 | Visio-style flowchart editor rebuilt on maxGraph 0.25 (direct manipulation, resize, snap/guides, inspector, multi-select, clean SVG/PNG/JPG, VSDX, versioned JSON persistence, Mermaid interop); legacy SVG canvas/store/bundle and 8 test suites removed. Dependency/platform refresh: Electron 45, Node 24 LTS, ESLint 10, Mermaid 12 (dagre pinned), pdfjs-dist 6, marked 18, KaTeX 0.19, simple-git 4, electron-builder 26.18, electron-updater 6.8; 9 unused packages removed. Added `release:local` (version bump + tag + local deb/AppImage) and build metadata in the About dialog. |
| **4.13.0** | 2026-10-01 | Quick switcher (Ctrl+P), inline AI assist (Cmd+K), electron-updater wiring, flowchart C1–C19/D1 (undo/redo, zoom/pan/snap, clipboard, Mermaid import, resize, multi-select, align/distribute, SVG/PNG/JPG/VSDX export), Node 22 engines. |
| 4.12.0 | 2026-09-15 | Flowchart: discoverable connect form, per-node colour, save-to-file export. |
| 4.11.x | 2026-09-15 | Flowchart panel-driven interaction; removed `window.prompt`; debug-copy cleanup. |
| 4.10.0 | 2026-09-15 | Flowchart selection toolbar, inline modals, bootstrap diagnostics. |
| 4.9.x | 2026-09-14 | Standalone flowchart generator window, ASCII art upgrade, 37-theme registry. |
| 4.6.0 | — | AI assistant, collaboration comments, knowledge-base/wiki-links, daily notes, version history, quick note. |
| 4.2.0 | — | Writing Studio feature pack (zen mode, outline, analytics). |
| 4.0.0 | — | Unified modal system (`ModalManager`). |

## Planned Work (not started)

- **Web version** — [`docs/plans/2026-11-21-web-version.md`](docs/plans/2026-11-21-web-version.md). Phased: browser-only PWA first (editor, preview, themes, pdf-lib PDF toolkit, maxGraph flowchart, figlet ASCII — all already browser-native), optional conversion API second for Pandoc parity. Records the measured coupling that makes a port a second product, and the decision to cut a new `web` branch from `master` instead of reviving `react-electron` (which is React + Vite but still Electron, and 216 ahead / 204 behind).

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
| ASCII art upgrade (2026-09-14) | Implemented — 17 hand-coded + FIGlet fonts, standalone window. Superseded in 4.17.0 by the ASCII Art Studio (gallery, box styles, template thumbnails, persisted options). |
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
