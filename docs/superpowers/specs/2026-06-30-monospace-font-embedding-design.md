# MarkdownConverter — Monospace Font Embedding Design

**Date:** 2026-06-30
**Status:** Approved
**Author:** Amit Haridas

## Overview

Guarantee proper ASCII character alignment in MarkdownConverter's preview and every supported export format (PDF, DOCX, HTML, plus ODT/RTF/EPUB/LaTeX), with no OS-level font dependency. The user can pick between **JetBrains Mono** (default) and **Fira Code**, and toggle ligatures (default off). Both font families are bundled inside the app, so alignment holds on every supported platform (Windows/macOS/Linux) without an internet connection, without system-wide font installation, and without the user touching anything system-level.

## Goals

1. ASCII art and code-block tables (e.g. `+----+----+` column delimiters) render at identical advance widths in the live preview **and** in every exported file.
2. No OS font dependency — TTFs ship inside the app.
3. Per-user choice of monospace family + ligature behaviour.
4. Self-contained exports: the exported PDF/DOCX/HTML file is portable to another machine and stays aligned.

## Non-Goals (v1)

- No font subsetting of TTFs (we ship the full file; xelatex subsets it into the PDF automatically; DOCX carriers get the full TTF in `word/fonts/`).
- No support for the user adding a third bundled font family.
- No PPTX or revealjs/Beamer ligature-toggle (PPTX is a slide format that rarely carries ASCII tables; revealjs/Beamer inherit HTML/LaTeX defaults).
- No licensed/commercial fonts (Fira Code and JetBrains Mono are both SIL OFL — confirmed in `assets/fonts/JetBrainsMono-LICENSE.txt`).

## Decisions Locked

| Decision | Choice | Reason |
|---|---|---|
| Scope | All export formats | All-surfaces alignment |
| DOCX strategy | Embed TTF into the DOCX zip | Truly portable; alignment holds even when the recipient lacks the font |
| PDF strategy | Pass TTF path to xelatex via `fontspec` (`\setmonofont[Path=...]`) | xelatex subsets the font into the PDF; reproducible across machines |
| Font choice | Both bundled; user-pickable in settings | Cover both preferences; default JetBrains Mono |
| Ligatures | Off by default; user toggle | Ligatures change advance widths and break ASCII grid alignment |
| License | SIL OFL (both families) | Embedding/bundling explicitly permitted when license travels with the binary (already present at `assets/fonts/JetBrainsMono-LICENSE.txt`) |

## Architecture

```
settings.json
    │
    │ (renderer + main read on init)
    ▼
CSS body classes:  .mono-jetbrains / .mono-fira
                   .mono-ligatures-on / .mono-ligatures-off
--font-mono-active token
   ▲                                  ▲
   │ IPC                              │ IPC
   │                                  │
Preview pane              ┌───────────┴──────────┐
ASCII Generator window    │  Export pipeline     │
Print-preview iframe      │  (main process)      │
                          │  uses MonospaceFontConfig
                          └──────────────────────┘
                                   │
                                   ▼
                       Bundle: assets/fonts/
                         ├─ JetBrainsMono-Regular.ttf
                         ├─ JetBrainsMono-Bold.ttf
                         ├─ FiraCode-Regular.ttf
                         ├─ FiraCode-Bold.ttf
                         └─ (existing woff2 for renderer)
```

## New Modules

| File | Role |
|---|---|
| `src/main/MonospaceFontConfig.js` | Single source of truth. Resolves the active monospace family + weight → absolute TTF path, with awareness of dev vs packaged (asar.unpacked) layout. Returns `null` + warns when a file is missing. |
| `src/main/PdfFontHeader.js` | Builds the xelatex `header.tex` snippet with `\usepackage{fontspec}\setmonofont{...ttf}[Path=...,UprightFont=*-Regular,BoldFont=*-Bold,Ligatures=NoCommon/TeX]`. Also returns the lualatex equivalent. |
| `src/main/DocxFontEmbedder.js` | Unzips a pandoc-produced DOCX with `jszip`, writes TTFs into `word/fonts/`, patches `[Content_Types].xml`, `_rels/document.xml.rels`, creates `word/fontTable.xml` with `<w:embedRegular/>` referencing the TTF, patches `word/styles.xml` so the `SourceCode`/`VerbatimChar` styles bind to the embedded font name, then rezips. Idempotent. |
| `src/main/EpubFontEmbedder.js` | Wrapper around pandoc `--epub-embed-font` — verifies the chosen TTF is referenced in `OEBPS/content.opf`; patches the manifest if missing. |
| `src/main/ExportCss.js` | Returns a self-contained CSS string with `@font-face { src: url(data:font/woff2;base64,...) }` for the chosen family. Used by HTML export `--css` and by print-preview iframe. |
| `src/main/settings/SettingsUI.Monospace.js` | Two new controls in the in-app settings dialog: monospace font select + ligatures checkbox. Persists to `<userData>/settings.json`. |

