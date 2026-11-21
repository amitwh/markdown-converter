/**
 * About window markup.
 *
 * The About window is a standalone data-URL BrowserWindow, so it never loads
 * `styles/cams2-theme.css` and cannot inherit the app shell theme. It therefore
 * carries the CAMS2 dialog surface itself: dialogs stay light in both app
 * appearances (form legibility), with brand `#e5461f` accents on the warm gray
 * scale used by `.modal-content`.
 *
 * Kept as a pure string builder (no Electron imports) so the rendered result is
 * testable and screenshot-able without launching the app.
 */

const FONT_STACK = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * @param {object} info
 * @param {string} info.version        app version, e.g. "4.17.2"
 * @param {string} [info.electron]     Electron version
 * @param {string} [info.chromium]     Chromium version
 * @param {string} [info.buildDate]    build date stamped at release time
 * @param {string} [info.buildCommit]  short source commit for this build
 * @param {string} [info.iconSrc]      data URI for the app icon
 * @param {string} [info.logoSrc]      data URI for the ConcreteInfo logo
 * @returns {string} complete HTML document
 */
function buildAboutHtml({
  version = '',
  electron = '',
  chromium = '',
  buildDate = '',
  buildCommit = '',
  iconSrc = '',
  logoSrc = '',
} = {}) {
  const buildParts = [];
  if (electron) buildParts.push(`Electron ${electron}`);
  if (chromium) buildParts.push(`Chromium ${chromium}`);
  if (buildDate) buildParts.push(`Built ${buildDate}`);
  let build = buildParts.join(' · ');
  if (buildCommit) build += ` (${String(buildCommit).slice(0, 7)})`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>About MarkdownConverter</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ${FONT_STACK};
      background: #f7f8fa;
      color: #1f2429;
      padding: 26px 22px;
      text-align: center;
      -webkit-font-smoothing: antialiased;
    }
    .logo {
      width: 104px;
      margin-bottom: 16px;
      border-radius: 18px;
      box-shadow: 0 6px 20px rgba(13, 11, 9, 0.12);
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.015em;
      margin-bottom: 6px;
      color: #1f2429;
    }
    .version {
      display: inline-block;
      color: #e5461f;
      font-size: 12px;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 999px;
      background: #fdece7;
      margin-bottom: 8px;
    }
    .build { color: #5e646b; font-size: 11px; line-height: 1.5; margin-bottom: 18px; }
    .company {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 18px;
      color: #5e646b;
      font-size: 12px;
    }
    .company-logo { height: 22px; }
    .section {
      background: #ffffff;
      border: 1px solid #e3e6ea;
      border-radius: 12px;
      padding: 14px 16px;
      margin: 12px 0;
      text-align: left;
      box-shadow: 0 1px 2px rgba(13, 11, 9, 0.04);
    }
    .section h3 {
      color: #1f2429;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .section p, .section li { font-size: 12px; line-height: 1.65; color: #3b4147; }
    ul { padding-left: 18px; }
    li { margin-bottom: 3px; }
    .footer { margin-top: 18px; font-size: 11px; line-height: 1.6; color: #5e646b; }
    a { color: #e5461f; text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <img src="${iconSrc}" class="logo" alt="MarkdownConverter">
  <h1>MarkdownConverter</h1>
  <div class="version">Version ${version}</div>
  <div class="build">${build}</div>

  <div class="company">
    <span>by</span>
    <img src="${logoSrc}" class="company-logo" alt="ConcreteInfo">
  </div>

  <div class="section">
    <h3>Features</h3>
    <ul>
      <li>Professional Markdown editing with syntax highlighting</li>
      <li>Universal file converter (Image, Audio, Video, PDF)</li>
      <li>Batch conversion for all media types</li>
      <li>Advanced PDF Editor (merge, split, watermark, encrypt)</li>
      <li>Export to PDF, DOCX, HTML, LaTeX, EPUB &amp; more</li>
      <li>37 themes, including ConcreteInfo light/dark/warm</li>
      <li>Visual flowchart editor with Mermaid/SVG/VSDX export</li>
      <li>Quick switcher, inline AI assist, daily notes</li>
      <li>ASCII Art &amp; Table generators</li>
      <li>Code file syntax highlighting</li>
    </ul>
  </div>

  <div class="section">
    <h3>Contact</h3>
    <p>Email: <a href="mailto:amit.wh@gmail.com">amit.wh@gmail.com</a></p>
    <p>Website: <a href="https://github.com/amitwh/markdown-converter">GitHub Repository</a></p>
  </div>

  <div class="footer">
    <p>License: MIT</p>
    <p>© 2024-2026 ConcreteInfo. All rights reserved.</p>
  </div>
</body>
</html>`;
}

module.exports = { buildAboutHtml };
