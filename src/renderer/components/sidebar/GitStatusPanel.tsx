import { useEffect, useState } from 'react';
import { RefreshCw, FileX, FilePlus, FileEdit, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFileStore } from '@/stores/file-store';
import { ipc } from '@/lib/ipc';

interface GitStatus {
  filePath: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
}

const STATUS_ICON: Record<GitStatus['status'], JSX.Element> = {
  modified: <FileEdit className="h-3 w-3 text-warning" />,
  added: <FilePlus className="h-3 w-3 text-success" />,
  deleted: <FileX className="h-3 w-3 text-destructive" />,
  untracked: <FileQuestion className="h-3 w-3 text-muted-foreground" />,
};

const STATUS_LABEL: Record<GitStatus['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: '?',
};

export function GitStatusPanel() {
  const rootPath = useFileStore((s) => s.rootPath);
  const openFile = useFileStore((s) => s.openFile);
  const [status, setStatus] = useState<GitStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!rootPath) {
      setStatus([]);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await ipc.file.gitStatus({ rootPath });
    if (!result.ok) {
      setError(result.error.message);
      setStatus([]);
      setLoading(false);
      return;
    }
    setStatus(result.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Listen for git.refresh command via custom event
    const handler = () => load();
    window.addEventListener('mc:git-refresh', handler);
    return () => window.removeEventListener('mc:git-refresh', handler);
  }, [rootPath]);

  if (!rootPath) {
    return <div className="p-3 text-xs text-muted-foreground">No folder open</div>;
  }

  if (error) {
    return (
      <div className="p-3 text-xs">
        <div className="text-destructive">Error: {error}</div>
        <p className="mt-1 text-muted-foreground">Not a git repository, or git not installed.</p>
        <Button size="sm" variant="ghost" onClick={load} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (status.length === 0 && !loading) {
    return <div className="p-3 text-xs text-muted-foreground">Working tree clean</div>;
  }

  return (
    <div className="p-2 text-xs">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="font-semibold">
          {status.length} changed file{status.length === 1 ? '' : 's'}
        </span>
        <Button size="sm" variant="ghost" onClick={load} aria-label="Refresh">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      <div className="space-y-0.5">
        {status.map((s) => (
          <button
            key={s.filePath}
            onClick={() => openFile(s.filePath)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-card/50"
            data-testid="git-status-row"
          >
            {STATUS_ICON[s.status]}
            <span className="w-3 font-mono text-xs">{STATUS_LABEL[s.status]}</span>
            <span className="truncate font-mono">{s.filePath.replace(rootPath + '/', '')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
