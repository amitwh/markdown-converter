const EventEmitter = require('events');
const { UpdaterService } = require('../../../../src/main/updater/updater-service');

describe('UpdaterService', () => {
  let emitter;
  let mockAutoUpdater;
  let service;

  beforeEach(() => {
    emitter = new EventEmitter();
    mockAutoUpdater = {
      on: jest.fn((event, cb) => emitter.on(event, cb)),
      checkForUpdates: jest.fn(),
      downloadUpdate: jest.fn(),
      quitAndInstall: jest.fn(),
      feedConfig: jest.fn(),
    };
    service = new UpdaterService(mockAutoUpdater);
  });

  test('starts in idle state', () => {
    expect(service.state).toBe('idle');
  });

  test('check() emits checking then available on update', async () => {
    const states = [];
    service.on('status', (s) => states.push(s));
    mockAutoUpdater.checkForUpdates.mockImplementation(() => {
      emitter.emit('checking-for-update');
      emitter.emit('update-available', { version: '5.0.2' });
    });
    await service.check();
    expect(states).toEqual([
      { state: 'checking' },
      { state: 'available', version: '5.0.2' },
    ]);
  });

  test('check() emits error on network failure', async () => {
    const states = [];
    service.on('status', (s) => states.push(s));
    mockAutoUpdater.checkForUpdates.mockImplementation(() => {
      emitter.emit('checking-for-update');
      emitter.emit('error', new Error('ENOTFOUND'));
    });
    await service.check();
    expect(states[states.length - 1]).toEqual({ state: 'error', code: 'NETWORK' });
  });

  test('check() debounces second call within 60s', async () => {
    service.lastCheckAt = Date.now();
    await service.check();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  test('install() calls quitAndInstall on the autoUpdater', () => {
    service.install();
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
  });
});