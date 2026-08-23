/**
 * Tests for the LCS line diff used by the Document Compare dialog
 * Covers: identical texts, pure additions, pure deletions, mixed edits, empty sides
 */

const { computeLineDiff } = require('../src/utils/line-diff');

describe('computeLineDiff', () => {
  it('reports every line as unchanged for identical texts', () => {
    const text = '# Title\n\nSome paragraph.\n- item 1\n- item 2';
    const result = computeLineDiff(text, text);
    expect(result).toHaveLength(5);
    expect(result.every((entry) => entry.type === 'unchanged')).toBe(true);
    expect(result.map((entry) => entry.text)).toEqual([
      '# Title',
      '',
      'Some paragraph.',
      '- item 1',
      '- item 2',
    ]);
  });

  it('reports only additions when lines were appended', () => {
    const result = computeLineDiff('# Title\n\nBody.', '# Title\n\nBody.\nNew line.\nAnother.');
    expect(result.filter((entry) => entry.type === 'removed')).toEqual([]);
    expect(result).toEqual([
      { type: 'unchanged', text: '# Title' },
      { type: 'unchanged', text: '' },
      { type: 'unchanged', text: 'Body.' },
      { type: 'added', text: 'New line.' },
      { type: 'added', text: 'Another.' },
    ]);
  });

  it('reports only removals when lines were deleted', () => {
    const result = computeLineDiff('Intro\nKeep me\nDrop me\nAlso drop', 'Intro\nKeep me');
    expect(result.filter((entry) => entry.type === 'added')).toEqual([]);
    expect(result).toEqual([
      { type: 'unchanged', text: 'Intro' },
      { type: 'unchanged', text: 'Keep me' },
      { type: 'removed', text: 'Drop me' },
      { type: 'removed', text: 'Also drop' },
    ]);
  });

  it('reports adjacent removed-then-added entries for a mixed change', () => {
    const result = computeLineDiff(
      '# Heading\nold paragraph\ntrailer',
      '# Heading\nnew paragraph\ntrailer'
    );
    expect(result).toEqual([
      { type: 'unchanged', text: '# Heading' },
      { type: 'removed', text: 'old paragraph' },
      { type: 'added', text: 'new paragraph' },
      { type: 'unchanged', text: 'trailer' },
    ]);
  });

  it('treats an empty old text as a pure addition', () => {
    expect(computeLineDiff('', 'a\nb')).toEqual([
      { type: 'added', text: 'a' },
      { type: 'added', text: 'b' },
    ]);
  });

  it('treats an empty new text as a pure removal', () => {
    expect(computeLineDiff('a\nb', '')).toEqual([
      { type: 'removed', text: 'a' },
      { type: 'removed', text: 'b' },
    ]);
  });

  it('ignores carriage-return differences between the two texts', () => {
    const result = computeLineDiff('one\r\ntwo\r\n', 'one\ntwo\n');
    expect(result).toEqual([
      { type: 'unchanged', text: 'one' },
      { type: 'unchanged', text: 'two' },
    ]);
  });

  it('ignores a purely trailing-newline difference', () => {
    const result = computeLineDiff('a\nb\n', 'a\nb');
    expect(result).toEqual([
      { type: 'unchanged', text: 'a' },
      { type: 'unchanged', text: 'b' },
    ]);
  });
});
