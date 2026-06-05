import { PanelLeft, PanelRight, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';

export function AppHeader() {
  const { sidebarVisible, previewVisible } = useAppStore();
  const dispatch = useCommandStore((s) => s.dispatch);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/40 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div
          className="h-7 w-7 rounded-md bg-gradient-to-br from-brand to-brand-dark shadow-[var(--shadow-glow-brand)]"
          aria-label="MarkdownConverter logo"
        />
        <h1 className="font-display text-lg font-bold tracking-tight">MarkdownConverter</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarVisible}
          data-testid="header-toggle-sidebar"
          onClick={() => dispatch('view.toggleSidebar')}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle preview"
          aria-pressed={previewVisible}
          data-testid="header-toggle-preview"
          onClick={() => dispatch('view.togglePreview')}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Keyboard shortcuts"
          data-testid="header-shortcuts"
          onClick={() => dispatch('shortcuts.show')}
        >
          <Keyboard className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
