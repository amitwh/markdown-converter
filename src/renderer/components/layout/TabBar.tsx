import { X } from 'lucide-react';
import { useFileStore } from '@/stores/file-store';
import { cn } from '@/lib/utils';

export function TabBar() {
  const openTabs = useFileStore((s) => s.openTabs);
  const activeTabId = useFileStore((s) => s.activeTabId);
  const setActiveTab = useFileStore((s) => s.setActiveTab);
  const closeTab = useFileStore((s) => s.closeTab);

  if (openTabs.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-border bg-card/20 px-3 text-xs text-muted-foreground">
        <span>No files open</span>
      </div>
    );
  }

  return (
    <div className="flex h-9 items-center border-b border-border bg-card/20 overflow-x-auto">
      <div className="flex h-full items-center px-1">
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex h-full cursor-pointer items-center gap-1 border-r border-border px-3 text-xs transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.dirty && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes" />
              )}
              <span className="truncate max-w-[120px]">{tab.title}</span>
              <button
                aria-label={`Close ${tab.title}`}
                className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
