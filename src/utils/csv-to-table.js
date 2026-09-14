/**
 * CSV → markdown table converter.
 *
 * Smart-paste flavor: when the user pastes tab-separated text (Excel,
 * Sheets, Numbers copies) or CSV, convert to a markdown pipe-table.
 * Pure module — no IO, no DOM — so the renderer can require it directly
 * and main never has to touch the clipboard.
 *
 * Grammar (deliberately minimal):
 *   - Rows split on newlines (LF or CRLF)
 *   - Cells split on the configured delimiter (tab, comma, or semicolon)
 *   - Quoted fields per RFC 4180: "…" may contain the delimiter, "" is an
 *     escaped quote, multi-line quoted fields are supported
 *   - First row becomes the header (only when there are ≥2 rows; otherwise
 *     the single row is treated as data with no header)
 *
 * Alignment column is added per the longest cell in each column.
 *
 * @module csv-to-table
 */

/**
 * Detect the delimiter by sampling the first non-empty line.
 * Tabs win over commas when both are present (Excel/Sheets default).
 */
function detectDelimiter(text) {
  if (typeof text !== 'string' || text.length === 0) return ',';
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = {
    '\t': (firstLine.match(/\t/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
  };
  let best = ',';
  let bestCount = counts[','];
  for (const d of ['\t', ',', ';']) {
    if (counts[d] > bestCount) {
      best = d;
      bestCount = counts[d];
    }
  }
  return bestCount === 0 ? ',' : best;
}

/** Parse a CSV string into rows of cells. Handles RFC 4180 quoting. */
function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      cell = '';
      // Swallow the \n after \r
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Escape a cell so it can sit inside a markdown table cell. */
function escapeCell(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, '');
}

/** Detect alignment per column from the data. */
function alignmentFor(rows, colIdx) {
  const nonEmpty = rows.filter((r) => (r[colIdx] || '').trim() !== '');
  if (nonEmpty.length === 0) return '---';
  const numericish = nonEmpty.every((r) => {
    const v = (r[colIdx] || '').trim().replace(/^[-$€£¥+]/, '');
    return /^-?[\d,.]+%?$/.test(v);
  });
  // Numeric when:
  //  - every cell matches the numeric pattern AND
  //  - we have ≥ 2 non-empty rows OR ≥ 1 multi-character cell (a single
  //    "1" or "5" is too ambiguous — the column might really be labels)
  if (!numericish) return '---';
  const hasMultiChar = nonEmpty.some((r) => (r[colIdx] || '').length >= 2);
  if (nonEmpty.length >= 2 || hasMultiChar) return '---:';
  return '---';
}

/**
 * Convert CSV / TSV text to a markdown table.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.delimiter]   auto-detected when omitted
 * @param {boolean} [opts.firstRowIsHeader=true]
 * @returns {string} markdown table, or empty string when input has no rows
 */
function csvToTable(text, opts = {}) {
  if (typeof text !== 'string' || text.trim() === '') return '';
  const delimiter = opts.delimiter || detectDelimiter(text);
  const rows = parseRows(text, delimiter).filter((r) => !(r.length === 1 && r[0] === ''));
  if (rows.length === 0) return '';
  // Normalize column count
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  for (const r of rows) {
    while (r.length < colCount) r.push('');
  }
  const firstRowIsHeader = opts.firstRowIsHeader !== false && rows.length >= 2;

  let header, body;
  if (firstRowIsHeader) {
    header = rows[0];
    body = rows.slice(1);
  } else if (rows.length === 1) {
    // Single-row input: treat the row as the header and emit no body — a
    // table with one row of data and fabricated "Column N" labels would be
    // useless noise.
    header = rows[0];
    body = [];
  } else {
    header = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
    body = rows;
  }

  // Alignment comes from the DATA rows only; headers are text by convention.
  const dataForAlignment = firstRowIsHeader ? rows.slice(1) : rows;
  const alignments = [];
  for (let i = 0; i < colCount; i++) alignments.push(alignmentFor(dataForAlignment, i));

  const lines = [];
  lines.push('| ' + header.map(escapeCell).join(' | ') + ' |');
  lines.push('| ' + alignments.join(' | ') + ' |');
  for (let i = 0; i < body.length; i++) {
    lines.push('| ' + body[i].map(escapeCell).join(' | ') + ' |');
  }
  return lines.join('\n');
}

/** Heuristic: is this paste candidate a CSV/TSV? */
function looksLikeCsv(text) {
  if (typeof text !== 'string' || text.length < 4) return false;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return false;
  // Every non-empty line must have the same number of delimiters as the
  // first, allowing a ±1 slack for trailing empties.
  const delim = detectDelimiter(text);
  const counts = lines.slice(0, 5).map((l) => (l.match(new RegExp(escapeRegex(delim), 'g')) || []).length);
  const first = counts[0];
  if (first < 1) return false;
  return counts.every((c) => Math.abs(c - first) <= 1);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  detectDelimiter,
  parseRows,
  escapeCell,
  csvToTable,
  looksLikeCsv,
};