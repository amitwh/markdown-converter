import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';
import { useCommandStore } from '@/stores/command-store';
import { useAppStore } from '@/stores/app-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

describe('modal commands', () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useAppStore.setState({ modal: { kind: null } } as any);
    useFileStore.setState({ activeTabId: '/x.md', openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/x.md', { id: '/x.md', path: '/x.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('settings.open opens settings modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('settings.open');
    expect(useAppStore.getState().modal).toEqual({ kind: 'settings' });
  });

  it('help.about opens about modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('help.about');
    expect(useAppStore.getState().modal).toEqual({ kind: 'about' });
  });

  it('help.welcome opens welcome modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('help.welcome');
    expect(useAppStore.getState().modal).toEqual({ kind: 'welcome' });
  });

  it('file.exportPdf opens export-pdf modal with active path', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('file.exportPdf');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-pdf', props: { sourcePath: '/x.md' } });
  });

  it('file.exportDocx opens export-docx modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('file.exportDocx');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-docx', props: { sourcePath: '/x.md' } });
  });

  it('file.exportBatch opens export-batch modal with all open files', () => {
    useFileStore.setState({ activeTabId: '/x.md', openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }, { id: '/y.md', path: '/y.md', title: 'y.md', dirty: false }] } as any);
    registerMenuCommands();
    useCommandStore.getState().dispatch('file.exportBatch');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-batch', props: { sourcePaths: ['/x.md', '/y.md'] } });
  });
});