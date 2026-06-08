// Regression test for the v5 migration normalizer: previously, files with
// migration.version:5 but a legacy theme value (e.g. 'ayu-light') were
// short-circuited and returned as-is, breaking the renderer schema.
const { migrateV4ToV5 } = require('../../../../src/main/updater/migration-transform');

describe('migrateV4ToV5 (main mirror) — regression: legacy theme under v5 marker', () => {
  test('normalizes theme: ayu-light under v5 marker to a v5 enum value', () => {
    const out = migrateV4ToV5({ 'migration.version': 5, theme: 'ayu-light' });
    expect(['light', 'dark', 'system']).toContain(out.theme);
  });
  test('preserves a valid v5 theme', () => {
    const out = migrateV4ToV5({ 'migration.version': 5, theme: 'dark' });
    expect(out.theme).toBe('dark');
  });
  test('still maps v4 theme: auto to system', () => {
    const out = migrateV4ToV5({ theme: 'auto' });
    expect(out.theme).toBe('system');
  });
});
