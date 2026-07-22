const fs = require('fs');
const path = require('path');
const os = require('os');

const { listDirectoryEntries } = require('../../../../src/main/files/list-directory');

describe('listDirectoryEntries', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'list-dir-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns a flat array (not wrapped in { entries })', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.md'), 'hello');
    const result = listDirectoryEntries(tmpDir);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      name: 'a.md',
      isDirectory: false,
      size: 5,
      path: path.join(tmpDir, 'a.md'),
    });
  });

  test('excludes dotfiles', () => {
    fs.writeFileSync(path.join(tmpDir, '.hidden'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'visible.md'), 'y');
    const result = listDirectoryEntries(tmpDir);
    expect(result.map((e) => e.name)).toEqual(['visible.md']);
  });

  test('sorts directories first then alphabetically', () => {
    fs.writeFileSync(path.join(tmpDir, 'zebra.md'), 'z');
    fs.mkdirSync(path.join(tmpDir, 'aaa'));
    fs.mkdirSync(path.join(tmpDir, 'bbb'));
    fs.writeFileSync(path.join(tmpDir, 'apple.md'), 'a');
    const result = listDirectoryEntries(tmpDir);
    expect(result.map((e) => e.name)).toEqual(['aaa', 'bbb', 'apple.md', 'zebra.md']);
  });

  test('marks directories with isDirectory: true and size: 0', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    const result = listDirectoryEntries(tmpDir);
    expect(result[0]).toMatchObject({ name: 'sub', isDirectory: true, size: 0 });
  });

  test('skips entries that cannot be stat\'d (broken symlinks)', () => {
    fs.writeFileSync(path.join(tmpDir, 'good.md'), 'ok');
    try {
      fs.symlinkSync(path.join(tmpDir, 'nonexistent'), path.join(tmpDir, 'broken-link'));
    } catch (_) {
      // symlinks not supported in env — skip
    }
    const result = listDirectoryEntries(tmpDir);
    expect(result.find((e) => e.name === 'good.md')).toBeTruthy();
    expect(result.find((e) => e.name === 'broken-link')).toBeUndefined();
  });
});
