# MarkdownConverter — Web Version (Future Plan)

> **Status:** approved direction, **not started**. Written 2026-11-21 on `master` @ `6ecd480` (v4.17.3).
> Read this together with `CLAUDE.md` (architecture, security model, export matrix).

## Goal

Serve MarkdownConverter at a URL from Coolify, sharing as much code as possible with the
desktop app, without weakening the desktop app's security posture or forking the codebase
into two divergent products.

## Non-goals

- Feature-for-feature parity with the desktop app in phase 1.
- Replacing the Electron app. Desktop stays the primary product.
- Running the desktop app on a server and streaming its screen (VNC / Guacamole) — rejected:
  one session per user, heavy, laggy, and it exposes the whole main process.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Branch strategy | **New branch (`web`) cut from `master`** | Avoids inheriting `react-electron`'s Electron-bound renderer |
| `react-electron` branch | **Retired** for this purpose | It is React + Vite but still `electron .` — a desktop restructure, not a web build; 216 ahead / 204 behind master, so merging it is a large divergent project that still produces no URL |
| Sequencing | **Phase 1 = browser-only PWA**, Phase 2 = optional conversion API | Phase 1 is servable as a static container with no new attack surface; phase 2 is the only path to Pandoc parity |

Nothing on `react-electron` is executed by this plan, but its `src/adapters/types.js`
(`FileSystemAdapter`, `ConversionAdapter` seams) is a useful shape to borrow — see §Adapters.

## Why this is a second product, not a build flag

The renderer is thin; the value lives in the main process spawning external tools. Measured
on `master` @ `6ecd480`:

| Coupling | Count |
|---|---|
| `ipcMain` handlers in `src/main.js` | 134 |
| `execFile` call sites | 14 |
| Pandoc references | 159 |
| Filesystem calls (`src/main.js` alone) | 105 |
| External binaries | `pandoc`, `ffmpeg`, `soffice`, `markitdown`, `magick`, `git`, `pdflatex`, `xelatex`, `ebook-convert`, `plantuml` |

A browser has none of these. Hence the two-phase split.

## Feature split (what actually works in a tab)

Libraries verified present in `package.json` — all are browser-native already:

| Capability | Source in repo | Works in browser |
|---|---|---|
| Markdown editing | CodeMirror 6 (`src/editor/codemirror-setup.js`) | ✅ |
| Preview pipeline | `marked` 18, `DOMPurify` 3.4, `KaTeX` 0.19, `mermaid` 12 | ✅ |
| 37 editor themes | `src/styles/themes/*.css` | ✅ |
| Find & replace, table generator | `src/renderer.js`, `table-generator.html` | ✅ |
| PDF viewing | `pdfjs-dist` 6 | ✅ |
| PDF editing (merge/split/rotate/delete/reorder/encrypt/decrypt/watermark) | `pdf-lib` (`@cantoo`) | ✅ pure JS |
| Flowchart editor | `src/flowchart-editor/` + `@maxgraph/core` (bundled) | ✅ maxGraph is a browser library |
| ASCII art | `figlet` 1.12 (`src/main/AsciiArt*`) | ✅ |
| Export HTML / Markdown / print-to-PDF | `marked` + browser print | ✅ |
| ZIP import/export of a workspace | `jszip` | ✅ |
| **Pandoc formats** (DOCX, ODT, EPUB, ODP, PPTX, Beamer, JATS, AsciiDoc, RST, MediaWiki, Org, Textile, LaTeX, RTF, Man, CSV/XLSX) | `src/main.js` + `PandocArgs` | ❌ phase 2 |
| **FFmpeg** audio/video | `ffmpeg-static` | ❌ out of scope |
| **MarkItDown** import | PyInstaller bundle / system | ❌ phase 2 (server) |
| **LibreOffice** ODP chain | `soffice` | ❌ phase 2 (server) |
| Git panel | `simple-git` | ❌ server-only, if ever |
| Local folder batch conversion | Node `fs` | ⚠️ partial: File System Access API (Chromium) |

## Phase 1 — Browser-only PWA

**Target:** a static build served by nginx from Coolify; no backend, no user data leaves the tab.

### 1. Scaffold
- New branch `web` from `master`.
- Vite + React 19 + TypeScript frontend (per `ci-app-blueprint`); `src/web/` to keep it clearly
  separate from the Electron `src/`.
- Reuse assets as-is: `src/styles/themes/*.css`, `assets/`, `src/styles/tokens.css`.
- Do **not** import anything from `src/main.js`, `src/preload.js`, or `src/renderer.js`.
  Reuse only: `src/flowchart-editor/` modules, `src/ascii-controller.js` logic, pure helpers in
  `src/flowchart/`, `src/quick-switcher/` matcher, `src/editor/codemirror-setup.js`.

### 2. Adapters (the only new abstraction)
Define one interface the UI talks to, with two implementations:

