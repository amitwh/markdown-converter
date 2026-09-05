/**
 * Session persistence for crash recovery / session restore.
 *
 * Keeps a snapshot of the open tabs (file paths, dirty state, and the content
 * of unsaved buffers) in localStorage so that after a crash, force-quit, or
 * accidental close the user can reopen exactly where they left off. Content is
 * only stored for buffers that would otherwise be lost:
 *
 *   - dirty untitled tabs  → full content (the only copy in existence)
 *   - dirty file tabs      → full content (differs from what is on disk)
 *   - clean file tabs      → path only (re-read from disk on restore)
 *   - PDF tabs             → path only (reopened in the PDF viewer)
 *
 * The module is pure logic over an injected Storage-like object so it can be
 * unit-tested without jsdom's localStorage quirks.
 *
 * @module SessionStore
 */

const STORAGE_KEY = 'editor-session';
// localStorage budgets are typically 5-10MB; stay well under with a 2MB cap on
// captured content so a pathological 40-tab session cannot blow the quota and
// take the whole snapshot down with a QuotaExceededError.
const MAX_CAPTURED_CONTENT_CHARS = 2 * 1024 * 1024;

/**
 * Build a serializable snapshot from the live tab map.
 *
 * @param {Map<number, object>} tabs TabManager's tab map
 * @param {number} activeTabId Currently selected tab id
 * @param {Function} getContentFn (tabId) => string — live editor content
 * @returns {{version: number, savedAt: number, activeTabId: number,
 *            tabs: Array<{id:number,type:string,title:string,filePath:string|null,
 *                          isDirty:boolean,content:(string|undefined)}>}}
 */
function captureSession(tabs, activeTabId, getContentFn) {
  const sessionTabs = [];
  let budget = MAX_CAPTURED_CONTENT_CHARS;

  for (const tab of tabs.values()) {
    const entry = {
      id: tab.id,
      type: tab.type || 'markdown',
      title: tab.title || 'Untitled',
      filePath: tab.filePath || null,
      isDirty: Boolean(tab.isDirty),
    };

    // Capture unsaved content, newest-budget-first (tabs iterate in id order;
    // later tabs are newer). Skip capture once the budget is exhausted rather
    // than silently truncating a buffer mid-file.
    if (entry.isDirty && budget > 0) {
      const content = getContentFn ? getContentFn(tab.id) : tab.content || '';
      if (typeof content === 'string' && content.length <= budget) {
        entry.content = content;
        budget -= content.length;
      } else if (typeof content === 'string') {
        // This single buffer exceeds the remaining budget — still try to keep
        // it if it fits the overall cap (other tabs consumed nothing yet).
        entry.content = content.length <= MAX_CAPTURED_CONTENT_CHARS ? content : undefined;
      }
    }

    // Drop empty untitled tabs — they carry nothing worth restoring
    if (!entry.filePath && !entry.isDirty && !(entry.content && entry.content.length > 0)) {
      continue;
    }
    if (!entry.filePath && entry.content === undefined) {
      continue;
    }

    sessionTabs.push(entry);
  }

  return {
    version: 1,
    savedAt: Date.now(),
    activeTabId,
    tabs: sessionTabs,
  };
}

/**
 * Persist a snapshot. Quota failures are swallowed after clearing the key: a
 * failed save must never crash the editor, and a stale snapshot is worse than
 * none (it would offer to restore outdated buffers).
 *
 * @param {Storage} storage localStorage-like object
 * @param {object} session Snapshot from captureSession()
 */
function saveSession(storage, session) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* nothing more to do */
    }
  }
}

/**
 * Load a snapshot. Returns null when nothing is stored, the JSON is corrupt,
 * or the shape is unrecognizable — callers treat null as "nothing to restore".
 *
 * @param {Storage} storage localStorage-like object
 * @returns {object|null}
 */
function loadSession(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (
      !session ||
      session.version !== 1 ||
      !Array.isArray(session.tabs) ||
      session.tabs.length === 0
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Remove the snapshot. Called on clean shutdown so a fresh launch doesn't
 * offer to "restore" a session the user deliberately closed.
 *
 * @param {Storage} storage localStorage-like object
 */
function clearSession(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

module.exports = {
  STORAGE_KEY,
  captureSession,
  saveSession,
  loadSession,
  clearSession,
};
