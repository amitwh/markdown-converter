<p align="center">
  <img src="assets/markdown-converter-assets/logo-horizontal.svg" alt="Markdown Converter" width="420">
</p>

# MarkdownConverter

A powerful cross-platform Markdown editor and document converter powered by Pandoc, built with Electron 45 and Node 24. 100% open-source with no proprietary dependencies.

**Current release: v4.13.0** — quick switcher (Ctrl+P), inline AI assist (Cmd+K), a rebuilt visual flowchart generator (multi-select, alignment, SVG/PNG/JPG/VSDX export), and GitHub-based auto-updates.

## Features

### Markdown Editor
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/5f53ba94-7663-47c3-b12b-b7b8bd2645aa" />

- **Multi-tab editing** - Work on multiple files simultaneously
- **Live preview** - Real-time markdown rendering with syntax highlighting
- **Dynamic splitter** - Drag to resize editor and preview panes
- **37 themes** - Light, dark, and high-contrast themes including Atom One Light, Dracula, Nord, Sepia, and more
- **Find & Replace** - Search and replace with regex support
- **Line numbers** - Toggle line numbers in the editor
- **Auto-save** - Automatic saving every 30 seconds
- **Math support** - KaTeX integration for mathematical expressions

### PDF Viewer & Editor
<img width="1920" height="1032" alt="image" src="https://github.com/user-attachments/assets/f10f62be-af3d-496e-81df-37ab4f91abfd" />

- **Built-in PDF viewer** - Open and view PDF files directly in the app
- **Page navigation** - Navigate pages with keyboard or buttons
- **Zoom controls** - Zoom in/out, fit to width, fit to page
- **Rotation** - Rotate pages left or right
- **PDF Editor tools**:
  - Merge multiple PDFs
  - Split PDFs by page range
  - Compress PDFs
  - Rotate pages
  - Delete pages
  - Reorder pages
  - Add watermarks
  - Password protection
  - Remove passwords
  - Set permissions

### Export Options
- **PDF** - Export to PDF with customizable page sizes and orientation
- **DOCX** - Standard and Enhanced (template-based) Word export
- **ODT** - OpenDocument format
- **HTML** - Web-ready HTML export
- **PowerPoint** - PPTX presentation export
- **EPUB** - E-book format
- **LaTeX** - Academic document format
- **RTF** - Rich Text Format
- **Export themes** - Five visual styles (Modern, Classic, Sepia, Minimal, Elegant) for PDF and Word exports — recolored headings, links, and fonts

