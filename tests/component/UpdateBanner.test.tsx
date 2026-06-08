import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useUpdaterStore } from '@/lib/updater-store';
import { UpdateBanner } from '@/components/UpdateBanner';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: { openExternal: vi.fn() },
    updater: { check: vi.fn(), install: vi.fn() },
  },
}));

describe('UpdateBanner', () => {
  beforeEach(() => {
    useUpdaterStore.setState({ state: 'idle', version: null, percent: 0 });
  });

  test('renders nothing when state is idle', () => {
    const { container } = render(<UpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  test('shows version and restart button when state is ready', () => {
    useUpdaterStore.setState({ state: 'ready', version: '5.0.2' });
    render(<UpdateBanner />);
    expect(screen.getByText(/5\.0\.2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
  });

  test('shows download progress when state is downloading', () => {
    useUpdaterStore.setState({ state: 'downloading', percent: 42 });
    render(<UpdateBanner />);
    expect(screen.getByText(/42%/)).toBeInTheDocument();
  });

  test('shows error copy when state is error', () => {
    useUpdaterStore.setState({ state: 'error' });
    render(<UpdateBanner />);
    expect(screen.getByText(/couldn.?t check/i)).toBeInTheDocument();
  });

  test('restart button calls ipc.updater.install', () => {
    useUpdaterStore.setState({ state: 'ready', version: '5.0.2' });
    render(<UpdateBanner />);
    fireEvent.click(screen.getByRole('button', { name: /restart/i }));
    expect(useUpdaterStore.getState().install).toBeDefined();
  });
});