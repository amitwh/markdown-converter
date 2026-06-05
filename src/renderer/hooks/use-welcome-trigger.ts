import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * On first mount, if the user hasn't dismissed the welcome dialog, open it.
 * Call once at the top of App.tsx.
 */
export function useWelcomeTrigger() {
  useEffect(() => {
    if (!useSettingsStore.getState().welcomeDismissed) {
      useAppStore.getState().openModal('welcome');
    }
  }, []);
}
