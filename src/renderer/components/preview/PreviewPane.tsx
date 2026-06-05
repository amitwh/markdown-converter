import { MarkdownRenderer } from './MarkdownRenderer';
import { usePreviewStore } from '@/stores/preview-store';
import { useScrollSync } from '@/hooks/use-scroll-sync';

export function PreviewPane() {
  const { source, setScrollRatio } = usePreviewStore();
  const { handlePreviewScroll } = useScrollSync({ onPreviewScroll: setScrollRatio });

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Nothing to preview. Start typing in the editor.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-card/10" onScroll={handlePreviewScroll}>
      <MarkdownRenderer source={source} />
    </div>
  );
}
