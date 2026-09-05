/**
 * Collaboration comment-store tests — pure logic with in-memory IO fakes,
 * covering persistence, navigation ordering, and anchor drift detection.
 */
const path = require('path');
const store = require('../src/plugins/built-in/collaboration/comment-store');

/** In-memory IO fake shaped like the plugin's IPC adapters. */
function makeIo(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    readFile: async (p) => (files.has(p) ? files.get(p) : null),
    writeFile: async (p, c) => {
      files.set(p, c);
    },
    fileExists: async (p) => files.has(p),
    ensureDirectory: () => {},
  };
}

describe('comment-store', () => {
  const doc = path.join('/docs', 'notes.md');
  const sidecar = path.join('/docs', '.comments', 'notes.md.json');

  describe('commentsFilePathFor', () => {
    it('places the sidecar in .comments/ next to the document', async () => {
      expect(store.commentsFilePathFor(doc, path)).toBe(sidecar);
      expect(store.commentsFilePathFor('/a/b/c.md', path)).toBe(
        path.join('/a/b/.comments', 'c.md.json')
      );
    });
  });

  describe('load/save round-trip', () => {
    it('returns [] for documents with no sidecar yet', async () => {
      expect(await store.loadComments(doc, makeIo(), path)).toEqual([]);
    });

    it('returns [] for corrupt JSON instead of throwing', async () => {
      const io = makeIo({ [sidecar]: '{oops' });
      expect(await store.loadComments(doc, io, path)).toEqual([]);
    });

    it('persists and reloads comments sorted by line', async () => {
      const io = makeIo();
      const comments = [];
      store.addComment(comments, { line: 12, anchorText: 'para two', text: 'expand this' });
      store.addComment(comments, { line: 3, anchorText: 'intro', text: 'strong opener' });
      await store.saveComments(doc, comments, io, path);

      const loaded = await store.loadComments(doc, io, path);
      expect(loaded.map((c) => c.line)).toEqual([3, 12]);
      expect(loaded[0].text).toBe('strong opener');
      expect(loaded[0].resolved).toBe(false);
    });

    it('normalizes malformed entries on load', async () => {
      const io = makeIo({
        [sidecar]: JSON.stringify({
          comments: [
            { line: '7', text: 42 },
            { line: 2, text: 'ok', author: 'ana' },
          ],
        }),
      });
      const loaded = await store.loadComments(doc, io, path);
      // '7' (string line) is dropped; the valid one survives normalization
      expect(loaded).toHaveLength(1);
      expect(loaded[0]).toMatchObject({ line: 2, author: 'ana' });
    });
  });

  describe('mutators', () => {
    it('addComment clamps lines and caps field lengths', async () => {
      const comments = [];
      const c = store.addComment(comments, {
        line: -5,
        anchorText: 'x'.repeat(500),
        text: 'y'.repeat(5000),
      });
      expect(comments).toHaveLength(1);
      expect(c.line).toBe(1);
      expect(c.anchorText.length).toBeLessThanOrEqual(200);
      expect(c.text.length).toBeLessThanOrEqual(4000);
      expect(c.id).toBeTruthy();
    });

    it('toggleResolved flips state and returns null for unknown ids', async () => {
      const comments = [];
      const c = store.addComment(comments, { line: 1, text: 'hi' });
      expect(store.toggleResolved(comments, c.id)).toBe(true);
      expect(store.toggleResolved(comments, c.id)).toBe(false);
      expect(store.toggleResolved(comments, 'missing')).toBeNull();
    });

    it('deleteComment reports whether anything was removed', async () => {
      const comments = [];
      const c = store.addComment(comments, { line: 1, text: 'hi' });
      expect(store.deleteComment(comments, c.id)).toBe(true);
      expect(comments).toHaveLength(0);
      expect(store.deleteComment(comments, c.id)).toBe(false);
    });
  });

  describe('nextUnresolved (F8 navigation)', () => {
    it('returns the first open comment below the cursor line', async () => {
      const comments = [
        { id: 'a', line: 5, resolved: false },
        { id: 'b', line: 20, resolved: false },
      ];
      expect(store.nextUnresolved(comments, 7).id).toBe('b');
    });

    it('wraps to the top when no open comments are below', async () => {
      const comments = [
        { id: 'a', line: 5, resolved: false },
        { id: 'b', line: 20, resolved: true },
      ];
      expect(store.nextUnresolved(comments, 10).id).toBe('a');
    });

    it('returns null when everything is resolved or empty', async () => {
      expect(store.nextUnresolved([{ id: 'a', line: 1, resolved: true }], 1)).toBeNull();
      expect(store.nextUnresolved([], 1)).toBeNull();
    });
  });

  describe('anchorStatus (drift detection)', () => {
    const base = { line: 2, anchorText: 'original text' };

    it('reports ok when the line still matches', async () => {
      expect(store.anchorStatus(base, ['first', 'original text', 'third'])).toBe('ok');
    });

    it('reports changed when the line text differs', async () => {
      expect(store.anchorStatus(base, ['first', 'edited text', 'third'])).toBe('changed');
    });

    it('reports missing when the line is beyond the document', async () => {
      expect(store.anchorStatus({ ...base, line: 99 }, ['only'])).toBe('missing');
      expect(store.anchorStatus(base, [])).toBe('missing');
    });

    it('reports moved for comments without an anchor snippet', async () => {
      expect(store.anchorStatus({ line: 1, anchorText: '' }, ['whatever'])).toBe('moved');
    });
  });
});
