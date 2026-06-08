const fs = require('fs');
const path = require('path');
const os = require('os');
const { MigrationRunner } = require('../../../../src/main/updater/migration-runner');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mig-test-'));
}

describe('MigrationRunner', () => {
  test('no-op when migration.version is already 5', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ 'migration.version': 5 }));
    const r = new MigrationRunner({ dir, transform: (v) => v });
    expect(r.run()).toBe('skipped');
    fs.rmSync(dir, { recursive: true });
  });

  test('runs migration on missing v5 marker, writes v5 file, backs up v4', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'light' }));
    const r = new MigrationRunner({ dir, transform: (v) => ({ ...v, theme: 'system', 'migration.version': 5 }) });
    expect(r.run()).toBe('migrated');
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8'))['migration.version']).toBe(5);
    expect(fs.existsSync(path.join(dir, 'settings.v4.bak.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns fresh on missing file', () => {
    const dir = tmpDir();
    const r = new MigrationRunner({ dir, transform: () => ({ 'migration.version': 5 }) });
    expect(r.run()).toBe('fresh');
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  test('returns failed and preserves v4 on transform throw', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'light' }));
    const r = new MigrationRunner({ dir, transform: () => { throw new Error('boom'); } });
    expect(r.run()).toBe('failed');
    expect(fs.readFileSync(path.join(dir, 'settings.json'), 'utf-8')).toContain('light');
    fs.rmSync(dir, { recursive: true });
  });
});
