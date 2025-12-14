# PanConverter - Updates & Changelog

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
