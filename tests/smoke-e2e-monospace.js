// Manual end-to-end smoke test for the monospace font embedding pipeline.
// Verifies that:
//   1. PdfFontHeader produces valid fontspec that references real bundled TTFs
//   2. ExportCss.build emits a @font-face with base64 data URI from the TTF
//   3. DocxFontEmbedder.inject on a pandoc-produced DOCX includes the font
//   4. EpubFontEmbedder.patchManifest references the TTF in OPF <manifest>
//   5. MonospaceFontConfig.getMonoFontTtfPath returns real paths for both families
//
// Run with: node tests/smoke-e2e-monospace.js

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const JSZip = require('jszip');

const PdfFontHeader = require('../src/main/PdfFontHeader');
const ExportCss = require('../src/main/ExportCss');
const MonospaceFontConfig = require('../src/main/MonospaceFontConfig');
const DocxFontEmbedder = require('../src/main/DocxFontEmbedder');
const EpubFontEmbedder = require('../src/main/EpubFontEmbedder');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-smoke-'));
const ASCII_FIXTURE = `\`\`\`
+---+---+---+
| A | B | C |
+---+---+---+
| 1 | 2 | 3 |
+---+---+---+
\`\`\`

Use this **ASCII** table to verify \`column alignment\` in code blocks.
`;

function check(label, cond, detail) {
  const tag = cond ? 'OK  ' : 'FAIL';
  console.log(`[${tag}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  console.log(`Smoke test dir: ${TMP}`);

  // 1. PdfFontHeader
  const jbmRegular = MonospaceFontConfig.getMonoFontTtfPath('jetbrains-mono', 400);
  check('JBM Regular TTF resolves', !!jbmRegular, jbmRegular);
  const jbmBold = MonospaceFontConfig.getMonoFontTtfPath('jetbrains-mono', 700);
  check('JBM Bold TTF resolves', !!jbmBold, jbmBold);
  const fcRegular = MonospaceFontConfig.getMonoFontTtfPath('fira-code', 400);
  check('Fira Code Regular TTF resolves', !!fcRegular, fcRegular);

  const tex = PdfFontHeader.build({
    fontTtfPath: jbmRegular,
    boldTtfPath: jbmBold,
    ligatures: false,
  });
  check('PdfFontHeader includes fontspec', tex.includes('\\usepackage{fontspec}'));
  check(
    'PdfFontHeader sets family to JetBrainsMono',
    /\\setmonofont\[[^\]]*\]\{JetBrainsMono\}/.test(tex)
  );
  check('PdfFontHeader disables common ligatures', tex.includes('Ligatures=NoCommon'));

  // 2. ExportCss
  const css = ExportCss.build({
    activeFontPath: jbmRegular,
    family: 'JetBrains Mono',
    weight: 400,
    ligatures: false,
  });
  check('ExportCss declares @font-face', css.includes('@font-face'));
  check('ExportCss uses data URI', css.includes('data:font/woff2;base64,'));
  check('ExportCss sets font-feature-settings', css.includes('font-feature-settings'));

  // 3. DocxFontEmbedder — build a DOCX via pandoc, then patch
  const mdPath = path.join(TMP, 'ascii.md');
  fs.writeFileSync(mdPath, ASCII_FIXTURE);
  const docxPath = path.join(TMP, 'ascii.docx');
  execFileSync('pandoc', [mdPath, '-o', docxPath], { stdio: 'pipe' });
  const patchedDocx = await DocxFontEmbedder.embed(docxPath, [
    { path: jbmRegular, family: 'JetBrains Mono', weight: 400 },
    { path: jbmBold, family: 'JetBrains Mono', weight: 700 },
  ]);
  const docxZip = await JSZip.loadAsync(fs.readFileSync(patchedDocx));
  const fontTable = docxZip.file('word/fontTable.xml')
    ? await docxZip.file('word/fontTable.xml').async('string')
    : '';
  check('DOCX has word/fontTable.xml', !!fontTable);
  check('DOCX fontTable names JetBrains Mono', fontTable.includes('JetBrains Mono'));
  check('DOCX fontTable has embedRegular', /<w:embedRegular/.test(fontTable));
  check(
    'DOCX embeds JetBrainsMono-Regular.ttf',
    Object.keys(docxZip.files).some((f) => /word\/fonts\/JetBrainsMono-Regular\.ttf$/.test(f))
  );
  check(
    'DOCX embeds JetBrainsMono-Bold.ttf',
    Object.keys(docxZip.files).some((f) => /word\/fonts\/JetBrainsMono-Bold\.ttf$/.test(f))
  );

  // 4. EpubFontEmbedder — build an EPUB, then patch
  const epubPath = path.join(TMP, 'ascii.epub');
  execFileSync('pandoc', [mdPath, '-o', epubPath], { stdio: 'pipe' });
  const patchedEpub = await EpubFontEmbedder.patchManifest(epubPath, [
    { path: jbmRegular, family: 'JetBrains Mono', weight: 400 },
  ]);
  const epubZip = await JSZip.loadAsync(fs.readFileSync(patchedEpub));
  const opfEntry = Object.keys(epubZip.files).find((f) => f.endsWith('content.opf'));
  check('EPUB has content.opf', !!opfEntry);
  const opf = await epubZip.file(opfEntry).async('string');
  check('EPUB OPF references the TTF', /href="OEBPS\/fonts\/JetBrainsMono-Regular\.ttf"/.test(opf));
  check(
    'EPUB OPF declares x-font-ttf media type',
    /media-type="application\/x-font-ttf"/.test(opf)
  );
  check(
    'EPUB embeds the TTF in OEBPS/fonts/',
    Object.keys(epubZip.files).some((f) => /^OEBPS\/fonts\/JetBrainsMono-Regular\.ttf$/.test(f))
  );

  // 5. HTML export via pandoc with --css pointing at ExportCss output
  const cssFile = path.join(TMP, 'mono.css');
  fs.writeFileSync(cssFile, css, 'utf-8');
  const htmlPath = path.join(TMP, 'ascii.html');
  execFileSync('pandoc', [mdPath, '-s', `--css=${cssFile}`, '-o', htmlPath], { stdio: 'pipe' });
  const html = fs.readFileSync(htmlPath, 'utf-8');
  // Pandoc with --css writes a <link rel="stylesheet"> reference rather than
  // inlining the CSS; the @font-face lives in the sidecar CSS file.
  const linksCss = /<link\s+rel="stylesheet"\s+href="[^"]*\.css/.test(html);
  check(
    'HTML export links the monospace CSS',
    linksCss,
    linksCss ? '' : 'expected <link rel="stylesheet" href="*.css"> in HTML'
  );
  const cssText = fs.readFileSync(cssFile, 'utf-8');
  check('Sidecar CSS declares @font-face', cssText.includes('@font-face'));
  check('Sidecar CSS embeds the font via data URI', cssText.includes('data:font/woff2;base64,'));

  // Cleanup
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`Exit code: ${process.exitCode || 0}`);
})().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exitCode = 2;
});
