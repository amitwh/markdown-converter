import { MarkdownRenderer } from './MarkdownRenderer';
import { usePreviewStore } from '@/stores/preview-store';

export function PreviewPane() {
  const { source } = usePreviewStore();

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Nothing to preview. Start typing in the editor.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-card/10">
      <MarkdownRenderer source={source} />
    </div>
  );
}
