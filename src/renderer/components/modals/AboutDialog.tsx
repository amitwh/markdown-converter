import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ipc } from '@/lib/ipc';
import { useAppStore } from '@/stores/app-store';

export function AboutDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const isOpen = useAppStore((s) => s.modal.kind) === 'about';
  const [version, setVersion] = useState<string>('…');

  useEffect(() => {
    ipc.app.getVersion().then((r) => {
      if (r.ok && typeof r.data === 'string') setVersion(r.data);
    });
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && closeModal()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>About MarkdownConverter</DialogTitle>
          <DialogDescription>
            Professional Markdown editor and universal file converter.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Version: {version}</p>
          <p>
            <a
              href="https://github.com/amitwh/markdown-converter"
              className="text-brand hover:underline"
              onClick={(e) => {
                e.preventDefault();
                ipc.app.openExternal('https://github.com/amitwh/markdown-converter');
              }}
            >
              GitHub repository
            </a>
          </p>
          <p className="text-xs">© ConcreteInfo. Licensed under MIT.</p>
        </div>
        <DialogFooter>
          <Button onClick={closeModal}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
