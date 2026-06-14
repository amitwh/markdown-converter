import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/stores/app-store';
import { useExportSource } from '@/hooks/use-export-source';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';
import { ExportDialogFooter } from './ExportDialogFooter';

export function ExportRevealjsDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const source = useExportSource();

  const [revealTheme, setRevealTheme] = useState('black');
  const [revealTransition, setRevealTransition] = useState('slide');
  const [revealTransitionSpeed, setRevealTransitionSpeed] = useState('default');
  const [revealSlideNumber, setRevealSlideNumber] = useState(false);
  const [revealControls, setRevealControls] = useState(true);
  const [revealProgress, setRevealProgress] = useState(true);
  const [revealHistory, setRevealHistory] = useState(true);
  const [revealCenter, setRevealCenter] = useState(true);

  const [template, setTemplate] = useState('default');
  const [title, setTitle] = useState(source?.title || '');
  const [author, setAuthor] = useState('');
  const [date, setDate] = useState('');
  const [bibliography, setBibliography] = useState('');
  const [csl, setCsl] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBrowseFile = async (setter: (v: string) => void) => {
    const result = await ipc.file.pickFile();
    if (result.ok && result.data) {
      setter(result.data);
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
      const options = {
        revealTheme,
        revealTransition,
        revealTransitionSpeed,
        revealSlideNumber,
        revealControls,
        revealProgress,
        revealHistory,
        revealCenter,
        template: template || undefined,
        metadata: {
          title: title || undefined,
          author: author || undefined,
          date: date || undefined,
        },
        bibliography: bibliography || undefined,
        csl: csl || undefined,
      };

      await window.electronAPI?.export?.withOptions?.('revealjs', options);
      toast.success('Slide export process completed');
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
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Reveal.js Slides</DialogTitle>
          <DialogDescription>{sourcePath}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Theme & Transitions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="reveal-theme">Theme</Label>
              <Select value={revealTheme} onValueChange={setRevealTheme}>
                <SelectTrigger id="reveal-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['black', 'white', 'league', 'beige', 'sky', 'night', 'serif', 'simple', 'solarized', 'blood', 'moon'].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reveal-transition">Transition</Label>
              <Select value={revealTransition} onValueChange={setRevealTransition}>
                <SelectTrigger id="reveal-transition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['slide', 'none', 'fade', 'convex', 'concave', 'zoom'].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="reveal-speed">Transition Speed</Label>
            <Select value={revealTransitionSpeed} onValueChange={setRevealTransitionSpeed}>
              <SelectTrigger id="reveal-speed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['default', 'fast', 'slow'].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggle Switches */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 py-2">
            <div className="flex items-center gap-2">
              <Switch checked={revealSlideNumber} onCheckedChange={setRevealSlideNumber} id="reveal-slide-number" />
              <Label htmlFor="reveal-slide-number">Slide Numbers</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={revealControls} onCheckedChange={setRevealControls} id="reveal-controls" />
              <Label htmlFor="reveal-controls">Controls</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={revealProgress} onCheckedChange={setRevealProgress} id="reveal-progress" />
              <Label htmlFor="reveal-progress">Progress Bar</Label>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={revealHistory} onCheckedChange={setRevealHistory} id="reveal-history" />
              <Label htmlFor="reveal-history">Slide History</Label>
            </div>

            <div className="flex items-center gap-2 col-span-2">
              <Switch checked={revealCenter} onCheckedChange={setRevealCenter} id="reveal-center" />
              <Label htmlFor="reveal-center">Center Content Vertically</Label>
            </div>
          </div>

          {/* Template & Metadata */}
          <div className="border-t pt-3 space-y-3">
            <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block">Metadata & Template</Label>

            <div>
              <Label htmlFor="reveal-template">Template File</Label>
              <div className="flex gap-2">
                <Input
                  id="reveal-template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  placeholder="default"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => handleBrowseFile(setTemplate)}>
                  Browse
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label htmlFor="reveal-title">Title</Label>
                <Input id="reveal-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="reveal-author">Author</Label>
                <Input id="reveal-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="reveal-date">Date</Label>
                <Input id="reveal-date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Bibliography & CSL */}
          <div className="border-t pt-3 space-y-3">
            <Label className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block">Bibliography (Pandoc)</Label>

            <div>
              <Label htmlFor="reveal-bibliography">Bibliography (.bib, .json)</Label>
              <div className="flex gap-2">
                <Input
                  id="reveal-bibliography"
                  value={bibliography}
                  onChange={(e) => setBibliography(e.target.value)}
                  placeholder="/path/to/citations.bib"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => handleBrowseFile(setBibliography)}>
                  Browse
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="reveal-csl">CSL Style</Label>
              <div className="flex gap-2">
                <Input
                  id="reveal-csl"
                  value={csl}
                  onChange={(e) => setCsl(e.target.value)}
                  placeholder="/path/to/style.csl"
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={() => handleBrowseFile(setCsl)}>
                  Browse
                </Button>
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        <ExportDialogFooter
          onCancel={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitLabel="Export"
        />
      </DialogContent>
    </Dialog>
  );
}
