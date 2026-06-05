import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCommandStore, CommandHandler } from '@/stores/command-store';

describe('useCommandStore', () => {
  beforeEach(() => {
    useCommandStore.setState({ handlers: {} });
  });

  it('register stores a handler keyed by id', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('file.open', handler);
    expect(useCommandStore.getState().handlers['file.open']).toBe(handler);
  });

  it('register overwrites any existing handler for the same id', () => {
    const a = vi.fn();
    const b = vi.fn();
    useCommandStore.getState().register('file.open', a);
    useCommandStore.getState().register('file.open', b);
    expect(useCommandStore.getState().handlers['file.open']).toBe(b);
  });

  it('dispatch invokes the registered handler with the provided args', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('file.save', handler);
    useCommandStore.getState().dispatch('file.save', { path: '/x.md' });
    expect(handler).toHaveBeenCalledWith({ path: '/x.md' });
  });

  it('dispatch with no args calls the handler with undefined', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('view.toggleSidebar', handler);
    useCommandStore.getState().dispatch('view.toggleSidebar');
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('dispatch on an unregistered id is a no-op (no throw)', () => {
    expect(() => useCommandStore.getState().dispatch('does.not.exist')).not.toThrow();
  });

  it('unregister removes a handler', () => {
    const handler = vi.fn();
    useCommandStore.getState().register('file.open', handler);
    useCommandStore.getState().unregister('file.open');
    expect(useCommandStore.getState().handlers['file.open']).toBeUndefined();
    useCommandStore.getState().dispatch('file.open');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unregister on a missing id is a no-op', () => {
    expect(() => useCommandStore.getState().unregister('does.not.exist')).not.toThrow();
  });

  it('get returns the handler or undefined', () => {
    const handler: CommandHandler = () => {};
    useCommandStore.getState().register('file.open', handler);
    expect(useCommandStore.getState().get('file.open')).toBe(handler);
    expect(useCommandStore.getState().get('does.not.exist')).toBeUndefined();
  });

  it('registerMany registers multiple handlers in one call', () => {
    const a = vi.fn();
    const b = vi.fn();
    useCommandStore.getState().registerMany({
      'file.open': a,
      'file.save': b,
    });
    expect(useCommandStore.getState().handlers['file.open']).toBe(a);
    expect(useCommandStore.getState().handlers['file.save']).toBe(b);
  });

  it('registerMany does not clear handlers that were already registered', () => {
    const existing = vi.fn();
    const added = vi.fn();
    useCommandStore.getState().register('file.open', existing);
    useCommandStore.getState().registerMany({ 'file.save': added });
    expect(useCommandStore.getState().handlers['file.open']).toBe(existing);
    expect(useCommandStore.getState().handlers['file.save']).toBe(added);
  });
});
