/**
 * SessionStore (crash recovery) unit tests. Uses an in-memory Storage stub so
 * the pure capture/save/load/clear logic can be tested without jsdom
 * localStorage behavior, plus a quota-failing stub for the error paths.
 */
const {
  captureSession,
  saveSession,
  loadSession,
  clearSession,
  STORAGE_KEY,
} = require('../src/utils/session-store');

/** Minimal synchronous Storage stub. */
function makeStorage({ quotaFails = false } = {}) {
  const map = new Map();
  return {
    setItem(k, v) {
      if (quotaFails) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    removeItem(k) {
      map.delete(k);
    },
    _map: map,
  };
}

// Helper: build a tab map like TabManager's
function tabMapOf(...tabs) {
  const map = new Map();
  tabs.forEach((t) => map.set(t.id, t));
  return map;
}

describe('SessionStore', () => {
  describe('captureSession', () => {
    it('captures full content for dirty tabs and paths only for clean file tabs', () => {
      const session = captureSession(
        tabMapOf(
          { id: 1, title: 'notes.md', filePath: '/tmp/notes.md', isDirty: true, type: 'markdown' },
          {
            id: 2,
            title: 'readme.md',
            filePath: '/tmp/readme.md',
            isDirty: false,
            type: 'markdown',
          },
          { id: 3, title: 'Untitled', filePath: null, isDirty: true, type: 'markdown' }
        ),
        1,
        (id) => `content-of-${id}`
      );

      expect(session.version).toBe(1);
      expect(session.activeTabId).toBe(1);
      expect(session.tabs).toHaveLength(3);

      const dirty = session.tabs.find((t) => t.id === 1);
      expect(dirty.content).toBe('content-of-1');
      expect(dirty.isDirty).toBe(true);

      const clean = session.tabs.find((t) => t.id === 2);
      expect(clean.content).toBeUndefined();
      expect(clean.filePath).toBe('/tmp/readme.md');

      const untitled = session.tabs.find((t) => t.id === 3);
      expect(untitled.content).toBe('content-of-3');
    });

    it('drops empty untitled tabs', () => {
      const session = captureSession(
        tabMapOf({ id: 1, title: 'Untitled', filePath: null, isDirty: false, type: 'markdown' }),
        1,
        () => ''
      );
      expect(session.tabs).toHaveLength(0);
    });

    it('keeps PDF tabs as path-only entries', () => {
      const session = captureSession(
        tabMapOf({
          id: 1,
          title: 'doc.pdf',
          filePath: '/tmp/doc.pdf',
          isDirty: false,
          type: 'pdf',
        }),
        1,
        () => ''
      );
      expect(session.tabs).toHaveLength(1);
      expect(session.tabs[0].type).toBe('pdf');
      expect(session.tabs[0].filePath).toBe('/tmp/doc.pdf');
      expect('content' in session.tabs[0]).toBe(false);
    });

    it('stops capturing content once the size budget is exhausted', () => {
      const big = 'x'.repeat(1024 * 1024); // 1MB each
      const session = captureSession(
        tabMapOf(
          { id: 1, title: 'a', filePath: null, isDirty: true, type: 'markdown' },
          { id: 2, title: 'b', filePath: null, isDirty: true, type: 'markdown' },
          { id: 3, title: 'c', filePath: null, isDirty: true, type: 'markdown' }
        ),
        3,
        () => big
      );
      // 2MB budget holds exactly two 1MB buffers
      const captured = session.tabs.filter((t) => typeof t.content === 'string');
      expect(captured.length).toBeLessThanOrEqual(2);
    });
  });

  describe('saveSession / loadSession', () => {
    it('round-trips a snapshot', () => {
      const storage = makeStorage();
      const session = captureSession(
        tabMapOf({ id: 1, title: 'x', filePath: null, isDirty: true, type: 'markdown' }),
        1,
        () => 'hello'
      );
      saveSession(storage, session);
      expect(loadSession(storage)).toEqual(session);
    });

    it('returns null when nothing is stored', () => {
      expect(loadSession(makeStorage())).toBeNull();
    });

    it('returns null for corrupt JSON', () => {
      const storage = makeStorage();
      storage.setItem(STORAGE_KEY, '{not json');
      expect(loadSession(storage)).toBeNull();
    });

    it('returns null for unknown versions or empty tab lists', () => {
      const storage = makeStorage();
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, tabs: [{}] }));
      expect(loadSession(storage)).toBeNull();
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tabs: [] }));
      expect(loadSession(storage)).toBeNull();
    });

    it('swallows quota errors and clears any stale snapshot', () => {
      const storage = makeStorage({ quotaFails: true });
      expect(() => saveSession(storage, { version: 1, tabs: [] })).not.toThrow();
    });
  });

  describe('clearSession', () => {
    it('removes the stored snapshot', () => {
      const storage = makeStorage();
      storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tabs: [{}] }));
      clearSession(storage);
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
    });
  });
});
