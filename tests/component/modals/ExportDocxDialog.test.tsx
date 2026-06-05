import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportDocxDialog } from '@/components/modals/ExportDocxDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('ExportDocxDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: { docx: vi.fn().mockResolvedValue({ ok: true, data: { outputPath: '/out.docx' } }) },
    } as any;
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with standard template selected by default', () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to docx/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /template/i })).toBeInTheDocument();
  });

  it('submitting with default options sends template=standard', async () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.docx as any).mock.calls[0][0];
    expect(call.template).toBe('standard');
  });

  it('selecting "modern" template sends template=modern', async () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('combobox', { name: /template/i }));
    await userEvent.click(screen.getByRole('option', { name: /modern/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.docx as any).mock.calls[0][0];
    expect(call.template).toBe('modern');
  });
});