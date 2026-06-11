import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordExportDialog } from '@/components/modals/WordExportDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

vi.mock('@/lib/docx-export', () => ({
  generateDocx: vi
    .fn()
    .mockResolvedValue(
      new Blob([new Uint8Array([1, 2, 3])], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ),
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: {
      showSaveDialog: vi.fn(),
    },
    file: {
      writeBuffer: vi.fn(),
    },
  },
}));

import { generateDocx } from '@/lib/docx-export';
import { toast } from '@/lib/toast';
import { ipc } from '@/lib/ipc';

describe('WordExportDialog', () => {
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
    (ipc.app.showSaveDialog as any).mockResolvedValue({ ok: true, data: '/out.docx' });
    (ipc.file.writeBuffer as any).mockResolvedValue({ ok: true });
  });

  it('renders with template selector (standard / custom)', () => {
    render(<WordExportDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to word/i)).toBeInTheDocument();
    expect(screen.getByText(/test\.md/)).toBeInTheDocument();
  });

  it('submitting calls generateDocx and writes the file', async () => {
    render(<WordExportDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(generateDocx).toHaveBeenCalledTimes(1);
    expect(ipc.file.writeBuffer).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Exported test.md'));
  });

  it('shows error message on write failure', async () => {
    (ipc.file.writeBuffer as any).mockResolvedValue({
      ok: false,
      error: { code: 'E', message: 'write failed' },
    });
    render(<WordExportDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByText(/write failed/i)).toBeInTheDocument();
  });

  it('switches to custom template path when "Custom" is selected', async () => {
    useSettingsStore.setState({
      ...useSettingsStore.getInitialState(),
      docxCustomTemplatePath: '/my.dotx',
    });
    render(<WordExportDialog sourcePath="/test.md" />);
    expect(screen.getByText(/\/my\.dotx/)).toBeInTheDocument();
  });
});
