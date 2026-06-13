import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderFooterDialog } from '@/components/modals/HeaderFooterDialog';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

const defaultSettings = {
  headerEnabled: false,
  footerEnabled: false,
  headerLeft: '',
  headerCenter: '',
  headerRight: '',
  footerLeft: '',
  footerCenter: '',
  footerRight: '',
  logoPosition: 'none',
  logoPath: null,
};

const mockGetSettings = vi.fn().mockResolvedValue(defaultSettings);
const mockSaveSettings = vi.fn().mockResolvedValue(undefined);
const mockBrowseLogo = vi.fn().mockResolvedValue('/path/to/logo.png');

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useSettingsStore.setState(useSettingsStore.getInitialState());
  useAppStore.setState({ modal: { kind: null } } as any);
  (window.electronAPI as any) = {
    headerFooter: {
      getSettings: mockGetSettings,
      saveSettings: mockSaveSettings,
      browseLogo: mockBrowseLogo,
    },
  };
});

describe('HeaderFooterDialog', () => {
  it('loads settings from electronAPI on mount', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalled());
    expect(screen.getByText(/header & footer/i)).toBeInTheDocument();
  });

  it('toggles header enabled checkbox', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /enable header/i }));
    expect(screen.getByRole('checkbox', { name: /enable header/i })).toBeChecked();
  });

  it('toggles footer enabled checkbox', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('checkbox', { name: /enable footer/i }));
    expect(screen.getByRole('checkbox', { name: /enable footer/i })).toBeChecked();
  });

  it('saves settings via electronAPI on Save', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(mockSaveSettings).toHaveBeenCalled());
  });

  it('closes modal on Cancel', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('inserts dynamic field token into header input', async () => {
    mockGetSettings.mockResolvedValue({ ...defaultSettings, headerEnabled: true });
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    const tokenButton = screen.getAllByTitle('Page')[0];
    await userEvent.click(tokenButton);
    expect(screen.getByLabelText(/header left/i)).toHaveValue('$PAGE$');
  });

  it('shows logo browse when logo position is set to left', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    const logoSelect = screen.getByRole('combobox', { name: /logo position/i });
    await userEvent.click(logoSelect);
    await userEvent.click(screen.getByRole('option', { name: 'Left' }));
    expect(screen.getByRole('button', { name: /^browse$/i })).toBeInTheDocument();
  });
});
