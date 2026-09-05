const { SnapshotManager } = require('../src/plugins/built-in/writing-studio/snapshot-manager');

// All SnapshotManager methods are async (the real settings backend is the
// IPC-backed SettingsStore; these tests inject a synchronous fake).
describe('SnapshotManager', () => {
  let manager;
  let store;

  beforeEach(() => {
    store = {};
    manager = new SnapshotManager({
      get: (key) => store[key],
      set: (key, value) => {
        store[key] = value;
      },
    });
  });

  test('create stores snapshot with timestamp, content, wordCount', async () => {
    const snap = await manager.create('Hello world this is a test', 'auto');
    expect(snap).toHaveProperty('id');
    expect(snap.content).toBe('Hello world this is a test');
    expect(snap.wordCount).toBe(6);
    expect(snap.label).toBe('auto');
  });

  test('list returns snapshots ordered newest first', async () => {
    await manager.create('first', 'auto');
    await manager.create('second', 'auto');
    const list = await manager.list();
    expect(list.length).toBe(2);
    expect(list[0].content).toBe('second');
  });

  test('getById returns specific snapshot', async () => {
    const snap = await manager.create('find me', 'manual');
    const found = await manager.getById(snap.id);
    expect(found.content).toBe('find me');
  });

  test('getById returns null for missing id', async () => {
    await expect(manager.getById('nope')).resolves.toBeNull();
  });

  test('restore returns content of snapshot', async () => {
    const snap = await manager.create('restore this', 'manual');
    await expect(manager.restore(snap.id)).resolves.toBe('restore this');
  });

  test('restore throws for missing snapshot', async () => {
    await expect(manager.restore('nope')).rejects.toThrow('Snapshot not found');
  });

  test('delete removes a snapshot', async () => {
    const snap = await manager.create('delete me', 'auto');
    await manager.delete(snap.id);
    await expect(manager.getById(snap.id)).resolves.toBeNull();
  });

  test('diff returns added/removed line counts', async () => {
    const snap = await manager.create('line one\nline two\nline three', 'auto');
    const result = await manager.diff(snap.id, 'line one\nline modified\nline three\nline four');
    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
  });

  test('diff throws for missing snapshot', async () => {
    await expect(manager.diff('nope', 'new content')).rejects.toThrow('Snapshot not found');
  });

  test('prune keeps only the N most recent snapshots', async () => {
    for (let i = 0; i < 10; i++) await manager.create('snap ' + i, 'auto');
    await manager.prune(5);
    const list = await manager.list();
    expect(list.length).toBe(5);
    expect(list[0].content).toBe('snap 9');
  });
});
