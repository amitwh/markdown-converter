class SettingsStore {
  /**
   * @param {object} backend - { get(key), set(key, value) } backed by main process store
   */
  constructor(backend) {
    this.backend = backend;
  }

  get(key) {
    return this.backend.get(key);
  }

  set(key, value) {
    this.backend.set(key, value);
  }

  onChanged(key, callback) {
    // Deferred: plugins read settings on init/activate for MVP.
    // Full change notification requires IPC watcher in main process.
  }
}

module.exports = { SettingsStore };