## Modified Modules

| File | Change |
|---|---|
| `src/fonts.css` | Add `@font-face` entries for Fira Code Regular (400) and Bold (700), pointing to `assets/fonts/FiraCode-*.woff2` (downloaded via the extended `download-tools.js`). |
| `src/styles/tokens.css` + `src/styles-concreteinfo.css` | Define new tokens `--font-mono-active` (resolves to `"JetBrains Mono"` or `"Fira Code"`) and `--font-mono-feature` (`"liga" 0, "calt" 0, "dlig" 0` for ligatures-off, else `normal`). Body classes flip these. |
| `src/styles-modern.css` | `.editor-textarea`, `.preview-content code`, `.preview-content pre`, `.codemirror-container .cm-editor` reference `var(--font-mono-active)` and apply `font-feature-settings: var(--font-mono-feature)`. |
| `src/ascii-generator.html` | Replace `<link href="https://fonts.googleapis.com/...">` with `<link rel="stylesheet" href="../styles/fonts.css">` plus inline `body` class defaulting. The window is plain HTML; the renderer script that opens it sets `body.classList` from settings. |
| `src/print-preview.js` | Inject `<style>` with embedded woff2 base64 from `ExportCss.js` into the srcdoc iframe HTML; set `pre`/`code` font-family to `var(--font-mono-active)`. |
| `src/main.js` | Five `--css/-V monofont=Consolas` lines and the export pipelines need surgery (table below). On successful DOCX export, pipeline the output through `DocxFontEmbedder`. On HTML export, pass `--css` referencing a temp file emitted by `ExportCss.js`. On EPUB, pass `--epub-embed-font` for both Regular and Bold. On LaTeX/PDF, pass `--include-in-header` referencing a temp `header.tex` emitted by `PdfFontHeader.js`. The Electron `printToPDF` fallback also consumes `ExportCss.js`. |
| `src/renderer.js` | On `settings-changed`, toggle `document.body.classList` between `mono-jetbrains` / `mono-fira` and `mono-ligatures-on` / `mono-ligatures-off`. The active class is also written by the bit that initializes Monaco/CodeMirror when the editor is mounted. |
| `scripts/download-tools.js` | Add `fira-code` task: downloads `FiraCode-Regular.ttf`, `FiraCode-Bold.ttf`, `FiraCode-LICENSE.txt` from the official `tonsky/FiraCode` GitHub release (version-pinned, mirrors how Pandoc is downloaded). |
| `package.json` | `build.asarUnpack` extended to `"assets/fonts/**"` so xelatex/Pandoc can read TTFs at runtime in packaged builds. No new NPM dependencies — `jszip ^3.10.1` is already present. |

## Per-Export Behaviour

