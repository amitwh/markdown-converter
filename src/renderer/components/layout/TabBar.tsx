import { X } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFileStore, type OpenTab } from '@/stores/file-store';
import { cn } from '@/lib/utils';

function SortableTab({
  tab,
  isActive,
  onSelect,
  onClose,
}: {
  tab: OpenTab;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="tab"
      aria-selected={isActive}
      aria-current={isActive ? 'page' : undefined}
      data-testid={`tab-${tab.id}`}
      className={cn(
        'group flex h-full cursor-pointer select-none items-center gap-1 border-r border-border px-3 text-xs transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
      onClick={() => onSelect(tab.id)}
    >
      {tab.dirty && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-label="Unsaved changes"
        />
      )}
      <span className="max-w-[120px] truncate">{tab.title}</span>
      <button
        aria-label={`Close ${tab.title}`}
        className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20 transition-opacity"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function TabBar() {
  const openTabs = useFileStore((s) => s.openTabs);
  const activeTabId = useFileStore((s) => s.activeTabId);
  const setActiveTab = useFileStore((s) => s.setActiveTab);
  const closeTab = useFileStore((s) => s.closeTab);
  const reorderTabs = useFileStore((s) => s.reorderTabs);

  // Require a small drag distance before activating — so a click on the tab
  // body still triggers `onClick` (dnd-kit's PointerSensor default is 0).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  if (openTabs.length === 0) {
    return (
      <div className="flex h-9 items-center border-b border-border bg-card/20 px-3 text-xs text-muted-foreground">
        <span>No files open</span>
      </div>
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIndex = openTabs.findIndex((t) => t.id === active.id);
    const toIndex = openTabs.findIndex((t) => t.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    reorderTabs(fromIndex, toIndex);
  }

  return (
    <div className="flex h-9 items-center border-b border-border bg-card/20 overflow-x-auto">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={openTabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex h-full items-center px-1">
            {openTabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                onSelect={setActiveTab}
                onClose={closeTab}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
