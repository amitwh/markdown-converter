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

const v5SettingsSchema = z.object({
  fontSize: z.number().default(14),
  tabSize: z.number().default(4),
  lineNumbers: z.boolean().default(true),
  wordWrap: z.boolean().default(true),
  minimap: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  accentColor: z.string().default('brand'),
  fontFamily: z.string().default('system'),
  pdfFormat: z.string().default('a4'),
  pdfMargins: z.string().default('normal'),
  pdfEmbedFonts: z.boolean().default(true),
  docxTemplate: z.string().default('standard'),
  docxCustomTemplatePath: z.string().nullable().default(null),
  replOpen: z.boolean().default(false),
  breadcrumbSymbols: z.boolean().default(true),
  htmlHighlightStyle: z.string().default('github'),
  renderTablesAsAscii: z.boolean().default(false),
  welcomeDismissed: z.boolean().default(false),
  editorFontSize: z.number().default(14),
  customCssPath: z.string().nullable().default(null),
  userBindings: z.record(z.string(), z.string()).default({}),
  updateChannel: z.enum(['github', 'concreteinfo']).default('github'),
  autoCheckUpdates: z.boolean().default(true),
  firstRun: z.boolean().default(true),
  'migration.version': z.literal(5).optional(),
}).passthrough();

const v5OnlyFields = ['updateChannel', 'autoCheckUpdates', 'firstRun'];
const v5ThemeValues = ['light', 'dark', 'system'];

function isAlreadyV5(data) {
  if (!data || typeof data !== 'object') return false;
  if (data['migration.version'] === 5) return true;
  // Check for v5-only fields — a v4 file would never have these
  return v5OnlyFields.some((f) => f in data);
}

function normalizeAlreadyV5(data) {
  // Some earlier v5 builds wrote a legacy theme value (e.g. "ayu-light")
  // under the v5 marker. Trusting the marker blindly broke the renderer's
  // zod schema on every launch. Always normalize theme against the v5 enum
  // before returning, so persisted files are always valid v5.
  const out = { ...data };
  if (typeof out.theme !== 'string' || !v5ThemeValues.includes(out.theme)) {
    out.theme = 'system';
  }
  return out;
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
  // normalize and validate against the v5 schema. This handles the case where
  // a buggy v5 run wrote v5 fields without the marker, AND the case where a
  // v5 file has a legacy theme value (e.g. "ayu-light") that would otherwise
  // be rejected by the renderer.
  if (isAlreadyV5(v4)) {
    return v5SettingsSchema.parse(normalizeAlreadyV5(v4));
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
