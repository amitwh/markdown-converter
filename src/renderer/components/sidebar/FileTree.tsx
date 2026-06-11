import { ChevronRight, Folder, FolderOpen, File, FileText } from 'lucide-react';
import { useFileStore } from '@/stores/file-store';
import { cn } from '@/lib/utils';

function FileTreeNode({
  node,
  depth,
}: {
  node: import('@/stores/file-store').FileNode;
  depth: number;
}) {
  const { expanded, activeTabId, loadChildren, toggleExpanded, openFile } = useFileStore();
  const isExpanded = expanded.has(node.path);
  const isActive = activeTabId === node.path;

  if (node.isDirectory) {
    const handleClick = async () => {
      if (!node.loaded) {
        await loadChildren(node.path);
      }
      toggleExpanded(node.path);
    };

    return (
      <div>
        <button
          onClick={handleClick}
          className={cn(
            'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent',
            isActive && 'bg-accent'
          )}
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          <ChevronRight
            size={12}
            className={cn('transition-transform duration-150', isExpanded && 'rotate-90')}
          />
          {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.loaded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => openFile(node.path)}
      className={cn(
        'flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs hover:bg-accent',
        isActive && 'bg-accent text-accent-foreground'
      )}
      style={{ paddingLeft: `${depth * 16 + 4}px` }}
    >
      <FileText size={14} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function FileTree() {
  const tree = useFileStore((s) => s.tree);

  if (!tree) return null;

  return (
    <div className="py-1">
      {tree.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={0} />
      ))}
    </div>
  );
}
