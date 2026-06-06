import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useZenMode } from '@/hooks/use-zen-mode';
import { useAppStore } from '@/stores/app-store';

describe('useZenMode', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ ...useAppStore.getInitialState(), zenMode: true });
  });

  it('attaches a keydown listener that exits zen mode on Escape', () => {
    renderHook(() => useZenMode());
    expect(useAppStore.getState().zenMode).toBe(true);

    // Simulate Escape keydown
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);

    expect(useAppStore.getState().zenMode).toBe(false);
  });

  it('does nothing if zen mode is already off', () => {
    useAppStore.setState({ ...useAppStore.getInitialState(), zenMode: false });
    const setZenMode = vi.fn();
    useAppStore.setState({ setZenMode });
    renderHook(() => useZenMode());
    // No Escape dispatched; setZenMode should not be called
    expect(setZenMode).not.toHaveBeenCalled();
  });
});
