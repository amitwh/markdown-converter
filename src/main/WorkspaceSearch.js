/**
 * Workspace content search — the simplest useful thing that scales.
 *
 * Given a list of file paths and a query, returns ranked matches across
 * them. Designed for personal-workspace sizes (hundreds, maybe thousands of
 * notes) — runs synchronously on the main process with injectable IO so it
 * can be unit-tested without touching the filesystem.
 *
 * Query grammar (all optional, combinable):
 *   - Bare words               → term matches (case-insensitive substring)
 *   - Words prefixed with `#`  → require a matching `#tag` in the doc
 *   - Words prefixed with `@`  → require a matching `[[wikilink]]` target
 *   - Quoted phrases           → require the exact substring
 *
 * Scoring:
 *   - Each matched term adds +1 per occurrence (capped at 5/term to dampen
 *     repetition spam)
 *   - Each tag hit (`#foo`) or wikilink hit (`[[foo]]`) adds +3 if the query
 *     asked for it (facets weigh more than prose)
 *   - Recent edits (mtime within 7 days) get +0.5 to nudge "what I was
 *     working on yesterday" upward
 *
 * Returns [{ filePath, score, snippet, matchedTerms, matchedTags, matchedLinks }]
 * sorted by score desc, filePath asc as tiebreaker.
 *
 * @module WorkspaceSearch
 */

/** Tokenize a query into a structured form. Pure. */
function parseQuery(raw) {
  if (typeof raw !== 'string') return { terms: [], phrases: [], tags: [], links: [] };
  const terms = [];
  const phrases = [];
  const tags = [];
  const links = [];

  // Phrases first — match "double quoted text" as a unit
  const phraseRe = /"([^"]+)"/g;
  let remaining = raw.replace(phraseRe, (_, inner) => {
    if (inner.trim()) phrases.push(inner.toLowerCase());
    return ' ';
  });

  // Tags and links: #foo, @bar
  const facetRe = /[#@]([A-Za-z0-9_-]+)/g;
  remaining = remaining.replace(facetRe, (m, name) => {
    if (m.startsWith('#')) tags.push(name.toLowerCase());
    else links.push(name.toLowerCase());
    return ' ';
  });

  // Bare words (≥2 chars to avoid noise)
  for (const w of remaining.split(/\s+/)) {
    if (w.length >= 2) terms.push(w.toLowerCase());
  }

  return { terms, phrases, tags, links };
}

/** Extract a one-line snippet around the first match for `term`. Pure. */
function snippetAround(content, term, radius = 60) {
  const haystack = content.toLowerCase();
  const idx = haystack.indexOf(term);
  if (idx < 0) return '';
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + term.length + radius);
  let s = content.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = '…' + s;
  if (end < content.length) s = s + '…';
  return s;
}

/** Count occurrences of `needle` (case-insensitive substring) in `haystack`. */
function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const hay = haystack.toLowerCase();
  const ndl = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = hay.indexOf(ndl, idx)) !== -1) {
    count++;
    idx += ndl.length;
  }
  return count;
}

/** Does the content contain the `#tag`? Looks for word-boundary `#tag`. */
function hasTag(content, tag) {
  const re = new RegExp(`(^|\\s)#${escapeRegex(tag)}\\b`, 'i');
  return re.test(content);
}

/** Does the content contain `[[wikilink]]` or `[[wikilink|alias]]`? */
function hasWikilink(content, link) {
  const re = new RegExp(`\\[\\[${escapeRegex(link)}(\\|[^\\]]+)?\\]\\]`, 'i');
  return re.test(content);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Run a parsed query against one document's content. Returns
 * { score, matchedTerms, matchedTags, matchedLinks, snippet } or null if
 * nothing matched (so the caller can filter cheaply).
 */
function scoreDocument({ content, parsed, mtimeMs = 0, nowMs = Date.now() }) {
  let score = 0;
  const matchedTerms = [];
  const matchedTags = [];
  const matchedLinks = [];
  const lower = content.toLowerCase();

  for (const term of parsed.terms) {
    const n = countOccurrences(content, term);
    if (n > 0) {
      score += Math.min(n, 5);
      matchedTerms.push(term);
    }
  }
  for (const phrase of parsed.phrases) {
    if (lower.includes(phrase)) {
      score += 3; // phrase hits weigh more
      matchedTerms.push(phrase);
    }
  }
  for (const tag of parsed.tags) {
    if (hasTag(content, tag)) {
      score += 3;
      matchedTags.push(tag);
    }
  }
  for (const link of parsed.links) {
    if (hasWikilink(content, link)) {
      score += 3;
      matchedLinks.push(link);
    }
  }

  if (score === 0) return null;

  // Recency nudge: edits within the last 7 days
  const ageDays = (nowMs - mtimeMs) / (24 * 60 * 60 * 1000);
  if (Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= 7) {
    score += 0.5 * (1 - ageDays / 7);
  }

  // Build a snippet around the first matched term (or phrase/tag) for the UI
  let snippet = '';
  const firstTerm = matchedTerms[0] || (parsed.tags[0] ? `#${parsed.tags[0]}` : null);
  if (firstTerm) {
    snippet = snippetAround(content, firstTerm);
  } else {
    snippet = content.slice(0, 120).replace(/\s+/g, ' ').trim() + (content.length > 120 ? '…' : '');
  }

  return { score, matchedTerms, matchedTags, matchedLinks, snippet };
}

/**
 * Search across many files. Files whose content matches the query are
 * scored and returned sorted by score.
 *
 * @param {object} args
 * @param {string} args.query raw query string
 * @param {Array<{path:string, content:string, mtimeMs?:number}>} args.files
 * @param {number} [args.limit=50]
 * @returns {Array<{filePath:string, score:number, snippet:string, matchedTerms:string[], matchedTags:string[], matchedLinks:string[]}>}
 */
function search({ query, files, limit = 50, nowMs = Date.now() }) {
  const parsed = parseQuery(query);
  // Nothing to search for — short-circuit so callers don't pay the file loop
  if (
    parsed.terms.length === 0 &&
    parsed.phrases.length === 0 &&
    parsed.tags.length === 0 &&
    parsed.links.length === 0
  ) {
    return [];
  }
  const out = [];
  for (const file of files) {
    if (!file || typeof file.content !== 'string') continue;
    const r = scoreDocument({ content: file.content, parsed, mtimeMs: file.mtimeMs, nowMs });
    if (!r) continue;
    out.push({ filePath: file.path, ...r });
  }
  out.sort(
    (a, b) => b.score - a.score || (a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0)
  );
  return out.slice(0, limit);
}

module.exports = {
  parseQuery,
  snippetAround,
  countOccurrences,
  hasTag,
  hasWikilink,
  scoreDocument,
  search,
};
