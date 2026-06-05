import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import { useAppStore } from '@/stores/app-store';

describe('ConfirmDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders title, body, and confirm/cancel labels', () => {
    render(
      <ConfirmDialog
        title="Delete file?"
        body="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText(/delete file/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls onConfirm and closes on confirm click', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="T" body="B" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('destructive variant uses destructive button class', () => {
    render(
      <ConfirmDialog title="T" body="B" destructive onConfirm={() => {}} />
    );
    const btn = screen.getByRole('button', { name: /confirm/i });
    expect(btn.className).toContain('bg-destructive');
  });
});