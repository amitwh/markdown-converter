import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AboutDialog } from '@/components/modals/AboutDialog';
import { useAppStore } from '@/stores/app-store';

describe('AboutDialog', () => {
  beforeEach(() => {
    window.electronAPI = {
      app: {
        getVersion: vi.fn().mockResolvedValue('5.0.0'),
        openExternal: vi.fn().mockResolvedValue({ ok: true }),
      },
    } as any;
    // Reset store to about modal so dialog renders
    useAppStore.setState({ modal: { kind: 'about' } } as any);
  });

  it('renders title and version', async () => {
    render(<AboutDialog />);
    expect(screen.getByText(/about markdownconverter/i)).toBeInTheDocument();
    expect(await screen.findByText(/5\.0\.0/)).toBeInTheDocument();
  });

  it('closes when the close button is clicked', async () => {
    render(<AboutDialog />);
    // dialog-footer has the visible Close button; the X button also has sr-only "Close"
    const closeButtons = await screen.findAllByRole('button', { name: /close/i });
    const close = closeButtons[0];
    await userEvent.click(close);
    // closeModal sets modal.kind = null, so isOpen=false, Dialog unmounts
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});