import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { lightTheme, lightHighlight } from './themes/light';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Minimap } from './Minimap';

interface Props {
  bufferId: string;
  initialContent: string;
  onChange?: (content: string) => void;
  onCursorChange?: (line: number, column: number) => void;
}

export function CodeMirrorEditor({ bufferId, initialContent, onChange, onCursorChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const { resolvedTheme } = useTheme();
  const updateContent = useEditorStore((s) => s.updateContent);
  const setCursor = useEditorStore((s) => s.setCursor);
  const minimap = useSettingsStore((s) => s.minimap);

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
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, indentWithTab]),
        themeCompartment.current.of(resolvedTheme === 'dark' ? [oneDark] : [lightTheme, lightHighlight]),
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
      ],
    });
    const view = new EditorView({ state, parent: ref.current });
    viewRef.current = view;
    return () => {
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

  return (
    <div className="relative h-full overflow-hidden">
      <div ref={ref} className="h-full overflow-hidden" />
      {minimap && <Minimap content={initialContent} />}
    </div>
  );
}