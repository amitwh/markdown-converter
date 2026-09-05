/**
 * @jest-environment node
 *
 * ExportThemes tests: LaTeX header generation (content + injection safety)
 * and DOCX styles.xml patching against a minimal pandoc-style fixture.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');
const {
  THEMES,
  getTheme,
  listThemes,
  buildLatexThemeHeader,
  applyDocxTheme,
} = require('../../src/main/ExportThemes');

// Minimal pandoc-like word/styles.xml: heading + hyperlink styles + docDefaults
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:rPr><w:b/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:rPr><w:b/></w:rPr>
  </w:style>
  <w:style w:type="character" w:styleId="Hyperlink">
    <w:name w:val="Hyperlink"/>
    <w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr>
  </w:style>
</w:styles>`;

function writeDocxFixture(filePath) {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
  );
  zip.file('word/styles.xml', STYLES_XML);
  zip.file('word/document.xml', '<w:document/>');
  fs.writeFileSync(filePath, zip.generate({ type: 'nodebuffer' }));
}

function readStyles(filePath) {
  return new PizZip(fs.readFileSync(filePath)).file('word/styles.xml').asText();
}

describe('ExportThemes', () => {
  describe('definitions', () => {
    it('lists themes with labels in a stable order, default first', () => {
      const list = listThemes();
      expect(list[0].id).toBe('default');
      expect(list.map((t) => t.id)).toEqual(Object.keys(THEMES));
      expect(list.every((t) => t.label && t.description)).toBe(true);
    });

    it('falls back to default for unknown ids', () => {
      expect(getTheme('nope').id).toBeUndefined(); // default theme has no id field
      expect(getTheme('nope').label).toBe('Default (Pandoc)');
      expect(getTheme('modern').label).toBe('Modern');
    });
  });

  describe('buildLatexThemeHeader', () => {
    it('returns null for the default theme', () => {
      expect(buildLatexThemeHeader('default')).toBeNull();
      expect(buildLatexThemeHeader('unknown-id')).toBeNull();
    });

    it('emits xcolor, heading color, and titlesec formatting', () => {
      const tex = buildLatexThemeHeader('modern');
      expect(tex).toContain('\\usepackage{xcolor}');
      // \definecolor{mcthemeheading}{HTML}{1E4FD8}
      expect(tex).toContain('\\definecolor{mcthemeheading}{HTML}{1E4FD8}');
      expect(tex).toContain('\\definecolor{mcthemelink}{HTML}{0E7490}');
      expect(tex).toContain('\\titleformat{\\section}');
      // modern = sans headings
      expect(tex).toContain('helvet');
    });

    it('omits section rules and helvet for themes that decline them', () => {
      const tex = buildLatexThemeHeader('minimal');
      expect(tex).not.toContain('helvet');
      expect(tex).not.toContain('titlerule');
    });

    it('only inlines hex literals (no user input reaches LaTeX)', () => {
      for (const id of Object.keys(THEMES)) {
        const tex = buildLatexThemeHeader(id);
        if (!tex) continue;
        // Every color is the {HTML}{HEXHEXHEX} literal form
        const colors = tex.match(/\{HTML\}\{([^}]*)\}/g) || [];
        expect(colors.length).toBeGreaterThan(0);
        for (const c of colors) {
          expect(c).toMatch(/^\{HTML\}\{[A-F0-9]{6}\}$/);
        }
      }
    });
  });

  describe('applyDocxTheme', () => {
    let tmpDir, docxPath;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme_'));
      docxPath = path.join(tmpDir, 'doc.docx');
      writeDocxFixture(docxPath);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });

    it('is a no-op returning false for the default theme', () => {
      expect(applyDocxTheme(docxPath, 'default')).toBe(false);
      expect(readStyles(docxPath)).toBe(STYLES_XML);
    });

    it('recolors headings, swaps heading font, and recolors hyperlinks', () => {
      const applied = applyDocxTheme(docxPath, 'modern');
      expect(applied).toBe(true);

      const xml = readStyles(docxPath);
      // Heading color + font injected
      expect(xml).toContain('<w:color w:val="1E4FD8"/>');
      expect(xml).toContain('w:ascii="Calibri"');
      // Heading2's old color is replaced, not duplicated
      expect(xml).not.toContain('2E74B5');
      const h1 = /w:styleId="Heading1"[\s\S]*?<\/w:style>/.exec(xml)[0];
      expect(h1.match(/<w:color/g)).toHaveLength(1);
      // Hyperlink recolored
      expect(xml).not.toContain('0563C1');
      expect(xml).toContain('<w:color w:val="0E7490"/>');
      // Body font lands in docDefaults
      expect(xml).toMatch(/<w:rPrDefault>\s*<w:rPr><w:rFonts w:ascii="Calibri"/);
    });

    it('preserves unrelated style content', () => {
      applyDocxTheme(docxPath, 'classic');
      const xml = readStyles(docxPath);
      expect(xml).toContain('<w:sz w:val="32"/>');
      expect(xml).toContain('<w:u w:val="single"/>');
      expect(xml).toContain('<w:outlineLvl w:val="0"/>');
    });

    it('tolerates styles.xml without an rPr block in a style', () => {
      // Title style in the fixture has rPr; craft one without it
      const bare = STYLES_XML.replace(
        /(<w:style w:type="paragraph" w:styleId="Title">\s*<w:name w:val="Title"\/>)\s*<w:rPr><w:b\/><\/w:rPr>/,
        '$1'
      );
      const zip = new PizZip();
      zip.file('[Content_Types].xml', '<Types/>');
      zip.file('word/styles.xml', bare);
      fs.writeFileSync(docxPath, zip.generate({ type: 'nodebuffer' }));

      expect(applyDocxTheme(docxPath, 'sepia')).toBe(true);
      const xml = readStyles(docxPath);
      const title = /w:styleId="Title"[\s\S]*?<\/w:style>/.exec(xml)[0];
      expect(title).toContain('<w:color w:val="7C4A21"/>');
    });

    it('returns false when styles.xml is missing', () => {
      const zip = new PizZip();
      zip.file('[Content_Types].xml', '<Types/>');
      fs.writeFileSync(docxPath, zip.generate({ type: 'nodebuffer' }));
      expect(applyDocxTheme(docxPath, 'modern')).toBe(false);
    });
  });
});
