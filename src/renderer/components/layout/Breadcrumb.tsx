import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useCommandStore } from '@/stores/command-store';
import { extractHeadings } from '@/lib/headings';

export function Breadcrumb() {
  const activeTabId = useFileStore((s) => s.activeTabId);
  const openTabs = useFileStore((s) => s.openTabs);
  const buffer = useEditorStore((s) => (activeTabId ? s.buffers.get(activeTabId) : undefined));
  const showSymbols = useSettingsStore((s) => s.breadcrumbSymbols);
  const dispatch = useCommandStore((s) => s.dispatch);

  const tab = activeTabId ? openTabs.find((t) => t.id === activeTabId) : null;
  const headings = showSymbols && buffer ? extractHeadings(buffer.content).slice(0, 3) : [];

  return (
    <nav
      aria-label="File path"
      className="flex h-7 items-center gap-1 border-b border-border bg-card/10 px-3 text-xs text-muted-foreground"
    >
      <span className="truncate">{tab ? tab.title : 'No file selected'}</span>
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => dispatch('editor.gotoHeading', h.line)}
          className="flex items-center gap-1 hover:text-foreground"
        >
          <span aria-hidden="true">›</span>
          <span className="truncate">
            {'#'.repeat(h.level)} {h.text}
          </span>
        </button>
      ))}
    </nav>
  );
}
