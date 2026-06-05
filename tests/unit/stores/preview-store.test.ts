import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePreviewStore } from '@/stores/preview-store';

describe('usePreviewStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePreviewStore.setState({ html: '', scrollRatio: 0, source: '' });
  });

  it('debounces source updates (300 ms)', () => {
    usePreviewStore.getState().setSource('# a');
    usePreviewStore.getState().setSource('# b');
    usePreviewStore.getState().setSource('# c');
    expect(usePreviewStore.getState().source).toBe('');
    vi.advanceTimersByTime(300);
    expect(usePreviewStore.getState().source).toBe('# c');
  });

  it('updates scroll ratio', () => {
    usePreviewStore.getState().setScrollRatio(0.5);
    expect(usePreviewStore.getState().scrollRatio).toBe(0.5);
  });
});
