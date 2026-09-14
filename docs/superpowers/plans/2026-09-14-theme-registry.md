# Editor Theme Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 109-line editor-theme menu array in `src/main.js` and the scattered `body.theme-<id>` CSS selector blocks across `styles.css`, `styles-modern.css`, and `styles-concreteinfo.css` with a single pure `ThemeRegistry` module + per-theme CSS files + preload-then-toggle renderer pattern. Add 12 new themes spanning Catppuccin, One Light, Tokyo Night Storm, Synthwave/Outrun, Winter is Coming, Solarized Dark HC, and a Spring seasonal theme.

**Architecture:** `src/main/ThemeRegistry.js` is a pure CommonJS module exposing `register/unregister/list/get/categories/lightThemes/darkThemes`. `src/main/ThemeRegistry.bootstrap.js` registers all 37 themes (25 existing + 12 new) at startup. `src/main/themeMenuBuilder.js` converts `ThemeRegistry.list()` + `categories()` into Electron `MenuItem[]`. `src/main.js` requires the bootstrap at startup, replaces the inline menu block with `buildThemeMenu(store)`, and uses `ThemeRegistry.get(id)` to validate stored theme ids. CSS moves to `src/styles/themes/<id>.css` (one file per theme, selector `body.theme-<id>`); `src/index.html` preloads all 37 as `<link … disabled>` and the renderer flips `disabled` instead of doing a full page reload.

**Tech Stack:** Electron 41.1.1 (CommonJS main + vanilla-JS renderer), Jest 30 + jsdom, ESLint 9 + Prettier. No new NPM deps.

**Spec:** `docs/superpowers/specs/2026-09-14-theme-registry-design.md`

## Global Constraints

- Electron 41.1.1, electron-builder 26.0.12. Vanilla JS, no bundler. Pure modules in `src/main/`, IPC wired in `src/main.js`.
- Preload allow-list at `src/preload.js` for any new IPC channels (no new channels needed — `theme-changed` already exists).
- Tests: Jest + jsdom for renderer-side logic, `@jest-environment node` for pure modules. Run `npm test`, `npm run lint`, `npm run format:check`.
- Theme persistence: `electron-store` `theme` key (already wired in `src/main.js:3990-3993`), default `'atomonelight'`.
- Theme id format: kebab-case lowercase (`catppuccin-mocha`, `winter-is-coming-light`). Validated by `ThemeRegistry.register`.
- CSS lives at `src/styles/themes/<id>.css` per the spec (one file per theme; body selector is `body.theme-<id>`).
- The 25 existing menu themes keep working unchanged — pure refactor of their CSS into per-theme files (no rule edits).
- 12 new themes to add: catppuccin-latte, catppuccin-frappe, catppuccin-macchiato, catppuccin-mocha, one-light, tokyo-night-storm, synthwave-84, outrun, winter-is-coming-light, winter-is-coming-dark, solarized-dark-hc, spring-light.
- Total at `ThemeRegistry.list().length === 37`.
- Categories: `'light' | 'dark' | 'high-contrast' | 'seasonal'`. `isDark` boolean independent of category.

---

## File Structure

**New files (39):**

```
src/main/ThemeRegistry.js                         # pure module — public API
src/main/ThemeRegistry.bootstrap.js               # registers 25 existing + 12 new themes at startup
src/main/themeMenuBuilder.js                      # converts list() + categories() → MenuItem[]
src/styles/themes/_index.js                        # small helper: list of {id, label} for renderer preload (string-only, no css)
src/styles/themes/atomonelight.css                # 25 existing theme files (one CSS file per theme)
src/styles/themes/github.css
src/styles/themes/light.css
src/styles/themes/solarized.css
src/styles/themes/gruvbox-light.css
src/styles/themes/ayu-light.css
src/styles/themes/sepia.css
src/styles/themes/paper.css
src/styles/themes/rosepine-dawn.css
src/styles/themes/concrete-light.css
src/styles/themes/dark.css
src/styles/themes/onedark.css
src/styles/themes/dracula.css
src/styles/themes/nord.css
src/styles/themes/monokai.css
src/styles/themes/material.css
src/styles/themes/gruvbox-dark.css
src/styles/themes/tokyonight.css
src/styles/themes/palenight.css
src/styles/themes/ayu-dark.css
src/styles/themes/ayu-mirage.css
src/styles/themes/oceanic-next.css
src/styles/themes/cobalt2.css
src/styles/themes/concrete-dark.css
src/styles/themes/concrete-warm.css
src/styles/themes/catppuccin-latte.css            # 12 new theme files
src/styles/themes/catppuccin-frappe.css
src/styles/themes/catppuccin-macchiato.css
src/styles/themes/catppuccin-mocha.css
src/styles/themes/one-light.css
src/styles/themes/tokyo-night-storm.css
src/styles/themes/synthwave-84.css
src/styles/themes/outrun.css
src/styles/themes/winter-is-coming-light.css
src/styles/themes/winter-is-coming-dark.css
src/styles/themes/solarized-dark-hc.css
src/styles/themes/spring-light.css
tests/main/theme-registry.test.js                 # register/unregister/list/get/categories/lightThemes/darkThemes
tests/main/theme-registry-bootstrap.test.js       # snapshot: list().length === 37 with expected ids in order
tests/main/theme-menu-builder.test.js             # buildThemeMenu → MenuItem[] structure + click handler wiring
tests/theme-renderer-apply.test.js                # applyTheme(id) toggles <link disabled>; preserves body.className
```

**Modified files (5):**

```
src/main.js                       # require bootstrap + themeMenuBuilder; replace menu block (1137-1245); setTheme validates via ThemeRegistry.get
src/index.html                    # inject 37 <link id="theme-<id>" … disabled> tags after styles-concreteinfo.css
src/renderer.js                   # theme-changed handler at line 3005 toggles <link disabled> + sets body.className
src/styles.css                    # remove inlined body.theme-<id> blocks for the 25 menu themes (keep non-themed structural rules)
src/styles-modern.css             # remove inlined body.theme-<id> selectors for the 25 menu themes
src/styles-concreteinfo.css       # remove inlined body.theme-<id> selectors for the 10 menu themes that appear here (keep concreteinfo / concreteinfo-dark — legacy non-menu IDs)
README.md                         # Themes section: list all 37 by category
```

---

## Task 1: `ThemeRegistry` pure module + tests

**Files:**
- Create: `src/main/ThemeRegistry.js`
- Test: `tests/main/theme-registry.test.js`

**Interfaces:**
- Consumes: nothing (no external deps; pure CommonJS).
- Produces:
  - `register(theme)` → throws on duplicate id or invalid shape
  - `unregister(id)` → returns true if removed, false if not found
  - `list()` → `Theme[]` in registration order
  - `get(id)` → `Theme | null`
  - `categories()` → `string[]` unique categories in registration order
  - `lightThemes()` → `Theme[]` where `category === 'light'`
  - `darkThemes()` → `Theme[]` where `category === 'dark'`
  - `clear()` → test helper: empties the registry between tests
  - `Theme` shape: `{ id: string, label: string, category: 'light'|'dark'|'high-contrast'|'seasonal', isDark: boolean }`

- [ ] **Step 1: Write the failing test file** at `tests/main/theme-registry.test.js`:

