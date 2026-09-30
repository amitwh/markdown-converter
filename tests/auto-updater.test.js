/**
 * @jest-environment node
 *
 * Auto-updater — unit test the controller without bringing up electron.
 * The electron-updater module is mocked because the real one requires the
 * Electron app to be initialised.
 */

const mockAutoUpdater = {
  on: jest.fn(),
  autoDownload: false,
  autoInstallOnAppQuit: false,
  checkForUpdates: jest.fn().mockResolvedValue(null),
  quitAndInstall: jest.fn(),
};

jest.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }), { virtual: true });

const { setupAutoUpdater } = require('../src/main/auto-updater');

describe('setupAutoUpdater', () => {
  let send;
  let updater;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAutoUpdater.on.mockReset();
    send = jest.fn();
    updater = setupAutoUpdater({ send });
  });

  test('registers all six event handlers', () => {
    const events = mockAutoUpdater.on.mock.calls.map((c) => c[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        'checking-for-update',
        'update-available',
        'update-not-available',
        'download-progress',
        'update-downloaded',
        'error',
      ])
    );
  });

  test('enables autoDownload and autoInstallOnAppQuit', () => {
    expect(mockAutoUpdater.autoDownload).toBe(true);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  test('check() forwards "not-available" when app-update.yml is missing (dev)', async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(
      new Error('Cannot find any update manifest (app-update.yml) in resources')
    );
    await updater.check();
    expect(send).toHaveBeenCalledWith('updates:status', { state: 'not-available' });
  });

  test('check() forwards "error" for non-benign failures', async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('network down'));
    await updater.check();
    expect(send).toHaveBeenCalledWith('updates:status', {
      state: 'error',
      message: 'network down',
    });
  });

  test('check() respects isDev() and does not invoke autoUpdater', async () => {
    const isDev = jest.fn(() => true);
    const u2 = setupAutoUpdater({ send, isDev });
    await u2.check();
    expect(isDev).toHaveBeenCalled();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  test('install() calls quitAndInstall', () => {
    updater.install();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  test('forwarded events carry typed payloads', () => {
    // Find each handler and invoke it; assert what got sent.
    const map = new Map();
    for (const [event, cb] of mockAutoUpdater.on.mock.calls) map.set(event, cb);

    send.mockClear();
    map.get('checking-for-update')();
    expect(send).toHaveBeenLastCalledWith('updates:status', { state: 'checking' });

    map.get('update-available')({ version: '4.13.0' });
    expect(send).toHaveBeenLastCalledWith('updates:status', {
      state: 'available',
      version: '4.13.0',
    });

    map.get('download-progress')({ percent: 42.7 });
    expect(send).toHaveBeenLastCalledWith('updates:status', {
      state: 'downloading',
      percent: 43,
    });

    map.get('update-downloaded')({ version: '4.13.0' });
    expect(send).toHaveBeenLastCalledWith('updates:status', {
      state: 'downloaded',
      version: '4.13.0',
    });

    map.get('error')(new Error('boom'));
    expect(send).toHaveBeenLastCalledWith('updates:status', {
      state: 'error',
      message: 'boom',
    });
  });
});
