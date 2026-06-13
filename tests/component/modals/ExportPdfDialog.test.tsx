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

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  delete (window as any).electronAPI;
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

describe('ExportPdfDialog', () => {
  it('renders with default PDF options from settings', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to pdf/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /format/i })).toBeInTheDocument();
  });

  it('shows PDF engine selector', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByRole('combobox', { name: /pdf engine/i })).toBeInTheDocument();
  });

  it('shows TOC toggle and number sections toggle', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByRole('switch', { name: /table of contents/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /number sections/i })).toBeInTheDocument();
  });

  it('shows TOC depth input when TOC is enabled', async () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('switch', { name: /table of contents/i }));
    expect(screen.getByLabelText(/toc depth/i)).toBeInTheDocument();
  });

  it('shows page geometry dropdown', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByRole('combobox', { name: /page geometry/i })).toBeInTheDocument();
  });

  it('shows bibliography and font inputs', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByLabelText(/bibliography file path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/main font/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cjk font/i)).toBeInTheDocument();
  });

  it('shows highlight style selector', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByRole('combobox', { name: /highlight style/i })).toBeInTheDocument();
  });

  it('toggles ASCII tables and submits via ipc.print.show', async () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /ascii/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(ipc.print.show).toHaveBeenCalledTimes(1));
    const [arg] = (ipc.print.show as any).mock.calls[0];
    expect(arg.html).toContain('<!DOCTYPE html>');
    expect(arg.html).toContain('<h1>hi</h1>');
    expect(arg.html).toMatch(/@page\s*\{\s*size:\s*210mm\s+297mm/);
  });

  it('uses electronAPI.export.withOptions when available', async () => {
    const mockWithOptions = vi.fn().mockResolvedValue({ ok: true });
    (window.electronAPI as any) = {
      export: { withOptions: mockWithOptions },
    };
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(mockWithOptions).toHaveBeenCalledWith('pdf', expect.any(Object)));
    expect(mockWithOptions.mock.calls[0][1].engine).toBe('pdflatex');
    expect(mockWithOptions.mock.calls[0][1].toc).toBe(false);
    expect(mockWithOptions.mock.calls[0][1].highlightStyle).toBe('tango');
  });

  it('renders an error banner when IPC fails', async () => {
    (window as any).electronAPI = undefined;
    (ipc.print.show as any).mockReturnValueOnce({
      ok: false,
      error: { message: 'Pandoc not found' },
    });
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/pandoc not found/i);
    });
  });
});
