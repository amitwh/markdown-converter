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

export function migrateV4ToV5(v4: unknown): z.infer<typeof settingsSchema> {
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
