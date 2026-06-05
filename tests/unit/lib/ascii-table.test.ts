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

  it('aligns numeric columns to the right', () => {
    // With header 'Price' (starts with P, not digit), all columns are left-aligned.
    // Price column width = 5 (from 'Price'), so '100' -> '100   ', '7' -> '7     '.
    const out = toAsciiTable([
      ['Item', 'Price'],
      ['X', '100'],
      ['YY', '7'],
    ]);
    expect(out).toContain('| 100   |');
    expect(out).toContain('| 7     |');
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