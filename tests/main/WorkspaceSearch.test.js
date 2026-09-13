/**
 * @jest-environment node
 *
 * WorkspaceSearch tests — pure module, no IO.
 */
const WorkspaceSearch = require('../../src/main/WorkspaceSearch');

describe('WorkspaceSearch.parseQuery', () => {
  test('extracts bare terms', () => {
    const q = WorkspaceSearch.parseQuery('hello world');
    expect(q.terms).toEqual(['hello', 'world']);
    expect(q.phrases).toEqual([]);
    expect(q.tags).toEqual([]);
    expect(q.links).toEqual([]);
  });

  test('extracts #tag and @wikilink facets', () => {
    const q = WorkspaceSearch.parseQuery('search query #rust @project-x');
    expect(q.terms).toEqual(['search', 'query']);
    expect(q.tags).toEqual(['rust']);
    expect(q.links).toEqual(['project-x']);
  });

  test('extracts "quoted phrases" as a unit', () => {
    const q = WorkspaceSearch.parseQuery('hello "world peace" again');
    expect(q.terms).toEqual(['hello', 'again']);
    expect(q.phrases).toEqual(['world peace']);
  });

  test('lowercases terms and facets for case-insensitive matching', () => {
    const q = WorkspaceSearch.parseQuery('Foo #BAR @Baz');
    expect(q.terms).toEqual(['foo']);
    expect(q.tags).toEqual(['bar']);
    expect(q.links).toEqual(['baz']);
  });

  test('drops single-character noise terms', () => {
    const q = WorkspaceSearch.parseQuery('a big b');
    expect(q.terms).toEqual(['big']);
  });

  test('handles non-string input safely', () => {
    expect(WorkspaceSearch.parseQuery(null)).toEqual({
      terms: [],
      phrases: [],
      tags: [],
      links: [],
    });
    expect(WorkspaceSearch.parseQuery(undefined)).toEqual({
      terms: [],
      phrases: [],
      tags: [],
      links: [],
    });
    expect(WorkspaceSearch.parseQuery(42)).toEqual({ terms: [], phrases: [], tags: [], links: [] });
  });
});

describe('WorkspaceSearch.hasTag', () => {
  test('matches #foo anywhere with word boundary', () => {
    expect(WorkspaceSearch.hasTag('#foo hello world', 'foo')).toBe(true);
    expect(WorkspaceSearch.hasTag('paragraph #foo end', 'foo')).toBe(true);
  });

  test('does not match a substring of another tag', () => {
    // #foobar should not match #foo
    expect(WorkspaceSearch.hasTag('#foobar text', 'foo')).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(WorkspaceSearch.hasTag('#FOO bar', 'foo')).toBe(true);
  });
});

describe('WorkspaceSearch.hasWikilink', () => {
  test('matches [[foo]] and [[foo|alias]]', () => {
    expect(WorkspaceSearch.hasWikilink('see [[foo]] for details', 'foo')).toBe(true);
    expect(WorkspaceSearch.hasWikilink('see [[foo|the thing]] for details', 'foo')).toBe(true);
  });

  test('does not match partial wiki-link references', () => {
    expect(WorkspaceSearch.hasWikilink('look at foobar', 'foo')).toBe(false);
  });
});

