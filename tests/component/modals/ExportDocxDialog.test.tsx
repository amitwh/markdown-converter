import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportDocxDialog } from '@/components/modals/ExportDocxDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: { showSaveDialog: vi.fn() },
    file: { writeBuffer: vi.fn() },
  },
}));

vi.mock('@/lib/docx-export', () => ({
  generateDocx: vi
    .fn()
    .mockResolvedValue(
      new Blob([new Uint8Array(8)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ),
}));

import { ipc } from '@/lib/ipc';

describe('ExportDocxDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // The dialog passes the source path with .docx extension as the default
    // path, and the test mock returns that same path (echoing the default).
    (ipc.app.showSaveDialog as any).mockImplementation(async (args) => ({
      ok: true,
      data: args?.defaultPath ?? '/out.docx',
    }));
    (ipc.file.writeBuffer as any).mockResolvedValue({ ok: true });
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

  it('renders with standard template selected by default', () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to docx/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /template/i })).toBeInTheDocument();
  });

  it('submitting with default options writes a docx buffer', async () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(ipc.app.showSaveDialog).toHaveBeenCalledTimes(1));
    expect(ipc.file.writeBuffer).toHaveBeenCalledTimes(1);
    const callArg = (ipc.file.writeBuffer as any).mock.calls[0][0];
    expect(callArg.path).toBe('/test.docx');
    expect(callArg.buffer).toBeDefined();
    expect(callArg.buffer.length).toBeGreaterThan(0);
  });

  it('selecting "modern" template is reflected in the rendered form', async () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('combobox', { name: /template/i }));
    await userEvent.click(screen.getByRole('option', { name: /modern/i }));
    expect(screen.getByRole('combobox', { name: /template/i })).toHaveTextContent(/modern/i);
  });
});