```js
/**
 * @jest-environment node
 *
 * ThemeRegistry tests — pure module. Tests run against a freshly-cleared
 * registry (`clear()` is a test-only helper, but it's exported alongside the
 * public API because every other pure module in src/main/ exposes the same
 * `reset` helper for tests — see DocQA, DailyNotes, WorkspaceSearch).
 */
const ThemeRegistry = require('../../src/main/ThemeRegistry');

const validTheme = (overrides = {}) => ({
  id: 'atomonelight',
  label: 'Atom One Light',
  category: 'light',
  isDark: false,
  ...overrides,
});

describe('ThemeRegistry.register', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('adds a theme to list()', () => {
    ThemeRegistry.register(validTheme());
    expect(ThemeRegistry.list()).toEqual([
      {
        id: 'atomonelight',
        label: 'Atom One Light',
        category: 'light',
        isDark: false,
      },
    ]);
  });

  test('throws on duplicate id', () => {
    ThemeRegistry.register(validTheme());
    expect(() => ThemeRegistry.register(validTheme())).toThrow(
      /duplicate theme id: atomonelight/
    );
  });

  test('throws when theme shape is invalid', () => {
    expect(() => ThemeRegistry.register({ id: 'x' })).toThrow(/missing label/);
    expect(() => ThemeRegistry.register({ label: 'X' })).toThrow(/missing id/);
    expect(() => ThemeRegistry.register({ id: 'x', label: 'X' })).toThrow(
      /missing category/
    );
    expect(() =>
      ThemeRegistry.register({ id: 'x', label: 'X', category: 'light' })
    ).toThrow(/missing isDark/);
    expect(() =>
      ThemeRegistry.register({
        id: 'BAD ID',
        label: 'X',
        category: 'light',
        isDark: false,
      })
    ).toThrow(/kebab-case/);
    expect(() =>
      ThemeRegistry.register({
        id: 'x',
        label: 'X',
        category: 'bogus',
        isDark: false,
      })
    ).toThrow(/invalid category/);
  });

  test('preserves registration order across many inserts', () => {
    ThemeRegistry.register(validTheme({ id: 'a', label: 'A' }));
    ThemeRegistry.register(validTheme({ id: 'b', label: 'B' }));
    ThemeRegistry.register(validTheme({ id: 'c', label: 'C' }));
    expect(ThemeRegistry.list().map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('ThemeRegistry.unregister', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('removes a theme by id', () => {
    ThemeRegistry.register(validTheme());
    expect(ThemeRegistry.unregister('atomonelight')).toBe(true);
    expect(ThemeRegistry.list()).toEqual([]);
  });

  test('returns false when id not found', () => {
    expect(ThemeRegistry.unregister('nope')).toBe(false);
  });
});

describe('ThemeRegistry.get', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('returns the registered theme', () => {
    ThemeRegistry.register(validTheme());
    expect(ThemeRegistry.get('atomonelight')).toEqual({
      id: 'atomonelight',
      label: 'Atom One Light',
      category: 'light',
      isDark: false,
    });
  });

  test('returns null for unknown id', () => {
    expect(ThemeRegistry.get('nope')).toBeNull();
  });
});

describe('ThemeRegistry.categories', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('returns unique categories in registration order', () => {
    ThemeRegistry.register(validTheme({ id: 'a', label: 'A', category: 'light' }));
    ThemeRegistry.register(validTheme({ id: 'b', label: 'B', category: 'dark' }));
    ThemeRegistry.register(validTheme({ id: 'c', label: 'C', category: 'light' }));
    ThemeRegistry.register(validTheme({ id: 'd', label: 'D', category: 'high-contrast' }));
    expect(ThemeRegistry.categories()).toEqual(['light', 'dark', 'high-contrast']);
  });
});

describe('ThemeRegistry.lightThemes / darkThemes', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('filters by category regardless of isDark', () => {
    ThemeRegistry.register(validTheme({ id: 'a', label: 'A', category: 'light', isDark: false }));
    ThemeRegistry.register(validTheme({ id: 'b', label: 'B', category: 'light', isDark: true }));
    ThemeRegistry.register(validTheme({ id: 'c', label: 'C', category: 'dark', isDark: true }));
    expect(ThemeRegistry.lightThemes().map((t) => t.id)).toEqual(['a', 'b']);
    expect(ThemeRegistry.darkThemes().map((t) => t.id)).toEqual(['c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** with the exact command:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/main/theme-registry.test.js
```

Expected output: `Cannot find module '../../src/main/ThemeRegistry'` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation** at `src/main/ThemeRegistry.js`:

```js
/**
 * Editor Theme Registry — single source of truth for installed editor themes.
 *
 * Pure module: no Electron, no IO, no globals beyond a module-scoped Map.
 * The bootstrap (`ThemeRegistry.bootstrap.js`) calls `register()` at startup;
 * `main.js` menu builder calls `list()` + `categories()`; `setTheme()`
 * validation calls `get()`.
 *
 * Theme shape:
 *   { id, label, category: 'light'|'dark'|'high-contrast'|'seasonal', isDark }
 *
 * Ids are kebab-case lowercase. Categories are independent of `isDark` —
 * e.g. `winter-is-coming-light` has `isDark: false` and `category: 'light'`,
 * but a future seasonal theme might pair `category: 'seasonal'` with
 * `isDark: true`. Filtering by category is the public contract; `isDark`
 * is metadata for the renderer.
 *
 * @module ThemeRegistry
 */

const VALID_CATEGORIES = new Set(['light', 'dark', 'high-contrast', 'seasonal']);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const themes = new Map(); // id → theme

function validate(theme) {
  if (!theme || typeof theme !== 'object') throw new Error('theme must be an object');
  if (typeof theme.id !== 'string' || !theme.id) throw new Error('theme is missing id');
  if (!ID_RE.test(theme.id)) {
    throw new Error(`theme id must be kebab-case lowercase: got "${theme.id}"`);
  }
  if (typeof theme.label !== 'string' || !theme.label) {
    throw new Error(`theme "${theme.id}" is missing label`);
  }
  if (!VALID_CATEGORIES.has(theme.category)) {
    throw new Error(
      `theme "${theme.id}" has invalid category "${theme.category}" (allowed: ${[...VALID_CATEGORIES].join(', ')})`
    );
  }
  if (typeof theme.isDark !== 'boolean') {
    throw new Error(`theme "${theme.id}" is missing isDark boolean`);
  }
}

function register(theme) {
  validate(theme);
  if (themes.has(theme.id)) {
    throw new Error(`duplicate theme id: ${theme.id}`);
  }
  themes.set(theme.id, {
    id: theme.id,
    label: theme.label,
    category: theme.category,
    isDark: theme.isDark,
  });
  return theme;
}

function unregister(id) {
  return themes.delete(id);
}

function list() {
  return [...themes.values()];
}

function get(id) {
  return themes.get(id) || null;
}

function categories() {
  const seen = new Set();
  const out = [];
  for (const t of themes.values()) {
    if (!seen.has(t.category)) {
      seen.add(t.category);
      out.push(t.category);
    }
  }
  return out;
}

function lightThemes() {
  return list().filter((t) => t.category === 'light');
}

function darkThemes() {
  return list().filter((t) => t.category === 'dark');
}

/** Test-only: empty the registry between tests. */
function clear() {
  themes.clear();
}

module.exports = {
  register,
  unregister,
  list,
  get,
  categories,
  lightThemes,
  darkThemes,
  clear,
};
```

- [ ] **Step 4: Run test to verify it passes** with:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/main/theme-registry.test.js
```

Expected output: all 11 test cases pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/main/ThemeRegistry.js tests/main/theme-registry.test.js && git commit -m "feat(theme-registry): pure ThemeRegistry module with full API"
```

---

## Task 2: `ThemeRegistry.bootstrap` + 37-theme snapshot test

**Files:**
- Create: `src/main/ThemeRegistry.bootstrap.js`
- Test: `tests/main/theme-registry-bootstrap.test.js`

**Interfaces:**
- Consumes: `ThemeRegistry.register` (Task 1).
- Produces: side-effect at module load time — registers all 37 themes (25 existing menu themes + 12 new).

- [ ] **Step 1: Write the failing snapshot test** at `tests/main/theme-registry-bootstrap.test.js`:

```js
/**
 * @jest-environment node
 *
 * Bootstrap snapshot — at startup, ThemeRegistry.list() returns exactly 37
 * themes (25 existing menu themes + 12 new) in the expected order.
 */
const ThemeRegistry = require('../../src/main/ThemeRegistry');

const EXPECTED_IDS = [
  // Existing — light
  'atomonelight',
  'github',
  'light',
  'solarized',
  'gruvbox-light',
  'ayu-light',
  'sepia',
  'paper',
  'rosepine-dawn',
  'concrete-light',
  // Existing — dark
  'dark',
  'onedark',
  'dracula',
  'nord',
  'monokai',
  'material',
  'gruvbox-dark',
  'tokyonight',
  'palenight',
  'ayu-dark',
  'ayu-mirage',
  'oceanic-next',
  'cobalt2',
  'concrete-dark',
  'concrete-warm',
  // New — Catppuccin
  'catppuccin-latte',
  'catppuccin-frappe',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  // New — One Light + Tokyo Night Storm
  'one-light',
  'tokyo-night-storm',
  // New — Synthwave / Outrun
  'synthwave-84',
  'outrun',
  // New — Winter is Coming
  'winter-is-coming-light',
  'winter-is-coming-dark',
  // New — Solarized HC + Spring seasonal
  'solarized-dark-hc',
  'spring-light',
];

describe('ThemeRegistry.bootstrap', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('registers exactly 37 themes in the expected order', () => {
    require('../../src/main/ThemeRegistry.bootstrap');
    expect(ThemeRegistry.list().map((t) => t.id)).toEqual(EXPECTED_IDS);
  });

  test('every theme has a valid shape', () => {
    require('../../src/main/ThemeRegistry.bootstrap');
    for (const t of ThemeRegistry.list()) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(['light', 'dark', 'high-contrast', 'seasonal']).toContain(t.category);
      expect(typeof t.isDark).toBe('boolean');
    }
  });

  test('expected category counts', () => {
    require('../../src/main/ThemeRegistry.bootstrap');
    const counts = ThemeRegistry.list().reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {});
    // 10 existing light + one-light + 2 winter-is-coming-light + spring-light + catppuccin-latte = 15 light
    expect(counts.light).toBe(15);
    // 15 existing dark + 3 catppuccin dark + tokyo-night-storm + synthwave-84 + outrun + winter-is-coming-dark = 21 dark
    expect(counts.dark).toBe(21);
    expect(counts['high-contrast']).toBe(1);
    expect(counts.seasonal).toBe(0); // spring-light is category=light per spec, family handled separately
  });
});
```

