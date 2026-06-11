import { describe, it, expect, beforeEach } from 'vitest';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';
import { useCommandStore } from '@/stores/command-store';
import { useAppStore } from '@/stores/app-store';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('Phase 9 commands', () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useAppStore.setState({ modal: { kind: null } } as any);
    useFileStore.setState({
      activeTabId: '/x.md',
      openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }],
    } as any);
    // Use resetToDefaults to restore store methods (setSetting/resetToDefaults)
    useSettingsStore.getState().resetToDefaults();
  });

  it('tools.ascii opens ascii-generator modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('tools.ascii');
    expect(useAppStore.getState().modal).toEqual({ kind: 'ascii-generator' });
  });

  it('tools.table opens table-generator modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('tools.table');
    expect(useAppStore.getState().modal).toEqual({ kind: 'table-generator' });
  });

  it('tools.findInFiles opens find-in-files modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('tools.findInFiles');
    expect(useAppStore.getState().modal).toEqual({ kind: 'find-in-files' });
  });

  it('tools.exportWord opens export-word modal with active path', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('tools.exportWord');
    expect(useAppStore.getState().modal).toEqual({
      kind: 'export-word',
      props: { sourcePath: '/x.md' },
    });
  });

  it('tools.repl toggles replOpen setting', () => {
    registerMenuCommands();
    expect(useSettingsStore.getState().replOpen).toBe(false);
    useCommandStore.getState().dispatch('tools.repl');
    expect(useSettingsStore.getState().replOpen).toBe(true);
    useCommandStore.getState().dispatch('tools.repl');
    expect(useSettingsStore.getState().replOpen).toBe(false);
  });
});
