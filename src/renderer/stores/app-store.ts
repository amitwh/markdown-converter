import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaneSizes {
  sidebar: number;
  editor: number;
  preview: number;
}

export interface ConfirmProps {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export type ModalState =
  | { kind: null }
  | { kind: 'export-pdf'; props: { sourcePath: string } }
  | { kind: 'export-docx'; props: { sourcePath: string } }
  | { kind: 'export-html'; props: { sourcePath: string } }
  | { kind: 'export-batch'; props: { sourcePaths: string[] } }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'welcome' }
  | { kind: 'confirm'; props: ConfirmProps }
  | { kind: 'export-word'; props: { sourcePath: string } }
  | { kind: 'ascii-generator' }
  | { kind: 'table-generator' }
  | { kind: 'find-in-files' }
  | { kind: 'crashReports' }
  | { kind: 'writing-analytics' };

export type ModalKind = ModalState['kind'];

interface AppState {
  sidebarVisible: boolean;
  previewVisible: boolean;
  zenMode: boolean;
  paneSizes: PaneSizes;
  modal: ModalState;
  firstRun: boolean;
  toggleSidebar: () => void;
  togglePreview: () => void;
  setZenMode: (value: boolean) => void;
  setPaneSizes: (sizes: PaneSizes) => void;
  openModal: <K extends NonNullable<ModalKind>>(
    kind: K,
    ...args: Extract<ModalState, { kind: K }> extends { props: infer P } ? [props?: P] : []
  ) => void;
  closeModal: () => void;
  setFirstRun: (value: boolean) => void;
  newBuffer: (content?: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
      modal: { kind: null },
      firstRun: true,
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      togglePreview: () => set((s) => ({ previewVisible: !s.previewVisible })),
      setZenMode: (value) => set({ zenMode: value }),
      setPaneSizes: (sizes) => set({ paneSizes: sizes }),
      openModal: (kind, ...args) =>
        set(() => {
          const candidate = { kind, ...(args[0] ? { props: args[0] } : {}) } as ModalState;
          return { modal: candidate };
        }),
      closeModal: () => set({ modal: { kind: null } }),
      setFirstRun: (value) => set({ firstRun: value }),
      newBuffer: (_content?: string) => set({ firstRun: false }),
    }),
    {
      name: 'mc-app-store',
      partialize: (state) => ({
        sidebarVisible: state.sidebarVisible,
        previewVisible: state.previewVisible,
        zenMode: state.zenMode,
        paneSizes: state.paneSizes,
        // modal is intentionally NOT persisted (runtime-only)
      }),
    }
  )
);