```ts
interface PlatformAdapter {
  pickDocument(): Promise<{ name: string; text: string } | null>;
  saveDocument(name: string, text: string): Promise<void>;
  listWorkspace?(): Promise<WorkspaceEntry[]>;   // File System Access API, Chromium only
  convert?(doc: string, format: string): Promise<Blob>;  // phase 2
}
```
- `BrowserAdapter` (phase 1): File System Access API with `<input type=file>` + download fallback.
- `HttpAdapter` (phase 2): talks to the conversion API.
- The UI must treat `convert === undefined` as "show a 'Requires desktop app' affordance",
  never as a silent failure.

### 3. Surfaces to port (in order)
1. Editor shell + tabs + preview (CodeMirror, marked, KaTeX, Mermaid, themes).
2. File open/save/download; unsaved-changes guard.
3. PDF viewer (pdfjs) and the pdf-lib tool set (merge/split/rotate/delete/reorder/password).
4. Flowchart editor — reuse the existing esbuild bundle; add open/save/download.
5. ASCII art studio.
6. Table generator.
7. Print-to-PDF export; Markdown/HTML download.

### 4. Explicit non-features
Everywhere Pandoc/FFmpeg/MarkItDown would be needed, show a disabled control with
"Available in the desktop app" — never a half-working path.

### 5. Acceptance criteria
- `npm run build` produces a static bundle servable by nginx with no server.
- Offline-capable: `manifest.json` (`theme_color: #e5461f`), service worker caching the shell.
- CSP set in the served HTML (no `unsafe-eval`; the desktop app's CSP is deliberately loose and
  must not be copied — see `CLAUDE.md` §Security Model).
- No `nodeIntegration`, no Node globals, no `require` in the bundle.
- Lighthouse: no console errors, installable as PWA.

## Phase 2 — Conversion API (only for Pandoc parity)

**Do not** wrap `src/main.js` behind HTTP. That process runs with `nodeIntegration: true`, 134
IPC handlers, filesystem access and an `execute-code` REPL — exposing it is an RCE giveaway.

Instead:
- New service (`api/`, FastAPI or Express) exposing `/api/v1/convert` + `/api/v1/import`.
- Same approach as the desktop app: `execFile` with fixed argv (never shell strings), the
  `PANDOC_EXPLICIT_WRITERS` map from `src/main.js`, `DataExport` for YAML/TOML, JATS via `-t jats -s`.
- Container image ≈ 1 GB with `pandoc`, `ffmpeg`; LibreOffice only if ODP/PPTX is in scope.
- Hard requirements before it faces the internet: auth, per-request size and time limits
  (desktop uses 50 MB / 120 s), temp-dir isolation per request, no network egress from the
  conversion process, and a rate limiter that actually covers every route.
- Licensing: Pandoc (GPL-2.0+) and FFmpeg (GPL-3.0) run as **separate processes**, so serving
  them over HTTP creates no network-copyleft obligation. Keep `SOURCES.md`/third-party notices
  reachable from the web client.

## Deployment notes (Coolify)

- Phase 1: static site container (`nginx` serving `dist/`), `/assets/` immutable + `=404`,
  `index.html` no-cache, SPA fallback. No DB, no env secrets.
- Phase 2: same vhost, `/api/` proxied to the conversion service; named volume or tmpfs for
  per-request work dirs.
- Both under the `concreteinfo` project; see `ci-coolify-infra`.

## Open questions (resolve before phase 1 implementation)

1. **Auth?** Phase 1 needs none (everything is client-side). Phase 2 must decide: public
   with quotas, or the App Licensing Service SSO used by other ConcreteInfo apps.
2. **Does the web build ship the sidebar panels** (outline, backlinks, history, daily notes)?
   Most are localStorage-able; git and version-history-as-files are not.
3. **One codebase or two?** Phase 1 shares assets/modules but not the renderer. If the React
   web app proves better, decide later whether the desktop app adopts it (that is the
   `react-electron` branch's original thesis — revisit then, not now).
4. **Executive/publish shortcut:** the smallest possible web deliverable is a "Publish to web"
   action in the desktop app producing a self-contained HTML page. Consider if a URL is needed
   sooner than phase 1 completes.

## Rough effort

| Phase | Scope | Estimate |
|---|---|---|
| 1 | Editor + preview + themes + PDF toolkit (no flowchart) | ~2–3 weeks |
| 1b | Flowchart + ASCII + table generators | ~1–2 weeks |
| 2 | Conversion API + auth + hardening | ~3–4 weeks |

## Verification checklist for phase 1

- [ ] `npm run build` output served by `nginx:alpine` with no Node at runtime
- [ ] Bundle contains no `require(`, no `process.`, no `nodeIntegration` remnants
- [ ] Every Pandoc-only control is disabled with a clear "desktop app" affordance
- [ ] PDF operations round-trip: merge → split → rotate → encrypt → decrypt produces valid files
- [ ] Flowchart open/save round-trips `.flowjson`; SVG/PNG export works
- [ ] Works offline after first load; PWA installs
