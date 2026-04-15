class SnapshotManager {
  /**
   * @param {object} store - { get(key), set(key, value) }
   * @param {string} storeKey - settings key for snapshots
   */
  constructor(store, storeKey = 'plugins.writing-studio.snapshots') {
    this.store = store;
    this.storeKey = storeKey;
  }

  _getAll() {
    const raw = this.store.get(this.storeKey);
    return raw ? JSON.parse(raw) : [];
  }

  _saveAll(snaps) {
    this.store.set(this.storeKey, JSON.stringify(snaps));
  }

  create(content, label = 'manual') {
    const snaps = this._getAll();
    const snap = {
      id: 'snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      label
    };
    snaps.unshift(snap);
    this._saveAll(snaps);
    return snap;
  }

  list() {
    return this._getAll();
  }

  getById(id) {
    return this._getAll().find(s => s.id === id) || null;
  }

  restore(id) {
    const snap = this.getById(id);
    if (!snap) throw new Error('Snapshot not found');
    return snap.content;
  }

  delete(id) {
    const snaps = this._getAll().filter(s => s.id !== id);
    this._saveAll(snaps);
  }

  diff(id, currentContent) {
    const snap = this.getById(id);
    if (!snap) throw new Error('Snapshot not found');
    const oldLines = snap.content.split('\n');
    const newLines = currentContent.split('\n');
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    let added = 0;
    let removed = 0;
    for (const line of newLines) { if (!oldSet.has(line)) added++; }
    for (const line of oldLines) { if (!newSet.has(line)) removed++; }
    return { added, removed };
  }

  prune(keepCount) {
    const snaps = this._getAll();
    this._saveAll(snaps.slice(0, keepCount));
  }
}

module.exports = { SnapshotManager };
