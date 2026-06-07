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
    // The print flow goes through the main process so the user gets the
    // native OS print dialog (with system paper-size, scale, and margins).
    // We send a simple "trigger do-print" message and let the main process
    // call webContents.print() with the user-chosen options.
    ipc.print.doPrint({ withStyles: true });
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
            Print…
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
