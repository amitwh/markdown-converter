import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BatchMediaConverterDialog } from '@/components/modals/BatchMediaConverterDialog';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

const mockPickFolder = vi.fn().mockResolvedValue('/some/folder');
const mockOn = vi.fn().mockReturnValue(() => {});
const mockConvertBatch = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/ipc', () => ({
  ipc: { file: { pickFolder: mockPickFolder } },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockPickFolder.mockClear();
  useSettingsStore.setState(useSettingsStore.getInitialState());
  useAppStore.setState({ modal: { kind: null } } as any);
  (window.electronAPI as any) = {
    file: {
      pickFolder: mockPickFolder,
    },
    on: mockOn,
    converter: { convertBatch: mockConvertBatch },
  };
});

describe('BatchMediaConverterDialog', () => {
  it('renders with ImageMagick and FFmpeg tabs', () => {
    render(<BatchMediaConverterDialog />);
    expect(screen.getByText(/batch media converter/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ImageMagick' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'FFmpeg' })).toBeInTheDocument();
  });

  it('shows format dropdowns for the active tool', () => {
    render(<BatchMediaConverterDialog />);
    expect(screen.getByRole('combobox', { name: /source format/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /target format/i })).toBeInTheDocument();
  });

  it('validates both formats are selected', async () => {
    render(<BatchMediaConverterDialog />);
    await userEvent.click(screen.getByRole('button', { name: /^convert$/i }));
    expect(screen.getByText(/select both source and target formats/i)).toBeInTheDocument();
  });

  it('validates folders are selected', async () => {
    render(<BatchMediaConverterDialog />);
    await userEvent.click(screen.getByRole('combobox', { name: /source format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'PNG' }));
    await userEvent.click(screen.getByRole('combobox', { name: /target format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'JPEG' }));
    await userEvent.click(screen.getByRole('button', { name: /^convert$/i }));
    expect(screen.getByText(/select both input and output folders/i)).toBeInTheDocument();
  });

  it('browse buttons set folder paths', async () => {
    render(<BatchMediaConverterDialog />);
    const browseButtons = screen.getAllByRole('button', { name: /^browse$/i });
    await userEvent.click(browseButtons[0]);
    await waitFor(() => expect(screen.getByLabelText(/input folder/i)).toHaveValue('/some/folder'));
    await userEvent.click(browseButtons[1]);
    await waitFor(() =>
      expect(screen.getByLabelText(/output folder/i)).toHaveValue('/some/folder')
    );
  });

  it('switches to FFmpeg tab and resets formats', async () => {
    render(<BatchMediaConverterDialog />);
    await userEvent.click(screen.getByRole('combobox', { name: /source format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'PNG' }));
    await userEvent.click(screen.getByRole('tab', { name: 'FFmpeg' }));
    expect(screen.getByRole('tab', { name: 'FFmpeg' })).toHaveAttribute('data-state', 'active');
  });

  it('shows include subdirectories toggle', () => {
    render(<BatchMediaConverterDialog />);
    expect(screen.getByRole('switch', { name: /include subdirectories/i })).toBeInTheDocument();
  });

  it('subscribes to batch-progress and conversion-complete IPC events', () => {
    render(<BatchMediaConverterDialog />);
    expect(mockOn).toHaveBeenCalledWith('batch-progress', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('conversion-complete', expect.any(Function));
  });

  it('submits with includeSubfolders when enabled', async () => {
    render(<BatchMediaConverterDialog />);
    await userEvent.click(screen.getByRole('combobox', { name: /source format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'PNG' }));
    await userEvent.click(screen.getByRole('combobox', { name: /target format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'JPEG' }));
    const browseButtons = screen.getAllByRole('button', { name: /^browse$/i });
    await userEvent.click(browseButtons[0]);
    await waitFor(() => expect(screen.getByLabelText(/input folder/i)).toHaveValue('/some/folder'));
    await userEvent.click(browseButtons[1]);
    await waitFor(() =>
      expect(screen.getByLabelText(/output folder/i)).toHaveValue('/some/folder')
    );
    await userEvent.click(screen.getByRole('switch', { name: /include subdirectories/i }));
    await userEvent.click(screen.getByRole('button', { name: /^convert$/i }));
    await waitFor(() => expect(mockConvertBatch).toHaveBeenCalledTimes(1));
    const callArg = mockConvertBatch.mock.calls[0][0];
    expect(callArg.tool).toBe('imagemagick');
    expect(callArg.fromFormat).toBe('png');
    expect(callArg.toFormat).toBe('jpg');
    expect(callArg.includeSubfolders).toBe(true);
  });
});
