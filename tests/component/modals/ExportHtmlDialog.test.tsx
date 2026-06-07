import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportHtmlDialog } from '@/components/modals/ExportHtmlDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: { showSaveDialog: vi.fn() },
    file: { writeBuffer: vi.fn() },
  },
}));

import { ipc } from '@/lib/ipc';

describe('ExportHtmlDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (ipc.app.showSaveDialog as any).mockImplementation(async (args) => ({
      ok: true,
      data: args?.defaultPath ?? '/out.html',
    }));
    (ipc.file.writeBuffer as any).mockResolvedValue({ ok: true });
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with default github highlight style', () => {
    render(<ExportHtmlDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to html/i)).toBeInTheDocument();
  });

  it('toggles standalone and writes a buffer', async () => {
    render(<ExportHtmlDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /standalone/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => expect(ipc.app.showSaveDialog).toHaveBeenCalledTimes(1));
    expect(ipc.file.writeBuffer).toHaveBeenCalledTimes(1);
    const callArg = (ipc.file.writeBuffer as any).mock.calls[0][0];
    expect(callArg.path).toBe('/test.html');
    // The buffer is a Uint8Array; in JSDOM cross-realm the prototype check
    // is unreliable, so verify shape instead.
    expect(callArg.buffer).toBeDefined();
    expect(callArg.buffer.length).toBeGreaterThan(0);
  });
});
