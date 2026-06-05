import { useEffect } from 'react';
import { useFileStore } from '@/stores/file-store';

/**
 * On mount, re-opens the last folder if one was persisted via the file store's
 * zustand persist middleware. Idempotent — re-running with the same path is a
 * no-op (openFolder's list IPC call would just re-fetch, which is acceptable).
 */
export function useRestoreLastFolder(): void {
  useEffect(() => {
    const { rootPath, openFolder, tree } = useFileStore.getState();
    if (rootPath && !tree) {
      void openFolder(rootPath);
    }
    // Run once on mount only. Persist hydration happens before AppShell renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
