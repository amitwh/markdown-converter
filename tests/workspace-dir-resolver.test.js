/**
 * @jest-environment node
 *
 * Workspace dir resolver — derive parent dir from a file path.
 */

const { deriveWorkspaceDir } = require('../src/quick-switcher/workspace-dir-resolver');

describe('deriveWorkspaceDir', () => {
  test('returns parent dir for a POSIX path', () => {
    expect(deriveWorkspaceDir('/home/user/notes/readme.md')).toBe('/home/user/notes');
  });

  test('returns parent dir for a Windows path', () => {
    expect(deriveWorkspaceDir('C:\\Users\\me\\notes\\readme.md')).toBe('C:\\Users\\me\\notes');
  });

  test('returns parent dir for a nested POSIX path', () => {
    expect(deriveWorkspaceDir('/a/b/c/d/e.md')).toBe('/a/b/c/d');
  });

  test('auto-detects separator when path contains both', () => {
    // A path with both — backslash takes precedence (Windows convention)
    expect(deriveWorkspaceDir('C:\\foo/bar.txt')).toBe('C:\\foo');
  });

  test('returns null for a root-level POSIX file', () => {
    expect(deriveWorkspaceDir('readme.md')).toBeNull();
  });

  test('returns null for an empty string', () => {
    expect(deriveWorkspaceDir('')).toBeNull();
  });

  test('returns null for null / undefined / non-string', () => {
    expect(deriveWorkspaceDir(null)).toBeNull();
    expect(deriveWorkspaceDir(undefined)).toBeNull();
    expect(deriveWorkspaceDir(42)).toBeNull();
    expect(deriveWorkspaceDir({})).toBeNull();
  });

  test('returns null for a single-character filename', () => {
    expect(deriveWorkspaceDir('/x')).toBeNull();
    expect(deriveWorkspaceDir('\\x')).toBeNull();
  });

  test('preserves trailing separators', () => {
    expect(deriveWorkspaceDir('/home/user/notes/')).toBe('/home/user');
  });

  test('handles UNC-style Windows path', () => {
    expect(deriveWorkspaceDir('\\\\server\\share\\file.md')).toBe('\\\\server\\share');
  });
});
