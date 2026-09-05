# PanConverter - Updates & Changelog

## Version 4.7.1 (2026-09-05)

### New: Export Themes (Word + PDF)
- Theme picker in the export dialog (basic and advanced mode) for PDF and DOCX:
  **Default (Pandoc), Modern, Classic, Sepia, Minimal, Elegant**
- PDF: LaTeX header recolors/reformats headings + links (xcolor/titlesec,
  core-TeX packages only); DOCX: styles.xml surgery recolors Heading1-6/Title/
  Subtitle/Hyperlink and swaps heading/body fonts
- Themes persist in export presets; unknown ids in old presets fall back to
  Default instead of failing the export

### Branding
- New M↓ brand identity: app icons, favicons, tray icon, welcome mark,
  README wordmark (vector kit in assets/markdown-converter-assets/)

### Fixes
- **Windows**: pdfjs text/image extraction failed on Windows —
  standardFontDataUrl is now a proper file:// URL (raw backslash paths
  failed pdfjs's trailing-slash URL validation)
- **Windows**: sharp temp-file cleanup (EPERM retry), path-separator test
  assertions, and pdfjs test timeouts fixed — the Windows CI job is green
- FiraCode tooling downloads pinned to the immutable 6.2 release;
  .gitattributes stops CRLF checkout rewriting hash-pinned files
- macOS pandoc extractor locates the binary in the archive (layout changed)
- Packaged apps resolve bundled pandoc/markitdown next to the executable
  (resourcesPath lookup was wrong since 4.5 — packaged builds silently used
  system pandoc)

---

## Version 4.7.0 (2026-09-05)

### Bundling & Legal Compliance
- **MarkItDown is now bundled**: `npm run bundle:markitdown` freezes Microsoft's
  markitdown (MIT) + embedded Python runtime into a single ~75MB per-platform
  binary (`bin/<platform>/markitdown`) via PyInstaller (ML extras excluded);
  the app prefers the bundled binary and falls back to system installs
- Packaging copies the bundled markitdown for Windows/macOS/Linux alongside Pandoc
- **THIRD-PARTY-NOTICES.md** — full license inventory of everything distributed
  (bundled binaries, npm runtime deps, fonts, embedded Python packages)
- **SOURCES.md** — GPL §3(b) written source offer for Pandoc / FFmpeg (GPL build) /
  PyInstaller bootloader, with pinned versions + SHA-256; LGPL relinking note for libvips
