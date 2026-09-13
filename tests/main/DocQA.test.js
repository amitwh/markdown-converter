/**
 * @jest-environment node
 *
 * DocQA tests — pure module, no IO. Verifies the question→chunks pipeline.
 */
const DocQA = require('../../src/main/DocQA');

describe('DocQA.cleanQuestion', () => {
  test('strips question words but keeps substantive terms', () => {
    expect(DocQA.cleanQuestion('what did I write about rust async')).toBe('rust async');
    expect(DocQA.cleanQuestion('how do I configure pandoc')).toBe('configure pandoc');
  });

  test('keeps #tags and @wikilinks intact', () => {
    expect(DocQA.cleanQuestion('what is #rust about?')).toContain('#rust');
    expect(DocQA.cleanQuestion('tell me about @project-x')).toContain('@project-x');
  });

  test('keeps "quoted phrases" intact', () => {
    const out = DocQA.cleanQuestion('what does "rust async" mean?');
    expect(out).toContain('"rust async"');
  });

  test('returns empty string for non-string input', () => {
    expect(DocQA.cleanQuestion(null)).toBe('');
    expect(DocQA.cleanQuestion(undefined)).toBe('');
    expect(DocQA.cleanQuestion(42)).toBe('');
  });

  test('returns empty string when only question words remain', () => {
    expect(DocQA.cleanQuestion('what is this?')).toBe('');
  });
});

describe('DocQA.chunkDocument', () => {
  test('returns [] for empty / non-string input', () => {
    expect(DocQA.chunkDocument('')).toEqual([]);
    expect(DocQA.chunkDocument(null)).toEqual([]);
  });

  test('returns one chunk for a short document', () => {
    const chunks = DocQA.chunkDocument('hello world');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('hello world');
  });

  test('respects paragraph breaks', () => {
    const content = 'para one.\n\npara two.\n\npara three.';
    const chunks = DocQA.chunkDocument(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].text).toContain('para one');
  });

  test('splits long content into multiple chunks', () => {
    const big = 'x'.repeat(2500);
    const chunks = DocQA.chunkDocument(big, 800);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should be ≤ 800 chars (except possibly the last)
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].text.length).toBeLessThanOrEqual(800);
    }
  });
});

describe('DocQA.ask', () => {
  const files = [
    {
      path: '/notes/rust.md',
      content:
        'Rust is a systems language.\n\nAsync in Rust uses tokio for runtime.\n\nBorrow checker enforces memory safety.',
    },
    {
      path: '/notes/pandoc.md',
      content: 'Pandoc is a document converter.\n\nConfiguration uses YAML metadata blocks.',
    },
    {
      path: '/notes/old.md',
      content: 'Old notes from years ago.',
    },
  ];

  test('returns empty chunks for a question with no substantive terms', () => {
    const r = DocQA.ask({ question: 'what is this?', files });
    expect(r.chunks).toEqual([]);
  });

  test('returns empty chunks when no files match', () => {
    const r = DocQA.ask({ question: 'quantum entanglement', files });
    expect(r.chunks).toEqual([]);
  });

  test('returns relevant chunks for a substantive question', () => {
    const r = DocQA.ask({ question: 'how does rust async work', files, topK: 3 });
    expect(r.chunks.length).toBeGreaterThan(0);
    // The first hit should be from rust.md (highest relevance)
    expect(r.chunks[0].filePath).toBe('/notes/rust.md');
    expect(r.chunks[0].snippet).toMatch(/rust|async|tokio/i);
    expect(r.chunks[0].score).toBeGreaterThan(0);
  });

  test('honors topK', () => {
    const r = DocQA.ask({ question: 'rust', files, topK: 2 });
    expect(r.chunks.length).toBeLessThanOrEqual(2);
  });

  test('includes the original question in the response', () => {
    const r = DocQA.ask({ question: 'how do I configure pandoc', files });
    expect(r.question).toBe('how do I configure pandoc');
  });

  test('handles missing or empty file list gracefully', () => {
    const r = DocQA.ask({ question: 'rust', files: [] });
    expect(r.chunks).toEqual([]);

    const r2 = DocQA.ask({ question: 'rust', files: null });
    expect(r2.chunks).toEqual([]);
  });

  test('rank prefers recent edits when scores tie (recency nudge)', () => {
    const now = Date.now();
    const filesWithMtime = [
      {
        path: '/fresh.md',
        content: 'rust language overview',
        mtimeMs: now - 1 * 24 * 60 * 60 * 1000, // 1 day ago
      },
      {
        path: '/stale.md',
        content: 'rust language overview (same text)',
        mtimeMs: now - 60 * 24 * 60 * 60 * 1000, // 60 days ago
      },
    ];
    const r = DocQA.ask({ question: 'rust overview', files: filesWithMtime, topK: 5 });
    expect(r.chunks[0].filePath).toBe('/fresh.md');
  });
});
