/**
 * Renderer-side autosave controller.
 *
 * Buffers every keystroke and flushes the current document body to the main
 * process at most once per AUTOSAVE_DEBOUNCE_MS. The main process persists it
 * under <userData>/autosave/ via the AutosaveBuffer module; a successful
 * explicit save clears the entry because the buffer is now on disk at its
 * real path.
 *
 * Three things the controller is responsible for:
 *   1. Per-tab debounced flush — registerTab(tabId, getDocPath, getContent)
 *      wires up the writer; unregisterTab(tabId) tears it down on close.
 *   2. Periodic flush while the buffer is dirty — a hidden interval makes
 *      sure the user can quit any time and not lose more than a few seconds
 *      of work, even if they don't type again.
 *   3. Startup recovery sweep — checkPendingRecoveries() lists every
 *      pending recovery on startup so the UI can offer to restore.
 *
 * Recovery banners and "save cleared autosave" UX live in the renderer, not
 * here — this module only manages the I/O.
 */

const { ipcRenderer } = require('electron');

const AUTOSAVE_DEBOUNCE_MS = 2000;
const AUTOSAVE_MAX_INTERVAL_MS = 10000; // flush dirty buffers even when idle

class AutosaveController {
  constructor() {
    /** Map<tabId, {docPath, getContent, timer, dirty, lastFlushAt}> */
    this._tabs = new Map();
    this._interval = null;
  }

  /**
   * Begin autosaving a tab. The docPath may be a synthetic 'untitled-tab-<id>'
   * for never-saved buffers; it may also be a real absolute path.
   *
   * @param {string|number} tabId
   * @param {() => string|null|undefined} getDocPath returns the current path
   *   (or null/untitled key) for the tab
   * @param {() => string} getContent returns the current buffer
   */
  registerTab(tabId, getDocPath, getContent) {
    if (this._tabs.has(tabId)) return; // already registered
    this._tabs.set(tabId, {
      docPath: null,
      getDocPath,
      getContent,
      timer: null,
      dirty: false,
      lastFlushAt: 0,
    });
    this._ensureInterval();
  }

  /**
   * Stop autosaving a tab. Called on close; the persisted recovery blob is
   * left in place — if the user reopens the file later, the recovery banner
   * will offer to restore it.
   */
  unregisterTab(tabId) {
    const entry = this._tabs.get(tabId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this._tabs.delete(tabId);
    if (this._tabs.size === 0 && this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  /**
   * Notify the controller that the tab's content changed. Schedules a debounced
   * flush.
   */
  notifyChange(tabId) {
    const entry = this._tabs.get(tabId);
    if (!entry) return;
    entry.dirty = true;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this._flush(tabId), AUTOSAVE_DEBOUNCE_MS);
  }

  /**
   * Flush a specific tab immediately. Called after explicit saves and at
   * shutdown.
   */
  async flushNow(tabId) {
    return this._flush(tabId);
  }

  /**
   * Clear the recovery entry for a document — called after a successful save
   * (the buffer is now on disk at its real path).
   */
  async clearForDocPath(docPath) {
    if (!docPath) return false;
    try {
      return await ipcRenderer.invoke('autosave:clear', { docPath });
    } catch {
      return false;
    }
  }

  /**
   * List every pending recovery across all documents. Returns
   * [{docPath, savedAt, byteSize, appVersion}] newest-first.
   */
  async checkPendingRecoveries() {
    try {
      return await ipcRenderer.invoke('autosave:list');
    } catch {
      return [];
    }
  }

  /**
   * Read a specific recovery entry (content + meta). Returns null when the
   * entry no longer exists or the docPath is missing.
   */
  async readRecovery(docPath) {
    if (!docPath) return null;
    try {
      return await ipcRenderer.invoke('autosave:read', { docPath });
    } catch {
      return null;
    }
  }

  /**
   * Drop a specific recovery entry — called when the user dismisses the
   * recovery banner without restoring.
   */
  async dismissRecovery(docPath) {
    return this.clearForDocPath(docPath);
  }

  // ---- private ----

  _ensureInterval() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      const now = Date.now();
      for (const [tabId, entry] of this._tabs) {
        if (!entry.dirty) continue;
        if (now - entry.lastFlushAt < AUTOSAVE_MAX_INTERVAL_MS) continue;
        // Best-effort flush — if main is busy, leave the timer in place.
        this._flush(tabId).catch(() => {});
      }
    }, AUTOSAVE_MAX_INTERVAL_MS / 2);
  }

  async _flush(tabId) {
    const entry = this._tabs.get(tabId);
    if (!entry) return;
    entry.timer = null;
    if (!entry.dirty) return;
    const docPath = entry.getDocPath();
    if (!docPath) return; // tab has no path yet — nothing to recover
    const content = entry.getContent();
    entry.dirty = false;
    entry.lastFlushAt = Date.now();
    try {
      await ipcRenderer.invoke('autosave:write', { docPath, content });
    } catch (err) {
      // Re-arm so the next change retries; don't swallow silently.
      entry.dirty = true;
      console.warn('[autosave] write failed:', err && err.message);
    }
  }
}

module.exports = { AutosaveController, AUTOSAVE_DEBOUNCE_MS };
