import { z } from 'zod';
import { settingsSchema } from '@/lib/validators';

export const v4SettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  customCss: z.string().optional().nullable(),
  recentFiles: z.array(z.string()).default([]),
  editorFontSize: z.number().min(10).max(28).default(14),
  keyBindings: z.record(z.string(), z.string()).optional(),
  snippets: z.array(z.unknown()).default([]),
});

const v5OnlyFields = ['updateChannel', 'autoCheckUpdates', 'firstRun'];
const v5ThemeValues = ['light', 'dark', 'system'] as const;

function isAlreadyV5(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  if ((data as Record<string, unknown>)['migration.version'] === 5) return true;
  return v5OnlyFields.some((f) => f in (data as Record<string, unknown>));
}

function normalizeAlreadyV5(data: Record<string, unknown>): Record<string, unknown> {
  // Some earlier v5 builds wrote a legacy theme value (e.g. "ayu-light")
  // under the v5 marker. Trusting the marker blindly broke the renderer's
  // zod schema on every launch. Always normalize theme against the v5 enum
  // before returning, so persisted files are always valid v5.
  const out = { ...data };
  if (
    typeof out.theme !== 'string' ||
    !v5ThemeValues.includes(out.theme as (typeof v5ThemeValues)[number])
  ) {
    out.theme = 'system';
  }
  return out;
}

export function migrateV4ToV5(v4: unknown): z.infer<typeof settingsSchema> {
  if (isAlreadyV5(v4)) {
    const normalized = normalizeAlreadyV5(v4 as Record<string, unknown>);
    return settingsSchema.parse(normalized);
  }
  const parsed = v4SettingsSchema.parse(v4);
  const defaults = settingsSchema.parse({});
  return {
    ...defaults,
    ...parsed,
    theme: parsed.theme === 'auto' ? 'system' : parsed.theme,
    customCssPath: parsed.customCss ?? null,
    recentFiles: parsed.recentFiles,
    editorFontSize: parsed.editorFontSize,
    userBindings: parsed.keyBindings ?? defaults.userBindings ?? {},
    snippets: parsed.snippets,
  };
}
