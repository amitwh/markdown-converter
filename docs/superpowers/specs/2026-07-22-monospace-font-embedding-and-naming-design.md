# Monospace Font Embedding + Naming Differentiation

**Date:** 2026-07-22
**Branch:** react-electron
**Goal:** Bring `react-electron` to feature parity with `master` by porting the v4.5.0 "embedded monospace font" feature, and differentiate the dev build identity from the installed `markdown-converter` deb so the two can coexist on the same machine.

---

## Context

The `react-electron` branch is the active development branch — a major rewrite of the renderer in React 19 + TypeScript + Tailwind/shadcn while keeping the main process in CommonJS. As of commit `bb4e874` it is **ahead** of `master` in nearly every dimension (auto-updater, crash writer, migration runner, command palette, first-run wizard, updates settings, crash report modal, 30+ React modals, large-file mode, scoped CSS).

A repo-wide diff (`git diff --stat master..react-electron`) shows 301 files changed, +38,293/-26,786 lines. Master is **behind** react-electron.

The **only** feature present in `master` and absent in `react-electron` is the monospace-font-embedding feature added in master v4.5.0 (commits `3f8679c` through `b218c76`, 19 commits). It bundles JetBrains Mono + Fira Code TTFs and embeds them into PDF/DOCX/EPUB/HTML exports so ASCII art and code blocks render with the exact font the user sees in the preview.

A second concern: the user has `markdown-converter` installed as a `.deb`. Running `npm run dev` from this repo currently uses the same `appId` (`com.concreteinfo.markdownconverter`) and `productName` (`MarkdownConverter`), which triggers Electron's single-instance lock and confuses file-association routing. We rename this branch's identity to `Markdown Converter React` / `markdown-converter-react` to coexist.

---

## Scope

### In scope

1. Port the monospace font embedding feature from `master` v4.5.0 into the react-electron branch:
   - All five `src/main/*.js` modules (`MonospaceFontConfig`, `PdfFontHeader`, `DocxFontEmbedder`, `EpubFontEmbedder`, `ExportCss`)
   - Settings schema module (`src/main/settings/monospaceSettings.js`)
   - Two new IPC handlers (`get-monospace-settings`, `set-monospace-settings`) plus preload allowlist and TypeScript declaration
   - Renderer body-class toggle and CSS tokens (`--font-mono-active`, `--font-mono-feature`)
   - Bundled font assets: `JetBrainsMono-{Regular,Bold}.ttf`, `FiraCode-{Regular,Bold}.ttf` plus LICENSE files
   - `asarUnpack` directive for `assets/fonts/**`
   - `download-tools.js` extension to fetch Fira Code
   - Wire `buildMonospaceExportCss`, `buildPdfFontHeader`, `DocxFontEmbedder.embed`, `EpubFontEmbedder.embed` into `src/main/index.js` export pipelines (PDF, DOCX, EPUB, HTML paths)
   - Print-preview font integration (`src/renderer/components/preview/PrintPreviewFrame.tsx` or equivalent)
   - Tests: one test file per new module mirroring master's coverage plus an E2E smoke test

2. Rename branch identity:
   - `package.json` `name` → `markdown-converter-react`
   - `package.json` `build.productName` → `Markdown Converter React`
   - `package.json` `build.appId` → `com.concreteinfo.markdownconverter.react`
   - `package.json` `build.linux.executableName` → `markdown-converter-react`
   - Window title prefix → `Markdown Converter — React Dev` in dev mode (use `process.env.VITE_DEV_SERVER_URL` as the gate)
   - Settings file path remains `userData/settings.json` (no migration needed) — but add a new key `appVariant: "react"` so the renderer can show the correct title

### Out of scope

- React renderer rewrites (already ahead of master)
- Auto-updater, crash, migration (already ahead of master)
- Tauri / Web migration
- Pandoc version bump
- Documentation beyond this spec, the implementation plan, and the changelog entry
- Changes to v4-to-v5 settings migration (we leave the existing runner alone)

---

## Design

### Module layout (new files)

