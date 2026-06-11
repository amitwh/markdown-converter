import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useUpdaterStore } from '@/lib/updater-store';

export function useAutoUpdateCheck() {
  const auto = useSettingsStore((s) => s.autoCheckUpdates);
  const check = useUpdaterStore((s) => s.check);
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => {
        check();
      }, 5_000);
      return () => clearTimeout(t);
    }
  }, [auto, check]);
}
