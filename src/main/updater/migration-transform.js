// Mirror of src/renderer/lib/migrations/v4-to-v5.ts, plain JS, for main-process use.
// Kept in sync manually; if the renderer transform changes, update this too.
const { z } = require('zod');

const v4SettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  customCss: z.string().optional().nullable(),
  recentFiles: z.array(z.string()).default([]),
  editorFontSize: z.number().min(10).max(28).default(14),
  keyBindings: z.record(z.string(), z.string()).optional(),
  snippets: z.array(z.unknown()).default([]),
}).passthrough();

const v5SettingsShape = {
  fontSize: 14,
  tabSize: 4,
  lineNumbers: true,
  wordWrap: true,
  minimap: true,
  theme: 'system',
  accentColor: 'brand',
  fontFamily: 'system',
  pdfFormat: 'a4',
  pdfMargins: 'normal',
  pdfEmbedFonts: true,
  docxTemplate: 'standard',
  docxCustomTemplatePath: null,
  replOpen: false,
  breadcrumbSymbols: true,
  htmlHighlightStyle: 'github',
  renderTablesAsAscii: false,
  welcomeDismissed: false,
  editorFontSize: 14,
  customCssPath: null,
  userBindings: {},
  updateChannel: 'github',
  autoCheckUpdates: true,
  firstRun: true,
};

function migrateV4ToV5(v4) {
  const parsed = v4SettingsSchema.parse(v4 || {});
  return {
    ...v5SettingsShape,
    ...parsed,
    theme: parsed.theme === 'auto' ? 'system' : parsed.theme,
    customCssPath: parsed.customCss ?? null,
    recentFiles: parsed.recentFiles,
    editorFontSize: parsed.editorFontSize,
    userBindings: parsed.keyBindings ?? v5SettingsShape.userBindings,
    snippets: parsed.snippets,
  };
}

module.exports = { migrateV4ToV5, v5SettingsShape };