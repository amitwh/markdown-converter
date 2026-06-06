import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

function extractHeadings(content: string): { level: number; text: string }[] {
  const lines = content.split('\n');
  const headings: { level: number; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  }
  return headings;
}

export function Breadcrumb() {
  const activeTabId = useFileStore((s) => s.activeTabId);
  const openTabs = useFileStore((s) => s.openTabs);
  const buffer = useEditorStore((s) => (activeTabId ? s.buffers.get(activeTabId) : undefined));
  const showSymbols = useSettingsStore((s) => s.breadcrumbSymbols);

  const tab = activeTabId ? openTabs.find((t) => t.id === activeTabId) : null;
  const headings = showSymbols && buffer ? extractHeadings(buffer.content).slice(0, 3) : [];

  return (
    <nav
      aria-label="File path"
      className="flex h-7 items-center gap-1 border-b border-border bg-card/10 px-3 text-xs text-muted-foreground"
    >
      <span>{tab ? tab.title : 'No file selected'}</span>
      {headings.map((h, i) => (
        <span key={i} className="flex items-center gap-1">
          <span aria-hidden="true">›</span>
          <span className="truncate">{'#'.repeat(h.level)} {h.text}</span>
        </span>
      ))}
    </nav>
  );
}