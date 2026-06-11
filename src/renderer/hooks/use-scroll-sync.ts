import { useCallback, useRef } from 'react';

interface Options {
  onEditorScroll?: (ratio: number) => void;
  onPreviewScroll?: (ratio: number) => void;
}

export function useScrollSync(opts: Options) {
  const FRAME_MS = 1000 / 60;
  const lastTick = useRef(-FRAME_MS);

  const handleEditorScroll = useCallback(
    (evt: React.UIEvent<HTMLElement>) => {
      const target = evt.currentTarget;
      const ratio = target.scrollTop / Math.max(target.scrollHeight - target.clientHeight, 1);
      const now = performance.now();
      if (now - lastTick.current < FRAME_MS) return;
      lastTick.current = now;
      opts.onEditorScroll?.(ratio);
    },
    [opts]
  );

  const handlePreviewScroll = useCallback(
    (evt: React.UIEvent<HTMLElement>) => {
      const target = evt.currentTarget;
      const ratio = target.scrollTop / Math.max(target.scrollHeight - target.clientHeight, 1);
      opts.onPreviewScroll?.(ratio);
    },
    [opts]
  );

  return { handleEditorScroll, handlePreviewScroll };
}