```
src/main/
  MonospaceFontConfig.js          # path resolver — finds bundled TTF
  PdfFontHeader.js                # builds .tex fontspec header for xelatex/lualatex
  DocxFontEmbedder.js             # injects TTF into pandoc DOCX output (post-process)
  EpubFontEmbedder.js             # EPUB --epub-embed-font + manifest patch
  ExportCss.js                    # builds CSS string with woff2 embedded as base64
  settings/
    monospaceSettings.js          # schema, defaults, family map
  ipc/
    monospace-handlers.js         # IPC handler registration
  utils/
    (existing)                    # no change

src/renderer/
  hooks/
    use-monospace-classes.ts      # toggles body.mono-{jetbrains,fira}{,-ligatures} classes
  components/preview/
    PrintPreviewFrame.tsx         # wire print preview to monospace settings via IPC
  styles/globals.css              # add --font-mono-active/--font-mono-feature declarations
  types/electron.d.ts             # extend ElectronAPI with monospace.{getSettings,saveSettings}

src/preload.js                    # add monospace channels to ALLOWED_SEND_CHANNELS + expose on window.electronAPI.monospace

assets/fonts/
  JetBrainsMono-Regular.ttf       # bundled, ~270 KB
  JetBrainsMono-Bold.ttf          # bundled, ~278 KB
  JetBrainsMono-LICENSE.txt
  FiraCode-Regular.ttf            # bundled, ~300 KB
  FiraCode-Bold.ttf               # bundled, ~300 KB
  FiraCode-LICENSE.txt

scripts/download-tools.js         # extend to fetch Fira Code

tests/
  unit/main/monospace/
    MonospaceFontConfig.test.js
    monospaceSettings.test.js
    PdfFontHeader.test.js
    DocxFontEmbedder.test.js
    EpubFontEmbedder.test.js
    ExportCss.test.js
    monospace-handlers.test.js
  smoke-e2e-monospace.js          # e2e: convert ASCII-art Markdown → PDF/DOCX/EPUB/HTML, assert TTF references appear in output
```

### Key interfaces (TypeScript-style for clarity)

```ts
// src/main/settings/monospaceSettings.js
type MonoFont = 'jetbrains-mono' | 'fira-code';
const FAMILY_BY_KEY: Record<MonoFont, string> = {
  'jetbrains-mono': 'JetBrains Mono',
  'fira-code': 'Fira Code',
};
function getActiveMonoFont(settings): string;
function isLigaturesEnabled(settings): boolean;
function safeMonospaceSettings(input): { monospaceFont: MonoFont; monospaceLigatures: boolean };

// src/main/MonospaceFontConfig.js
function getMonoFontTtfPath(familyKey, weight = 400): string | null;  // null if asset missing
function ligaturesEnabled(settings): boolean;
function getActiveFamily(settings): string;

// src/main/PdfFontHeader.js
function buildPdfFontHeader(settings, ttfPath, fontFamily): { headerPath: string; familyName: string };

// src/main/DocxFontEmbedder.js
async function embedDocxFont(inputDocxPath, outputDocxPath, ttfPath, fontFamily): Promise<void>;
async function buildDocxWithEmbeddedFont(pandocArgs, settings): Promise<{args, postProcess}>;

// src/main/EpubFontEmbedder.js
async function embedEpubFont(epubPath, ttfPath, fontFamily): Promise<void>;
function withEpubEmbedFontArgs(pandocArgs, ttfPath, fontFamily): string[];

// src/main/ExportCss.js
function buildExportCss(settings, { woff2Base64, family, ligatures }): string;
function buildFontFaceBlock(familyKey, woff2Base64): string;

// src/main/ipc/monospace-handlers.js
function register({ getMainWindow }): void;
//   ipcMain.handle('get-monospace-settings', () => ({ monospaceFont, monospaceLigatures }))
//   ipcMain.handle('set-monospace-settings', (_e, partial) => safeMonospaceSettings(partial) → persist + broadcast)
```

### Renderer integration

- `use-monospace-classes.ts` hook runs once on mount, calls `electronAPI.monospace.getSettings()`, applies `document.body.classList` of:
  - `mono-jetbrains-mono` | `mono-fira-code`
  - `mono-ligatures-on` | `mono-ligatures-off`
- CSS in `globals.css`:
  ```css
  :root {
    --font-mono-active: 'JetBrains Mono', 'SF Mono', Monaco, 'Courier New', monospace;
    --font-mono-feature: 'liga' 0, 'calt' 0;
  }
  body.mono-fira-code { --font-mono-active: 'Fira Code', 'JetBrains Mono', 'SF Mono', monospace; }
  body.mono-ligatures-on { --font-mono-feature: 'liga' 1, 'calt' 1; }
  ```
- All existing `font-family: monospace` and `font-family: var(--font-mono)` usages continue to work; the new tokens sit above them.

### Wiring into export pipelines

In `src/main/index.js` `exportWithPandoc` (PDF branch):
- Read `monospaceFont` + `monospaceLigatures` from settings
- Resolve TTF path via `MonospaceFontConfig.getMonoFontTtfPath`
- If path exists: build font header via `PdfFontHeader.buildPdfFontHeader`, pass `--include-in-header=…`
- If path missing: log warning, fall back to existing `-V monofont=Consolas` behavior

In DOCX branch: invoke `DocxFontEmbedder.embedDocxFont` post-pandoc.
In EPUB branch: prepend `--epub-embed-font=…` to pandoc args; call `EpubFontEmbedder.embedEpubFont` to patch manifest.
In HTML branch: write CSS via `ExportCss.buildExportCss` (embed woff2 as base64) and reference in `<style>`.