describe('WorkspaceSearch.scoreDocument', () => {
  test('returns null when nothing matches', () => {
    const r = WorkspaceSearch.scoreDocument({
      content: 'unrelated text',
      parsed: WorkspaceSearch.parseQuery('zebra'),
    });
    expect(r).toBeNull();
  });

  test('scores a single term match', () => {
    const r = WorkspaceSearch.scoreDocument({
      content: 'the quick brown fox jumps',
      parsed: WorkspaceSearch.parseQuery('fox'),
    });
    expect(r).not.toBeNull();
    expect(r.score).toBeGreaterThan(0);
    expect(r.matchedTerms).toContain('fox');
  });

  test('caps per-term repetition spam', () => {
    const content = 'foo '.repeat(50) + 'unrelated';
    const r = WorkspaceSearch.scoreDocument({
      content,
      parsed: WorkspaceSearch.parseQuery('foo'),
    });
    // 50 occurrences but capped at +5/term
    expect(r.score).toBe(5);
  });

  test('tag hits weigh more than prose hits', () => {
    const r = WorkspaceSearch.scoreDocument({
      content: 'just a #rust mention',
      parsed: WorkspaceSearch.parseQuery('#rust'),
    });
    // Tag facet = +3, no prose matching
    expect(r.score).toBe(3);
    expect(r.matchedTags).toEqual(['rust']);
  });

  test('wikilink hits are recorded separately', () => {
    const r = WorkspaceSearch.scoreDocument({
      content: 'see [[project-x]]',
      parsed: WorkspaceSearch.parseQuery('@project-x'),
    });
    expect(r.score).toBe(3);
    expect(r.matchedLinks).toEqual(['project-x']);
  });

  test('phrase hits weigh more than single terms', () => {
    const r = WorkspaceSearch.scoreDocument({
      content: 'world peace is lovely',
      parsed: WorkspaceSearch.parseQuery('"world peace"'),
    });
    expect(r.score).toBe(3);
  });

  test('snippet is a windowed slice around the first match', () => {
    const content = 'A'.repeat(100) + ' fox here ' + 'B'.repeat(100);
    const r = WorkspaceSearch.scoreDocument({
      content,
      parsed: WorkspaceSearch.parseQuery('fox'),
    });
    expect(r.snippet).toContain('fox');
    expect(r.snippet.length).toBeLessThan(200);
  });

  test('recency nudge adds a small boost for edits within 7 days', () => {
    const now = Date.now();
    const content = 'fox mention';
    const recent = WorkspaceSearch.scoreDocument({
      content,
      parsed: WorkspaceSearch.parseQuery('fox'),
      mtimeMs: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
      nowMs: now,
    });
    const stale = WorkspaceSearch.scoreDocument({
      content,
      parsed: WorkspaceSearch.parseQuery('fox'),
      mtimeMs: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
      nowMs: now,
    });
    expect(recent.score).toBeGreaterThan(stale.score);
  });
});

describe('WorkspaceSearch.search', () => {
  const files = [
    { path: '/notes/a.md', content: 'rust language overview' },
    { path: '/notes/b.md', content: '#rust tag-only entry with #rust mentions' },
    { path: '/notes/c.md', content: 'unrelated content' },
    { path: '/notes/d.md', content: '[[project-x]] link' },
    { path: '/notes/e.md', content: 'rust rust rust rust rust rust rust' },
  ];

  test('returns matches sorted by score descending', () => {
    const results = WorkspaceSearch.search({ query: 'rust', files });
    expect(results.length).toBeGreaterThan(0);
    // b.md has #rust (tag + prose) and a.md has prose only
    expect(results[0].filePath).toBe('/notes/e.md'); // highest prose count
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  test('filters out non-matching docs', () => {
    const results = WorkspaceSearch.search({ query: 'rust', files });
    expect(results.find((r) => r.filePath === '/notes/c.md')).toBeUndefined();
    expect(results.find((r) => r.filePath === '/notes/d.md')).toBeUndefined();
  });

  test('honors a limit', () => {
    const results = WorkspaceSearch.search({ query: 'rust', files, limit: 2 });
    expect(results.length).toBe(2);
  });

  test('returns [] for an empty query', () => {
    expect(WorkspaceSearch.search({ query: '', files })).toEqual([]);
    expect(WorkspaceSearch.search({ query: '   ', files })).toEqual([]);
    expect(WorkspaceSearch.search({ query: '#', files })).toEqual([]);
  });

  test('combines bare terms with facets in a single query', () => {
    const files2 = [
      { path: '/x.md', content: 'rust #rust content' },
      { path: '/y.md', content: 'rust content without tag' },
    ];
    const results = WorkspaceSearch.search({ query: 'rust #rust', files: files2 });
    expect(results[0].filePath).toBe('/x.md');
    expect(results[0].matchedTerms).toContain('rust');
    expect(results[0].matchedTags).toEqual(['rust']);
  });

  test('skips files without content (no crash on bad input)', () => {
    const files3 = [
      null,
      { path: '/a.md' }, // missing content
      { path: '/b.md', content: 'fox' },
    ];
    const results = WorkspaceSearch.search({ query: 'fox', files: files3 });
    expect(results).toHaveLength(1);
    expect(results[0].filePath).toBe('/b.md');
  });
});
