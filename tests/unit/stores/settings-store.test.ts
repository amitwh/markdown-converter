import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';

describe('useSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it('has sensible defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.fontSize).toBe(14);
    expect(s.theme).toBe('system');
    expect(s.pdfFormat).toBe('a4');
    expect(s.docxTemplate).toBe('standard');
    expect(s.renderTablesAsAscii).toBe(false);
    expect(s.welcomeDismissed).toBe(false);
  });

  it('setSetting updates a leaf field', () => {
    useSettingsStore.getState().setSetting('fontSize', 18);
    expect(useSettingsStore.getState().fontSize).toBe(18);
  });

  it('resetToDefaults restores all defaults', () => {
    useSettingsStore.getState().setSetting('fontSize', 22);
    useSettingsStore.getState().setSetting('theme', 'dark');
    useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().fontSize).toBe(14);
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('persists only leaf settings (partialize), not actions', () => {
    useSettingsStore.getState().setSetting('fontSize', 16);
    useSettingsStore.getState().setSetting('docxTemplate', 'modern');
    const raw = localStorage.getItem('mc-settings-store');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.fontSize).toBe(16);
    expect(parsed.state.docxTemplate).toBe('modern');
    expect(parsed.state.setSetting).toBeUndefined();
    expect(parsed.state.resetToDefaults).toBeUndefined();
  });
});
