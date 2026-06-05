import { Bold, Italic, List, ListOrdered, Code, Link as LinkIcon, PanelLeft, PanelRight, Save, FolderOpen, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCommandStore } from '@/stores/command-store';
import { useAppStore } from '@/stores/app-store';

export function Toolbar() {
  const dispatch = useCommandStore((s) => s.dispatch);
  const { sidebarVisible, previewVisible } = useAppStore();

  return (
    <div
      role="toolbar"
      aria-label="Main toolbar"
      className="flex h-10 items-center gap-1 border-b border-border bg-card/10 px-3"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open file"
        data-testid="toolbar-open-file"
        onClick={() => dispatch('file.open')}
      >
        <FileText className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open folder"
        data-testid="toolbar-open-folder"
        onClick={() => dispatch('file.openFolder')}
      >
        <FolderOpen className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Save"
        data-testid="toolbar-save"
        onClick={() => dispatch('file.save')}
      >
        <Save className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle sidebar"
        aria-pressed={sidebarVisible}
        data-testid="toolbar-toggle-sidebar"
        onClick={() => dispatch('view.toggleSidebar')}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle preview"
        aria-pressed={previewVisible}
        data-testid="toolbar-toggle-preview"
        onClick={() => dispatch('view.togglePreview')}
      >
        <PanelRight className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <Button variant="ghost" size="icon" aria-label="Bold" disabled><Bold className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Italic" disabled><Italic className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Unordered list" disabled><List className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Ordered list" disabled><ListOrdered className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Code" disabled><Code className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Link" disabled><LinkIcon className="h-4 w-4" /></Button>
    </div>
  );
}
