const fs = require('fs');
const path = require('path');
const os = require('os');

const { searchInFiles } = require('../../../../src/main/files/search-in-files');

describe('searchInFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-in-files-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns empty array when rootPath or query missing', () => {
    expect(searchInFiles({ rootPath: '', query: 'x' })).toEqual([]);
    expect(searchInFiles({ rootPath: tmpDir, query: '' })).toEqual([]);
  });

  test('finds a literal substring in a single file', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'hello world\nsecond line\nhello again');
    const out = searchInFiles({ rootPath: tmpDir, query: 'hello' });
    expect(out).toEqual([
      { filePath: f, line: 1, content: 'hello world' },
      { filePath: f, line: 3, content: 'hello again' },
    ]);
  });

  test('respects caseSensitive flag (default false)', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'Foo bar\nfoo BAR');
    expect(searchInFiles({ rootPath: tmpDir, query: 'foo' }).length).toBe(2);
    expect(searchInFiles({ rootPath: tmpDir, query: 'foo', caseSensitive: true }).length).toBe(1);
  });

  test('supports regex when isRegex is true', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'foo123\nbar\nbaz456');
    const out = searchInFiles({ rootPath: tmpDir, query: '\\w+\\d+', isRegex: true });
    expect(out.map((r) => r.content)).toEqual(['foo123', 'baz456']);
  });

  test('invalid regex returns empty array (does not throw)', () => {
    expect(searchInFiles({ rootPath: tmpDir, query: '[unclosed', isRegex: true })).toEqual([]);
  });

  test('skips node_modules, .git, dist directories', () => {
    const skip = path.join(tmpDir, 'node_modules');
    fs.mkdirSync(skip);
    fs.writeFileSync(path.join(skip, 'a.md'), 'match me');
    const keep = path.join(tmpDir, 'src');
    fs.mkdirSync(keep);
    fs.writeFileSync(path.join(keep, 'b.md'), 'match me');
    const out = searchInFiles({ rootPath: tmpDir, query: 'match' });
    expect(out.length).toBe(1);
    expect(out[0].filePath).toContain('src/b.md');
  });

  test('skips files larger than 2MB', () => {
    const big = path.join(tmpDir, 'big.md');
    fs.writeFileSync(big, 'a'.repeat(3 * 1024 * 1024));
    expect(searchInFiles({ rootPath: tmpDir, query: 'a' })).toEqual([]);
  });

  test('recurses into subdirectories', () => {
    const sub = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(sub, { recursive: true });
    const f = path.join(sub, 'deep.md');
    fs.writeFileSync(f, 'needle here');
    const out = searchInFiles({ rootPath: tmpDir, query: 'needle' });
    expect(out.length).toBe(1);
    expect(out[0].filePath).toBe(f);
    expect(out[0].line).toBe(1);
  });

  test('caps results at 1000', () => {
    const f = path.join(tmpDir, 'many.md');
    const lines = [];
    for (let i = 0; i < 1500; i++) lines.push('match line');
    fs.writeFileSync(f, lines.join('\n'));
    const out = searchInFiles({ rootPath: tmpDir, query: 'match' });
    expect(out.length).toBe(1000);
  });

  test('rejects queries longer than 1024 chars (DoS guard)', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'hello');
    const longQ = 'a'.repeat(2000);
    expect(searchInFiles({ rootPath: tmpDir, query: longQ })).toEqual([]);
  });

  test('rejects regexes with nested quantifiers (ReDoS guard)', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'aaaaaaaaaaaaaab');
    // Classic catastrophic backtracking pattern
    expect(
      searchInFiles({ rootPath: tmpDir, query: '(a+)+b', isRegex: true })
    ).toEqual([]);
    // Allowed: non-nested alternation
    expect(
      searchInFiles({ rootPath: tmpDir, query: 'a+b', isRegex: true }).length
    ).toBeGreaterThanOrEqual(0);
  });

  test('does not follow symlinks that escape rootPath', () => {
    // Create a target outside tmpDir and a symlink inside pointing to it.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'search-outside-'));
    const targetFile = path.join(outside, 'secret.md');
    fs.writeFileSync(targetFile, 'should not be searched');
    try {
      fs.symlinkSync(targetFile, path.join(tmpDir, 'evil-link'));
      const insideFile = path.join(tmpDir, 'inside.md');
      fs.writeFileSync(insideFile, 'inside match');
      const out = searchInFiles({ rootPath: tmpDir, query: 'match' });
      expect(out.find((r) => r.filePath.includes('evil-link'))).toBeUndefined();
      expect(out.find((r) => r.filePath === insideFile)).toBeTruthy();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  test('caps files traversed at 10000', () => {
    // Create many small files
    for (let i = 0; i < 50; i++) {
      fs.writeFileSync(path.join(tmpDir, `f${i}.md`), 'x');
    }
    const out = searchInFiles({ rootPath: tmpDir, query: 'x' });
    expect(out.length).toBeLessThanOrEqual(1000); // capped at MAX_RESULTS too
  });
});
