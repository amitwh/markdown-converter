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
  if (!('category' in theme) || theme.category === undefined || theme.category === null) {
    throw new Error(`theme "${theme.id}" is missing category`);
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
