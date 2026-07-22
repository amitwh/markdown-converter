/**
 * Regression: src/main/files/git.js must return a flat array from the
 * 'git-status' handler so that the renderer's `result.data.map(...)` works.
 * Previously the handler returned `{ files: [...] }` and the renderer blew
 * up with `n.map is not a function`, blanking the entire UI.
 */
const EventEmitter = require('events');

class FakeIpcMain extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
  }
  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }
}

describe('files/git IPC handler', () => {
  let ipc;
  let register;
  let currentFileRef;

  beforeEach(() => {
    jest.resetModules();
    ipc = new FakeIpcMain();
    currentFileRef = { current: null };
    jest.doMock('electron', () => ({ ipcMain: ipc }));
    jest.doMock('../../../../src/main/GitOperations', () => ({
      getStatus: () => ({ files: [{ filePath: 'a.md', status: 'modified' }] }),
    }));
    ({ register } = require('../../../../src/main/files/git'));
  });

  test('git-status returns a flat array, not a wrapped object', async () => {
    register(currentFileRef);
    const handler = ipc.handlers.get('git-status');
    const result = await handler({}, '/repo');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([{ filePath: 'a.md', status: 'modified' }]);
  });

  test('git-status falls back to [] when GitOperations returns no files', async () => {
    jest.resetModules();
    ipc = new FakeIpcMain();
    jest.doMock('electron', () => ({ ipcMain: ipc }));
    jest.doMock('../../../../src/main/GitOperations', () => ({
      getStatus: () => ({ files: undefined }),
    }));
    ({ register } = require('../../../../src/main/files/git'));
    register(currentFileRef);
    const handler = ipc.handlers.get('git-status');
    const result = await handler({}, '/repo');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  test('git-status returns [] for non-git directories (error path)', async () => {
    jest.resetModules();
    ipc = new FakeIpcMain();
    jest.doMock('electron', () => ({ ipcMain: ipc }));
    jest.doMock('../../../../src/main/GitOperations', () => ({
      getStatus: () => ({ files: [], error: 'Not a git repository' }),
    }));
    ({ register } = require('../../../../src/main/files/git'));
    register(currentFileRef);
    const handler = ipc.handlers.get('git-status');
    const result = await handler({}, '/repo');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });
});
