import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportHtmlDialog } from '@/components/modals/ExportHtmlDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('ExportHtmlDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: { html: vi.fn().mockResolvedValue({ ok: true, data: { outputPath: '/out.html' } }) },
    } as any;
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with default github highlight style', () => {
    render(<ExportHtmlDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to html/i)).toBeInTheDocument();
  });

  it('toggles standalone and submits with chosen highlight', async () => {
    render(<ExportHtmlDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /standalone/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /standalone/i }));
    await userEvent.click(screen.getByRole('combobox', { name: /highlight/i }));
    await userEvent.click(screen.getByRole('option', { name: /monokai/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.html as any).mock.calls[0][0];
    expect(call.standalone).toBe(true);
    expect(call.highlightStyle).toBe('monokai');
  });
});