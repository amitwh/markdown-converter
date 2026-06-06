import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GitStatusPanel } from '@/components/sidebar/GitStatusPanel';
import { useFileStore } from '@/stores/file-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    file: {
      gitStatus: vi.fn(),
    },
  },
}));

import { ipc } from '@/lib/ipc';

describe('GitStatusPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows "No folder open" when rootPath is null', () => {
    useFileStore.setState({ rootPath: null } as any);
    render(<GitStatusPanel />);
    expect(screen.getByText(/no folder open/i)).toBeInTheDocument();
  });

  it('fetches and shows git status', async () => {
    (ipc.file.gitStatus as any).mockResolvedValueOnce({
      ok: true,
      data: [
        { filePath: '/project/a.md', status: 'modified' },
        { filePath: '/project/b.md', status: 'added' },
      ],
    });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    expect(await screen.findByText('a.md')).toBeInTheDocument();
    expect(await screen.findByText('b.md')).toBeInTheDocument();
  });

  it('shows "Working tree clean" when no changes', async () => {
    (ipc.file.gitStatus as any).mockResolvedValueOnce({ ok: true, data: [] });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    expect(await screen.findByText(/working tree clean/i)).toBeInTheDocument();
  });

  it('shows error state when gitStatus fails', async () => {
    (ipc.file.gitStatus as any).mockResolvedValueOnce({
      ok: false,
      error: { code: 'IPC_ERROR', message: 'Not a git repository' },
    });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    // The helper text appears in a <p> element distinct from the error heading
    expect(await screen.findByText('Not a git repository, or git not installed.')).toBeInTheDocument();
  });

  it('opens file on click', async () => {
    const openFile = vi.fn();
    (ipc.file.gitStatus as any).mockResolvedValueOnce({
      ok: true,
      data: [{ filePath: '/project/a.md', status: 'modified' }],
    });
    useFileStore.setState({ rootPath: '/project', openFile } as any);
    render(<GitStatusPanel />);
    const row = await screen.findByTestId('git-status-row');
    await userEvent.click(row);
    expect(openFile).toHaveBeenCalledWith('/project/a.md');
  });
});