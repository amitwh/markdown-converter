import { describe, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CrashReportModal } from '@/components/modals/CrashReportModal';
import { ipc } from '@/lib/ipc';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    crash: { read: vi.fn(), openDir: vi.fn(), delete: vi.fn() },
  },
}));

describe('CrashReportModal', () => {
  test('shows empty state when no crashes', async () => {
    (ipc.crash.read as any).mockResolvedValue([]);
    render(<CrashReportModal onClose={() => {}} />);
    expect(await screen.findByText(/no crashes/i)).toBeInTheDocument();
  });

  test('lists crashes returned by ipc', async () => {
    (ipc.crash.read as any).mockResolvedValue([
      {
        filename: '1700000000000-1-uncaughtException.json',
        kind: 'uncaughtException',
        message: 'boom',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
    render(<CrashReportModal onClose={() => {}} />);
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });

  test('delete button calls ipc.crash.delete', async () => {
    (ipc.crash.read as any).mockResolvedValue([
      {
        filename: '1700000000000-1-uncaughtException.json',
        kind: 'uncaughtException',
        message: 'boom',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
    ]);
    render(<CrashReportModal onClose={() => {}} />);
    const btn = await screen.findByText(/delete/i);
    fireEvent.click(btn);
    await waitFor(() =>
      expect(ipc.crash.delete).toHaveBeenCalledWith('1700000000000-1-uncaughtException.json')
    );
  });

  test('open folder button calls ipc.crash.openDir', async () => {
    (ipc.crash.read as any).mockResolvedValue([]);
    render(<CrashReportModal onClose={() => {}} />);
    fireEvent.click(await screen.findByText(/open dump folder/i));
    expect(ipc.crash.openDir).toHaveBeenCalled();
  });
});
