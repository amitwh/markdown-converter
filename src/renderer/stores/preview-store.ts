import { create } from 'zustand';

interface PreviewState {
  source: string;
  scrollRatio: number;
  largeFileMode: boolean;
  setSource: (s: string) => void;
  setScrollRatio: (r: number) => void;
  setLargeFileMode: (v: boolean) => void;
  forceRender: (s: string) => void;
}

const DEBOUNCE_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string = '';

export const usePreviewStore = create<PreviewState>((set) => ({
  source: '',
  scrollRatio: 0,
  largeFileMode: false,
  setSource: (s) => {
    // If in large file mode, do not auto-update preview source on user typing
    if (usePreviewStore.getState().largeFileMode) {
      return;
    }
    pending = s;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      set({ source: pending });
    }, DEBOUNCE_MS);
  },
  setScrollRatio: (r) => set({ scrollRatio: r }),
  setLargeFileMode: (v) => set({ largeFileMode: v }),
  forceRender: (s) => {
    if (timer) clearTimeout(timer);
    set({ source: s });
  },
}));
