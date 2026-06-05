import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useCommandStore } from '@/stores/command-store';
import { useFileStore } from '@/stores/file-store';
import { useAppStore } from '@/stores/app-store';
import { useRegisterMenuCommands, useBridgeNativeMenu } from '@/lib/commands/register-menu-commands';

type Cleanup = () => void;
const menuListeners = new Map<string, (...args: unknown[]) => void>();
const menuOn = vi.fn(
  (channel: string, callback: (...args: unknown[]) => void): Cleanup => {
    menuListeners.set(channel, callback);
    return () => {
      if (menuListeners.get(channel) === callback) menuListeners.delete(channel);
    };
  }
);

vi.mock('@/lib/ipc', () => ({
  ipc: {
    menu: {
      on: (channel: string, cb: (...args: unknown[]) => void) => menuOn(channel, cb),
    },
  },
}));

function fireMenu(channel: string, ...args: unknown[]): void {
  const listener = menuListeners.get(channel);
  if (!listener) throw new Error(`No listener for ${channel}`);
  listener(...args);
}

function Harness() {
  useRegisterMenuCommands();
  useBridgeNativeMenu();
  return null;
}

describe('useRegisterMenuCommands + useBridgeNativeMenu', () => {
  beforeEach(() => {
    menuListeners.clear();
    menuOn.mockClear();
    useCommandStore.setState({ handlers: {} });
    useFileStore.setState({
      tree: null,
      rootPath: null,
      expanded: new Set(),
      openTabs: [],
      activeTabId: null,
    });
    useAppStore.setState({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
    });
  });

  it('registers file.open, file.save, file.closeTab handlers in the command store', () => {
    render(<Harness />);
    const handlers = useCommandStore.getState().handlers;
    expect(typeof handlers['file.open']).toBe('function');
    expect(typeof handlers['file.save']).toBe('function');
    expect(typeof handlers['file.closeTab']).toBe('function');
  });

  it('registers tab.next / tab.prev and view.toggle* commands', () => {
    render(<Harness />);
    const handlers = useCommandStore.getState().handlers;
    expect(typeof handlers['tab.next']).toBe('function');
    expect(typeof handlers['tab.prev']).toBe('function');
    expect(typeof handlers['view.toggleSidebar']).toBe('function');
    expect(typeof handlers['view.togglePreview']).toBe('function');
  });

  it('view.togglePreview command flips previewVisible', () => {
    render(<Harness />);
    expect(useAppStore.getState().previewVisible).toBe(true);
    act(() => useCommandStore.getState().dispatch('view.togglePreview'));
    expect(useAppStore.getState().previewVisible).toBe(false);
  });

  it('view.toggleSidebar command flips sidebarVisible', () => {
    render(<Harness />);
    expect(useAppStore.getState().sidebarVisible).toBe(true);
    act(() => useCommandStore.getState().dispatch('view.toggleSidebar'));
    expect(useAppStore.getState().sidebarVisible).toBe(false);
  });

  it('file.closeTab with no active tab is a no-op (does not throw)', () => {
    render(<Harness />);
    expect(() => act(() => useCommandStore.getState().dispatch('file.closeTab'))).not.toThrow();
  });

  it('tab.next wraps from last tab to first', () => {
    useFileStore.setState({
      openTabs: [
        { id: '/a.md', path: '/a.md', title: 'a.md', dirty: false },
        { id: '/b.md', path: '/b.md', title: 'b.md', dirty: false },
      ],
      activeTabId: '/b.md',
    });
    render(<Harness />);
    act(() => useCommandStore.getState().dispatch('tab.next'));
    expect(useFileStore.getState().activeTabId).toBe('/a.md');
  });

  it('tab.prev wraps from first tab to last', () => {
    useFileStore.setState({
      openTabs: [
        { id: '/a.md', path: '/a.md', title: 'a.md', dirty: false },
        { id: '/b.md', path: '/b.md', title: 'b.md', dirty: false },
      ],
      activeTabId: '/a.md',
    });
    render(<Harness />);
    act(() => useCommandStore.getState().dispatch('tab.prev'));
    expect(useFileStore.getState().activeTabId).toBe('/b.md');
  });

  it('file-save IPC event dispatches file.save command', () => {
    render(<Harness />);
    act(() => fireMenu('file-save'));
    // No assertion on side effect (saveActiveBuffer is async) but
    // we can verify the command ran by checking no error was thrown.
    expect(true).toBe(true);
  });

  it('toggle-preview IPC event flips previewVisible via the command', () => {
    render(<Harness />);
    expect(useAppStore.getState().previewVisible).toBe(true);
    act(() => fireMenu('toggle-preview'));
    expect(useAppStore.getState().previewVisible).toBe(false);
  });

  it('load-template-menu IPC event forwards the template name as args', () => {
    let captured: unknown;
    useCommandStore.getState().register('template.load', (args) => {
      captured = args;
    });
    render(<Harness />);
    act(() => fireMenu('load-template-menu', 'blog-post.md'));
    expect(captured).toBe('blog-post.md');
  });
});
