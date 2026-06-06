import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrintPreview } from '@/components/tools/PrintPreview';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    print: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

import { ipc } from '@/lib/ipc';

describe('PrintPreview', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useFileStore.setState({
      activeTabId: '/test.md',
      openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }],
    } as any);
    useEditorStore.setState({
      buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]),
    } as any);
  });

  it('renders the buffer content', () => {
    render(<PrintPreview onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /hi/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('Print button calls ipc.print', async () => {
    const onClose = vi.fn();
    render(<PrintPreview onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(ipc.print).toHaveBeenCalledTimes(1);
  });

  it('Close button calls onClose', async () => {
    const onClose = vi.fn();
    render(<PrintPreview onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});