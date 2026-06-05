import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const colors = {
  background: '#ffffff',
  foreground: '#0d0b09',
  cursor: '#e5461f',
  selection: 'rgba(229, 70, 31, 0.15)',
  gutterBackground: '#fafbfc',
  gutterForeground: '#7a7878',
  lineHighlight: 'rgba(0, 0, 0, 0.04)',
};

export const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: colors.background,
      color: colors.foreground,
      height: '100%',
    },
    '.cm-content': {
      caretColor: colors.cursor,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontSize: '13.5px',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: colors.cursor },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: colors.selection,
    },
    '.cm-gutters': {
      backgroundColor: colors.gutterBackground,
      color: colors.gutterForeground,
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: colors.lineHighlight },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#e5461f' },
  },
  { dark: false }
);

const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: '#0d0b09', fontWeight: '700' },
  { tag: t.heading2, color: '#0d0b09', fontWeight: '700' },
  { tag: t.heading3, color: '#464646', fontWeight: '600' },
  { tag: t.link, color: '#e5461f', textDecoration: 'underline' },
  { tag: t.url, color: '#e5461f' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.monospace, color: '#c93a18' },
  { tag: t.list, color: '#0ea5e9' },
  { tag: t.quote, color: '#7a7878', fontStyle: 'italic' },
]);

export const lightHighlight = syntaxHighlighting(highlightStyle);