### Advanced Features
- **Custom headers & footers** - Add headers/footers to exports with dynamic fields
- **Page size configuration** - A3, A4, A5, B4, B5, Letter, Legal, Tabloid, or custom sizes
- **Visual flow chart editor** - Build Mermaid flowcharts visually; drag nodes, connect edges, live preview. Insert at cursor (Ctrl+Alt+F opens the standalone generator).
- **Quick switcher** - Ctrl+P fuzzy search across open tabs and recent files, with workspace search when a folder context is available.
- **Daily notes** - Ctrl+Alt+D opens today's note from a configurable daily-notes folder/template.
- **Batch conversion** - Convert entire folders of markdown files
- **ASCII Art Generator** - 17 hand-coded fonts + 400+ FIGlet fonts; text banners, boxes, and templates; insert into editor, copy to clipboard, or save to file (Ctrl+Shift+A)
- **Word templates** - Use custom Word templates for enhanced exports
- **Import documents** - Import from 30+ formats (DOCX, PDF, HTML, etc.)
- **MarkItDown import** - Any file → Markdown via [Microsoft MarkItDown](https://github.com/microsoft/markitdown). Bundled in release builds when its PyInstaller bundle is present (MIT + embedded PSF Python runtime); otherwise the app falls back to a system `markitdown`. Core formats: PDF, DOCX, PPTX, XLSX, Outlook `.msg`, EPUB, HTML, images, ZIP, CSV, JSON, XML. For **audio transcription** and **OCR**, install `markitdown[all]` system-side (multi-GB ML models; not bundled).
- **Excel export** - Markdown tables to native .xlsx workbooks (one sheet per table)
- **AI Assistant** - Multi-provider AI help (OpenAI/Anthropic/Ollama/LM Studio): chat panel, inline Cmd+K rewrite/shorten/expand, summarize/improve/translate commands, grammar proofreading
- **Inline comments** - Anchor-based document comments in `.comments/` sidecars with F8 navigation
- **Wiki-links & Backlinks** - `[[Note]]` links with click-to-create and a "what links here?" panel (local knowledge base)
- **Crash recovery** - Session restore of open tabs and unsaved buffers after a crash
- **Version history** - Automatic pre-save snapshots with restore/diff/delete from the History panel
- **Vim mode & snippet expansion** - Vim keybindings toggle; Tab expands saved snippets
- **Quick Note** - Global scratchpad (Ctrl+Alt+Q) that appends to `notes/quick-notes.md`
- **Real PDF encryption** - Password protection, removal, and permissions actually work
- **Auto-update** - Checks GitHub releases via `electron-updater` (Help → Check for Updates)
- **Offline math & diagrams** - KaTeX is bundled; PlantUML renders locally when the CLI is installed, otherwise through the PlantUML server

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) **v24 or later** (see `engines` in `package.json`) — development and builds only
- [Pandoc](https://pandoc.org/installing.html) **3.9.0.2** — bundled in release builds; in a source checkout run `npm run download-tools` (the app also falls back to a system Pandoc on `PATH`)
- [MarkItDown](https://github.com/microsoft/markitdown) — bundled in release builds when `npm run bundle:markitdown` succeeds; otherwise the app uses a system `markitdown`. Core formats: PDF / DOCX / PPTX / XLSX / Outlook / EPUB / HTML / images / ZIP / CSV / JSON / XML
- Optional for advanced import only: `pip install "markitdown[all]"` adds **audio transcription** (Whisper) and **OCR** (EasyOCR/Tesseract) — multi-GB model downloads, not bundled

### Install Dependencies
```bash
npm install
npm run download-tools   # fetches Pandoc 3.9.0.2 for the host platform
```

### Run the Application
```bash
npm start
```

### Build for Distribution
```bash
npm run download-tools        # once per platform
npm run bundle:markitdown     # optional, bundles MarkItDown for this host
npm run build:win             # or build:mac / build:linux
```

Build output goes to `dist/`. Linux produces deb + AppImage + snap; Windows produces NSIS + portable + zip; macOS produces a dmg.

## Development

```bash
npm test                   # Jest — 106 suites, ~1,330 tests
npm run test:coverage
npm run lint               # ESLint (flat config)
npm run format             # Prettier
npm run build:bundle       # regenerate the flowchart browser bundle
npm run release:local      # new version + local deb/AppImage (then tag-push for CI)
```

`release:local` refuses a dirty tree, runs tests and lint, bumps the patch
version, stamps `buildInfo` (date + commit) for the About dialog, tags the
release, and builds `dist/*.deb` + `dist/*.AppImage`. Add `-- --bump minor`
for a minor release, or `-- --publish` to push the branch and tag so GitHub
Actions creates the release.

| Path | Contents |
|---|---|
| `src/main.js`, `src/main/` | Electron main process, IPC, export/conversion pipeline |
| `src/preload.js` | IPC bridge for the auxiliary windows |
| `src/renderer.js`, `src/renderer/` | Renderer entry, tabs, preview, dialogs, feature controllers |
| `src/sidebar/`, `src/editor/`, `src/flowchart/` | Panels, CodeMirror setup, flowchart model/geometry/export |
| `src/plugins/` | Plugin loader/registry plus built-in plugins |
| `tests/` | Jest suites (`tests/main/` uses the Node environment) |
| `scripts/` | Tool download, MarkItDown bundling, flowchart bundling, icons |

Architecture, security model, packaging details, and known issues live in
[`CLAUDE.md`](CLAUDE.md); build tooling is documented in
[`scripts/README.md`](scripts/README.md).

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New File | Ctrl+N |
| Open File | Ctrl+O |
| Open PDF | Ctrl+Shift+O |
| Save | Ctrl+S |
| Save As | Ctrl+Shift+S |
| Export | Ctrl+E |
| Quick Switcher | Ctrl+P |
| Print | File → Print (no default shortcut) |
| Print Preview | File → Print → Print Preview |
| Find | Ctrl+F |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z |
| New Tab | Ctrl+T |
| Close Tab | Ctrl+W |
| Toggle Preview | Ctrl+Shift+V |
| Zoom In | Ctrl+Shift++ |
| Zoom Out | Ctrl+Shift+- |
| Command Palette | Ctrl+Shift+P |
| Zen Mode | F11 |
| Writing Analytics | Command Palette only (Ctrl+Shift+A belongs to ASCII Art) |
| Quick Note | Ctrl+Alt+Q |
| Universal Converter | Ctrl+Shift+C |
| Table Generator | Ctrl+Shift+T |
| ASCII Art Generator | Ctrl+Shift+A |
| Daily Notes | Ctrl+Alt+D |
| Flowchart Generator | Ctrl+Alt+F |
| Next Comment | F8 |
| Add Comment at Cursor | Ctrl+Alt+M |
| Flowchart window: Undo | Ctrl+Z |
| Flowchart window: Redo | Ctrl+Shift+Z |
| Flowchart window: Delete selected | Delete |

## Themes

37 built-in editor themes, registered in `src/main/ThemeRegistry.bootstrap.js`.

### Light (14)

| Theme | Id |
|---|---|
| Atom One Light (Default) | `atomonelight` |
| GitHub Light | `github` |
| Light | `light` |
| Solarized Light | `solarized` |
| Gruvbox Light | `gruvbox-light` |
| Ayu Light | `ayu-light` |
| Sepia | `sepia` |
| Paper | `paper` |
| Rose Pine Dawn | `rosepine-dawn` |
| Concrete Light | `concrete-light` |
| Catppuccin Latte | `catppuccin-latte` |
| One Light | `one-light` |
| Winter is Coming (Light) | `winter-is-coming-light` |
| Spring Light *(seasonal)* | `spring-light` |

### Dark (22)

| Theme | Id |
|---|---|
| Dark | `dark` |
| One Dark | `onedark` |
| Dracula | `dracula` |
| Nord | `nord` |
| Monokai | `monokai` |
| Material | `material` |
| Gruvbox Dark | `gruvbox-dark` |
| Tokyo Night | `tokyonight` |
| Palenight | `palenight` |
| Ayu Dark | `ayu-dark` |
| Ayu Mirage | `ayu-mirage` |
| Oceanic Next | `oceanic-next` |
| Cobalt2 | `cobalt2` |
| Concrete Dark | `concrete-dark` |
| Concrete Warm | `concrete-warm` |
| Catppuccin Frappé | `catppuccin-frappe` |
| Catppuccin Macchiato | `catppuccin-macchiato` |
| Catppuccin Mocha | `catppuccin-mocha` |
| Tokyo Night Storm | `tokyo-night-storm` |
| Synthwave '84 | `synthwave-84` |
| Outrun | `outrun` |
| Winter is Coming (Dark) | `winter-is-coming-dark` |

### High-Contrast (1)

| Theme | Id |
|---|---|
| Solarized Dark (High Contrast) | `solarized-dark-hc` |

The currently-selected theme persists across restarts in `<userData>/settings.json` (key `theme`, default `atomonelight`). Adding a new theme is one `register()` call in the bootstrap plus one CSS file under `src/styles/themes/`.

## PDF Viewer

Open PDF files directly in MarkdownConverter:
- **File > Open PDF** or **Ctrl+Shift+O**
- Navigate pages with arrow buttons or page input
- Zoom controls: +/- buttons, Fit Width, Fit Page
- Rotate pages left or right
- Close PDF to return to editor

## Bundled Dependencies, Legal Notices & Credits

MarkdownConverter ships as a self-contained package. Everything needed for the
core workflows is **bundled**; a few large optional tools are detected from
the system when present.

### Bundled with the app

| Component | License | Role |
|---|---|---|
| [Pandoc](https://pandoc.org) 3.9.0.2 | GPL-2.0+ (separate process) | 25+ export/import formats |
| [FFmpeg](https://ffmpeg.org) (via ffmpeg-static) | GPL-3.0+ build (separate process) | audio/video tools |
| [MarkItDown](https://github.com/microsoft/markitdown) (MIT) + embedded Python runtime (PSF) | MIT / PSF | any-file → Markdown import (PDF/DOCX/PPTX/XLSX/Outlook/EPUB/images/ZIP) |
| [sharp](https://sharp.pixelplumbing.com) + libvips | Apache-2.0 / LGPL-2.1+ (dynamic) | image tools |
| [KaTeX](https://katex.org), [marked](https://marked.js.org), [highlight.js], [DOMPurify], [mermaid], [CodeMirror 6], pdf-lib (@cantoo fork), pdfjs-dist, JSZip, simple-git | MIT / Apache-2.0 / BSD-3 / MPL-2.0 | editor, preview, PDF, Git |
| JetBrains Mono & Fira Code fonts | SIL OFL 1.1 | editor typography |

GPL-licensed tools run as **separate processes** (never linked into the app)
and their complete corresponding sources are offered in
[SOURCES.md](SOURCES.md). Full details: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md),
also available inside the app under **Help → Third-Party Notices & Licenses**.

### Not bundled (used when installed)

LibreOffice (Office conversion), MiKTeX/TeX Live (LaTeX PDF), ImageMagick
(extra image formats), PlantUML + Java (local diagrams), Calibre (MOBI),
MarkItDown `[all]` extras (audio transcription / OCR).

### Credits

Built on open source: [Electron], [CodeMirror], [marked], [KaTeX],
[highlight.js], [DOMPurify](https://github.com/cure53/DOMPurify),
[mermaid](https://mermaid.js.org), [pdf-lib], [pdf.js](https://mozilla.github.io/pdf.js/),
[sharp]/libvips, [Pandoc], [FFmpeg], [MarkItDown] by Microsoft,
[simple-git], [JSZip], [JetBrains Mono], [Fira Code]. Thank you to all their
authors and maintainers.

[Electron]: https://www.electronjs.org
[CodeMirror]: https://codemirror.net
[marked]: https://marked.js.org
[KaTeX]: https://katex.org
[highlight.js]: https://highlightjs.org
[pdf-lib]: https://pdf-lib.js.org
[sharp]: https://sharp.pixelplumbing.com
[Pandoc]: https://pandoc.org
[FFmpeg]: https://ffmpeg.org
[MarkItDown]: https://github.com/microsoft/markitdown
[simple-git]: https://github.com/steveukx/git-js
[JSZip]: https://stuk.github.io/jszip/
[JetBrains Mono]: https://www.jetbrains.com/lp/mono/
[Fira Code]: https://github.com/tonsky/FiraCode

## Open Source

MarkdownConverter's application code is MIT-licensed. Third-party components keep
their own licenses; the GPL-licensed tools (Pandoc, FFmpeg) run as separate
processes and their sources are offered in [SOURCES.md](SOURCES.md). Main
components:
- **Electron** - MIT License
- **pdf-lib** (`@cantoo` fork) - MIT License
- **pdfjs-dist** - Apache 2.0 License
- **marked** - MIT License
- **highlight.js** - BSD 3-Clause License
- **DOMPurify** - Apache 2.0/MIT License
- **docx** - MIT License
- **JSZip** - MIT or GPLv3 License

## License

MIT License - see LICENSE file for details.

## Author

Amit Haridas (amit.wh@gmail.com)

## Version

v4.13.0
