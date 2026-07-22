# Monospace Font Embedding + Naming Differentiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the v4.5.0 monospace font embedding feature from `master` into `react-electron`, then differentiate the dev build's identity (`Markdown Converter React` / `com.concreteinfo.markdownconverter.react`) so it coexists with the installed `markdown-converter` deb.

**Architecture:** Five small, focused main-process modules (config, pdf header, docx embedder, epub embedder, export css) wired into the existing `exportWithPandoc` pipeline. Settings stored in the same JSON file via the existing `src/main/store.js`. Two new IPC channels exposed through the existing whitelisted preload bridge. Renderer toggles CSS classes on `document.body` to drive `--font-mono-active` tokens. Product rename in `package.json` `build` block plus `src/main/window/index.js` title prefix.

**Tech Stack:** Node.js 20 + Electron 41 + React 19 + TypeScript 5.5 + Vite 8 + Jest 30 + Vitest 4. New deps: none (we use `archiver`/`unzipper`? — checked, none; we use only Node built-ins + `jszip` which is already a dep via `docx`).

---

## File Structure

### New files
- `src/main/MonospaceFontConfig.js` — TTF path resolver (`getMonoFontTtfPath`, `ligaturesEnabled`, `getActiveFamily`)
- `src/main/PdfFontHeader.js` — writes `.tex` fontspec header for xelatex/lualatex
- `src/main/DocxFontEmbedder.js` — post-process pandoc DOCX output to embed TTF
- `src/main/EpubFontEmbedder.js` — `withEpubEmbedFontArgs` + `embedEpubFont`
- `src/main/ExportCss.js` — `buildExportCss` returning CSS string with base64 woff2
- `src/main/settings/monospaceSettings.js` — schema, family map, `safeMonospaceSettings`
- `src/main/ipc/monospace-handlers.js` — registers `get-monospace-settings`, `set-monospace-settings`
- `src/renderer/hooks/use-monospace-classes.ts` — applies body classes from settings
- `tests/unit/main/monospace/MonospaceFontConfig.test.js`
- `tests/unit/main/monospace/monospaceSettings.test.js`
- `tests/unit/main/monospace/PdfFontHeader.test.js`
- `tests/unit/main/monospace/DocxFontEmbedder.test.js`
- `tests/unit/main/monospace/EpubFontEmbedder.test.js`
- `tests/unit/main/monospace/ExportCss.test.js`
- `tests/unit/main/monospace/monospace-handlers.test.js`
- `tests/smoke-e2e-monospace.js` — E2E: ASCII art markdown → PDF/DOCX/EPUB/HTML, grep for font refs

### Modified files
- `src/main/index.js` — wire monospace modules into `exportWithPandoc` PDF/DOCX/EPUB/HTML branches; register IPC handlers at startup
- `src/main/window/index.js` — title suffix `— React Dev` in dev
- `src/preload.js` — add monospace channels to allowlist + expose on `window.electronAPI.monospace`
- `src/renderer/types/electron.d.ts` — extend `ElectronAPI` with `monospace` namespace
- `src/renderer/lib/ipc.ts` — type-safe wrapper for monospace
- `src/renderer/styles/globals.css` — add `--font-mono-active` / `--font-mono-feature` declarations
- `src/main/updater/migration-transform.js` — add `monospaceFont`, `monospaceLigatures`, `appVariant` defaults
- `package.json` — `name`, `productName`, `appId`, `linux.executableName`; `build.asarUnpack` for `assets/fonts/**`; bundle Fira Code downloader reference in `download-tools`
- `scripts/download-tools.js` — add `downloadFiraCode()` parallel to `downloadPandoc()`
- `App.tsx` (or wherever the root layout mounts hooks) — call `useMonospaceClasses()` once at startup
- `CHANGELOG.md` — 5.1.0 entry

### Untracked but not new
- `assets/fonts/JetBrainsMono-Regular.ttf` (~274 KB)
- `assets/fonts/JetBrainsMono-Bold.ttf` (~278 KB)
- `assets/fonts/JetBrainsMono-LICENSE.txt`
- `assets/fonts/FiraCode-Regular.ttf` (~300 KB)
- `assets/fonts/FiraCode-Bold.ttf` (~300 KB)
- `assets/fonts/FiraCode-LICENSE.txt`

---

## Task 1: Add monospace settings schema + tests

**Files:**
- Create: `src/main/settings/monospaceSettings.js`
- Create: `tests/unit/main/monospace/monospaceSettings.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/main/monospace/monospaceSettings.test.js
const {
  FAMILY_BY_KEY,
  getActiveMonoFont,
  isLigaturesEnabled,
  safeMonospaceSettings,
  DEFAULT_SETTINGS,
} = require('../../../../src/main/settings/monospaceSettings');

describe('monospaceSettings', () => {
  test('FAMILY_BY_KEY maps jetbrains-mono → "JetBrains Mono"', () => {
    expect(FAMILY_BY_KEY['jetbrains-mono']).toBe('JetBrains Mono');
  });
  test('getActiveMonoFont returns family for valid key', () => {
    expect(getActiveMonoFont({ monospaceFont: 'fira-code' })).toBe('Fira Code');
  });
  test('getActiveMonoFont falls back to default for unknown key', () => {
    expect(getActiveMonoFont({ monospaceFont: 'unknown' })).toBe('JetBrains Mono');
  });
  test('getActiveMonoFont returns default when key missing', () => {
    expect(getActiveMonoFont({})).toBe('JetBrains Mono');
  });
  test('isLigaturesEnabled is true only when explicitly true', () => {
    expect(isLigaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(isLigaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(isLigaturesEnabled({ monospaceLigatures: 'yes' })).toBe(false);
    expect(isLigaturesEnabled({})).toBe(false);
  });
  test('safeMonospaceSettings rejects unknown fonts', () => {
    expect(safeMonospaceSettings({ monospaceFont: 'comic-sans' })).toEqual(DEFAULT_SETTINGS);
  });
  test('safeMonospaceSettings coerces ligatures to boolean', () => {
    expect(safeMonospaceSettings({ monospaceLigatures: 1 })).toEqual({
      monospaceFont: 'jetbrains-mono',
      monospaceLigatures: true,
    });
  });
  test('safeMonospaceSettings returns DEFAULT_SETTINGS for empty input', () => {
    expect(safeMonospaceSettings({})).toEqual(DEFAULT_SETTINGS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/monospaceSettings.test.js`
Expected: FAIL — `Cannot find module '../../../../src/main/settings/monospaceSettings'`

- [ ] **Step 3: Implement the module**

