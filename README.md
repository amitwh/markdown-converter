# MarkdownConverter

A powerful cross-platform Markdown editor and document converter powered by Pandoc, built with Electron. 100% open-source with no proprietary dependencies.

## Features

### Markdown Editor
- **Multi-tab editing** - Work on multiple files simultaneously
- **Live preview** - Real-time markdown rendering with syntax highlighting
- **Dynamic splitter** - Drag to resize editor and preview panes
- **25+ themes** - Light and dark themes including Atom One Light, Dracula, Nord, Sepia, and more
- **Find & Replace** - Search and replace with regex support
- **Line numbers** - Toggle line numbers in the editor
- **Auto-save** - Automatic saving every 30 seconds
- **Math support** - KaTeX integration for mathematical expressions

### PDF Viewer & Editor
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

### Advanced Features
- **Custom headers & footers** - Add headers/footers to exports with dynamic fields
- **Page size configuration** - A3, A4, A5, B4, B5, Letter, Legal, Tabloid, or custom sizes
- **Batch conversion** - Convert entire folders of markdown files
- **ASCII Art Generator** - Create text banners and diagrams
- **Word templates** - Use custom Word templates for enhanced exports
- **Import documents** - Import from 30+ formats (DOCX, PDF, HTML, etc.)

## Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or later)
- [Pandoc](https://pandoc.org/installing.html) (required for export functionality)

### Install Dependencies
```bash
npm install
```

### Run the Application
```bash
npm start
```

### Build for Distribution
```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New File | Ctrl+N |
| Open File | Ctrl+O |
| Open PDF | Ctrl+Shift+O |
| Save | Ctrl+S |
| Save As | Ctrl+Shift+S |
| Export | Ctrl+E |
| Print | Ctrl+P |
| Find | Ctrl+F |
| Undo | Ctrl+Z |
| Redo | Ctrl+Shift+Z |
| New Tab | Ctrl+T |
| Close Tab | Ctrl+W |
| Toggle Preview | Ctrl+Shift+P |
| Zoom In | Ctrl+Shift++ |
| Zoom Out | Ctrl+Shift+- |

## Themes

### Light Themes
- Atom One Light (Default)
- GitHub Light
- Light
- Solarized Light
- Gruvbox Light
- Ayu Light
- Sepia
- Paper
- Rose Pine Dawn
- Concrete Light

### Dark Themes
- Dark
- One Dark
- Dracula
- Nord
- Monokai
- Material
- Gruvbox Dark
- Tokyo Night
- Palenight
- Ayu Dark
- Ayu Mirage
- Oceanic Next
- Cobalt2
- Concrete Dark
- Concrete Warm

## PDF Viewer

Open PDF files directly in MarkdownConverter:
- **File > Open PDF** or **Ctrl+Shift+O**
- Navigate pages with arrow buttons or page input
- Zoom controls: +/- buttons, Fit Width, Fit Page
- Rotate pages left or right
- Close PDF to return to editor

## Open Source

MarkdownConverter is 100% open-source. All dependencies are permissively licensed:
- **Electron** - MIT License
- **pdf-lib** - MIT License
- **pdfjs-dist** - Apache 2.0 License
- **marked** - MIT License
- **highlight.js** - BSD 3-Clause License
- **dompurify** - Apache 2.0/MIT License
- **docx** - MIT License
- **xlsx** - Apache 2.0 License (SheetJS Community Edition)

## License

MIT License - see LICENSE file for details.

## Author

Amit Haridas (amit.wh@gmail.com)

## Version

v3.0.0
