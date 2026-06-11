import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      pickFolder: vi.fn(),
      list: vi.fn(),
      pickFile: vi.fn(),
      read: vi.fn(),
      write: vi.fn(),
      gitStatus: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
  },
}));

describe('Sidebar', () => {
  beforeEach(() => {
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set(),
      openTabs: [],
      activeTabId: null,
    });
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('renders without crashing with empty state in all sections', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Sidebar />
      </ThemeProvider>
    );
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Outline')).toBeInTheDocument();
    expect(screen.getByText('Snippets')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
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
        children: [
          { name: 'README.md', path: '/project/README.md', isDirectory: false, children: null },
        ],
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
    expect(screen.getByText('Snippets')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('renders "Open Folder" button when no folder is open', () => {
    useFileStore.setState({ tree: null, rootPath: null });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Sidebar />
      </ThemeProvider>
    );

    expect(screen.getByText(/no folder opened/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /open folder/i });
    expect(btn).toBeInTheDocument();
  });

  it('clicking "Open Folder" button calls openFolderDialog', async () => {
    const { ipc } = await import('@/lib/ipc');
    const spy = vi.spyOn(useFileStore.getState(), 'openFolderDialog');

    useFileStore.setState({ tree: null, rootPath: null });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <Sidebar />
      </ThemeProvider>
    );

    const btn = screen.getByRole('button', { name: /open folder/i });
    fireEvent.click(btn);

    expect(spy).toHaveBeenCalled();
  });
});
