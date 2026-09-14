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
