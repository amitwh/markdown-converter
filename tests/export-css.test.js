const fs = require('fs');
const path = require('path');
const ExportCss = require('../src/main/ExportCss');

describe('ExportCss.build', () => {
  const fakeFontPath = path.join(__dirname, 'fixtures', 'fake.woff2');
  const fixture = Buffer.from('woff2-binary-fake-data');

  beforeAll(() => {
    fs.mkdirSync(path.dirname(fakeFontPath), { recursive: true });
    fs.writeFileSync(fakeFontPath, fixture);
  });
  afterAll(() => fs.rmSync(path.dirname(fakeFontPath), { recursive: true, force: true }));

  test('emits a self-contained CSS with embedded @font-face', () => {
    const css = ExportCss.build({ activeFontPath: fakeFontPath, family: 'JetBrains Mono', weight: 400, ligatures: false });
    expect(css).toMatch(/@font-face\s*\{[^}]*src:\s*url\('data:font\/woff2;base64,/);
    expect(css).toContain("font-family: 'JetBrains Mono'");
    expect(css).toMatch(/font-feature-settings:[^;]*liga[^;]*0/);
  });

  test('falls back to family-only CSS when font path is missing', () => {
    const css = ExportCss.build({ activeFontPath: null, family: 'Fira Code', weight: 700, ligatures: true });
    expect(css).not.toContain('data:font/woff2;');
    expect(css).toContain("font-family: 'Fira Code'");
  });
});