- **third-party-licenses/** — canonical texts: GPL-2.0, LGPL-2.1, MPL-2.0,
  Apache-2.0, OFL-1.1, PSF-Python
- **Help → Third-Party Notices & Licenses** — in-app viewer for both documents
- **download-tools.js** now SHA-256 pins and verifies every downloaded artifact
  (post-download and against the cache on every run; hard-fails on mismatch)
- README gains a "Bundled Dependencies, Legal Notices & Credits" section
- Large optional tools intentionally NOT bundled (documented): LibreOffice,
  MiKTeX/TeX Live, ImageMagick, PlantUML+JRE, Calibre

---

## Version 4.6.1 (2026-09-05)

### New Features
- **MarkItDown import** — "File → Import with MarkItDown (Any Format)…" embeds
  Microsoft's [markitdown](https://github.com/microsoft/markitdown) (MIT) as an
  any-file → Markdown path: PDF, DOCX, PPTX, XLSX, Outlook .msg/.eml, EPUB,
  images, CSV/JSON/XML, ZIP; audio transcription and OCR with the `[all]` extras
  - Command auto-resolution: `markitdown` binary, then `python -m markitdown` /
    `python3 -m markitdown` (probed once, cached)
  - Same SEC-1 argv discipline as Pandoc (execFile only, paths never through a shell),
    50MB input cap, 120s timeout, path-sanitized errors that surface markitdown's
    actionable `pip install 'markitdown[...]'` hints
  - Output written next to the source as `<name>.md` (numeric suffix instead of
    overwriting) and opened in a new tab; `markitdown:available` / `markitdown:convert`
    IPC for future renderer flows
- **AI Assistant: Anthropic-compatible provider** — any base URL speaking the
  Anthropic messages schema (LiteLLM proxies, Bedrock gateways, local servers);
  x-api-key + Bearer auth, keyless proxies supported, tolerates bases with or
  without a trailing `/v1`

### Bug Fixes
- File → Open PDF crashed the PDF editor (null operation matched no section; now
  defaults to Merge)
- Backlinks panel required the wrong module path (failed at registration)
- writing-studio engines/panels now await their IPC-backed settings/file backends
  (eliminates `JSON.parse("[object Promise]")` crashes)
- Manuscript panel's window.prompt (unsupported in Electron) replaced with an
  inline dialog; collaboration comment store made async to match its IO

---

## Version 4.6.0 (2026-09-05)

### New Features

#### AI Assistant Plugin (multi-provider)
- Chat sidebar panel with rolling conversation history and insert-reply-into-document
- Providers: OpenAI, Anthropic, Ollama, LM Studio, and any OpenAI-compatible endpoint
- All provider traffic proxied through the main process — API keys never enter the renderer and the CSP stays closed to AI endpoints
- Commands: AI Summarize / Improve / Explain / Translate selection
- Answers the writing-studio `ai:analyze` contract, finally enabling the Proofread panel

#### Collaboration Plugin (inline comments)
- Anchor-based comments stored in `.comments/` sidecar files (never exported, never committed)
- Comments sidebar panel: add at cursor, list, resolve, delete, jump to anchor
- Drift detection flags moved/edited anchors; F8 navigates to the next open comment

#### Local Knowledge Base (wiki-links + backlinks)
- `[[Note]]`, `[[Note|alias]]`, `[[Note#section]]` render as links in the preview (code blocks excluded)
- Clicking a wiki-link opens the note or offers to create it
- Backlinks sidebar panel scans the folder (bounded BFS) for documents linking to the current one

#### Crash Recovery / Session Restore
- Open tabs (paths + unsaved buffer content) snapshotted to localStorage, debounced on edits, on tab changes, on unload, and once a minute
- Restore prompt on launch with per-tab restore, clean-fresh option, and 2MB content budget

#### Document Version History
- Every save snapshots the previous on-disk content to `<userData>/versions/`
- History sidebar panel: list, restore (with safety snapshot), unified diff vs. current, delete, manual "save version now"
- Per-document pruning (20 versions), path-hash storage, id-validated reads

#### Editor
- Vim keybindings (View → Vim Mode, persisted, live toggle via CodeMirror Compartment)
- Snippet Tab-expansion: type a snippet name and press Tab to insert it
- Zen Mode word-goal setter (the HUD progress bar finally has UI)

#### Export / Conversion
- **Real PDF encryption**: pdf-lib swapped for @cantoo/pdf-lib — encrypt/decrypt/permissions now actually work (UI auto-enables via the capability probe)
- **XLSX export**: markdown tables → native Excel workbook, one sheet per table (no Pandoc needed)
- **ODT headers/footers + page size**: real ODF styles.xml patching replaces the empty stub
- **Local PlantUML rendering**: diagrams render on-machine via the `plantuml` CLI when installed; plantuml.com stays as fallback
- **KaTeX bundled locally** (CSS + fonts): math renders offline, no CDN calls
- Writing heatmap (GitHub-style 30-day grid) in the writing-studio Goals panel

#### Platform
- Quick Note global scratchpad (Ctrl+Alt+Q, works when unfocused; appends to `notes/quick-notes.md`)
- Deep link protocol `markdownconverter://open?path=…`
- REPL confirmation dialog before first code execution per language per session (unsandboxed-execution guard rail)
- Writing-studio's four sidebar panels (Manuscript/Goals/Snapshots/Proofread) are now actually wired with rail icons
- Plugin sidebar panels get automatic rail icons via `registerPanel({icon})`

### Bug Fixes
- `Ctrl+Shift+P` collision: PDF (Enhanced) export now `Ctrl+Alt+Shift+P`; Command Palette keeps `Ctrl+Shift+P`
- Universal Converter's Pandoc tool no longer always reports "not installed" (`checkConverterAvailable` gained a pandoc case with bundled-binary check)
- CLI headless export: removed dangling `--css` / `--reference-doc` flags that made pandoc exit with an error; `--self-contained` replaced with `--standalone` (Pandoc 3.x)
- Removed dead "Open Export Options Dialog…" button from the converter dialog
- Removed duplicate `styles-zen.css` include

### Security
- AI provider requests carry size caps (200KB prompt), timeouts (120s), and user-safe error surfaces
- Version-history reads validate ids against traversal; history listing requires a valid document path
- PlantUML local rendering removes the diagram-text exfiltration path when a local CLI exists (CVE-MC-007 follow-up)

### Tests
- New suites: OdtStyling, AiProviders, ai-assistant prompts, collaboration comment-store, wiki-links/backlinks, session-store, XlsxExporter, VersionHistory
- PDFOperations encryption tests rewritten for the real-encryption reality

---

## Version 4.0.0 (2026-03-04)

### Major Changes
- **CodeMirror 6 Editor** — Replaced textarea with CodeMirror 6 featuring syntax highlighting, code folding, bracket matching, multiple cursors, and auto-indent
- **Sidebar Panel System** — Collapsible sidebar with File Explorer, Git, Snippets, and Templates panels
- **Command Palette** — Ctrl+Shift+P to search and execute all app actions
- **Code Execution (REPL)** — Run JavaScript, Python, and Bash code blocks directly from the preview

### New Features
- Print Preview dialog with paper size, orientation, margins, scale, and page range controls
- Image paste from clipboard and drag-drop support with auto-save to assets folder
- Document templates library (10 templates: blog post, meeting notes, tech spec, changelog, README, project plan, API docs, tutorial, release notes, comparison)
- Markdown extensions: footnotes, admonitions (note/warning/tip/danger/info), and [[toc]] table of contents
- PlantUML diagram rendering alongside Mermaid
- Welcome tab with onboarding and "What's New" feature showcase
- System spell checking with context menu suggestions and dictionary support
- Enhanced status bar with word count, character count, line/column, encoding, and language mode
- Grouped toolbar with visual section separators
- Breadcrumb bar showing current file path

### New Export/Import Formats
- Reveal.js slides (.html)
- Beamer slides (.pdf)
- Confluence/Jira wiki markup (.txt)
- MOBI e-books (via Calibre)
- Developer formats: JSON, YAML, XML, TOML

### Security
- Content Security Policy (CSP) meta tag
- File size validation (50MB limit)
- Error message sanitization (stripped file paths)
- Conversion rate limiting (2-second debounce)

### Dependencies Updated
- marked: 16.x to 17.x (with marked-highlight extension)
- pdfjs-dist: 3.x to 5.x (new worker model)
- html2pdf.js: 0.10 to 0.14
- pdfkit: 0.14 to 0.17
- dompurify, docx, and others updated to latest

### Testing
- 80 tests across 7 test suites
- New tests for sidebar manager, command palette, print preview, markdown extensions, and utility functions

### Breaking Changes
- Editor is now CodeMirror 6 (replaces textarea)
- marked API changed to use marked.use() instead of marked.setOptions()
- pdfjs-dist upgraded to v5 with new worker model

---

## Version 2.1.0 (December 14, 2025)

### 🎨 UI/UX Improvements

#### Subtle & Small Preview Popout Button
- Redesigned popout button with minimalist aesthetic
- Removed border for cleaner appearance
- Reduced size: 11px font, 2px×6px padding (previously 14px font, 4px×8px padding)
- Added opacity transition: 50% when idle, 100% on hover
- Subtle background effect on hover instead of heavy border styling
- **File**: `src/styles.css:195-211`

#### Simplified Table Headers in Preview
- Removed gradient background from table headers in modern theme
- Changed from `var(--primary-gradient)` (purple gradient) to simple light gray (#f0f0f0)
- Updated text color to dark (#333333) for better readability
- Clean, professional appearance matching standard themes
- **File**: `src/styles-modern.css:445-449`

### 📥 Enhanced Import Capabilities

#### Comprehensive Format-to-Markdown Conversion
Dramatically expanded the "Import Document" feature to support 30+ file formats:

**Supported Formats:**
- **Documents**: DOCX, ODT, RTF, HTML, HTM, TEX, EPUB, PDF, TXT
- **Presentations**: PPTX, ODP
- **Markup Languages**: RST, Textile, MediaWiki, Org-mode, AsciiDoc, TWiki, OPML
- **E-book Formats**: EPUB, FB2
- **LaTeX Formats**: TEX, LATEX, LTX
- **Web Formats**: HTML, HTM, XHTML
- **Wiki Formats**: MediaWiki, DokuWiki, TikiWiki, TWiki
- **Data Formats**: CSV, TSV, JSON

**Format-Specific Optimizations:**
- PDF text extraction with XeLaTeX engine
- CSV/TSV automatic table conversion
- JSON structure handling
- Improved error messages with format hints

**Access**: File → Import Document (Ctrl+I)
**File**: `src/main.js:1933-1994`

### 🎨 Exhaustive ASCII Art Generator

#### 5 New Text Banner Styles
Complete alphabet (A-Z) and numbers (0-9) support for all styles:

1. **Standard** - Classic ASCII art with slashes and underscores
2. **Banner** - Large format using # characters (7-line height)
3. **Block** - Modern Unicode block characters (█ ╔ ╗ ═ ║)
4. **Bubble** - Circular bubble letters (Ⓐ Ⓑ Ⓒ)
5. **Digital** - Digital display style (▄ ▀ ▐ ▌)

**File**: `src/renderer.js:3397-3537`

#### 19 Professional ASCII Templates
Organized into 4 categories with expanded options:

**Arrows & Flow (4 templates):**
- Arrow Right - Horizontal flow indicators
- Arrow Down - Vertical flow indicators
- Decision - Binary decision diagrams
- Process Flow - Multi-step process visualization

**Diagrams & Charts (6 templates):**
- Flowchart - Advanced flowchart with decision branches and loops
- Sequence - Sequence diagrams for User-System-Database interactions
- Network - Server-client network topology
- Hierarchy - Organizational tree structures
- Timeline - Milestone visualization with dates
- Table Simple - Basic table template with borders

**Boxes & Containers (4 templates):**
- Header - Section header with decorative borders
- Note Box - Important notes with rounded corners (┏━━┓)
- Warning Box - Warning messages with bold borders (╔═══╗)
- Info Box - Information boxes with subtle styling (╭───╮)

**Decorative Elements (6 templates):**
- Divider - Horizontal section separator (═══)
- Separator Fancy - Elegant rounded divider
- Brackets - Japanese-style brackets 【 】
- Banner Stars - Star-bordered banners
- Checklist - Task lists with ✓ checkmarks
- Progress Bar - Visual progress indicators

**Features:**
- All ASCII art automatically wrapped in code blocks for proper rendering
- Preserved formatting in markdown preview and all export formats
- Categorized template selection interface
- Real-time preview generation

**Access**: Tools → ASCII Art Generator
**Files**: `src/renderer.js:3513-3671`, `src/index.html:427-466`

### 📝 Technical Improvements

- Enhanced ASCII art detection in Word template exporter
- Improved monospace font rendering across all export formats
- Better code block preservation in PDF and Word exports
- Optimized template categorization and organization

### 🔧 Files Modified

- `src/styles.css` - Preview popout button styling
- `src/styles-modern.css` - Table header simplification
- `src/main.js` - Enhanced import function, version update
- `src/renderer.js` - ASCII art generator enhancements
- `src/index.html` - ASCII template UI organization
- `package.json` - Version bump to 2.1.0

---

## Version 2.0.0 (Previous Release)

### Major Features
- Export Profiles - Save and reuse export configurations
- Mermaid.js diagram support
- Command Palette (Ctrl+Shift+P)
- GitHub Light/Dark preview themes
- Table Generator
- ASCII Art Generator (basic)
- Resizable Preview Pane
- Pop-out Preview Window
- Configurable page sizes (A3-A5, B4-B5, Letter, Legal, Tabloid, Custom)
- Custom Headers & Footers for exports
- Enhanced PDF and Word export with templates
- 22 beautiful themes

### Core Capabilities
- Cross-platform markdown editor with live preview
- Universal document conversion (30+ formats)
- PDF Editor (merge, split, compress, rotate, watermark, encrypt)
- Batch file conversion
- File association support
- Advanced export options
- Multi-tab interface

---

## Installation & Usage

### Prerequisites
- **Pandoc** - Required for document conversion
- **Optional**: LibreOffice, ImageMagick, FFmpeg for universal converter

### Download
Get the latest release from: https://github.com/amitwh/pan-converter/releases

### Supported Platforms
- Windows (x64)
- Linux (AppImage, .deb, .snap)
- macOS (planned)

---

## Contributing

Contributions are welcome! Please see [CLAUDE.md](CLAUDE.md) for development guidelines.

**Author**: Amit Haridas (amit.wh@gmail.com)
**License**: MIT
**Repository**: https://github.com/amitwh/pan-converter
