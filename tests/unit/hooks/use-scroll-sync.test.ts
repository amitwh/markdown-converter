import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollSync } from '@/hooks/use-scroll-sync';

describe('useScrollSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock performance.now() to return 0 and not auto-advance
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
  });

  it('throttles editor scroll events to 60fps', () => {
    const onScroll = vi.fn();
    const { result } = renderHook(() => useScrollSync({ onEditorScroll: onScroll }));
    const mockEvt = {
      currentTarget: { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 },
    } as any;
    // All calls within the same act() - performance.now() stays at 0
    // First call passes, subsequent calls within FRAME_MS are throttled
    act(() => {
      result.current.handleEditorScroll(mockEvt);
      result.current.handleEditorScroll(mockEvt);
      result.current.handleEditorScroll(mockEvt);
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
