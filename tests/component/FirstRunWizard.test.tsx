import { describe, expect, test, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { FirstRunWizard } from '@/components/FirstRunWizard';

beforeEach(() => {
  useAppStore.setState({ firstRun: true, modal: { kind: null } } as any);
  useSettingsStore.setState({ theme: 'system', updateChannel: 'github' } as any);
});

describe('FirstRunWizard', () => {
  test('renders nothing when firstRun is false', () => {
    useAppStore.setState({ firstRun: false } as any);
    const { container } = render(<FirstRunWizard />);
    expect(container.firstChild).toBeNull();
  });

  test('renders step 1 by default', () => {
    render(<FirstRunWizard />);
    expect(screen.getByText(/theme/i)).toBeInTheDocument();
  });

  test('skip link closes the wizard and sets firstRun false', () => {
    render(<FirstRunWizard />);
    fireEvent.click(screen.getByText(/skip/i));
    expect(useAppStore.getState().firstRun).toBe(false);
  });

  test('selecting a theme and clicking Next moves to step 2', () => {
    render(<FirstRunWizard />);
    fireEvent.click(screen.getByLabelText(/dark/i));
    fireEvent.click(screen.getByText(/next/i));
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  test('selecting concreteinfo channel persists it', () => {
    render(<FirstRunWizard />);
    fireEvent.click(screen.getByText(/next/i));
    fireEvent.click(screen.getByLabelText(/concreteinfo/i));
    fireEvent.click(screen.getByText(/next/i));
    expect(useSettingsStore.getState().updateChannel).toBe('concreteinfo');
  });
});
