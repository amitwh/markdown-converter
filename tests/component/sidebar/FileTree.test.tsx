import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { FileTree } from '@/components/sidebar/FileTree';
import { useFileStore } from '@/stores/file-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      read: vi.fn().mockResolvedValue({ ok: true, data: '' }),
    },
  },
}));

describe('FileTree', () => {
  beforeEach(() => {
    useFileStore.setState({ tree: null, rootPath: null, expanded: new Set(), openTabs: [], activeTabId: null });
  });

  it('renders nothing when tree is null', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <FileTree />
      </ThemeProvider>
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders root children after openFolder', async () => {
    useFileStore.setState({
      tree: {
        name: 'project',
        path: '/project',
        isDirectory: true,
        loaded: true,
        children: [
          { name: 'src', path: '/project/src', isDirectory: true, children: null, loaded: false },
          { name: 'README.md', path: '/project/README.md', isDirectory: false, children: null },
        ],
      },
      rootPath: '/project',
    });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <FileTree />
      </ThemeProvider>
    );

    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('shows folder as expanded after toggle and reveals children', async () => {
    useFileStore.setState({
      tree: {
        name: 'project',
        path: '/project',
        isDirectory: true,
        loaded: true,
        children: [
          {
            name: 'src',
            path: '/project/src',
            isDirectory: true,
            loaded: true,
            children: [
              { name: 'index.ts', path: '/project/src/index.ts', isDirectory: false, children: null },
            ],
          },
        ],
      },
      rootPath: '/project',
      expanded: new Set(['/project/src']),
    });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <FileTree />
      </ThemeProvider>
    );

    expect(screen.getByText('index.ts')).toBeInTheDocument();
  });

  it('highlights the active tab path', () => {
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
      activeTabId: '/project/README.md',
    });

    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <FileTree />
      </ThemeProvider>
    );

    const btn = screen.getByRole('button', { name: /README.md/i });
    expect(btn).toHaveClass('bg-accent');
  });
});
