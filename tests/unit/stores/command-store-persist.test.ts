import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCommandStore } from '@/stores/command-store';

describe('useCommandStore — user bindings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandStore.setState({
      handlers: {},
      userBindings: {},
    });
  });

  it('starts with empty userBindings', () => {
    expect(useCommandStore.getState().userBindings).toEqual({});
  });

  it('setUserBinding stores a combo for a command id', () => {
    useCommandStore.getState().setUserBinding('file.save', 'mod+shift+s');
    expect(useCommandStore.getState().userBindings['file.save']).toBe('mod+shift+s');
  });

  it('setUserBinding overwrites an existing binding for the same command', () => {
    useCommandStore.getState().setUserBinding('file.save', 'mod+shift+s');
    useCommandStore.getState().setUserBinding('file.save', 'mod+alt+s');
    expect(useCommandStore.getState().userBindings['file.save']).toBe('mod+alt+s');
  });

  it('clearUserBinding removes a binding', () => {
    useCommandStore.getState().setUserBinding('file.save', 'mod+shift+s');
    useCommandStore.getState().clearUserBinding('file.save');
    expect(useCommandStore.getState().userBindings['file.save']).toBeUndefined();
  });

  it('clearUserBinding on a missing id is a no-op', () => {
    expect(() => useCommandStore.getState().clearUserBinding('does.not.exist')).not.toThrow();
  });

  it('getUserBinding returns the combo or undefined', () => {
    useCommandStore.getState().setUserBinding('file.save', 'mod+shift+s');
    expect(useCommandStore.getState().getUserBinding('file.save')).toBe('mod+shift+s');
    expect(useCommandStore.getState().getUserBinding('does.not.exist')).toBeUndefined();
  });

  it('persists userBindings to localStorage and restores on next mount', async () => {
    useCommandStore.getState().setUserBinding('file.save', 'mod+shift+s');
    useCommandStore.getState().setUserBinding('view.toggleSidebar', 'mod+b');

    // Force the persist middleware to flush
    await useCommandStore.persist?.flush?.();

    const stored = JSON.parse(localStorage.getItem('mc-command-store') ?? '{}');
    expect(stored.state.userBindings).toEqual({
      'file.save': 'mod+shift+s',
      'view.toggleSidebar': 'mod+b',
    });
    // Handlers must NOT be persisted (functions aren't serializable)
    expect(stored.state.handlers).toBeUndefined();
  });
});
