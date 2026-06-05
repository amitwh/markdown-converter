import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: {
      getVersion: vi.fn().mockResolvedValue({ ok: true, data: '5.0.0' }),
      openExternal: vi.fn().mockResolvedValue({ ok: true }),
    },
    file: {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
      pickFolder: vi.fn(),
      pickFile: vi.fn(),
      onChange: vi.fn(),
    },
    menu: {
      on: vi.fn(() => () => {}),
    },
    export: {
      pdf: vi.fn(),
      docx: vi.fn(),
      html: vi.fn(),
      batch: vi.fn(),
    },
  },
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ipc } from '@/lib/ipc';
import { toast } from '@/lib/toast';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';

describe('Phase 8 toasts integration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAppStore.setState({ modal: { kind: null }, sidebarVisible: true, previewVisible: true, zenMode: false, paneSizes: { sidebar: 20, editor: 50, preview: 30 } } as any);
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: true });
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: true }]]) } as any);
  });

  it('saving a file calls toast.success with "Saved test.md"', async () => {
    (ipc.file.write as any).mockResolvedValue({ ok: true });
    registerMenuCommands();
    render(<App />);

    const result = await useFileStore.getState().saveActiveBuffer();
    expect(result).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Saved test.md');
  });

  it('saving with IPC error calls toast.error', async () => {
    (ipc.file.write as any).mockResolvedValue({ ok: false, error: { code: 'EACCES', message: 'Permission denied' } });
    registerMenuCommands();
    render(<App />);

    const result = await useFileStore.getState().saveActiveBuffer();
    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Failed to save: Permission denied');
  });

  it('opening a missing file calls toast.error', async () => {
    (ipc.file.read as any).mockResolvedValue({ ok: false, error: { code: 'ENOENT', message: 'No such file' } });
    registerMenuCommands();
    render(<App />);

    await useFileStore.getState().openFile('/missing.md');
    expect(toast.error).toHaveBeenCalledWith('Failed to open file: No such file');
  });

  it('exporting a file calls toast.success on success', async () => {
    (ipc.export.pdf as any).mockResolvedValue({ ok: true, data: { outputPath: '/test.pdf', bytes: 100, durationMs: 50 } });
    registerMenuCommands();
    render(<App />);

    // Open the export-pdf modal via command dispatch
    useCommandStore.getState().dispatch('file.exportPdf');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-pdf', props: { sourcePath: '/test.md' } });

    // Click the Export button
    const exportBtn = await screen.findByRole('button', { name: /^export$/i });
    await userEvent.click(exportBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Exported test.md'));
    });
  });
});