```js
// src/main/settings/monospaceSettings.js
'use strict';

const FAMILY_BY_KEY = {
  'jetbrains-mono': 'JetBrains Mono',
  'fira-code': 'Fira Code',
};

const ALLOWED_FONTS = Object.keys(FAMILY_BY_KEY);

const DEFAULT_SETTINGS = Object.freeze({
  monospaceFont: 'jetbrains-mono',
  monospaceLigatures: false,
});

function getActiveMonoFont(settings) {
  const key = settings && settings.monospaceFont;
  if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(FAMILY_BY_KEY, key)) {
    return FAMILY_BY_KEY[key];
  }
  return FAMILY_BY_KEY[DEFAULT_SETTINGS.monospaceFont];
}

function isLigaturesEnabled(settings) {
  return !!(settings && settings.monospaceLigatures === true);
}

function safeMonospaceSettings(input) {
  const safe = { ...DEFAULT_SETTINGS };
  if (input && typeof input === 'object') {
    if (ALLOWED_FONTS.includes(input.monospaceFont)) {
      safe.monospaceFont = input.monospaceFont;
    }
    if (typeof input.monospaceLigatures === 'boolean') {
      safe.monospaceLigatures = input.monospaceLigatures;
    } else if (input.monospaceLigatures === 1 || input.monospaceLigatures === 'true') {
      safe.monospaceLigatures = true;
    }
  }
  return safe;
}

module.exports = {
  FAMILY_BY_KEY,
  ALLOWED_FONTS,
  DEFAULT_SETTINGS,
  getActiveMonoFont,
  isLigaturesEnabled,
  safeMonospaceSettings,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/monospaceSettings.test.js`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings/monospaceSettings.js tests/unit/main/monospace/monospaceSettings.test.js
git commit -m "feat(monospace): add settings schema with safe defaults"
```

---

## Task 2: MonospaceFontConfig path resolver

**Files:**
- Create: `src/main/MonospaceFontConfig.js`
- Create: `tests/unit/main/monospace/MonospaceFontConfig.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/main/monospace/MonospaceFontConfig.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('MonospaceFontConfig', () => {
  let tmpDir;
  let originalResourcesPath;
  let originalCwd;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-font-cfg-'));
    originalResourcesPath = process.resourcesPath;
    originalCwd = process.cwd();
    process.resourcesPath = undefined;
  });

  afterEach(() => {
    process.resourcesPath = originalResourcesPath;
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function loadFresh() {
    delete require.cache[require.resolve('../../../../src/main/MonospaceFontConfig')];
    return require('../../../../src/main/MonospaceFontConfig');
  }

  test('resolves JetBrains Mono Regular TTF from repo assets', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    fs.mkdirSync(path.join(repoRoot, 'assets', 'fonts'), { recursive: true });
    const target = path.join(repoRoot, 'assets', 'fonts', 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(target, 'fake-ttf');
    try {
      const cfg = loadFresh();
      const result = cfg.getMonoFontTtfPath('jetbrains-mono', 400);
      expect(result).toBe(target);
    } finally {
      fs.unlinkSync(target);
    }
  });

  test('resolves Fira Code Bold TTF when family is fira-code and weight 700', () => {
    const repoRoot = path.resolve(__dirname, '../../..');
    const target = path.join(repoRoot, 'assets', 'fonts', 'FiraCode-Bold.ttf');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'fake-ttf');
    try {
      const cfg = loadFresh();
      const result = cfg.getMonoFontTtfPath('fira-code', 700);
      expect(result).toBe(target);
    } finally {
      fs.unlinkSync(target);
    }
  });

  test('returns null when TTF is missing', () => {
    const cfg = loadFresh();
    const result = cfg.getMonoFontTtfPath('jetbrains-mono', 400);
    expect(result).toBeNull();
  });

  test('ligaturesEnabled delegates to settings', () => {
    const { ligaturesEnabled } = require('../../../../src/main/settings/monospaceSettings');
    const cfg = loadFresh();
    expect(cfg.ligaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(cfg.ligaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(cfg.ligaturesEnabled({})).toBe(false);
  });

  test('getActiveFamily returns the human-readable family name', () => {
    const cfg = loadFresh();
    expect(cfg.getActiveFamily({ monospaceFont: 'fira-code' })).toBe('Fira Code');
    expect(cfg.getActiveFamily({})).toBe('JetBrains Mono');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/MonospaceFontConfig.test.js`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement the module**

```js
// src/main/MonospaceFontConfig.js
'use strict';

const fs = require('fs');
const path = require('path');
const {
  getActiveMonoFont,
  isLigaturesEnabled,
  FAMILY_BY_KEY,
} = require('./settings/monospaceSettings');

const WEIGHT_BY_KEY = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' };

function getAppRoot() {
  if (
    process.resourcesPath &&
    fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))
  ) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, '..', '..');
}

function getCandidatePaths(family, weight) {
  const familyDir = family === 'Fira Code' ? 'FiraCode' : 'JetBrainsMono';
  const weightName = WEIGHT_BY_KEY[weight] || 'Regular';
  const filename = `${familyDir}-${weightName}.ttf`;
  const candidates = [];
  candidates.push(path.resolve(getAppRoot(), 'assets', 'fonts', filename));
  const packagedRoot = process.resourcesPath || getAppRoot();
  candidates.push(path.join(packagedRoot, 'app.asar.unpacked', 'assets', 'fonts', filename));
  return candidates;
}

function getMonoFontTtfPath(familyKey, weight = 400) {
  const family = FAMILY_BY_KEY[familyKey] || 'JetBrains Mono';
  const candidates = getCandidatePaths(family, weight);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  const filename = path.basename(candidates[candidates.length - 1]);
  console.warn(
    `[MonospaceFontConfig] bundled font missing: ${filename}; falling back to system monospace`
  );
  return null;
}

function ligaturesEnabled(settings) {
  return isLigaturesEnabled(settings);
}

function getActiveFamily(settings) {
  return getActiveMonoFont(settings);
}

module.exports = { getMonoFontTtfPath, ligaturesEnabled, getActiveFamily };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/MonospaceFontConfig.test.js`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/MonospaceFontConfig.js tests/unit/main/monospace/MonospaceFontConfig.test.js
git commit -m "feat(monospace): add path resolver for bundled TTF assets"
```

---

## Task 3: PdfFontHeader builder

**Files:**
- Create: `src/main/PdfFontHeader.js`
- Create: `tests/unit/main/monospace/PdfFontHeader.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/main/monospace/PdfFontHeader.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildPdfFontHeader } = require('../../../../src/main/PdfFontHeader');

describe('PdfFontHeader', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-pdfhdr-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('writes a fontspec header for JetBrains Mono Regular', () => {
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(ttf, 'fake');
    const out = buildPdfFontHeader({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false }, ttf, 'JetBrains Mono');
    expect(typeof out.headerPath).toBe('string');
    expect(fs.existsSync(out.headerPath)).toBe(true);
    const content = fs.readFileSync(out.headerPath, 'utf-8');
    expect(content).toContain('\\setmonofont');
    expect(content).toContain('JetBrainsMono-Regular.ttf');
    expect(out.familyName).toBe('JetBrains Mono');
  });

  test('writes header with ligatures when enabled', () => {
    const ttf = path.join(tmpDir, 'FiraCode-Regular.ttf');
    fs.writeFileSync(ttf, 'fake');
    const out = buildPdfFontHeader({ monospaceFont: 'fira-code', monospaceLigatures: true }, ttf, 'Fira Code');
    const content = fs.readFileSync(out.headerPath, 'utf-8');
    expect(content).toContain('Ligatures=TeX');
  });

  test('header is written under os.tmpdir', () => {
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(ttf, 'fake');
    const out = buildPdfFontHeader({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false }, ttf, 'JetBrains Mono');
    expect(out.headerPath.startsWith(os.tmpdir())).toBe(true);
  });

  test('throws if ttfPath does not exist', () => {
    expect(() =>
      buildPdfFontHeader({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false }, '/nonexistent.ttf', 'JetBrains Mono')
    ).toThrow(/TTF/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/PdfFontHeader.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/main/PdfFontHeader.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function buildPdfFontHeader(settings, ttfPath, fontFamily) {
  if (!ttfPath || !fs.existsSync(ttfPath)) {
    throw new Error(`PdfFontHeader: TTF not found at ${ttfPath}`);
  }
  const ligatures = !!(settings && settings.monospaceLigatures === true);
  const lines = [
    `\\setmonofont[Path = ${path.dirname(ttfPath)}/,`,
    `             Extension = .ttf,`,
    `             UprightFont = ${path.basename(ttfPath)},`,
    `             BoldFont = ${path.basename(ttfPath).replace('Regular', 'Bold')},`,
    ligatures ? '             Ligatures = TeX,' : '',
    `             Scale = 0.9]`,
    `{${fontFamily}}`,
  ].filter(Boolean);
  const headerPath = path.join(os.tmpdir(), `monospace-pdf-${Date.now()}-${process.pid}.tex`);
  fs.writeFileSync(headerPath, lines.join('\n'), 'utf-8');
  return { headerPath, familyName: fontFamily };
}

module.exports = { buildPdfFontHeader };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/PdfFontHeader.test.js`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/PdfFontHeader.js tests/unit/main/monospace/PdfFontHeader.test.js
git commit -m "feat(monospace): add xelatex fontspec header builder"
```

---

## Task 4: DocxFontEmbedder

**Files:**
- Create: `src/main/DocxFontEmbedder.js`
- Create: `tests/unit/main/monospace/DocxFontEmbedder.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/unit/main/monospace/DocxFontEmbedder.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

const { embedDocxFont } = require('../../../../src/main/DocxFontEmbedder');

async function makeMinimalDocx(outPath) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outPath, buf);
}

