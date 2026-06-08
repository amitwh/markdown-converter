import { create } from 'zustand';
import { ipc } from '@/lib/ipc';

type State = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

interface UpdaterState {
  state: State;
  version: string | null;
  percent: number;
  lastCheckAt: number;
  applyStatus: (s: { state: State; version?: string; percent?: number; code?: string }) => void;
  check: () => Promise<void>;
  install: () => void;
}

const DEBOUNCE_MS = 60_000;

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  state: 'idle',
  version: null,
  percent: 0,
  lastCheckAt: 0,
  applyStatus: (s) =>
    set({
      state: s.state,
      version: s.version ?? get().version,
      percent: s.percent ?? get().percent,
    }),
  check: async () => {
    if (Date.now() - get().lastCheckAt < DEBOUNCE_MS) return;
    set({ lastCheckAt: Date.now() });
    await ipc.updater.check();
  },
  install: () => ipc.updater.install(),
}));

// Subscribe to live updates from main
if (typeof window !== 'undefined' && (window as any).electronAPI?.updater?.onStatus) {
  (window as any).electronAPI.updater.onStatus((payload: any) => {
    useUpdaterStore.getState().applyStatus(payload);
  });
}
