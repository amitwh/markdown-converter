/**
 * Tests for WordTemplateExporter
 */

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
