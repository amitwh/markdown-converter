import { useEffect, useRef } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { FindReplaceBar } from './FindReplaceBar';
import { useEditorStore } from '@/stores/editor-store';
import { usePreviewStore } from '@/stores/preview-store';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/lib/toast';

export function EditorPane() {
  const { buffers, activeId } = useEditorStore();
  const buf = activeId ? buffers.get(activeId) : null;
  const setPreviewSource = usePreviewStore((s) => s.setSource);
  const lastActiveId = useRef<string | null>(null);

  useEffect(() => {
    if (!buf) return;
    const isNewFile = lastActiveId.current !== buf.id;
    lastActiveId.current = buf.id;

    const isLarge = buf.content.length > 1024 * 1024;

    if (isLarge) {
      if (!usePreviewStore.getState().largeFileMode) {
        usePreviewStore.setState({ largeFileMode: true });
        useAppStore.setState({ previewVisible: false });
        toast.warning(
          'Large content detected (>1MB). Large File Mode enabled to maintain peak responsiveness. Live preview auto-render is disabled.'
        );
      }

      // Only render on initial load / tab switch, not on edits
      if (isNewFile) {
        usePreviewStore.getState().forceRender(buf.content);
      }
    } else {
      if (usePreviewStore.getState().largeFileMode) {
        usePreviewStore.setState({ largeFileMode: false });
      }
      setPreviewSource(buf.content);
    }
  }, [buf?.id, buf?.content, buf, setPreviewSource]);

  if (!buf) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <p>No file open. Use File → Open to start.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <FindReplaceBar />
      <div className="flex-1 overflow-hidden">
        <CodeMirrorEditor key={buf.id} bufferId={buf.id} initialContent={buf.content} />
      </div>
    </div>
  );
}
