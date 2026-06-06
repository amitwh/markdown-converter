import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useExportSource } from '@/hooks/use-export-source';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';
import { ExportDialogFooter } from './ExportDialogFooter';

const MARGIN_MAP = {
  normal: { top: 25, right: 25, bottom: 25, left: 25 },
  narrow: { top: 15, right: 15, bottom: 15, left: 15 },
  wide: { top: 35, right: 35, bottom: 35, left: 35 },
} as const;

export function ExportPdfDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { fontSize, pdfFormat, pdfMargins, pdfEmbedFonts, renderTablesAsAscii } = useSettingsStore();
  const [format, setFormat] = useState<'letter' | 'a4' | 'legal'>(pdfFormat);
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>(pdfMargins);
  const [embed, setEmbed] = useState(pdfEmbedFonts);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const source = useExportSource();

  const handleSubmit = async () => {
    if (!source) {
      setError('No file open.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await ipc.export.pdf({
      inputPath: source.path,
      outputPath: source.path.replace(/\.md$/, '.pdf'),
      format,
      margins: MARGIN_MAP[margins],
      embedFonts: embed,
      renderTablesAsAscii: ascii,
      fontSize,
    } as any);
    if (!result.ok) {
      toast.error(`Export failed: ${result.error?.message ?? 'Export failed'}`);
      setError(result.error?.message ?? 'Export failed');
      setSubmitting(false);
    } else {
      toast.success(`Exported ${source.title} to ${result.data?.outputPath ?? 'file'}`);
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to PDF</DialogTitle>
          <DialogDescription>{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="pdf-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
              <SelectTrigger id="pdf-format" aria-label="Format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pdf-margins">Margins</Label>
            <Select value={margins} onValueChange={(v) => setMargins(v as typeof margins)}>
              <SelectTrigger id="pdf-margins" aria-label="Margins"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={embed} onCheckedChange={(c) => setEmbed(!!c)} aria-label="Embed fonts" />
            Embed fonts
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={ascii} onCheckedChange={(c) => setAscii(!!c)} aria-label="ASCII tables" />
            Render tables as ASCII
          </label>
          {error && (
            <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <ExportDialogFooter onCancel={closeModal} onSubmit={handleSubmit} submitting={submitting} submitLabel="Export" />
      </DialogContent>
    </Dialog>
  );
}