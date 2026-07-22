const { buildExportCss, buildFontFaceBlock } = require('../../../../src/main/ExportCss');

describe('ExportCss', () => {
  test('buildFontFaceBlock emits @font-face with base64 data URI', () => {
    const woff2 = Buffer.from([0x77, 0x4f, 0x46, 0x32]);
    const css = buildFontFaceBlock('JetBrains Mono', woff2);
    expect(css).toContain('@font-face');
    expect(css).toContain("font-family: 'JetBrains Mono'");
    expect(css).toContain("format('woff2')");
    expect(css).toContain('base64,');
    const m = css.match(/base64,([A-Za-z0-9+/=]+)/);
    expect(m).toBeTruthy();
    expect(Buffer.from(m[1], 'base64')).toEqual(woff2);
  });

  test('buildExportCss writes @font-face + ligatures when enabled', () => {
    const woff2 = Buffer.from([0x77, 0x4f, 0x46, 0x32]);
    const css = buildExportCss(
      { monospaceFont: 'jetbrains-mono', monospaceLigatures: true },
      { woff2 }
    );
    expect(css).toContain('@font-face');
    expect(css).toContain('font-feature-settings');
    expect(css).toContain("'liga' 1");
  });

  test('buildExportCss with ligatures off omits font-feature-settings', () => {
    const woff2 = Buffer.from([0x77, 0x4f, 0x46, 0x32]);
    const css = buildExportCss(
      { monospaceFont: 'fira-code', monospaceLigatures: false },
      { woff2 }
    );
    expect(css).not.toContain('font-feature-settings');
    expect(css).toContain('Fira Code');
  });
});
