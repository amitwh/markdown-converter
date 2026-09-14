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
  {
    id: 'winter-is-coming-light',
    label: 'Winter is Coming (Light)',
    category: 'light',
    isDark: false,
  },
  { id: 'winter-is-coming-dark', label: 'Winter is Coming (Dark)', category: 'dark', isDark: true },
  // Solarized HC + Spring seasonal
  {
    id: 'solarized-dark-hc',
    label: 'Solarized Dark (High Contrast)',
    category: 'high-contrast',
    isDark: true,
  },
  { id: 'spring-light', label: 'Spring Light', category: 'seasonal', isDark: false },
];

for (const t of THEMES) ThemeRegistry.register(t);

module.exports = { THEMES };
