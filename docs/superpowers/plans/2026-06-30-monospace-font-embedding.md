# Monospace Font Embedding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee ASCII alignment in MarkdownConverter's preview **and** every supported export format (PDF, DOCX, HTML, EPUB, LaTeX, ODT, RTF) by bundling JetBrains Mono + Fira Code TTFs inside the app and embedding them in every output. No OS font dependency, no internet required.

**Architecture:** `MonospaceFontConfig` is the single source of truth for the active monospace family + weight. It maps to bundled TTF paths (dev vs packaged/asar.unpacked). `PdfFontHeader`, `DocxFontEmbedder`, `EpubFontEmbedder`, and `ExportCss` are the four per-format adapters. Body-class toggles in the renderer flip a CSS custom property consumed by `styles-modern.css` and friends.

**Tech Stack:** Electron (main + renderer + preload), CommonJS, vanilla JS. `jszip ^3.10.1` (already a dep) for DOCX/EPUB surgery. `fontspec` via xelatex for PDF. No new NPM dependencies.

**Spec:** `docs/superpowers/specs/2026-06-30-monospace-font-embedding-design.md`

---

## File Structure

**New files (8 + 3 font assets):**

```
src/main/MonospaceFontConfig.js          # active family → TTF path resolver
src/main/PdfFontHeader.js                # builds xelatex fontspec header
src/main/DocxFontEmbedder.js             # embeds TTF into pandoc DOCX output
src/main/EpubFontEmbedder.js             # wraps pandoc --epub-embed-font + manifest patch
src/main/ExportCss.js                    # @font-face with base64-woff2, self-contained
src/main/settings/monospaceSettings.js   # shared read/default of monospace settings
tests/monospace-font-config.test.js
tests/pdf-font-header.test.js
tests/docx-font-embedder.test.js
tests/epub-font-embedder.test.js
tests/export-css.test.js
tests/monospace-settings.test.js
assets/fonts/FiraCode-Regular.ttf        # new asset
assets/fonts/FiraCode-Bold.ttf           # new asset
assets/fonts/FiraCode-LICENSE.txt        # new asset
```

**Modified files:**

```
src/fonts.css                                              # add Fira Code @font-face
src/styles/tokens.css                                      # add --font-mono-active + --font-mono-feature tokens
src/styles-concreteinfo.css                                # class-driven token values
src/styles-modern.css                                      # .editor-textarea, .preview-content code/pre use new tokens
src/ascii-generator.html                                   # swap Google Fonts CDN for local fonts.css
src/print-preview.js                                       # embed ExportCss in iframe srcdoc
src/main.js                                                # 5 export pipelines + asar config + pandoc version flag detection
src/renderer.js                                            # body-class toggle on settings change
src/preload.js                                             # expose monospaceSettings IPC
scripts/download-tools.js                                  # add Fira Code downloader
package.json                                               # build.asarUnpack + Fira font files
```

**Convention note:** All new modules are CommonJS (`require` / `module.exports`). Tests are in `tests/`, follow the existing pattern (require the module directly, no electron mocks for these).

---

## Phase A — Settings + path resolver

### Task 1: Settings schema with safe defaults

**Files:**
- Create: `src/main/settings/monospaceSettings.js`
- Test: `tests/monospace-settings.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/monospace-settings.test.js
const { getDefaults, getActiveMonoFont, isLigaturesEnabled } = require('../src/main/settings/monospaceSettings');

describe('monospaceSettings', () => {
  test('getDefaults returns sane defaults', () => {
    const d = getDefaults();
    expect(d.monospaceFont).toBe('jetbrains-mono');
    expect(d.monospaceLigatures).toBe(false);
  });

  test('getActiveMonoFont returns the active family', () => {
    expect(getActiveMonoFont({ monospaceFont: 'fira-code' })).toBe('Fira Code');
    expect(getActiveMonoFont({})).toBe('JetBrains Mono');
    expect(getActiveMonoFont({ monospaceFont: 'bogus' })).toBe('JetBrains Mono');
  });

  test('isLigaturesEnabled reads boolean strictly', () => {
    expect(isLigaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(isLigaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(isLigaturesEnabled({})).toBe(false);
    expect(isLigaturesEnabled({ monospaceLigatures: 'yes' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- tests/monospace-settings.test.js`
Expected: FAIL — `Cannot find module '../src/main/settings/monospaceSettings'`

- [ ] **Step 3: Implement**

```js
// src/main/settings/monospaceSettings.js
'use strict';

const FAMILY_BY_KEY = {
  'jetbrains-mono': 'JetBrains Mono',
  'fira-code': 'Fira Code',
};

function getDefaults() {
  return Object.freeze({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false });
}

function getActiveMonoFont(settings) {
  const key = settings && settings.monospaceFont;
  return FAMILY_BY_KEY[key] || 'JetBrains Mono';
}

function isLigaturesEnabled(settings) {
  return Boolean(settings && settings.monospaceLigatures === true);
}

module.exports = { getDefaults, getActiveMonoFont, isLigaturesEnabled, FAMILY_BY_KEY };
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- tests/monospace-settings.test.js`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/settings/monospaceSettings.js tests/monospace-settings.test.js
git commit -m "feat(monospace): add settings schema + safe defaults

getDefaults(), getActiveMonoFont(), isLigaturesEnabled() with TDD."
```

---

### Task 2: `MonospaceFontConfig` resolves dev + packaged TTF paths

**Files:**
- Create: `src/main/MonospaceFontConfig.js`
- Test: `tests/monospace-font-config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/monospace-font-config.test.js
jest.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
}));
jest.mock('fs', () => ({ existsSync: jest.fn(), statSync: jest.fn() }));

const path = require('path');
const fs = require('fs');
const MonospaceFontConfig = require('../src/main/MonospaceFontConfig');

