import { useEffect } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { useEditorStore } from '@/stores/editor-store';
import { usePreviewStore } from '@/stores/preview-store';

export function EditorPane() {
  const { buffers, activeId } = useEditorStore();
  const buf = activeId ? buffers.get(activeId) : null;
  const setPreviewSource = usePreviewStore((s) => s.setSource);

  useEffect(() => {
    if (buf) setPreviewSource(buf.content);
  }, [buf?.id, buf?.content, buf, setPreviewSource]);

  if (!buf) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <p>No file open. Use File → Open to start.</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <CodeMirrorEditor
        key={buf.id}
        bufferId={buf.id}
        initialContent={buf.content}
      />
    </div>
  );
}