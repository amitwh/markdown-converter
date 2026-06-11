import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

export function WelcomeDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [dontShow, setDontShow] = useState(false);

  const handleClose = () => {
    if (dontShow) setSetting('welcomeDismissed', true);
    closeModal();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Welcome to MarkdownConverter</DialogTitle>
          <DialogDescription>
            A polished editor for Markdown, with PDF, DOCX, and HTML export.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-card/30 p-3">
            <h3 className="font-semibold">1. Open a folder</h3>
            <p className="text-muted-foreground">
              File → Open Folder, or ⌘O. Your tree appears on the left.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card/30 p-3">
            <h3 className="font-semibold">2. Edit & preview</h3>
            <p className="text-muted-foreground">
              Type on the left, see the rendered preview on the right. Toggle with ⌘\.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card/30 p-3">
            <h3 className="font-semibold">3. Export anywhere</h3>
            <p className="text-muted-foreground">
              File → Export to PDF / DOCX / HTML, or batch convert a folder.
            </p>
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={dontShow}
              onCheckedChange={(c) => setDontShow(!!c)}
              aria-label="Don't show again"
            />
            Don't show again
          </label>
          <Button onClick={handleClose}>Get started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
