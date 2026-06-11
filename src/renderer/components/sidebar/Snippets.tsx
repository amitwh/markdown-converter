import { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Search, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { insertSnippet } from '@/lib/editor-commands';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';

interface Snippet {
  id: string;
  name: string;
  language: string;
  code: string;
}

export function Snippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('text');
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await window.electronAPI.invoke('get-snippets');
      setSnippets(list || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load snippets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      toast.error('Name and Code are required');
      return;
    }
    const snippet: Snippet = {
      id: Date.now().toString(),
      name: name.trim(),
      language: language.trim() || 'text',
      code,
    };
    try {
      await window.electronAPI.invoke('save-snippet', snippet);
      toast.success('Snippet added successfully');
      setOpen(false);
      setName('');
      setLanguage('text');
      setCode('');
      load();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to save snippet');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.invoke('delete-snippet', id);
      toast.success('Snippet deleted');
      load();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to delete snippet');
    }
  };

  const handleInsert = (text: string) => {
    const success = insertSnippet(text);
    if (success) {
      toast.success('Snippet inserted');
    } else {
      toast.error('No active document open');
    }
  };

  const filtered = snippets.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.language || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 p-1 text-xs">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search snippets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-8 text-xs bg-background/50 border-border/60 focus-visible:ring-brand/50"
          />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0 hover:bg-accent border-border/60 hover:text-brand"
              title="Add snippet"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleAdd}>
              <DialogHeader>
                <DialogTitle>Add Snippet</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Code Block"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="language">Language</Label>
                  <Input
                    id="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    placeholder="e.g. javascript, markdown"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Textarea
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Paste code or text here..."
                    className="min-h-[150px] font-mono text-xs"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" className="bg-brand hover:bg-brand-dark text-white">
                  Save Snippet
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading && snippets.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center text-muted-foreground border border-dashed border-border/40 rounded-lg bg-card/5">
          <FileText className="h-5 w-5 text-muted-foreground/60" />
          <span>{search ? 'No snippets match search' : 'No snippets yet'}</span>
          {!search && (
            <Button
              size="sm"
              variant="link"
              onClick={() => setOpen(true)}
              className="text-brand hover:text-brand-dark p-0 h-auto"
            >
              Add first snippet
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {filtered.map((s) => (
            <div
              key={s.id}
              onClick={() => handleInsert(s.code)}
              className="group flex flex-col gap-1 rounded border border-border/40 bg-card/20 p-2 hover:bg-accent/40 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground truncate">{s.name}</span>
                <span className="rounded bg-accent/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {s.language}
                </span>
              </div>
              <pre className="m-0 select-none overflow-hidden rounded bg-accent/20 p-1 font-mono text-[10px] text-muted-foreground/80 max-h-[60px] line-clamp-3">
                <code>{s.code}</code>
              </pre>
              <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 hover:text-destructive hover:bg-transparent"
                  onClick={(e) => handleDelete(s.id, e)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 hover:text-brand hover:bg-transparent"
                  title="Insert"
                >
                  <Play className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
