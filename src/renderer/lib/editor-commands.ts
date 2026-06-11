/**
 * Editor command registry — holds a single reference to the active CodeMirror
 * EditorView. The CodeMirrorEditor component calls `setActiveView(view)` on
 * mount and `setActiveView(null)` on unmount, so any command dispatched from
 * a toolbar button, menu IPC, or shortcut lands on the focused buffer.
 *
 * The store is intentionally tiny — it's a module-level singleton rather than
 * a Zustand store, because we need synchronous access to the view from
 * imperative command handlers (the editor state itself is owned by CodeMirror,
 * not by React).
 */
import type { EditorView } from '@codemirror/view';
import { EditorView as CMEditorView } from '@codemirror/view';
import { undo as cmUndo, redo as cmRedo, selectLine } from '@codemirror/commands';

let activeView: EditorView | null = null;

export function setActiveView(view: EditorView | null): void {
  activeView = view;
}

export function getActiveView(): EditorView | null {
  return activeView;
}

/** Wrap a selection in a marker pair, e.g. `**…**`. Unwraps if already wrapped. */
function wrap(marker: string, placeholder: string): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  const sel = state.selection.main;
  const selected = state.doc.sliceString(sel.from, sel.to);
  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: inner },
      selection: { anchor: sel.from + inner.length },
    });
    view.focus();
    return true;
  }
  const content = selected || placeholder;
  const insert = `${marker}${content}${marker}`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
  });
  view.focus();
  return true;
}

/** Replace the current line with a heading of the requested level (0=plain). */
function setLineHeading(level: 0 | 1 | 2 | 3 | 4 | 5 | 6): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  const sel = state.selection.main;
  const line = state.doc.lineAt(sel.head);
  const lineText = state.doc.sliceString(line.from, line.to);
  const headingMatch = lineText.match(/^(#{1,6})\s+(.*)$/);
  const body = headingMatch ? headingMatch[2] : lineText;
  const prefix = level === 0 ? '' : `${'#'.repeat(level)} `;
  const insert = `${prefix}${body}`;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: { anchor: line.from + insert.length },
  });
  view.focus();
  return true;
}

function toggleLinePrefix(prefix: string, existingRe: RegExp): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  const sel = state.selection.main;
  const startLine = state.doc.lineAt(sel.from);
  const endLine = state.doc.lineAt(sel.to);
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = state.doc.line(n);
    const text = state.doc.sliceString(line.from, line.to);
    if (existingRe.test(text)) {
      const newText = text.replace(existingRe, '');
      changes.push({ from: line.from, to: line.to, insert: newText });
    } else {
      const m = text.match(/^([ \t]*)(.*)$/);
      const indent = m ? m[1] : '';
      const rest = m ? m[2] : text;
      const newText = `${indent}${prefix}${rest}`;
      changes.push({ from: line.from, to: line.to, insert: newText });
    }
  }
  view.dispatch({ changes });
  view.focus();
  return true;
}

export function toggleBold(): boolean {
  return wrap('**', 'bold text');
}

export function toggleItalic(): boolean {
  return wrap('*', 'italic text');
}

export function toggleCode(): boolean {
  return wrap('`', 'code');
}

export function toggleCodeBlock(): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  const sel = state.selection.main;
  const startLine = state.doc.lineAt(sel.from);
  const endLine = state.doc.lineAt(sel.to);
  const changes: { from: number; to: number; insert: string }[] = [];
  let hadBlock = true;
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = state.doc.line(n);
    const text = state.doc.sliceString(line.from, line.to);
    if (!text.startsWith('```')) hadBlock = false;
  }
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = state.doc.line(n);
    const text = state.doc.sliceString(line.from, line.to);
    if (hadBlock && text.startsWith('```')) {
      changes.push({ from: line.from, to: line.to, insert: text.slice(3) });
    } else if (!hadBlock && !text.startsWith('```')) {
      changes.push({ from: line.from, to: line.to, insert: '```' + text });
    }
  }
  view.dispatch({ changes });
  view.focus();
  return true;
}

export function toggleUnorderedList(): boolean {
  return toggleLinePrefix('- ', /^[ \t]*(?:-|\*|\+)\s+/);
}

export function toggleOrderedList(): boolean {
  return toggleLinePrefix('1. ', /^[ \t]*\d+\.\s+/);
}

export function insertLink(): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  const sel = state.selection.main;
  const selected = state.doc.sliceString(sel.from, sel.to);
  const text = selected || 'link text';
  const insert = `[${text}](https://)`;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert },
    selection: { anchor: sel.from + insert.length },
  });
  view.focus();
  return true;
}

export function setHeadingLevel(level: 0 | 1 | 2 | 3 | 4 | 5 | 6): boolean {
  return setLineHeading(level);
}

export function scrollToLine(line: number): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  if (line < 1 || line > state.doc.lines) return false;
  const target = state.doc.line(line);
  view.dispatch({
    selection: { anchor: target.from },
    effects: CMEditorView.scrollIntoView(target.from, { y: 'center' }),
  });
  view.focus();
  return true;
}

export function undo(): boolean {
  const view = activeView;
  if (!view) return false;
  cmUndo(view);
  return true;
}

export function redo(): boolean {
  const view = activeView;
  if (!view) return false;
  cmRedo(view);
  return true;
}

export function selectCurrentLine(): boolean {
  const view = activeView;
  if (!view) return false;
  selectLine(view);
  return true;
}

/**
 * Insert a Markdown snippet at the current cursor. Used for templates,
 * table generation, and snippet insertion.
 */
export function insertSnippet(text: string): boolean {
  const view = activeView;
  if (!view) return false;
  const { state } = view;
  const sel = state.selection.main;
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
  });
  view.focus();
  return true;
}
