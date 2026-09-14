/**
 * @jest-environment node
 *
 * csv-to-table tests — pure module.
 */
const { detectDelimiter, csvToTable, looksLikeCsv, parseRows, escapeCell } = require('../src/utils/csv-to-table');

describe('detectDelimiter', () => {
  test('prefers tabs over commas when both are present', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  test('falls back to commas', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
  });

  test('uses semicolons when commas are absent', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
  });

  test('returns comma for empty / non-string input', () => {
    expect(detectDelimiter('')).toBe(',');
    expect(detectDelimiter(null)).toBe(',');
  });
});

describe('parseRows (RFC 4180 quoting)', () => {
  test('parses simple comma-separated rows', () => {
    expect(parseRows('a,b,c\n1,2,3', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  test('handles quoted fields with embedded delimiter', () => {
    expect(parseRows('"a, b",c', ',')).toEqual([['a, b', 'c']]);
  });

  test('handles escaped double-quotes inside quoted fields', () => {
    expect(parseRows('"he said ""hi""",ok', ',')).toEqual([['he said "hi"', 'ok']]);
  });

  test('handles CRLF line endings', () => {
    expect(parseRows('a,b\r\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('handles multi-line quoted fields', () => {
    expect(parseRows('"line1\nline2",x', ',')).toEqual([['line1\nline2', 'x']]);
  });
});

describe('escapeCell', () => {
  test('escapes pipes (table syntax)', () => {
    expect(escapeCell('a | b')).toBe('a \\| b');
  });

  test('escapes backslashes first', () => {
    expect(escapeCell('a\\b')).toBe('a\\\\b');
    expect(escapeCell('a\\|b')).toBe('a\\\\\\|b');
  });

  test('strips newlines (cells must be one logical line)', () => {
    expect(escapeCell('a\nb')).toBe('ab');
    expect(escapeCell('a\r\nb')).toBe('ab');
    // Tabs survive — they don't break markdown tables and may carry intent.
    expect(escapeCell('a\tb')).toBe('a\tb');
  });

  test('handles null / undefined / numbers', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
    expect(escapeCell(42)).toBe('42');
  });
});

describe('csvToTable — basic', () => {
  test('converts simple CSV with first row as header', () => {
    const md = csvToTable('name,age\nAlice,30\nBob,25');
    // age column has 2 numeric values (30, 25) → right-aligned
    expect(md).toBe('| name | age |\n| --- | ---: |\n| Alice | 30 |\n| Bob | 25 |');
  });

  test('handles a single row (no header)', () => {
    const md = csvToTable('just,one,row');
    expect(md).toBe('| just | one | row |\n| --- | --- | --- |');
  });

  test('TSV (Excel/Sheets paste)', () => {
    const md = csvToTable('a\tb\tc\n1\t2\t3');
    expect(md).toBe('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |');
  });

  test('returns empty string for empty / whitespace-only input', () => {
    expect(csvToTable('')).toBe('');
    expect(csvToTable('   \n   ')).toBe('');
  });
});

describe('csvToTable — alignment', () => {
  test('right-aligns numeric columns', () => {
    const md = csvToTable('name,count\nalpha,5\nbeta,12');
    expect(md).toContain('| name | count |');
    expect(md).toContain('| --- | ---: |');
  });

  test('keeps left alignment for text columns', () => {
    const md = csvToTable('name,city\nAlice,Paris');
    expect(md).toContain('| --- | --- |');
  });

  test('recognizes currency-formatted numbers as numeric', () => {
    const md = csvToTable('item,price\napple,$1.50\npear,2.30');
    expect(md).toContain('| --- | ---: |');
  });

  test('recognizes percentages', () => {
    const md = csvToTable('metric,rate\nuptime,99.5%');
    expect(md).toContain('| --- | ---: |');
  });
});

describe('csvToTable — escaping', () => {
  test('escapes pipes inside cells', () => {
    const md = csvToTable('a,b\nfoo|bar,baz');
    expect(md).toContain('| foo\\|bar | baz |');
  });

  test('escapes newlines inside cells', () => {
    const md = csvToTable('a,b\n"line1\nline2",x');
    expect(md).toContain('| line1line2 | x |');
  });
});

describe('csvToTable — ragged rows', () => {
  test('pads short rows with empty cells so the table stays rectangular', () => {
    const md = csvToTable('a,b,c\n1,2');
    const dataLines = md.split('\n').slice(2); // skip header + sep
    expect(dataLines[0]).toBe('| 1 | 2 |  |');
  });
});

describe('looksLikeCsv', () => {
  test('returns true for a tab-separated multi-row paste', () => {
    expect(looksLikeCsv('a\tb\tc\n1\t2\t3')).toBe(true);
  });

  test('returns true for a comma-separated multi-row paste', () => {
    expect(looksLikeCsv('a,b,c\n1,2,3')).toBe(true);
  });

  test('returns false for a single row', () => {
    expect(looksLikeCsv('a,b,c')).toBe(false);
  });

  test('returns false when the column counts don\'t line up at all', () => {
    expect(looksLikeCsv('a,b,c\n1\n2,3,4,5')).toBe(false);
  });

  test('returns false for very short / empty input', () => {
    expect(looksLikeCsv('')).toBe(false);
    expect(looksLikeCsv('ab')).toBe(false);
    expect(looksLikeCsv(null)).toBe(false);
  });

  test('returns false for prose (no delimiter)', () => {
    expect(looksLikeCsv('The quick brown fox jumps over the lazy dog.\nThe cat sat on the mat.')).toBe(false);
  });
});