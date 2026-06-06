import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/app-store';
import { useFileStore } from '@/stores/file-store';
import { ipc } from '@/lib/ipc';

interface SearchResult {
  filePath: string;
  line: number;
  content: string;
}

export function FindInFilesDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useFileStore((s) => s.openFile);

  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query || !rootPath) return;
    setSubmitting(true);
    setError(null);
    const result = await ipc.file.search({ rootPath, query, isRegex, caseSensitive });
    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }
    setResults(result.data ?? []);
    setSubmitting(false);
  };

  const handleResultClick = (filePath: string) => {
    openFile(filePath);
    closeModal();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="find-desc" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find in files</DialogTitle>
          <DialogDescription id="find-desc">
            {rootPath ? `Search in ${rootPath}` : 'No folder open'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="find-query">Query</Label>
            <Input
              id="find-query"
              aria-label="Query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <Checkbox checked={isRegex} onCheckedChange={(c) => setIsRegex(!!c)} aria-label="Regex" />
              Regex
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={caseSensitive} onCheckedChange={(c) => setCaseSensitive(!!c)} aria-label="Case sensitive" />
              Case sensitive
            </label>
          </div>
          {error && (
            <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {results.length > 0 && (
            <div>
              <Label>{results.length} result{results.length === 1 ? '' : 's'}</Label>
              <div className="max-h-64 overflow-auto rounded border border-border bg-card/20 text-xs">
                {results.map((r, i) => (
                  <button
                    key={`${r.filePath}:${r.line}:${i}`}
                    onClick={() => handleResultClick(r.filePath)}
                    className="block w-full truncate border-b border-border/30 px-2 py-1 text-left hover:bg-card/50"
                    data-testid="find-result"
                  >
                    <span className="font-mono text-muted-foreground">{r.filePath}:{r.line}</span>
                    <span className="ml-2">{r.content}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeModal} disabled={submitting}>Close</Button>
          <Button onClick={handleSearch} disabled={submitting || !query}>
            {submitting ? 'Searching…' : 'Search'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
