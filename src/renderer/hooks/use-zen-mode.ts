import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

/**
 * Mounts a global keydown listener that exits zen mode when the user
 * presses Escape. Should be called once at the App root.
 */
export function useZenMode() {
  const zenMode = useAppStore((s) => s.zenMode);
  const setZenMode = useAppStore((s) => s.setZenMode);

  useEffect(() => {
    if (!zenMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setZenMode(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zenMode, setZenMode]);
}
