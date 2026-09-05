# PanConverter - Updates & Changelog

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
