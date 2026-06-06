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

export function ExportDocxDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { docxTemplate, renderTablesAsAscii } = useSettingsStore();
  const source = useExportSource();
  const [template, setTemplate] = useState<'standard' | 'minimal' | 'modern'>(docxTemplate);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!source) { setError('No file open.'); return; }
    setSubmitting(true);
    setError(null);
    const result = await ipc.export.docx({
      inputPath: source.path,
      outputPath: source.path.replace(/\.md$/, '.docx'),
      template,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to DOCX</DialogTitle>
          <DialogDescription>{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="docx-template">Template</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as any)}>
              <SelectTrigger id="docx-template" aria-label="Template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Bundled with the app. Standard is the default; Modern adds a colored cover page.
            </p>
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