import { describe, it, expect } from 'vitest';
import { toAsciiTable, applyAsciiTransform } from '@/lib/ascii-table';

describe('toAsciiTable', () => {
  it('renders a simple 2x2 table with aligned columns', () => {
    const out = toAsciiTable([
      ['Name', 'Age'],
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
    expect(out).toBe('| Name  | Age |\n| ----- | --- |\n| Alice | 30  |\n| Bob   | 25  |');
  });

  it('handles empty input', () => {
    expect(toAsciiTable([])).toBe('');
  });

  it('left-aligns non-numeric columns', () => {
    // With header 'Price' (starts with P, not digit), all columns are left-aligned.
    // Col 0 width = max(4,1,2) = 4 (from 'Item'); col 1 width = max(5,3,1) = 5 (from 'Price').
    const out = toAsciiTable([
      ['Item', 'Price'],
      ['X', '100'],
      ['YY', '7'],
    ]);
    expect(out).toContain('| X    | 100   |');
    expect(out).toContain('| YY   | 7     |');
  });

  it('right-aligns all columns when any header starts with a digit', () => {
    // Header '7' starts with a digit -> right-align all columns.
    // Col 0 width = max(4,1,2) = 4 (from 'Item'); col 1 width = max(1,3,2) = 3 (from '100').
    const out = toAsciiTable([
      ['Item', '7'],
      ['X', '100'],
      ['YY', '25'],
    ]);
    // Right-aligned: "X" padStart(4) -> "   X", "100" padStart(3) -> "100"
    expect(out).toContain('|    X | 100 |');
    // Right-aligned: "YY" padStart(4) -> "  YY", "25" padStart(3) -> " 25"
    expect(out).toContain('|   YY |  25 |');
 });
});

describe('applyAsciiTransform', () => {
  it('replaces markdown tables with fenced ASCII tables', () => {
    const md = 'Before\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n\nAfter';
    const out = applyAsciiTransform(md);
    expect(out).toContain('```\n| Name  | Age |');
    expect(out).toContain('| Alice | 30  |');
    expect(out).toContain('```');
    expect(out).toContain('Before');
    expect(out).toContain('After');
  });

  it('passes through markdown without tables unchanged', () => {
    const md = '# Hello\n\nNo tables here.';
    expect(applyAsciiTransform(md)).toBe(md);
  });
});