import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/lib/toast';

function pad(s: string, w: number) {
  return s.padEnd(w);
}

function generateTable(rows: number, cols: number, hasHeader: boolean, headers: string[], data: string[][]): string {
  const width = cols;
  const colWidths: number[] = Array.from({ length: width }, (_, c) => {
    const all = [headers[c] ?? '', ...data.map((r) => r[c] ?? '')];
    return Math.max(...all.map((s) => s.length), 3);
  });
  const lines: string[] = [];
  if (hasHeader) {
    lines.push('| ' + Array.from({ length: width }, (_, c) => pad(headers[c] ?? `Col ${c + 1}`, colWidths[c])).join(' | ') + ' |');
    lines.push('| ' + colWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |');
  }
  for (const row of data) {
    lines.push('| ' + Array.from({ length: width }, (_, c) => pad(row[c] ?? '', colWidths[c])).join(' | ') + ' |');
  }
  // Add empty rows if data has fewer
  for (let i = data.length; i < rows; i++) {
    lines.push('| ' + colWidths.map((w) => pad('', w)).join(' | ') + ' |');
  }
  return lines.join('\n');
}

export function TableGeneratorDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);
  const [headers, setHeaders] = useState<string[]>(['Col 1', 'Col 2', 'Col 3']);

  const output = generateTable(rows, cols, hasHeader, headers, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const updateHeadersCount = (newCols: number) => {
    setCols(newCols);
    setHeaders((prev) => {
      if (prev.length < newCols) return [...prev, ...Array(newCols - prev.length).fill('').map((_, i) => `Col ${prev.length + i + 1}`)];
      return prev.slice(0, newCols);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Table generator</DialogTitle>
          <DialogDescription>Specify rows × columns to generate a markdown table</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="table-rows">Rows</Label>
              <Input
                id="table-rows"
                aria-label="Rows"
                type="number"
                min={1}
                max={50}
                value={rows}
                onChange={(e) => setRows(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="table-cols">Columns</Label>
              <Input
                id="table-cols"
                aria-label="Cols"
                type="number"
                min={1}
                max={20}
                value={cols}
                onChange={(e) => updateHeadersCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={hasHeader} onCheckedChange={(c) => setHasHeader(!!c)} aria-label="Header" />
            Include header row
          </label>
          {hasHeader && (
            <div>
              <Label>Header names</Label>
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }, (_, i) => (
                  <Input
                    key={i}
                    aria-label={`Header ${i + 1}`}
                    value={headers[i] ?? ''}
                    onChange={(e) => {
                      const next = [...headers];
                      next[i] = e.target.value;
                      setHeaders(next);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          <div>
            <Label>Output</Label>
            <pre className="overflow-auto rounded border border-border bg-card/30 p-3 text-xs" data-testid="table-output">
              {output}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={closeModal}>Close</Button>
          <Button onClick={handleCopy}>Copy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}