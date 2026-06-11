import { ChevronRight, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFileStore } from '@/stores/file-store';
import { FileTree } from './FileTree';
import { Outline } from './Outline';
import { Snippets } from './Snippets';
import { Templates } from './Templates';
import { GitStatusPanel } from './GitStatusPanel';

export function Sidebar() {
  const tree = useFileStore((s) => s.tree);

  function scrollToSection(label: string) {
    const el = document.querySelector(`[data-sidebar-section="${label}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <ScrollArea className="h-full pr-3">
      <div className="flex flex-col gap-4 pb-4">
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              data-testid="sidebar-section-files"
              data-sidebar-section="Files"
              className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-semibold hover:bg-accent rounded text-foreground transition-colors"
            >
              <ChevronRight size={12} className="rotate-90" />
              Files
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
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
          </CollapsibleContent>
        </Collapsible>

        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              data-testid="sidebar-section-outline"
              data-sidebar-section="Outline"
              className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-semibold hover:bg-accent rounded text-foreground transition-colors"
            >
              <ChevronRight size={12} className="rotate-90" />
              Outline
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <Outline />
          </CollapsibleContent>
        </Collapsible>

        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              data-testid="sidebar-section-snippets"
              data-sidebar-section="Snippets"
              className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-semibold hover:bg-accent rounded text-foreground transition-colors"
            >
              <ChevronRight size={12} className="rotate-90" />
              Snippets
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <Snippets />
          </CollapsibleContent>
        </Collapsible>

        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              data-testid="sidebar-section-templates"
              data-sidebar-section="Templates"
              className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-semibold hover:bg-accent rounded text-foreground transition-colors"
            >
              <ChevronRight size={12} className="rotate-90" />
              Templates
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <Templates />
          </CollapsibleContent>
        </Collapsible>

        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              data-testid="sidebar-section-git"
              data-sidebar-section="Git"
              className="flex w-full items-center gap-1.5 px-1 py-1.5 text-xs font-semibold hover:bg-accent rounded text-foreground transition-colors"
            >
              <ChevronRight size={12} className="rotate-90" />
              Git
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <GitStatusPanel />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Hidden bridge: when `view.sidebarPanel` is dispatched, scroll the
          matching section into view. The hidden elements expose a hook for
          Playwright tests and the menu handler. */}
      <div className="sr-only" aria-hidden="true">
        <button data-testid="sidebar-jump-explorer" onClick={() => scrollToSection('Files')}>jump-explorer</button>
        <button data-testid="sidebar-jump-outline" onClick={() => scrollToSection('Outline')}>jump-outline</button>
        <button data-testid="sidebar-jump-snippets" onClick={() => scrollToSection('Snippets')}>jump-snippets</button>
        <button data-testid="sidebar-jump-templates" onClick={() => scrollToSection('Templates')}>jump-templates</button>
        <button data-testid="sidebar-jump-git" onClick={() => scrollToSection('Git')}>jump-git</button>
      </div>
    </ScrollArea>
  );
}
