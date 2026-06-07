import { useEffect, useRef, useState } from 'react';
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
import { setActiveView } from '@/lib/editor-commands';
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
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  // Live scroll metrics for the minimap. `0..1` ratios; defaults match
  // Minimap's static defaults so it renders before any scroll event.
  const [scrollRatio, setScrollRatio] = useState(0);
  const [visibleRatio, setVisibleRatio] = useState(1);

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
        EditorView.theme({
          '&': { fontSize: `${editorFontSize}px` },
        }),
        EditorView.domEventHandlers({
          scroll(_event, view) {
            const el = view.scrollDOM;
            const denom = el.scrollHeight - el.clientHeight;
            setScrollRatio(denom > 0 ? el.scrollTop / denom : 0);
            setVisibleRatio(
              el.clientHeight > 0 ? Math.min(1, el.clientHeight / el.scrollHeight) : 1,
            );
            return false;
          },
        }),
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

  return (
    <div className="relative h-full overflow-hidden">
      <div ref={ref} className="h-full overflow-hidden" />
      {minimap && <Minimap content={initialContent} scrollRatio={scrollRatio} visibleRatio={visibleRatio} />}
    </div>
  );
}
