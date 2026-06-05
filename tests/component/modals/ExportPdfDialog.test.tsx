import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPdfDialog } from '@/components/modals/ExportPdfDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('ExportPdfDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: {
        pdf: vi.fn().mockResolvedValue({ ok: true, data: { outputPath: '/out.pdf', bytes: 1024, durationMs: 100 } }),
      },
    } as any;
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with default PDF options from settings', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to pdf/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /format/i })).toBeInTheDocument();
  });

  it('toggles ASCII tables and submits merged options', async () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /ascii/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.pdf as any).mock.calls[0][0];
    expect(call.renderTablesAsAscii).toBe(true);
    expect(call.format).toBe('a4');
  });

  it('renders an error banner when IPC fails', async () => {
    (window.electronAPI.export.pdf as any).mockResolvedValueOnce({ ok: false, error: { code: 'E', message: 'Pandoc not found' } });
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByText(/pandoc not found/i)).toBeInTheDocument();
  });
});