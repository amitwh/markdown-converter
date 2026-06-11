const { EventEmitter } = require('events');
const DEBOUNCE_MS = 60_000;

class UpdaterService extends EventEmitter {
  constructor(autoUpdater) {
    super();
    this.autoUpdater = autoUpdater;
    this.state = 'idle';
    this.lastCheckAt = 0;
    this._wire();
  }

  _wire() {
    const au = this.autoUpdater;
    au.on('checking-for-update', () => this._emit({ state: 'checking' }));
    au.on('update-available', (info) => this._emit({ state: 'available', version: info.version }));
    au.on('download-progress', (p) => this._emit({ state: 'downloading', percent: p.percent }));
    au.on('update-downloaded', (info) => this._emit({ state: 'ready', version: info.version }));
    au.on('update-not-available', () => this._emit({ state: 'idle' }));
    au.on('error', (err) => {
      const code =
        err && /ENOTFOUND|ETIMEDOUT|ECONNREFUSED/.test(err.message) ? 'NETWORK' : 'UNKNOWN';
      this._emit({ state: 'error', code });
    });
  }

  _emit(payload) {
    this.state = payload.state;
    this.emit('status', payload);
  }

  async check() {
    if (Date.now() - this.lastCheckAt < DEBOUNCE_MS) return;
    this.lastCheckAt = Date.now();
    await this.autoUpdater.checkForUpdates();
  }

  install() {
    this.autoUpdater.quitAndInstall();
  }
}

module.exports = { UpdaterService };
