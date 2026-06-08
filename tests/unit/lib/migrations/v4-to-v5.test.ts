import { describe, expect, test } from 'vitest';
import { migrateV4ToV5, v4SettingsSchema } from '@/lib/migrations/v4-to-v5';

describe('migrateV4ToV5', () => {
  test('maps theme auto to system', () => {
    const out = migrateV4ToV5({ theme: 'auto', editorFontSize: 14 });
    expect(out.theme).toBe('system');
    expect(out.editorFontSize).toBe(14);
  });

  test('drops unknown keys, applies defaults', () => {
    const out = migrateV4ToV5({ theme: 'light', weirdKey: 1 });
    expect(out.theme).toBe('light');
    expect(out.weirdKey).toBeUndefined();
    expect(out.tabSize).toBe(4); // default
  });

  test('throws on invalid v4 input', () => {
    expect(() => migrateV4ToV5({ theme: 42 })).toThrow();
  });

  test('is idempotent — running twice yields the same v5 output', () => {
    const v4 = { theme: 'dark', editorFontSize: 16, recentFiles: ['/a.md'] };
    const a = migrateV4ToV5(v4);
    const b = migrateV4ToV5(v4);
    expect(a).toEqual(b);
  });

  test('exposes the v4 schema for use by main', () => {
    expect(v4SettingsSchema).toBeDefined();
  });
});
