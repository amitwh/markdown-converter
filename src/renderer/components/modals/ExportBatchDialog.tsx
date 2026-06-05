import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { ipc } from '@/lib/ipc';
import { ExportDialogFooter } from './ExportDialogFooter';

const extFor = (format: 'pdf' | 'docx' | 'html' | 'png') =>
  format === 'pdf' ? '.pdf' : format === 'docx' ? '.docx' : format === 'png' ? '.png' : '.html';

export function ExportBatchDialog({ sourcePaths }: { sourcePaths: string[] }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const [format, setFormat] = useState<'pdf' | 'docx' | 'html' | 'png'>('pdf');
  const [concurrency, setConcurrency] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const items = sourcePaths.map((p) => ({
      inputPath: p,
      outputPath: p.replace(/\.md$/, extFor(format)),
    }));
    const result = await ipc.export.batch(items, { format, concurrency });
    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
    } else {
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="batch-desc">
        <DialogHeader>
          <DialogTitle>Batch export</DialogTitle>
          <DialogDescription id="batch-desc">{sourcePaths.length} files</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="batch-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger id="batch-format" aria-label="Format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">DOCX</SelectItem>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="batch-concurrency">Concurrency</Label>
            <Select value={String(concurrency)} onValueChange={(v) => setConcurrency(Number(v))}>
              <SelectTrigger id="batch-concurrency" aria-label="Concurrency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 8, 16].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-40 overflow-auto rounded border border-border bg-card/20 p-2 text-xs">
            {sourcePaths.map((p) => <div key={p} className="truncate">{p}</div>)}
          </div>
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
