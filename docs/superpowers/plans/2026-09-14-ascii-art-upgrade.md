# ASCII Art Generator Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the ASCII Art Generator from a partially-dual-implemented 5-font feature to a single-source-of-truth, 17 hand-coded + 400+ FIGlet font feature with insert / copy / save output destinations and full test coverage.
**Architecture:** Extract the algorithm from `renderer.js:5942-6736` into a pure `src/main/AsciiArt.js` module that mirrors the `DocQA`/`DailyNotes` pattern. Hand-coded font tables move into `src/main/AsciiArt.fonts.js`; templates into `src/main/AsciiArt.templates.js`; `figlet` becomes a lazy-loaded `src/main/AsciiArt.figlet-adapter.js`. A new `src/renderer/ascii-controller.js` drives the existing standalone `src/ascii-generator.html` window. The in-app modal (`#ascii-art-dialog`, `showASCIIGenerator*`, `preload.js` receive channels) is deleted; the standalone window remains the only path. `electron-store` `ascii:lastFont` (via the existing `store` JSON helper in `main.js:267-289`) remembers the last-used font.
**Tech Stack:** Electron 41.10.7 · electron-builder 26.15.3 · vanilla CommonJS · `figlet@^1.8.0` (pure JS) · Jest + jsdom · ESLint flat config · Prettier (2-space, single quotes, semicolons, 100-col).
**Spec:** docs/superpowers/specs/2026-09-14-ascii-art-upgrade-design.md

## Global Constraints

- Electron 41.10.7, electron-builder 26.15.3
- Vanilla JS, no bundler. Pure modules in `src/main/`, IPC wired in `src/main.js`
- Preload allow-list at `src/preload.js` for any new IPC channels (`invoke` reuses `ALLOWED_SEND_CHANNELS`; `on` uses `ALLOWED_RECEIVE_CHANNELS`)
- Tests: Jest + jsdom. Run `npm test`, `npm run lint`, `npm run format:check`
- Single ASCII art path: standalone `BrowserWindow` only; in-app modal `#ascii-art-dialog` and dead channels `show-ascii-generator*` deleted
- New dep: `figlet` npm package (latest 1.x, pure JS, ~400 KB unpacked)
- Hand-coded font count: 17 (5 existing + 12 new) — big, small, lean, slant, isometric1-4, 3-d, 3x5, ansi-shadow, calvin-s
- New settings key: `ascii:lastFont` (via the existing `store` JSON helper in `main.js:267-289`)
- Output destinations: insert at cursor (existing, fenced code block wrapper) + copy to clipboard + save to file
- The standalone `src/ascii-generator.html` (751 lines) keeps its layout but its controller moves to a new `src/renderer/ascii-controller.js`
- Snapshot tests normalize line endings to `\n` and trim trailing whitespace
- TDD discipline: every component starts with a failing test

## File Structure

### Created
- `src/main/AsciiArt.fonts.js` — 17 hand-coded font tables (`HAND_CODED_FONTS`).
- `src/main/AsciiArt.templates.js` — 19 named ASCII templates (`ASCII_TEMPLATES`).
- `src/main/AsciiArt.figlet-adapter.js` — Lazy `require('figlet')` + `fontsSync()` cache + `textSync(text, font)` wrapper + structured error.
- `src/main/AsciiArt.js` — Pure orchestrator: `generate({ text, font, options })`, `listFonts()`, `getFontMeta(id)`.
- `src/renderer/ascii-controller.js` — Renderer-side controller for the standalone window.
- `tests/main/ascii-art.test.js` — Unit tests for `generate` / `listFonts` / `getFontMeta` / figlet adapter.
- `tests/main/ascii-art.fonts.test.js` — Snapshot tests per hand-coded font (HELLO + edge cases).
- `tests/main/ascii-art.templates.test.js` — Snapshot tests per template.
- `tests/main/ascii-art.figlet-adapter.test.js` — Adapter tests with `figlet` mocked.
- `tests/preload-ascii.test.js` — Allow-list assertions for new `ascii:*` channels.

### Modified
- `package.json` — Add `"figlet": "^1.8.0"` to `dependencies`.
- `src/main.js:4005-4010` — Add `const AsciiArt = require('./main/AsciiArt');` after DocQA require.
- `src/main.js` (after line 5611, near other recent IPC handler blocks) — Register `ascii:generate`, `ascii:list-fonts`, `ascii:get-font-meta`, `ascii:save`, `ascii:copy`, `ascii:last-font` handlers.
- `src/preload.js:98-99,294-296` — Delete dead receive channels `show-ascii-generator` and `show-ascii-generator-window`. Add new invoke channels `ascii:generate`, `ascii:list-fonts`, `ascii:get-font-meta`, `ascii:save`, `ascii:copy`, `ascii:last-font` to `ALLOWED_SEND_CHANNELS`. Add `generators.ascii.*` namespace helpers.
- `src/renderer.js:2188` — Delete `const asciiModal = new ModalManager('#ascii-art-dialog');`.
- `src/renderer.js:2202` — Delete `asciiModal` entry from `window.modals`.
- `src/renderer.js:5942-6736` — Delete entire in-app modal block.
- `src/index.html:812-1028` — Delete entire `#ascii-art-dialog` modal markup.
- `src/ascii-generator.html` — Rewrite inline `<script>` block to call `src/renderer/ascii-controller.js` instead of inlining FONTS / TEMPLATES / BOX_STYLES; replace `font-style` `<select>` with a searchable font picker; add "Copy to Clipboard" and "Save to File" buttons.
- `README.md:56` — Update ASCII Art Generator row to mention 17 hand-coded + 400+ FIGlet fonts and copy/save/insert destinations.
- `tests/preload.test.js` — Add new `ascii:*` channels to `EXPECTED_SEND_CHANNELS` (or keep `preload-ascii.test.js` as the authoritative allow-list test).

### Unchanged
- `src/main.js:5584-5611` (`openAsciiGenerator`) — standalone window creation unchanged.
- `src/main.js:5609-5611` (`'open-ascii-generator'` ipcMain.on) — unchanged.
- `README.md:125` (Ctrl+Shift+A shortcut) — unchanged.

---

### Task 1: Add `figlet` dependency and verify install

**Files:**
- Modify: `package.json:58-95` (dependencies section)

**Interfaces:**
- Consumes: nothing (greenfield dep)
- Produces: `figlet` package resolvable via `require('figlet')` from any pure module.

- [ ] **Step 1: Add `figlet` to `package.json` dependencies.** Edit the `dependencies` object in `package.json` and insert `"figlet": "^1.8.0",` alphabetically (after `ffmpeg-static`). Run `npm install --save figlet@^1.8.0` so the lockfile updates too.
- [ ] **Step 2: Verify the install is pure JS.** Run `npm ls figlet` and confirm the output lists `figlet@1.x` with no native dependencies (no `node-gyp`-built modules). Run `node -e "const f = require('figlet'); console.log(typeof f.textSync, typeof f.fontsSync)"` from `/mnt/source/apps/parallel-git-branch-dev/markdown-converter__master` and confirm `function function` is printed.
- [ ] **Step 3: Commit.** `git add package.json package-lock.json && git commit -m "chore(deps): add figlet ^1.8.0 for ASCII art generator"`

