import { useEffect, useState } from 'react';
import {
  RefreshCw,
  FileX,
  FilePlus,
  FileEdit,
  FileQuestion,
  GitCommitHorizontal,
  CheckSquare,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFileStore } from '@/stores/file-store';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [staging, setStaging] = useState(false);

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
    const handler = () => load();
    window.addEventListener('mc:git-refresh', handler);
    return () => window.removeEventListener('mc:git-refresh', handler);
  }, [rootPath]);

  const toggleSelect = (filePath: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === status.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(status.map((s) => s.filePath)));
    }
  };

  const stageFiles = async (files: string[]) => {
    if (!rootPath || files.length === 0) return;
    setStaging(true);
    const result = await ipc.file.gitStage({ rootPath, files });
    setStaging(false);
    if (result.ok) {
      toast.success(`Staged ${files.length} file${files.length === 1 ? '' : 's'}`);
      setSelected(new Set());
      window.dispatchEvent(new CustomEvent('mc:git-refresh'));
    } else {
      toast.error(`Failed to stage: ${result.error.message}`);
    }
  };

  const commit = async () => {
    if (!rootPath || !commitMsg.trim()) return;
    setCommitting(true);
    const result = await ipc.file.gitCommit({ rootPath, message: commitMsg.trim() });
    setCommitting(false);
    if (result.ok) {
      toast.success('Changes committed');
      setCommitMsg('');
      setSelected(new Set());
      window.dispatchEvent(new CustomEvent('mc:git-refresh'));
    } else {
      toast.error(`Failed to commit: ${result.error.message}`);
    }
  };

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
    <div className="flex flex-col p-2 text-xs">
      <div className="flex items-center justify-between px-1 py-1">
        <span className="font-semibold">
          {status.length} changed file{status.length === 1 ? '' : 's'}
        </span>
        <Button size="sm" variant="ghost" onClick={load} aria-label="Refresh">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      <div className="mb-1 flex gap-1 px-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={toggleSelectAll}
          data-testid="git-select-all"
        >
          {selected.size === status.length ? 'Deselect All' : 'Select All'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={selected.size === 0 || staging}
          onClick={() => stageFiles(Array.from(selected))}
          data-testid="git-stage-selected"
        >
          Stage Selected
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          disabled={staging}
          onClick={() => stageFiles(status.map((s) => s.filePath))}
          data-testid="git-stage-all"
        >
          Stage All
        </Button>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {status.map((s) => {
          const isSelected = selected.has(s.filePath);
          return (
            <button
              key={s.filePath}
              onClick={() => openFile(s.filePath)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-card/50',
                isSelected && 'bg-accent/40'
              )}
              data-testid="git-status-row"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelect(s.filePath);
                }}
                className="flex-shrink-0"
                aria-label={isSelected ? 'Deselect' : 'Select'}
                data-testid="git-status-checkbox"
              >
                {isSelected ? (
                  <CheckSquare className="h-3 w-3 text-primary" />
                ) : (
                  <Square className="h-3 w-3 text-muted-foreground" />
                )}
              </button>
              {STATUS_ICON[s.status]}
              <span className="w-3 font-mono text-xs">{STATUS_LABEL[s.status]}</span>
              <span className="truncate font-mono">{s.filePath.replace(rootPath + '/', '')}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 space-y-1.5 border-t border-border pt-2">
        <Input
          placeholder="Commit message..."
          className="h-7 text-xs"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          data-testid="git-commit-input"
        />
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          disabled={!commitMsg.trim() || committing}
          onClick={commit}
          data-testid="git-commit-button"
        >
          <GitCommitHorizontal className="h-3 w-3" />
          Commit
        </Button>
      </div>
    </div>
  );
}
