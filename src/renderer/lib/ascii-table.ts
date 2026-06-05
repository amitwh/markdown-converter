/**
 * Convert a 2D string array to a fixed-width ASCII table with `| ... |` rows
 * and a `| --- |` separator.
 */
export function toAsciiTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const numCols = Math.max(...rows.map((r) => r.length));
  const widths: number[] = Array.from({ length: numCols }, (_, c) =>
    Math.max(...rows.map((r) => (r[c] ?? '').length))
  );
  const lines = rows.map((row) =>
    '| ' +
    Array.from({ length: numCols }, (_, c) => (row[c] ?? '').padEnd(widths[c])).join(' | ') +
    ' |'
  );
  // Insert separator after first row
  const sep =
    '| ' + Array.from({ length: numCols }, (_, c) => '-'.repeat(widths[c])).join(' | ') + ' |';
  return [lines[0], sep, ...lines.slice(1)].join('\n');
}

// Matches a markdown table block: header row, separator, ≥1 data row.
const TABLE_RE = /^\|.+\|\n^\|[\s:|-]+\|\n((?:^\|.+\|\n?)+)/gm;

/**
 * Replace all markdown tables in `source` with fenced code blocks containing
 * the ASCII-rendered equivalent. Non-table content is preserved verbatim.
 */
export function applyAsciiTransform(source: string): string {
  return source.replace(TABLE_RE, (block) => {
    const lines = block.trim().split('\n');
    const header = lines[0].slice(1, -1).split('|').map((s) => s.trim());
    const body = lines.slice(2).map((l) =>
      l.slice(1, -1).split('|').map((s) => s.trim())
    );
    return '```\n' + toAsciiTable([header, ...body]) + '\n```';
  });
}