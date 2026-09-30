/**
 * @jest-environment node
 *
 * Quick-switcher fuzzy matcher.
 *
 * Tiered scoring:
 *   - exact match         → 1.00
 *   - prefix match        → 0.80
 *   - subsequence match   → 0.50 + bonuses (word-boundary, consecutive)
 *   - no match            → 0.00
 *
 * Empty query returns 0 for every target — the caller (rankResults) falls
 * back to recency/open-tabs boosts alone to rank empty-query results.
 *
 * All scoring is case-insensitive. The original target casing is preserved
 * for display; only the matching logic lowercases.
 */

const { fuzzyScore, rankResults } = require('../src/quick-switcher/fuzzy-matcher');

describe('fuzzyScore', () => {
  test('exact match returns 1.0', () => {
    expect(fuzzyScore('readme.md', 'readme.md')).toBe(1.0);
  });

  test('exact match is case-insensitive', () => {
    expect(fuzzyScore('README.md', 'readme.md')).toBe(1.0);
    expect(fuzzyScore('readme.MD', 'README.md')).toBe(1.0);
  });

  test('prefix match returns ~0.8', () => {
    const score = fuzzyScore('read', 'readme.md');
    expect(score).toBeGreaterThanOrEqual(0.8);
    expect(score).toBeLessThan(0.9);
  });

  test('prefix match is case-insensitive', () => {
    expect(fuzzyScore('READ', 'readme.md')).toBeCloseTo(0.8, 2);
  });

  test('subsequence match returns ~0.5 + bonuses', () => {
    const score = fuzzyScore('rmd', 'readme.md');
    expect(score).toBeGreaterThanOrEqual(0.5);
    expect(score).toBeLessThan(0.8);
  });

  test('subsequence match on word boundary scores higher than mid-word', () => {
    const boundary = fuzzyScore('md', 'readme.md'); // 'md' is a suffix → still prefix-like
    const mid = fuzzyScore('ea', 'readme.md'); // 'ea' is mid-word subsequence
    expect(boundary).toBeGreaterThan(mid);
  });

  test('consecutive matches score higher than scattered matches', () => {
    const consecutive = fuzzyScore('re', 'readme.md'); // contiguous
    const scattered = fuzzyScore('rd', 'readme.md'); // not contiguous
    expect(consecutive).toBeGreaterThan(scattered);
  });

  test('no match returns 0', () => {
    expect(fuzzyScore('xyz', 'readme.md')).toBe(0);
    expect(fuzzyScore('', '')).toBe(0);
  });

  test('empty query returns 0 (caller decides what to do)', () => {
    expect(fuzzyScore('', 'readme.md')).toBe(0);
  });

  test('query longer than target returns 0', () => {
    expect(fuzzyScore('readme.md.bak', 'readme.md')).toBe(0);
  });

  test('non-string inputs return 0', () => {
    expect(fuzzyScore(null, 'readme.md')).toBe(0);
    expect(fuzzyScore(undefined, 'readme.md')).toBe(0);
    expect(fuzzyScore('rm', null)).toBe(0);
    expect(fuzzyScore('rm', undefined)).toBe(0);
  });

  test('preserves display casing (does not mutate target)', () => {
    const target = 'README.md';
    fuzzyScore('readme', target);
    expect(target).toBe('README.md');
  });
});

describe('rankResults', () => {
  const items = [
    { path: '/notes/readme.md', name: 'readme.md' },
    { path: '/notes/rust/intro.md', name: 'intro.md' },
    { path: '/notes/idea.md', name: 'idea.md' },
    { path: '/archive/old-readme.md', name: 'old-readme.md' },
    { path: '/totally/unrelated.txt', name: 'unrelated.txt' },
  ];

  test('sorts by score descending', () => {
    const ranked = rankResults('readme', items);
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  test('excludes zero-score items', () => {
    const ranked = rankResults('xyz', items);
    expect(ranked).toEqual([]);
  });

  test('applies recency boost (×2.0) to recent paths', () => {
    const recent = new Set(['/archive/old-readme.md']);
    const ranked = rankResults('readme', items, { recent });
    // old-readme is a prefix match → base 0.8; with ×2.0 boost = 1.6
    // readme.md is a prefix match → base 0.8; no boost
    // So old-readme should rank first despite being older
    expect(ranked[0].item.path).toBe('/archive/old-readme.md');
  });

  test('applies open-tabs boost (×1.5)', () => {
    const openTabs = new Set(['/notes/idea.md']);
    const ranked = rankResults('idea', items, { openTabs });
    // idea.md is exact match → base 1.0; with ×1.5 boost = 1.5
    expect(ranked[0].item.path).toBe('/notes/idea.md');
    expect(ranked[0].score).toBeCloseTo(1.5, 2);
  });

  test('combines recency and open-tabs boosts (multiplicative)', () => {
    const recent = new Set(['/notes/idea.md']);
    const openTabs = new Set(['/notes/idea.md']);
    const ranked = rankResults('idea', items, { recent, openTabs });
    // exact 1.0 × 2.0 × 1.5 = 3.0
    expect(ranked[0].score).toBeCloseTo(3.0, 2);
  });

  test('empty query falls back to boosts only — recent first, then open tabs', () => {
    const recent = new Set(['/archive/old-readme.md']);
    const openTabs = new Set(['/notes/rust/intro.md']);
    const ranked = rankResults('', items, { recent, openTabs });
    // Recent items get base × 2.0; open tabs × 1.5; nothing else
    expect(ranked[0].item.path).toBe('/archive/old-readme.md');
    expect(ranked[1].item.path).toBe('/notes/rust/intro.md');
  });

  test('empty query with no boosts returns empty array', () => {
    const ranked = rankResults('', items, {});
    expect(ranked).toEqual([]);
  });

  test('returns empty array for empty items', () => {
    expect(rankResults('readme', [])).toEqual([]);
  });

  test('exact match beats prefix match beats subsequence match', () => {
    const ranked = rankResults('idea', items);
    // idea.md is exact match (1.0)
    // old-readme.md is subsequence (matches 'i', 'd', 'e', 'a' across path chars)
    expect(ranked[0].item.path).toBe('/notes/idea.md');
  });

  test('handles identical names in different paths via path-aware boost', () => {
    const dupItems = [
      { path: '/a/readme.md', name: 'readme.md' },
      { path: '/b/readme.md', name: 'readme.md' },
    ];
    const recent = new Set(['/b/readme.md']);
    const ranked = rankResults('readme', dupItems, { recent });
    expect(ranked[0].item.path).toBe('/b/readme.md');
    expect(ranked[1].item.path).toBe('/a/readme.md');
  });
});
