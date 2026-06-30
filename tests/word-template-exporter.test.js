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
});
