/**
 * @jest-environment node
 *
 * SemanticEngine tests — verify the engine interface contract and the
 * fallback path. The neural engine itself isn't loaded in tests (no
 * @xenova/transformers dep installed in CI); we just verify the
 * graceful fallback behavior.
 */
const SemanticEngine = require('../../src/main/SemanticEngine');
const WorkspaceSearch = require('../../src/main/WorkspaceSearch');

describe('SemanticEngine.defaultEngine', () => {
  test('returns an engine object with the right shape', () => {
    const e = SemanticEngine.defaultEngine();
    expect(e.name).toBe('tf-idf');
    expect(e.isNeural).toBe(false);
    expect(typeof e.rank).toBe('function');
  });

  test('rank() returns WorkspaceSearch-style results', async () => {
    const e = SemanticEngine.defaultEngine();
    const chunks = [
      { path: 'a.md', content: 'rust async with tokio', mtimeMs: 1 },
      { path: 'b.md', content: 'unrelated content', mtimeMs: 1 },
    ];
    const r = await e.rank('rust async', chunks);
    expect(r.length).toBeGreaterThan(0);
    // First result should match the query
    expect(r[0].filePath).toBe('a.md');
    // Shape matches WorkspaceSearch
    for (const hit of r) {
      expect(hit).toHaveProperty('filePath');
      expect(hit).toHaveProperty('score');
      expect(hit).toHaveProperty('snippet');
    }
  });

  test('rank() filters out non-matching chunks', async () => {
    const e = SemanticEngine.defaultEngine();
    const r = await e.rank('rust', [
      { path: 'x.md', content: 'totally unrelated prose about cats' },
      { path: 'y.md', content: 'rust rust rust everywhere' },
    ]);
    expect(r.every((hit) => hit.filePath === 'y.md')).toBe(true);
  });
});

describe('SemanticEngine.getEngine', () => {
  test('returns the default engine for "tf-idf"', async () => {
    const e = await SemanticEngine.getEngine('tf-idf');
    expect(e.isNeural).toBe(false);
  });

  test('returns the default engine for an unknown name (graceful fallback)', async () => {
    const e = await SemanticEngine.getEngine('not-a-real-engine');
    expect(e.isNeural).toBe(false);
    expect(e.name).toBe('tf-idf');
  });

  test('neural engine falls back to tf-idf when @xenova/transformers is missing', async () => {
    // No install of @xenova/transformers in CI; the require() inside
    // neuralEngine() should fail and fall back.
    const e = await SemanticEngine.getEngine('transformers', { allowRemote: false });
    expect(e.isNeural).toBe(false);
    expect(e.name).toBe('tf-idf');
  });

  test('default engine is consistent across calls', () => {
    const a = SemanticEngine.defaultEngine();
    const b = SemanticEngine.defaultEngine();
    expect(a).not.toBe(b);
    expect(a.name).toBe(b.name);
  });
});

describe('SemanticEngine — WorkspaceSearch parity', () => {
  test('default engine returns the same shape WorkspaceSearch.search would', async () => {
    const files = [
      { path: '/a.md', content: 'rust async programming', mtimeMs: 1 },
      { path: '/b.md', content: 'python web dev', mtimeMs: 2 },
    ];
    const e = SemanticEngine.defaultEngine();
    const engineResult = await e.rank('rust', files);
    const directResult = WorkspaceSearch.search({ query: 'rust', files, limit: files.length });
    expect(engineResult.map((r) => r.filePath)).toEqual(directResult.map((r) => r.filePath));
    expect(engineResult[0].score).toBe(directResult[0].score);
  });
});
