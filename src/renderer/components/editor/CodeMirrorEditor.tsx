import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { lightTheme, lightHighlight } from './themes/light';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { setActiveView, insertSnippet } from '@/lib/editor-commands';
import { Minimap } from './Minimap';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface Props {
  bufferId: string;
  initialContent: string;
  onChange?: (content: string) => void;
  onCursorChange?: (line: number, column: number) => void;
}

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/avif',
]);

function guessExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/avif': 'avif',
  };
  return map[mimeType] ?? 'png';
}

async function handleImageFile(file: File): Promise<void> {
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = (reader.result as string).split(',')[1];
    if (!base64) return;
    const ext = guessExt(file.type);
    const result = await window.electronAPI.invoke('save-pasted-image', { base64, ext });
    if (result) {
      insertSnippet(`![${file.name}](${result.relativePath})`);
      toast.success('Image pasted');
    }
  };
  reader.readAsDataURL(file);
}

function createPasteHandler() {
  return EditorView.domEventHandlers({
    paste(event: ClipboardEvent, _view: EditorView) {
      const items = event.clipboardData?.items;
      if (!items) return false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (IMAGE_TYPES.has(item.type)) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          return true;
        }
      }
      return false;
    },
  });
}

export function CodeMirrorEditor({ bufferId, initialContent, onChange, onCursorChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const { resolvedTheme } = useTheme();
  const updateContent = useEditorStore((s) => s.updateContent);
  const setCursor = useEditorStore((s) => s.setCursor);
  const minimap = useSettingsStore((s) => s.minimap);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const buffer = useEditorStore((s) => s.buffers.get(bufferId));
  const content = buffer?.content ?? initialContent;
  const [scrollRatio, setScrollRatio] = useState(0);
  const [visibleRatio, setVisibleRatio] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        history(),
        drawSelection(),
        markdown({ base: markdownLanguage, codeLanguages: [] }),
        autocompletion(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        themeCompartment.current.of(
          resolvedTheme === 'dark' ? [oneDark] : [lightTheme, lightHighlight]
        ),
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            const content = v.state.doc.toString();
            updateContent(bufferId, content);
            onChange?.(content);
          }
          if (v.selectionSet || v.docChanged) {
            const head = v.state.selection.main.head;
            const line = v.state.doc.lineAt(head);
            const lineNo = line.number;
            const col = head - line.from + 1;
            setCursor(bufferId, lineNo, col);
            onCursorChange?.(lineNo, col);
          }
        }),
        EditorView.theme({
          '&': { fontSize: `${editorFontSize}px` },
        }),
        EditorView.domEventHandlers({
          scroll(_event, view) {
            const el = view.scrollDOM;
            const denom = el.scrollHeight - el.clientHeight;
            setScrollRatio(denom > 0 ? el.scrollTop / denom : 0);
            setVisibleRatio(
              el.clientHeight > 0 ? Math.min(1, el.clientHeight / el.scrollHeight) : 1
            );
            return false;
          },
        }),
        createPasteHandler(),
      ],
    });
    const view = new EditorView({ state, parent: ref.current });
    viewRef.current = view;
    setActiveView(view);
    return () => {
      setActiveView(null);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bufferId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        resolvedTheme === 'dark' ? [oneDark] : [lightTheme, lightHighlight]
      ),
    });
  }, [resolvedTheme]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((f) => IMAGE_TYPES.has(f.type));
    for (const file of imageFiles) {
      await handleImageFile(file);
    }
  }, []);

  return (
    <div className="relative h-full overflow-hidden">
      <div
        ref={ref}
        className={cn(
          'h-full overflow-hidden transition-colors duration-150',
          isDragOver && 'ring-2 ring-primary bg-primary/5'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
      {minimap && (
        <Minimap content={content} scrollRatio={scrollRatio} visibleRatio={visibleRatio} />
      )}
    </div>
  );
}
