import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportBatchDialog } from '@/components/modals/ExportBatchDialog';

describe('ExportBatchDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: { batch: vi.fn().mockResolvedValue({ ok: true, data: { total: 2, succeeded: 2, failed: 0, results: [] } }) },
    } as any;
  });

  it('renders the file list passed via sourcePaths', () => {
    render(<ExportBatchDialog sourcePaths={['/a.md', '/b.md']} />);
    expect(screen.getByText('/a.md')).toBeInTheDocument();
    expect(screen.getByText('/b.md')).toBeInTheDocument();
  });

  it('selecting format and concurrency submits correct options', async () => {
    render(<ExportBatchDialog sourcePaths={['/a.md', '/b.md']} />);
    await userEvent.click(screen.getByRole('combobox', { name: /format/i }));
    await userEvent.click(screen.getByRole('option', { name: /^pdf$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.batch as any).mock.calls[0];
    expect(call[0]).toEqual([{ inputPath: '/a.md', outputPath: expect.any(String) }, { inputPath: '/b.md', outputPath: expect.any(String) }]);
    expect(call[1].format).toBe('pdf');
  });
});
