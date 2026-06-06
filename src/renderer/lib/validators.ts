import { z } from 'zod';

export const settingsSchema = z.object({
  fontSize: z.number().min(10).max(24).default(14),
  tabSize: z.union([z.literal(2), z.literal(4), z.literal(8)]).default(4),
  lineNumbers: z.boolean().default(true),
  wordWrap: z.boolean().default(true),
  minimap: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  accentColor: z.enum(['brand', 'blue', 'green', 'purple', 'orange']).default('brand'),
  fontFamily: z.enum(['system', 'jetbrains', 'fira']).default('system'),
  pdfFormat: z.enum(['letter', 'a4', 'legal']).default('a4'),
  pdfMargins: z.enum(['normal', 'narrow', 'wide']).default('normal'),
  pdfEmbedFonts: z.boolean().default(true),
  docxTemplate: z.enum(['standard', 'minimal', 'modern']).default('standard'),
  docxCustomTemplatePath: z.string().nullable().default(null),
  replOpen: z.boolean().default(false),
  breadcrumbSymbols: z.boolean().default(true),
  htmlHighlightStyle: z.enum(['github', 'monokai', 'nord', 'none']).default('github'),
  renderTablesAsAscii: z.boolean().default(false),
  welcomeDismissed: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const exportPdfSchema = z.object({
  format: z.enum(['letter', 'a4', 'legal']),
  margins: z.enum(['normal', 'narrow', 'wide']),
  embedFonts: z.boolean(),
  renderTablesAsAscii: z.boolean().optional(),
});
export type ExportPdfOptions = z.infer<typeof exportPdfSchema>;

export const exportDocxSchema = z.object({
  template: z.enum(['standard', 'minimal', 'modern']),
  renderTablesAsAscii: z.boolean().optional(),
});
export type ExportDocxOptions = z.infer<typeof exportDocxSchema>;

export const exportHtmlSchema = z.object({
  standalone: z.boolean(),
  highlightStyle: z.enum(['github', 'monokai', 'nord', 'none']),
  renderTablesAsAscii: z.boolean().optional(),
});
export type ExportHtmlOptions = z.infer<typeof exportHtmlSchema>;

export const exportBatchSchema = z.object({
  format: z.enum(['pdf', 'docx', 'html', 'png']),
  concurrency: z.number().int().min(1).max(16),
  filePaths: z.array(z.string()).min(1),
});
export type ExportBatchOptions = z.infer<typeof exportBatchSchema>;
