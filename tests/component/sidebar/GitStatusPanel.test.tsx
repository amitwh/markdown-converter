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

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { ipc } from '@/lib/ipc';

const mockGitStage = vi.fn();
const mockGitCommit = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    gitStage: mockGitStage,
    gitCommit: mockGitCommit,
  },
  writable: true,
});

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
    expect(
      await screen.findByText('Not a git repository, or git not installed.')
    ).toBeInTheDocument();
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

  it('shows stage and commit UI when files are changed', async () => {
    (ipc.file.gitStatus as any).mockResolvedValueOnce({
      ok: true,
      data: [{ filePath: '/project/a.md', status: 'modified' }],
    });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    expect(await screen.findByText('Select All')).toBeInTheDocument();
    expect(screen.getByText('Stage Selected')).toBeInTheDocument();
    expect(screen.getByText('Stage All')).toBeInTheDocument();
    expect(screen.getByTestId('git-commit-input')).toBeInTheDocument();
    expect(screen.getByTestId('git-commit-button')).toBeInTheDocument();
  });

  it('selects and deselects files via checkboxes and select all', async () => {
    (ipc.file.gitStatus as any).mockResolvedValue({
      ok: true,
      data: [
        { filePath: '/project/a.md', status: 'modified' },
        { filePath: '/project/b.md', status: 'added' },
      ],
    });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    const selectAllBtn = await screen.findByText('Select All');
    await userEvent.click(selectAllBtn);
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Deselect All'));
    expect(screen.getByText('Select All')).toBeInTheDocument();
  });

  it('stages selected files', async () => {
    mockGitStage.mockResolvedValueOnce(undefined);
    (ipc.file.gitStatus as any).mockResolvedValue({
      ok: true,
      data: [{ filePath: '/project/a.md', status: 'modified' }],
    });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    const checkbox = await screen.findByTestId('git-status-checkbox');
    await userEvent.click(checkbox);
    const stageBtn = screen.getByTestId('git-stage-selected');
    await userEvent.click(stageBtn);
    expect(mockGitStage).toHaveBeenCalledWith(['/project/a.md']);
  });

  it('commits with message', async () => {
    mockGitCommit.mockResolvedValueOnce(undefined);
    (ipc.file.gitStatus as any).mockResolvedValue({
      ok: true,
      data: [{ filePath: '/project/a.md', status: 'modified' }],
    });
    useFileStore.setState({ rootPath: '/project' } as any);
    render(<GitStatusPanel />);
    const input = await screen.findByTestId('git-commit-input');
    await userEvent.type(input, 'fix typo');
    const commitBtn = screen.getByTestId('git-commit-button');
    await userEvent.click(commitBtn);
    expect(mockGitCommit).toHaveBeenCalledWith('fix typo');
  });
});
