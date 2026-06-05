import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useShortcut } from '@/hooks/use-shortcut';

describe('useShortcut', () => {
  beforeEach(() => {
    // No-op: each test sets up its own keydown
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the callback when the shortcut matches (mod+s)', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('recognizes metaKey as well as ctrlKey (Mac shortcut)', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('matches plain keys without modifier (just "k")', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('k', cb));
    fireEvent.keyDown(window, { key: 'k' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('matches shift variants (mod+shift+s)', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+shift+s', cb));
    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when shift is required but missing', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+shift+s', cb));
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when the wrong key is pressed', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    fireEvent.keyDown(window, { key: 'x', ctrlKey: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when no modifier is held but one is required', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    fireEvent.keyDown(window, { key: 's' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when the target is an <input>', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 's', ctrlKey: true });
    document.body.removeChild(input);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when the target is a <textarea>', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    fireEvent.keyDown(ta, { key: 's', ctrlKey: true });
    document.body.removeChild(ta);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when the target is contentEditable', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(div);
    fireEvent.keyDown(div, { key: 's', ctrlKey: true });
    document.body.removeChild(div);
    expect(cb).not.toHaveBeenCalled();
  });

  it('calls preventDefault when the shortcut matches', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does NOT call preventDefault when the shortcut does NOT match', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+s', cb));
    const event = new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('supports the special "Tab" key as a non-modifier shortcut', () => {
    const cb = vi.fn();
    renderHook(() => useShortcut('mod+tab', cb));
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('unbinds the listener on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useShortcut('mod+s', cb));
    unmount();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(cb).not.toHaveBeenCalled();
  });

  it('updates the bound callback when the function reference changes', () => {
    const a = vi.fn();
    const b = vi.fn();
    const { rerender } = renderHook(({ cb }) => useShortcut('mod+s', cb), {
      initialProps: { cb: a },
    });
    rerender({ cb: b });
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
