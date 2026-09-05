/**
 * Minimal XLSX (Office Open XML spreadsheet) writer for markdown table export.
 *
 * Builds a valid multi-sheet workbook entirely in-memory with JSZip — no
 * spreadsheet library needed. Each markdown table becomes one sheet ("Table 1",
 * "Table 2", …) using inlineStr cells (no sharedStrings part), and cells that
 * look numeric are emitted as real numbers so Excel can compute on them.
 *
 * Structure of the produced package:
 *   [Content_Types].xml
 *   _rels/.rels                        → points at xl/workbook.xml
 *   xl/workbook.xml                    → sheet list
 *   xl/_rels/workbook.xml.rels         → sheet relationship ids
 *   xl/styles.xml                      → minimal valid styles part
 *   xl/worksheets/sheet<N>.xml         → one per table
 *
 * @module XlsxExporter
 */

const JSZip = require('jszip');

/** Excel column letter for a 0-based column index (0→A, 25→Z, 26→AA…). */
function columnLetter(index) {
  let letters = '';
  let n = index;
  while (n >= 0) {
    letters = String.fromCharCode((n % 26) + 65) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

/** Escape text for XML content/attributes. */
function escapeXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Plain integers/decimals become numeric cells (preserves leading zeros as text). */
function looksNumeric(value) {
  return /^-?\d+(\.\d+)?$/.test(value) && !/^0\d/.test(value);
}

/**
 * Build one sheet's XML from a table (array of rows of strings).
 * The first row is emitted as a regular row — headers stay text so sorting
 * and filters behave predictably.
 */
function buildSheetXml(table) {
  const rows = table
    .map((row, rowIndex) => {
      const cells = row
        .map((cell, colIndex) => {
          const ref = `${columnLetter(colIndex)}${rowIndex + 1}`;
          if (looksNumeric(cell)) {
            return `<c r="${ref}" t="n"><v>${cell}</v></c>`;
          }
          // xml:space="preserve" keeps leading/trailing spaces users wrote
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  );
}

/**
 * Assemble an XLSX workbook buffer from extracted markdown tables.
 *
 * @param {Array<string[][]>} tables Tables as rows of cell strings
 * @returns {Promise<Buffer>} .xlsx file contents
 */
async function buildXlsx(tables) {
  if (!Array.isArray(tables) || tables.length === 0) {
    throw new Error('No tables to export');
  }

  const zip = new JSZip();

  // Sheet names: "Table 1"… — Excel caps names at 31 chars (ours are short)
  const sheetNames = tables.map((_, i) => `Table ${i + 1}`);

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      tables
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
        .join('') +
      '</Types>'
  );

  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  );

  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' +
      sheetNames
        .map(
          (name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
        )
        .join('') +
      '</sheets></workbook>'
  );

  // Relationship ids rId1..rIdN map to sheets; styles get the next free id
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      tables
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join('') +
      `<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>'
  );

  // Minimal styles part: Excel accepts workbooks without styling, but some
  // viewers are picky, so ship the empty default.
  zip.file(
    'xl/styles.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
      '<cellXfs count="1"><xf xfId="0"/></cellXfs>' +
      '</styleSheet>'
  );

  tables.forEach((table, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, buildSheetXml(table));
  });

  // JSZip 3.x: generateAsync is the API (generate() was removed)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { buildXlsx, buildSheetXml, columnLetter, looksNumeric };
