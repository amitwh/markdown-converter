/**
 * Renderer-side Markdown → PDF export.
 *
 * Opens the file in a hidden iframe with the rendered HTML, then triggers
 * `window.print()` with the print stylesheet active. This works in both the
 * embedded renderer and the packaged Electron build. For non-interactive
 * export we fall back to the legacy `do-print` channel.
 */
import { generateHtml } from './html-export';
import { ipc } from './ipc';
import { toast } from './toast';

export interface PdfExportOptions {
  source: string;
  title: string;
  format: 'letter' | 'a4' | 'legal';
  margins: { top: number; right: number; bottom: number; left: number };
  embedFonts: boolean;
  fontSize: number;
}

const FORMAT_DIMENSIONS: Record<PdfExportOptions['format'], { width: string; height: string }> = {
  letter: { width: '8.5in', height: '11in' },
  a4: { width: '210mm', height: '297mm' },
  legal: { width: '8.5in', height: '14in' },
};

export async function generatePdf(options: PdfExportOptions): Promise<void> {
  const html = generateHtml({
    source: options.source,
    title: options.title,
    standalone: true,
    highlightStyle: 'github',
    renderTablesAsAscii: false,
  });
  // Inject @page CSS for size + margins
  const fmt = FORMAT_DIMENSIONS[options.format];
  const m = options.margins;
  const pageCss = `@page { size: ${fmt.width} ${fmt.height}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
  const finalHtml = html.replace('</style>', `${pageCss}</style>`);

  // Hand the rendered HTML to the main process for native print-to-PDF.
  // This avoids the print dialog and works headlessly.
  const result = await ipc.print({ html: finalHtml });
  if (!result.ok) {
    toast.error(`PDF export failed: ${result.error?.message ?? 'unknown error'}`);
  } else {
    toast.success(`Sent ${options.title} to printer`);
  }
}
