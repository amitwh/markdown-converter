import { ChevronRight, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFileStore } from '@/stores/file-store';
import { FileTree } from './FileTree';
import { Outline } from './Outline';
import { GitStatusPanel } from './GitStatusPanel';

export function Sidebar() {
  const tree = useFileStore((s) => s.tree);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Files section */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium hover:bg-accent rounded">
            <ChevronRight size={12} className="rotate-90" />
            Files
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="h-[calc(100vh-240px)]">
            {!tree ? (
              <div className="flex flex-col items-center gap-2 p-4 text-xs text-muted-foreground">
                <span>No folder opened</span>
                <Button size="sm" variant="outline" onClick={() => useFileStore.getState().openFolderDialog()}>
                  <FolderOpen className="mr-1" /> Open Folder
                </Button>
              </div>
            ) : (
              <FileTree />
            )}
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      {/* Outline section */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium hover:bg-accent rounded">
            <ChevronRight size={12} className="rotate-90" />
            Outline
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="h-[calc(100vh-240px)]">
            <Outline />
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>

      {/* Git section */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium hover:bg-accent rounded">
            <ChevronRight size={12} className="rotate-90" />
            Git
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ScrollArea className="h-[calc(100vh-240px)]">
            <GitStatusPanel />
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
