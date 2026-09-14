/**
 * @jest-environment node
 *
 * writing-stats tests — pure module, no IO.
 */
const {
  stripMarkdown,
  splitSentences,
  countSyllablesInWord,
  countSyllables,
  countWords,
  computeStats,
} = require('../src/utils/writing-stats');

describe('stripMarkdown', () => {
  test('removes fenced code blocks', () => {
    expect(stripMarkdown('hello\n```js\nfoo();\n```\nworld')).toMatch(/hello/);
    expect(stripMarkdown('hello\n```js\nfoo();\n```\nworld')).not.toMatch(/foo/);
  });

  test('removes inline code', () => {
    expect(stripMarkdown('use the `npm install` command')).not.toMatch(/npm install/);
    expect(stripMarkdown('use the `npm install` command')).toMatch(/use the/);
  });

  test('strips image syntax entirely (URLs are not prose)', () => {
    expect(stripMarkdown('see ![diagram](https://x.com/a.png) here')).not.toMatch(/x\.com/);
    expect(stripMarkdown('see ![diagram](https://x.com/a.png) here')).toMatch(/see/);
  });

  test('keeps link text but drops URLs', () => {
    expect(stripMarkdown('read [the docs](https://docs.example.com) now')).toMatch(/the docs/);
    expect(stripMarkdown('read [the docs](https://docs.example.com) now')).not.toMatch(/docs\.example/);
  });

  test('keeps wikilink visible labels', () => {
    expect(stripMarkdown('see [[Project X|the project]] page')).toMatch(/the project/);
  });

  test('strips heading hashes, blockquote markers, list bullets', () => {
    expect(stripMarkdown('# Title\n\n> A quote\n\n- a bullet\n\n1. numbered')).toMatch(/Title/);
    expect(stripMarkdown('# Title')).not.toMatch(/^#/);
    expect(stripMarkdown('> quoted')).not.toMatch(/^>/);
  });

  test('strips emphasis markers but keeps the inner text', () => {
    expect(stripMarkdown('this is **very** _important_')).toMatch(/this is very important/);
    expect(stripMarkdown('this is **very** _important_')).not.toMatch(/[_*]/);
  });

  test('handles empty / non-string input', () => {
    expect(stripMarkdown('')).toBe('');
    expect(stripMarkdown(null)).toBe('');
    expect(stripMarkdown(undefined)).toBe('');
    expect(stripMarkdown(42)).toBe('');
  });
});

describe('splitSentences', () => {
  test('splits on . ! ?', () => {
    expect(splitSentences('Hello. World! Are you there?')).toEqual([
      'Hello.',
      'World!',
      'Are you there?',
    ]);
  });

  test('returns [] for empty / non-prose input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(null)).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
    expect(splitSentences('---')).toEqual([]);
  });

  test('drops fragments without letter content', () => {
    expect(splitSentences('Real sentence. !!! Another one.')).toEqual([
      'Real sentence.',
      'Another one.',
    ]);
  });
});

describe('countSyllablesInWord', () => {
  test('counts short words as 1 syllable', () => {
    expect(countSyllablesInWord('a')).toBe(1);
    expect(countSyllablesInWord('cat')).toBe(1);
  });

  test('counts common English words correctly', () => {
    expect(countSyllablesInWord('hello')).toBe(2);
    expect(countSyllablesInWord('world')).toBe(1);
    expect(countSyllablesInWord('beautiful')).toBeGreaterThanOrEqual(2);
    expect(countSyllablesInWord('reading')).toBeGreaterThanOrEqual(2);
  });

  test('handles words ending in silent e', () => {
    expect(countSyllablesInWord('make')).toBe(1);
    expect(countSyllablesInWord('made')).toBe(1);
  });

  test('returns 0 for non-word / empty input', () => {
    expect(countSyllablesInWord('')).toBe(0);
    expect(countSyllablesInWord('   ')).toBe(0);
    expect(countSyllablesInWord(null)).toBe(0);
  });
});

describe('countSyllables / countWords', () => {
  test('counts syllables and words for a known sentence', () => {
    const prose = 'The quick brown fox jumps over the lazy dog';
    expect(countWords(prose)).toBe(9);
    // The dog has ~1 syll; "quick" 1; "brown" 1; "jumps" 1; "over" 2; "lazy" 2;
    // "the" 1; "fox" 1. Total 11 (within ±2 of any heuristic).
    expect(countSyllables(prose)).toBeGreaterThanOrEqual(9);
    expect(countSyllables(prose)).toBeLessThanOrEqual(13);
  });
});

describe('computeStats', () => {
  test('returns zeros for an empty document', () => {
    const s = computeStats('');
    expect(s.wordCount).toBe(0);
    expect(s.sentenceCount).toBe(0);
    expect(s.readingTimeMinutes).toBe(0);
    expect(s.fleschKincaidGrade).toBeNull();
  });

  test('handles non-string input safely', () => {
    const s = computeStats(null);
    expect(s.wordCount).toBe(0);
  });

  test('computes word count, reading time, grade for real prose', () => {
    const md = `# Title

The quick brown fox jumps over the lazy dog. This sentence has eight words total.

\`\`\`js
// not counted
const x = 1;
\`\`\`

A second paragraph with [a link](https://x.com) and **bold** words.`;
    const s = computeStats(md);
    expect(s.wordCount).toBeGreaterThan(15);
    // Code block is excluded
    expect(s.wordCount).toBeLessThan(30);
    // Reading time at 220 wpm: 24 words ≈ 0.11 min
    expect(s.readingTimeMinutes).toBeGreaterThan(0);
    expect(s.readingTimeMinutes).toBeLessThan(1);
    // Grade level is a number for prose with at least one sentence
    expect(typeof s.fleschKincaidGrade).toBe('number');
    expect(s.sentenceCount).toBeGreaterThanOrEqual(2);
  });

  test('reading time scales with word count', () => {
    const one = '# Title\n\nThe quick brown fox.';
    const two = '# Title\n\n' + 'The quick brown fox. '.repeat(10);
    expect(computeStats(two).readingTimeMinutes).toBeGreaterThan(
      computeStats(one).readingTimeMinutes
    );
  });

  test('honors a custom wordsPerMinute', () => {
    const md = 'word '.repeat(220);
    const s = computeStats(md, { wordsPerMinute: 100 });
    expect(s.readingTimeMinutes).toBeGreaterThan(2);
  });

  test('falls back to default wpm when given an invalid value', () => {
    const s1 = computeStats('word '.repeat(220));
    const s2 = computeStats('word '.repeat(220), { wordsPerMinute: 0 });
    expect(s2.readingTimeMinutes).toBe(s1.readingTimeMinutes);
  });

  test('charCount excludes whitespace', () => {
    const s = computeStats('  hello   world  ');
    expect(s.charCount).toBe(10); // "helloworld"
  });
});