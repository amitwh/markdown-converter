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

const v5OnlyFields = ['updateChannel', 'autoCheckUpdates', 'firstRun'];

function isAlreadyV5(data) {
  if (!data || typeof data !== 'object') return false;
  if (data['migration.version'] === 5) return true;
  // Check for v5-only fields — a v4 file would never have these
  return v5OnlyFields.some((f) => f in data);
}

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
  // If data already looks like v5 (has migration.version=5 or v5-only fields),
  // return it as-is so the runner can mark it done without re-migrating.
  // This handles the case where a buggy v5 run wrote v5 fields without the marker.
  if (isAlreadyV5(v4)) {
    return v4;
  }
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