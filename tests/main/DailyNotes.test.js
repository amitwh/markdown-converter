/**
 * @jest-environment node
 *
 * DailyNotes tests — pure module, injectable IO.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const DailyNotes = require('../../src/main/DailyNotes');

describe('DailyNotes.dateKey', () => {
  test('formats a Date as YYYY-MM-DD in local time', () => {
    expect(DailyNotes.dateKey(new Date(2026, 8, 13))).toBe('2026-09-13');
  });

  test('zero-pads single-digit month and day', () => {
    expect(DailyNotes.dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('defaults to today when called with no args', () => {
    const now = new Date();
    expect(DailyNotes.dateKey()).toBe(DailyNotes.dateKey(now));
  });
});

describe('DailyNotes.pathFor', () => {
  test('joins dir + YYYY-MM-DD.md', () => {
    const d = new Date(2026, 8, 13);
    // Use path.join to build the expected value so the test passes on
    // Windows (where path.join returns backslashes) as well as POSIX.
    expect(DailyNotes.pathFor(d, '/tmp/notes', path)).toBe(
      path.join('/tmp/notes', '2026-09-13.md')
    );
  });
});

describe('DailyNotes.loadTemplate', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily_template_'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('returns built-in default when no template dir given', () => {
    const d = new Date(2026, 8, 13);
    const body = DailyNotes.loadTemplate({ date: d, fs, pathUtil: path });
    expect(body).toContain('# 2026-09-13');
    expect(body).toContain('## Notes');
  });

  test('returns built-in default when template file is missing', () => {
    const d = new Date(2026, 8, 13);
    const body = DailyNotes.loadTemplate({
      date: d,
      templateDir: tmpDir,
      templateName: 'nope.md',
      fs,
      pathUtil: path,
    });
    expect(body).toContain('# 2026-09-13');
  });

  test('substitutes {date} and {weekday} in a custom template', () => {
    const tplPath = path.join(tmpDir, 'daily.md');
    fs.writeFileSync(tplPath, '# {date} ({weekday})\n\nReflecting.', 'utf-8');
    const d = new Date(2026, 8, 13); // a Sunday
    const body = DailyNotes.loadTemplate({
      date: d,
      templateDir: tmpDir,
      fs,
      pathUtil: path,
      now: d,
    });
    expect(body).toContain('# 2026-09-13');
    expect(body).toContain('Sunday');
  });
});

describe('DailyNotes.openOrCreate', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily_notes_'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('creates a new note from the default template', () => {
    const d = new Date(2026, 8, 13);
    const result = DailyNotes.openOrCreate({
      date: d,
      dir: tmpDir,
      fs,
      pathUtil: path,
      now: d,
    });
    expect(result.created).toBe(true);
    expect(result.path).toBe(path.join(tmpDir, '2026-09-13.md'));
    expect(result.content).toContain('# 2026-09-13');
    expect(fs.existsSync(result.path)).toBe(true);
  });

  test('returns existing content when the note already exists (no clobber)', () => {
    const notePath = path.join(tmpDir, '2026-09-13.md');
    fs.writeFileSync(notePath, '# Pre-existing content\n\nPreserve me.', 'utf-8');

    const d = new Date(2026, 8, 13);
    const result = DailyNotes.openOrCreate({
      date: d,
      dir: tmpDir,
      fs,
      pathUtil: path,
      now: d,
    });
    expect(result.created).toBe(false);
    expect(result.content).toBe('# Pre-existing content\n\nPreserve me.');
    // The file was not modified — existing content survives.
    expect(fs.readFileSync(notePath, 'utf-8')).toBe('# Pre-existing content\n\nPreserve me.');
  });

  test('creates the dir if it does not exist', () => {
    const nestedDir = path.join(tmpDir, 'daily', 'nested');
    expect(fs.existsSync(nestedDir)).toBe(false);

    const d = new Date(2026, 8, 13);
    DailyNotes.openOrCreate({
      date: d,
      dir: nestedDir,
      fs,
      pathUtil: path,
      now: d,
    });
    expect(fs.existsSync(nestedDir)).toBe(true);
    expect(fs.existsSync(path.join(nestedDir, '2026-09-13.md'))).toBe(true);
  });

  test('rejects when dir is missing', () => {
    expect(() =>
      DailyNotes.openOrCreate({
        date: new Date(2026, 8, 13),
        dir: null,
        fs,
        pathUtil: path,
      })
    ).toThrow(/dir is required/);
  });
});

describe('DailyNotes.listExisting', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily_list_'));
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  test('returns [] when the dir does not exist', () => {
    expect(
      DailyNotes.listExisting({ dir: path.join(tmpDir, 'missing'), fs, pathUtil: path })
    ).toEqual([]);
  });

  test('lists only YYYY-MM-DD.md entries, newest first', () => {
    fs.writeFileSync(path.join(tmpDir, '2026-09-10.md'), 'a');
    fs.writeFileSync(path.join(tmpDir, '2026-09-13.md'), 'b');
    fs.writeFileSync(path.join(tmpDir, '2026-09-12.md'), 'c');
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), 'ignore');
    fs.writeFileSync(path.join(tmpDir, '2026-13-09.md'), 'ignore (bad month)');

    const list = DailyNotes.listExisting({ dir: tmpDir, fs, pathUtil: path });
    expect(list).toEqual(['2026-09-13.md', '2026-09-12.md', '2026-09-10.md']);
  });
});

describe('DailyNotes.isValidDir', () => {
  test('accepts non-empty strings without NUL bytes', () => {
    expect(DailyNotes.isValidDir('/home/me/notes')).toBe(true);
    expect(DailyNotes.isValidDir('C:\\Users\\me\\notes')).toBe(true);
  });

  test('rejects empty / null / non-string / NUL-containing input', () => {
    expect(DailyNotes.isValidDir('')).toBe(false);
    expect(DailyNotes.isValidDir(null)).toBe(false);
    expect(DailyNotes.isValidDir(undefined)).toBe(false);
    expect(DailyNotes.isValidDir(42)).toBe(false);
    expect(DailyNotes.isValidDir('/etc/\0passwd')).toBe(false);
  });
});
