import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppShell } from '@/components/layout/AppShell';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';

// Mock react-resizable-panels (jsdom can't measure DOM for it)
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

const menuListeners = new Map<string, (...args: unknown[]) => void>();
vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      open: vi.fn().mockResolvedValue({ ok: false, error: { code: 'NO_BRIDGE', message: 'mock' } }),
      read: vi.fn().mockResolvedValue({ ok: true, data: '# hello' }),
      write: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      list: vi.fn().mockResolvedValue({
        ok: true,
        data: [{ name: 'README.md', path: '/root/README.md', isDirectory: false }],
      }),
      pickFolder: vi.fn().mockResolvedValue({ ok: true, data: '/root' }),
      pickFile: vi.fn().mockResolvedValue({ ok: true, data: '/root/README.md' }),
      onChange: vi.fn(() => () => {}),
    },
    menu: {
      on: vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
        menuListeners.set(channel, cb);
        return () => {
          if (menuListeners.get(channel) === cb) menuListeners.delete(channel);
        };
      }),
    },
  },
}));

function fireMenu(channel: string, ...args: unknown[]): void {
  const listener = menuListeners.get(channel);
  if (!listener) throw new Error(`No menu listener for ${channel}`);
  listener(...args);
}

describe('Phase 6 integration: menu → command → store', () => {
  beforeEach(() => {
    localStorage.clear();
    menuListeners.clear();
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
    useCommandStore.setState({ handlers: {}, userBindings: {} });
  });

  it('toolbar Open Folder button opens the folder dialog and populates the tree', async () => {
    render(<AppShell />);
    const btn = screen.getByTestId('toolbar-open-folder');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(useFileStore.getState().tree).not.toBeNull();
    expect(useFileStore.getState().rootPath).toBe('/root');
  });

  it('toolbar Save button invokes the registered file.save command (which writes)', async () => {
    // Seed an open buffer
    useFileStore.setState({
      openTabs: [{ id: '/root/doc.md', path: '/root/doc.md', title: 'doc.md', dirty: true }],
      activeTabId: '/root/doc.md',
    });
    useEditorStore.setState({
      buffers: new Map([['/root/doc.md', { id: '/root/doc.md', content: '# x', dirty: true }]]),
      activeId: '/root/doc.md',
    });

    render(<AppShell />);
    const saveBtn = screen.getByTestId('toolbar-save');
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    // After save, the buffer should be clean
    expect(useEditorStore.getState().buffers.get('/root/doc.md')?.dirty).toBe(false);
  });

  it('header toggle sidebar button flips sidebarVisible', async () => {
    render(<AppShell />);
    const btn = screen.getByTestId('header-toggle-sidebar');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(useAppStore.getState().sidebarVisible).toBe(false);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('native menu file-save event triggers save through the command store', async () => {
    useFileStore.setState({
      openTabs: [{ id: '/root/doc.md', path: '/root/doc.md', title: 'doc.md', dirty: true }],
      activeTabId: '/root/doc.md',
    });
    useEditorStore.setState({
      buffers: new Map([['/root/doc.md', { id: '/root/doc.md', content: '# y', dirty: true }]]),
      activeId: '/root/doc.md',
    });

    render(<AppShell />);
    await act(async () => {
      fireMenu('file-save');
    });
    expect(useEditorStore.getState().buffers.get('/root/doc.md')?.dirty).toBe(false);
  });

  it('native menu toggle-preview event flips previewVisible', () => {
    render(<AppShell />);
    expect(useAppStore.getState().previewVisible).toBe(true);
    act(() => {
      fireMenu('toggle-preview');
    });
    expect(useAppStore.getState().previewVisible).toBe(false);
  });

  it('userBindings survive a remount via zustand persist', async () => {
    useCommandStore.getState().setUserBinding('file.save', 'mod+shift+s');
    await useCommandStore.persist?.flush?.();

    // Read raw stored value
    const stored = JSON.parse(localStorage.getItem('mc-command-store') ?? '{}');
    expect(stored.state.userBindings['file.save']).toBe('mod+shift+s');
  });

  it('commands registered in AppShell are accessible by id from any consumer', () => {
    render(<AppShell />);
    const handlers = useCommandStore.getState().handlers;
    expect(typeof handlers['file.open']).toBe('function');
    expect(typeof handlers['file.openFolder']).toBe('function');
    expect(typeof handlers['file.save']).toBe('function');
    expect(typeof handlers['file.closeTab']).toBe('function');
    expect(typeof handlers['tab.next']).toBe('function');
    expect(typeof handlers['tab.prev']).toBe('function');
    expect(typeof handlers['view.toggleSidebar']).toBe('function');
    expect(typeof handlers['view.togglePreview']).toBe('function');
  });
});
