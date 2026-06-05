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

export function ExportHtmlDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { htmlHighlightStyle, renderTablesAsAscii } = useSettingsStore();
  const source = useExportSource();
  const [standalone, setStandalone] = useState(true);
  const [highlight, setHighlight] = useState(htmlHighlightStyle);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!source) { setError('No file open.'); return; }
    setSubmitting(true);
    setError(null);
    const result = await ipc.export.html({
      inputPath: source.path,
      outputPath: source.path.replace(/\.md$/, '.html'),
      standalone,
      highlightStyle: highlight,
      renderTablesAsAscii: ascii,
    } as any);
    if (!result.ok) {
      toast.error(`Export failed: ${result.error.message}`);
      setError(result.error.message);
      setSubmitting(false);
    } else {
      toast.success(`Exported ${source.title} to ${result.data?.outputPath ?? 'file'}`);
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="html-desc">
        <DialogHeader>
          <DialogTitle>Export to HTML</DialogTitle>
          <DialogDescription id="html-desc">{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={standalone} onCheckedChange={(c) => setStandalone(!!c)} aria-label="Standalone" />
            Standalone document (with inline CSS)
          </label>
          <div>
            <Label htmlFor="html-highlight">Syntax highlight style</Label>
            <Select value={highlight} onValueChange={(v) => setHighlight(v as any)}>
              <SelectTrigger id="html-highlight" aria-label="Highlight style"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="monokai">Monokai</SelectItem>
                <SelectItem value="nord">Nord</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
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