| Format | What changes | Post-processing | Resulting file shape |
|---|---|---|---|
| **PDF** (xelatex) | Replace `-V monofont="Consolas"` with `--include-in-header=<tmp>.tex` from `PdfFontHeader` (`\setmonofont{JetBrainsMono-Regular.ttf}[Path=…,Extension=.ttf,UprightFont=*-Regular,BoldFont=*-Bold,Ligatures=NoCommon]`). | none — xelatex subsets the font into the PDF. | Self-contained PDF; code-block columns align across pages. |
| **PDF** (lualatex fallback) | Same header uses lualatex-compatible fontspec syntax (identical to xelatex in modern LuaTeX). | none | Same as above. |
| **PDF** (pdflatex final fallback) | Revert to `-V monofont="Consolas"` + warn (Consolas not on all systems; document limitation). | none | Best-effort — relies on pdftex default monospace. |
| **DOCX** | Existing pandoc invocation. After pandoc writes, hand to `DocxFontEmbedder`. | Embed Regular + Bold TTF into `word/fonts/`; patch `[Content_Types].xml` Default+Override; add `word/_rels` entry for `fontTable.xml.rels`; create `word/fontTable.xml` with `<w:embedRegular/>` for each font weight; patch `word/styles.xml` so `SourceCode` (or whatever style Pandoc wrote under) sets `w:rFonts ascii="JetBrains Mono" hAnsi="JetBrains Mono"`. | ~550 KB larger DOCX; fully portable. |
| **HTML** (standalone) | Add `--css=<tmp>.css` (built by `ExportCss` with base64 woff2). | none | One self-contained `.html`; aligned anywhere, offline. |
| **EPUB** | Add `--epub-embed-font=<bundleAbs>/<Family>-Regular.ttf` and same for Bold (Pandoc 2.11+ supports this natively). | `EpubFontEmbedder` patches `OEBPS/content.opf` if the font reference is missing. | Embedded font travels in the EPUB. |
| **ODT** | `--variable=mainfont="JetBrains Mono"` (or Fira). | Before final write, show a non-blocking confirmation: "ODT embeds the font *name* — recipients must also have it installed to keep alignment. Continue?". | Light; portability caveat explicit to user. |
| **RTF** | `\fonttbl` directive already injected by pandoc when `mainfont=` is set. | Same ODT confirmation. | Same caveat as ODT. |
| **LaTeX (`.tex`)** | `--include-in-header=<tmp>.tex` identical to the PDF header. | none | Self-contained `.tex` for downstream compile. |
| **PPTX** | unchanged | n/a | v1: don't try to enforce. |
| **RevealJS** | behaves like HTML (uses `ExportCss`). | n/a | self-contained. |
| **Beamer** | behaves like LaTeX (uses `PdfFontHeader` snippet). | n/a | downstream PDF compile respects font. |
| **Print preview** | n/a | `ExportCss` injected into srcdoc iframe HTML. | Inside-app preview aligned. |
| **ASCII Generator window** | Replace Google Fonts CDN link with local `fonts.css`. | n/a | Offline, aligned. |

## Path Resolution

`MonospaceFontConfig` exposes:

```js
exports.getActiveMonoFontPath = function getActiveMonoFontPath(weight = 400)
exports.getActiveMonoFamily   = function getActiveMonoFamily()
exports.ligaturesEnabled       = function ligaturesEnabled()
```

- Dev: `<repoRoot>/assets/fonts/<Family>-<Weight>.ttf`
- Packaged: `<process.resourcesPath>/app.asar.unpacked/assets/fonts/<Family>-<Weight>.ttf`
- If the file is missing, returns `null` and emits a `console.warn` + a single non-blocking toast: "Using system monospace — bundled font missing".

## Settings Schema

Extended `<userData>/settings.json`:

```jsonc
{
  // ... existing keys ...
  "monospaceFont": "jetbrains-mono",      // "jetbrains-mono" | "fira-code"
  "monospaceLigatures": false             // bool
}
```

Defaults: `monospaceFont: "jetbrains-mono"`, `monospaceLigatures: false`. Migration: if a settings file exists without these keys, fill with defaults silently on read.

## Testing

**New test files:**

