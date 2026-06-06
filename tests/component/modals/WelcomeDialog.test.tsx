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

  // Regression guard: Radix Dialog emits a console.warn when the Content's
  // aria-describedby points at an id that isn't in the DOM. The default
  // shadcn/ui pattern (custom id="X-desc" on DialogDescription) breaks that
  // link because Radix's internal descriptionId is auto-generated via useId.
  // The fix is to drop the override and let Radix manage the id itself.
  it('does not emit the Radix "Missing Description" warning', async () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args.map(String).join(' '));
    });
    try {
      render(<WelcomeDialog />);
      // Effects that fire the warning run in a microtask; one tick is enough.
      await Promise.resolve();
      const offending = warnings.filter((w) =>
        /Missing\s+`?Description`?|aria-describedby=\{undefined\}/.test(w),
      );
      expect(offending).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
