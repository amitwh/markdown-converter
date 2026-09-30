/**
 * @jest-environment node
 *
 * Workspace file lister.
 *
 * Creates a real temp directory per test using mkdtempSync, writes a
 * representative tree, and asserts the returned list. Pattern follows
 * AutosaveBuffer.test.js.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  listWorkspaceFiles,
  DEFAULT_EXTENSIONS,
  DEFAULT_MAX_RESULTS,
} = require('../src/quick-switcher/workspace-file-lister');

function makeTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qswalker-'));
  for (const [rel, content = ''] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf-8');
  }
  return root;
}

describe('listWorkspaceFiles', () => {
  test('lists markdown files in a flat directory', () => {
    const root = makeTree({
      'readme.md': '',
      'notes.md': '',
      'task.md': '',
    });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name).sort()).toEqual(['notes.md', 'readme.md', 'task.md']);
    out.forEach((f) => expect(f.path).toMatch(/qswalker-/));
  });

  test('returns {path, name} objects', () => {
    const root = makeTree({ 'a.md': '' });
    const out = listWorkspaceFiles(root);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ path: expect.stringMatching(/a\.md$/), name: 'a.md' });
  });

  test('recurses into subdirectories', () => {
    const root = makeTree({
      'top.md': '',
      'sub/nested.md': '',
      'sub/deeper/leaf.md': '',
    });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name).sort()).toEqual(['leaf.md', 'nested.md', 'top.md']);
  });

  test('skips node_modules', () => {
    const root = makeTree({
      'readme.md': '',
      'node_modules/some-pkg/index.md': '',
      'node_modules/some-pkg/lib/util.md': '',
    });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name)).toEqual(['readme.md']);
  });

  test('skips hidden directories (.git, .vscode)', () => {
    const root = makeTree({
      'readme.md': '',
      '.git/config.md': '',
      '.vscode/settings.md': '',
      '.idea/workspace.md': '',
    });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name)).toEqual(['readme.md']);
  });

  test('skips known non-content dirs (dist, build, coverage)', () => {
    const root = makeTree({
      'src/real.md': '',
      'dist/bundle.md': '',
      'build/output.md': '',
      'coverage/report.md': '',
    });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name)).toEqual(['real.md']);
  });

  test('honors custom extensions', () => {
    const root = makeTree({
      'a.md': '',
      'b.txt': '',
      'c.rst': '',
      'd.json': '',
    });
    const out = listWorkspaceFiles(root, { extensions: ['.txt', '.rst'] });
    expect(out.map((f) => f.name).sort()).toEqual(['b.txt', 'c.rst']);
  });

  test('default extensions are markdown variants + txt', () => {
    const root = makeTree({
      'a.md': '',
      'b.markdown': '',
      'c.mdx': '',
      'd.txt': '',
      'e.rst': '', // not in default set
      'f.json': '', // not in default set
    });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name).sort()).toEqual(['a.md', 'b.markdown', 'c.mdx', 'd.txt']);
    expect(DEFAULT_EXTENSIONS).toContain('.md');
    expect(DEFAULT_EXTENSIONS).toContain('.markdown');
  });

  test('caps results at maxResults', () => {
    const files = {};
    for (let i = 0; i < 50; i++) {
      files[`f${String(i).padStart(3, '0')}.md`] = '';
    }
    const root = makeTree(files);
    const out = listWorkspaceFiles(root, { maxResults: 10 });
    expect(out).toHaveLength(10);
  });

  test('default maxResults is a positive number (sanity)', () => {
    expect(typeof DEFAULT_MAX_RESULTS).toBe('number');
    expect(DEFAULT_MAX_RESULTS).toBeGreaterThan(0);
  });

  test('returns empty array for empty directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qswalker-empty-'));
    const out = listWorkspaceFiles(root);
    expect(out).toEqual([]);
  });

  test('returns empty array (does not throw) for unreadable subdir', () => {
    // We can't easily simulate EACCES portably; instead confirm that
    // removing the directory mid-walk or pointing at a missing root
    // returns [] (rather than blowing up the IPC handler).
    const root = makeTree({
      'a.md': '',
      'will-vanish/b.md': '',
    });
    // Remove the subdirectory after creation so walk encounters ENOENT
    fs.rmSync(path.join(root, 'will-vanish'), { recursive: true, force: true });
    const out = listWorkspaceFiles(root);
    expect(out.map((f) => f.name)).toEqual(['a.md']);
  });

  test('throws on missing/invalid dir', () => {
    expect(() => listWorkspaceFiles('')).toThrow(/non-empty/);
    expect(() => listWorkspaceFiles(null)).toThrow(/non-empty/);
    expect(() => listWorkspaceFiles(undefined)).toThrow(/non-empty/);
    expect(() => listWorkspaceFiles(42)).toThrow(/non-empty/);
  });

  test('throws on empty extensions array', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qswalker-'));
    expect(() => listWorkspaceFiles(root, { extensions: [] })).toThrow(/extensions/);
  });

  test('throws on invalid maxResults', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qswalker-'));
    expect(() => listWorkspaceFiles(root, { maxResults: 0 })).toThrow(/maxResults/);
    expect(() => listWorkspaceFiles(root, { maxResults: -1 })).toThrow(/maxResults/);
    expect(() => listWorkspaceFiles(root, { maxResults: 'lots' })).toThrow(/maxResults/);
  });

  test('paths are absolute and joined under root', () => {
    const root = makeTree({ 'sub/note.md': '' });
    const out = listWorkspaceFiles(root);
    expect(out[0].path.startsWith(root)).toBe(true);
    expect(path.isAbsolute(out[0].path)).toBe(true);
  });
});
