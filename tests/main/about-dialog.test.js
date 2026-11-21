/**
 * @jest-environment node
 */
const { buildAboutHtml } = require('../../src/main/AboutDialog');

describe('buildAboutHtml', () => {
  const base = {
    version: '4.17.2',
    electron: '45.4.1',
    chromium: '156.0.0.0',
    buildDate: '2026-11-21',
    buildCommit: '8374efc9abcdef',
    iconSrc: 'data:image/png;base64,ICON',
    logoSrc: 'data:image/png;base64,LOGO',
  };

  test('renders a complete HTML document', () => {
    const html = buildAboutHtml(base);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('<title>About MarkdownConverter</title>');
  });

  test('uses the light CAMS2 dialog surface, never the old dark gradient', () => {
    const html = buildAboutHtml(base);
    expect(html).toContain('background: #f7f8fa');
    expect(html).not.toContain('linear-gradient');
    expect(html).not.toContain('#0d0b09) 100%');
    expect(html).not.toContain('color: #e3e3e3');
  });

  test('interpolates the version into the brand pill', () => {
    const html = buildAboutHtml(base);
    expect(html).toContain('<div class="version">Version 4.17.2</div>');
    expect(html).toContain('background: #fdece7');
  });

  test('build line includes runtime versions, date and short commit', () => {
    const html = buildAboutHtml(base);
    expect(html).toContain('Electron 45.4.1');
    expect(html).toContain('Chromium 156.0.0.0');
    expect(html).toContain('Built 2026-11-21');
    expect(html).toContain('(8374efc)');
    expect(html).not.toContain('8374efc9abcdef');
  });

  test('omits missing build metadata instead of printing placeholders', () => {
    const html = buildAboutHtml({ version: '1.0.0' });
    expect(html).toContain('Version 1.0.0');
    expect(html).not.toContain('Electron undefined');
    expect(html).not.toContain('Built undefined');
    expect(html).not.toContain('undefined');
  });

  test('embeds the supplied image data URIs', () => {
    const html = buildAboutHtml(base);
    expect(html).toContain('src="data:image/png;base64,ICON"');
    expect(html).toContain('src="data:image/png;base64,LOGO"');
  });

  test('tolerates being called with no arguments', () => {
    const html = buildAboutHtml();
    expect(html).toContain('Version');
    expect(html).toContain('</html>');
  });
});
