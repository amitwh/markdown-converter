import { useEditorStore } from '@/stores/editor-store';

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

export function StatusBar() {
  const { buffers, activeId } = useEditorStore();
  const buf = activeId ? buffers.get(activeId) : null;
  const wordCount = buf ? countWords(buf.content) : 0;
  const cursor = buf?.cursor ?? { line: 1, column: 1 };

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-card/20 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>{wordCount} words</span>
        <span>UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Ln {cursor.line}, Col {cursor.column}</span>
        <span>Markdown</span>
      </div>
    </footer>
  );
}
