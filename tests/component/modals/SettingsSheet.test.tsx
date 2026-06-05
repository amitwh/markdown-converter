import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsSheet } from '@/components/modals/SettingsSheet';
import { useSettingsStore } from '@/stores/settings-store';

describe('SettingsSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it('renders 5 tab triggers', () => {
    render(<SettingsSheet />);
    expect(screen.getByRole('tab', { name: /editor/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /plugins/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /about/i })).toBeInTheDocument();
  });

  it('editor tab is open by default and shows font size', () => {
    render(<SettingsSheet />);
    expect(screen.getByText(/font size/i)).toBeInTheDocument();
  });

  it('theme tab shows theme radio group', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /theme/i }));
    expect(screen.getByText(/accent color/i)).toBeInTheDocument();
  });

  it('export tab shows ascii toggle and template picker', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /export/i }));
    expect(screen.getByText(/render tables as ascii by default/i)).toBeInTheDocument();
    expect(screen.getByText(/default docx template/i)).toBeInTheDocument();
  });

  it('plugins tab shows coming soon message', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /plugins/i }));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('about tab shows version', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /about/i }));
    expect(screen.getByText(/markdownconverter/i)).toBeInTheDocument();
  });

  it('reset to defaults button clears all settings', async () => {
    useSettingsStore.getState().setSetting('fontSize', 22);
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(useSettingsStore.getState().fontSize).toBe(14);
  });
});