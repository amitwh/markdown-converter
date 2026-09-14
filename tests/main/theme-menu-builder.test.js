/**
 * @jest-environment node
 *
 * themeMenuBuilder tests — pure module. We pass in a fake `setTheme` and a
 * fake `getCurrentThemeId` so we never touch electron-store or Electron.
 *
 * Note on isolation: ThemeRegistry holds state in a module-scoped Map.
 * `jest.resetModules()` drops the cache so each test re-requires a fresh
 * ThemeRegistry + buildThemeMenu pair, preventing leakage across tests.
 */
let ThemeRegistry;
let buildThemeMenu;

beforeEach(() => {
  jest.resetModules();
  ThemeRegistry = require('../../src/main/ThemeRegistry');
  buildThemeMenu = require('../../src/main/themeMenuBuilder').buildThemeMenu;
  ThemeRegistry.clear();
});

describe('buildThemeMenu', () => {
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
      'L1',
      'L2',
      'separator',
      'D1',
      'D2',
      'separator',
      'HC1',
      'separator',
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
