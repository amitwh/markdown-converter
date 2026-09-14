/**
 * @jest-environment node
 *
 * Bootstrap snapshot — at startup, ThemeRegistry.list() returns exactly 37
 * themes (25 existing menu themes + 12 new) in the expected order.
 */

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
  beforeEach(() => {
    // Reset module registry so both ThemeRegistry and bootstrap re-load fresh.
    // Otherwise Jest's module cache returns the already-evaluated bootstrap
    // (whose registration loop has already run once), leaving list() empty
    // across subsequent tests.
    jest.resetModules();
  });

  test('registers exactly 37 themes in the expected order', () => {
    const ThemeRegistry = require('../../src/main/ThemeRegistry');
    ThemeRegistry.clear();
    require('../../src/main/ThemeRegistry.bootstrap');
    expect(ThemeRegistry.list().map((t) => t.id)).toEqual(EXPECTED_IDS);
  });

  test('every theme has a valid shape', () => {
    const ThemeRegistry = require('../../src/main/ThemeRegistry');
    ThemeRegistry.clear();
    require('../../src/main/ThemeRegistry.bootstrap');
    for (const t of ThemeRegistry.list()) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.label).toBe('string');
      expect(['light', 'dark', 'high-contrast', 'seasonal']).toContain(t.category);
      expect(typeof t.isDark).toBe('boolean');
    }
  });

  test('expected category counts', () => {
    const ThemeRegistry = require('../../src/main/ThemeRegistry');
    ThemeRegistry.clear();
    require('../../src/main/ThemeRegistry.bootstrap');
    const counts = ThemeRegistry.list().reduce((acc, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {});
    // 10 existing light + one-light + winter-is-coming-light + catppuccin-latte = 13 light (spring-light is category=seasonal)
    expect(counts.light).toBe(13);
    // 15 existing dark + 3 catppuccin dark + tokyo-night-storm + synthwave-84 + outrun + winter-is-coming-dark = 22 dark
    expect(counts.dark).toBe(22);
    expect(counts['high-contrast']).toBe(1);
    // 1: spring-light (the only seasonal theme in v1)
    expect(counts.seasonal).toBe(1);
  });
});
