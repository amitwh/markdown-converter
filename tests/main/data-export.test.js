/**
 * @jest-environment node
 */
const { toYamlDocument, toTomlDocument, yamlString, tomlString } = require('../../src/main/DataExport');

describe('DataExport — YAML', () => {
  test('round-trips a multi-line Markdown document as a literal block', () => {
    const out = toYamlDocument({ title: 'notes.md', content: '# Title\n\nBody text\n' });
    expect(out).toContain('title: "notes.md"');
    expect(out).toContain('content: |');
    expect(out).toContain('  # Title');
    expect(out).toContain('  Body text');
    expect(out.endsWith('\n')).toBe(true);
  });

  test('empty content becomes an empty string scalar', () => {
    expect(toYamlDocument({ title: 'x.md', content: '' })).toContain('content: ""');
  });

  test('escapes quotes and backslashes in the title', () => {
    expect(yamlString('a "b" \\ c')).toBe('"a \\"b\\" \\\\ c"');
  });

  test('normalizes CRLF line endings', () => {
    const out = toYamlDocument({ title: 'x', content: 'a\r\nb' });
    expect(out).not.toContain('\r');
  });
});

describe('DataExport — TOML', () => {
  test('emits a multi-line basic string that keeps the source intact', () => {
    const out = toTomlDocument({ title: 'notes.md', content: '# Title\n\nBody text\n' });
    expect(out).toContain('title = "notes.md"');
    expect(out).toContain('content = """');
    expect(out).toContain('# Title');
    expect(out.trimEnd().endsWith('"""')).toBe(true);
  });

  test('escapes backslashes and double quotes', () => {
    const out = toTomlDocument({ title: 'x', content: 'say "hi" \\ bye' });
    expect(out).toContain('say \\"hi\\" \\\\ bye');
  });

  test('empty content still produces a parsable empty string', () => {
    const out = toTomlDocument({ title: 'x', content: '' });
    expect(out).toContain('content = """\n"""');
  });

  test('tomlString escapes newlines inside single-line values', () => {
    expect(tomlString('a\nb')).toBe('"a\\nb"');
  });
});
