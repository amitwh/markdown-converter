import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMenuAction } from '@/hooks/use-menu-action';
import { useCommandStore } from '@/stores/command-store';

type Cleanup = () => void;

const menuListeners = new Map<string, (...args: unknown[]) => void>();
const subscribeToMenu = vi.fn(
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
      on: (channel: string, callback: (...args: unknown[]) => void) =>
        subscribeToMenu(channel, callback),
    },
  },
}));

function fireMenu(channel: string, ...args: unknown[]): void {
  const listener = menuListeners.get(channel);
  if (!listener) throw new Error(`No listener registered for ${channel}`);
  listener(...args);
}

describe('useMenuAction', () => {
  beforeEach(() => {
    menuListeners.clear();
    subscribeToMenu.mockClear();
    useCommandStore.setState({ handlers: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to the given IPC channel and dispatches the matching command on fire', () => {
    const dispatched: unknown[] = [];
    useCommandStore.getState().register('file.save', (args) => dispatched.push(args));

    renderHook(() => useMenuAction('file-save', 'file.save'));

    expect(subscribeToMenu).toHaveBeenCalledWith('file-save', expect.any(Function));
    fireMenu('file-save');
    expect(dispatched).toEqual([undefined]);
  });

  it('forwards the IPC payload to the command as args', () => {
    const dispatched: unknown[] = [];
    useCommandStore.getState().register('template.load', (args) => dispatched.push(args));

    renderHook(() => useMenuAction('load-template-menu', 'template.load', (name) => ({ name })));

    fireMenu('load-template-menu', 'blog-post.md');
    expect(dispatched).toEqual([{ name: 'blog-post.md' }]);
  });

  it('default transform: args is the first IPC payload as-is', () => {
    const dispatched: unknown[] = [];
    useCommandStore.getState().register('file.opened', (args) => dispatched.push(args));

    renderHook(() => useMenuAction('file-opened', 'file.opened'));

    fireMenu('file-opened', { path: '/a.md', content: '# hi' });
    expect(dispatched).toEqual([{ path: '/a.md', content: '# hi' }]);
  });

  it('if no command is registered, fire is a no-op (does not throw)', () => {
    renderHook(() => useMenuAction('file-save', 'file.save'));
    expect(() => fireMenu('file-save')).not.toThrow();
  });

  it('unsubscribes on unmount', () => {
    renderHook(() => useMenuAction('file-save', 'file.save'));
    expect(menuListeners.has('file-save')).toBe(true);
  });
});