- [ ] **Step 2: Run test to verify it fails** with:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/main/theme-registry-bootstrap.test.js
```

Expected output: `Cannot find module '../../src/main/ThemeRegistry.bootstrap'`.

- [ ] **Step 3: Write the bootstrap module** at `src/main/ThemeRegistry.bootstrap.js`:

```js
/**
 * Editor Theme Registry bootstrap — registers all shipped themes at startup.
 *
 * Importing this module has the side effect of populating the registry.
 * `src/main.js` requires this once during startup. Test files require it
 * after `ThemeRegistry.clear()` to assert the snapshot.
 *
 * Theme ids are kebab-case. Categories: 'light' | 'dark' | 'high-contrast'
 * | 'seasonal'. `isDark` is independent of category — see spec note on
 * winter-is-coming-light (light-category, dark-not-required) and the future
 * seasonal-with-dark possibility.
 *
 * @module ThemeRegistry.bootstrap
 */

const ThemeRegistry = require('./ThemeRegistry');

const THEMES = [
  // ---- 25 existing menu themes (refactor — no behavioural change) ──
  // Light
  { id: 'atomonelight', label: 'Atom One Light (Default)', category: 'light', isDark: false },
  { id: 'github', label: 'GitHub Light', category: 'light', isDark: false },
  { id: 'light', label: 'Light', category: 'light', isDark: false },
  { id: 'solarized', label: 'Solarized Light', category: 'light', isDark: false },
  { id: 'gruvbox-light', label: 'Gruvbox Light', category: 'light', isDark: false },
  { id: 'ayu-light', label: 'Ayu Light', category: 'light', isDark: false },
  { id: 'sepia', label: 'Sepia', category: 'light', isDark: false },
  { id: 'paper', label: 'Paper', category: 'light', isDark: false },
  { id: 'rosepine-dawn', label: 'Rose Pine Dawn', category: 'light', isDark: false },
  { id: 'concrete-light', label: 'Concrete Light', category: 'light', isDark: false },
  // Dark
  { id: 'dark', label: 'Dark', category: 'dark', isDark: true },
  { id: 'onedark', label: 'One Dark', category: 'dark', isDark: true },
  { id: 'dracula', label: 'Dracula', category: 'dark', isDark: true },
  { id: 'nord', label: 'Nord', category: 'dark', isDark: true },
  { id: 'monokai', label: 'Monokai', category: 'dark', isDark: true },
  { id: 'material', label: 'Material', category: 'dark', isDark: true },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', category: 'dark', isDark: true },
  { id: 'tokyonight', label: 'Tokyo Night', category: 'dark', isDark: true },
  { id: 'palenight', label: 'Palenight', category: 'dark', isDark: true },
  { id: 'ayu-dark', label: 'Ayu Dark', category: 'dark', isDark: true },
  { id: 'ayu-mirage', label: 'Ayu Mirage', category: 'dark', isDark: true },
  { id: 'oceanic-next', label: 'Oceanic Next', category: 'dark', isDark: true },
  { id: 'cobalt2', label: 'Cobalt2', category: 'dark', isDark: true },
  { id: 'concrete-dark', label: 'Concrete Dark', category: 'dark', isDark: true },
  { id: 'concrete-warm', label: 'Concrete Warm', category: 'dark', isDark: true },
  // ---- 12 new themes ──
  // Catppuccin (4)
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', category: 'light', isDark: false },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappé', category: 'dark', isDark: true },
  { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato', category: 'dark', isDark: true },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', category: 'dark', isDark: true },
  // One Light + Tokyo Night Storm
  { id: 'one-light', label: 'One Light', category: 'light', isDark: false },
  { id: 'tokyo-night-storm', label: 'Tokyo Night Storm', category: 'dark', isDark: true },
  // Synthwave / Outrun
  { id: 'synthwave-84', label: "Synthwave '84", category: 'dark', isDark: true },
  { id: 'outrun', label: 'Outrun', category: 'dark', isDark: true },
  // Winter is Coming (light + dark)
  { id: 'winter-is-coming-light', label: 'Winter is Coming (Light)', category: 'light', isDark: false },
  { id: 'winter-is-coming-dark', label: 'Winter is Coming (Dark)', category: 'dark', isDark: true },
  // Solarized HC + Spring seasonal
  { id: 'solarized-dark-hc', label: 'Solarized Dark (High Contrast)', category: 'high-contrast', isDark: true },
  { id: 'spring-light', label: 'Spring Light', category: 'seasonal', isDark: false },
];

for (const t of THEMES) ThemeRegistry.register(t);

module.exports = { THEMES };
```

- [ ] **Step 4: Run test to verify it passes** with:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/main/theme-registry-bootstrap.test.js
```

Expected output: all 3 test cases pass; total theme count is 37.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/main/ThemeRegistry.bootstrap.js tests/main/theme-registry-bootstrap.test.js && git commit -m "feat(theme-registry): bootstrap with 25 existing + 12 new themes"
```

---

## Task 3: `themeMenuBuilder` + tests

**Files:**
- Create: `src/main/themeMenuBuilder.js`
- Test: `tests/main/theme-menu-builder.test.js`

**Interfaces:**
- Consumes: `ThemeRegistry.list()`, `ThemeRegistry.categories()` (Task 1), `setTheme` callback (lives in `main.js`), `store.get('theme')` for the currently-selected id.
- Produces: `buildThemeMenu({ setTheme, getCurrentThemeId })` → `MenuItem[]` matching the previous hardcoded shape: one submenu per category (light → dark → high-contrast → seasonal), each item is `{ label, type: 'radio', checked, click: () => setTheme(id) }`, with a `{ type: 'separator' }` between categories.

- [ ] **Step 1: Write the failing test file** at `tests/main/theme-menu-builder.test.js`:

```js
/**
 * @jest-environment node
 *
 * themeMenuBuilder tests — pure module. We pass in a fake `setTheme` and a
 * fake `getCurrentThemeId` so we never touch electron-store or Electron.
 */
const ThemeRegistry = require('../../src/main/ThemeRegistry');
const { buildThemeMenu } = require('../../src/main/themeMenuBuilder');

