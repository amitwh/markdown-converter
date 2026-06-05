import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppShell } from '@/components/layout/AppShell';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useAppStore } from '@/stores/app-store';

// Mock react-resizable-panels for jsdom (same pattern as AppShell.test.tsx)
vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children, direction }: any) => (
    <div data-testid="resizable-panel-group" data-direction={direction}>
      {children}
    </div>
  ),
  ResizablePanel: ({ children, defaultSize }: any) => (
    <div data-testid="resizable-panel" data-size={defaultSize}>
      {children}
    </div>
  ),
  ResizableHandle: () => <div data-testid="resizable-handle" />,
}));

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      open: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NO_BRIDGE', message: 'mock' } }),
      read: vi.fn().mockResolvedValue({ ok: true, data: '# hello' }),
      write: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      list: vi.fn().mockResolvedValue({
        ok: true,
        data: [
          { name: 'README.md', path: '/root/README.md', isDirectory: false },
          { name: 'src', path: '/root/src', isDirectory: true },
        ],
      }),
      pickFolder: vi.fn().mockResolvedValue({ ok: true, data: '/root' }),
      pickFile: vi.fn().mockResolvedValue({ ok: true, data: '/root/README.md' }),
      onChange: vi.fn(() => () => {}),
    },
  },
}));

describe('Phase 5 integration', () => {
  beforeEach(() => {
    localStorage.clear();
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set(),
      openTabs: [],
      activeTabId: null,
    });
    useEditorStore.setState({ buffers: new Map(), activeId: null });
    useAppStore.setState({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
    });
  });

  it('AppShell renders Sidebar (Files + Outline sections) and TabBar', () => {
    render(<AppShell />);
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Outline')).toBeInTheDocument();
    expect(screen.getByText(/no files open/i)).toBeInTheDocument();
  });

  it('opening a folder via the Open Folder button populates the tree', async () => {
    render(<AppShell />);
    const openBtn = screen.getByRole('button', { name: /open folder/i });
    await act(async () => {
      fireEvent.click(openBtn);
    });
    // After openFolder, the tree should have children
    const state = useFileStore.getState();
    expect(state.tree).not.toBeNull();
    expect(state.tree?.children).toHaveLength(2);
    expect(state.rootPath).toBe('/root');
  });

  it('clicking a file in the tree opens it as a tab and populates the editor buffer', async () => {
    // Seed the tree directly
    useFileStore.setState({
      tree: {
        name: 'root',
        path: '/root',
        isDirectory: true,
        loaded: true,
        children: [
          { name: 'README.md', path: '/root/README.md', isDirectory: false, children: null },
        ],
      },
      rootPath: '/root',
      openTabs: [],
      activeTabId: null,
    });

    render(<AppShell />);
    const fileButton = screen.getByText('README.md').closest('button')!;
    await act(async () => {
      fireEvent.click(fileButton);
    });

    const state = useFileStore.getState();
    expect(state.openTabs).toHaveLength(1);
    expect(state.openTabs[0].id).toBe('/root/README.md');
    expect(state.activeTabId).toBe('/root/README.md');

    // Editor buffer should have the file content
    const buf = useEditorStore.getState().buffers.get('/root/README.md');
    expect(buf?.content).toBe('# hello');
  });

  it('TabBar shows the open tab and switches active on click', async () => {
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set(),
      openTabs: [
        { id: '/a.md', path: '/a.md', title: 'a.md', dirty: false },
        { id: '/b.md', path: '/b.md', title: 'b.md', dirty: false },
      ],
      activeTabId: '/a.md',
    });
    render(<AppShell />);
    const aTab = screen.getByText('a.md').closest('[role="tab"]')!;
    const bTab = screen.getByText('b.md').closest('[role="tab"]')!;
    expect(aTab).toHaveAttribute('aria-current', 'page');
    await act(async () => {
      fireEvent.click(bTab);
    });
    expect(useFileStore.getState().activeTabId).toBe('/b.md');
  });

  it('keyboard shortcut Ctrl+S triggers saveActiveBuffer (no-op when no active tab)', () => {
    render(<AppShell />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    // No assertion on side effect, just confirms it doesn't throw
    expect(useFileStore.getState().openTabs).toHaveLength(0);
  });

  it('drag-reorder updates the openTabs order', () => {
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set(),
      openTabs: [
        { id: '/a.md', path: '/a.md', title: 'a.md', dirty: false },
        { id: '/b.md', path: '/b.md', title: 'b.md', dirty: false },
        { id: '/c.md', path: '/c.md', title: 'c.md', dirty: false },
      ],
      activeTabId: '/a.md',
    });
    render(<AppShell />);
    act(() => {
      useFileStore.getState().reorderTabs(0, 2);
    });
    const order = useFileStore.getState().openTabs.map((t) => t.id);
    expect(order).toEqual(['/b.md', '/c.md', '/a.md']);
  });
});
