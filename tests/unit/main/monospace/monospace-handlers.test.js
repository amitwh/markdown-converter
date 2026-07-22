const { EventEmitter } = require('events');

class FakeIpcMain extends EventEmitter {
  constructor() {
    super();
    this.handlers = new Map();
  }
  handle(channel, handler) {
    this.handlers.set(channel, handler);
  }
}

describe('monospace-handlers', () => {
  let ipc;
  let register;
  let store;

  beforeEach(() => {
    jest.resetModules();
    ipc = new FakeIpcMain();
    store = new Map();
    jest.doMock('electron', () => ({ ipcMain: ipc }));
    jest.doMock('../../../../src/main/store', () => ({
      get: (k, d) => (store.has(k) ? store.get(k) : d),
      set: (k, v) => store.set(k, v),
    }));
    ({ register } = require('../../../../src/main/ipc/monospace-handlers'));
  });

  test('get-monospace-settings returns defaults when nothing stored', () => {
    register();
    const handler = ipc.handlers.get('get-monospace-settings');
    return Promise.resolve(handler({})).then((result) => {
      expect(result).toEqual({ monospaceFont: 'jetbrains-mono', monospaceLigatures: false });
    });
  });

  test('set-monospace-settings persists and returns sanitized values', () => {
    register();
    const handler = ipc.handlers.get('set-monospace-settings');
    return Promise.resolve(
      handler({}, { monospaceFont: 'fira-code', monospaceLigatures: 1 })
    ).then((result) => {
      expect(result).toEqual({ monospaceFont: 'fira-code', monospaceLigatures: true });
      expect(store.get('monospaceFont')).toBe('fira-code');
      expect(store.get('monospaceLigatures')).toBe(true);
    });
  });

  test('set-monospace-settings rejects invalid font key', () => {
    register();
    const handler = ipc.handlers.get('set-monospace-settings');
    return Promise.resolve(handler({}, { monospaceFont: 'comic-sans' })).then((result) => {
      expect(result.monospaceFont).toBe('jetbrains-mono');
    });
  });
});
