/**
 * CSV-to-markdown-table converter
 * Pure client-side conversion for the editor toolbar action — no Pandoc round-trip.
 * Parses basic CSV: comma-separated fields, optional double-quote wrapping that may
 * contain commas (with "" as an escaped quote), ragged rows padded with empty cells.
 */

/**
 * Parse a single CSV line into field values.
 * @param {string} line - One CSV line (no line breaks).
 * @returns {string[]} Field values for the line.
 */
function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Convert CSV text into a GitHub-flavored markdown table.
 * The first non-empty line becomes the header row; ragged rows are padded with
 * empty cells; pipes inside cells are escaped so the table stays valid.
 * @param {string} csvText - Raw CSV text.
 * @returns {string} Markdown table, or '' when there is nothing to convert.
 */
function csvToMarkdownTable(csvText) {
  if (typeof csvText !== 'string' || csvText.trim().length === 0) return '';

  const rows = csvText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => parseCsvLine(line));
  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map((row) => row.length));
  const paddedRows = rows.map((row) => {
    const cells = row.map((cell) => cell.trim().replace(/\|/g, '\\|'));
    while (cells.length < columnCount) cells.push('');
    return cells;
  });

  const formatRow = (cells) => `| ${cells.join(' | ')} |`;
  const separator = `|${'---|'.repeat(columnCount)}`;

  const [header, ...dataRows] = paddedRows;
  return [formatRow(header), separator, ...dataRows.map(formatRow)].join('\n');
}

module.exports = { csvToMarkdownTable, parseCsvLine };
