import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { settingsSchema, type Settings } from '@/lib/validators';

type SettingsLeaf = keyof Omit<Settings, never>;

interface SettingsState extends Settings {
  setSetting: <K extends SettingsLeaf>(key: K, value: Settings[K]) => void;
  resetToDefaults: () => void;
}

const DEFAULTS = settingsSchema.parse({});

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSetting: (key, value) => set((s) => ({ ...s, [key]: value }) as Partial<SettingsState>),
      resetToDefaults: () => set(() => ({ ...DEFAULTS })),
    }),
    {
      name: 'mc-settings-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { setSetting, resetToDefaults, ...rest } = state;
        return rest;
      },
      // onRehydrateStorage must NOT call useSettingsStore.setState() — at the
      // moment the callback runs the store is still being constructed, and
      // setState can hit a TDZ ReferenceError. Instead, return a normalized
      // state object from this callback. Zustand's persist middleware will
      // merge it into the store *after* construction completes.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const result = settingsSchema.safeParse(state);
        if (!result.success) {
          console.warn(
            '[settings-store] invalid persisted state, replacing with defaults',
            result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')
          );
          return { ...DEFAULTS } as Partial<SettingsState>;
        }
        return result.data as Partial<SettingsState>;
      },
    }
  )
);
