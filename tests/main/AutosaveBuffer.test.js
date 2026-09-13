/**
 * @jest-environment node
 *
 * AutosaveBuffer tests — mirrors VersionHistory's test pattern (injected IO).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const AutosaveBuffer = require('../../src/main/AutosaveBuffer');

function makeIo(rootDir) {
  return { rootDir, fs, pathUtil: path, crypto };
}

describe('AutosaveBuffer', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosave_'));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  describe('writeRecovery / readRecovery round-trip', () => {
    test('persists content + meta and reads it back', () => {
      const io = makeIo(rootDir);
      const docPath = '/home/me/notes.md';

      const { savedAt, byteSize } = AutosaveBuffer.writeRecovery({
        docPath,
        content: '# hello\n\nworld\n',
        appVersion: '4.7.1',
        io,
      });

      expect(typeof savedAt).toBe('number');
      expect(savedAt).toBeGreaterThan(0);
      expect(byteSize).toBe(Buffer.byteLength('# hello\n\nworld\n', 'utf-8'));

      const read = AutosaveBuffer.readRecovery({ docPath, io });
      expect(read).not.toBeNull();
      expect(read.docPath).toBe(docPath);
      expect(read.content).toBe('# hello\n\nworld\n');
      expect(read.savedAt).toBe(savedAt);
      expect(read.byteSize).toBe(byteSize);
      expect(read.appVersion).toBe('4.7.1');
    });

    test('overwrites prior recovery entry — only the latest buffer survives', () => {
      const io = makeIo(rootDir);
      const docPath = '/home/me/notes.md';

      AutosaveBuffer.writeRecovery({ docPath, content: 'first', io });
      AutosaveBuffer.writeRecovery({ docPath, content: 'second', io });
      AutosaveBuffer.writeRecovery({ docPath, content: 'third', io });

      const read = AutosaveBuffer.readRecovery({ docPath, io });
      expect(read.content).toBe('third');
    });

    test('different documents are isolated from each other', () => {
      const io = makeIo(rootDir);

      AutosaveBuffer.writeRecovery({ docPath: '/a.md', content: 'AAA', io });
      AutosaveBuffer.writeRecovery({ docPath: '/b.md', content: 'BBB', io });

      expect(AutosaveBuffer.readRecovery({ docPath: '/a.md', io }).content).toBe('AAA');
      expect(AutosaveBuffer.readRecovery({ docPath: '/b.md', io }).content).toBe('BBB');
    });

    test('handles untitled-tab keys (no extension, no directory)', () => {
      const io = makeIo(rootDir);
      const tabKey = 'untitled-tab-tab-3';

      AutosaveBuffer.writeRecovery({ docPath: tabKey, content: 'unsaved draft', io });

      expect(AutosaveBuffer.readRecovery({ docPath: tabKey, io }).content).toBe('unsaved draft');
    });

    test('handles unicode + emoji content without corruption', () => {
      const io = makeIo(rootDir);
      const body = '# 日本語 🇮🇳\n\nrésumé café\n';

      AutosaveBuffer.writeRecovery({ docPath: '/u.md', content: body, io });

      expect(AutosaveBuffer.readRecovery({ docPath: '/u.md', io }).content).toBe(body);
    });

    test('empty string is a valid buffer (clears without writing zero bytes fails)', () => {
      const io = makeIo(rootDir);
      AutosaveBuffer.writeRecovery({ docPath: '/e.md', content: 'x', io });
      AutosaveBuffer.writeRecovery({ docPath: '/e.md', content: '', io });

      const read = AutosaveBuffer.readRecovery({ docPath: '/e.md', io });
      expect(read.content).toBe('');
      expect(read.byteSize).toBe(0);
    });

    test('null/undefined content is coerced to empty string', () => {
      const io = makeIo(rootDir);
      AutosaveBuffer.writeRecovery({ docPath: '/n.md', content: null, io });

      expect(AutosaveBuffer.readRecovery({ docPath: '/n.md', io }).content).toBe('');
    });
  });

  describe('readRecovery error cases', () => {
    test('returns null when no entry exists (ENOENT)', () => {
      const io = makeIo(rootDir);
      expect(AutosaveBuffer.readRecovery({ docPath: '/missing.md', io })).toBeNull();
    });

    test('throws when meta.json is corrupt (renderer can surface the warning)', () => {
      const io = makeIo(rootDir);
      const docPath = '/anywhere.md';
      const hash = crypto.createHash('sha1').update(docPath).digest('hex').slice(0, 16);
      const dir = path.join(rootDir, 'by-path', hash);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'meta.json'), '{not valid json', 'utf-8');
      fs.writeFileSync(path.join(dir, 'recovery.md'), 'orphan', 'utf-8');

      expect(() => AutosaveBuffer.readRecovery({ docPath, io })).toThrow(/corrupt/i);
    });

    test('returns null when meta exists but recovery blob is missing', () => {
      const io = makeIo(rootDir);
      const dir = path.join(rootDir, 'by-path', 'no-blob');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'meta.json'),
        JSON.stringify({ docPath: '/x.md', savedAt: 1, byteSize: 0, appVersion: 'x' }),
        'utf-8'
      );

      expect(AutosaveBuffer.readRecovery({ docPath: '/x.md', io })).toBeNull();
    });
  });

  describe('clearRecovery', () => {
    test('removes both the blob and the meta, returns true when something was removed', () => {
      const io = makeIo(rootDir);
      AutosaveBuffer.writeRecovery({ docPath: '/c.md', content: 'stuff', io });
      expect(AutosaveBuffer.readRecovery({ docPath: '/c.md', io })).not.toBeNull();

      const removed = AutosaveBuffer.clearRecovery({ docPath: '/c.md', io });
      expect(removed).toBe(true);
      expect(AutosaveBuffer.readRecovery({ docPath: '/c.md', io })).toBeNull();
    });

    test('returns false when there was nothing to clear (idempotent)', () => {
      const io = makeIo(rootDir);
      expect(AutosaveBuffer.clearRecovery({ docPath: '/missing.md', io })).toBe(false);
    });
  });

  describe('listRecoveries', () => {
    test('returns an empty array when the store has never been used', () => {
      const io = makeIo(rootDir);
      expect(AutosaveBuffer.listRecoveries({ io })).toEqual([]);
    });

    test('lists every pending recovery, newest first', async () => {
      const io = makeIo(rootDir);

      AutosaveBuffer.writeRecovery({ docPath: '/older.md', content: 'old', io });
      // tiny gap so timestamps differ
      await new Promise((r) => setTimeout(r, 5));
      AutosaveBuffer.writeRecovery({ docPath: '/newer.md', content: 'new', io });

      const list = AutosaveBuffer.listRecoveries({ io });
      expect(list).toHaveLength(2);
      expect(list[0].docPath).toBe('/newer.md');
      expect(list[1].docPath).toBe('/older.md');
      expect(list[0].savedAt).toBeGreaterThanOrEqual(list[1].savedAt);
    });

    test("skips directories with corrupt meta (so a single bad entry can't block startup)", () => {
      const io = makeIo(rootDir);
      AutosaveBuffer.writeRecovery({ docPath: '/good.md', content: 'ok', io });
      // Plant a corrupt sibling
      const dir = path.join(rootDir, 'by-path', 'corrupt');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'meta.json'), '{not json', 'utf-8');

      const list = AutosaveBuffer.listRecoveries({ io });
      expect(list).toHaveLength(1);
      expect(list[0].docPath).toBe('/good.md');
    });
  });

  describe('input validation', () => {
    test('writeRecovery throws when docPath is missing', () => {
      const io = makeIo(rootDir);
      expect(() => AutosaveBuffer.writeRecovery({ docPath: '', content: 'x', io })).toThrow(
        /docPath/
      );
      expect(() => AutosaveBuffer.writeRecovery({ content: 'x', io })).toThrow(/docPath/);
    });

    test('readRecovery throws when docPath is missing', () => {
      const io = makeIo(rootDir);
      expect(() => AutosaveBuffer.readRecovery({ io })).toThrow(/docPath/);
    });

    test('clearRecovery throws when docPath is missing', () => {
      const io = makeIo(rootDir);
      expect(() => AutosaveBuffer.clearRecovery({ io })).toThrow(/docPath/);
    });
  });

  describe('storage layout', () => {
    test('uses sha1(path)[0:16] as the storage folder under by-path/', () => {
      const io = makeIo(rootDir);
      const docPath = '/home/me/x.md';
      AutosaveBuffer.writeRecovery({ docPath, content: 'x', io });

      const expectedHash = crypto.createHash('sha1').update(docPath).digest('hex').slice(0, 16);
      const dir = path.join(rootDir, 'by-path', expectedHash);
      expect(fs.existsSync(path.join(dir, 'recovery.md'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'meta.json'))).toBe(true);
    });
  });
});
