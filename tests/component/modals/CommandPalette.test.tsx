import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from '@/components/modals/CommandPalette';
import { useCommandStore } from '@/stores/command-store';

beforeEach(() => {
  localStorage.clear();
  useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
  useCommandStore.getState().register('file.open', vi.fn());
  useCommandStore.getState().register('file.save', vi.fn());
  useCommandStore.getState().register('file.new', vi.fn());
  useCommandStore.getState().register('file.exportPdf', vi.fn());
  useCommandStore.getState().register('settings.open', vi.fn());
});

describe('CommandPalette', () => {
  it('does not render when closed', () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });

  it('opens on Ctrl+Shift+P', async () => {
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    await waitFor(() => expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument());
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, '{Escape}');
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });

  it('filters commands based on query', async () => {
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, 'open');
    const items = screen.getAllByRole('option');
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      expect(item.textContent?.toLowerCase()).toContain('open');
    });
  });

  it('navigates with arrow keys', async () => {
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, '{ArrowDown}{ArrowDown}');
    const items = screen.getAllByRole('option');
    const selected = items.find((el) => el.getAttribute('aria-selected') === 'true');
    expect(selected).toBe(items[2]);
  });

  it('executes command on Enter', async () => {
    const handler = vi.fn();
    useCommandStore.getState().register('test.command', handler);
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, 'test');
    await userEvent.keyboard('{Enter}');
    expect(handler).toHaveBeenCalled();
  });

  it('shows no results message for non-matching query', async () => {
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    const input = screen.getByPlaceholderText(/type a command/i);
    await userEvent.type(input, 'zzznonexistent');
    expect(screen.getByText(/no matching commands/i)).toBeInTheDocument();
  });

  it('limits results to 8', async () => {
    for (let i = 0; i < 20; i++) {
      useCommandStore.getState().register(`test.command.${i}`, vi.fn());
    }
    render(<CommandPalette />);
    await userEvent.keyboard('{Control>}{Shift>}{p}{/Shift}{/Control}');
    await waitFor(() => {
      const items = screen.queryAllByRole('option');
      expect(items.length).toBeLessThanOrEqual(8);
    });
  });
});
