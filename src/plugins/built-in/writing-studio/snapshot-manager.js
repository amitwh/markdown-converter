/**
 * Content snapshots with a rolling window, stored via the plugin settings
 * backend. All methods are async because the real backend is the IPC-backed
 * SettingsStore (get/set return Promises); `await` also works against the
 * synchronous fakes used in unit tests.
 */
class SnapshotManager {
  /**
   * @param {object} store - { get(key), set(key, value) }
   * @param {string} storeKey - settings key for snapshots
   */
  constructor(store, storeKey = 'plugins.writing-studio.snapshots') {
    this.store = store;
    this.storeKey = storeKey;
  }

  async _getAll() {
    const raw = await this.store.get(this.storeKey);
    return raw ? JSON.parse(raw) : [];
  }

  async _saveAll(snaps) {
    await this.store.set(this.storeKey, JSON.stringify(snaps));
  }

  async create(content, label = 'manual') {
    const snaps = await this._getAll();
    const snap = {
      id: 'snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      label,
    };
    snaps.unshift(snap);
    await this._saveAll(snaps);
    return snap;
  }

  async list() {
    return this._getAll();
  }

  async getById(id) {
    return (await this._getAll()).find((s) => s.id === id) || null;
  }

  async restore(id) {
    const snap = await this.getById(id);
    if (!snap) throw new Error('Snapshot not found');
    return snap.content;
  }

  async delete(id) {
    const snaps = (await this._getAll()).filter((s) => s.id !== id);
    await this._saveAll(snaps);
  }

  async diff(id, currentContent) {
    const snap = await this.getById(id);
    if (!snap) throw new Error('Snapshot not found');
    const oldLines = snap.content.split('\n');
    const newLines = currentContent.split('\n');
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    let added = 0;
    let removed = 0;
    for (const line of newLines) {
      if (!oldSet.has(line)) added++;
    }
    for (const line of oldLines) {
      if (!newSet.has(line)) removed++;
    }
    return { added, removed };
  }

  async prune(keepCount) {
    const snaps = await this._getAll();
    await this._saveAll(snaps.slice(0, keepCount));
  }
}

module.exports = { SnapshotManager };
