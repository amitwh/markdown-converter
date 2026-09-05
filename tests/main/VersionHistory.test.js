/**
 * @jest-environment node
 *
 * VersionHistory tests with a temp-dir-backed IO bundle: capture-before-save
 * semantics, per-document isolation, pruning, and id validation.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  saveVersion,
  listVersions,
  readVersion,
  deleteVersion,
  isValidVersionId,
  folderFor,
  DEFAULT_MAX_KEEP,
} = require('../../src/main/VersionHistory');

describe('VersionHistory', () => {
  let tmpDir, io;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vh_'));
    io = { rootDir: path.join(tmpDir, 'versions'), fs, pathUtil: path, crypto };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and lists versions newest-first with metadata', () => {
    const v1 = saveVersion({ docPath: '/docs/a.md', content: 'one', label: 'before save', io });
    saveVersion({ docPath: '/docs/a.md', content: 'one two', label: 'before save', io });

    const versions = listVersions({ docPath: '/docs/a.md', io });
    expect(versions).toHaveLength(2);
    expect(versions[0].createdAt).toBeGreaterThanOrEqual(v1.createdAt);
    expect(versions[0].wordCount).toBe(2);
    expect(versions.every((v) => v.label === 'before save')).toBe(true);
  });

  it('round-trips version content', () => {
    const { id } = saveVersion({ docPath: '/docs/a.md', content: '# hello\n\nworld', io });
    expect(readVersion({ docPath: '/docs/a.md', id, io })).toBe('# hello\n\nworld');
  });

  it('isolates documents by path', () => {
    saveVersion({ docPath: '/docs/a.md', content: 'A', io });
    saveVersion({ docPath: '/docs/b.md', content: 'B', io });
    expect(listVersions({ docPath: '/docs/a.md', io })).toHaveLength(1);
    expect(listVersions({ docPath: '/docs/b.md', io })).toHaveLength(1);
    expect(listVersions({ docPath: '/docs/other.md', io })).toHaveLength(0);
  });

  it('prunes the oldest versions beyond maxKeep', () => {
    const docPath = '/docs/many.md';
    for (let i = 0; i < DEFAULT_MAX_KEEP + 5; i++) {
      saveVersion({ docPath, content: `v${i}`, label: `v${i}`, io });
    }
    const versions = listVersions({ docPath, io });
    expect(versions).toHaveLength(DEFAULT_MAX_KEEP);
    // Newest survive; the oldest five labels are gone
    expect(versions[0].label).toBe(`v${DEFAULT_MAX_KEEP + 4}`);
    expect(versions.some((v) => v.label === 'v0')).toBe(false);
  });

  it('deleteVersion removes the entry and its blob', () => {
    const docPath = '/docs/del.md';
    const { id } = saveVersion({ docPath, content: 'x', io });
    expect(deleteVersion({ docPath, id, io })).toBe(true);
    expect(listVersions({ docPath, io })).toHaveLength(0);
    expect(() => readVersion({ docPath, id, io })).toThrow();
    expect(deleteVersion({ docPath, id, io })).toBe(false);
  });

  it('rejects malformed version ids on read (path traversal guard)', () => {
    saveVersion({ docPath: '/docs/a.md', content: 'x', io });
    expect(() => readVersion({ docPath: '/docs/a.md', id: '../../etc/passwd', io })).toThrow(
      /Invalid version id/
    );
    expect(() => readVersion({ docPath: '/docs/a.md', id: 'UPPER!!', io })).toThrow();
  });

  it('isValidVersionId accepts generated ids and rejects hostile ones', () => {
    expect(isValidVersionId('m3x1e2a-abc123')).toBe(true);
    expect(isValidVersionId('../etc')).toBe(false);
    expect(isValidVersionId('')).toBe(false);
    expect(isValidVersionId(null)).toBe(false);
  });

  it('folderFor is deterministic and hex-safe', () => {
    expect(folderFor('/docs/a.md', path, crypto)).toBe(
      path.join(
        'by-path',
        crypto.createHash('sha1').update('/docs/a.md').digest('hex').slice(0, 16)
      )
    );
    expect(folderFor('/docs/WEIRDname!!.md', path, crypto)).toMatch(/^[\\/a-z0-9-]+$/i);
  });
});
