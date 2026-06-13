import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useCommandStore } from '@/stores/command-store';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  shortcut: string | null;
}

const MAX_RESULTS = 8;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<CommandItem[]>(() => {
    const handlers = useCommandStore.getState().handlers;
    return Object.keys(handlers).map((id) => ({
      id,
      label: id
        .split('.')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' → '),
      shortcut: null,
    }));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, MAX_RESULTS);
    const lower = query.toLowerCase();
    const scored = commands
      .map((cmd) => {
        const labelLower = cmd.label.toLowerCase();
        const idLower = cmd.id.toLowerCase();
        const labelIdx = labelLower.indexOf(lower);
        const idIdx = idLower.indexOf(lower);
        let score = 100;
        if (labelIdx === 0) score = 10;
        else if (labelIdx >= 0) score = 20;
        else if (idIdx === 0) score = 15;
        else if (idIdx >= 0) score = 25;
        else score = 100;
        return { cmd, score };
      })
      .filter((item) => item.score < 100)
      .sort((a, b) => a.score - b.score)
      .map((item) => item.cmd);
    return scored.slice(0, MAX_RESULTS);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const execute = useCallback((id: string) => {
    useCommandStore.getState().dispatch(id);
    setOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) execute(cmd.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [filtered, selectedIndex, execute]
  );

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background shadow-2xl">
        <div className="border-b px-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-activedescendant={
              filtered[selectedIndex] ? `cmd-${filtered[selectedIndex].id}` : undefined
            }
          />
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto p-1" role="listbox">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </div>
          )}
          {filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              id={`cmd-${cmd.id}`}
              role="option"
              aria-selected={idx === selectedIndex}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm',
                idx === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onClick={() => execute(cmd.id)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <kbd className="ml-4 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
