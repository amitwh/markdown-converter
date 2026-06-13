import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UniversalConverterDialog } from '@/components/modals/UniversalConverterDialog';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

const mockPickFile = vi.fn().mockResolvedValue('/path/to/image.png');
const mockPickFolder = vi
  .fn()
  .mockResolvedValueOnce('/input/folder')
  .mockResolvedValueOnce('/output/folder');
const mockOn = vi.fn().mockReturnValue(() => {});
const mockConvert = vi.fn().mockResolvedValue(undefined);
const mockConvertBatch = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/ipc', () => ({
  ipc: { file: { pickFile: mockPickFile, pickFolder: mockPickFolder } },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useSettingsStore.setState(useSettingsStore.getInitialState());
  useAppStore.setState({ modal: { kind: null } } as any);
  (window.electronAPI as any) = {
    file: {
      pickFile: mockPickFile,
      pickFolder: mockPickFolder,
    },
    on: mockOn,
    converter: { convert: mockConvert, convertBatch: mockConvertBatch },
  };
});

describe('UniversalConverterDialog', () => {
  it('renders with tool selector and format dropdowns', () => {
    render(<UniversalConverterDialog />);
    expect(screen.getByText(/universal converter/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /conversion tool/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /source format/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /target format/i })).toBeInTheDocument();
  });

  it('validates that both formats are selected before converting', async () => {
    render(<UniversalConverterDialog />);
    await userEvent.click(screen.getByRole('button', { name: /^convert$/i }));
    expect(screen.getByText(/select both source and target formats/i)).toBeInTheDocument();
  });

  it('validates file selection in single-file mode after formats are selected', async () => {
    render(<UniversalConverterDialog />);
    await userEvent.click(screen.getByRole('combobox', { name: /source format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Markdown' }));
    await userEvent.click(screen.getByRole('combobox', { name: /target format/i }));
    await userEvent.click(screen.getByRole('option', { name: 'PDF' }));
    await userEvent.click(screen.getByRole('button', { name: /^convert$/i }));
    expect(screen.getByText(/select a file to convert/i)).toBeInTheDocument();
  });

  it('browse button calls pickFile and sets path', async () => {
    render(<UniversalConverterDialog />);
    await userEvent.click(screen.getByRole('button', { name: /^browse$/i }));
    await waitFor(() => expect(mockPickFile).toHaveBeenCalled());
    expect(await screen.findByDisplayValue('/path/to/image.png')).toBeInTheDocument();
  });

  it('switches tool and resets format selections', async () => {
    render(<UniversalConverterDialog />);
    const toolSelect = screen.getByRole('combobox', { name: /conversion tool/i });
    await userEvent.click(toolSelect);
    await userEvent.click(screen.getByRole('option', { name: 'FFmpeg' }));
    expect(toolSelect).toHaveTextContent('FFmpeg');
  });

  it('enables batch mode with folder inputs', async () => {
    render(<UniversalConverterDialog />);
    await userEvent.click(screen.getByRole('switch', { name: /batch mode/i }));
    expect(screen.getByLabelText(/input folder/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/output folder/i)).toBeInTheDocument();
  });

  it('subscribes to conversion IPC events', () => {
    render(<UniversalConverterDialog />);
    expect(mockOn).toHaveBeenCalledWith('conversion-status', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('conversion-complete', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('batch-progress', expect.any(Function));
  });
});
