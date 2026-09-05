/**
 * @jest-environment node
 *
 * OdtStyling.js tests: page-size patching and header/footer injection into a
 * Pandoc-style ODT package. Fixtures are minimal zips built with PizZip,
 * mirroring the structure Pandoc's ODT writer emits (styles.xml with a "pm1"
 * page layout and a "Standard" master page).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');
const {
  setOdtPageSize,
  addHeaderFooterToOdt,
  parseDimensionsMm,
  escapeOdtText,
} = require('../../src/main/OdtStyling');

// Minimal Pandoc-like styles.xml: page layout pm1 + Standard master page
const STYLES_XML = `<?xml version="1.0" encoding="utf-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:version="1.2">
 <office:automatic-styles>
  <style:page-layout style:name="pm1">
   <style:page-layout-properties fo:margin-top="0.787in" fo:page-width="8.267in" fo:page-height="11.69in" style:print-orientation="portrait"/>
  </style:page-layout>
 </office:automatic-styles>
 <office:master-styles>
  <style:master-page style:name="Standard" style:page-layout-name="pm1"/>
 </office:master-styles>
</office:document-styles>`;

/**
 * Write a minimal .odt fixture containing just styles.xml.
 * @param {string} filePath destination
 * @param {string} [stylesXml] styles.xml content (defaults to STYLES_XML)
 */
function writeOdtFixture(filePath, stylesXml = STYLES_XML) {
  const zip = new PizZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zip.file('styles.xml', stylesXml);
  zip.file('content.xml', '<office:document-content/>');
  fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }));
}

/** Read styles.xml back out of a written fixture. */
function readStylesXml(filePath) {
  return new PizZip(fs.readFileSync(filePath)).file('styles.xml').asText();
}

describe('OdtStyling', () => {
  let tmpDir, odtPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odtstyle_'));
    odtPath = path.join(tmpDir, 'doc.odt');
    writeOdtFixture(odtPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseDimensionsMm', () => {
    it('parses "210×297mm" (U+00D7 separator) into numbers', () => {
      expect(parseDimensionsMm('210×297mm')).toEqual({ widthMm: 210, heightMm: 297 });
    });

    it('returns null for unparseable input', () => {
      expect(parseDimensionsMm('8.5in')).toBeNull();
      expect(parseDimensionsMm(undefined)).toBeNull();
    });
  });

  describe('escapeOdtText', () => {
    it('escapes XML-significant characters', () => {
      expect(escapeOdtText('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
    });
  });

  describe('setOdtPageSize', () => {
    it('rewrites width/height/orientation on the existing page layout (A4 portrait)', async () => {
      await setOdtPageSize(odtPath, {
        size: 'a4',
        orientation: 'portrait',
        pageSizes: { a4: { dimensions: '210×297mm' } },
      });

      const xml = readStylesXml(odtPath);
      expect(xml).toContain('fo:page-width="210mm"');
      expect(xml).toContain('fo:page-height="297mm"');
      expect(xml).toContain('style:print-orientation="portrait"');
      // Old inch-based attributes must be gone (no duplicate size attrs)
      expect(xml).not.toContain('fo:page-width="8.267in"');
    });

    it('swaps dimensions for landscape', async () => {
      await setOdtPageSize(odtPath, {
        size: 'a4',
        orientation: 'landscape',
        pageSizes: { a4: { dimensions: '210×297mm' } },
      });

      const xml = readStylesXml(odtPath);
      expect(xml).toContain('fo:page-width="297mm"');
      expect(xml).toContain('fo:page-height="210mm"');
      expect(xml).toContain('style:print-orientation="landscape"');
    });

    it('falls back to custom mm dimensions and A4 default', async () => {
      await setOdtPageSize(odtPath, { customWidth: '148', customHeight: '210' });
      expect(readStylesXml(odtPath)).toContain('fo:page-width="148mm"');

      writeOdtFixture(odtPath);
      await setOdtPageSize(odtPath, {});
      expect(readStylesXml(odtPath)).toContain('fo:page-width="210mm"');
    });
  });

  describe('addHeaderFooterToOdt', () => {
    it('is a no-op when disabled', async () => {
      await addHeaderFooterToOdt(odtPath, { enabled: false, header: { left: 'X' } });
      expect(readStylesXml(odtPath)).not.toContain('<style:header');
    });

    it('injects header and footer regions into the Standard master page', async () => {
      await addHeaderFooterToOdt(odtPath, {
        enabled: true,
        header: { left: 'My Doc', right: 'Draft <v2>' },
        footer: { center: 'Page $PAGE$ of $TOTAL$' },
      });

      const xml = readStylesXml(odtPath);
      expect(xml).toContain('<style:header>');
      expect(xml).toContain('<style:region-left');
      expect(xml).toContain('My Doc');
      // User text must be XML-escaped
      expect(xml).toContain('Draft &lt;v2&gt;');
      expect(xml).toContain('<text:page-number>');
      expect(xml).toContain('<text:page-count>');
      // The self-closing master page must have been expanded to hold children
      expect(xml).toMatch(/<style:master-page[^>]*>[\s\S]*<\/style:master-page>/);
    });

    it('does nothing when all regions are empty', async () => {
      await addHeaderFooterToOdt(odtPath, {
        enabled: true,
        header: { left: '', center: '', right: '' },
        footer: {},
      });
      expect(readStylesXml(odtPath)).toBe(STYLES_XML);
    });

    it('creates a master page when the package has none', async () => {
      const bareXml = STYLES_XML.replace(
        / <office:master-styles>[\s\S]*<\/office:master-styles>/,
        ''
      );
      writeOdtFixture(odtPath, bareXml);

      await addHeaderFooterToOdt(odtPath, {
        enabled: true,
        footer: { center: 'hi' },
      });

      const xml = readStylesXml(odtPath);
      expect(xml).toContain('<office:master-styles>');
      expect(xml).toContain('style:name="Standard"');
      expect(xml).toContain('hi');
    });

    it('replaces existing header/footer content on re-export', async () => {
      await addHeaderFooterToOdt(odtPath, { enabled: true, header: { left: 'first' } });
      await addHeaderFooterToOdt(odtPath, { enabled: true, header: { left: 'second' } });

      const xml = readStylesXml(odtPath);
      expect(xml).toContain('second');
      expect(xml).not.toContain('first');
      // Exactly one header element, not nested duplicates
      expect(xml.match(/<style:header>/g)).toHaveLength(1);
    });
  });
});
