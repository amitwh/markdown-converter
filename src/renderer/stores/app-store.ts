import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaneSizes {
  sidebar: number;
  editor: number;
  preview: number;
}

interface AppState {
  sidebarVisible: boolean;
  previewVisible: boolean;
  zenMode: boolean;
  paneSizes: PaneSizes;
  toggleSidebar: () => void;
  togglePreview: () => void;
  setZenMode: (value: boolean) => void;
  setPaneSizes: (sizes: PaneSizes) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      togglePreview: () => set((s) => ({ previewVisible: !s.previewVisible })),
      setZenMode: (value) => set({ zenMode: value }),
      setPaneSizes: (sizes) => set({ paneSizes: sizes }),
    }),
    { name: 'mc-app-store' }
  )
);