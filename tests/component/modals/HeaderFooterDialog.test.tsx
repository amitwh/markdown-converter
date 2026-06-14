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

let registeredCallback: ((data: any) => void) | null = null;
const mockSend = vi.fn((channel, ...args) => {
  if (channel === 'get-header-footer-settings') {
    setTimeout(() => {
      if (registeredCallback) registeredCallback(defaultSettings);
    }, 0);
  }
});

const mockOn = vi.fn((channel, cb) => {
  if (channel === 'header-footer-settings-data') {
    registeredCallback = cb as any;
    // Trigger immediately with default settings to satisfy initial mount loading
    setTimeout(() => {
      cb(defaultSettings);
    }, 0);
  }
  return vi.fn(); // cleanup/unsubscribe fn
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  registeredCallback = null;
  useSettingsStore.setState(useSettingsStore.getInitialState());
  useAppStore.setState({ modal: { kind: null } } as any);
  (window.electronAPI as any) = {
    send: mockSend,
    on: mockOn,
    once: vi.fn(),
    invoke: vi.fn(() => Promise.resolve(null)),
    removeAllListeners: vi.fn(),
  };
});

describe('HeaderFooterDialog', () => {
  it('loads settings from electronAPI on mount', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('get-header-footer-settings'));
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
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('save-header-footer-settings', expect.any(Object)));
  });

  it('closes modal on Cancel', async () => {
    render(<HeaderFooterDialog />);
    await waitFor(() => expect(screen.getByText(/header & footer/i)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('inserts dynamic field token into header input', async () => {
    // Override registered callback to return enabled header
    mockOn.mockImplementationOnce((channel, cb) => {
      if (channel === 'header-footer-settings-data') {
        setTimeout(() => {
          cb({ ...defaultSettings, headerEnabled: true });
        }, 0);
      }
      return vi.fn();
    });

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
