# CLAUDE.md — MarkdownConverter (react-electron)

> General code-quality, TypeScript, git, security, and testing standards are in the **global CLAUDE.md**. This file holds project- and branch-specific notes.

## Project Overview

Electron desktop app for Markdown editing and universal file conversion powered by Pandoc. Cross-platform (Win/macOS/Linux). Features: multi-tab editor with live preview, 25+ themes, PDF viewer/editor (merge/split/compress/rotate/watermark/password), export to 20+ formats (PDF/DOCX/ODT/EPUB/HTML/LaTeX/RTF/PPTX), batch conversion, syntax highlighting, diagram support (Mermaid), Git integration, plugin system, and auto-updater.

- **Version:** 5.0.1
- **License:** MIT
- **App ID:** `com.concreteinfo.markdownconverter`

## Branch Specifics

This is the **React rewrite branch** — the renderer has been rebuilt with React 19 + TypeScript + Tailwind CSS + shadcn/ui, replacing the vanilla JS renderer from master. The main process remains vanilla CommonJS JavaScript. A dual dev workflow runs Vite (renderer) and Electron (main) concurrently.

Key differences from master:
- Renderer: React 19 + TypeScript (TSX) instead of vanilla JS DOM manipulation
- Bundler: Vite for the renderer (`vite.renderer.config.ts`)
- UI: shadcn/ui (Radix primitives + Tailwind) instead of hand-rolled CSS
- State: Zustand 5 stores instead of global mutable state
- Security: `contextIsolation: true` + `nodeIntegration: false` (preload with channel whitelisting) instead of master's open renderer
- Build: two-stage (Vite build renderer, then electron-builder packages) instead of single electron-builder pass
- Testing: dual test runners — Vitest (renderer/React/TS) + Jest (main process/JS)
- Main process is now in `src/main/` (modular) instead of flat `src/main.js`
- Adds auto-updater via `electron-updater` with GitHub Releases + self-hosted feed support
- Adds React Hook Form + Zod for form validation, Lucide React icons, Motion for animations
- Legacy sidebar modules (`src/sidebar/*.js`) still exist alongside new React sidebar (`src/renderer/components/sidebar/`)

## Architecture