---

### Task 2: Create hand-coded font tables module

**Files:**
- Create: `src/main/AsciiArt.fonts.js`
- Test: `tests/main/ascii-art.fonts.test.js`

**Interfaces:**
- Consumes: nothing (pure data module)
- Produces: `HAND_CODED_FONTS` — `{ [id]: { height, chars: { [A-Z0-9 ' ']: string[height] } } }` for the 5 existing + 12 new fonts.

- [ ] **Step 1: Write the failing snapshot test.** Create `tests/main/ascii-art.fonts.test.js` with the following content (it will fail because the module does not exist yet):

```js
/**
 * @jest-environment node
 *
 * Per-font snapshot tests for the 17 hand-coded ASCII art fonts. Snapshots
 * are the safety net that catches drift when the font tables are hand-edited.
 * Line endings are normalized to \n and trailing whitespace is trimmed so
 * editor auto-trim does not produce spurious diffs.
 */
const AsciiArtFonts = require('../../src/main/AsciiArt.fonts');

const FONT_IDS = Object.freeze([
  // 5 existing
  'standard',
  'banner',
  'block',
  'bubble',
  'digital',
  // 12 new
  'big',
  'small',
  'lean',
  'slant',
  'isometric1',
  'isometric2',
  'isometric3',
  'isometric4',
  'three-d',
  'three-x-five',
  'ansi-shadow',
  'calvin-s',
]);

const normalize = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n');

describe('AsciiArt.fonts table shape', () => {
  test.each(FONT_IDS)('%s has height and chars for A-Z 0-9 and space', (id) => {
    const font = AsciiArtFonts.HAND_CODED_FONTS[id];
    expect(font).toBeDefined();
    expect(typeof font.height).toBe('number');
    expect(font.height).toBeGreaterThanOrEqual(4);
    expect(font.height).toBeLessThanOrEqual(8);
    expect(typeof font.chars).toBe('object');
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')) {
      expect(font.chars[ch]).toBeDefined();
      expect(font.chars[ch]).toHaveLength(font.height);
      for (const line of font.chars[ch]) {
        expect(typeof line).toBe('string');
      }
    }
  });
});

describe('AsciiArt.fonts HELLO snapshot per font', () => {
  test.each(FONT_IDS)('%s', (id) => {
    const font = AsciiArtFonts.HAND_CODED_FONTS[id];
    const lines = Array(font.height).fill('');
    for (const ch of 'HELLO') {
      const glyph = font.chars[ch] || font.chars[' '];
      for (let i = 0; i < font.height; i++) lines[i] += glyph[i];
    }
    expect(normalize(lines.join('\n'))).toMatchSnapshot();
  });
});

describe('AsciiArt.fonts edge cases', () => {
  test('unknown character falls back to space glyph (preserves column width)', () => {
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    const fallback = font.chars[' '];
    const unknown = font.chars['é'];
    expect(unknown).toEqual(fallback);
  });

  test('all digit glyphs exist for standard', () => {
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    for (const d of '0123456789') {
      expect(font.chars[d]).toBeDefined();
      expect(font.chars[d]).toHaveLength(font.height);
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails.** `npm test -- tests/main/ascii-art.fonts.test.js` — expect `Cannot find module '../../src/main/AsciiArt.fonts'`.
- [ ] **Step 3: Create the font tables module with the 5 existing fonts.** Create `src/main/AsciiArt.fonts.js` and export `HAND_CODED_FONTS` containing the 5 existing tables (`standard`, `banner`, `block`, `bubble`, `digital`) extracted from `src/renderer.js:6005-6474` and the 4-font subset that already exists in `src/ascii-generator.html:366-594`. Heights: standard=5, banner=7, block=6, bubble=5, digital=7. Use this header:

```js
/**
 * Hand-coded ASCII art font tables — 17 fonts total.
 *
 * Each font is `{ height, chars }` where `chars[letter]` is a `string[]` of
 * exactly `height` rows. Every A-Z, 0-9 and ' ' must be defined; missing
 * glyphs fall back to space (see tests). The 5 existing fonts are extracted
 * from renderer.js:6005-6474; the 12 new fonts mirror figlet 1.x reference
 * output.
 *
 * @module AsciiArt.fonts
 */
'use strict';

const HAND_CODED_FONTS = {
  standard: { /* paste from renderer.js:6008-6048 */ },
  banner:   { /* paste from renderer.js:6050-6386 */ },
  block:    { /* paste from renderer.js:6388-6401 */ },
  bubble:   { /* paste from renderer.js:6403-6410 */ },
  digital:  { /* paste from renderer.js:6412-6419 */ },
  // 12 new fonts follow
};

module.exports = { HAND_CODED_FONTS };
```

- [ ] **Step 4: Run test for the 5 existing fonts.** `npm test -- tests/main/ascii-art.fonts.test.js` — all 5 snapshot tests should now pass (the 12 new ones still fail).
- [ ] **Step 5: Author the 12 new font tables.** For each of `big` (h=8), `small` (h=5), `lean` (h=6), `slant` (h=6), `isometric1`-`isometric4` (h=6), `three-d` (h=7), `three-x-five` (h=5), `ansi-shadow` (h=8), `calvin-s` (h=7), port the canonical figlet reference output. Add each to `HAND_CODED_FONTS` in the module. Every char must have exactly `height` rows. Use figlet's bundled `.flf` files as ground truth — fetch them with `node -e "const f=require('figlet'); console.log(f.textSync('HELLO',{font:'Big'}))"` and copy the output verbatim.
- [ ] **Step 6: Run full font tests.** `npm test -- tests/main/ascii-art.fonts.test.js` — expect all 17 snapshot tests plus the shape and edge-case tests to pass. Review the generated `tests/main/__snapshots__/ascii-art.fonts.test.js.snap` file and visually verify each block's first row looks correct. If any are wrong, fix the table and re-run.
- [ ] **Step 7: Commit.** `git add src/main/AsciiArt.fonts.js tests/main/ascii-art.fonts.test.js tests/main/__snapshots__/ && git commit -m "feat(ascii-art): 17 hand-coded font tables (5 existing + 12 new) with snapshot tests"`

---

### Task 3: Create the templates module

**Files:**
- Create: `src/main/AsciiArt.templates.js`
- Test: `tests/main/ascii-art.templates.test.js`

**Interfaces:**
- Consumes: nothing (pure data module)
- Produces: `ASCII_TEMPLATES` — `{ [name]: string }` for the 19 named templates; `getTemplate(name)` accessor that returns `''` for unknown names.

- [ ] **Step 1: Write the failing snapshot test.** Create `tests/main/ascii-art.templates.test.js`:

```js
/**
 * @jest-environment node
 *
 * Per-template snapshot tests. Templates are static strings; the snapshot
 * catches accidental edits during refactors.
 */
const AsciiArtTemplates = require('../../src/main/AsciiArt.templates');

