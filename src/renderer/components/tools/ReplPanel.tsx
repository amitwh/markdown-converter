import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings-store';
import { renderMarkdown } from '@/lib/markdown';

export function ReplPanel() {
  const replOpen = useSettingsStore((s) => s.replOpen);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [source, setSource] = useState('# Markdown preview\n\nType here…');
  const [debouncedSource, setDebouncedSource] = useState(source);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSource(source), 300);
    return () => clearTimeout(t);
  }, [source]);

  if (!replOpen) return null;

  const html = renderMarkdown(debouncedSource);

  return (
    <div
      role="region"
      aria-label="REPL"
      className="fixed bottom-0 left-0 right-0 z-40 flex h-[30vh] flex-col border-t border-border bg-card/95 shadow-2xl backdrop-blur"
      data-testid="repl-panel"
    >
      <div className="flex h-8 items-center justify-between border-b border-border bg-card/50 px-3 text-xs">
        <span className="font-semibold">REPL — Markdown snippet preview</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close REPL"
          onClick={() => setSetting('replOpen', false)}
          className="h-6 w-6"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-full flex-1 resize-none rounded-none border-r border-border font-mono text-xs"
          aria-label="Markdown source"
        />
        <div
          className="h-full flex-1 overflow-auto p-3 text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
          data-testid="repl-preview"
        />
      </div>
    </div>
  );
}
