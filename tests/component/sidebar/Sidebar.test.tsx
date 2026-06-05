import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

describe('Sidebar', () => {
  beforeEach(() => {
    useFileStore.setState({ tree: null, rootPath: null, expanded: new Set(), openTabs: [], activeTabId: null });
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('renders without crashing with empty state in both sections', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Sidebar />
      </ThemeProvider>
    );
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Outline')).toBeInTheDocument();
    expect(screen.getByText(/no folder opened/i)).toBeInTheDocument();
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
  });

  it('renders FileTree and Outline sections', () => {
    useFileStore.setState({
      tree: {
        name: 'project',
        path: '/project',
        isDirectory: true,
        loaded: true,
        children: [{ name: 'README.md', path: '/project/README.md', isDirectory: false, children: null }],
      },
      rootPath: '/project',
    });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Sidebar />
      </ThemeProvider>
    );

    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Outline')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });
});
