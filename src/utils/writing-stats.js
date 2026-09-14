/**
 * Writing stats — word count, reading time, Flesch-Kincaid grade level.
 *
 * Pure, dependency-free module. The renderer pulls this into a status-bar
 * widget that updates on every keystroke. Counts exclude code fences and
 * link/image URLs (the prose a reader actually consumes), which is what
 * serious writing tools (Hemingway, iA Writer) do.
 *
 * Flesch-Kincaid grade level is the standard US-grade readability score:
  grade = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 * Used widely in education and journalism to gauge reading difficulty.
 *
 * @module writing-stats
 */

/**
 * Strip markdown chrome so we count the prose a reader actually sees.
 *  - fenced code blocks ```…```
 *  - inline code `…`
 *  - image markup ![alt](url)
 *  - link markup [text](url) → keep "text" only
 *  - emphasis markers *, _, **, __
 *  - heading hashes at line start
 *  - blockquote markers
 *  - list bullets at line start (- * +)
 *  - HTML comments <!-- … -->
 */
function stripMarkdown(content) {
  if (typeof content !== 'string') return '';
  let s = content;
  // Fenced code blocks: drop the whole block including the fences
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/~~~[\s\S]*?~~~/g, ' ');
  // Inline code
  s = s.replace(/`[^`\n]*`/g, ' ');
  // Images: drop entirely (the URL is not prose)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // Links: keep the text, drop the URL part
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Wikilinks: keep the visible label
  s = s.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, _b, c) => (c || a));
  // Headings at line start
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  // Blockquote markers
  s = s.replace(/^\s{0,3}>\s?/gm, '');
  // List bullets / numbers at line start
  s = s.replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, '');
  // Emphasis markers
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2');
  s = s.replace(/(\*|_)(.*?)\1/g, '$2');
  // Strikethrough
  s = s.replace(/~~(.*?)~~/g, '$1');
  // HTML comments
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Horizontal rules
  s = s.replace(/^\s*([-*_])\s*\1\s*\1[\s\S]*?$/gm, ' ');
  return s;
}

/** Split prose into sentences. Robust enough for ASCII prose + common punctuation. */
function splitSentences(prose) {
  if (!prose) return [];
  // Split on . ! ? followed by whitespace or end. Keep abbreviations rough.
  const parts = prose.split(/(?<=[.!?])\s+/);
  return parts
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z0-9À-ɏ]/.test(s) && s.length >= 2);
}

/**
 * Approximate syllable count for an English word. The standard regex-based
 * heuristic (Flesch's original) — accurate to within ±1 syllable for ~80%
 * of common English words, which is good enough for grade-level scoring.
 */
function countSyllablesInWord(word) {
  if (!word) return 0;
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  // Drop trailing silent e, es, ed
  let stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  stripped = stripped.replace(/^y/, '');
  const matches = stripped.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function countSyllables(prose) {
  const words = (prose.match(/\b[A-Za-z'À-ɏ]+\b/g) || []);
  let total = 0;
  for (const w of words) total += countSyllablesInWord(w);
  return total;
}

function countWords(prose) {
  if (!prose) return 0;
  const matches = prose.match(/\b[\w'À-ɏ]+\b/g);
  return matches ? matches.length : 0;
}

/**
 * Compute the full writing-stats report for a markdown document.
 *
 * @param {string} content raw markdown
 * @param {object} [opts]
 * @param {number} [opts.wordsPerMinute=220] average reading speed for English prose
 * @returns {{
 *   wordCount:number,
 *   sentenceCount:number,
 *   syllableCount:number,
 *   readingTimeMinutes:number,
 *   fleschKincaidGrade:number|null,
 *   charCount:number
 * }}
 */
function computeStats(content, opts = {}) {
  const prose = stripMarkdown(content);
  const words = countWords(prose);
  const sentences = splitSentences(prose).length;
  const syllables = countSyllables(prose);
  const wpm = typeof opts.wordsPerMinute === 'number' && opts.wordsPerMinute > 0 ? opts.wordsPerMinute : 220;
  const readingTimeMinutes = words > 0 ? words / wpm : 0;

  let grade = null;
  if (sentences > 0 && words > 0) {
    grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
    // Round to one decimal for status-bar display; round-trips cleanly.
    grade = Math.round(grade * 10) / 10;
  }

  return {
    wordCount: words,
    sentenceCount: sentences,
    syllableCount: syllables,
    readingTimeMinutes,
    fleschKincaidGrade: grade,
    charCount: prose.replace(/\s/g, '').length,
  };
}

module.exports = {
  stripMarkdown,
  splitSentences,
  countSyllablesInWord,
  countSyllables,
  countWords,
  computeStats,
};