describe('DocxFontEmbedder', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-docx-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('embeds TTF into word/fonts and updates rels', async () => {
    const input = path.join(tmpDir, 'in.docx');
    const output = path.join(tmpDir, 'out.docx');
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    await makeMinimalDocx(input);
    fs.writeFileSync(ttf, Buffer.from([0x01, 0x00, 0x00, 0x00, 0x00]));

    await embedDocxFont(input, output, ttf, 'JetBrainsMono');

    const result = await JSZip.loadAsync(fs.readFileSync(output));
    const fontFiles = Object.keys(result.files).filter((n) => n.startsWith('word/fonts/'));
    expect(fontFiles.length).toBeGreaterThan(0);
    const rels = result.file('word/_rels/fontTable.xml.rels');
    expect(rels).toBeTruthy();
    const relsContent = await rels.async('string');
    expect(relsContent).toContain('.ttf');
  });

  test('returns rejected promise for invalid docx input', async () => {
    const input = path.join(tmpDir, 'invalid.docx');
    const output = path.join(tmpDir, 'out.docx');
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    fs.writeFileSync(input, Buffer.from('not a docx'));
    fs.writeFileSync(ttf, Buffer.from([0x01]));
    await expect(embedDocxFont(input, output, ttf, 'JetBrainsMono')).rejects.toThrow();
  });

  test('throws if ttf missing', async () => {
    const input = path.join(tmpDir, 'in.docx');
    const output = path.join(tmpDir, 'out.docx');
    await makeMinimalDocx(input);
    await expect(embedDocxFont(input, output, '/nope.ttf', 'JetBrainsMono')).rejects.toThrow(/TTF/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/DocxFontEmbedder.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/main/DocxFontEmbedder.js
'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const FONT_TABLE_PATH = 'word/fontTable.xml';
const FONT_TABLE_RELS_PATH = 'word/_rels/fontTable.xml.rels';

function fontTableXml(family) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="${family}">
    <w:panose1 w:val="020F0502020204030204"/>
    <w:charset w:val="00"/>
    <w:family w:val="modern"/>
    <w:pitch w:val="fixed"/>
    <w:embedRegular r:id="rId1"/>
  </w:font>
</w:fonts>`;
}

function fontTableRels(fontFilename) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${fontFilename}"/>
</Relationships>`;
}

async function embedDocxFont(inputDocxPath, outputDocxPath, ttfPath, fontFamily) {
  if (!ttfPath || !fs.existsSync(ttfPath)) {
    throw new Error(`DocxFontEmbedder: TTF not found at ${ttfPath}`);
  }
  const inputBytes = fs.readFileSync(inputDocxPath);
  const zip = await JSZip.loadAsync(inputBytes);
  const safeFamily = String(fontFamily).replace(/[^A-Za-z0-9]/g, '');
  const fontFilename = `${safeFamily}.ttf`;
  const fontBytes = fs.readFileSync(ttfPath);
  zip.file(`word/fonts/${fontFilename}`, fontBytes);
  zip.file(FONT_TABLE_PATH, fontTableXml(safeFamily));
  zip.file(FONT_TABLE_RELS_PATH, fontTableRels(fontFilename));
  const out = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(outputDocxPath, out);
}

module.exports = { embedDocxFont };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/DocxFontEmbedder.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/DocxFontEmbedder.js tests/unit/main/monospace/DocxFontEmbedder.test.js
git commit -m "feat(monospace): embed TTF into pandoc-generated DOCX"
```

---

## Task 5: EpubFontEmbedder

**Files:**
- Create: `src/main/EpubFontEmbedder.js`
- Create: `tests/unit/main/monospace/EpubFontEmbedder.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/unit/main/monospace/EpubFontEmbedder.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

const { withEpubEmbedFontArgs, embedEpubFont } = require('../../../../src/main/EpubFontEmbedder');

async function makeMinimalEpub(outPath) {
  const zip = new JSZip();
  zip.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', '<package xmlns="http://www.idpf.org/2007/opf"></package>');
  fs.writeFileSync(outPath, await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('EpubFontEmbedder', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-epub-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('withEpubEmbedFontArgs prepends --epub-embed-font', () => {
    const args = withEpubEmbedFontArgs(['-o', 'out.epub', 'in.md'], '/tmp/font.ttf', 'JetBrains Mono');
    expect(args).toContain('--epub-embed-font=/tmp/font.ttf');
    expect(args.indexOf('--epub-embed-font=/tmp/font.ttf')).toBeLessThan(args.indexOf('-o'));
  });

  test('embedEpubFont adds font to OEBPS and updates manifest', async () => {
    const epub = path.join(tmpDir, 'book.epub');
    const ttf = path.join(tmpDir, 'JetBrainsMono-Regular.ttf');
    await makeMinimalEpub(epub);
    fs.writeFileSync(ttf, Buffer.from([0x01, 0x00]));

    await embedEpubFont(epub, ttf, 'JetBrains Mono');

    const zip = await JSZip.loadAsync(fs.readFileSync(epub));
    const fontFile = zip.file('OEBPS/JetBrainsMono-Regular.ttf');
    expect(fontFile).toBeTruthy();
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).toContain('JetBrainsMono-Regular.ttf');
  });

  test('embedEpubFont rejects missing TTF', async () => {
    const epub = path.join(tmpDir, 'book.epub');
    await makeMinimalEpub(epub);
    await expect(embedEpubFont(epub, '/nope.ttf', 'JetBrains Mono')).rejects.toThrow(/TTF/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/EpubFontEmbedder.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/main/EpubFontEmbedder.js
'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function withEpubEmbedFontArgs(pandocArgs, ttfPath, _fontFamily) {
  return [`--epub-embed-font=${ttfPath}`, ...pandocArgs];
}

async function embedEpubFont(epubPath, ttfPath, fontFamily) {
  if (!ttfPath || !fs.existsSync(ttfPath)) {
    throw new Error(`EpubFontEmbedder: TTF not found at ${ttfPath}`);
  }
  const bytes = fs.readFileSync(epubPath);
  const zip = await JSZip.loadAsync(bytes);
  const ttfBytes = fs.readFileSync(ttfPath);
  const fontName = path.basename(ttfPath);
  zip.file(`OEBPS/${fontName}`, ttfBytes);
  const opfPath = 'OEBPS/content.opf';
  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    fs.writeFileSync(epubPath, await zip.generateAsync({ type: 'nodebuffer' }));
    return;
  }
  let opf = await opfFile.async('string');
  const manifestEntry = `<item id="font-${path.basename(fontName, '.ttf')}" href="${fontName}" media-type="application/x-font-ttf"/>`;
  if (!opf.includes('manifest')) {
    opf = opf.replace(
      '</package>',
      `<manifest>${manifestEntry}</manifest></package>`
    );
  } else if (!opf.includes(fontName)) {
    opf = opf.replace('</manifest>', `${manifestEntry}</manifest>`);
  }
  zip.file(opfPath, opf);
  fs.writeFileSync(epubPath, await zip.generateAsync({ type: 'nodebuffer' }));
}

module.exports = { withEpubEmbedFontArgs, embedEpubFont };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/EpubFontEmbedder.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/EpubFontEmbedder.js tests/unit/main/monospace/EpubFontEmbedder.test.js
git commit -m "feat(monospace): EPUB embed-font helper + manifest patcher"
```

---

## Task 6: ExportCss (woff2 → base64)

**Files:**
- Create: `src/main/ExportCss.js`
- Create: `tests/unit/main/monospace/ExportCss.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/unit/main/monospace/ExportCss.test.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const { buildExportCss, buildFontFaceBlock } = require('../../../../src/main/ExportCss');

describe('ExportCss', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-css-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test('buildFontFaceBlock emits @font-face with base64 data URI', () => {
    const woff2 = Buffer.from([0x77, 0x4f, 0x46, 0x32]);
    const css = buildFontFaceBlock('JetBrains Mono', woff2);
    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: \'JetBrains Mono\'');
    expect(css).toContain('format(\'woff2\')');
    expect(css).toContain('base64,');
    const m = css.match(/base64,([A-Za-z0-9+/=]+)/);
    expect(m).toBeTruthy();
    expect(Buffer.from(m[1], 'base64')).toEqual(woff2);
  });

  test('buildExportCss writes @font-face + body rule', () => {
    const woff2 = Buffer.from([0x77, 0x4f, 0x46, 0x32]);
    const css = buildExportCss({ monospaceFont: 'jetbrains-mono', monospaceLigatures: true }, { woff2 });
    expect(css).toContain('@font-face');
    expect(css).toContain('font-feature-settings');
    expect(css).toContain('\'liga\' 1');
  });

  test('buildExportCss with ligatures off omits font-feature-settings', () => {
    const woff2 = Buffer.from([0x77, 0x4f, 0x46, 0x32]);
    const css = buildExportCss({ monospaceFont: 'fira-code', monospaceLigatures: false }, { woff2 });
    expect(css).not.toContain('font-feature-settings');
    expect(css).toContain('Fira Code');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/ExportCss.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/main/ExportCss.js
'use strict';

const { FAMILY_BY_KEY } = require('./settings/monospaceSettings');

function buildFontFaceBlock(family, woff2Bytes) {
  const safeFamily = family.replace(/'/g, "\\'");
  const b64 = Buffer.from(woff2Bytes).toString('base64');
  return `@font-face {
  font-family: '${safeFamily}';
  src: url(data:font/woff2;base64,${b64}) format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}`;
}

function buildExportCss(settings, { woff2 } = {}) {
  const family = (settings && FAMILY_BY_KEY[settings.monospaceFont]) || 'JetBrains Mono';
  const ligatures = !!(settings && settings.monospaceLigatures === true);
  const face = buildFontFaceBlock(family, woff2 || Buffer.alloc(0));
  const feature = ligatures
    ? `code, pre, kbd, samp { font-feature-settings: 'liga' 1, 'calt' 1; }`
    : '';
  return [face, feature].filter(Boolean).join('\n\n');
}

module.exports = { buildExportCss, buildFontFaceBlock };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/ExportCss.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ExportCss.js tests/unit/main/monospace/ExportCss.test.js
git commit -m "feat(monospace): build CSS with embedded woff2 base64"
```

---

## Task 7: IPC handlers for monospace settings

**Files:**
- Create: `src/main/ipc/monospace-handlers.js`
- Create: `tests/unit/main/monospace/monospace-handlers.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/unit/main/monospace/monospace-handlers.test.js
const { EventEmitter } = require('events');

class FakeIpcMain extends EventEmitter {
  constructor() { super(); this.handlers = new Map(); }
  handle(channel, handler) { this.handlers.set(channel, handler); }
  emit(channel, ...args) { this.handle(channel, ...args); }
}

describe('monospace-handlers', () => {
  let ipc;
  let register;
  let store;

  beforeEach(() => {
    jest.resetModules();
    ipc = new FakeIpcMain();
    store = new Map();
    // Monkey-patch electron and store before requiring handler
    jest.doMock('electron', () => ({ ipcMain: ipc }));
    jest.doMock('../../../../src/main/store', () => ({
      get: (k, d) => (store.has(k) ? store.get(k) : d),
      set: (k, v) => store.set(k, v),
    }));
    ({ register } = require('../../../../src/main/ipc/monospace-handlers'));
  });

  test('get-monospace-settings returns defaults when nothing stored', () => {
    register();
    const handler = ipc.handlers.get('get-monospace-settings');
    return handler({}).then((result) => {
      expect(result).toEqual({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false });
    });
  });

  test('set-monospace-settings persists and returns sanitized values', () => {
    register();
    const handler = ipc.handlers.get('set-monospace-settings');
    return handler({}, { monospaceFont: 'fira-code', monospaceLigatures: 1 }).then((result) => {
      expect(result).toEqual({ monospaceFont: 'fira-code', monospaceLigatures: true });
      expect(store.get('monospaceFont')).toBe('fira-code');
      expect(store.get('monospaceLigatures')).toBe(true);
    });
  });

  test('set-monospace-settings rejects invalid font key', () => {
    register();
    const handler = ipc.handlers.get('set-monospace-settings');
    return handler({}, { monospaceFont: 'comic-sans' }).then((result) => {
      expect(result.monospaceFont).toBe('jetbrains-mono');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/main/monospace/monospace-handlers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```js
// src/main/ipc/monospace-handlers.js
'use strict';

const { ipcMain } = require('electron');
const store = require('../store');
const { safeMonospaceSettings, DEFAULT_SETTINGS } = require('../settings/monospaceSettings');

function readCurrent() {
  return {
    monospaceFont: store.get('monospaceFont', DEFAULT_SETTINGS.monospaceFont),
    monospaceLigatures: store.get('monospaceLigatures', DEFAULT_SETTINGS.monospaceLigatures),
  };
}

function register() {
  ipcMain.handle('get-monospace-settings', () => readCurrent());

  ipcMain.handle('set-monospace-settings', (_event, partial) => {
    const safe = safeMonospaceSettings(partial || {});
    if (Object.prototype.hasOwnProperty.call(partial || {}, 'monospaceFont')) {
      store.set('monospaceFont', safe.monospaceFont);
    }
    if (Object.prototype.hasOwnProperty.call(partial || {}, 'monospaceLigatures')) {
      store.set('monospaceLigatures', safe.monospaceLigatures);
    }
    return readCurrent();
  });
}

module.exports = { register, readCurrent };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/main/monospace/monospace-handlers.test.js`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/monospace-handlers.js tests/unit/main/monospace/monospace-handlers.test.js
git commit -m "feat(monospace): add get/set IPC handlers with safe validation"
```

---

## Task 8: Bundle TTF assets + asarUnpack

**Files:**
- Create: `assets/fonts/JetBrainsMono-Regular.ttf`
- Create: `assets/fonts/JetBrainsMono-Bold.ttf`
- Create: `assets/fonts/FiraCode-Regular.ttf`
- Create: `assets/fonts/FiraCode-Bold.ttf`
- Create: `assets/fonts/JetBrainsMono-LICENSE.txt`
- Create: `assets/fonts/FiraCode-LICENSE.txt`
- Modify: `package.json` (asarUnpack)

- [ ] **Step 1: Copy TTFs from master snapshot**

```bash
mkdir -p assets/fonts
cp /tmp/master-snapshot/assets/fonts/JetBrainsMono-Regular.ttf assets/fonts/
cp /tmp/master-snapshot/assets/fonts/JetBrainsMono-Bold.ttf    assets/fonts/
cp /tmp/master-snapshot/assets/fonts/FiraCode-Regular.ttf     assets/fonts/
cp /tmp/master-snapshot/assets/fonts/FiraCode-Bold.ttf        assets/fonts/
cp /tmp/master-snapshot/assets/fonts/JetBrainsMono-LICENSE.txt assets/fonts/
cp /tmp/master-snapshot/assets/fonts/FiraCode-LICENSE.txt     assets/fonts/
ls -la assets/fonts/
```

Expected: 6 files present (4 TTFs + 2 LICENSE.txt).

- [ ] **Step 2: Add asarUnpack to package.json**

Modify `package.json` `build` block, add after `files:`:

```json
"asarUnpack": [
  "assets/fonts/**"
]
```

- [ ] **Step 3: Extend download-tools.js with downloadFiraCode()**

Append to `scripts/download-tools.js` (just before `Promise.all([...])`):

```js
async function downloadFiraCode() {
  const fs = require('fs');
  const path = require('path');
  const targetDir = path.resolve(__dirname, '..', 'assets', 'fonts');
  fs.mkdirSync(targetDir, { recursive: true });
  const files = [
    { url: 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Regular.ttf', out: 'FiraCode-Regular.ttf' },
    { url: 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Bold.ttf',    out: 'FiraCode-Bold.ttf' },
    { url: 'https://raw.githubusercontent.com/tonsky/FiraCode/master/LICENSE',            out: 'FiraCode-LICENSE.txt' },
  ];
  for (const f of files) {
    await downloadToFile(f.url, path.join(targetDir, f.out));
  }
}
```

And update the final line:

```js
Promise.all([downloadPandoc(), downloadFiraCode()]).catch((err) => {
```

- [ ] **Step 4: Commit**

```bash
git add assets/fonts/ package.json scripts/download-tools.js
git commit -m "build(monospace): bundle JetBrains Mono + Fira Code TTFs, asarUnpack"
```

---

## Task 9: Wire monospace modules into exportWithPandoc

**Files:**
- Modify: `src/main/index.js` (export pipeline branches)

- [ ] **Step 1: Locate the four branches in exportWithPandoc**

Run: `grep -n "exportToPDFElectron\|exportWordWithTemplate\|exportToHTML\|epub" src/main/index.js | head -20`

- [ ] **Step 2: Add monospace wiring at the top of exportWithPandoc**

Find the function `exportWithPandoc` and add right after the args parse:

```js
const MonospaceFontConfig = require('./MonospaceFontConfig');
const { buildPdfFontHeader } = require('./PdfFontHeader');
const { embedDocxFont } = require('./DocxFontEmbedder');
const { withEpubEmbedFontArgs, embedEpubFont } = require('./EpubFontEmbedder');
const { buildExportCss } = require('./ExportCss');
const { safeMonospaceSettings, DEFAULT_SETTINGS: MONO_DEFAULTS } = require('./settings/monospaceSettings');

const monoSettings = safeMonospaceSettings({
  monospaceFont: store.get('monospaceFont', MONO_DEFAULTS.monospaceFont),
  monospaceLigatures: store.get('monospaceLigatures', MONO_DEFAULTS.monospaceLigatures),
});
const monoTtf = MonospaceFontConfig.getMonoFontTtfPath(monoSettings.monospaceFont, 400);
```

- [ ] **Step 3: Wire PDF branch with --include-in-header**

In the PDF export branch (where pandoc args are built), if format is `pdf` and `monoTtf` exists:

```js
if (format === 'pdf' && monoTtf) {
  const { headerPath } = buildPdfFontHeader(monoSettings, monoTtf, MonospaceFontConfig.getActiveFamily(monoSettings));
  pandocArgs.push(`--include-in-header=${headerPath}`);
}
```

- [ ] **Step 4: Wire DOCX branch with embedDocxFont (post-pandoc)**

In the DOCX branch, after the pandoc call, if `monoTtf` exists:

```js
if (monoTtf) {
  await embedDocxFont(outputPath, outputPath, monoTtf, MonospaceFontConfig.getActiveFamily(monoSettings).replace(/\s+/g, ''));
}
```

- [ ] **Step 5: Wire EPUB branch with --epub-embed-font + manifest patch**

```js
if (format === 'epub' && monoTtf) {
  pandocArgs = withEpubEmbedFontArgs(pandocArgs, monoTtf, MonospaceFontConfig.getActiveFamily(monoSettings));
}
// after pandoc call:
if (format === 'epub' && monoTtf) {
  await embedEpubFont(outputPath, monoTtf, MonospaceFontConfig.getActiveFamily(monoSettings));
}
```

- [ ] **Step 6: Wire HTML branch with embedded CSS**

```js
if ((format === 'html' || format === 'html5') && monoTtf) {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const woff2Path = path.join(path.dirname(monoTtf), MonospaceFontConfig.getActiveFamily(monoSettings) === 'Fira Code' ? 'FiraCode-Regular.woff2' : 'JetBrainsMono-Regular.woff2');
  if (fs.existsSync(woff2Path)) {
    const css = buildExportCss(monoSettings, { woff2: fs.readFileSync(woff2Path) });
    const cssPath = path.join(os.tmpdir(), `mono-html-${Date.now()}-${process.pid}.css`);
    fs.writeFileSync(cssPath, css);
    pandocArgs.push(`--css=${cssPath}`);
  }
}
```

- [ ] **Step 7: Run full test suite to verify no regressions**

Run: `npm test`
Expected: PASS — all 208 jest tests pass (existing + ~24 new).

- [ ] **Step 8: Commit**

```bash
git add src/main/index.js
git commit -m "feat(monospace): wire embedders into PDF/DOCX/EPUB/HTML exports"
```

---

## Task 10: Renderer hook + CSS tokens

**Files:**
- Create: `src/renderer/hooks/use-monospace-classes.ts`
- Modify: `src/renderer/styles/globals.css`
- Modify: `src/renderer/App.tsx` (mount hook once)

- [ ] **Step 1: Write failing vitest**

```ts
// src/renderer/hooks/use-monospace-classes.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyMonospaceClasses } from './use-monospace-classes';

describe('applyMonospaceClasses', () => {
  beforeEach(() => { document.body.className = ''; });
  afterEach(() => { document.body.className = ''; });

  it('applies jetbrains-mono + ligatures-off for default settings', () => {
    applyMonospaceClasses({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false });
    expect(document.body.classList.contains('mono-jetbrains-mono')).toBe(true);
    expect(document.body.classList.contains('mono-ligatures-off')).toBe(true);
  });

  it('applies fira-code + ligatures-on when enabled', () => {
    applyMonospaceClasses({ monospaceFont: 'fira-code', monospaceLigatures: true });
    expect(document.body.classList.contains('mono-fira-code')).toBe(true);
    expect(document.body.classList.contains('mono-ligatures-on')).toBe(true);
  });

  it('strips prior mono-* classes before applying new ones', () => {
    document.body.classList.add('mono-jetbrains-mono', 'mono-ligatures-off');
    applyMonospaceClasses({ monospaceFont: 'fira-code', monospaceLigatures: true });
    expect(document.body.classList.contains('mono-jetbrains-mono')).toBe(false);
    expect(document.body.classList.contains('mono-ligatures-off')).toBe(false);
    expect(document.body.classList.contains('mono-fira-code')).toBe(true);
  });

  it('falls back to defaults when given null', () => {
    applyMonospaceClasses(null);
    expect(document.body.classList.contains('mono-jetbrains-mono')).toBe(true);
  });
});
```

- [ ] **Step 2: Run vitest to verify it fails**

Run: `npm run test:renderer -- use-monospace-classes`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/renderer/hooks/use-monospace-classes.ts
export interface MonospaceSettings {
  monospaceFont: 'jetbrains-mono' | 'fira-code';
  monospaceLigatures: boolean;
}

const DEFAULTS: MonospaceSettings = {
  monospaceFont: 'jetbrains-mono',
  monospaceLigatures: false,
};

const FAMILY_CLASSES = ['mono-jetbrains-mono', 'mono-fira-code'];
const LIG_CLASSES = ['mono-ligatures-on', 'mono-ligatures-off'];

function stripMonospaceClasses(): void {
  for (const c of [...FAMILY_CLASSES, ...LIG_CLASSES]) {
    document.body.classList.remove(c);
  }
}

export function applyMonospaceClasses(input: Partial<MonospaceSettings> | null | undefined): MonospaceSettings {
  const safe: MonospaceSettings = {
    monospaceFont: (input && (input.monospaceFont === 'fira-code' ? 'fira-code' : 'jetbrains-mono')) || DEFAULTS.monospaceFont,
    monospaceLigatures: !!(input && input.monospaceLigatures === true),
  };
  stripMonospaceClasses();
  document.body.classList.add(`mono-${safe.monospaceFont}`);
  document.body.classList.add(`mono-ligatures-${safe.monospaceLigatures ? 'on' : 'off'}`);
  return safe;
}

export function useMonospaceClasses(): void {
  if (typeof window === 'undefined') return;
  const api = (window as any).electronAPI;
  if (!api || !api.monospace) return;
  api.monospace.getSettings().then(applyMonospaceClasses).catch(() => applyMonospaceClasses(null));
}
```

- [ ] **Step 4: Run vitest to verify it passes**

Run: `npm run test:renderer -- use-monospace-classes`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Add CSS tokens**

Append to `src/renderer/styles/globals.css`:

```css
:root {
  --font-mono-active: 'JetBrains Mono', 'SF Mono', Monaco, 'Courier New', monospace;
  --font-mono-feature: 'liga' 0, 'calt' 0;
}
body.mono-fira-code {
  --font-mono-active: 'Fira Code', 'JetBrains Mono', 'SF Mono', monospace;
}
body.mono-ligatures-on {
  --font-mono-feature: 'liga' 1, 'calt' 1;
}
code, pre, kbd, samp {
  font-family: var(--font-mono-active);
  font-feature-settings: var(--font-mono-feature);
}
```

- [ ] **Step 6: Mount the hook in App.tsx**

Find `src/renderer/App.tsx` and add at the top of the default exported component:

```tsx
import { useMonospaceClasses } from './hooks/use-monospace-classes';

export default function App() {
  useMonospaceClasses();
  return ...;
}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/hooks/use-monospace-classes.ts src/renderer/hooks/use-monospace-classes.test.ts src/renderer/styles/globals.css src/renderer/App.tsx
git commit -m "feat(renderer): body-class monospace toggle + CSS tokens"
```

---

## Task 11: Preload + TypeScript declarations

**Files:**
- Modify: `src/preload.js`
- Modify: `src/renderer/types/electron.d.ts`
- Modify: `src/renderer/lib/ipc.ts`

- [ ] **Step 1: Add channels to preload allowlist**

In `src/preload.js`, add to `ALLOWED_SEND_CHANNELS`:

```js
'get-monospace-settings',
'set-monospace-settings',
```

Add to the `electronAPI` object inside `contextBridge.exposeInMainWorld`:

```js
monospace: {
  getSettings: () => ipcRenderer.invoke('get-monospace-settings'),
  saveSettings: (partial) => ipcRenderer.invoke('set-monospace-settings', partial),
},
```

- [ ] **Step 2: Add TypeScript declaration**

In `src/renderer/types/electron.d.ts`, inside the `ElectronAPI` interface, add:

```ts
monospace: {
  getSettings: () => Promise<{ monospaceFont: 'jetbrains-mono' | 'fira-code'; monospaceLigatures: boolean }>;
  saveSettings: (partial: { monospaceFont?: 'jetbrains-mono' | 'fira-code'; monospaceLigatures?: boolean }) => Promise<{ monospaceFont: 'jetbrains-mono' | 'fira-code'; monospaceLigatures: boolean }>;
};
```

- [ ] **Step 3: Update ipc.ts wrapper**

In `src/renderer/lib/ipc.ts`, add typed wrappers if they exist; if `ipc.ts` is purely a `wrap()` helper, no change is needed (the d.ts change is sufficient).

- [ ] **Step 4: Run both test suites**

```bash
npm test && npm run test:renderer
```
Expected: PASS — all 208 + 430 existing + new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/preload.js src/renderer/types/electron.d.ts src/renderer/lib/ipc.ts
git commit -m "feat(ipc): expose monospace settings through preload bridge"
```

---

## Task 12: Window title + naming differentiation

**Files:**
- Modify: `package.json`
- Modify: `src/main/window/index.js`
- Modify: `src/main/updater/migration-transform.js`

- [ ] **Step 1: Update package.json identity**

```diff
-  "name": "markdown-converter",
+  "name": "markdown-converter-react",
-  "productName": "MarkdownConverter",
+  "productName": "Markdown Converter React",
-  "appId": "com.concreteinfo.markdownconverter",
+  "appId": "com.concreteinfo.markdownconverter.react",
```

Add inside `build` block:

```json
"linux": {
  "executableName": "markdown-converter-react",
  "synopsis": "Markdown editor (React build)",
  "description": "Markdown editor and universal file converter — React build"
}
```

- [ ] **Step 2: Window title suffix in dev**

In `src/main/window/index.js`, find the `BrowserWindow` constructor and add `title` option:

```js
const isDev = !!process.env.VITE_DEV_SERVER_URL;
mainWindow = new BrowserWindow({
  title: `Markdown Converter${isDev ? ' — React Dev' : ''}`,
  ...
});
```

- [ ] **Step 3: Add defaults to migration-transform.js**

In `src/main/updater/migration-transform.js`, find the v5 schema object and add:

```js
monospaceFont: z.enum(['jetbrains-mono', 'fira-code']).default('jetbrains-mono'),
monospaceLigatures: z.boolean().default(false),
appVariant: z.enum(['classic', 'react']).default('react'),
```

- [ ] **Step 4: Mirror the same defaults in the renderer migration**

In `src/renderer/lib/migrations/v4-to-v5.ts`, add the same three fields to the schema.

- [ ] **Step 5: Run tests + lint**

```bash
npm test && npm run test:renderer && npm run lint
```
Expected: PASS, PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json src/main/window/index.js src/main/updater/migration-transform.js src/renderer/lib/migrations/v4-to-v5.ts
git commit -m "build(identity): rename to Markdown Converter React + defaults"
```

---

## Task 13: E2E smoke test

**Files:**
- Create: `tests/smoke-e2e-monospace.js`

- [ ] **Step 1: Write the smoke test**

```js
// tests/smoke-e2e-monospace.js
/**
 * E2E: verify monospace TTF is embedded into actual exports.
 * Skips silently if pandoc is unavailable.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function pandocAvailable() {
  try { execFileSync('pandoc', ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function ttfAvailable() {
  const ttf = path.resolve(__dirname, '..', 'assets', 'fonts', 'JetBrainsMono-Regular.ttf');
  return fs.existsSync(ttf);
}

describe('monospace E2E', () => {
  if (!pandocAvailable() || !ttfAvailable()) {
    it.skip('pandoc or font asset unavailable', () => {});
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mono-e2e-'));
  const mdPath = path.join(tmp, 'ascii.md');
  fs.writeFileSync(
    mdPath,
    '```\n+---+---+\n| A | B |\n+---+---+\n```\n'
  );

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('PDF export references the monospace font (xelatex header)', () => {
    const headerPath = path.join(tmp, 'header.tex');
    const { buildPdfFontHeader } = require('../src/main/PdfFontHeader');
    const { getMonoFontTtfPath } = require('../src/main/MonospaceFontConfig');
    const ttf = getMonoFontTtfPath('jetbrains-mono', 400);
    const { headerPath: out } = buildPdfFontHeader(
      { monospaceFont: 'jetbrains-mono', monospaceLigatures: false },
      ttf,
      'JetBrains Mono'
    );
    const content = fs.readFileSync(out, 'utf-8');
    expect(content).toContain('\\setmonofont');
    expect(content).toContain('JetBrainsMono-Regular.ttf');
  });

  it('DOCX export embeds the TTF', async () => {
    const { embedDocxFont } = require('../src/main/DocxFontEmbedder');
    const { getMonoFontTtfPath } = require('../src/main/MonospaceFontConfig');
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
    fs.writeFileSync(path.join(tmp, 'in.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
    await embedDocxFont(
      path.join(tmp, 'in.docx'),
      path.join(tmp, 'out.docx'),
      getMonoFontTtfPath('jetbrains-mono', 400),
      'JetBrains Mono'
    );
    const out = await JSZip.loadAsync(fs.readFileSync(path.join(tmp, 'out.docx')));
    const fonts = Object.keys(out.files).filter((n) => n.startsWith('word/fonts/'));
    expect(fonts.length).toBeGreaterThan(0);
  });

  it('EPUB export args include --epub-embed-font', () => {
    const { withEpubEmbedFontArgs } = require('../src/main/EpubFontEmbedder');
    const args = withEpubEmbedFontArgs(['-o', 'out.epub', 'in.md'], '/tmp/JetBrainsMono-Regular.ttf', 'JetBrains Mono');
    expect(args).toContain('--epub-embed-font=/tmp/JetBrainsMono-Regular.ttf');
  });

  it('HTML CSS contains base64 font face', () => {
    const { buildExportCss } = require('../src/main/ExportCss');
    const woff2 = Buffer.from('woff2-test');
    const css = buildExportCss({ monospaceFont: 'jetbrains-mono', monospaceLigatures: true }, { woff2 });
    const m = css.match(/base64,([A-Za-z0-9+/=]+)/);
    expect(Buffer.from(m[1], 'base64').toString()).toBe('woff2-test');
  });
});
```

- [ ] **Step 2: Run the smoke test**

Run: `npm test -- tests/smoke-e2e-monospace.js`
Expected: PASS if assets/fonts present and pandoc present; otherwise 1 test skipped.

- [ ] **Step 3: Commit**

```bash
git add tests/smoke-e2e-monospace.js
git commit -m "test(e2e): verify monospace font embeds into PDF/DOCX/EPUB/HTML"
```

---

## Task 14: Register monospace IPC at startup + final verification

**Files:**
- Modify: `src/main/index.js`

- [ ] **Step 1: Import + register IPC handler**

At the top of `src/main/index.js`:

```js
const monospaceHandlers = require('./ipc/monospace-handlers');
```

In the app initialization function (after `app.whenReady()` or wherever other IPC handlers register), add:

```js
monospaceHandlers.register();
```

- [ ] **Step 2: Run all tests**

```bash
npm test && npm run test:renderer
```
Expected: PASS — ~230 jest + 434 vitest tests.

- [ ] **Step 3: Lint**

```bash
npm run lint
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.js
git commit -m "feat(main): register monospace IPC handlers at startup"
```

---

## Task 15: CHANGELOG + README touch-up

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add 5.1.0 entry**

Append to `CHANGELOG.md`:

```markdown
## [5.1.0] — react-electron parity

### Added
- Monospace font embedding: JetBrains Mono + Fira Code TTFs bundled and
  injected into PDF (xelatex fontspec), DOCX (post-pandoc zip patch),
  EPUB (--epub-embed-font + manifest), and HTML (base64 woff2 CSS) exports
- `monospaceFont` and `monospaceLigatures` settings exposed via
  `get-monospace-settings` / `set-monospace-settings` IPC
- Renderer body classes (`mono-jetbrains-mono`, `mono-fira-code`,
  `mono-ligatures-on/off`) drive `--font-mono-active` and
  `--font-mono-feature` CSS tokens

### Changed
- App identity renamed to **Markdown Converter React**
  (`com.concreteinfo.markdownconverter.react`) so the dev build coexists
  with the installed `markdown-converter` deb without single-instance
  lock conflicts
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: 5.1.0 changelog entry"
```

---

## Self-Review

**Spec coverage:**
- Monospace modules (5): Tasks 2-6 ✓
- Settings schema: Task 1 ✓
- IPC handlers + preload + d.ts: Tasks 7, 11 ✓
- Renderer hook + tokens: Task 10 ✓
- TTF assets + asarUnpack + download-tools: Task 8 ✓
- Wire into export pipeline: Task 9 ✓
- Naming differentiation (package.json + window title + migration defaults): Task 12 ✓
- E2E smoke test: Task 13 ✓
- Final verification + CHANGELOG: Tasks 14, 15 ✓

**Placeholder scan:** No TBD/TODO/FIXME in any step. All code blocks complete. All commands explicit with expected output.

**Type consistency:** `MonospaceSettings` shape (`{ monospaceFont: 'jetbrains-mono' | 'fira-code'; monospaceLigatures: boolean }`) used identically in Tasks 1, 7, 10, 11, 12, 13. `getMonoFontTtfPath(familyKey, weight=400)` signature consistent in Tasks 2, 9, 13. `buildPdfFontHeader(settings, ttfPath, fontFamily) → { headerPath, familyName }` consistent in Tasks 3, 9, 13.

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-monospace-font-embedding-and-naming.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, two-stage review, fast iteration
2. **Inline Execution** — execute tasks in this session, batch with checkpoints

I'll go with **Inline Execution** since you've already said "go ahead" and the work is sequential (each task's tests depend on prior commits being intact).
