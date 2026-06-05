import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { Outline } from '@/components/sidebar/Outline';
import { useEditorStore } from '@/stores/editor-store';

describe('Outline', () => {
  beforeEach(() => {
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('renders "No file open" when no active buffer', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Outline />
      </ThemeProvider>
    );
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
  });

  it('renders H1-H6 headings from the active buffer content', () => {
    const buffers = new Map([
      [
        'b1',
        {
          id: 'b1',
          path: '/x.md',
          content: '# Hello\n## World\n### Foo\n#### Bar\n##### Baz\n###### Qux',
          dirty: false,
        },
      ],
    ]);
    useEditorStore.setState({ buffers, activeId: 'b1' });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Outline />
      </ThemeProvider>
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
    expect(screen.getByText('Foo')).toBeInTheDocument();
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.getByText('Baz')).toBeInTheDocument();
    expect(screen.getByText('Qux')).toBeInTheDocument();
  });

  it('renders headings with level-based indent', () => {
    const buffers = new Map([
      [
        'b1',
        {
          id: 'b1',
          path: '/x.md',
          content: '# Title\n## Subtitle\n### Section',
          dirty: false,
        },
      ],
    ]);
    useEditorStore.setState({ buffers, activeId: 'b1' });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Outline />
      </ThemeProvider>
    );

    const buttons = screen.getAllByRole('button');
    // H1 has paddingLeft 8px, H2 has24px, H3 has 40px
    expect(buttons[0]).toHaveStyle('padding-left: 8px');
    expect(buttons[1]).toHaveStyle('padding-left: 24px');
    expect(buttons[2]).toHaveStyle('padding-left: 40px');
  });
});
