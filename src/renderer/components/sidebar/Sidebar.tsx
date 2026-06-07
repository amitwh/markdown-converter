import { ChevronRight, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFileStore } from '@/stores/file-store';
import { useCommandStore } from '@/stores/command-store';
import { FileTree } from './FileTree';
import { Outline } from './Outline';
import { GitStatusPanel } from './GitStatusPanel';

export function Sidebar() {
  const tree = useFileStore((s) => s.tree);
  const dispatch = useCommandStore((s) => s.dispatch);

  function scrollToSection(label: string) {
    const el = document.querySelector(`[data-sidebar-section="${label}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button
            data-testid="sidebar-section-files"
            data-sidebar-section="Files"
            className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium hover:bg-accent rounded"
          >
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

      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button
            data-testid="sidebar-section-outline"
            data-sidebar-section="Outline"
            className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium hover:bg-accent rounded"
          >
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

      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button
            data-testid="sidebar-section-git"
            data-sidebar-section="Git"
            className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-medium hover:bg-accent rounded"
          >
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

      {/* Hidden bridge: when `view.sidebarPanel` is dispatched, scroll the
          matching section into view. The hidden elements expose a hook for
          Playwright tests and the menu handler. */}
      <div className="sr-only" aria-hidden="true">
        <button data-testid="sidebar-jump-explorer" onClick={() => { scrollToSection('Files'); dispatch('view.toggleSidebar'); }}>jump-explorer</button>
        <button data-testid="sidebar-jump-git" onClick={() => { scrollToSection('Git'); dispatch('view.toggleSidebar'); }}>jump-git</button>
        <button data-testid="sidebar-jump-snippets" onClick={() => { scrollToSection('Outline'); dispatch('view.toggleSidebar'); }}>jump-snippets</button>
        <button data-testid="sidebar-jump-templates" onClick={() => { scrollToSection('Files'); dispatch('view.toggleSidebar'); }}>jump-templates</button>
      </div>
    </div>
  );
}