### Naming differentiation

`package.json` changes:
```diff
- "name": "markdown-converter"
+ "name": "markdown-converter-react"
- "productName": "MarkdownConverter"
+ "productName": "Markdown Converter React"
- "appId": "com.concreteinfo.markdownconverter"
+ "appId": "com.concreteinfo.markdownconverter.react"
+ "linux": {
+   "executableName": "markdown-converter-react",
+   "synopsis": "Markdown editor (React build)",
+   "description": "Markdown editor and universal file converter — React build"
+ }
```

`src/main/window/index.js`:
```js
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const titleSuffix = isDev ? ' — React Dev' : '';
mainWindow = new BrowserWindow({
  title: `Markdown Converter${titleSuffix}`,
  ...
});
```

### Settings impact

Add two keys to `migration-transform.js` v5 schema with safe defaults:
- `monospaceFont: z.enum(['jetbrains-mono', 'fira-code']).default('jetbrains-mono')`
- `monospaceLigatures: z.boolean().default(false)`
- `appVariant: z.enum(['classic', 'react']).default('react')`

Existing user settings remain valid; the migration just fills in the new defaults.

---

## Testing strategy (TDD)

For each new module: red-green-refactor.

1. `MonospaceFontConfig.test.js` — uses tmpdir + mocked `process.resourcesPath` to assert resolution from `assets/fonts/JetBrainsMono-Regular.ttf`. Covers missing-file fallback.
2. `monospaceSettings.test.js` — schema validation: rejects unknown fonts, coerces ligatures boolean, fills defaults.
3. `PdfFontHeader.test.js` — writes a temp `.tex` file, asserts `\setmonofont{JetBrainsMono-Regular.ttf}[...]` lines match.
4. `DocxFontEmbedder.test.js` — given a minimal DOCX zip, asserts `word/fonts/` contains the TTF and `word/_rels/fontTable.xml.rels` references it.
5. `EpubFontEmbedder.test.js` — asserts `META-INF/container.xml` and `content.opf` updated after `--epub-embed-font`.
6. `ExportCss.test.js` — base64 round-trip: `atob(css.match(/base64,([A-Za-z0-9+/=]+)/)[1])` returns the original woff2 bytes.
7. `monospace-handlers.test.js` — invokes the registered handlers against `ipcMain` mock; asserts settings persistence + broadcast.
8. `smoke-e2e-monospace.js` — runs `pandoc` end-to-end against a fixture markdown with ASCII art; greps output for font references.

Coverage threshold maintained: jest at 15%, vitest at v8 + renderer lines.

---

## Risks

- **TTF download license** — Fira Code is OFL-1.1; JetBrains Mono is OFL-1.1. Both allow redistribution; LICENSE files ship alongside TTFs. No risk.
- **Pandoc version sensitivity** — `--epub-embed-font` requires pandoc ≥ 2.19. The download-tools script pins to 3.9.0.2; check `pandocVersion` and gracefully fall back if older.
- **asarUnpack size** — adding ~1.2 MB of TTFs to packaged builds. Acceptable; matches master.
- **Dev/prod appId split** — if a user installs both `markdown-converter` and `markdown-converter-react` debs, their settings files are separate (`userData/com.concreteinfo.markdownconverter.react/settings.json`). Documented in README.
- **Test environment** — the e2e smoke test requires pandoc available locally. We'll `test.skip` if `which pandoc` fails.

---

## Definition of done

- [ ] All planned steps implemented, not just the first/easiest ones
- [ ] No forbidden markers (`TODO`, `FIXME`, `XXX`, `HACK`, `not implemented`, `placeholder`, `stub`, `coming soon`) in changed source
- [ ] New test suites pass; existing 638 tests still pass
- [ ] `npm run build:linux` produces a `.deb` artifact named `markdown-converter-react_*_amd64.deb`
- [ ] App launches in dev mode with title `Markdown Converter — React Dev`
- [ ] E2E smoke test confirms TTF references in PDF/DOCX/EPUB/HTML output
- [ ] CHANGELOG.md updated with a "5.1.0 — react-electron parity" entry
- [ ] No unrelated refactors; every changed line traces to the request

---

## Learning collaboration

Per the project's learning-mode preference, the user will be asked to contribute two 5-10 line decisions during implementation:

1. **Default monospace family** in `monospaceSettings.js` (`jetbrains-mono` vs `fira-code` vs `system-fallback`).
2. **Body-class gating strategy** in `use-monospace-classes.ts` (apply on every settings change vs debounce vs once-on-mount).

These choices shape the feature's behavior in ways that benefit from the user's domain knowledge.