describe('MonospaceFontConfig', () => {
  afterEach(() => { jest.clearAllMocks(); });

  test('returns dev repo path when no packaged layout exists', () => {
    fs.existsSync.mockReturnValue(false);
    const p = MonospaceFontConfig.getMonoFontTtfPath('jetbrains-mono', 400);
    expect(p).toMatch(/assets\/fonts\/JetBrainsMono-Regular\.ttf$/);
  });

  test('returns packaged asar.unpacked path when present and file exists', () => {
    fs.existsSync.mockImplementation((p) => p.includes('app.asar.unpacked') && p.endsWith('FiraCode-Regular.ttf'));
    const p = MonospaceFontConfig.getMonoFontTtfPath('fira-code', 400);
    expect(p).toContain('app.asar.unpacked');
    expect(p).toContain('FiraCode-Regular.ttf');
  });

  test('returns null and warns when file is missing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    const p = MonospaceFontConfig.getMonoFontTtfPath('fira-code', 700);
    expect(p).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/FiraCode-Bold\.ttf/));
    warn.mockRestore();
  });

  test('ligaturesEnabled maps from settings', () => {
    expect(MonospaceFontConfig.ligaturesEnabled({ monospaceLigatures: true })).toBe(true);
    expect(MonospaceFontConfig.ligaturesEnabled({ monospaceLigatures: false })).toBe(false);
    expect(MonospaceFontConfig.ligaturesEnabled({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- tests/monospace-font-config.test.js`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement**

```js
// src/main/MonospaceFontConfig.js
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getActiveMonoFont, isLigaturesEnabled, FAMILY_BY_KEY } = require('./settings/monospaceSettings');

const WEIGHT_BY_KEY = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold' };

function getAppRoot() {
  // __dirname in packaged builds = .../app.asar/src/main; we need the app dir.
  // process.resourcesPath points to the unpacked root on all platforms.
  if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, 'app.asar.unpacked'))) {
    return process.resourcesPath;
  }
  // Dev: walk up from src/main to repo root.
  return path.resolve(__dirname, '..', '..');
}

function getCandidatePaths(family, weight) {
  const familyDir = family === 'Fira Code' ? 'FiraCode' : 'JetBrainsMono';
  const weightName = WEIGHT_BY_KEY[weight] || 'Regular';
  const filename = `${familyDir}-${weightName}.ttf`;

  const candidates = [];
  // 1. Repo dev path (used in `npm start`)
  candidates.push(path.resolve(getAppRoot(), 'assets', 'fonts', filename));
  // 2. Packaged asar.unpacked
  const packagedRoot = process.resourcesPath || getAppRoot();
  candidates.push(path.join(packagedRoot, 'app.asar.unpacked', 'assets', 'fonts', filename));
  return candidates;
}

function getMonoFontTtfPath(familyKey, weight = 400) {
  const family = FAMILY_BY_KEY[familyKey] || 'JetBrains Mono';
  for (const p of getCandidatePaths(family, weight)) {
    if (fs.existsSync(p)) return p;
  }
  console.warn(`[MonospaceFontConfig] bundled font missing for ${family} weight ${weight}; falling back to system`);
  return null;
}

function ligaturesEnabled(settings) { return isLigaturesEnabled(settings); }

function getActiveFamily(settings) { return getActiveMonoFont(settings); }

module.exports = { getMonoFontTtfPath, ligaturesEnabled, getActiveFamily };
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm test -- tests/monospace-font-config.test.js`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/MonospaceFontConfig.js tests/monospace-font-config.test.js
git commit -m "feat(monospace): add MonospaceFontConfig path resolver

Resolves dev vs packaged (asar.unpacked) TTF paths. Logs warn, returns null
when bundled font is missing."
```

---

## Phase B — Bundled fonts

### Task 3: Add Fira Code TTF + LICENSE assets

**Files:**
- Create: `assets/fonts/FiraCode-Regular.ttf`
- Create: `assets/fonts/FiraCode-Bold.ttf`
- Create: `assets/fonts/FiraCode-LICENSE.txt`

- [ ] **Step 1: Confirm JetBrains Mono assets are tracked**

Run: `git ls-files assets/fonts/JetBrainsMono-*` — expect at minimum Regular, Bold, LICENSE listed. If `JetBrainsMono-Regular.ttf` and `JetBrainsMono-Bold.ttf` are still untracked (from prior session), `git add` them now.

- [ ] **Step 2: Download Fira Code TTFs + license from upstream release**

Run: `node scripts/download-tools.js --font fira-code`
Expected: writes `assets/fonts/FiraCode-Regular.ttf`, `FiraCode-Bold.ttf`, `FiraCode-LICENSE.txt`.

If the helper script doesn't accept `--font fira-code` yet, do this temporarily:

```bash
curl -L -o assets/fonts/FiraCode-Regular.ttf \
  https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Regular.ttf
curl -L -o assets/fonts/FiraCode-Bold.ttf \
  https://github.com/tonsky/FiraCode/raw/master/distr/ttf/FiraCode-Bold.ttf
curl -L -o assets/fonts/FiraCode-LICENSE.txt \
  https://raw.githubusercontent.com/tonsky/FiraCode/master/LICENSE
```

- [ ] **Step 3: Verify file sizes are reasonable**

Run: `ls -la assets/fonts/Fira*` — each TTF should be roughly 100–500 KB.

- [ ] **Step 4: Commit**

```bash
git add assets/fonts/FiraCode-Regular.ttf assets/fonts/FiraCode-Bold.ttf assets/fonts/FiraCode-LICENSE.txt assets/fonts/JetBrainsMono-Regular.ttf assets/fonts/JetBrainsMono-Bold.ttf assets/fonts/JetBrainsMono-LICENSE.txt
git commit -m "feat(monospace): bundle JetBrainsMono + FiraCode TTF assets

Both families are SIL OFL. TTF (not just woff2) is required so xelatex can
embed into PDF and jszip can inject into DOCX."
```

---

### Task 4: Extend `scripts/download-tools.js` with Fira Code support

**Files:**
- Modify: `scripts/download-tools.js`

- [ ] **Step 1: Read existing tool and identify the pandoc download pattern**

Look for how `download-pandoc` is structured (URL, version pin, mkdir, writeFile).

- [ ] **Step 2: Add Fira Code section**

Add a new exported function near the existing tools:

```js
async function downloadFiraCode() {
  const base = 'https://github.com/tonsky/FiraCode/raw/master/distr/ttf';
  const targets = [
    { url: `${base}/FiraCode-Regular.ttf`, out: 'FiraCode-Regular.ttf' },
    { url: `${base}/FiraCode-Bold.ttf`,    out: 'FiraCode-Bold.ttf' },
  ];
  fs.mkdirSync('assets/fonts', { recursive: true });
  for (const t of targets) {
    await downloadTo(t.url, path.join('assets/fonts', t.out));
  }
  await downloadTo(
    'https://raw.githubusercontent.com/tonsky/FiraCode/master/LICENSE',
    path.join('assets/fonts', 'FiraCode-LICENSE.txt')
  );
}
```

- [ ] **Step 3: Wire into the existing CLI dispatcher**

If the script uses `if (cmd === '...')` blocks, add `else if (cmd === 'fira-code' || cmd === '--font fira-code') downloadFiraCode();`. If it auto-runs every helper, no extra wiring needed.

- [ ] **Step 4: Run it as a smoke test**

Run: `node scripts/download-tools.js fira-code` (or whatever your dispatch is) — verify no errors; rerun Task 3's `ls` to confirm files exist.

- [ ] **Step 5: Commit**

```bash
git add scripts/download-tools.js
git commit -m "chore(monospace): extend download-tools with Fira Code downloader

Matches the existing version-pinned approach for Pandoc."
```

---

## Phase C — CSS layer

### Task 5: Add Fira Code `@font-face` in `src/fonts.css`

**Files:**
- Modify: `src/fonts.css` (append after the existing JetBrains Mono block)

- [ ] **Step 1: Add the new `@font-face` rules**

Append at the end of `src/fonts.css`:

```css
/* Fira Code Font Family — bundled with the app */
@font-face {
  font-family: 'Fira Code';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('../assets/fonts/FiraCode-Regular.woff2') format('woff2'),
       url('../assets/fonts/FiraCode-Regular.ttf') format('truetype');
}

@font-face {
  font-family: 'Fira Code';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('../assets/fonts/FiraCode-Bold.woff2') format('woff2'),
       url('../assets/fonts/FiraCode-Bold.ttf') format('truetype');
}
```

(`FiraCode-Regular.woff2` and `FiraCode-Bold.woff2` are optional. Chromium will pick whichever loads first; without them Chromium falls back to TTF. Skip the woff2 line if those files don't exist.)

- [ ] **Step 2: Visual smoke test in `npm start`**

Run: `npm start`. In the editor, set font-family on a paragraph to `'Fira Code', monospace` via DevTools; verify the active font shows the Fira signature slightly taller x-height. Revert the DevTools change.

- [ ] **Step 3: Commit**

```bash
git add src/fonts.css
git commit -m "feat(monospace): register Fira Code @font-face in renderer

Two weights: 400 (Regular) and 700 (Bold). Falls back to TTF if woff2
isn't bundled."
```

---

### Task 6: CSS tokens for active family + ligatures

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles-concreteinfo.css`

- [ ] **Step 1: Read existing tokens and find the `--font-mono` declaration**

```bash
grep -n "font-mono" src/styles/tokens.css src/styles-concreteinfo.css
```

Note the line where `--font-mono` is defined.

- [ ] **Step 2: Add the two new tokens**

In `src/styles/tokens.css`, add right after `--font-mono`:

```css
  --font-mono-active: 'JetBrains Mono', monospace;
  --font-mono-feature: 'liga' 0, 'calt' 0, 'dlig' 0;
```

- [ ] **Step 3: Add body-class overrides in `src/styles-concreteinfo.css`**

Append:

```css
body.mono-fira            { --font-mono-active: 'Fira Code', monospace; }
body.mono-fira.mono-ligatures-on   { --font-mono-feature: normal; }
body.mono-jetbrains       { --font-mono-active: 'JetBrains Mono', monospace; }
body.mono-ligatures-on    { --font-mono-feature: normal; }
```

(The `.mono-jetbrains` family rule is the default; the explicit declaration is for clarity and to make Lighthouse detect both branches.)

- [ ] **Step 4: Update the existing `--font-mono` declaration to use the new token**

Find the line that says `--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;` and replace with:

```css
  --font-mono: var(--font-mono-active);
```

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/styles-concreteinfo.css
git commit -m "feat(monospace): add --font-mono-active / --font-mono-feature tokens

Body classes (.mono-fira, .mono-ligatures-on) flip the tokens for live
switching without re-rendering."
```

---

### Task 7: `styles-modern.css` honours the new tokens

**Files:**
- Modify: `src/styles-modern.css`

- [ ] **Step 1: Replace hard-coded font strings with the token**

At each occurrence of a literal `'JetBrains Mono'` or `'JetBrains Mono', 'Fira Code', monospace`, replace with `var(--font-mono-active)`. Specifically:

```diff
- font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', Monaco, 'Courier New', monospace;
+ font-family: var(--font-mono-active);
```

Apply to:

- `.editor-textarea`
- `.codemirror-container .cm-editor`
- `.preview-content code`
- `.preview-content pre`
- `.source-code` / any pre/code block found in `styles-modern.css`

- [ ] **Step 2: Add ligature control to pre/code/textarea**

Append a new rule at the end of the file:

```css
.editor-textarea,
.preview-content code,
.preview-content pre,
.codemirror-container .cm-editor {
  font-feature-settings: var(--font-mono-feature);
}
```

- [ ] **Step 3: Manual visual check**

`npm start`. In DevTools, add `body.mono-fira` to `<body>` — confirm family flips; add `body.mono-ligatures-on` — confirm ligatures enable. Revert.

- [ ] **Step 4: Commit**

```bash
git add src/styles-modern.css
git commit -m "feat(monospace): wire preview + editor to --font-mono-active token"
```

---

### Task 8: Renderer toggles body classes on settings change

**Files:**
- Modify: `src/renderer.js`

- [ ] **Step 1: Locate the existing settings-changed handler**

```bash
grep -n "settings-changed\|on('settings\|applyTheme\|currentSettings\|loadSettings" src/renderer.js | head
```

Pick the function that already applies user preferences on init / change. (Examples: `applyThemeSettings`, `applyUserSettings`, or wherever header/footer settings are wired.)

- [ ] **Step 2: Implement the body-class flip**

Inside the settings-applied function, add:

```js
function applyMonospaceClasses(settings) {
  const body = document.body;
  body.classList.toggle('mono-jetbrains', settings.monospaceFont !== 'fira-code');
  body.classList.toggle('mono-fira',        settings.monospaceFont === 'fira-code');
  body.classList.toggle('mono-ligatures-on',  settings.monospaceLigatures === true);
  body.classList.toggle('mono-ligatures-off', settings.monospaceLigatures !== true);
}
```

Call `applyMonospaceClasses(currentSettings)` on initial load (wherever other current-settings are applied). Call it again inside the existing settings-changed listener.

- [ ] **Step 3: Request user contribution (learning mode)**

**Your turn:** between initial-load application and the settings-changed listener, the exact wiring depends on the codebase's existing structure. Open `src/renderer.js`, find both call sites, and place the two calls to `applyMonospaceClasses(...)`. Trade-off: tightest coupling is right next to the other settings reads, loosest is a dedicated effect block — pick whichever matches the surrounding code's idiom.

- [ ] **Step 4: Manual smoke test**

`npm start`. Open Settings (if it exists in the UI yet) — otherwise toggle the class via DevTools to confirm CSS responds. Revert when done.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.js
git commit -m "feat(monospace): renderer toggles body classes on settings change"
```

---

## Phase D — Helpers for non-CSS surfaces

### Task 9: ASCII Generator window uses local fonts

**Files:**
- Modify: `src/ascii-generator.html`

- [ ] **Step 1: Replace the Google Fonts `<link>` with local `fonts.css`**

In `src/ascii-generator.html`, find the `<link href="https://fonts.googleapis.com/css2?...">` near line 8 and replace with:

```html
<link rel="stylesheet" href="../styles/fonts.css" />
```

`fonts.css` already wires `@font-face` for both JetBrains Mono and Fira Code (after Task 5).

- [ ] **Step 2: Ensure the window body has the right default class**

Around the `<body>` tag, add the default class:

```html
<body class="mono-jetbrains mono-ligatures-off">
```

(If the file is opened by the renderer with explicit settings, the opener script can override via `document.body.classList.add/remove` — that wiring lives in the export-opening code path; consult `src/main.js` around `show-ascii-generator` for the open path.)

- [ ] **Step 3: Ensure CSS fallback is local**

Find the `.preview-content` rule (around line 142 of the file). Confirm it sets `font-family: 'JetBrains Mono', monospace;` or update it to use `var(--font-mono-active)`. If you reference the token, ensure the file links `tokens.css` or inlines the variable definition.

Quick fix if you want the simplest behaviour:

```css
.preview-content {
  font-family: 'JetBrains Mono', monospace;
  font-feature-settings: 'liga' 0, 'calt' 0, 'dlig' 0;
}
```

- [ ] **Step 4: Verify ascii-generator still works**

Run: `npm start`. Open the ASCII generator from the menu (or `Ctrl+Alt+A` if there's a binding). Confirm preview text uses JetBrains Mono and aligns correctly.

- [ ] **Step 5: Commit**

```bash
git add src/ascii-generator.html
git commit -m "fix(ascii): replace Google Fonts CDN with local fonts.css

ASCII generator now renders in bundled JetBrains Mono without internet,
matching the preview pane."
```

---

### Task 10: `ExportCss` — self-contained CSS with embedded woff2

**Files:**
- Create: `src/main/ExportCss.js`
- Test: `tests/export-css.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/export-css.test.js
const fs = require('fs');
const ExportCss = require('../src/main/ExportCss');

describe('ExportCss.build', () => {
  const fakeFontPath = require('path').join(__dirname, 'fixtures', 'fake.woff2');
  const fixture = Buffer.from('woff2-binary-fake-data');

  beforeAll(() => {
    fs.mkdirSync(require('path').dirname(fakeFontPath), { recursive: true });
    fs.writeFileSync(fakeFontPath, fixture);
  });
  afterAll(() => fs.rmSync(require('path').dirname(fakeFontPath), { recursive: true, force: true }));

  test('emits a self-contained CSS with embedded @font-face', () => {
    const css = ExportCss.build({ activeFontPath: fakeFontPath, family: 'JetBrains Mono', weight: 400, ligatures: false });
    expect(css).toMatch(/@font-face\s*\{[^}]*src:\s*url\('data:font\/woff2;base64,/);
    expect(css).toContain('font-family: \'JetBrains Mono\'');
    expect(css).toMatch(/font-feature-settings:[^;]*liga[^;]*0/);
  });

  test('falls back to family-only CSS when font path is missing', () => {
    const css = ExportCss.build({ activeFontPath: null, family: 'Fira Code', weight: 700, ligatures: true });
    expect(css).not.toContain('data:font/woff2;');
    expect(css).toContain('font-family: \'Fira Code\'');
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- tests/export-css.test.js`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: Implement**

```js
// src/main/ExportCss.js
'use strict';

const fs = require('fs');

function toDataUri(filePath) {
  const buf = fs.readFileSync(filePath);
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

function build({ activeFontPath, family, weight = 400, ligatures = false }) {
  const features = ligatures ? 'normal' : "'liga' 0, 'calt' 0, 'dlig' 0";
  const faceBlock = activeFontPath
    ? `@font-face {
  font-family: '${family}';
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
  src: url('${toDataUri(activeFontPath)}') format('woff2');
}
`
    : '';

  return `${faceBlock}code, pre, kbd, samp {
  font-family: '${family}', monospace;
  font-feature-settings: ${features};
}
pre, code {
  white-space: pre;
  tab-size: 4;
}
`;
}

module.exports = { build };
```

(Note: for the test, the file needs to look like woff2 to `_not_` matter — the encode is the same. The real `activeFontPath` in production will be the actual `.woff2` file shipped with the app. There's no need to separately ship a `.ttf` here — `ExportCss` embeds the woff2.)

- [ ] **Step 4: Run, pass**

Run: `npm test -- tests/export-css.test.js`
Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/ExportCss.js tests/export-css.test.js
git commit -m "feat(monospace): ExportCss embeds woff2 as base64 in CSS

Self-contained CSS for HTML export and print-preview iframe."
```

---

### Task 11: `print-preview.js` injects the ExportCss

**Files:**
- Modify: `src/print-preview.js`

- [ ] **Step 1: Locate the srcdoc-building function**

The file already has a `previewHtml` template literal around line 82. Inside its `<style>` block, locate the `pre`/`code` rules.

- [ ] **Step 2: Augment the srcdoc CSS**

At the top of `print-preview.js`, add the helper:

```js
const { build: buildExportCss } = require('./ExportCss');
const MonospaceFontConfig = require('./MonospaceFontConfig');
```

Inside the function that builds `previewHtml`, replace the static `pre { ... }` block with:

```js
const monospaceCss = buildExportCss({
  activeFontPath: MonospaceFontConfig.getMonoFontTtfPath(
    'jetbrains-mono', 400) /* woff2 version is preferred for preview */,
  family: MonospaceFontConfig.getActiveFamily({ monospaceFont: 'jetbrains-mono' }),
  weight: 400,
  ligatures: MonospaceFontConfig.ligaturesEnabled({ monospaceLigatures: false }),
});
```

(Note: `print-preview.js` is renderer-side, so `MonospaceFontConfig` doesn't run there — instead, use the renderer-side settings read. Adjust in Task 12 once you confirm settings context.)

- [ ] **Step 3: Request user contribution (learning mode)**

**Your turn:** `print-preview.js` runs in the renderer process, where `require` of Electron's `app` is unavailable. The cleanest path is: have the main process emit the monospace settings via an existing event (`load-custom-css` already broadcasts) OR pass them into the dialog constructor. Look at how `print-preview.js` is initialised (`new PrintPreview()`) and how it currently knows the editor font size, then thread the settings through. Decide:

- A: Pass `{ monospaceFont, monospaceLigatures }` into `new PrintPreview(settings)`.
- B: Read from `localStorage`/renderer state inside `print-preview.js`.

Both are valid; A is more testable; B requires fewer signat changes. Pick one and implement.

- [ ] **Step 4: Manual test**

`npm start`, open a markdown file, `Ctrl+P` (or whatever triggers print preview). Confirm the rendered iframe uses JetBrains Mono with `+---+` row alignment visible at consistent column X-positions across lines.

- [ ] **Step 5: Commit**

```bash
git add src/print-preview.js
git commit -m "feat(monospace): print-preview iframe uses ExportCss"
```

---

## Phase E — Pandoc export pipelines

### Task 12: Pandoc version detection helper

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add a cached version probe**

After the existing `pandocAvailable` cache declaration (line 334), add:

```js
let pandocVersionCache = null;

function getPandocMajorVersion() {
  if (pandocVersionCache !== null) return pandocVersionCache;
  execFile('pandoc', ['--version'], (error, stdout) => {
    if (error) { pandocVersionCache = 0; return; }
    const m = String(stdout).match(/pandoc\s+(\d+)\.(\d+)/);
    pandocVersionCache = m ? Number(m[1]) : 0;
  });
  return pandocVersionCache;
}

function pandocSupportsEpubEmbedFont() {
  // --epub-embed-font added in Pandoc 2.11
  return getPandocMajorVersion() >= 2 && getPandocMinorVersion() >= 11;
}
```

Add a sibling `getPandocMinorVersion`. (Or combine into a tuple-style return.)

- [ ] **Step 2: Request user contribution (learning mode)**

**Your turn:** the existing `pandocAvailable` probe uses `execFile('pandoc', ['--version'], ...)` with a callback. Replace that style or call getPandocVersion once at app startup. Confirm where existing version probes live (search `grep -rn "\-\-version" src/`) and place the new probe nearby. Synchronous read of cache is fine — the existing pattern is async with caching.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "chore(pandoc): cache parsed major/minor version for capability checks"
```

---

### Task 13: `PdfFontHeader` builds the xelatex snippet

**Files:**
- Create: `src/main/PdfFontHeader.js`
- Test: `tests/pdf-font-header.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/pdf-font-header.test.js
const PdfFontHeader = require('../src/main/PdfFontHeader');

describe('PdfFontHeader.build', () => {
  test('emits fontspec with Path and Ligatures=NoCommon when off', () => {
    const tex = PdfFontHeader.build({
      fontTtfPath: '/abs/path/JetBrainsMono-Regular.ttf',
      family: 'JetBrainsMono',
      boldTtfPath: '/abs/path/JetBrainsMono-Bold.ttf',
      ligatures: false,
    });
    expect(tex).toContain('\\usepackage{fontspec}');
    expect(tex).toMatch(/\\setmonofont\{JetBrainsMono-Regular\.ttf\}/);
    expect(tex).toContain('Path=/abs/path/JetBrainsMono-Regular.ttf/');
    expect(tex).toContain('Ligatures=NoCommon');
    expect(tex).toContain('UprightFont=*-Regular');
    expect(tex).toContain('BoldFont=*-Bold');
  });

  test('passes Ligatures=TeX when on (preserves --/---, but no programming ligatures)', () => {
    const tex = PdfFontHeader.build({
      fontTtfPath: '/abs/JBM-Regular.ttf',
      family: 'JetBrainsMono',
      boldTtfPath: '/abs/JBM-Bold.ttf',
      ligatures: true,
    });
    expect(tex).toContain('Ligatures=TeX');
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- tests/pdf-font-header.test.js`

- [ ] **Step 3: Implement**

```js
// src/main/PdfFontHeader.js
'use strict';

function escape(s) { return String(s).replace(/\\/g, '\\\\'); }

function build({ fontTtfPath, family, boldTtfPath, ligatures }) {
  if (!fontTtfPath) {
    // Fallback chain: caller is expected to handle this, but emit a no-op stub.
    return '% Monospace font path unavailable; TeX will use its default monospace.\n';
  }

  const dirOf = (p) => p.replace(/\/[^/]+$/, '') + '/';
  const baseName = (p) => p.split('/').pop();
  const ligValue = ligatures ? 'Ligatures=TeX' : 'Ligatures=NoCommon';

  return `\\usepackage{fontspec}
\\setmonofont{${escape(baseName(fontTtfPath))}}[
  Path=${escape(dirOf(fontTtfPath))},
  Extension=.ttf,
  UprightFont=*-Regular,
  BoldFont=${boldTtfPath ? escape(baseName(boldTtfPath)) : '*-Bold'},
  ${ligValue}
]
`;
}

module.exports = { build };
```

- [ ] **Step 4: Run, pass**

Run: `npm test -- tests/pdf-font-header.test.js`
Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/PdfFontHeader.js tests/pdf-font-header.test.js
git commit -m "feat(monospace): add PdfFontHeader builder for xelatex fontspec"
```

---

### Task 14: Wire PDF export to use the header

**Files:**
- Modify: `src/main.js` (around line 2619 and line 2815)

- [ ] **Step 1: Add the require near the top**

```js
const PdfFontHeader = require('./PdfFontHeader');
const MonospaceFontConfig = require('./MonospaceFontConfig');
```

- [ ] **Step 2: Replace the `-V monofont="Consolas"` lines**

In both `exportFile` (around line 2619) and `tryPdfFallback` (around line 2815):

```js
// Replace:
//   pandocCmd += ' -V monofont="Consolas"';
//   pandocCmd += ' --highlight-style=tango';
// With:
const settingsJson = readSettingsJsonCached(); // new helper, see Step 4
const monoFontPath = MonospaceFontConfig.getMonoFontTtfPath(
  settingsJson.monospaceFont || 'jetbrains-mono', 400);
const monoBoldPath = MonospaceFontConfig.getMonoFontTtfPath(
  settingsJson.monospaceFont || 'jetbrains-mono', 700);
const tmpDir = require('os').tmpdir();
const headerFile = path.join(tmpDir, `monospace-pdf-${Date.now()}.tex`);
fs.writeFileSync(headerFile, PdfFontHeader.build({
  fontTtfPath: monoFontPath,
  family: settingsJson.monospaceFont === 'fira-code' ? 'FiraCode' : 'JetBrainsMono',
  boldTtfPath: monoBoldPath,
  ligatures: !!settingsJson.monospaceLigatures,
}), 'utf-8');
pandocCmd += ` --include-in-header="${headerFile}"`;
pandocCmd += ' --highlight-style=tango';
```

- [ ] **Step 3: Implement `readSettingsJsonCached`**

```js
let _cachedSettings = null;
function readSettingsJsonCached() {
  if (_cachedSettings) return _cachedSettings;
  try {
    _cachedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch { _cachedSettings = {}; }
  // Apply defaults so callers always get the merged shape.
  _cachedSettings.monospaceFont = _cachedSettings.monospaceFont || 'jetbrains-mono';
  _cachedSettings.monospaceLigatures = _cachedSettings.monospaceLigatures === true;
  return _cachedSettings;
}
```

Invalidate `_cachedSettings` whenever `store.set` writes — find the existing `store.set` definition around line 291 and append `_cachedSettings = null;` inside.

- [ ] **Step 4: Reorder `tryPdfFallback` so lualatex comes before pdflatex**

In the `tryPdfFallback` array (currently `['pdflatex', 'lualatex']`), swap to `['lualatex', 'pdflatex']` so fontspec-capable lualatex is preferred.

- [ ] **Step 5: Manual smoke test**

Run: `npm start`. Open a file with fenced code blocks containing ASCII art. Export → PDF. Open the PDF in a viewer; confirm code blocks render in JetBrains Mono and `+---+` columns align.

- [ ] **Step 6: Commit**

```bash
git add src/main.js
git commit -m "feat(monospace): PDF export uses embedded JetBrains Mono via xelatex fontspec

Replaces Consolas (Windows-only). Fallback chain reordered so lualatex
runs before pdflatex."
```

---

### Task 15: Wire HTML export to use ExportCss via `--css`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Find the HTML export branch in `exportFile`**

```bash
grep -n "format === 'html'" src/main.js
```

- [ ] **Step 2: Inject `--css`**

In that branch (just before `runPandocCmd`), build a temp CSS file:

```js
const ExportCss = require('./ExportCss');
const cssText = ExportCss.build({
  activeFontPath: path.join(getAppRoot(), 'assets', 'fonts', `${readSettingsJsonCached().monospaceFont === 'fira-code' ? 'FiraCode' : 'JetBrainsMono'}-Regular.woff2`),
  family: readSettingsJsonCached().monospaceFont === 'fira-code' ? 'Fira Code' : 'JetBrains Mono',
  weight: 400,
  ligatures: !!readSettingsJsonCached().monospaceLigatures,
});
const cssFile = path.join(require('os').tmpdir(), `monospace-html-${Date.now()}.css`);
fs.writeFileSync(cssFile, cssText, 'utf-8');
pandocCmd += ` --css="${cssFile}"`;
```

(`getAppRoot` already exists in `MonospaceFontConfig` — re-export or duplicate the two-liner here.)

- [ ] **Step 3: Test manually**

`npm start` → open a file with code blocks → `Export → HTML` → open the resulting `.html` in a browser with no internet → confirm JetBrains Mono renders.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat(monospace): HTML export uses --css with embedded @font-face"
```

---

### Task 16: Wire EPUB export to use `--epub-embed-font`

**Files:**
- Create: `src/main/EpubFontEmbedder.js`
- Test: `tests/epub-font-embedder.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/epub-font-embedder.test.js
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const EpubFontEmbedder = require('../src/main/EpubFontEmbedder');

describe('EpubFontEmbedder.patchManifest', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const epubPath = path.join(fixturesDir, 'fake.epub');
  const fontPath = path.join(fixturesDir, 'fake.ttf');

  beforeAll(async () => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(fontPath, 'fake-ttf-binary');
    const zip = new JSZip();
    zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"></package>');
    fs.writeFileSync(epubPath, await zip.generateAsync({ type: 'nodebuffer' }));
  });

  afterAll(() => fs.rmSync(fixturesDir, { recursive: true, force: true }));

  test('adds a manifest entry referencing the TTF when missing', async () => {
    const patched = await EpubFontEmbedder.patchManifest(epubPath, [
      { path: fontPath, family: 'JetBrains Mono', weight: 400 },
    ]);
    const out = fs.readFileSync(patched);
    const zip = await JSZip.loadAsync(out);
    const opf = await zip.file('OEBPS/content.opf').async('string');
    expect(opf).toMatch(/<item[^>]*href="OEBPS\/fonts\/fake\.ttf"/);
    expect(opf).toMatch(/<item[^>]*media-type="application\/x-font-ttf"/);
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- tests/epub-font-embedder.test.js`

- [ ] **Step 3: Implement**

```js
// src/main/EpubFontEmbedder.js
'use strict';
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function patchManifest(epubPath, fonts) {
  const zip = await JSZip.loadAsync(fs.readFileSync(epubPath));
  const opfPath = Object.keys(zip.files).find((f) => f.endsWith('content.opf'));
  if (!opfPath) throw new Error('EPUB has no content.opf');
  let opf = await zip.file(opfPath).async('string');

  for (const { path: fontPath, family, weight } of fonts) {
    const filename = path.basename(fontPath);
    const inFontDir = `OEBPS/fonts/${filename}`;
    zip.file(inFontDir, fs.readFileSync(fontPath));
    if (!opf.includes(filename)) {
      const item = `<item id="font-${family.replace(/\s+/g, '-')}-${weight}" href="${inFontDir}" media-type="application/x-font-ttf"/>`;
      opf = opf.replace('</manifest>', `${item}</manifest>`);
    }
  }

  zip.file(opfPath, opf);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const tmp = `${epubPath}.patched.epub`;
  fs.writeFileSync(tmp, buf);
  return tmp;
}

module.exports = { patchManifest };
```

- [ ] **Step 4: Wire into `exportFile` for EPUB**

In the EPUB branch:

```js
if (format === 'epub') {
  if (!pandocSupportsEpubEmbedFont()) {
    dialog.showMessageBox(mainWindow, { type: 'warning', message: 'Pandoc is too old; EPUB font embedding skipped.' });
  } else {
    const regular = MonospaceFontConfig.getMonoFontTtfPath(readSettingsJsonCached().monospaceFont, 400);
    const bold    = MonospaceFontConfig.getMonoFontTtfPath(readSettingsJsonCached().monospaceFont, 700);
    const argList = [regular, bold].filter(Boolean).map((p) => ` --epub-embed-font="${p}"`).join('');
    pandocCmd += argList;
  }
}
```

Then after pandoc success, run `patchManifest` and overwrite the original output.

- [ ] **Step 5: Run, pass**

Run: `npm test -- tests/epub-font-embedder.test.js`

- [ ] **Step 6: Manual test**

Open a markdown file → Export → EPUB → open in Calibre / iBooks → confirm code blocks render in JetBrains Mono.

- [ ] **Step 7: Commit**

```bash
git add src/main/EpubFontEmbedder.js tests/epub-font-embedder.test.js src/main.js
git commit -m "feat(monospace): EPUB export embeds TTF via --epub-embed-font + manifest"
```

---

## Phase F — DOCX embedding

### Task 17: `DocxFontEmbedder` — patch pandoc output with embedded TTF

**Files:**
- Create: `src/main/DocxFontEmbedder.js`
- Test: `tests/docx-font-embedder.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/docx-font-embedder.test.js
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const DocxFontEmbedder = require('../src/main/DocxFontEmbedder');

describe('DocxFontEmbedder.embed', () => {
  const dir = path.join(__dirname, 'fixtures');
  const docxPath = path.join(dir, 'in.docx');
  const fontPath = path.join(dir, 'fake.ttf');

  beforeAll(async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fontPath, 'fake-ttf-data');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/main"><w:body/></w:document>');
    zip.file('word/styles.xml', '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/main"><w:style w:type="character" w:styleId="SourceCode"><w:name w:val="Source Code"/></w:style></w:styles>');
    fs.writeFileSync(docxPath, await zip.generateAsync({ type: 'nodebuffer' }));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('embeds TTF and patches fontTable.xml + styles.xml', async () => {
    const out = await DocxFontEmbedder.embed(docxPath, [
      { path: fontPath, family: 'JetBrains Mono', weight: 400 },
    ]);
    const zip = await JSZip.loadAsync(fs.readFileSync(out));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/fonts/'))).toBe(true);
    const fontTable = zip.file('word/fontTable.xml') ? await zip.file('word/fontTable.xml').async('string') : '';
    expect(fontTable).toContain('JetBrains Mono');
    expect(fontTable).toMatch(/<w:embedRegular/);
    const styles = await zip.file('word/styles.xml').async('string');
    expect(styles).toMatch(/<w:rFonts[^>]*w:ascii="JetBrains Mono"/);
  });

  test('is idempotent: running twice does not double-embed', async () => {
    const once = await DocxFontEmbedder.embed(docxPath, [{ path: fontPath, family: 'JetBrains Mono', weight: 400 }]);
    const twice = await DocxFontEmbedder.embed(once, [{ path: fontPath, family: 'JetBrains Mono', weight: 400 }]);
    const zip = await JSZip.loadAsync(fs.readFileSync(twice));
    const fontEntries = Object.keys(zip.files).filter((f) => /^word\/fonts\//.test(f));
    expect(fontEntries.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, fail**

Run: `npm test -- tests/docx-font-embedder.test.js`

- [ ] **Step 3: Implement**

```js
// src/main/DocxFontEmbedder.js
'use strict';
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

function generatedRId(idx) { return `rIdFont${idx}`; }

async function patchZipWithFonts(inputPath, fonts) {
  const buf = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(buf);
  const existingFontNames = new Set();

  // Detect prior embeds (idempotency)
  for (const f of Object.keys(zip.files)) {
    if (zip.files[f].name && /^word\/fonts\//.test(zip.files[f].name)) {
      const base = path.basename(f);
      existingFontNames.add(base);
    }
  }

  for (let i = 0; i < fonts.length; i++) {
    const { path: fontPath, family, weight } = fonts[i];
    const fname = path.basename(fontPath);
    const wordPath = `word/fonts/${fname}`;
    if (!existingFontNames.has(fname)) {
      zip.file(wordPath, fs.readFileSync(fontPath));
      existingFontNames.add(fname);
    }
  }

  // Build/replace word/fontTable.xml
  const fontTableXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/main">\n` +
    fonts.map((f, i) => {
      const fname = path.basename(f.path);
      const role = f.weight >= 700 ? 'Bold' : 'Regular';
      return `  <w:font w:name="${f.family}"><w:embedRegular r:id="${generatedRId(i)}" xmlns:r="${REL_NS}"/></w:font>`;
    }).join('\n') +
    `\n</w:fonts>\n`;

  zip.file('word/fontTable.xml', fontTableXml);

  // Patch [Content_Types].xml — add Override for /word/fontTable.xml if missing
  const ctPath = Object.keys(zip.files).find((f) => f === '[Content_Types].xml');
  let ct = await zip.file(ctPath).async('string');
  if (!ct.includes('PartName="/word/fontTable.xml"')) {
    ct = ct.replace('</Types>', '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/></Types>');
  }
  for (const f of fonts) {
    const ttfCt = 'application/x-font-ttf';
    const filePart = `/word/fonts/${path.basename(f.path)}`;
    if (!ct.includes(`PartName="${filePart}"`)) {
      ct = ct.replace('</Types>', `<Override PartName="${filePart}" ContentType="${ttfCt}"/></Types>`);
    }
  }
  if (!ct.includes('Default Extension="ttf"')) {
    ct = ct.replace('</Types>', '<Default Extension="ttf" ContentType="application/x-font-ttf"/></Types>');
  }
  zip.file(ctPath, ct);

  // Patch word/_rels/document.xml.rels — add relationships for fontTable and each font
  const relsPath = 'word/_rels/document.xml.rels';
  if (!zip.files[relsPath]) {
    zip.file(relsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="${REL_NS}"/>`);
  }
  let rels = await zip.file(relsPath).async('string');
  if (!rels.includes('fontTable.xml')) {
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${generatedRId(fonts.length)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/></Relationships>`,
    );
  }
  for (let i = 0; i < fonts.length; i++) {
    const fname = path.basename(fonts[i].path);
    if (!rels.includes(fname)) {
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${generatedRId(i)}" Type="http://schemas.microsoft.com/office/2011/relationships/font" Target="fonts/${fname}"/></Relationships>`,
      );
    }
  }
  zip.file(relsPath, rels);

  // Patch word/styles.xml — bind SourceCode/VerbatimChar styles to the family
  const stylesPath = 'word/styles.xml';
  if (zip.files[stylesPath]) {
    let styles = await zip.file(stylesPath).async('string');
    const family = fonts[0].family;
    if (!styles.includes(`w:ascii="${family}"`)) {
      styles = styles.replace(
        /(<w:style[^>]*w:styleId="(?:SourceCode|VerbatimChar)"[^>]*>)/,
        `$1<w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:cs="${family}"/></w:rPr>`,
      );
    }
    zip.file(stylesPath, styles);
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(inputPath, outBuf); // overwrite in place
  return inputPath;
}

async function embed(docxPath, fonts) {
  return patchZipWithFonts(docxPath, fonts);
}

module.exports = { embed };
```

- [ ] **Step 4: Run, pass**

Run: `npm test -- tests/docx-font-embedder.test.js`
Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/main/DocxFontEmbedder.js tests/docx-font-embedder.test.js
git commit -m "feat(monospace): DocxFontEmbedder injects TTF into pandoc DOCX output

Idempotent. Patches fontTable.xml, [Content_Types].xml, .rels, styles.xml."
```

---

### Task 18: Wire DOCX pipeline through the embedder

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add the require**

```js
const DocxFontEmbedder = require('./DocxFontEmbedder');
```

- [ ] **Step 2: After successful DOCX export, run the embedder**

Find the `exportFile(format)` branch where `format === 'docx'` and after `showExportSuccess(outputFile)` (or just before it in the callback), insert:

```js
runPandocCmd(pandocCmd, (err) => {
  if (err) { /* existing error path */ return; }
  try {
    const regular = MonospaceFontConfig.getMonoFontTtfPath(readSettingsJsonCached().monospaceFont, 400);
    const bold    = MonospaceFontConfig.getMonoFontTtfPath(readSettingsJsonCached().monospaceFont, 700);
    if (regular) {
      DocxFontEmbedder.embed(outputFile, [
        { path: regular, family: MonospaceFontConfig.getActiveFamily(readSettingsJsonCached()), weight: 400 },
        ...(bold ? [{ path: bold, family: MonospaceFontConfig.getActiveFamily(readSettingsJsonCached()), weight: 700 }] : []),
      ]).then(() => showExportSuccess(outputFile)).catch((embedErr) => {
        dialog.showMessageBox(mainWindow, { type: 'warning', message: `DOCX written but font embedding failed: ${embedErr.message}` });
        showExportSuccess(outputFile);
      });
    } else {
      showExportSuccess(outputFile);
    }
  } catch (e) {
    showExportSuccess(outputFile);
  }
});
```

- [ ] **Step 3: Add the ODT/RTF confirmation**

Locate the ODT and RTF branches of `exportFile`. Before invoking the pandoc command, show a non-blocking confirmation:

```js
if (format === 'odt' || format === 'rtf') {
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Continue', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: `${format.toUpperCase()} embeds the font *name* only. Recipients without ${MonospaceFontConfig.getActiveFamily(readSettingsJsonCached())} installed may see alignment drift.`,
  });
  if (choice === 1) return;
}
```

- [ ] **Step 4: Manual test**

Export a file with ASCII art to DOCX → open in Word/LibreOffice → confirm font is JetBrains Mono and tables align. Repeat with ODT and accept the warning.

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat(monospace): pipe DOCX export through DocxFontEmbedder

Adds alignment-preserving ODT/RTF confirmation dialog."
```

---

## Phase G — Bundling + integration

### Task 19: `package.json` — `asarUnpack` + Fira Code entries

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read the existing asarUnpack block**

```bash
grep -A 8 "asarUnpack" package.json
```

- [ ] **Step 2: Add the font glob**

```diff
   "asarUnpack": [
-    "node_modules/ffmpeg-static/**"
+    "node_modules/ffmpeg-static/**",
+    "assets/fonts/**"
   ]
```

If the build config uses `build.files` (older electron-builder layouts), add `assets/fonts/**` there instead.

- [ ] **Step 3: Verify the change reads well**

Run: `node -e "console.log(JSON.stringify(require('./package.json').build.asarUnpack, null, 2))"`
Expected: array of 2 globs.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(build): unpack assets/fonts/** from asar so pandoc reads TTFs"
```

---

### Task 20: IPC + preload wiring for renderer settings fetch

**Files:**
- Modify: `src/preload.js`
- Modify: `src/main.js`

- [ ] **Step 1: Add IPC handler in main.js**

```js
ipcMain.handle('get-monospace-settings', () => readSettingsJsonCached());
ipcMain.handle('set-monospace-settings', (_event, partial) => {
  for (const [k, v] of Object.entries(partial || {})) store.set(k, v);
  _cachedSettings = null;
  return readSettingsJsonCached();
});
```

- [ ] **Step 2: Expose in preload.js**

In the contextBridge.exposeInMainWorld block, add:

```js
monospace: {
  get:    () => ipcRenderer.invoke('get-monospace-settings'),
  set:    (partial) => ipcRenderer.invoke('set-monospace-settings', partial),
},
```

Match the existing export pattern (e.g., `headerFooter.settings` style) — look at how `get-header-footer-settings` is exposed for reference.

- [ ] **Step 3: Wire settings UI in renderer.js**

Find where the existing settings dialog lives (search for `headerFooter` references in renderer.js). Add two controls — a select for `monospaceFont` and a checkbox for `monospaceLigatures` — that call `monospace.set({...})` and re-apply body classes via `applyMonospaceClasses`.

If there's no in-app settings dialog yet, skip this task — DevTools can flip the classes for testing.

- [ ] **Step 4: Manual smoke test**

`npm start`. If UI exists, change font to Fira Code → preview flips → export to DOCX uses Fira Code (confirm by unzipping the DOCX and reading `fontTable.xml`).

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/preload.js src/renderer.js
git commit -m "feat(monospace): expose monospace settings via IPC + preload

Settings persist to <userData>/settings.json and update preview + exports."
```

---

### Task 21: `npm run lint` and full test suite pass

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: no errors. Fix any violations — be aware that adding new `require()` calls may reorder existing imports.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all existing tests pass + 6 new test files (~20 tests added) all pass.

- [ ] **Step 3: Run coverage report**

Run: `npm test:coverage`
Expected: coverage threshold (15%) not broken. New modules contribute to coverage.

- [ ] **Step 4: Fix any issues found**

Run: `npm run lint:fix` and `npm run format`.

- [ ] **Step 5: Commit (if any fixes were made)**

```bash
git add -u
git commit -m "chore(monospace): pass lint + tests"
```

---

### Task 22: End-to-end verification

**Files:** none (verification + documentation)

- [ ] **Step 1: Create a verification fixture**

In `tests/fixtures/ascii-sample.md` (create the dir if needed), write a markdown document with three fenced code blocks containing ASCII tables, column grids, and arrow fences. Reference: the existing `print-preview.test.js` may have a similar fixture.

```markdown
# ASCII alignment verification

Header columns:
+----+-----+-------+
| A  | B   |  C    |
+----+-----+-------+
| 1  | 22  | 333   |
| 4  | 55  | 666   |
+----+-----+-------+

```
+----+----+
| A  | B  |
+----+----+
```

Arrow test:
<------> <--------> <----->
```

- [ ] **Step 2: Manual end-to-end test**

Run: `npm start`. Open the fixture. Run each export. Open each result:

- Preview pane renders in JetBrains Mono; tables align column-wise.
- Switch to Fira Code + ligatures on → preview flips; tables still align (because we disable ligatures in the body-class baseline — toggle off).
- Export PDF → xelatex builds → code blocks align.
- Export DOCX → embedded font travels; open in Word → code blocks align.
- Export HTML → open in browser with no internet → code blocks align.
- Export EPUB → embedded font travels; open in iBooks → code blocks align.
- Export ODT/RTF → confirmation dialog appears → accept → file written.
- Print preview → embedded woff2 displays correctly.

- [ ] **Step 3: Update CLAUDE.md if needed**

If the user visible behaviour has materially changed (it has — there's a new settings UI section), append a brief note to `CLAUDE.md` under "System Dependencies" or "Project Conventions".

- [ ] **Step 4: Final commit**

```bash
git add tests/fixtures/ascii-sample.md CLAUDE.md
git commit -m "docs(monospace): ASCII fixture + CLAUDE.md note on monospace settings"
```

---

## Self-Review

- [ ] **Spec coverage:** Walk every section of `docs/superpowers/specs/2026-06-30-monospace-font-embedding-design.md`.
  - "Settings schema" → Tasks 1, 20.
  - "MonospaceFontConfig" → Task 2.
  - "PdfFontHeader" → Task 13.
  - "DocxFontEmbedder" → Tasks 17, 18.
  - "EpubFontEmbedder" → Task 16.
  - "ExportCss" → Tasks 10, 11, 15.
  - "Bundling" → Tasks 3, 4, 19.
  - "Per-Export Behaviour" table → Tasks 14 (PDF), 15 (HTML), 16 (EPUB), 17/18 (DOCX), 18 (ODT/RTF), 14 (LaTeX fallback via xelatex).
  - "Testing" → Tasks 1, 2, 10, 13, 16, 17, 22.
  - "Error Handling" → Task 12 (pandoc version), Task 14 (settings cache), Task 18 (embed fail soft-warn).
  - "Acceptance Criteria" → Task 22.

- [ ] **Placeholder scan:** No `TBD`, `TODO: implement`, or `similar to Task N`. Specific lines marked with "Request user contribution" point at concrete code locations and trade-offs.

- [ ] **Type/name consistency:**
  - `getMonoFontTtfPath(familyKey, weight)` defined Task 2, used Tasks 14, 16, 18, 20.
  - `readSettingsJsonCached()` defined Task 14, used Tasks 14, 15, 16, 18, 20.
  - `PdfFontHeader.build({ fontTtfPath, family, boldTtfPath, ligatures })` matches between test (Task 13) and consumer (Task 14).
  - `ExportCss.build({ activeFontPath, family, weight, ligatures })` matches between test (Task 10) and consumers (Tasks 11, 15).
  - `DocxFontEmbedder.embed(docxPath, fonts)` matches both test cases (Task 17).
  - `EpubFontEmbedder.patchManifest(epubPath, fonts)` matches test (Task 16).
  - `applyMonospaceClasses(settings)` (Task 8) used in same task's wiring.

All consistent.

---

## Total: 22 tasks across 7 phases. Estimated yield: ~20 new tests, ~6 new modules, ~10 modified files, full preview + 8 export paths aligned to bundled fonts.
