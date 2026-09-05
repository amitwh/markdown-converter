# Third-Party Notices & Licenses

MarkdownConverter (this app) is MIT-licensed. This document lists the
third-party components that are **distributed with** the application, their
licenses, and where to obtain source code. Full license texts for the
copyleft and font licenses referenced here are in the `third-party-licenses/`
folder shipped alongside this file (and in the source repository).

This product includes software developed by third parties under the licenses
below. Copyright and license notices are reproduced verbatim or referenced
per each license's terms.

---

## 1. This application

**MarkdownConverter** — Copyright (C) 2024-2025 ConcreteInfo (Amit Haridas) —
MIT License. See the repository `LICENSE` file.

---

## 2. Bundled external binaries

These run as separate operating-system processes, launched via `execFile`
with literal argv (never a shell, never linked into the app).

| Component | Version | License | Notes |
|---|---|---|---|
| Pandoc | 3.9.0.2 | GPL-2.0-or-later | Downloaded at build time by `scripts/download-tools.js` (SHA-256 pinned); license: [GPL-2.0](third-party-licenses/GPL-2.0.txt) |
| FFmpeg | bundled by `ffmpeg-static` 5.3.0 | **GPL-3.0-or-later build** (`--enable-gpl --enable-libx264/x265`) | License text: <https://ffmpeg.org/legal.html>; source offer below |
| MarkItDown | 0.1.7 (+ Python deps) | MIT | Microsoft's any-file→Markdown importer, frozen with PyInstaller by `scripts/bundle-markitdown.js`; includes an embedded CPython runtime (PSF license) |
| sharp / libvips prebuilt binaries | 0.35.4 | Apache-2.0 / **LGPL-2.1-or-later** (libvips) | Dynamically loaded native addon; LGPL compliance: this app's full MIT source is public, enabling relinking; license: [LGPL-2.1](third-party-licenses/LGPL-2.1.txt) |
| KaTeX (CSS + fonts) | 0.18.5 | MIT | `assets/katex/` |
| JetBrains Mono, Fira Code fonts | — | SIL OFL 1.1 | `assets/fonts/`; license: [OFL-1.1](third-party-licenses/OFL-1.1.txt) |
| Electron | 41.x | MIT | and its bundled Chromium (BSD-style licenses) / Node.js (MIT) / OpenSSL (Apache-2.0) — see <https://www.electronjs.org/blog/electron-licensing> |

### GPL source availability (GPL §3 offer)

Corresponding source for every GPL-licensed binary distributed with this app
is available on written request and from these permanent locations — see
**[SOURCES.md](SOURCES.md)** for exact versions and URLs.

### Python packages inside the bundled MarkItDown binary

The frozen MarkItDown binary embeds CPython and (each MIT/Apache-2.0/BSD-3/
PSF/MPL-2.0 licensed unless noted): markitdown, onnxruntime (MIT), numpy
(BSD-3), magika (Apache-2.0), beautifulsoup4 / soupsieve (MIT), requests
(Apache-2.0) + urllib3/idna/charset-normalizer, certifi (MPL-2.0),
markdownify, defusedxml (PSF), protobuf (BSD-3), flatbuffers (Apache-2.0),
pdfminer.six (MIT), python-docx, python-pptx, openpyxl, extract-msg,
markdown-it-py / mdurl, pyinstaller (GPL-2.0-with-exception — build tool
only; its bootloader is embedded, source offer included in SOURCES.md),
Packaging, six, click, chardet (LGPL — dynamically loadable Python module).

---

## 3. npm dependencies shipped in the app (runtime)

| Package | Version | License |
|---|---|---|
| @cantoo/pdf-lib | 2.9.1 | MIT |
| @codemirror/* (autocomplete, commands, lang-*, language, lint, search, state, theme-one-dark, view), codemirror | 6.x | MIT |
| @replit/codemirror-vim | 6.4.0 | MIT |
| core-util-is | 1.0.3 | MIT |
| docx | 9.6.1 | MIT |
| dompurify | 3.4.14 | (MPL-2.0 OR Apache-2.0) |
| electron-store | 10.1.0 | MIT |
| ffmpeg-static | 5.3.0 | GPL-3.0-or-later (binary; see §2) |
| highlight.js | 11.11.1 | BSD-3-Clause |
| html2pdf.js | 0.14.0 | MIT |
| jszip | 3.10.1 | (MIT OR GPL-3.0-or-later) |
| katex | 0.18.5 | MIT |
| marked, marked-footnote, marked-highlight | 17.x / 1.4 / 2.2 | MIT |
| mermaid | 11.17.2 | MIT |
| pdfjs-dist | 5.5.207 | Apache-2.0 |
| pdfkit | 0.17.2 | MIT |
| pizzip | 3.2.0 | (MIT OR GPL-3.0) |
| sharp | 0.35.4 | Apache-2.0 (+ LGPL libvips binaries; see §2) |
| simple-git | 3.36.0 | MIT |
| tslib | 2.8.1 | 0BSD |

(Development-only dependencies — electron-builder, eslint, prettier, jest,
cross-env, @testing-library/dom — are not distributed with the application.)

## 4. Optional external tools (NOT bundled)

These are detected and used when the user installs them; no copy is
distributed with this app, so no redistribution obligations arise:

- **LibreOffice** (MPL-2.0) — enhanced Office-format conversion
- **MiKTeX / TeX Live** (LPPL/GPL per component) — LaTeX PDF export
- **ImageMagick** (Apache-2.0-style) — extra image formats in the universal converter
- **PlantUML** (GPL-3.0) + a Java runtime — local diagram rendering
- **Calibre** (`ebook-convert`) — MOBI export
- **System MarkItDown with `[all]` extras** — audio transcription / OCR

## 5. Trademarks

Product names used to describe compatibility (Pandoc, FFmpeg, LibreOffice,
MarkItDown, Microsoft, Excel, Word, PowerPoint…) are trademarks of their
respective owners and are not affiliated with this project.

## 6. License texts

See the `third-party-licenses/` directory: `GPL-2.0.txt`, `LGPL-2.1.txt`,
`MPL-2.0.txt`, `Apache-2.0.txt`, `OFL-1.1.txt`, `PSF-Python.txt`. MIT and
BSD-3-Clause texts are short and reproduced in each package's own repository;
per-package LICENSE files also ship inside `node_modules/` in source form.
