import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPdfDialog } from '@/components/modals/ExportPdfDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    print: {
      show: vi.fn().mockResolvedValue({ ok: true }),
      doPrint: vi.fn().mockResolvedValue({ ok: true }),
    },
  },
}));

import { ipc } from '@/lib/ipc';

describe('ExportPdfDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({
      activeTabId: '/test.md',
      openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }],
    } as any);
    useEditorStore.setState({
      buffers: new Map([
        ['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }],
      ]),
    } as any);
  });

  it('renders with default PDF options from settings', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to pdf/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /format/i })).toBeInTheDocument();
  });

  it('toggles ASCII tables and submits via ipc.print.show', async () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /ascii/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(ipc.print.show).toHaveBeenCalledTimes(1));
    const [arg] = (ipc.print.show as any).mock.calls[0];
    expect(arg.html).toContain('<!DOCTYPE html>');
    // The Markdown source is rendered to HTML inside the document body.
    expect(arg.html).toContain('<h1>hi</h1>');
    // @page CSS for size + margins must be present
    expect(arg.html).toMatch(/@page\s*\{\s*size:\s*210mm\s+297mm/);
  });

  it('renders an error banner when IPC fails', async () => {
    (ipc.print.show as any).mockRejectedValueOnce(new Error('Pandoc not found'));
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByText(/pandoc not found/i)).toBeInTheDocument();
  });
});
