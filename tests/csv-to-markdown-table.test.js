/**
 * Tests for the CSV-to-markdown-table converter
 * Covers: simple CSV, quoted fields containing commas, ragged rows, empty input
 */

const { csvToMarkdownTable } = require('../src/utils/csv-to-markdown-table');

describe('csvToMarkdownTable', () => {
  it('converts simple CSV into a header, separator, and data rows', () => {
    const csv = 'Name,Role,Team\nAlice,Engineer,Platform\nBob,Designer,Brand';
    expect(csvToMarkdownTable(csv)).toBe(
      '| Name | Role | Team |\n' +
        '|---|---|---|\n' +
        '| Alice | Engineer | Platform |\n' +
        '| Bob | Designer | Brand |'
    );
  });

  it('keeps quoted fields containing commas as single cells', () => {
    const csv = 'Person,Role\n"Smith, John",Engineer\n"Alice ""AJ"" Jones","Dev, Ops"';
    expect(csvToMarkdownTable(csv)).toBe(
      '| Person | Role |\n' +
        '|---|---|\n' +
        '| Smith, John | Engineer |\n' +
        '| Alice "AJ" Jones | Dev, Ops |'
    );
  });

  it('pads ragged rows with empty cells up to the widest row', () => {
    const csv = 'Name,Age,City\nAlice,30\nBob,25,NYC';
    expect(csvToMarkdownTable(csv)).toBe(
      '| Name | Age | City |\n' + '|---|---|---|\n' + '| Alice | 30 |  |\n' + '| Bob | 25 | NYC |'
    );
  });

  it('pads the header too when a data row is wider', () => {
    const csv = 'Name\nAlice,30';
    expect(csvToMarkdownTable(csv)).toBe('| Name |  |\n|---|---|\n| Alice | 30 |');
  });

  it('returns an empty string for empty or whitespace-only input', () => {
    expect(csvToMarkdownTable('')).toBe('');
    expect(csvToMarkdownTable('   \n  \n\t')).toBe('');
  });

  it('returns an empty string for non-string input', () => {
    expect(csvToMarkdownTable(null)).toBe('');
    expect(csvToMarkdownTable(undefined)).toBe('');
  });

  it('skips blank lines between rows and handles CRLF line endings', () => {
    const csv = 'Name,Age\r\n\r\nAlice,30\r\n';
    expect(csvToMarkdownTable(csv)).toBe('| Name | Age |\n|---|---|\n| Alice | 30 |');
  });

  it('escapes pipes inside cells so the table stays valid', () => {
    expect(csvToMarkdownTable('a|b,c')).toBe('| a\\|b | c |\n|---|---|');
  });

  it('renders a header-only table when the CSV has a single row', () => {
    expect(csvToMarkdownTable('a,b,c')).toBe('| a | b | c |\n|---|---|---|');
  });
});
