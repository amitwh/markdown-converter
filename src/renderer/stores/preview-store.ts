import { create } from 'zustand';

interface PreviewState {
  source: string;
  scrollRatio: number;
  setSource: (s: string) => void;
  setScrollRatio: (r: number) => void;
}

const DEBOUNCE_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string = '';

export const usePreviewStore = create<PreviewState>((set) => ({
  source: '',
  scrollRatio: 0,
  setSource: (s) => {
    pending = s;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      set({ source: pending });
    }, DEBOUNCE_MS);
  },
  setScrollRatio: (r) => set({ scrollRatio: r }),
}));
