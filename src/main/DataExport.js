/**
 * Document → YAML / TOML serializers for the Export menu.
 *
 * Pandoc has no YAML or TOML writer, so these formats used to write the raw
 * Markdown bytes into a `.yaml`/`.toml` file — a file that no YAML or TOML
 * parser could read. These helpers produce genuinely valid documents that
 * carry the source Markdown verbatim:
 *
 *   title: "notes.md"
 *   content: |
 *     # Heading
 *     Body text
 *
 * Pure module (no fs/Electron) so it can be unit-tested directly.
 *
 * @module DataExport
 */
'use strict';

/** Escape a scalar for a YAML double-quoted string. */
function yamlString(value) {
  return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escape a scalar for a TOML basic string. */
function tomlString(value) {
  return `"${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n?/g, '\\n')
    .replace(/\n/g, '\\n')}"`;
}

/**
 * Serialize a document as valid YAML: metadata keys plus the Markdown source
 * as a literal block scalar.
 * @param {{title?: string, content?: string}} doc
 * @returns {string}
 */
function toYamlDocument({ title = '', content = '' } = {}) {
  const source = String(content ?? '');
  const header = `# Exported by MarkdownConverter\ntitle: ${yamlString(title)}`;
  if (!source.length) return `${header}\ncontent: ""\n`;
  const body = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.length ? `  ${line}` : ''))
    .join('\n');
  return `${header}\ncontent: |\n${body}${body.endsWith('\n') ? '' : '\n'}`;
}

/**
 * Serialize a document as valid TOML: a `title` key and the Markdown source as
 * a multi-line basic string.
 * @param {{title?: string, content?: string}} doc
 * @returns {string}
 */
function toTomlDocument({ title = '', content = '' } = {}) {
  const source = String(content ?? '')
    .replace(/\r\n?/g, '\n')
    // A multi-line basic string ends at `"""`; escaping every quote keeps the
    // content parseable without altering it.
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  return `# Exported by MarkdownConverter\ntitle = ${tomlString(title)}\ncontent = """\n${source}${
    source.endsWith('\n') || !source.length ? '' : '\n'
  }"""\n`;
}

module.exports = { toYamlDocument, toTomlDocument, yamlString, tomlString };