| File | Asserts |
|---|---|
| `tests/monospace-font-config.test.js` | Dev vs packaged path semantics; null-and-warn on missing TTF; settings-driven family selection. |
| `tests/docx-font-embedder.test.js` | Produces a valid DOCX; `unzip -l` lists `word/fonts/JetBrainsMono-{Regular,Bold}.ttf`; `word/fontTable.xml` contains `<w:embedRegular r:id="…"/>` entries with correct names; `styles.xml` binds the monospace style to `"JetBrains Mono"`; idempotent (running twice doesn't double-embed). |
| `tests/pdf-font-header.test.js` | Output contains `\setmonofont{JetBrainsMono-Regular.ttf}` with `Path=` matching the resolved absolute path; `Ligatures=NoCommon` when settings say off. |
| `tests/export-css.test.js` | Output contains a `@font-face` block with `src: url('data:font/woff2;base64,<…>')`; the base64 string decodes to > 50 000 bytes; `pre`/`code`/`kbd` use `var(--font-mono-active)`. |
| `tests/epub-font-embedder.test.js` | After embedding, `OEBPS/content.opf` references both Regular and Bold TTFs in `<manifest>`. |

**Integration test (manual, repeatable):**

1. Create a fixture markdown file with three ASCII grids (boxes, columns, arrows).
2. Open the file in MarkdownConverter.
3. Set monospace font = JetBrains Mono, ligatures off.
4. Export to PDF / DOCX / HTML.
5. Open each result; confirm the `+---+` column delimiters sit at identical X-positions across all three formats and across pages.
6. Switch to Fira Code with ligatures on; export again; confirm round-trip works (no crashes) and ligature toggle affects preview.

## Error Handling

| Failure | Behaviour |
|---|---|
| Bundled TTF missing | `MonospaceFontConfig` returns `null`; renderer/main falls back to system monospace; non-blocking toast; never a silent drop. |
| `DocxFontEmbedder` fails (zip corruption, insufficient permissions, missing required OOXML element) | Keep the un-embedded DOCX; show a dialog with the exact failure message and a "Report issue" link. Do **not** claim success. |
| `PdfFontHeader` can't write temp tex (filesystem permission) | Show an error dialog naming the permission issue; abort the export. |
| Pandoc `--epub-embed-font` not supported (Pandoc < 2.11) | Detect via `pandoc --version` at startup (cache `pandocAvailable` already exists). Skip embedding; warn user that the EPUB will degrade if their reader lacks the font. |
| Pandoc `--css` flag missing (Pandoc < 2.0) | Detect via the same version check. Skip the `--css` injection; warn user that the exported HTML is not self-contained for the chosen font. |
| xelatex fails after fontspec injection | Existing `tryPdfFallback` chain reorders to `lualatex → pdflatex` (Consolas). Already implemented; the reorder is a one-liner. |

## Acceptance Criteria

- [ ] All five rows of `Per-Export Behaviour` produce files where ASCII alignment is identical to the editor.
- [ ] No new NPM dependencies added (use existing `jszip`, `fontkit`).
- [ ] `asarUnpack` covers `assets/fonts/**`.
- [ ] Bundle size increase ≤ 1.5 MB (TTFs + Fira TTF + extra metadata).
- [ ] No `TODO`/`FIXME`/`HACK` markers in newly touched code.
- [ ] Preview, ASCII Generator window, print-preview iframe, PDF, DOCX, HTML, EPUB, ODT all use the same active font + ligature setting (single source of truth).
- [ ] On a clean machine with no JetBrains Mono / Fira Code installed system-wide, every export still produces correct alignment.
- [ ] Switching between fonts in settings updates preview immediately and is honoured by all subsequent exports in the same session.
- [ ] Both font files travel with the binary (`LICENSE.txt` present for both families).

## File Inventory

**New (10 files):**

```
src/main/MonospaceFontConfig.js
src/main/PdfFontHeader.js
src/main/DocxFontEmbedder.js
src/main/EpubFontEmbedder.js
src/main/ExportCss.js
src/main/settings/SettingsUI.Monospace.js
tests/monospace-font-config.test.js
tests/docx-font-embedder.test.js
tests/pdf-font-header.test.js
tests/export-css.test.js
tests/epub-font-embedder.test.js
assets/fonts/FiraCode-Regular.ttf
assets/fonts/FiraCode-Bold.ttf
assets/fonts/FiraCode-LICENSE.txt
```

**Modified:**

```
src/fonts.css
src/styles/tokens.css
src/styles-concreteinfo.css
src/styles-modern.css
src/ascii-generator.html
src/print-preview.js
src/main.js
src/renderer.js
scripts/download-tools.js
package.json
```

(3 added TTF files counted under "New"; OFL `LICENSE.txt` only required when bundling Fira Code.)
