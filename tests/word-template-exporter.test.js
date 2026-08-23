/**
 * Tests for WordTemplateExporter
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');
const WordTemplateExporter = require('../src/wordTemplateExporter');

describe('WordTemplateExporter.preprocessMarkdownForWordExport', () => {
  test('removes HTML style blocks', () => {
    const input = `<style>
<!-- sneh-a4-print v1 -->
@media print { body { font-size: 8pt; } }
</style>

# Heading
`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).not.toContain('<style');
    expect(output).not.toContain('</style>');
    expect(output).not.toContain('sneh-a4-print');
    expect(output).not.toContain('@media print');
    expect(output).toContain('# Heading');
  });

  test('removes HTML comments outside style blocks', () => {
    const input = `<!-- comment -->
Hello world
`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).not.toContain('<!--');
    expect(output).not.toContain('-->');
    expect(output).toContain('Hello world');
  });

  test('removes alignment div tags', () => {
    const input = `<div align="center">
Centered content
</div>
`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).not.toContain('<div align="center">');
    expect(output).not.toContain('</div>');
    expect(output).toContain('Centered content');
  });

  test('preserves regular markdown content', () => {
    const input = `# Title

| A | B |
|---|---|
| 1 | 2 |
`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).toBe(input);
  });

  test('handles content with no HTML artifacts', () => {
    const input = 'Plain text paragraph.';
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).toBe(input);
  });

  test('preserves HTML artifacts inside fenced code blocks', () => {
    const input = `# Title

\`\`\`
<style>body{}</style>
<!-- comment -->
<div align="center">text</div>
\`\`\`

After code.
`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).toContain('<style>body{}</style>');
    expect(output).toContain('<!-- comment -->');
    expect(output).toContain('<div align="center">text</div>');
    expect(output).toContain('After code.');
  });

  test('preserves HTML artifacts inside inline code', () => {
    const input = 'Use `<div align="center">` for alignment.';
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).toContain('`<div align="center">`');
  });

  test('handles uppercase tags and unquoted attributes', () => {
    const input = `<DIV align=center>
Centered
</DIV>
`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).not.toContain('<DIV');
    expect(output).not.toContain('</DIV>');
    expect(output).toContain('Centered');
  });

  test('handles single-quoted attributes', () => {
    const input = `<div align='right'>Right</div>`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).not.toContain('<div');
    expect(output).not.toContain('</div>');
    expect(output).toContain('Right');
  });

  test('removes non-alignment div tags without leaving malformed HTML', () => {
    const input = `<div class="note">Note text</div>`;
    const output = WordTemplateExporter.preprocessMarkdownForWordExport(input);
    expect(output).not.toContain('<div');
    expect(output).not.toContain('</div>');
    expect(output).toContain('Note text');
  });

  test('returns non-string input unchanged', () => {
    expect(WordTemplateExporter.preprocessMarkdownForWordExport(null)).toBeNull();
    expect(WordTemplateExporter.preprocessMarkdownForWordExport(123)).toBe(123);
  });
});

describe('WordTemplateExporter.hasTemplateFile', () => {
  test('is false when no path is given and the bundled default template is absent', () => {
    // word_template.docx was removed from the repo (see git history); this
    // asserts the current, real state of the repo rather than assuming a
    // file that may or may not exist.
    const exporter = new WordTemplateExporter(null);
    const defaultExists = fs.existsSync(WordTemplateExporter.getDefaultTemplatePath());
    expect(exporter.hasTemplateFile()).toBe(defaultExists);
  });

  test('is false for a path that does not exist on disk', () => {
    const exporter = new WordTemplateExporter('/definitely/not/a/real/path/template.docx');
    expect(exporter.hasTemplateFile()).toBe(false);
  });

  test('is true for a path that does exist on disk', () => {
    const tmpFile = path.join(os.tmpdir(), `wt-exists-${Date.now()}.docx`);
    fs.writeFileSync(tmpFile, 'not a real docx, existence is all that matters here');
    try {
      const exporter = new WordTemplateExporter(tmpFile);
      expect(exporter.hasTemplateFile()).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });
});

describe('WordTemplateExporter.convert — graceful fallback with no template file', () => {
  let outputPath;

  afterEach(() => {
    if (outputPath && fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
    outputPath = null;
  });

  test('does not throw ENOENT and produces a readable DOCX when the template path is missing', async () => {
    outputPath = path.join(os.tmpdir(), `wt-fallback-${Date.now()}.docx`);
    const exporter = new WordTemplateExporter('/definitely/not/a/real/path/template.docx', 3, null);

    await expect(exporter.convert('# Title\n\nSome paragraph text.', outputPath)).resolves.toBe(
      outputPath
    );

    expect(fs.existsSync(outputPath)).toBe(true);

    // The generated file must be a well-formed DOCX (zip) with the parts
    // Word requires, containing the markdown content.
    const zip = new PizZip(fs.readFileSync(outputPath));
    expect(zip.file('word/document.xml')).not.toBeNull();
    expect(zip.file('word/styles.xml')).not.toBeNull();
    expect(zip.file('word/numbering.xml')).not.toBeNull();

    const documentXml = zip.file('word/document.xml').asText();
    expect(documentXml).toContain('Title');
    expect(documentXml).toContain('Some paragraph text.');
    expect(documentXml).toContain('Heading1');
  });

  test('also degrades gracefully when templatePath is null and the default template is absent', async () => {
    outputPath = path.join(os.tmpdir(), `wt-fallback-null-${Date.now()}.docx`);
    const exporter = new WordTemplateExporter(null, 3, null);

    if (exporter.hasTemplateFile()) {
      // Environment happens to have a real default template on disk —
      // this test only asserts the fallback path, so skip in that case.
      return;
    }

    await expect(exporter.convert('Plain content.', outputPath)).resolves.toBe(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
  });

  test('honors pageSettings (landscape) in the generated default document', async () => {
    outputPath = path.join(os.tmpdir(), `wt-fallback-landscape-${Date.now()}.docx`);
    const exporter = new WordTemplateExporter('/definitely/not/a/real/path/template.docx', 3, {
      size: 'a4',
      orientation: 'landscape',
    });

    await exporter.convert('Landscape content.', outputPath);

    const zip = new PizZip(fs.readFileSync(outputPath));
    const documentXml = zip.file('word/document.xml').asText();
    expect(documentXml).toContain('w:orient="landscape"');
    // A4 landscape swaps width/height relative to portrait (11906x16838).
    expect(documentXml).toContain('w:w="16838"');
    expect(documentXml).toContain('w:h="11906"');
  });

  test('still uses the real template file when one exists on disk (regression check)', async () => {
    // Build a tiny but valid docx fixture (using the same generator used
    // for the no-template fallback) to stand in for a "real" template, so
    // this test does not depend on any bundled fixture file existing.
    const templatePath = path.join(os.tmpdir(), `wt-fixture-template-${Date.now()}.docx`);
    const fixtureExporter = new WordTemplateExporter('/no/such/file.docx');
    const fixtureZip = fixtureExporter.buildDefaultDocumentZip(
      '<w:p><w:r><w:t>COVER</w:t></w:r></w:p>'
    );
    fs.writeFileSync(templatePath, fixtureZip.generate({ type: 'nodebuffer' }));

    outputPath = path.join(os.tmpdir(), `wt-with-template-${Date.now()}.docx`);
    try {
      const exporter = new WordTemplateExporter(templatePath, 3, null);
      expect(exporter.hasTemplateFile()).toBe(true);

      await exporter.convert('Body content.', outputPath);

      const zip = new PizZip(fs.readFileSync(outputPath));
      const documentXml = zip.file('word/document.xml').asText();
      // Content from the "template" (cover) and the new export both present.
      expect(documentXml).toContain('COVER');
      expect(documentXml).toContain('Body content.');
    } finally {
      fs.unlinkSync(templatePath);
    }
  });
});
