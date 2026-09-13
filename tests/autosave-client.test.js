/**
 * @jest-environment jsdom
 *
 * Renderer-side AutosaveController tests.
 *
 * Mocks electron's ipcRenderer to verify:
 *   - register/notifyChange debounces writes
 *   - flushNow bypasses the debounce
 *   - clearForDocPath targets the right document
 *   - checkPendingRecoveries proxies through ipcRenderer.invoke('autosave:list')
 *   - unregisterTab stops the periodic flush
 *   - failed writes re-arm the dirty flag so the next change retries
 */

const path = require('path');

// Mock electron BEFORE requiring the module under test.
const mockInvoke = jest.fn();

jest.mock(
  'electron',
  () => ({
    ipcRenderer: {
      invoke: (...args) => mockInvoke(...args),
    },
  }),
  { virtual: true }
);

// Mock the autosave module to be jsdom-friendly (some Node-only globals
// inside the source would otherwise pull in heavy modules).
jest.mock(path.join(__dirname, '..', 'src', 'renderer', 'autosave-client.js'), () => {
  const actual = jest.requireActual(
    path.join(__dirname, '..', 'src', 'renderer', 'autosave-client.js')
  );
  return actual;
});

const { AutosaveController } = require('../src/renderer/autosave-client');

describe('AutosaveController', () => {
  let controller;

  beforeEach(() => {
    jest.useFakeTimers();
    mockInvoke.mockReset();
    controller = new AutosaveController();
  });

  afterEach(() => {
    controller._tabs.forEach((_, id) => controller.unregisterTab(id));
    jest.useRealTimers();
  });

  test('registerTab + notifyChange debounces a write to AUTOSAVE_DEBOUNCE_MS', async () => {
    mockInvoke.mockResolvedValueOnce({ savedAt: 1, byteSize: 3 });

    const docPath = '/home/me/x.md';
    const content = 'abc';
    void content;
    controller.registerTab(
      'tab-1',
      () => docPath,
      () => content
    );

    controller.notifyChange('tab-1');
    controller.notifyChange('tab-1');
    controller.notifyChange('tab-1');

    // No write yet — debounce hasn't fired.
    expect(mockInvoke).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2000);

    // Allow the awaited write to settle.
    await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('autosave:write', {
      docPath: '/home/me/x.md',
      content: 'abc',
    });
  });

  test('flushNow bypasses the debounce and writes immediately', async () => {
    mockInvoke.mockResolvedValueOnce({ savedAt: 1, byteSize: 3 });

    controller.registerTab(
      'tab-1',
      () => '/a.md',
      () => 'aaa'
    );
    controller.notifyChange('tab-1');

    await controller.flushNow('tab-1');

    expect(mockInvoke).toHaveBeenCalledWith('autosave:write', {
      docPath: '/a.md',
      content: 'aaa',
    });
  });

  test('does not write when the tab has no docPath (untitled-with-no-key)', async () => {
    controller.registerTab(
      'tab-1',
      () => null,
      () => 'aaa'
    );
    controller.notifyChange('tab-1');
    jest.advanceTimersByTime(3000);

    await Promise.resolve();

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('clearForDocPath calls autosave:clear with the right path', async () => {
    mockInvoke.mockResolvedValueOnce(true);
    await controller.clearForDocPath('/home/me/x.md');

    expect(mockInvoke).toHaveBeenCalledWith('autosave:clear', {
      docPath: '/home/me/x.md',
    });
  });

  test('clearForDocPath with no path is a no-op', async () => {
    await controller.clearForDocPath(null);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('checkPendingRecoveries proxies through autosave:list', async () => {
    const pending = [
      { docPath: '/a.md', savedAt: 2, byteSize: 5, appVersion: '4.7.1' },
      { docPath: '/b.md', savedAt: 1, byteSize: 9, appVersion: '4.7.1' },
    ];
    mockInvoke.mockResolvedValueOnce(pending);

    const result = await controller.checkPendingRecoveries();

    expect(result).toEqual(pending);
    expect(mockInvoke).toHaveBeenCalledWith('autosave:list');
  });

  test('checkPendingRecoveries returns [] when IPC throws', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('boom'));
    const result = await controller.checkPendingRecoveries();
    expect(result).toEqual([]);
  });

  test('unregisterTab stops the periodic flush interval', async () => {
    controller.registerTab(
      'tab-1',
      () => '/a.md',
      () => 'aaa'
    );
    expect(controller._interval).not.toBeNull();

    controller.unregisterTab('tab-1');

    expect(controller._tabs.size).toBe(0);
    expect(controller._interval).toBeNull();
  });

  test('failed writes re-arm the dirty flag so the next change retries', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('disk full'));

    controller.registerTab(
      'tab-1',
      () => '/a.md',
      () => 'aaa'
    );
    controller.notifyChange('tab-1');
    jest.advanceTimersByTime(2000);

    // Microtasks only — fake timers leave the microtask queue alone.
    for (let i = 0; i < 5; i++) await Promise.resolve();

    const entry = controller._tabs.get('tab-1');
    expect(entry.dirty).toBe(true);

    // Subsequent change + debounce retries.
    mockInvoke.mockResolvedValueOnce({ savedAt: 2, byteSize: 3 });
    controller.notifyChange('tab-1');
    jest.advanceTimersByTime(2000);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  test('periodic flush writes when a buffer has been dirty too long', async () => {
    mockInvoke.mockResolvedValue({ savedAt: 1, byteSize: 3 });

    controller.registerTab(
      'tab-1',
      () => '/a.md',
      () => 'aaa'
    );
    controller.notifyChange('tab-1');
    jest.advanceTimersByTime(2000);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Simulate: user types one character then walks away. The debounce
    // never fires because no new notifyChange comes; only the periodic
    // interval should flush. Reset lastFlushAt so the threshold check passes.
    const entry = controller._tabs.get('tab-1');
    entry.dirty = true;
    entry.lastFlushAt = 0;

    // Advance past the AUTOSAVE_MAX_INTERVAL_MS (10s); the interval fires
    // every 5s, so 11s is enough to fire at least one tick.
    jest.advanceTimersByTime(11000);
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(mockInvoke.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('registerTab is idempotent (second call is a no-op)', () => {
    controller.registerTab(
      'tab-1',
      () => '/a.md',
      () => 'aaa'
    );
    controller.registerTab(
      'tab-1',
      () => '/b.md',
      () => 'bbb'
    );

    expect(controller._tabs.size).toBe(1);
    // The first registration wins — second one doesn't replace it.
    expect(controller._tabs.get('tab-1').getDocPath()).toBe('/a.md');
  });
});
