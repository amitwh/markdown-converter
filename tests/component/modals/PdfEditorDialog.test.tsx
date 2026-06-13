import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PdfEditorDialog } from '@/components/modals/PdfEditorDialog';

const mockProcessOperation = vi.fn().mockResolvedValue(undefined);
const mockPickFile = vi.fn();
const mockPickFolder = vi.fn();
const mockShowSaveDialog = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockPickFile.mockResolvedValue({ ok: true, data: null });
  mockPickFolder.mockResolvedValue({ ok: true, data: null });
  mockShowSaveDialog.mockResolvedValue({ ok: true, data: null });
  window.electronAPI = {
    file: {
      pickFile: mockPickFile,
      pickFolder: mockPickFolder,
    },
    app: {
      showSaveDialog: mockShowSaveDialog,
    },
    pdf: {
      processOperation: mockProcessOperation,
    },
  } as any;
});

function dispatchComplete(success: boolean, error?: string) {
  window.dispatchEvent(
    new CustomEvent('pdf-operation-complete', {
      detail: { success, error, message: success ? 'Done' : error },
    })
  );
}

describe('PdfEditorDialog', () => {
  it('renders all operation tabs', () => {
    render(<PdfEditorDialog onClose={() => {}} />);
    expect(screen.getByText('Merge')).toBeInTheDocument();
    expect(screen.getByText('Split')).toBeInTheDocument();
    expect(screen.getByText('Compress')).toBeInTheDocument();
    expect(screen.getByText('Rotate')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Reorder')).toBeInTheDocument();
    expect(screen.getByText('Watermark')).toBeInTheDocument();
    expect(screen.getByText('Encrypt')).toBeInTheDocument();
    expect(screen.getByText('Decrypt')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
  });

  it('defaults to merge tab and shows file list', () => {
    render(<PdfEditorDialog onClose={() => {}} />);
    expect(screen.getByText('PDF files')).toBeInTheDocument();
    expect(screen.getByText('Output path')).toBeInTheDocument();
  });

  it('pre-fills input path from initialFilePath', async () => {
    render(<PdfEditorDialog onClose={() => {}} initialFilePath="/test.pdf" />);
    await userEvent.click(screen.getByText('Split'));
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      const match = inputs.find((el) => (el as HTMLInputElement).value === '/test.pdf');
      expect(match).toBeTruthy();
    });
  });

  it('validates merge requires at least 2 files', async () => {
    render(<PdfEditorDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(screen.getByText(/add at least 2 pdf files/i)).toBeInTheDocument();
  });

  it('validates input path for operations that need it', async () => {
    render(<PdfEditorDialog onClose={() => {}} />);
    await userEvent.click(screen.getByText('Compress'));
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(screen.getByText(/select an input pdf/i)).toBeInTheDocument();
  });

  it('validates watermark text is required', async () => {
    render(<PdfEditorDialog onClose={() => {}} initialFilePath="/test.pdf" />);
    mockShowSaveDialog.mockResolvedValue({ ok: true, data: '/out.pdf' });
    await userEvent.click(screen.getByText('Watermark'));
    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/out.pdf');
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(screen.getByText(/enter watermark text/i)).toBeInTheDocument());
  });

  it('validates decrypt password is required', async () => {
    render(<PdfEditorDialog onClose={() => {}} initialFilePath="/test.pdf" />);
    mockShowSaveDialog.mockResolvedValue({ ok: true, data: '/out.pdf' });
    await userEvent.click(screen.getByText('Decrypt'));
    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/out.pdf');
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(screen.getByText(/enter the password/i)).toBeInTheDocument());
  });

  it('calls onClose on cancel click', () => {
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} />);
    const cancelBtn = screen.getAllByRole('button').find((b) => b.textContent === 'Cancel');
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it('merge operation sends correct payload and shows success', async () => {
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} />);
    mockPickFile
      .mockResolvedValueOnce({ ok: true, data: '/a.pdf' })
      .mockResolvedValueOnce({ ok: true, data: '/b.pdf' });

    await userEvent.click(screen.getByRole('button', { name: /add file/i }));
    await userEvent.click(screen.getByRole('button', { name: /add file/i }));
    expect(screen.getByText('/a.pdf')).toBeInTheDocument();
    expect(screen.getByText('/b.pdf')).toBeInTheDocument();

    const outputInput = screen.getByPlaceholderText('output.pdf');
    await userEvent.type(outputInput, '/merged.pdf');

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(mockProcessOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'merge',
        inputPaths: ['/a.pdf', '/b.pdf'],
        outputPath: '/merged.pdf',
      })
    );

    dispatchComplete(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('rotate operation sends angle and pages', async () => {
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} initialFilePath="/in.pdf" />);

    await userEvent.click(screen.getByText('Rotate'));
    const pagesInput = screen.getAllByPlaceholderText('All pages')[0];
    await userEvent.type(pagesInput, '1,3-5');

    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/out.pdf');

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(mockProcessOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'rotate',
        inputPath: '/in.pdf',
        pages: '1,3-5',
        angle: 90,
      })
    );

    dispatchComplete(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('delete operation sends pages', async () => {
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} initialFilePath="/in.pdf" />);

    await userEvent.click(screen.getByText('Delete'));
    const pagesInput = screen.getByPlaceholderText('1,3,5-8');
    await userEvent.type(pagesInput, '2,4');

    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/out.pdf');

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(mockProcessOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'delete', inputPath: '/in.pdf', pages: '2,4' })
    );

    dispatchComplete(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('encrypt operation sends passwords and permissions', async () => {
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} initialFilePath="/in.pdf" />);

    await userEvent.click(screen.getByText('Encrypt'));
    await userEvent.type(screen.getByPlaceholderText('Password to open'), 'user123');
    await userEvent.type(screen.getByPlaceholderText('Password for permissions'), 'owner123');
    await userEvent.click(screen.getByRole('checkbox', { name: /printing/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /copying/i }));

    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/encrypted.pdf');

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(mockProcessOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'encrypt',
        inputPath: '/in.pdf',
        userPassword: 'user123',
        ownerPassword: 'owner123',
        permissions: { printing: true, copying: true },
      })
    );

    dispatchComplete(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('split with interval mode sends correct payload', async () => {
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} initialFilePath="/in.pdf" />);
    mockPickFolder.mockResolvedValue({ ok: true, data: '/splits' });

    await userEvent.click(screen.getByText('Split'));

    const folderInputs = screen.getAllByPlaceholderText('Select output folder');
    await userEvent.type(folderInputs[0], '/splits');

    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: /every n pages/i }));

    const intervalInputs = screen.getAllByPlaceholderText('5');
    if (intervalInputs.length > 0) {
      await userEvent.clear(intervalInputs[0]);
      await userEvent.type(intervalInputs[0], '10');
    }

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(mockProcessOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'split',
        inputPath: '/in.pdf',
        outputFolder: '/splits',
        mode: 'interval',
        interval: 10,
      })
    );

    dispatchComplete(true);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows error toast on operation failure', async () => {
    render(<PdfEditorDialog onClose={() => {}} initialFilePath="/in.pdf" />);

    await userEvent.click(screen.getByText('Compress'));
    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/out.pdf');

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    dispatchComplete(false, 'Compression failed');
    await waitFor(() => expect(screen.getByText(/compression failed/i)).toBeInTheDocument());
  });

  it('shows error when IPC throws', async () => {
    mockProcessOperation.mockRejectedValueOnce(new Error('IPC channel missing'));
    const onClose = vi.fn();
    render(<PdfEditorDialog onClose={onClose} initialFilePath="/in.pdf" />);

    await userEvent.click(screen.getByText('Compress'));
    const outputInputs = screen.getAllByPlaceholderText('output.pdf');
    await userEvent.type(outputInputs[0], '/out.pdf');

    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    await waitFor(() => expect(screen.getByText(/ipc channel missing/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('can remove a merge file from the list', async () => {
    render(<PdfEditorDialog onClose={() => {}} />);
    mockPickFile.mockResolvedValue({ ok: true, data: '/a.pdf' });

    await userEvent.click(screen.getByRole('button', { name: /add file/i }));
    expect(screen.getByText('/a.pdf')).toBeInTheDocument();

    const removeBtns = screen.getAllByRole('button');
    const removeBtn = removeBtns.find((btn) => btn.querySelector('svg.lucide-x'));
    if (removeBtn) {
      await userEvent.click(removeBtn);
      expect(screen.queryByText('/a.pdf')).not.toBeInTheDocument();
    }
  });

  it('switches tabs and clears error', async () => {
    render(<PdfEditorDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /^apply$/i }));
    expect(screen.getByText(/add at least 2 pdf files/i)).toBeInTheDocument();

    await userEvent.click(screen.getByText('Compress'));
    expect(screen.queryByText(/add at least 2 pdf files/i)).not.toBeInTheDocument();
  });
});