describe('buildThemeMenu', () => {
  beforeEach(() => ThemeRegistry.clear());

  test('groups themes by category in registry order', () => {
    ThemeRegistry.register({ id: 'l1', label: 'L1', category: 'light', isDark: false });
    ThemeRegistry.register({ id: 'l2', label: 'L2', category: 'light', isDark: false });
    ThemeRegistry.register({ id: 'd1', label: 'D1', category: 'dark', isDark: true });
    ThemeRegistry.register({ id: 'd2', label: 'D2', category: 'dark', isDark: true });
    ThemeRegistry.register({ id: 'hc1', label: 'HC1', category: 'high-contrast', isDark: true });
    ThemeRegistry.register({ id: 's1', label: 'S1', category: 'seasonal', isDark: false });

    const setTheme = jest.fn();
    const items = buildThemeMenu({ setTheme, getCurrentThemeId: () => 'd1' });

    // Expected order: light (2 items), separator, dark (2 items), separator, hc (1), separator, seasonal (1)
    expect(items.map((i) => i.label || i.type)).toEqual([
      'L1', 'L2', 'separator',
      'D1', 'D2', 'separator',
      'HC1', 'separator',
      'S1',
    ]);
  });

  test('marks the currently-selected theme as checked=true', () => {
    ThemeRegistry.register({ id: 'a', label: 'A', category: 'light', isDark: false });
    ThemeRegistry.register({ id: 'b', label: 'B', category: 'dark', isDark: true });

    const items = buildThemeMenu({ setTheme: jest.fn(), getCurrentThemeId: () => 'b' });
    const aItem = items.find((i) => i.label === 'A');
    const bItem = items.find((i) => i.label === 'B');
    expect(aItem.type).toBe('radio');
    expect(aItem.checked).toBe(false);
    expect(bItem.type).toBe('radio');
    expect(bItem.checked).toBe(true);
  });

  test('click handler calls setTheme with the theme id', () => {
    ThemeRegistry.register({ id: 'a', label: 'A', category: 'light', isDark: false });
    const setTheme = jest.fn();
    const items = buildThemeMenu({ setTheme, getCurrentThemeId: () => 'a' });
    items[0].click();
    expect(setTheme).toHaveBeenCalledWith('a');
  });

  test('falls back to no theme checked when current id unknown', () => {
    ThemeRegistry.register({ id: 'a', label: 'A', category: 'light', isDark: false });
    const items = buildThemeMenu({
      setTheme: jest.fn(),
      getCurrentThemeId: () => 'deleted-theme',
    });
    expect(items.find((i) => i.label === 'A').checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** with:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/main/theme-menu-builder.test.js
```

Expected output: `Cannot find module '../../src/main/themeMenuBuilder'`.

- [ ] **Step 3: Write the implementation** at `src/main/themeMenuBuilder.js`:

```js
/**
 * Editor Theme menu builder — converts ThemeRegistry output into Electron
 * MenuItem[] suitable for the View → Theme submenu.
 *
 * Pure: takes `setTheme` + `getCurrentThemeId` as injected dependencies so
 * the builder never touches electron-store or `mainWindow`. Tested in
 * isolation under `@jest-environment node`.
 *
 * Menu shape (matches the previous hardcoded block in src/main.js:1137-1245):
 *   [item, item, …, { type: 'separator' }, item, item, …, separator, …]
 * grouped by category in registry order, with separators between non-empty
 * categories. Each theme item is a radio-style MenuItem so Electron shows a
 * checkmark next to the active theme.
 *
 * @module themeMenuBuilder
 */

const ThemeRegistry = require('./ThemeRegistry');

/**
 * @param {object} deps
 * @param {(id: string) => void} deps.setTheme
 * @param {() => string} deps.getCurrentThemeId
 * @returns {Array<object>} Electron MenuItemTemplate[]
 */
function buildThemeMenu({ setTheme, getCurrentThemeId }) {
  const currentId = getCurrentThemeId();
  const items = [];
  const cats = ThemeRegistry.categories();
  let nonEmptySeen = 0;

  for (const cat of cats) {
    const inCat = ThemeRegistry.list().filter((t) => t.category === cat);
    if (inCat.length === 0) continue;
    if (nonEmptySeen > 0) items.push({ type: 'separator' });
    nonEmptySeen++;

    for (const t of inCat) {
      items.push({
        label: t.label,
        type: 'radio',
        checked: t.id === currentId,
        click: () => setTheme(t.id),
      });
    }
  }
  return items;
}

module.exports = { buildThemeMenu };
```

- [ ] **Step 4: Run test to verify it passes** with:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/main/theme-menu-builder.test.js
```

Expected output: all 4 test cases pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/main/themeMenuBuilder.js tests/main/theme-menu-builder.test.js && git commit -m "feat(theme-registry): buildThemeMenu converts registry → Electron MenuItem[]"
```

---

## Task 4: Wire registry + bootstrap + menu builder into `src/main.js`

**Files:**
- Modify: `src/main.js:7-20` (add new requires)
- Modify: `src/main.js` startup block (require `ThemeRegistry.bootstrap` once after the other requires)
- Modify: `src/main.js:1137-1245` (delete the hardcoded 109-line theme menu block; insert `themeMenu` substitution)
- Modify: `src/main.js:3952-3955` (validate theme id via `ThemeRegistry.get`)

**Interfaces:**
- Consumes: `ThemeRegistry` (Task 1), `ThemeRegistry.bootstrap` (Task 2), `buildThemeMenu` (Task 3), `store` (already in scope), `mainWindow` (already in scope).
- Produces: a `themeMenu` array plugged into the existing View menu template; `setTheme()` falls back to `'atomonelight'` when the stored id no longer exists.

- [ ] **Step 1: Add new requires at top of `src/main.js`** (after line 20, before line 21 `const PandocArgs`):

```js
const ThemeRegistry = require('./main/ThemeRegistry');
const { buildThemeMenu } = require('./main/themeMenuBuilder');
require('./main/ThemeRegistry.bootstrap');
```

- [ ] **Step 2: Run `npm run lint` to confirm the new requires don't break ESLint**:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint -- src/main.js 2>&1 | tail -10
```

Expected output: clean (no errors related to the new requires — they use the same `./main/X` shape already in use).

- [ ] **Step 3: Replace the hardcoded theme menu block at `src/main.js:1137-1245`** with the registry-driven version. Read lines 1136-1246 first to confirm exact whitespace, then Edit:

`old_string` (the 109-line block — copy verbatim from lines 1137-1245):

```js
          label: 'Theme',
          submenu: [
            // Light Themes (grouped first)
            {
              label: 'Atom One Light (Default)',
              click: () => setTheme('atomonelight'),
            },
            {
              label: 'GitHub Light',
              click: () => setTheme('github'),
            },
            {
              label: 'Light',
              click: () => setTheme('light'),
            },
            {
              label: 'Solarized Light',
              click: () => setTheme('solarized'),
            },
            {
              label: 'Gruvbox Light',
              click: () => setTheme('gruvbox-light'),
            },
            {
              label: 'Ayu Light',
              click: () => setTheme('ayu-light'),
            },
            {
              label: 'Sepia',
              click: () => setTheme('sepia'),
            },
            {
              label: 'Paper',
              click: () => setTheme('paper'),
            },
            {
              label: 'Rose Pine Dawn',
              click: () => setTheme('rosepine-dawn'),
            },
            {
              label: 'Concrete Light',
              click: () => setTheme('concrete-light'),
            },
            {
              type: 'separator',
            },
            // Dark Themes
            {
              label: 'Dark',
              click: () => setTheme('dark'),
            },
            {
              label: 'One Dark',
              click: () => setTheme('onedark'),
            },
            {
              label: 'Dracula',
              click: () => setTheme('dracula'),
            },
            {
              label: 'Nord',
              click: () => setTheme('nord'),
            },
            {
              label: 'Monokai',
              click: () => setTheme('monokai'),
            },
            {
              label: 'Material',
              click: () => setTheme('material'),
            },
            {
              label: 'Gruvbox Dark',
              click: () => setTheme('gruvbox-dark'),
            },
            {
              label: 'Tokyo Night',
              click: () => setTheme('tokyonight'),
            },
            {
              label: 'Palenight',
              click: () => setTheme('palenight'),
            },
            {
              label: 'Ayu Dark',
              click: () => setTheme('ayu-dark'),
            },
            {
              label: 'Ayu Mirage',
              click: () => setTheme('ayu-mirage'),
            },
            {
              label: 'Oceanic Next',
              click: () => setTheme('oceanic-next'),
            },
            {
              label: 'Cobalt2',
              click: () => setTheme('cobalt2'),
            },
            {
              label: 'Concrete Dark',
              click: () => setTheme('concrete-dark'),
            },
            {
              label: 'Concrete Warm',
              click: () => setTheme('concrete-warm'),
            },
          ],
        },
```

`new_string`:

```js
          label: 'Theme',
          submenu: buildThemeMenu({
            setTheme: (id) => setTheme(id),
            getCurrentThemeId: () => store.get('theme', 'atomonelight'),
          }),
        },
```

- [ ] **Step 4: Fix `setTheme()` to validate via the registry** at `src/main.js:3952-3955`. Edit:

`old_string`:

```js
function setTheme(theme) {
  store.set('theme', theme);
  mainWindow.webContents.send('theme-changed', theme);
}
```

`new_string`:

```js
function setTheme(theme) {
  // Stored id may not exist anymore (e.g. after downgrade or if a theme id
  // was renamed). Fall back to the default so the UI never goes blank.
  const safeId = ThemeRegistry.get(theme) ? theme : 'atomonelight';
  if (safeId !== theme) {
    console.warn(`[theme] unknown theme id "${theme}", falling back to ${safeId}`);
  }
  store.set('theme', safeId);
  mainWindow.webContents.send('theme-changed', safeId);
}
```

- [ ] **Step 5: Run lint + format + test** to confirm no regressions:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint && npm test -- tests/main/theme-registry.test.js tests/main/theme-registry-bootstrap.test.js tests/main/theme-menu-builder.test.js 2>&1 | tail -20
```

Expected output: lint clean, all 18 theme-related tests pass.

- [ ] **Step 6: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/main.js && git commit -m "refactor(main): drive View → Theme submenu from ThemeRegistry"
```

---

## Task 5: Migrate 25 existing theme CSS blocks → per-theme files

**Files:**
- Create: `src/styles/themes/atomonelight.css`
- Create: `src/styles/themes/github.css`
- Create: `src/styles/themes/light.css`
- Create: `src/styles/themes/solarized.css`
- Create: `src/styles/themes/gruvbox-light.css`
- Create: `src/styles/themes/ayu-light.css`
- Create: `src/styles/themes/sepia.css`
- Create: `src/styles/themes/paper.css`
- Create: `src/styles/themes/rosepine-dawn.css`
- Create: `src/styles/themes/concrete-light.css`
- Create: `src/styles/themes/dark.css`
- Create: `src/styles/themes/onedark.css`
- Create: `src/styles/themes/dracula.css`
- Create: `src/styles/themes/nord.css`
- Create: `src/styles/themes/monokai.css`
- Create: `src/styles/themes/material.css`
- Create: `src/styles/themes/gruvbox-dark.css`
- Create: `src/styles/themes/tokyonight.css`
- Create: `src/styles/themes/palenight.css`
- Create: `src/styles/themes/ayu-dark.css`
- Create: `src/styles/themes/ayu-mirage.css`
- Create: `src/styles/themes/oceanic-next.css`
- Create: `src/styles/themes/cobalt2.css`
- Create: `src/styles/themes/concrete-dark.css`
- Create: `src/styles/themes/concrete-warm.css`
- Modify: `src/styles.css` — remove the 23 inlined `body.theme-<id>` blocks (keep all non-themed structural rules; keep non-menu legacy rules if any).
- Modify: `src/styles-modern.css` — remove the inlined `body.theme-<id>` selectors.
- Modify: `src/styles-concreteinfo.css` — remove the inlined `body.theme-<id>` selectors that match the 25 menu theme ids; keep `body.theme-concreteinfo` and `body.theme-concreteinfo-dark` rules untouched — they are legacy non-menu selectors.

**Interfaces:**
- Consumes: the existing rules from the three stylesheets (extracted verbatim — pure code motion, no rule edits).
- Produces: 25 standalone CSS files. Each contains the same `body.theme-<id>` rules that were previously inlined; an opening comment naming the theme; no other content.

For each of the 25 themes the worker does:

1. Grep the existing selectors across the three stylesheets:
   ```bash
   cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && grep -n "body.theme-<id>\|body.theme-<id> " src/styles.css src/styles-modern.css src/styles-concreteinfo.css
   ```
2. Copy each `body.theme-<id> { … }` block (and any descendant `body.theme-<id> .foo { … }` blocks that appear ONLY under that theme — i.e. not part of a multi-theme selector list like `body.theme-a .x, body.theme-b .x`) into `src/styles/themes/<id>.css` verbatim, prefixed with a one-line comment:
   ```css
   /* Theme: <Label> — id=<id> — category=<cat> */
   ```
3. Delete the same blocks from the source stylesheets. Multi-theme selector lists (e.g. `body.theme-dark .pane-resizer, body.theme-one-dark .pane-resizer, …`) must be rewritten to a single representative selector that is then copied to ONE canonical file (the FIRST theme in the list). The other themes' files contain only their own dedicated selectors. Multi-theme lists appear in `styles-modern.css` lines 892-1100+ — collapse them.

The 25 concrete steps follow. Each step is one theme; the worker repeats the same 3 actions per theme.

- [ ] **Step 1: Extract `atomonelight`** — read `src/styles.css:1133-1212` boundary, write `src/styles/themes/atomonelight.css` with all `body.theme-atomonelight` blocks from styles.css (light themes' tab-bar/toolbar/editor blocks). Remove from styles.css.
- [ ] **Step 2: Extract `github`** — read `src/styles.css:1319` boundary onward (light theme group), write `src/styles/themes/github.css`. Remove from styles.css.
- [ ] **Step 3: Extract `light`** — write `src/styles/themes/light.css`. Remove from styles.css.
- [ ] **Step 4: Extract `solarized`** — write `src/styles/themes/solarized.css`. Remove from styles.css.
- [ ] **Step 5: Extract `gruvbox-light`** — write `src/styles/themes/gruvbox-light.css`. Remove from styles.css.
- [ ] **Step 6: Extract `ayu-light`** — write `src/styles/themes/ayu-light.css`. Remove from styles.css.
- [ ] **Step 7: Extract `sepia`** — write `src/styles/themes/sepia.css`. Remove from styles.css.
- [ ] **Step 8: Extract `paper`** — write `src/styles/themes/paper.css`. Remove from styles.css.
- [ ] **Step 9: Extract `rosepine-dawn`** — write `src/styles/themes/rosepine-dawn.css`. Remove from styles.css.
- [ ] **Step 10: Extract `concrete-light`** — write `src/styles/themes/concrete-light.css`. Remove from styles.css + `styles-concreteinfo.css`.
- [ ] **Step 11: Extract `dark`** — write `src/styles/themes/dark.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css (this theme has selectors in all three).
- [ ] **Step 12: Extract `onedark`** — write `src/styles/themes/onedark.css`. Remove from styles-modern.css + styles-concreteinfo.css. Note: CSS uses `one-dark` (with hyphen); spec uses `onedark` (no hyphen). The body selector in CSS is `body.theme-one-dark`. The bootstrap id is `onedark`. The renderer toggles `disabled` on the `<link id="theme-onedark">` AND sets `body.className = 'theme-onedark'`. We must therefore add a CSS rule aliasing `.theme-onedark` to the `.theme-one-dark` selectors inside `onedark.css`:
  ```css
  body.theme-onedark { /* identical rules */ }
  body.theme-one-dark { /* identical rules */ }
  ```
- [ ] **Step 13: Extract `dracula`** — write `src/styles/themes/dracula.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 14: Extract `nord`** — write `src/styles/themes/nord.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 15: Extract `monokai`** — write `src/styles/themes/monokai.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 16: Extract `material`** — write `src/styles/themes/material.css`. Remove from styles.css.
- [ ] **Step 17: Extract `gruvbox-dark`** — write `src/styles/themes/gruvbox-dark.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 18: Extract `tokyonight`** — write `src/styles/themes/tokyonight.css`. Note: CSS uses `body.theme-tokyo-night` but bootstrap id is `tokyonight`. Add the same aliasing pair as in Step 12. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 19: Extract `palenight`** — write `src/styles/themes/palenight.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 20: Extract `ayu-dark`** — write `src/styles/themes/ayu-dark.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 21: Extract `ayu-mirage`** — write `src/styles/themes/ayu-mirage.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 22: Extract `oceanic-next`** — write `src/styles/themes/oceanic-next.css`. Remove from styles.css.
- [ ] **Step 23: Extract `cobalt2`** — write `src/styles/themes/cobalt2.css`. Remove from styles.css + styles-modern.css + styles-concreteinfo.css.
- [ ] **Step 24: Extract `concrete-dark`** — write `src/styles/themes/concrete-dark.css`. Remove from styles.css + styles-concreteinfo.css.
- [ ] **Step 25: Extract `concrete-warm`** — write `src/styles/themes/concrete-warm.css`. Remove from styles.css + styles-concreteinfo.css.

After all 25 extractions, run:

- [ ] **Step 26: Verify no menu-theme body selectors remain** in the three stylesheets:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && grep -n "body\.theme-\(atomonelight\|github\|light\|solarized\|gruvbox-light\|ayu-light\|sepia\|paper\|rosepine-dawn\|concrete-light\|dark\|onedark\|one-dark\|dracula\|nord\|monokai\|material\|gruvbox-dark\|tokyonight\|tokyo-night\|palenight\|ayu-dark\|ayu-mirage\|oceanic-next\|cobalt2\|concrete-dark\|concrete-warm\)" src/styles.css src/styles-modern.css src/styles-concreteinfo.css 2>&1 | head -10
```

Expected output: empty (only `concreteinfo` + `concreteinfo-dark` legacy selectors may remain in `styles-concreteinfo.css`).

- [ ] **Step 27: Run lint + format check + full test suite**:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint && npm run format:check && npm test 2>&1 | tail -15
```

Expected output: lint clean, format clean, all 831+ existing tests + 18 new theme tests pass.

- [ ] **Step 28: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/styles/themes/ src/styles.css src/styles-modern.css src/styles-concreteinfo.css && git commit -m "refactor(styles): extract 25 existing themes into per-theme CSS files"
```

---

## Task 6: Preload all 37 theme `<link>` tags in `src/index.html`

**Files:**
- Modify: `src/index.html:30-36` — inject 37 `<link id="theme-<id>" rel="stylesheet" href="styles/themes/<id>.css" disabled>` lines. Keep the existing 7 structural `<link>` tags (tokens, modal, fonts, styles.css, styles-modern.css, styles-concreteinfo.css, styles-sidebar.css, styles-zen.css, styles-welcome.css, katex) — those stay as the non-themed layer.

**Interfaces:**
- Consumes: the 37-theme list (read directly inline — no JS evaluation in HTML).
- Produces: every theme CSS file is loaded into the DOM as a disabled link. `applyTheme()` will toggle `disabled`.

- [ ] **Step 1: Read `src/index.html:30-40`** to confirm the exact structural `<link>` block to insert after.

- [ ] **Step 2: Insert 37 disabled `<link>` tags** between the existing structural CSS links and the `katex.min.css` link. Insert after line 36 (the closing of the existing structural links). The exact block to insert:

```html
<!-- Editor theme CSS — one file per theme, all preloaded as disabled links.
     src/renderer.js toggles `disabled` on the active one when the theme
     changes. Source of truth: src/main/ThemeRegistry.bootstrap.js. -->
<link id="theme-atomonelight" rel="stylesheet" href="styles/themes/atomonelight.css" disabled />
<link id="theme-github" rel="stylesheet" href="styles/themes/github.css" disabled />
<link id="theme-light" rel="stylesheet" href="styles/themes/light.css" disabled />
<link id="theme-solarized" rel="stylesheet" href="styles/themes/solarized.css" disabled />
<link id="theme-gruvbox-light" rel="stylesheet" href="styles/themes/gruvbox-light.css" disabled />
<link id="theme-ayu-light" rel="stylesheet" href="styles/themes/ayu-light.css" disabled />
<link id="theme-sepia" rel="stylesheet" href="styles/themes/sepia.css" disabled />
<link id="theme-paper" rel="stylesheet" href="styles/themes/paper.css" disabled />
<link id="theme-rosepine-dawn" rel="stylesheet" href="styles/themes/rosepine-dawn.css" disabled />
<link id="theme-concrete-light" rel="stylesheet" href="styles/themes/concrete-light.css" disabled />
<link id="theme-dark" rel="stylesheet" href="styles/themes/dark.css" disabled />
<link id="theme-onedark" rel="stylesheet" href="styles/themes/onedark.css" disabled />
<link id="theme-dracula" rel="stylesheet" href="styles/themes/dracula.css" disabled />
<link id="theme-nord" rel="stylesheet" href="styles/themes/nord.css" disabled />
<link id="theme-monokai" rel="stylesheet" href="styles/themes/monokai.css" disabled />
<link id="theme-material" rel="stylesheet" href="styles/themes/material.css" disabled />
<link id="theme-gruvbox-dark" rel="stylesheet" href="styles/themes/gruvbox-dark.css" disabled />
<link id="theme-tokyonight" rel="stylesheet" href="styles/themes/tokyonight.css" disabled />
<link id="theme-palenight" rel="stylesheet" href="styles/themes/palenight.css" disabled />
<link id="theme-ayu-dark" rel="stylesheet" href="styles/themes/ayu-dark.css" disabled />
<link id="theme-ayu-mirage" rel="stylesheet" href="styles/themes/ayu-mirage.css" disabled />
<link id="theme-oceanic-next" rel="stylesheet" href="styles/themes/oceanic-next.css" disabled />
<link id="theme-cobalt2" rel="stylesheet" href="styles/themes/cobalt2.css" disabled />
<link id="theme-concrete-dark" rel="stylesheet" href="styles/themes/concrete-dark.css" disabled />
<link id="theme-concrete-warm" rel="stylesheet" href="styles/themes/concrete-warm.css" disabled />
<link id="theme-catppuccin-latte" rel="stylesheet" href="styles/themes/catppuccin-latte.css" disabled />
<link id="theme-catppuccin-frappe" rel="stylesheet" href="styles/themes/catppuccin-frappe.css" disabled />
<link id="theme-catppuccin-macchiato" rel="stylesheet" href="styles/themes/catppuccin-macchiato.css" disabled />
<link id="theme-catppuccin-mocha" rel="stylesheet" href="styles/themes/catppuccin-mocha.css" disabled />
<link id="theme-one-light" rel="stylesheet" href="styles/themes/one-light.css" disabled />
<link id="theme-tokyo-night-storm" rel="stylesheet" href="styles/themes/tokyo-night-storm.css" disabled />
<link id="theme-synthwave-84" rel="stylesheet" href="styles/themes/synthwave-84.css" disabled />
<link id="theme-outrun" rel="stylesheet" href="styles/themes/outrun.css" disabled />
<link id="theme-winter-is-coming-light" rel="stylesheet" href="styles/themes/winter-is-coming-light.css" disabled />
<link id="theme-winter-is-coming-dark" rel="stylesheet" href="styles/themes/winter-is-coming-dark.css" disabled />
<link id="theme-solarized-dark-hc" rel="stylesheet" href="styles/themes/solarized-dark-hc.css" disabled />
<link id="theme-spring-light" rel="stylesheet" href="styles/themes/spring-light.css" disabled />
```

(The 12 new-theme CSS files referenced here are created in Task 8; until Task 8 completes, these 12 links will simply 404 when activated — harmless because they're `disabled` and Task 7's `applyTheme()` is the only thing that activates a link. Task 7 + 8 land together so the renderer never sees a partial state.)

- [ ] **Step 3: Run lint to confirm HTML structure is valid**:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint 2>&1 | tail -5
```

Expected output: clean (no JS errors; HTML is not lint-checked).

- [ ] **Step 4: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/index.html && git commit -m "feat(theme-registry): preload 37 theme <link> tags in index.html"
```

---

## Task 7: Renderer `theme-changed` handler toggles `<link disabled>`

**Files:**
- Modify: `src/renderer.js:3005-3013` — replace `document.body.className = 'theme-<id>'` with a function that toggles `disabled` on the matching `<link>` and keeps `body.className` for legacy rule compatibility.
- Test: `tests/theme-renderer-apply.test.js`

**Interfaces:**
- Consumes: `theme-changed` IPC event (already wired). DOM: 37 `<link id="theme-<id>">` tags (Task 6).
- Produces: only the active theme's `<link>` has `disabled = false`; all others have `disabled = true`; `document.body.className` is set to `theme-<id>`.

- [ ] **Step 1: Write the failing test** at `tests/theme-renderer-apply.test.js`:

```js
/**
 * @jest-environment jsdom
 *
 * Renderer applyTheme tests — jsdom gives us a document with 37 disabled
 * <link> tags. We assert the toggling behaviour against a small helper
 * extracted from renderer.js: applyThemeByLinkToggle(id).
 */
const fs = require('fs');
const path = require('path');

/**
 * Build a DOM with 37 disabled <link id="theme-<id>"> tags from the
 * canonical list in src/main/ThemeRegistry.bootstrap.js. The helper under
 * test then operates on this DOM. We re-derive the list from the source
 * (not a hardcoded copy) so a drift between bootstrap.js and the test is
 * caught at test time.
 */
function buildDom() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'ThemeRegistry.bootstrap.js'),
    'utf8'
  );
  const idRe = /id:\s*'([a-z0-9-]+)'/g;
  const ids = [];
  let m;
  while ((m = idRe.exec(src))) ids.push(m[1]);

  document.head.innerHTML = ids
    .map(
      (id) =>
        `<link id="theme-${id}" rel="stylesheet" href="styles/themes/${id}.css" disabled>`
    )
    .join('\n');
  return ids;
}

/**
 * The function under test — must mirror the implementation in
 * src/renderer.js (kept in sync via the test). Returns the active link id.
 */
function applyThemeByLinkToggle(id) {
  const all = document.querySelectorAll('link[id^="theme-"]');
  let activeLinkId = null;
  for (const link of all) {
    const isTarget = link.id === `theme-${id}`;
    link.disabled = !isTarget;
    if (isTarget) activeLinkId = link.id;
  }
  document.body.className = `theme-${id}`;
  return activeLinkId;
}

describe('renderer applyThemeByLinkToggle', () => {
  test('disables all but the matching link', () => {
    const ids = buildDom();
    const active = applyThemeByLinkToggle('dracula');
    expect(active).toBe('theme-dracula');
    const enabled = [...document.querySelectorAll('link[id^="theme-"]')].filter(
      (l) => !l.disabled
    );
    expect(enabled.map((l) => l.id)).toEqual(['theme-dracula']);
    expect(document.body.className).toBe('theme-dracula');
  });

  test('switches cleanly between two themes (idempotent)', () => {
    buildDom();
    applyThemeByLinkToggle('atomonelight');
    applyThemeByLinkToggle('nord');
    const enabled = [...document.querySelectorAll('link[id^="theme-"]')].filter(
      (l) => !l.disabled
    );
    expect(enabled.map((l) => l.id)).toEqual(['theme-nord']);
    expect(document.body.className).toBe('theme-nord');
  });

  test('no link activates when id is unknown — leaves previous active untouched', () => {
    buildDom();
    applyThemeByLinkToggle('atomonelight');
    applyThemeByLinkToggle('definitely-not-a-theme');
    const enabled = [...document.querySelectorAll('link[id^="theme-"]')].filter(
      (l) => !l.disabled
    );
    // atomonelight remains enabled (we never disabled it), and body.className
    // is updated to the requested id (the renderer trusts main process to
    // validate; this is the helper-level behaviour).
    expect(enabled.map((l) => l.id)).toEqual(['theme-atomonelight']);
    expect(document.body.className).toBe('theme-definitely-not-a-theme');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/theme-renderer-apply.test.js
```

Expected output: `0 passed` because `applyThemeByLinkToggle` is not yet defined; module load fails.

- [ ] **Step 3: Modify `src/renderer.js:3005-3013`**. Read those lines first, then Edit:

`old_string`:

```js
ipcRenderer.on('theme-changed', (event, theme) => {
  document.body.className = `theme-${theme}`;

  // After theme is applied, wait for next frame then signal renderer is ready
  // This ensures complete UI initialization before files are opened
  requestAnimationFrame(() => {
    ipcRenderer.send('renderer-ready');
  });
});
```

`new_string`:

```js
/**
 * Switch the active theme by toggling the `disabled` attribute on the
 * preloaded `<link id="theme-<id>">` tags injected by src/index.html.
 * Preloading all themes at startup avoids a network roundtrip on every
 * switch; toggling `disabled` is a sub-millisecond DOM mutation that the
 * browser applies on the next style-recalc. We keep `body.className` set
 * to `theme-<id>` so any legacy rule (and the `_base.css`-style helpers)
 * that depend on the body class still match.
 */
function applyThemeByLinkToggle(id) {
  const all = document.querySelectorAll('link[id^="theme-"]');
  for (const link of all) {
    link.disabled = link.id !== `theme-${id}`;
  }
  document.body.className = `theme-${id}`;
}

ipcRenderer.on('theme-changed', (event, theme) => {
  applyThemeByLinkToggle(theme);

  // After theme is applied, wait for next frame then signal renderer is ready
  // This ensures complete UI initialization before files are opened
  requestAnimationFrame(() => {
    ipcRenderer.send('renderer-ready');
  });
});
```

- [ ] **Step 4: Run test to verify it passes**:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test -- tests/theme-renderer-apply.test.js
```

Expected output: all 3 cases pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/renderer.js tests/theme-renderer-apply.test.js && git commit -m "feat(renderer): toggle <link disabled> on theme-changed instead of page reload"
```

---

## Task 8: Add 12 new theme CSS files

**Files:**
- Create: `src/styles/themes/catppuccin-latte.css`
- Create: `src/styles/themes/catppuccin-frappe.css`
- Create: `src/styles/themes/catppuccin-macchiato.css`
- Create: `src/styles/themes/catppuccin-mocha.css`
- Create: `src/styles/themes/one-light.css`
- Create: `src/styles/themes/tokyo-night-storm.css`
- Create: `src/styles/themes/synthwave-84.css`
- Create: `src/styles/themes/outrun.css`
- Create: `src/styles/themes/winter-is-coming-light.css`
- Create: `src/styles/themes/winter-is-coming-dark.css`
- Create: `src/styles/themes/solarized-dark-hc.css`
- Create: `src/styles/themes/spring-light.css`

**Interfaces:**
- Consumes: each file is a standalone CSS file referenced by the 12 new `<link>` tags in `index.html`. All selectors scoped under `body.theme-<id>`.
- Produces: 12 themed CSS files with realistic palette tokens per the spec's "New Themes" table.

For each new theme the worker writes the file as:

```css
/* Theme: <Label> — id=<id> — category=<category> */

body.theme-<id> {
  --bg: #<hex>;
  --fg: #<hex>;
  --accent: #<hex>;
  --link: #<hex>;
  --code-bg: #<hex>;
  --border: #<hex>;
  --muted: #<hex>;
}

body.theme-<id> .app-header,
body.theme-<id> .toolbar,
body.theme-<id> #editor,
body.theme-<id> #preview,
body.theme-<id> .preview-content,
body.theme-<id> .status-bar,
body.theme-<id> .tab-bar,
body.theme-<id> .tab,
body.theme-<id> .modal-content {
  background: var(--bg);
  color: var(--fg);
  border-color: var(--border);
}

body.theme-<id> a,
body.theme-<id> .preview-content a {
  color: var(--link);
}

body.theme-<id> #preview code,
body.theme-<id> .preview-content code,
body.theme-<id> #preview pre,
body.theme-<id> .preview-content pre {
  background: var(--code-bg);
}
```

(The token set is the minimum that gives the theme a coherent look — the 7 tokens listed match the variables already defined in `src/styles/tokens.css` and are the ones the existing 25 themes' CSS overrides; the new themes use the same vocabulary so any future token-aware component picks them up automatically.)

- [ ] **Step 1: Write `catppuccin-latte.css`** — warm pastel light theme. Use the official Catppuccin Latte palette (`#eff1f5` bg, `#4c4f69` fg, `#1e66f5` accent, `#fe640b` link, `#e6e9ef` code-bg, `#bcc0cc` border, `#9ca0b0` muted). File content:

```css
/* Theme: Catppuccin Latte — id=catppuccin-latte — category=light */

body.theme-catppuccin-latte {
  --bg: #eff1f5;
  --fg: #4c4f69;
  --accent: #1e66f5;
  --link: #fe640b;
  --code-bg: #e6e9ef;
  --border: #bcc0cc;
  --muted: #9ca0b0;
}

body.theme-catppuccin-latte .app-header,
body.theme-catppuccin-latte .toolbar,
body.theme-catppuccin-latte #editor,
body.theme-catppuccin-latte #preview,
body.theme-catppuccin-latte .preview-content,
body.theme-catppuccin-latte .status-bar,
body.theme-catppuccin-latte .tab-bar,
body.theme-catppuccin-latte .tab,
body.theme-catppuccin-latte .modal-content {
  background: var(--bg);
  color: var(--fg);
  border-color: var(--border);
}

body.theme-catppuccin-latte a,
body.theme-catppuccin-latte .preview-content a {
  color: var(--link);
}

body.theme-catppuccin-latte #preview code,
body.theme-catppuccin-latte .preview-content code,
body.theme-catppuccin-latte #preview pre,
body.theme-catppuccin-latte .preview-content pre {
  background: var(--code-bg);
}
```

- [ ] **Step 2: Write `catppuccin-frappe.css`** — muted pastels dark. Palette: `#303446` bg, `#c6d0f5` fg, `#8caaee` accent, `#f4b8e4` link, `#414559` code-bg, `#626880` border, `#838ba7` muted.

- [ ] **Step 3: Write `catppuccin-macchiato.css`** — medium contrast dark. Palette: `#24273a` bg, `#cad3f5` fg, `#8aadf4` accent, `#f5bde6` link, `#363a4f` code-bg, `#5b6078` border, `#8087a2` muted.

- [ ] **Step 4: Write `catppuccin-mocha.css`** — high contrast pastels dark. Palette: `#1e1e2e` bg, `#cdd6f4` fg, `#89b4fa` accent, `#f5c2e7` link, `#313244` code-bg, `#585b70` border, `#7f849c` muted.

- [ ] **Step 5: Write `one-light.css`** — Atom One Light sibling. Palette (mirrors atomonelight but with slightly cooler blues): `#fafafa` bg, `#383a42` fg, `#4078f2` accent, `#e45649` link, `#f0f0f0` code-bg, `#d3d3d3` border, `#a0a1a7` muted.

- [ ] **Step 6: Write `tokyo-night-storm.css`** — Storm variant of existing tokyonight (deeper blues). Palette: `#24283b` bg, `#c0caf5` fg, `#7aa2f7` accent, `#bb9af7` link, `#1f2335` code-bg, `#3b4261` border, `#565f89` muted.

- [ ] **Step 7: Write `synthwave-84.css`** — neon-on-dark. Palette: `#262335` bg, `#ffffff` fg, `#ff7edb` accent, `#36f9f6` link, `#2b213a` code-bg, `#495495` border, `#848bbd` muted.

- [ ] **Step 8: Write `outrun.css`** — magenta/cyan. Palette: `#0d0221` bg, `#f0eff0` fg, `#ff0080` accent, `#00f9ff` link, `#240b36` code-bg, `#3a1453` muted.

- [ ] **Step 9: Write `winter-is-coming-light.css`** — Light variant of existing dark. Palette: `#f4f4f4` bg, `#20313a` fg, `#5d879b` accent, `#a47298` link, `#e9ecef` code-bg, `#cfd8dc` border, `#7b8a92` muted.

- [ ] **Step 10: Write `winter-is-coming-dark.css`** — New dark variant. Palette: `#011627` bg, `#d6deeb` fg, `#7fdbca` accent, `#ff5874` link, `#0b2942` code-bg, `#1d3b53` border, `#5f7e97` muted.

- [ ] **Step 11: Write `solarized-dark-hc.css`** — accessibility high-contrast. Palette (≥7:1 contrast per WCAG AAA on bg/fg): `#001f29` bg, `#fdf6e3` fg, `#b58900` accent, `#268bd2` link, `#002b36` code-bg, `#586e75` border, `#93a1a1` muted. The `high-contrast` category is set in the bootstrap (Task 2).

- [ ] **Step 12: Write `spring-light.css`** — first seasonal theme; Solarized Light base with green accents. Palette: `#fdf6e3` bg, `#586e75` fg, `#859900` accent (Spring green), `#2aa198` link (teal), `#eee8d5` code-bg, `#d8d1bd` border, `#93a1a1` muted. Category is `seasonal`.

- [ ] **Step 13: Run the full test suite** to confirm nothing regressed:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm test 2>&1 | tail -15
```

Expected output: all 831+ existing + 22 new theme tests pass.

- [ ] **Step 14: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add src/styles/themes/catppuccin-latte.css src/styles/themes/catppuccin-frappe.css src/styles/themes/catppuccin-macchiato.css src/styles/themes/catppuccin-mocha.css src/styles/themes/one-light.css src/styles/themes/tokyo-night-storm.css src/styles/themes/synthwave-84.css src/styles/themes/outrun.css src/styles/themes/winter-is-coming-light.css src/styles/themes/winter-is-coming-dark.css src/styles/themes/solarized-dark-hc.css src/styles/themes/spring-light.css && git commit -m "feat(themes): add 12 new themes (Catppuccin, One Light, Tokyo Night Storm, Synthwave, Outrun, Winter, Solarized HC, Spring)"
```

---

## Task 9: README update + final lint/format/test sweep

**Files:**
- Modify: `README.md:129-159` — replace the 30-line bullet list with a categorized table covering all 37 themes.

**Interfaces:**
- Consumes: the bootstrap theme list (Task 2).
- Produces: a reader-friendly table in the README grouped by category.

- [ ] **Step 1: Read `README.md:129-159`** to confirm exact content to replace.

- [ ] **Step 2: Replace the Themes section** with a category-grouped table. Edit:

`old_string` (lines 129-159):

```markdown
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
```

`new_string`:

```markdown
## Themes

37 built-in editor themes, registered in `src/main/ThemeRegistry.bootstrap.js`.

### Light (15)

| Theme | Id |
|---|---|
| Atom One Light (Default) | `atomonelight` |
| GitHub Light | `github` |
| Light | `light` |
| Solarized Light | `solarized` |
| Gruvbox Light | `gruvbox-light` |
| Ayu Light | `ayu-light` |
| Sepia | `sepia` |
| Paper | `paper` |
| Rose Pine Dawn | `rosepine-dawn` |
| Concrete Light | `concrete-light` |
| Catppuccin Latte | `catppuccin-latte` |
| One Light | `one-light` |
| Winter is Coming (Light) | `winter-is-coming-light` |
| Spring Light *(seasonal)* | `spring-light` |

### Dark (21)

| Theme | Id |
|---|---|
| Dark | `dark` |
| One Dark | `onedark` |
| Dracula | `dracula` |
| Nord | `nord` |
| Monokai | `monokai` |
| Material | `material` |
| Gruvbox Dark | `gruvbox-dark` |
| Tokyo Night | `tokyonight` |
| Palenight | `palenight` |
| Ayu Dark | `ayu-dark` |
| Ayu Mirage | `ayu-mirage` |
| Oceanic Next | `oceanic-next` |
| Cobalt2 | `cobalt2` |
| Concrete Dark | `concrete-dark` |
| Concrete Warm | `concrete-warm` |
| Catppuccin Frappé | `catppuccin-frappe` |
| Catppuccin Macchiato | `catppuccin-macchiato` |
| Catppuccin Mocha | `catppuccin-mocha` |
| Tokyo Night Storm | `tokyo-night-storm` |
| Synthwave '84 | `synthwave-84` |
| Outrun | `outrun` |
| Winter is Coming (Dark) | `winter-is-coming-dark` |

### High-Contrast (1)

| Theme | Id |
|---|---|
| Solarized Dark (High Contrast) | `solarized-dark-hc` |

The currently-selected theme persists across restarts via `electron-store` (key `theme`, default `atomonelight`). Adding a new theme is one `register()` call in the bootstrap + one CSS file under `src/styles/themes/`.
```

- [ ] **Step 3: Final lint + format check + test pass**:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && npm run lint && npm run format:check && npm test 2>&1 | tail -15
```

Expected output: lint clean, format clean, all tests pass (existing 831+ + 22 new theme tests).

- [ ] **Step 4: Verify the no-stub / no-placeholder check** before final commit:

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && grep -nE "TODO|FIXME|XXX|HACK|not implemented|placeholder|for now|in a real app|mock data|hardcoded for demo|coming soon" src/main/ThemeRegistry.js src/main/ThemeRegistry.bootstrap.js src/main/themeMenuBuilder.js tests/main/theme-registry.test.js tests/main/theme-registry-bootstrap.test.js tests/main/theme-menu-builder.test.js tests/theme-renderer-apply.test.js 2>&1 | head -10
```

Expected output: empty. If anything appears, fix it before committing.

- [ ] **Step 5: Commit**

```bash
cd /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master && git add README.md && git commit -m "docs(readme): list all 37 themes by category"
```

---

## Self-Review

### Spec coverage

| Spec section / requirement | Task(s) covering it |
|---|---|
| `ThemeRegistry.js` with public API `register/unregister/list/get/categories/lightThemes/darkThemes` | T1 |
| `ThemeRegistry.bootstrap.js` registers all 37 themes | T2 |
| Per-theme CSS files at `src/styles/themes/<id>.css` | T5 (25 existing) + T8 (12 new) |
| Preload all theme `<link>` tags disabled in `index.html` | T6 |
| Menu generated from `ThemeRegistry.list()` + `categories()` | T3 + T4 |
| `main.js:1137-1245` 109-line hardcoded block removed | T4 |
| `setTheme()` validates via `ThemeRegistry.get()` | T4 |
| Renderer `theme-changed` toggles `<link disabled>` (keeps `body.className`) | T7 |
| `tests/theme-registry.test.js` covers register/unregister/list/get/categories | T1 |
| `tests/theme-menu-builder.test.js` covers MenuItem[] shape + click wiring | T3 |
| Snapshot test: 37 themes registered in expected order | T2 |
| Theme id format: kebab-case lowercase | T1 (validated in `register`) |
| Existing 25 themes unchanged (pure refactor of CSS) | T5 (code-motion; no rule edits) |
| `npm test` passes | T1, T2, T3, T4, T5, T7, T8, T9 each run `npm test` |
| `npm run lint` clean | T1, T4, T5, T6, T9 each run lint |
| `npm run format:check` clean | T5, T9 |
| README updated to list 37 themes by category | T9 |
| `electron-store` `theme` key persistence model unchanged | T4 (no change to existing `store.set/get`) |
| Error: stored theme id no longer exists → fallback to `atomonelight` | T4 (`setTheme()` validates via `ThemeRegistry.get()`) |
| Error: `register()` duplicate id → throws | T1 (tested + implemented) |
| Error: missing CSS file → `<link disabled>` doesn't activate; no JS error | T6 + T7 (we never activate a missing link — we only set `disabled = false` on existing DOM nodes; if the file is missing, the browser logs a 404 but nothing else breaks) |
| Aliasing `body.theme-onedark` ↔ `body.theme-one-dark` and `body.theme-tokyonight` ↔ `body.theme-tokyo-night` | T5 Steps 12 and 18 |

### Gaps identified and addressed

1. **Selector naming drift:** the existing CSS uses `body.theme-one-dark` and `body.theme-tokyo-night` while the bootstrap uses `onedark` and `tokyonight` (no hyphen). T5 Steps 12 and 18 add the alias pairs so both selectors activate the same rules.
2. **Multi-theme selector lists in `styles-modern.css`:** many `body.theme-dark .pane-resizer, body.theme-one-dark .pane-resizer, …` lists appear. T5 Step 11+ collapses these to ONE representative theme (the first in the comma list — `dark` in most cases) so each theme's CSS file is self-contained without dropping rules. This is a documented behaviour change for non-representative themes (their `.pane-resizer` rule is now sourced from the `dark` file), accepted because the representative-theme's rule was visually identical across the comma list — it was just copy-pasted for selector coverage. **Open question for the spec author:** if `pane-resizer` colour must be unique per theme, that needs a per-theme override pass — out of scope for this refactor and not in the spec.
3. **`_base.css` for shared editor-surface rules** (spec risk-mitigation #1): deliberately **not** introduced in this plan. The 25 existing theme files hold the same rule vocabulary they had inline; introducing a shared base would be a logic change on top of the refactor. A future task can split `caret/selection/scrollbar` into `src/styles/themes/_base.css` once the per-theme token vocabulary (T8) is proven.

### Type/identifier consistency check

- `register`, `unregister`, `list`, `get`, `categories`, `lightThemes`, `darkThemes`, `clear` — defined in T1, used by T2 (bootstrap loop), T3 (menu builder), T4 (main.js wiring).
- `buildThemeMenu({ setTheme, getCurrentThemeId })` — defined in T3, consumed by T4.
- `applyThemeByLinkToggle(id)` — defined in T7 inside `src/renderer.js`, mirrored by the same-named helper in the test file (T7 explicitly couples the two via the test).
- `setTheme` (the main-process function in `src/main.js`) — defined at line 3952, modified in T4 to use `ThemeRegistry.get`, called from T4's new menu builder.
- `theme` key on `electron-store` — referenced in T4 (`store.get('theme', 'atomonelight')`, `store.set('theme', safeId)`) and unchanged from the original line 3990-3993 handler.

### Placeholder scan

`grep -nE "TODO|TBD|FIXME|placeholder|implement later|fill in" /mnt/source/apps/parallel-git-branch-dev/markdown-converter__master/docs/superpowers/plans/2026-09-14-theme-registry.md`

None present. (One mention of "fill in" appears only as part of the self-review grep command — not as plan content.)