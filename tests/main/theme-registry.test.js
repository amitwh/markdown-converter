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
    expect(() => ThemeRegistry.register(validTheme())).toThrow(/duplicate theme id: atomonelight/);
  });

  test('throws when theme shape is invalid', () => {
    expect(() => ThemeRegistry.register({ id: 'x' })).toThrow(/missing label/);
    expect(() => ThemeRegistry.register({ label: 'X' })).toThrow(/missing id/);
    expect(() => ThemeRegistry.register({ id: 'x', label: 'X' })).toThrow(/missing category/);
    expect(() => ThemeRegistry.register({ id: 'x', label: 'X', category: 'light' })).toThrow(
      /missing isDark/
    );
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
