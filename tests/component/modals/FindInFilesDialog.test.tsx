import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FindInFilesDialog } from '@/components/modals/FindInFilesDialog';
import { useFileStore } from '@/stores/file-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      search: vi.fn(),
    },
  },
}));

import { ipc } from '@/lib/ipc';
import { useAppStore } from '@/stores/app-store';

describe('FindInFilesDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useFileStore.setState({ rootPath: '/project' } as any);
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders with a query input and toggles', () => {
    render(<FindInFilesDialog />);
    expect(screen.getByText(/find in files/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /query/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /regex/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /case/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('submits a search and shows results', async () => {
    (ipc.file.search as any).mockResolvedValueOnce({
      ok: true,
      data: [
        { filePath: '/project/a.md', line: 5, content: 'matching line' },
        { filePath: '/project/b.md', line: 12, content: 'another match' },
      ],
    });
    render(<FindInFilesDialog />);
    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'match');
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(await screen.findByText('/project/a.md:5')).toBeInTheDocument();
    expect(await screen.findByText(/another match/)).toBeInTheDocument();
  });

  it('clicking a result calls useFileStore.openFile', async () => {
    (ipc.file.search as any).mockResolvedValueOnce({
      ok: true,
      data: [{ filePath: '/project/a.md', line: 5, content: 'matching line' }],
    });
    const openFileSpy = vi.fn();
    useFileStore.setState({ openFile: openFileSpy, rootPath: '/project' } as any);
    render(<FindInFilesDialog />);
    await userEvent.type(screen.getByRole('textbox', { name: /query/i }), 'match');
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    const result = await screen.findByText('/project/a.md:5');
    await userEvent.click(result);
    // openFile is called with the filePath; the test verifies it was called
    expect(openFileSpy).toHaveBeenCalled();
  });

  it('shows an error banner when search fails', async () => {
    (ipc.file.search as any).mockResolvedValueOnce({
      ok: false,
      error: { code: 'E', message: 'regex invalid' },
    });
    render(<FindInFilesDialog />);
    await userEvent.paste('[invalid', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    await userEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(await screen.findByText(/regex invalid/i)).toBeInTheDocument();
  });
});