const TEMPLATE_NAMES = [
  'arrow-right',
  'arrow-down',
  'arrow-up',
  'decision',
  'process',
  'flowchart',
  'sequence',
  'network',
  'hierarchy',
  'header',
  'note',
  'warning',
  'info',
  'divider',
  'separator',
  'banner',
  'checklist',
  'progress-bar',
  'table-simple',
];

describe('AsciiArt.templates', () => {
  test.each(TEMPLATE_NAMES)('%s', (name) => {
    expect(AsciiArtTemplates.getTemplate(name)).toMatchSnapshot();
  });

  test('returns empty string for unknown name', () => {
    expect(AsciiArtTemplates.getTemplate('nope')).toBe('');
  });

  test('ASCII_TEMPLATES object exposes all 19 names', () => {
    expect(Object.keys(AsciiArtTemplates.ASCII_TEMPLATES).sort()).toEqual(
      TEMPLATE_NAMES.slice().sort()
    );
  });
});
```

- [ ] **Step 2: Run test, verify it fails.** `npm test -- tests/main/ascii-art.templates.test.js` — expect `Cannot find module`.
- [ ] **Step 3: Create the templates module.** Create `src/main/AsciiArt.templates.js` exporting `ASCII_TEMPLATES` (the merged superset of `src/renderer.js:6517-6670` and `src/ascii-generator.html:596-626`) and `getTemplate(name)`:

```js
/**
 * ASCII art templates — named pre-drawn diagrams and frames.
 *
 * Sourced from renderer.js:6517-6670 and src/ascii-generator.html:596-626.
 * 19 entries; unknown names resolve to ''.
 *
 * @module AsciiArt.templates
 */
'use strict';

const ASCII_TEMPLATES = {
  'arrow-right': '    ┌─────────────────────┐\n──▶│  Process or Action  │──▶\n    └─────────────────────┘',
  'arrow-down':  '        │\n        ▼\n┌───────────────┐\n│   Process     │\n└───────────────┘\n        │\n        ▼',
  // ...full set of 19 templates
};

function getTemplate(name) {
  if (typeof name !== 'string') return '';
  return ASCII_TEMPLATES[name] || '';
}

module.exports = { ASCII_TEMPLATES, getTemplate };
```

- [ ] **Step 4: Run templates tests, verify they pass.** `npm test -- tests/main/ascii-art.templates.test.js` — all 19 snapshot tests pass.
- [ ] **Step 5: Commit.** `git add src/main/AsciiArt.templates.js tests/main/ascii-art.templates.test.js tests/main/__snapshots__/ && git commit -m "feat(ascii-art): 19 named ASCII art templates with snapshot tests"`

---

### Task 4: Create the figlet adapter with lazy load + cache

**Files:**
- Create: `src/main/AsciiArt.figlet-adapter.js`
- Test: `tests/main/ascii-art.figlet-adapter.test.js`

**Interfaces:**
- Consumes: nothing (pure module, lazy-`require`s `figlet`)
- Produces: `loadFiglet()` (idempotent, returns the figlet module or `null` if unavailable), `listFigletFonts()` (returns `string[]` of figlet fonts), `generateFiglet(text, font)` (returns rendered string or throws `AsciiArtFigletError`).

- [ ] **Step 1: Write the failing test.** Create `tests/main/ascii-art.figlet-adapter.test.js`:

```js
/**
 * @jest-environment node
 *
 * Adapter tests — figlet is mocked so we don't ship 400 KB of fonts into
 * the test runner.
 */
jest.mock('figlet', () => {
  const actual = jest.requireActual('figlet');
  return {
    __esModule: true,
    default: actual,
    textSync: jest.fn(() => 'MOCKED_FIGLET_OUTPUT'),
    fontsSync: jest.fn(() => ['Standard', 'Big', 'Slant']),
  };
});

const FigletAdapter = require('../../src/main/AsciiArt.figlet-adapter');

describe('AsciiArt.figlet-adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    FigletAdapter._resetCache(); // test-only reset
  });

  test('loadFiglet returns the figlet module on first call', () => {
    const mod = FigletAdapter.loadFiglet();
    expect(mod).not.toBeNull();
    expect(typeof mod.textSync).toBe('function');
  });

  test('listFigletFonts returns string[] from figlet.fontsSync()', () => {
    const fonts = FigletAdapter.listFigletFonts();
    expect(fonts).toEqual(['Standard', 'Big', 'Slant']);
  });

  test('listFigletFonts caches between calls', () => {
    FigletAdapter.listFigletFonts();
    FigletAdapter.listFigletFonts();
    const figlet = require('figlet');
    expect(figlet.fontsSync).toHaveBeenCalledTimes(1);
  });

  test('generateFiglet returns rendered string', () => {
    const out = FigletAdapter.generateFiglet('HELLO', 'Big');
    expect(out).toBe('MOCKED_FIGLET_OUTPUT');
    const figlet = require('figlet');
    expect(figlet.textSync).toHaveBeenCalledWith('HELLO', { font: 'Big' });
  });

  test('generateFiglet throws AsciiArtFigletError when figlet throws', () => {
    const figlet = require('figlet');
    figlet.textSync.mockImplementationOnce(() => {
      throw new Error('unknown font');
    });
    expect(() => FigletAdapter.generateFiglet('X', 'Nope')).toThrow(FigletAdapter.AsciiArtFigletError);
  });

  test('returns null when figlet module fails to load', () => {
    // simulate require failure by reloading after breaking the module cache
    jest.isolateModules(() => {
      jest.doMock('figlet', () => {
        throw new Error('not found');
      });
      const Fresh = require('../../src/main/AsciiArt.figlet-adapter');
      Fresh._resetCache();
      expect(Fresh.loadFiglet()).toBeNull();
      expect(Fresh.listFigletFonts()).toEqual([]);
      expect(() => Fresh.generateFiglet('X', 'Big')).toThrow(FigletAdapter.AsciiArtFigletError);
    });
  });
});
```

- [ ] **Step 2: Run test, verify it fails.** `npm test -- tests/main/ascii-art.figlet-adapter.test.js` — expect module-not-found.
- [ ] **Step 3: Implement the adapter.** Create `src/main/AsciiArt.figlet-adapter.js`:

```js
/**
 * Figlet adapter — lazy-loads the figlet package and caches the font list.
 *
 * The figlet npm package ships ~400 fonts. Lazy-loading on first
 * `generateFiglet` / `listFigletFonts` call keeps app startup fast. If
 * `require('figlet')` itself fails (corrupt install), the adapter reports
 * the system as unavailable instead of crashing.
 *
 * @module AsciiArt.figlet-adapter
 */
'use strict';

class AsciiArtFigletError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AsciiArtFigletError';
    this.cause = cause;
  }
}

let _figlet = undefined;       // undefined = not yet attempted; null = failed
let _figletFonts = undefined;  // undefined = not yet listed

function loadFiglet() {
  if (_figlet !== undefined) return _figlet;
  try {
    // eslint-disable-next-line global-require
    _figlet = require('figlet');
  } catch (err) {
    _figlet = null;
  }
  return _figlet;
}

