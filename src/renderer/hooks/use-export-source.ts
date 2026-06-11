import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

export interface ExportSource {
  source: string;
  path: string;
  title: string;
}

/**
 * Read the active buffer's content from the editor store. Returns null if
 * no buffer is open. Components handle the null case (prompt to open a file).
 */
export function useExportSource(): ExportSource | null {
  const activeTabId = useFileStore((s) => s.activeTabId);
  const openTabs = useFileStore((s) => s.openTabs);
  const buffer = useEditorStore((s) => (activeTabId ? s.buffers.get(activeTabId) : undefined));

  if (!activeTabId || !buffer) return null;
  const tab = openTabs.find((t) => t.id === activeTabId);
  return {
    source: buffer.content,
    path: activeTabId,
    title: tab?.title ?? activeTabId,
  };
}
