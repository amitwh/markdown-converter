/**
 * Quick-switcher fuzzy matcher.
 *
 * Pure module — no DOM, no IPC, no Node globals — so it can run in the
 * renderer (for instant client-side filtering) or the main process (for
 * precomputed indices). Tested under @jest-environment node.
 *
 * Scoring tiers:
 *   exact match        → 1.00  (query === target, case-insensitive)
 *   stem match         → 1.00  (query === target without first extension)
 *   prefix match       → 0.80
 *   subsequence match  → 0.50 + bonuses, capped at 0.79
 *   no match           → 0.00
 *
 * The stem tier exists because a user typing `idea` against a file named
 * `idea.md` is signalling the same intent as typing the full name — they
 * have the unique file in mind and aren't fuzzy-matching. Treating it as
 * 1.0 (rather than 0.8 prefix) means recent/open-tabs boosts work as
 * expected: 1.0 × 2.0 × 1.5 = 3.0 for an exact, open, recent file.
 *
 * Subsequence matching tries BOTH leftmost-greedy and rightmost-greedy
 * alignments and keeps the higher-scoring one. Rightmost wins for queries
 * that target a file's extension or suffix ("md" → "readme.md"); leftmost
 * wins for queries that target a leading prefix ("re" → "readme.md").
 *
 * Bonuses (each +0.05, capped):
 *   - word-boundary hit: previous char is one of  / - _ space .
 *     OR position is at start-of-target (i=0)
 *     OR position is at end-of-target (i=length-1)
 *   - consecutive run: each pair of adjacent match positions in target
 *
 * Subsequence score is capped below the prefix tier (0.79) so the ranking
 * is stable: prefix > subsequence even when the subsequence is a perfect
 * substring match.
 *
 * @module fuzzy-matcher
 */

const SEPARATORS = /[\/\-_. ]/;
const SUBSEQ_CAP = 0.79;
const BOUNDARY_BONUS = 0.05;
const CONSECUTIVE_BONUS = 0.1;

/**
 * Score `query` against `target` (typically a filename basename).
 *
 * @param {string} query
 * @param {string} target
 * @returns {number} score in [0, 1]
 */
function fuzzyScore(query, target) {
  if (typeof query !== 'string' || typeof target !== 'string') return 0;
  if (query.length === 0 || target.length === 0) return 0;

  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q === t) return 1.0;

  // Stem match: query equals target with the first extension stripped.
  // 'idea' against 'idea.md' → stem 'idea' → 1.0
  // 'archive' against 'archive.tar.gz' → stem 'archive' → 1.0
  // '.gitignore' (no real extension) → stem '.gitignore', query must match whole name
  const firstDot = t.indexOf('.');
  const stem = firstDot >= 1 ? t.slice(0, firstDot) : t;
  if (q === stem) return 1.0;

  if (t.startsWith(q)) return 0.8;

  const leftMatch = greedyMatch(q, t, 'left');
  const rightMatch = greedyMatch(q, t, 'right');

  const leftScore = leftMatch ? scoreMatch(leftMatch, t) : 0;
  const rightScore = rightMatch ? scoreMatch(rightMatch, t) : 0;

  const best = Math.max(leftScore, rightScore);
  return best > 0 ? Math.min(SUBSEQ_CAP, best) : 0;
}

/**
 * Greedy subsequence match. Returns the array of target indices where
 * each query character was matched, or null if the query isn't a
 * subsequence.
 *
 * 'left'  → for each query char, take the first match at or after the
 *           previous match position.
 * 'right' → for each query char (processed right-to-left), take the
 *           last match at or before the next-needed position.
 */
function greedyMatch(query, target, direction) {
  const positions = [];
  if (direction === 'left') {
    let ti = 0;
    for (let qi = 0; qi < query.length; qi++) {
      let found = -1;
      for (let j = ti; j < target.length; j++) {
        if (target[j] === query[qi]) {
          found = j;
          break;
        }
      }
      if (found === -1) return null;
      positions.push(found);
      ti = found + 1;
    }
    return positions;
  }
  // right
  let ti = target.length;
  for (let qi = query.length - 1; qi >= 0; qi--) {
    let found = -1;
    for (let j = ti - 1; j >= 0; j--) {
      if (target[j] === query[qi]) {
        found = j;
        break;
      }
    }
    if (found === -1) return null;
    positions.unshift(found);
    ti = found;
  }
  return positions;
}

/**
 * Score a match by counting boundary hits and consecutive pairs.
 */
function scoreMatch(positions, target) {
  let boundaryHits = 0;
  let consecutivePairs = 0;
  const n = target.length;

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p === 0 || p === n - 1 || SEPARATORS.test(target[p - 1] || '')) {
      boundaryHits++;
    }
    if (i > 0 && positions[i] === positions[i - 1] + 1) {
      consecutivePairs++;
    }
  }

  return 0.5 + boundaryHits * BOUNDARY_BONUS + consecutivePairs * CONSECUTIVE_BONUS;
}

/**
 * Rank `items` against `query`, applying per-path boosts. Items with no
 * match (and not boosted) are excluded.
 *
 * Boosts are multiplicative on the base score:
 *   - recent   → ×2.0
 *   - openTabs → ×1.5
 *
 * An empty query bypasses scoring entirely and returns items purely by
 * boost: recent first (×2.0), then open tabs (×1.5), then nothing.
 *
 * @param {string} query
 * @param {Array<{path:string, name?:string}>} items
 * @param {object} [boosts]
 * @param {Set<string>} [boosts.recent]
 * @param {Set<string>} [boosts.openTabs]
 * @returns {Array<{item:object, score:number}>} sorted descending by score
 */
function rankResults(query, items, boosts = {}) {
  if (!Array.isArray(items)) return [];
  const { recent = new Set(), openTabs = new Set() } = boosts;

  const isEmptyQuery = typeof query !== 'string' || query.length === 0;
  const out = [];

  for (const item of items) {
    if (!item || typeof item.path !== 'string') continue;

    let score;
    if (isEmptyQuery) {
      if (recent.has(item.path)) score = 2.0;
      else if (openTabs.has(item.path)) score = 1.5;
      else continue;
    } else {
      const base = fuzzyScore(query, item.name || '');
      if (base === 0) continue;
      score = base;
      if (recent.has(item.path)) score *= 2.0;
      if (openTabs.has(item.path)) score *= 1.5;
    }
    out.push({ item, score });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

module.exports = {
  fuzzyScore,
  rankResults,
  // exported for tests / advanced callers
  greedyMatch,
  scoreMatch,
  SUBSEQ_CAP,
};