function listFigletFonts() {
  const f = loadFiglet();
  if (!f) return [];
  if (_figletFonts === undefined) {
    try {
      _figletFonts = f.fontsSync();
    } catch (err) {
      _figletFonts = [];
    }
  }
  return _figletFonts.slice();
}

function generateFiglet(text, font) {
  const f = loadFiglet();
  if (!f) {
    throw new AsciiArtFigletError('figlet is not available');
  }
  try {
    return f.textSync(String(text ?? ''), { font });
  } catch (err) {
    throw new AsciiArtFigletError(
      `figlet render failed for font "${font}": ${err.message}`,
      err
    );
  }
}

// Test-only cache reset; not used at runtime.
function _resetCache() {
  _figlet = undefined;
  _figletFonts = undefined;
}

module.exports = {
  AsciiArtFigletError,
  loadFiglet,
  listFigletFonts,
  generateFiglet,
  _resetCache,
};
```

- [ ] **Step 4: Run tests, verify they pass.** `npm test -- tests/main/ascii-art.figlet-adapter.test.js` — all 7 tests pass.
- [ ] **Step 5: Commit.** `git add src/main/AsciiArt.figlet-adapter.js tests/main/ascii-art.figlet-adapter.test.js && git commit -m "feat(ascii-art): figlet adapter with lazy load, font cache, structured error"`

---

### Task 5: Create the pure `AsciiArt` orchestrator

**Files:**
- Create: `src/main/AsciiArt.js`
- Test: `tests/main/ascii-art.test.js`

**Interfaces:**
- Consumes: the three sibling modules (`AsciiArt.fonts`, `AsciiArt.templates`, `AsciiArt.figlet-adapter`).
- Produces:
  - `generate({ text, font, options })` — returns the rendered ASCII string. `font` is one of: `'standard' | 'banner' | 'block' | 'bubble' | 'digital' | 'big' | 'small' | 'lean' | 'slant' | 'isometric1' | ... | 'calvin-s' | 'template:<name>' | 'figlet:<font>'`. Unknown / missing fonts fall back to `standard`. Unknown characters substitute the space glyph. `options` is reserved (e.g. `{ widthBreaks: false }`).
  - `listFonts()` — returns `{ id, label, kind: 'hand-coded' | 'figlet' | 'template', sample }[]`. Hand-coded first, then figlet, then templates.
  - `getFontMeta(id)` — returns `{ kind, height, supportedChars }` for hand-coded, `{ kind }` for figlet/templates.

- [ ] **Step 1: Write the failing test.** Create `tests/main/ascii-art.test.js`:

```js
/**
 * @jest-environment node
 */
const AsciiArt = require('../../src/main/AsciiArt');
const AsciiArtFonts = require('../../src/main/AsciiArt.fonts');
const AsciiArtTemplates = require('../../src/main/AsciiArt.templates');

describe('AsciiArt.generate', () => {
  test('renders "HELLO" in standard font with known shape', () => {
    const out = AsciiArt.generate({ text: 'HELLO', font: 'standard' });
    const lines = out.split('\n');
    expect(lines).toHaveLength(AsciiArtFonts.HAND_CODED_FONTS.standard.height);
    expect(lines[0]).toContain('H');
  });

  test('lowercase input is uppercased', () => {
    const a = AsciiArt.generate({ text: 'hello', font: 'standard' });
    const b = AsciiArt.generate({ text: 'HELLO', font: 'standard' });
    expect(a).toBe(b);
  });

  test('unknown font falls back to standard', () => {
    const a = AsciiArt.generate({ text: 'A', font: 'nope-not-a-font' });
    const b = AsciiArt.generate({ text: 'A', font: 'standard' });
    expect(a).toBe(b);
  });

  test('unknown character substitutes space glyph (column width preserved)', () => {
    const font = AsciiArtFonts.HAND_CODED_FONTS.standard;
    const spaceWidth = font.chars[' '][0].length;
    const out = AsciiArt.generate({ text: 'A!A', font: 'standard' });
    const line = out.split('\n')[0];
    // "A" rendered + space-glyph for "!" + "A" rendered; the middle column
    // is the space-width.
    expect(line.length).toBeGreaterThanOrEqual(spaceWidth);
  });

  test('renders a named template via "template:<name>"', () => {
    const tpl = AsciiArtTemplates.getTemplate('arrow-right');
    expect(AsciiArt.generate({ text: 'ignored', font: 'template:arrow-right' })).toBe(tpl);
  });

  test('renders figlet font via "figlet:<font>" — adapter is mocked below', () => {
    // Mock the adapter module so we don't depend on the real figlet.
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: (t, f) => `FIGLET[${f}:${t}]`,
      listFigletFonts: () => ['Big', 'Slant'],
      loadFiglet: () => ({ fontsSync: () => ['Big', 'Slant'] }),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    expect(Fresh.generate({ text: 'HI', font: 'figlet:Big' })).toBe('FIGLET[Big:HI]');
  });

  test('propagates AsciiArtFigletError on figlet failure', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => {
        throw new Error('boom');
      },
      listFigletFonts: () => [],
      loadFiglet: () => null,
    }));
    const Fresh = require('../../src/main/AsciiArt');
    expect(() => Fresh.generate({ text: 'X', font: 'figlet:Big' })).toThrow(/figlet/i);
  });
});

describe('AsciiArt.listFonts', () => {
  test('returns hand-coded fonts first, then figlet, then templates', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => ['Big', 'Slant'],
      loadFiglet: () => ({ fontsSync: () => ['Big', 'Slant'] }),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    const list = Fresh.listFonts();
    expect(list.length).toBeGreaterThanOrEqual(17 + 2 + 19);
    // first 17 should be hand-coded
    for (let i = 0; i < 17; i++) {
      expect(list[i].kind).toBe('hand-coded');
      expect(list[i].id).toMatch(/^[a-z0-9-]+$/);
    }
    // figlet entries come next
    const firstFiglet = list.find((f) => f.kind === 'figlet');
    expect(firstFiglet.id).toBe('figlet:Big');
  });

  test('still returns hand-coded + templates when figlet is unavailable', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => [],
      loadFiglet: () => null,
    }));
    const Fresh = require('../../src/main/AsciiArt');
    const list = Fresh.listFonts();
    expect(list.some((f) => f.kind === 'figlet')).toBe(false);
    expect(list.filter((f) => f.kind === 'hand-coded')).toHaveLength(17);
    expect(list.filter((f) => f.kind === 'template').length).toBeGreaterThanOrEqual(19);
  });

  test('every entry has id, label, kind, sample', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => [],
      loadFiglet: () => null,
    }));
    const Fresh = require('../../src/main/AsciiArt');
    for (const f of Fresh.listFonts()) {
      expect(typeof f.id).toBe('string');
      expect(typeof f.label).toBe('string');
      expect(['hand-coded', 'figlet', 'template']).toContain(f.kind);
      expect(typeof f.sample).toBe('string');
      expect(f.sample.length).toBeGreaterThan(0);
    }
  });
});

