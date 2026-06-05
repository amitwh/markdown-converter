import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { EditorPane } from '@/components/editor/EditorPane';
import { useEditorStore } from '@/stores/editor-store';
import { CodeMirrorEditor } from '@/components/editor/CodeMirrorEditor';

vi.mock('@/components/editor/CodeMirrorEditor', () => ({
  CodeMirrorEditor: ({ initialContent }: { initialContent: string }) => (
    <div data-testid="codemirror-mock">{initialContent}</div>
  ),
}));

describe('EditorPane', () => {
  beforeEach(() => {
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('renders the empty state when no buffer is open', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <EditorPane />
      </ThemeProvider>
    );
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
  });

  it('renders the editor when a buffer is open', () => {
    useEditorStore.getState().openBuffer('b1', '/x.md', '# hello');
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <EditorPane />
      </ThemeProvider>
    );
    expect(screen.getByTestId('codemirror-mock')).toBeInTheDocument();
    expect(screen.getByTestId('codemirror-mock')).toHaveTextContent('# hello');
  });
});
