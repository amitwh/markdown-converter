# CLAUDE.md — MarkdownConverter (master)

> General code-quality, JavaScript, git, security, and testing standards are in the **global CLAUDE.md**. This file holds project- and branch-specific notes.

## Project Overview

Electron desktop app for Markdown editing and universal file conversion powered by Pandoc. Cross-platform (Win/macOS/Linux). Features: multi-tab editor with live preview, 25+ themes, PDF viewer/editor (merge/split/compress/rotate/watermark/password), export to 20+ formats (PDF/DOCX/ODT/EPUB/HTML/LaTeX/RTF/PPTX), batch conversion, syntax highlighting, diagram support (Mermaid), Git integration, and a plugin system.

- **Version:** 4.4.5
- **License:** MIT
- **App ID:** `com.concreteinfo.markdownconverter`

## Branch Specifics

This is the **primary/release branch** — a vanilla JavaScript Electron app with no bundler or framework in the renderer. The renderer is a single large `renderer.js` (5,300+ lines) loaded directly via `src/index.html`. All UI is hand-rolled DOM manipulation.

## Architecture

### Main Process (`src/main.js` — 4,260 lines)
Monolithic main process file. Contains all IPC handlers, Pandoc invocation, file operations, menu definitions (600+ lines), and window lifecycle. Key modules extracted:
- `src/main/PDFOperations.js` — PDF manipulation via `pdf-lib` (merge, split, compress, rotate, delete, reorder, watermark, encrypt, decrypt, permissions)
- `src/main/GitOperations.js` — Git status/stage/commit/log via `simple-git`

### Renderer (`src/renderer.js` — 5,361 lines)
Vanilla JS, no framework. Directly manipulates DOM. Loads CodeMirror 6 via `src/editor/codemirror-setup.js`. Uses `marked` + `highlight.js` + `DOMPurify` + `mermaid` for rendering. Lazy-loads sidebar panels, REPL, command palette, zen mode.

### Preload (`src/preload.js` — 448 lines)
Exists as IPC bridge, but **`contextIsolation: false` and `nodeIntegration: true`** — the renderer has full Node access. Preload is effectively a thin passthrough.

### Security Model
- `contextIsolation: false` + `nodeIntegration: true` (legacy; the react-electron branch fixes this)
- Pandoc invoked via `execFile` (not `exec`) to prevent shell injection
- Path traversal protection: `validatePath()`, `resolveWritablePath()`, blocks sensitive system dirs
- Permission handler only allows `clipboard-read`/`clipboard-write`
- Rate limiter on conversions (2-second minimum interval)
- File size limit: 50MB
- Error message sanitization strips absolute paths

### Plugin System (`src/plugins/`)
Manifest-based discovery (`manifest.json`). Built-in `writing-studio` plugin with sprint/goal/snapshot management. Plugin API exposed via `src/plugins/plugin-api.js`.

### Settings
Custom JSON file store at `<userData>/settings.json` (NOT `electron-store` despite the dependency). Recent files at `<userData>/recent-files.json`.

## System Dependencies

| Dependency | Required | Notes |
|---|---|---|
| **Node.js** | >= 20 | Electron 41 bundles Node 20.x |
| **Pandoc** | Yes (for exports) | Downloaded to `bin/<platform>/pandoc` via `scripts/download-tools.js` (v3.9.0.2). Falls back to system PATH. Must be present for DOCX/ODT/EPUB/LaTeX/PPTX export. |
| **FFmpeg** | Bundled | `ffmpeg-static` npm package; `asarUnpacked` for packaged builds |
| **MiKTeX / TeX Live** | Optional | For LaTeX PDF export; MiKTeX PATH injected on Windows automatically |
| **ImageMagick** | Optional | Linux image conversion; listed as deb dependency |
| **LibreOffice** | Optional | Enhanced document conversion; listed as deb dependency |

## Development Commands

```bash
npm start                  # Launch Electron app (dev mode)
npm test                   # Jest test suite
npm test:watch             # Jest in watch mode
npm test:coverage          # Jest with coverage report
npm run lint               # ESLint check (src + tests)
npm run lint:fix           # ESLint auto-fix
npm run format             # Prettier write
npm run format:check       # Prettier check only
npm run download-tools     # Download Pandoc binaries to bin/
npm run generate-icons     # Generate app icons via sharp
```

## Build & Package

**Tool:** `electron-builder` (v26.0.12), config inline in `package.json` (no separate config file).

| Target | Platforms |
|---|---|
| `npm run build` | electron-builder (default platform) |
| `npm run build:win` | Windows: NSIS installer + portable + zip (x64) |
| `npm run build:mac` | macOS: default dmg |
| `npm run build:linux` | Linux: deb + AppImage + snap |
| `npm run dist` | Build without publish |
| `npm run dist:all` | Build for all platforms |

**Bundled with builds:** Pandoc binary per platform. FFmpeg via `ffmpeg-static` (asarUnpacked). NSIS installer uses custom script at `scripts/nsis-installer.nsh`.

**Output:** `dist/` directory.

**CI:** GitHub Actions workflows in `.github/workflows/` (ci.yml, release.yml).

## Project Conventions / Gotchas

- **No bundler/transpilation.** The app uses vanilla CommonJS JavaScript. `src/main.js` is loaded directly by Electron. No webpack, no Vite, no TypeScript, no Babel.
- **Monolithic files.** `main.js` (4,260 lines) and `renderer.js` (5,361 lines) contain most logic. Not ideal but is the current state of this branch.
- **CodeMirror 6** for the editor, configured in `src/editor/codemirror-setup.js`.
- **PDF rendering** uses `pdfjs-dist`; **PDF manipulation** uses `pdf-lib` in the main process.
- **Renderer security is weak** — full Node access in renderer. Do NOT introduce new privileged renderer code without understanding this.
- **Pandoc is external.** Must be installed separately or downloaded via `npm run download-tools`. HTML and built-in PDF export work without Pandoc; other formats require it.
- **PDF export fallback chain:** xelatex -> pdflatex -> lualatex -> Electron built-in `printToPDF()`.
- **ESLint flat config** (`eslint.config.js`) with ECMAScript 2022. Prettier with 2-space indent, single quotes, semicolons, 100-char width.
- **Tests:** Jest with jsdom environment, 15% coverage threshold. 24 test files in `tests/`.
- **File associations:** `.md`, `.markdown`, `.pdf` registered at install.
- **Single instance lock** enforced via `app.requestSingleInstanceLock()`.
- **Adapters layer** (`src/adapters/`) abstracts file system operations for potential future non-Electron targets.
