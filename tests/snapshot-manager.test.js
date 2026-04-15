const { SnapshotManager } = require('../src/plugins/built-in/writing-studio/snapshot-manager');

describe('SnapshotManager', () => {
  let manager;
  let store;

  beforeEach(() => {
    store = {};
    manager = new SnapshotManager({
      get: (key) => store[key],
      set: (key, value) => { store[key] = value; }
    });
  });

  test('create stores snapshot with timestamp, content, wordCount', () => {
    const snap = manager.create('Hello world this is a test', 'auto');
    expect(snap).toHaveProperty('id');
    expect(snap.content).toBe('Hello world this is a test');
    expect(snap.wordCount).toBe(6);
    expect(snap.label).toBe('auto');
  });

  test('list returns snapshots ordered newest first', () => {
    manager.create('first', 'auto');
    manager.create('second', 'auto');
    const list = manager.list();
    expect(list.length).toBe(2);
    expect(list[0].content).toBe('second');
  });

  test('getById returns specific snapshot', () => {
    const snap = manager.create('find me', 'manual');
    const found = manager.getById(snap.id);
    expect(found.content).toBe('find me');
  });

  test('getById returns null for missing id', () => {
    expect(manager.getById('nope')).toBeNull();
  });

  test('restore returns content of snapshot', () => {
    const snap = manager.create('restore this', 'manual');
    expect(manager.restore(snap.id)).toBe('restore this');
  });

  test('restore throws for missing snapshot', () => {
    expect(() => manager.restore('nope')).toThrow('Snapshot not found');
  });

  test('delete removes a snapshot', () => {
    const snap = manager.create('delete me', 'auto');
    manager.delete(snap.id);
    expect(manager.getById(snap.id)).toBeNull();
  });

  test('diff returns added/removed line counts', () => {
    const snap = manager.create('line one\nline two\nline three', 'auto');
    const result = manager.diff(snap.id, 'line one\nline modified\nline three\nline four');
    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
  });

  test('diff throws for missing snapshot', () => {
    expect(() => manager.diff('nope', 'new content')).toThrow('Snapshot not found');
  });

  test('prune keeps only the N most recent snapshots', () => {
    for (let i = 0; i < 10; i++) manager.create('snap ' + i, 'auto');
    manager.prune(5);
    expect(manager.list().length).toBe(5);
    expect(manager.list()[0].content).toBe('snap 9');
  });
});
