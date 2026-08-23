const fs = require('fs');
const os = require('os');
const path = require('path');
const { collectFilesByExtension } = require('../../src/main/collectFilesByExtension');

describe('collectFilesByExtension', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collectext_'));
    fs.writeFileSync(path.join(tmpDir, 'a.jpg'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'b.PNG'), 'x'); // uppercase extension
    fs.writeFileSync(path.join(tmpDir, 'c.txt'), 'x');
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'd.jpeg'), 'x');
    fs.mkdirSync(path.join(tmpDir, 'sub', 'nested'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'nested', 'e.jpg'), 'x');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('matches only files with a listed extension at the top level when includeSubfolders is false', () => {
    const results = collectFilesByExtension(tmpDir, ['.jpg', '.png'], false);
    const names = results.map((p) => path.basename(p)).sort();
    expect(names).toEqual(['a.jpg', 'b.PNG']);
  });

  test('matches extensions case-insensitively', () => {
    const results = collectFilesByExtension(tmpDir, ['.png'], false);
    expect(results.map((p) => path.basename(p))).toEqual(['b.PNG']);
  });

  test('recurses into subfolders when includeSubfolders is true (default)', () => {
    const results = collectFilesByExtension(tmpDir, ['.jpg', '.jpeg']);
    const names = results.map((p) => path.basename(p)).sort();
    expect(names).toEqual(['a.jpg', 'd.jpeg', 'e.jpg']);
  });

  test('does not recurse when includeSubfolders is false', () => {
    const results = collectFilesByExtension(tmpDir, ['.jpg', '.jpeg'], false);
    expect(results.map((p) => path.basename(p))).toEqual(['a.jpg']);
  });

  test('excludes non-matching extensions', () => {
    const results = collectFilesByExtension(tmpDir, ['.jpg']);
    expect(results.some((p) => p.endsWith('.txt'))).toBe(false);
  });

  test('returns an empty array when nothing matches', () => {
    const results = collectFilesByExtension(tmpDir, ['.mp4']);
    expect(results).toEqual([]);
  });

  test('defaults extensions to an empty list gracefully when omitted', () => {
    expect(() => collectFilesByExtension(tmpDir, undefined, false)).not.toThrow();
    expect(collectFilesByExtension(tmpDir, undefined, false)).toEqual([]);
  });
});
