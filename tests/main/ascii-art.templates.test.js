/**
 * @jest-environment node
 *
 * Per-template snapshot tests. Templates are static strings; the snapshot
 * catches accidental edits during refactors.
 */
const AsciiArtTemplates = require('../../src/main/AsciiArt.templates');

const TEMPLATE_NAMES = [
  'arrow-right',
  'arrow-down',
  'arrow-up',
  'decision',
  'process',
  'flowchart',
  'sequence',
  'network',
  'hierarchy',
  'header',
  'note',
  'warning',
  'info',
  'divider',
  'separator',
  'banner',
  'checklist',
  'progress-bar',
  'table-simple',
];

describe('AsciiArt.templates', () => {
  test.each(TEMPLATE_NAMES)('%s', (name) => {
    expect(AsciiArtTemplates.getTemplate(name)).toMatchSnapshot();
  });

  test('returns empty string for unknown name', () => {
    expect(AsciiArtTemplates.getTemplate('nope')).toBe('');
  });

  test('ASCII_TEMPLATES object exposes all 19 names', () => {
    expect(Object.keys(AsciiArtTemplates.ASCII_TEMPLATES).sort()).toEqual(
      TEMPLATE_NAMES.slice().sort()
    );
  });
});
