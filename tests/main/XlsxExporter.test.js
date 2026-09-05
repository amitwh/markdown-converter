/**
 * @jest-environment node
 *
 * XlsxExporter tests: verify the generated OOXML package structure by
 * reopening the buffer with JSZip and checking the key parts (workbook sheet
 * list, per-sheet cell XML, content types). Uses only string assertions —
 * no Excel engine needed.
 */
const JSZip = require('jszip');
const {
  buildXlsx,
  buildSheetXml,
  columnLetter,
  looksNumeric,
} = require('../../src/main/XlsxExporter');

describe('XlsxExporter', () => {
  describe('columnLetter', () => {
    it('maps 0-based indexes to Excel letters', () => {
      expect(columnLetter(0)).toBe('A');
      expect(columnLetter(25)).toBe('Z');
      expect(columnLetter(26)).toBe('AA');
      expect(columnLetter(27)).toBe('AB');
      expect(columnLetter(52)).toBe('BA');
    });
  });

  describe('looksNumeric', () => {
    it('accepts integers and decimals, rejects text and leading zeros', () => {
      expect(looksNumeric('42')).toBe(true);
      expect(looksNumeric('-3.14')).toBe(true);
      expect(looksNumeric('007')).toBe(false); // keeps identifier-looking values as text
      expect(looksNumeric('1,000')).toBe(false);
      expect(looksNumeric('abc')).toBe(false);
      expect(looksNumeric('')).toBe(false);
    });
  });

  describe('buildSheetXml', () => {
    it('emits inline strings and numeric cells with row/column refs', () => {
      const xml = buildSheetXml([
        ['Name', 'Score'],
        ['Ada', '99'],
      ]);
      expect(xml).toContain(
        '<c r="A1" t="inlineStr"><is><t xml:space="preserve">Name</t></is></c>'
      );
      expect(xml).toContain('<c r="B2" t="n"><v>99</v></c>');
      expect(xml).toContain('<row r="1">');
    });

    it('escapes XML-significant characters in cells', () => {
      const xml = buildSheetXml([['<b>&"quotes"</b>']]);
      expect(xml).toContain('&lt;b&gt;&amp;&quot;quotes&quot;&lt;/b&gt;');
      expect(xml).not.toContain('<b>');
    });
  });

  describe('buildXlsx', () => {
    it('creates a workbook with one sheet per table and all required parts', async () => {
      const buffer = await buildXlsx([
        [
          ['h1', 'h2'],
          ['a', '1'],
        ],
        [['only', 'column']],
      ]);

      const zip = await JSZip.loadAsync(buffer);
      const parts = Object.keys(zip.files).sort();
      expect(parts).toContain('[Content_Types].xml');
      expect(parts).toContain('_rels/.rels');
      expect(parts).toContain('xl/workbook.xml');
      expect(parts).toContain('xl/_rels/workbook.xml.rels');
      expect(parts).toContain('xl/styles.xml');
      expect(parts).toContain('xl/worksheets/sheet1.xml');
      expect(parts).toContain('xl/worksheets/sheet2.xml');

      const workbook = await zip.file('xl/workbook.xml').async('string');
      expect(workbook).toContain('name="Table 1"');
      expect(workbook).toContain('name="Table 2"');
      expect(workbook).toContain('r:id="rId2"');

      const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
      expect(rels).toContain('Target="worksheets/sheet1.xml"');
      expect(rels).toContain('Target="styles.xml"');

      const sheet1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
      expect(sheet1).toContain('inlineStr');
    });

    it('rejects empty table lists', async () => {
      await expect(buildXlsx([])).rejects.toThrow(/No tables/);
    });
  });
});
