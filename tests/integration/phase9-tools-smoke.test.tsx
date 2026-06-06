import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: {
      getVersion: vi.fn().mockResolvedValue({ ok: true, data: '5.0.0' }),
      openExternal: vi.fn().mockResolvedValue({ ok: true }),
      showSaveDialog: vi.fn().mockResolvedValue({ ok: true, data: '/out.docx' }),
    },
    file: {
      read: vi.fn(),
      write: vi.fn(),
      writeBuffer: vi.fn().mockResolvedValue({ ok: true }),
      list: vi.fn(),
      pickFolder: vi.fn(),
      pickFile: vi.fn(),
      onChange: vi.fn(),
      search: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      gitStatus: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    },
    menu: { on: vi.fn(() => () => {}) },
    print: { show: vi.fn().mockResolvedValue({ ok: true }) },
  },
}));

describe('Phase 9 tools integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAppStore.setState({ modal: { kind: null }, sidebarVisible: true, previewVisible: true, zenMode: false, paneSizes: { sidebar: 20, editor: 50, preview: 30 } } as any);
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: true });
    useFileStore.setState({ activeTabId: '/x.md', openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/x.md', { id: '/x.md', path: '/x.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('tools.ascii opens ascii-generator modal', () => {
    registerMenuCommands();
    render(<App />);
    useCommandStore.getState().dispatch('tools.ascii');
    expect(useAppStore.getState().modal).toEqual({ kind: 'ascii-generator' });
  });

  it('tools.table opens table-generator modal', () => {
    registerMenuCommands();
    render(<App />);
    useCommandStore.getState().dispatch('tools.table');
    expect(useAppStore.getState().modal).toEqual({ kind: 'table-generator' });
  });

  it('tools.findInFiles opens find-in-files modal', () => {
    registerMenuCommands();
    render(<App />);
    useCommandStore.getState().dispatch('tools.findInFiles');
    expect(useAppStore.getState().modal).toEqual({ kind: 'find-in-files' });
  });

  it('tools.exportWord opens export-word modal with active path', () => {
    registerMenuCommands();
    render(<App />);
    useCommandStore.getState().dispatch('tools.exportWord');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-word', props: { sourcePath: '/x.md' } });
  });

  it('tools.repl toggles replOpen setting', () => {
    registerMenuCommands();
    render(<App />);
    expect(useSettingsStore.getState().replOpen).toBe(false);
    useCommandStore.getState().dispatch('tools.repl');
    expect(useSettingsStore.getState().replOpen).toBe(true);
  });

  it('view.zenMode toggles zenMode', () => {
    registerMenuCommands();
    render(<App />);
    expect(useAppStore.getState().zenMode).toBe(false);
    useCommandStore.getState().dispatch('view.zenMode');
    expect(useAppStore.getState().zenMode).toBe(true);
  });
});