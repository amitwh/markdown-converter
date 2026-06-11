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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/lib/toast';
import { figletText, FIGLET_FONTS, type FigletFont } from '@/lib/figlet';

export function AsciiGeneratorDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const [text, setText] = useState('Hello');
  const [font, setFont] = useState<FigletFont>('Standard');
  const [output, setOutput] = useState('');

  useEffect(() => {
    let cancelled = false;
    figletText(text || ' ', font)
      .then((result) => {
        if (!cancelled) setOutput(result);
      })
      .catch(() => {
        if (!cancelled) setOutput('(render error)');
      });
    return () => {
      cancelled = true;
    };
  }, [text, font]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ASCII generator</DialogTitle>
          <DialogDescription>Type text, pick a font, see ASCII art</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ascii-text">Text</Label>
            <Textarea
              id="ascii-text"
              aria-label="Text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="ascii-font">Font</Label>
            <Select value={font} onValueChange={(v) => setFont(v as FigletFont)}>
              <SelectTrigger id="ascii-font" aria-label="Font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIGLET_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Output</Label>
            <pre
              className="overflow-auto rounded border border-border bg-card/30 p-3 text-xs"
              data-testid="ascii-output"
            >
              {output}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeModal}>
            Close
          </Button>
          <Button onClick={handleCopy}>Copy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