### Main Process (`src/main/`)
Modular structure (improvement over master's monolith):
- `src/main/index.js` — IPC handlers, Pandoc invocation, export logic (~3,500 lines)
- `src/main/PDFOperations.js` — PDF manipulation via `pdf-lib`
- `src/main/GitOperations.js` — Git operations via `simple-git`
- `src/main/store.js` — Custom JSON settings store (NOT electron-store)
- `src/main/window/index.js` — BrowserWindow creation with three-mode loading (dev/prod/packaged)
- `src/main/menu/` — Application menu definitions
- `src/main/ipc/` — Crash handlers, updater handlers
- `src/main/updater/` — Auto-update service, feed config, migration runner
- `src/main/files/` — File operation modules
- `src/main/word-template/` — Word template export

### Preload (`src/preload.js`)
Properly isolated. Uses `contextBridge` with **channel whitelisting** (`ALLOWED_SEND_CHANNELS`, `ALLOWED_RECEIVE_CHANNELS` arrays). The renderer has no direct Node access.

### Renderer (`src/renderer/`)
React 19 + TypeScript application bundled by Vite:
- `src/renderer/App.tsx` — Root component: assembles AppShell, modals, command palette, toaster
- `src/renderer/components/layout/AppShell.tsx` — Three-panel resizable layout (sidebar | editor | preview)
- `src/renderer/stores/` — Zustand stores: `app-store`, `editor-store`, `file-store`, `preview-store`, `settings-store`, `command-store`
- `src/renderer/hooks/` — Custom hooks: `use-shortcut`, `use-file-shortcuts`, `use-menu-action`, `use-scroll-sync`, `use-zen-mode`, `use-export-source`
- `src/renderer/components/modals/` — 30+ modal dialogs as React components
- `src/renderer/components/editor/` — CodeMirror 6 editor React wrapper
- `src/renderer/components/preview/` — Markdown renderer with Mermaid lazy loading
- `src/renderer/components/sidebar/` — React sidebar panels (FileTree, GitStatus, Outline, Snippets, Templates)
- `src/renderer/components/ui/` — shadcn/ui primitives (button, dialog, sheet, select, tabs, etc.)
- `src/renderer/lib/` — Utilities: typed IPC wrapper (`ipc.ts`), export modules, validators
- `src/renderer/types/` — TypeScript declarations: `electron.d.ts` (window.electronAPI), `ipc.ts` (IPC types)

### Security Model
- **`contextIsolation: true` + `nodeIntegration: false`** (properly secured, unlike master)
- Preload with explicit channel whitelisting
- TypeScript declarations ensure type-safe IPC
- Pandoc invoked via `execFile` (not `exec`)
- Permission handler: only `clipboard-read`/`clipboard-write` allowed
- ESLint enforces `no-eval`, `no-implied-eval`, `no-new-func`
- CSP in `index.html` restricts script/style/img/font/connect sources

### Plugin System (`src/plugins/`)
Unchanged from master. Manifest-based discovery, built-in `writing-studio` plugin.

## System Dependencies

| Dependency | Required | Notes |
|---|---|---|
| **Node.js** | >= 20 | Electron 41 bundles Node 20.x; Vite 8 requires Node 18+ |
| **Pandoc** | Yes (for exports) | Downloaded to `bin/<platform>/pandoc` via `scripts/download-tools.js` (v3.9.0.2). Falls back to system PATH. |
| **FFmpeg** | Bundled | `ffmpeg-static` npm package; `asarUnpacked` |
| **MiKTeX / TeX Live** | Optional | LaTeX PDF export; MiKTeX PATH injected on Windows |
| **ImageMagick** | Optional | Linux image conversion; deb dependency |
| **LibreOffice** | Optional | Enhanced document conversion; deb dependency |

## Development Commands

```bash
npm run dev                # Start dev mode: Vite dev server (port 5173) + Electron (concurrently)
npm run dev:renderer       # Vite dev server only (port 5173)
npm run dev:electron       # Electron only (waits for Vite on tcp:5173)
npm start                  # Launch Electron app (prod mode, requires built renderer)
npm run preview            # Build renderer then launch Electron
npm test                   # Jest — main process tests (vanilla JS)
npm run test:renderer      # Vitest — renderer tests (React/TS)
npm run lint               # ESLint check
npm run lint:fix           # ESLint auto-fix
npm run format             # Prettier write
npm run format:check       # Prettier check
npm run download-tools     # Download Pandoc binaries
npm run generate-icons     # Generate app icons
```

**Dev workflow:** `npm run dev` starts Vite (renderer HMR on `:5173`) and Electron concurrently. The main process loads from `http://localhost:5173` in dev mode.

## Build & Package

**Two-stage build process:**
1. `npm run build:renderer` — Vite builds renderer to `dist/renderer/`
2. `npm run build` — electron-builder packages main process + preload + built renderer

**Tool:** `electron-builder` (v26.0.12), config inline in `package.json`.

| Target | Platforms |
|---|---|
| `npm run build:win` | Windows: NSIS + portable + zip (x64) |
| `npm run build:mac` | macOS: dmg + zip (x64 + arm64) |
| `npm run build:linux` | Linux: deb + AppImage + snap |

**Packaged files:** `src/main/**`, `src/preload.js`, `src/plugins/**`, `package.json`. Renderer built output copied to resources as `renderer/`.

**Bundled with builds:** Pandoc binary per platform, FFmpeg (asarUnpacked).

**Output:** `dist/` directory.

**Auto-updater:** `electron-updater` with GitHub Releases (default) and optional ConcreteInfo self-hosted feed.

**CI:** GitHub Actions workflows in `.github/workflows/` (ci.yml, release.yml).

## Project Conventions / Gotchas

- **Dual-process architecture.** Main process is vanilla CommonJS JavaScript (`src/main/`). Renderer is React 19 + TypeScript + Tailwind (`src/renderer/`). They are separate build targets.
- **Vite for renderer only.** Main process is NOT bundled — Electron loads `src/main/index.js` directly. Do not add TypeScript to main process files.
- **Tailwind + shadcn/ui.** Use shadcn/ui components (`src/renderer/components/ui/`) for all UI primitives. Custom theme in `tailwind.config.js`. Path alias `@` maps to `src/renderer/`. Brand color: `#e5461f`.
- **Zustand for state.** All renderer state lives in `src/renderer/stores/`. Each store is a separate file. Use immer for immutable updates.
- **Typed IPC.** `src/renderer/types/electron.d.ts` declares `window.electronAPI`. `src/renderer/lib/ipc.ts` provides type-safe wrappers. When adding new IPC channels, update both the preload whitelist AND the TypeScript declarations.
- **Legacy + new sidebar.** `src/sidebar/*.js` (vanilla JS) and `src/renderer/components/sidebar/` (React TSX) both exist. New sidebar features go in the React version.
- **Pandoc is external.** Must be present for non-HTML/PDF exports. Download via `npm run download-tools` or install system-wide.
- **PDF export fallback chain:** xelatex -> pdflatex -> lualatex -> Electron built-in `printToPDF()`.
- **PDF rendering:** `pdfjs-dist` (viewer). **PDF manipulation:** `pdf-lib` in main process.
- **Editor:** CodeMirror 6, configured in `src/editor/codemirror-setup.js`, wrapped as React component in `src/renderer/components/editor/CodeMirrorEditor.tsx`.
- **Tests:** Jest (main process, `tests/**/*.test.js`, 15% threshold) + Vitest (renderer, `tests/**/*.{test,spec}.{ts,tsx}`, v8 coverage on `src/renderer/`).
- **ESLint flat config** with ECMAScript 2022. Prettier: 2-space, single quotes, semicolons, 100-char width.
- **No tsconfig.json at root** — TypeScript is renderer-only, handled by Vite. Do not add `tsconfig.json` for the main process.
- **File associations:** `.md`, `.markdown`, `.pdf` registered at install.
- **Single instance lock** via `app.requestSingleInstanceLock()`.