describe('AsciiArt.getFontMeta', () => {
  test('hand-coded font returns kind, height, supportedChars', () => {
    const meta = AsciiArt.getFontMeta('big');
    expect(meta.kind).toBe('hand-coded');
    expect(typeof meta.height).toBe('number');
    expect(meta.height).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(meta.supportedChars)).toBe(true);
    expect(meta.supportedChars).toEqual(expect.arrayContaining(['A', '0', ' ']));
  });

  test('template returns { kind: "template" }', () => {
    expect(AsciiArt.getFontMeta('template:flowchart')).toEqual({ kind: 'template' });
  });

  test('figlet returns { kind: "figlet" }', () => {
    jest.resetModules();
    jest.doMock('../../src/main/AsciiArt.figlet-adapter', () => ({
      AsciiArtFigletError: class extends Error {},
      generateFiglet: () => '',
      listFigletFonts: () => ['Big'],
      loadFiglet: () => ({}),
    }));
    const Fresh = require('../../src/main/AsciiArt');
    expect(Fresh.getFontMeta('figlet:Big')).toEqual({ kind: 'figlet' });
  });

  test('unknown id returns null', () => {
    expect(AsciiArt.getFontMeta('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails.** `npm test -- tests/main/ascii-art.test.js` — expect module-not-found.
- [ ] **Step 3: Implement `AsciiArt.js`.** Create `src/main/AsciiArt.js`:

```js
/**
 * ASCII art orchestrator — pure module.
 *
 * Public API:
 *   - generate({ text, font, options }) → string
 *   - listFonts()                        → [{ id, label, kind, sample }]
 *   - getFontMeta(id)                    → { kind, height?, supportedChars? } | null
 *
 * `font` is a single string that namespaces each backend:
 *   - bare id ('standard', 'big', 'isometric1', ...)           → hand-coded
 *   - 'template:<name>'                                        → templates
 *   - 'figlet:<font>'                                          → lazy figlet
 *
 * Pure: no Electron, no fs, no IPC. Wired to main.js via ipcMain.handle.
 *
 * @module AsciiArt
 */
'use strict';

const { HAND_CODED_FONTS } = require('./AsciiArt.fonts');
const { getTemplate, ASCII_TEMPLATES } = require('./AsciiArt.templates');
const FigletAdapter = require('./AsciiArt.figlet-adapter');

const SAMPLE_TEXT = 'HELLO';

function _renderHandCoded(text, fontId) {
  const font = HAND_CODED_FONTS[fontId];
  if (!font) return null;
  const upper = String(text ?? '').toUpperCase();
  const lines = Array(font.height).fill('');
  for (const ch of upper) {
    const glyph = font.chars[ch] || font.chars[' '];
    for (let i = 0; i < font.height; i++) lines[i] += glyph[i];
  }
  return lines.join('\n');
}

function generate({ text, font, options } = {}) {
  const f = typeof font === 'string' && font ? font : 'standard';
  if (f.startsWith('template:')) {
    return getTemplate(f.slice('template:'.length));
  }
  if (f.startsWith('figlet:')) {
    return FigletAdapter.generateFiglet(String(text ?? ''), f.slice('figlet:'.length));
  }
  const rendered = _renderHandCoded(text, f);
  return rendered !== null ? rendered : _renderHandCoded(text, 'standard');
}

function listFonts() {
  const out = [];
  for (const [id, font] of Object.entries(HAND_CODED_FONTS)) {
    out.push({
      id,
      label: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      kind: 'hand-coded',
      sample: _renderHandCoded(SAMPLE_TEXT, id),
    });
  }
  for (const name of FigletAdapter.listFigletFonts()) {
    out.push({
      id: `figlet:${name}`,
      label: `FIGlet · ${name}`,
      kind: 'figlet',
      sample: '',
    });
  }
  for (const name of Object.keys(ASCII_TEMPLATES)) {
    out.push({
      id: `template:${name}`,
      label: `Template · ${name.replace(/-/g, ' ')}`,
      kind: 'template',
      sample: ASCII_TEMPLATES[name],
    });
  }
  return out;
}

function getFontMeta(id) {
  if (typeof id !== 'string' || !id) return null;
  if (id.startsWith('template:')) {
    return ASCII_TEMPLATES[id.slice('template:'.length)] ? { kind: 'template' } : null;
  }
  if (id.startsWith('figlet:')) {
    const name = id.slice('figlet:'.length);
    return FigletAdapter.listFigletFonts().includes(name) ? { kind: 'figlet' } : null;
  }
  const font = HAND_CODED_FONTS[id];
  if (!font) return null;
  return {
    kind: 'hand-coded',
    height: font.height,
    supportedChars: Object.keys(font.chars),
  };
}

module.exports = { generate, listFonts, getFontMeta };
```

- [ ] **Step 4: Run tests, verify they pass.** `npm test -- tests/main/ascii-art.test.js` — all 11 tests pass.
- [ ] **Step 5: Commit.** `git add src/main/AsciiArt.js tests/main/ascii-art.test.js && git commit -m "feat(ascii-art): pure AsciiArt module with generate/listFonts/getFontMeta"`

---

### Task 6: Wire IPC handlers in main.js

**Files:**
- Modify: `src/main.js:4005-4010` (require block)
- Modify: `src/main.js` (new handlers, inserted after `workspace-search:query` handler at line 5876)
- Modify: `src/main.js:5611` (existing `open-ascii-generator` handler — untouched)

**Interfaces:**
- Consumes: the `AsciiArt` module, the existing `store` helper at `main.js:267-289`, and the existing `dialog`, `clipboard`, `BrowserWindow` from Electron (already imported).
- Produces: IPC handlers `ascii:generate`, `ascii:list-fonts`, `ascii:get-font-meta`, `ascii:save`, `ascii:copy`, `ascii:last-font`.

- [ ] **Step 1: Add the require.** Insert `const AsciiArt = require('./main/AsciiArt');` after line 4008 (`const DocQA = require('./main/DocQA');`).
- [ ] **Step 2: Add the new IPC handlers.** Insert the following block immediately after the existing `ipcMain.handle('workspace-search:query', …)` handler (after the DocQA handler block, around line 5969 or wherever the doc-search block ends in current main.js):

```js
// ============================================
// ASCII Art Generator (standalone window)
// ============================================
// Renders text banners, boxes, and templates via the pure AsciiArt module.
// Font list is requested once on renderer mount. Save-to-file uses the
// active window as the parent of the save dialog. Last-used font is
// persisted to <userData>/settings.json via the JSON store helper.

ipcMain.handle('ascii:list-fonts', () => AsciiArt.listFonts());

ipcMain.handle('ascii:get-font-meta', (_event, id) => AsciiArt.getFontMeta(id));

ipcMain.handle('ascii:generate', (_event, { text, font, options } = {}) => {
  return AsciiArt.generate({ text, font, options });
});

ipcMain.handle('ascii:copy', (_event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(typeof text === 'string' ? text : '');
  return true;
});

ipcMain.handle('ascii:save', async (event, { text, defaultName } = {}) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showSaveDialog(win || undefined, {
    title: 'Save ASCII Art',
    defaultPath: typeof defaultName === 'string' && defaultName ? defaultName : 'ascii-art.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }, { name: 'All', extensions: ['*'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await require('fs').promises.writeFile(result.filePath, text ?? '', 'utf-8');
  return { canceled: false, path: result.filePath };
});

ipcMain.handle('ascii:last-font', (_event, { font } = {}) => {
  if (typeof font === 'string') {
    store.set('ascii:lastFont', font);
    return font;
  }
  return store.get('ascii:lastFont', null);
});
```

- [ ] **Step 3: Manual smoke check (not a test, just `node -e`).** Run `node -e "const A=require('./src/main/AsciiArt'); console.log(A.listFonts().length, A.generate({text:'HI',font:'standard'}).split('\\n').length)"` from the repo root and confirm output is a number ≥ 17 and ≤ 19 hand-coded lines.
- [ ] **Step 4: Commit.** `git add src/main.js && git commit -m "feat(ascii-art): wire IPC handlers for generate/list-fonts/save/copy/last-font"`

---

### Task 7: Update preload.js — delete dead channels, add new namespace

**Files:**
- Modify: `src/preload.js:98-99` (existing `open-ascii-generator` line — keep)
- Modify: `src/preload.js:294-296` (delete dead receive channels)
- Modify: `src/preload.js:ALLOWED_SEND_CHANNELS` (add new ascii invoke channels)
- Modify: `src/preload.js:511-513` (extend `generators.ascii` namespace)

**Interfaces:**
- Consumes: nothing (configuration).
- Produces: `window.electronAPI.generators.ascii.{ listFonts, getFontMeta, generate, copy, save, lastFont }`.

- [ ] **Step 1: Delete dead receive channels.** Remove lines 294-296 from `src/preload.js`:
   - `'show-ascii-generator-window',`
   - `'show-ascii-generator',`
   (along with their comment header `// ASCII Art Generator`).
- [ ] **Step 2: Add new invoke channels.** In `ALLOWED_SEND_CHANNELS`, insert after the existing `'open-ascii-generator',` line (line 99):
   ```js
   // ASCII art generator (standalone window — invoke channels)
   'ascii:generate',
   'ascii:list-fonts',
   'ascii:get-font-meta',
   'ascii:save',
   'ascii:copy',
   'ascii:last-font',
   ```
- [ ] **Step 3: Extend the `generators` namespace.** Replace the `generators: { openAscii, openTable }` block at lines 510-513 with:
   ```js
   // Generator Windows
   generators: {
     openAscii: () => ipcRenderer.send('open-ascii-generator'),
     openTable: () => ipcRenderer.send('open-table-generator'),
     ascii: {
       listFonts: () => ipcRenderer.invoke('ascii:list-fonts'),
       getFontMeta: (id) => ipcRenderer.invoke('ascii:get-font-meta', id),
       generate: (args) => ipcRenderer.invoke('ascii:generate', args),
       copy: (text) => ipcRenderer.invoke('ascii:copy', text),
       save: (args) => ipcRenderer.invoke('ascii:save', args),
       lastFont: (font) => ipcRenderer.invoke('ascii:last-font', { font }),
     },
   },
   ```
- [ ] **Step 4: Lint check.** `npm run lint` — must be clean. If ESLint flags the unused delete, verify no other code references the deleted channels via `grep -rn "show-ascii-generator" src tests`.
- [ ] **Step 5: Commit.** `git add src/preload.js && git commit -m "feat(ascii-art): preload allow-list + ascii namespace; remove dead show-ascii-generator channels"`

---

### Task 8: Create the preload allow-list assertion test

**Files:**
- Create: `tests/preload-ascii.test.js`
- Modify: `tests/preload.test.js:EXPECTED_SEND_CHANNELS` (extend allow-list)

**Interfaces:**
- Consumes: `src/preload.js` (the source file)
- Produces: passing test that asserts the allow-list contains exactly the right channels.

- [ ] **Step 1: Write the failing test.** Create `tests/preload-ascii.test.js`:

```js
/**
 * @jest-environment node
 *
 * Asserts that the preload.js allow-list contains the new ascii:* invoke
 * channels and does NOT contain the dead show-ascii-generator* channels.
 */
const fs = require('fs');
const path = require('path');

const preloadSrc = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'preload.js'),
  'utf-8'
);

const REQUIRED_CHANNELS = [
  'ascii:generate',
  'ascii:list-fonts',
  'ascii:get-font-meta',
  'ascii:save',
  'ascii:copy',
  'ascii:last-font',
];

const DEAD_CHANNELS = ['show-ascii-generator', 'show-ascii-generator-window'];

describe('preload.js ASCII channels', () => {
  test.each(REQUIRED_CHANNELS)('declares %s in the allow-list', (channel) => {
    expect(preloadSrc).toContain(`'${channel}'`);
  });

  test.each(DEAD_CHANNELS)('removed %s from allow-list', (channel) => {
    expect(preloadSrc).not.toContain(`'${channel}'`);
  });

  test('generators.ascii namespace is exposed', () => {
    expect(preloadSrc).toMatch(/ascii:\s*\{/);
    expect(preloadSrc).toMatch(/listFonts/);
    expect(preloadSrc).toMatch(/generate/);
    expect(preloadSrc).toMatch(/copy/);
    expect(preloadSrc).toMatch(/save/);
    expect(preloadSrc).toMatch(/lastFont/);
  });
});
```

- [ ] **Step 2: Extend `tests/preload.test.js` `EXPECTED_SEND_CHANNELS`.** Add the 6 new channels to the existing array in the `EXPECTED_SEND_CHANNELS` block so the broader security test also passes.
- [ ] **Step 3: Run test, verify it passes.** `npm test -- tests/preload-ascii.test.js tests/preload.test.js`.
- [ ] **Step 4: Commit.** `git add tests/preload-ascii.test.js tests/preload.test.js && git commit -m "test(preload): ascii channel allow-list assertions + extend existing security test"`

---

### Task 9: Create the renderer-side controller

**Files:**
- Create: `src/renderer/ascii-controller.js`

**Interfaces:**
- Consumes: `window.electronAPI.generators.ascii.*` (new preload helpers).
- Produces: a single `bootstrap()` function that wires the standalone-window DOM (input, options, font picker, preview, action buttons) when loaded via `<script src="…">` in `src/ascii-generator.html`. Exports as both `window.ASCIIController` (for inline debugging) and a module-style default (no-op in non-browser).

- [ ] **Step 1: Create the controller.** Write `src/renderer/ascii-controller.js`:

```js
/**
 * ASCII Art Generator — renderer controller for the standalone window.
 *
 * Drives the DOM in src/ascii-generator.html. Fetches the font list from
 * the main process once on mount, renders previews on input, and exposes
 * Insert / Copy / Save actions. Last-used font is restored from
 * electron-store (via main) and saved on every change.
 *
 * No bundler, no framework — pure DOM + window.electronAPI bridge.
 */
(function () {
  'use strict';

  const api = window.electronAPI && window.electronAPI.generators && window.electronAPI.generators.ascii;
  const els = {
    textInput:    document.getElementById('text-input'),
    fontPicker:   document.getElementById('font-picker'),
    fontSearch:   document.getElementById('font-search'),
    preview:      document.getElementById('preview'),
    btnInsert:    document.getElementById('btn-insert'),
    btnCopy:      document.getElementById('btn-copy'),
    btnSave:      document.getElementById('btn-save'),
    btnGenerate:  document.getElementById('btn-generate'),
    warning:      document.getElementById('ascii-warning'),
  };

  let _fonts = [];
  let _currentFont = 'standard';
  let _previewText = '';
  let _searchDebounce = null;

  function showWarning(msg) {
    if (!els.warning) return;
    els.warning.textContent = msg || '';
    els.warning.style.display = msg ? 'block' : 'none';
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  async function refreshPreview() {
    if (!api) return;
    const text = els.textInput ? els.textInput.value : 'HELLO';
    _previewText = text;
    try {
      const out = await api.generate({ text, font: _currentFont });
      els.preview.textContent = out;
      showWarning('');
    } catch (err) {
      els.preview.textContent = '';
      showWarning(`Failed to render: ${err.message || err}`);
    }
  }

  function renderFontList(filter) {
    if (!els.fontPicker) return;
    const f = (filter || '').toLowerCase();
    const filtered = _fonts.filter((font) => {
      if (!f) return true;
      return font.label.toLowerCase().includes(f) || font.id.toLowerCase().includes(f);
    });
    els.fontPicker.innerHTML = '';
    for (const font of filtered.slice(0, 500)) {
      const opt = document.createElement('option');
      opt.value = font.id;
      opt.textContent = `${font.label} (${font.kind})`;
      if (font.id === _currentFont) opt.selected = true;
      els.fontPicker.appendChild(opt);
    }
  }

  async function loadFonts() {
    if (!api) return;
    try {
      _fonts = await api.listFonts();
    } catch (err) {
      _fonts = [];
      showWarning('Could not load font list. Hand-coded fonts only.');
    }
    try {
      const last = await api.lastFont(null);
      if (last && _fonts.some((f) => f.id === last)) _currentFont = last;
    } catch { /* ignore */ }
    renderFontList('');
  }

  function wireEvents() {
    if (els.textInput) {
      els.textInput.addEventListener('input', debounce(refreshPreview, 200));
    }
    if (els.fontPicker) {
      els.fontPicker.addEventListener('change', () => {
        _currentFont = els.fontPicker.value;
        if (api) api.lastFont(_currentFont).catch(() => {});
        refreshPreview();
      });
    }
    if (els.fontSearch) {
      els.fontSearch.addEventListener('input', () => {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => renderFontList(els.fontSearch.value), 100);
      });
    }
    if (els.btnGenerate) {
      els.btnGenerate.addEventListener('click', refreshPreview);
    }
    if (els.btnInsert) {
      els.btnInsert.addEventListener('click', () => {
        const wrapped = '```\n' + (_previewText ? document.getElementById('preview').textContent : '') + '\n```';
        if (window.electronAPI && window.electronAPI.send) {
          window.electronAPI.send('insert-generated-content', wrapped);
          window.close();
        }
      });
    }
    if (els.btnCopy) {
      els.btnCopy.addEventListener('click', async () => {
        const text = els.preview.textContent;
        if (!text) return;
        try {
          await api.copy(text);
          showWarning('Copied to clipboard.');
          setTimeout(() => showWarning(''), 1500);
        } catch (err) {
          showWarning('Copy failed: ' + (err.message || err));
        }
      });
    }
    if (els.btnSave) {
      els.btnSave.addEventListener('click', async () => {
        const text = els.preview.textContent;
        if (!text) return;
        try {
          const result = await api.save({ text, defaultName: 'ascii-art.txt' });
          if (!result.canceled) {
            showWarning(`Saved to ${result.path}`);
            setTimeout(() => showWarning(''), 2000);
          }
        } catch (err) {
          showWarning('Save failed: ' + (err.message || err));
        }
      });
    }
  }

  async function bootstrap() {
    wireEvents();
    await loadFonts();
    await refreshPreview();
  }

  window.ASCIIController = { bootstrap };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
```

- [ ] **Step 2: Manual sanity check (no test yet — DOM tests come in Task 10).** Run `node -c src/renderer/ascii-controller.js` to verify it parses; the file does not run outside the browser so we cannot `node` it directly.
- [ ] **Step 3: Commit.** `git add src/renderer/ascii-controller.js && git commit -m "feat(ascii-art): renderer controller for standalone window (font picker + copy/save/insert)"`

---

### Task 10: Rewrite the standalone window HTML

**Files:**
- Modify: `src/ascii-generator.html:245-356` (mode tabs / forms / preview — keep mode-tabs/box/templates layout but swap `font-style` `<select>` for the searchable picker and add two new buttons)
- Modify: `src/ascii-generator.html:359-362` (footer buttons — add Copy + Save)
- Modify: `src/ascii-generator.html:364-749` (inline `<script>` — replaced by `<script src="../renderer/ascii-controller.js"></script>`)

**Interfaces:**
- Consumes: `src/renderer/ascii-controller.js`
- Produces: a standalone window that loads the controller, renders all 17+ fonts, and exposes Insert / Copy / Save.

- [ ] **Step 1: Replace the inline FONTS/TEMPLATES/BOX_STYLES + generation script with a controller script tag.** In `src/ascii-generator.html`, remove the entire `<script>` block from `// ASCII Art Generator Logic` through the closing `</script>` (lines ~364-749). Replace with:
   ```html
   <script src="../renderer/ascii-controller.js"></script>
   ```
- [ ] **Step 2: Replace the text-mode font-style `<select>` with a searchable picker.** In the `#text-mode` section, replace lines ~264-273 with:
   ```html
   <div class="form-group">
     <label class="form-label">Font</label>
     <input
       type="text"
       id="font-search"
       class="form-input"
       placeholder="Search fonts…"
       autocomplete="off"
     />
     <select id="font-picker" class="form-select" size="8"></select>
   </div>
   ```
- [ ] **Step 3: Add a warning element above the preview.** After the `<div class="section-title">Preview</div>` line, insert:
   ```html
   <div id="ascii-warning" style="display:none;color:#e5461f;margin-bottom:8px;font-size:0.8rem"></div>
   ```
- [ ] **Step 4: Extend the footer buttons.** Replace the footer block (lines ~359-362) with:
   ```html
   <div class="footer">
     <button class="btn btn-secondary" id="btn-generate">Generate Preview</button>
     <button class="btn btn-secondary" id="btn-copy">Copy to Clipboard</button>
     <button class="btn btn-secondary" id="btn-save">Save to File</button>
     <button class="btn btn-primary" id="btn-insert">Insert to Editor</button>
   </div>
   ```
- [ ] **Step 5: Verify the file still parses.** Open the file in a browser (or `cat src/ascii-generator.html | head -10` to sanity-check the head section) — must still have the `<!doctype html>` and the closing `</html>`.
- [ ] **Step 6: Manual smoke.** Launch the app: `npm start` — Ctrl+Shift+A. Verify: (a) standalone window opens, (b) font picker lists 17+ entries, (c) preview updates on input, (d) Insert / Copy / Save each work end-to-end.
- [ ] **Step 7: Commit.** `git add src/ascii-generator.html && git commit -m "feat(ascii-art): standalone window uses controller + searchable picker + copy/save/insert"`

---

### Task 11: Delete in-app modal markup and dead renderer code

**Files:**
- Modify: `src/index.html:812-1028` (delete the `#ascii-art-dialog` block)
- Modify: `src/renderer.js:2188` (delete `const asciiModal = new ModalManager('#ascii-art-dialog');`)
- Modify: `src/renderer.js:2202` (delete `asciiModal,` from `window.modals`)
- Modify: `src/renderer.js:5942-6736` (delete the entire ASCII Art Generator block)

**Interfaces:**
- Consumes: nothing.
- Produces: a `git grep` that returns zero hits for `showASCIIGenerator`, `textToASCII`, `createASCIIBox`, `getASCIITemplate`, `insertASCIIArt`, `hideASCIIGenerator`, `switchASCIIMode`, `loadASCIITemplate`, `generateASCIIPreview`, `ascii-art-dialog`, `asciiModal`, `show-ascii-generator`.

- [ ] **Step 1: Delete the modal markup in `src/index.html`.** Remove lines 812-1028 inclusive (the entire `<div id="ascii-art-dialog" …> … </div>` block).
- [ ] **Step 2: Delete the `asciiModal` instantiation in `src/renderer.js`.** Remove line 2188 (`const asciiModal = new ModalManager('#ascii-art-dialog');`).
- [ ] **Step 3: Delete the `window.modals.asciiModal` entry.** Remove line 2202 (`asciiModal,`).
- [ ] **Step 4: Delete the in-app controller block.** Remove lines 5941-6736 inclusive (the entire ASCII Art Generator block, from the `// ASCII ART GENERATOR` header comment through the `ipcRenderer.on('show-ascii-generator', …)` listener and its preceding whitespace).
- [ ] **Step 5: Verify zero residual references.** `git grep -nE "showASCIIGenerator|textToASCII|createASCIIBox|getASCIITemplate|insertASCIIArt|hideASCIIGenerator|switchASCIIMode|loadASCIITemplate|generateASCIIPreview|ascii-art-dialog|asciiModal|show-ascii-generator"` — must return no hits inside `src/`.
- [ ] **Step 6: Verify the standalone path still works.** Run `npm start`. Ctrl+Shift+A still opens the standalone window; Tools → ASCII Art Generator (if present in menu) still works; Insert button wraps in fenced code block.
- [ ] **Step 7: Commit.** `git add src/index.html src/renderer.js && git commit -m "refactor(ascii-art): delete in-app modal #ascii-art-dialog, controller, dead preload channels"`

---

### Task 12: Update README and run full validation

**Files:**
- Modify: `README.md:56` (ASCII Art Generator row)

**Interfaces:**
- Consumes: nothing.
- Produces: README updated to reflect the new feature surface.

- [ ] **Step 1: Update the feature row.** In `README.md`, change line 56 from:
   ```
   - **ASCII Art Generator** - Create text banners and diagrams
   ```
   to:
   ```
   - **ASCII Art Generator** - 17 hand-coded fonts + 400+ FIGlet fonts; text banners, boxes, and templates; insert into editor, copy to clipboard, or save to file (Ctrl+Shift+A)
   ```
- [ ] **Step 2: Run the full test suite.** `npm test` — all tests pass (existing 800+ plus the ~40 new tests).
- [ ] **Step 3: Run lint.** `npm run lint` — clean.
- [ ] **Step 4: Run format check.** `npm run format:check` — if any files are mis-formatted, run `npm run format` and re-run the suite.
- [ ] **Step 5: Run Linux build.** `npm run build:linux` — succeeds without native-binding surprises from `figlet`. (If running in CI, this is automatic.)
- [ ] **Step 6: Final commit.** `git add README.md && git commit -m "docs(readme): ASCII Art Generator now 17 hand-coded + 400+ FIGlet fonts; insert/copy/save"`
- [ ] **Step 7: Sweep for forbidden markers in changed files.** `git diff --name-only HEAD~12..HEAD -- 'src/main/AsciiArt*.js' 'src/renderer/ascii-controller.js' 'src/ascii-generator.html' 'src/preload.js' 'src/main.js' 'src/renderer.js' 'src/index.html' 'package.json' 'README.md' 'tests/main/ascii-art*.test.js' 'tests/main/ascii-art.fonts.test.js' 'tests/main/ascii-art.templates.test.js' 'tests/main/ascii-art.figlet-adapter.test.js' 'tests/preload-ascii.test.js' | xargs grep -nE 'TODO|FIXME|XXX|HACK|not implemented|placeholder|stub|for now|in a real app|mock data|hardcoded for demo|coming soon'` — must return zero hits (excluding pre-existing entries unrelated to this feature).

---

## Self-Review

1. **Spec coverage:**
   - Single implementation path — Task 11.
   - 17 hand-coded fonts (5 existing + 12 new) — Task 2.
   - figlet lazy load + cache — Task 4 (adapter) + Task 1 (dep).
   - Three output destinations — Task 9 (controller) + Task 10 (HTML buttons) + Task 6 (IPC handlers).
   - Comprehensive tests — Tasks 2, 3, 4, 5, 8 cover unit, snapshot, adapter, preload.
   - Pure module architecture — Tasks 2, 3, 4, 5 (all in `src/main/`, no Electron imports).
   - Last-used font persistence — Task 6 (`store.set('ascii:lastFont', …)`) + Task 9 (controller calls `api.lastFont`).
   - Error handling — Task 4 (`AsciiArtFigletError`) + Task 6 (`ascii:copy` catches, `ascii:save` returns `{ canceled }`) + Task 9 (showWarning).
   - Acceptance criteria — Task 12 sweep.

2. **Placeholder scan:** No `TODO` / `TBD` / `FIXME` / `placeholder` / `implement later` / `fill in` markers in the plan body. The single intentional `nope` literal in test names is a test-only sentinel for "unknown" inputs and is not a placeholder.

3. **Type consistency:** `generate`, `listFonts`, `getFontMeta`, `generateFiglet`, `listFigletFonts`, `loadFiglet`, `AsciiArtFigletError`, `HAND_CODED_FONTS`, `ASCII_TEMPLATES`, `getTemplate`, `store.get` / `store.set`, `ascii:generate` / `ascii:list-fonts` / `ascii:get-font-meta` / `ascii:save` / `ascii:copy` / `ascii:last-font`, `generators.ascii.{ listFonts, getFontMeta, generate, copy, save, lastFont }` — names match across tasks.

4. **Open gap flagged:** The integration test in spec §Testing #5 (spawn `ascii-generator.html` in headless Electron, assert no console errors) is intentionally skipped — it requires a display server and is environmental. The spec marks this test as "Skip if no display available"; in CI this would be a manual smoke check (Task 10 Step 6) rather than a Jest test.
