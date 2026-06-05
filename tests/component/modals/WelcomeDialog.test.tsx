import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeDialog } from '@/components/modals/WelcomeDialog';
import { useSettingsStore } from '@/stores/settings-store';
import { useAppStore } from '@/stores/app-store';

describe('WelcomeDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders a heading and quick-start content', () => {
    render(<WelcomeDialog />);
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
  });

  it('closing without the checkbox does not dismiss future welcome dialogs', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(useSettingsStore.getState().welcomeDismissed).toBe(false);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('checking "don\'t show again" persists the flag', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole('checkbox', { name: /don't show again/i }));
    await userEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(useSettingsStore.getState().welcomeDismissed).toBe(true);
  });
});
