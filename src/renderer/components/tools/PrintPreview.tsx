import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/preview/MarkdownRenderer';
import { useExportSource } from '@/hooks/use-export-source';
import { ipc } from '@/lib/ipc';

interface Props {
  onClose: () => void;
}

export function PrintPreview({ onClose }: Props) {
  const source = useExportSource();

  const handlePrint = async () => {
    if (!source) return;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${source.title}</title></head><body><pre>${source.source.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))}</pre></body></html>`;
    await ipc.print({ html });
  };

  if (!source) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="flex h-12 items-center justify-between border-b border-border bg-card/30 px-4">
          <h2 className="font-semibold">Print preview</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          No file open
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex h-12 items-center justify-between border-b border-border bg-card/30 px-4">
        <h2 className="font-semibold">Print preview — {source.title}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-card/20 p-8">
        <div className="mx-auto max-w-3xl rounded border border-border bg-background p-8 shadow-lg">
          <MarkdownRenderer source={source.source} />
        </div>
      </div>
    </div>
  );
}