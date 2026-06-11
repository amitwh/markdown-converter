import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useExportSource } from '@/hooks/use-export-source';
import { generateDocx } from '@/lib/docx-export';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';

export function WordExportDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const docxCustomTemplatePath = useSettingsStore((s) => s.docxCustomTemplatePath);
  const source = useExportSource();

  const [templateMode, setTemplateMode] = useState<'standard' | 'custom'>(
    docxCustomTemplatePath ? 'custom' : 'standard'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTemplateMode(docxCustomTemplatePath ? 'custom' : 'standard');
  }, [docxCustomTemplatePath]);

  const handleChooseTemplate = async () => {
    const result = await ipc.app.showSaveDialog?.({ title: 'Choose template path' });
    if (result?.ok && result.data) {
      setSetting('docxCustomTemplatePath', result.data);
    }
  };

  const handleSubmit = async () => {
    if (!source) {
      setError('No file open.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const blob = await generateDocx({
        source: source.source,
        title: source.title,
        customTemplatePath: templateMode === 'custom' ? docxCustomTemplatePath : null,
      });
      const saveResult = await ipc.app.showSaveDialog?.({
        title: 'Save as Word document',
        defaultPath: source.path.replace(/\.md$/, '.docx'),
      });
      if (!saveResult?.ok || !saveResult.data) {
        setSubmitting(false);
        return;
      }
      const buffer = new Uint8Array(await blob.arrayBuffer());
      const writeResult = await ipc.file.writeBuffer({ path: saveResult.data, buffer });
      if (!writeResult.ok) {
        setError(writeResult.error.message);
        setSubmitting(false);
        return;
      }
      toast.success(`Exported ${source.title} to ${saveResult.data}`);
      closeModal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Export failed: ${msg}`);
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export to Word (.docx)</DialogTitle>
          <DialogDescription>{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label>Template</Label>
            <RadioGroup
              value={templateMode}
              onValueChange={(v) => setTemplateMode(v as 'standard' | 'custom')}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="standard" id="template-standard" />
                <Label htmlFor="template-standard">Standard (bundled)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="template-custom" />
                <Label htmlFor="template-custom">Custom .dotx</Label>
              </div>
            </RadioGroup>
          </div>
          {templateMode === 'custom' && (
            <div className="rounded border border-border bg-card/20 p-2 text-xs">
              {docxCustomTemplatePath ? (
                <span>
                  Template path: <code>{docxCustomTemplatePath}</code>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  No template selected. Click "Choose template..." to pick a .dotx file.
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={handleChooseTemplate} className="ml-2">
                Choose template...
              </Button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeModal} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
