/**
 * Tests for the PDF batch operations dialog (Task 22). Exercises the real
 * dialog DOM in jsdom with the electron IPC surface mocked, following the
 * jest.mock('electron') pattern in document-compare-dialog.test.js.
 *
 * These jsdom tests plus tests/main/PDFBatchOperations.test.js substitute for
 * the brief's manual GUI verification step (batch-watermarking a folder of
 * PDFs), which is not possible in this sandbox.
 */
jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

require('../src/utils/ModalManager'); // sets window.ModalManager for the dialog
const { ipcRenderer } = require('electron');
const { showPdfBatchDialog } = require('../src/renderer/pdf-batch-dialog');

// Captures the listeners the dialog registers (folder-selected, batch-progress,
// pdf-batch-complete) so tests can fire them like the main process would.
const listeners = {};
ipcRenderer.on.mockImplementation((channel, callback) => {
  listeners[channel] = callback;
  return () => delete listeners[channel];
});

const EXPECTED_OPERATIONS = [
  'watermark',
  'split',
  'compress',
  'rotate',
  'delete',
  'extractText',
  'pageNumbers',
  'crop',
  'extractImages',
];

function openDialog(onConvertFormat = jest.fn()) {
  showPdfBatchDialog({ onConvertFormat });
  return onConvertFormat;
}

function selectBatchType(type) {
  const select = document.getElementById('pdf-batch-type');
  select.value = type;
  select.dispatchEvent(new Event('change'));
}

function selectOperation(op) {
  const select = document.getElementById('pdf-batch-operation');
  select.value = op;
  select.dispatchEvent(new Event('change'));
}

function setField(name, value) {
  document.getElementById(`pdf-batch-field-${name}`).value = value;
}

// Conditional fields are hidden by toggling their wrapper section.
function fieldWrapperHidden(name) {
  return document.getElementById(`pdf-batch-field-${name}-wrapper`).classList.contains('hidden');
}

function setFolders(input = '/batch/in', output = '/batch/out') {
  setField('inputFolder', input);
  setField('outputFolder', output);
}

function clickProcess() {
  document.getElementById('pdf-batch-process').click();
}

function statusText() {
  return document.getElementById('pdf-batch-status').textContent;
}

function lastSentPayload() {
  const calls = ipcRenderer.send.mock.calls.filter((c) => c[0] === 'batch-pdf-operation');
  return calls.length ? calls[calls.length - 1][1] : null;
}

describe('PDF batch operations dialog', () => {
  beforeEach(() => {
    ipcRenderer.send.mockReset();
    ipcRenderer.invoke.mockReset();
  });

  describe('batch type selector', () => {
    it('defaults to Convert Format and hides the bulk-operation controls', () => {
      const onConvertFormat = openDialog();

      expect(document.getElementById('pdf-batch-type').value).toBe('convert');
      expect(
        document.getElementById('pdf-batch-operation-panel').classList.contains('hidden')
      ).toBe(true);
      expect(document.getElementById('pdf-batch-process').textContent).toContain('Batch Converter');
      expect(document.getElementById('pdf-batch-operation').children.length).toBe(
        EXPECTED_OPERATIONS.length
      );
      expect(onConvertFormat).not.toHaveBeenCalled();
    });

    it('delegates Convert Format to the existing batch converter without sending an operation', () => {
      const onConvertFormat = openDialog();

      clickProcess();

      expect(onConvertFormat).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.send).not.toHaveBeenCalledWith('batch-pdf-operation', expect.anything());
    });

    it('shows the bulk-operation controls when Bulk PDF Operation is selected', () => {
      openDialog();
      selectBatchType('operation');

      const opSelect = document.getElementById('pdf-batch-operation');
      expect(
        document.getElementById('pdf-batch-operation-panel').classList.contains('hidden')
      ).toBe(false);
      expect(Array.from(opSelect.options).map((o) => o.value)).toEqual(EXPECTED_OPERATIONS);
      expect(document.getElementById('pdf-batch-process').textContent).toBe('Process');
    });
  });

  describe('bulk operation validation', () => {
    it('warns when the input folder is missing and sends nothing', () => {
      openDialog();
      selectBatchType('operation');
      setField('outputFolder', '/batch/out');

      clickProcess();

      expect(statusText()).toBe('Select an input folder.');
      expect(lastSentPayload()).toBeNull();
    });

    it('warns when the output folder is missing and sends nothing', () => {
      openDialog();
      selectBatchType('operation');
      setField('inputFolder', '/batch/in');

      clickProcess();

      expect(statusText()).toBe('Select an output folder.');
      expect(lastSentPayload()).toBeNull();
    });
  });

  describe('watermark operation', () => {
    it('sends the batch-pdf-operation payload with the single-file dialog option shapes', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('watermark');
      setFolders();
      setField('text', 'DRAFT');

      clickProcess();

      expect(lastSentPayload()).toEqual({
        operation: 'watermark',
        inputFolder: '/batch/in',
        outputFolder: '/batch/out',
        includeSubfolders: true,
        data: {
          text: 'DRAFT',
          fontSize: 48,
          opacity: 0.3,
          position: 'center',
          color: '#000000',
          pages: 'all',
        },
      });
    });

    it('warns when the watermark text is empty', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('watermark');
      setFolders();

      clickProcess();

      expect(statusText()).toBe('Enter watermark text.');
      expect(lastSentPayload()).toBeNull();
    });

    it('warns when the font size is cleared', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('watermark');
      setFolders();
      setField('text', 'DRAFT');
      setField('fontSize', '');

      clickProcess();

      expect(statusText()).toBe('Enter a font size.');
      expect(lastSentPayload()).toBeNull();
    });

    it('shows the custom-pages field only for custom pages and sends customPages', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('watermark');
      setFolders();
      setField('text', 'DRAFT');

      expect(fieldWrapperHidden('customPages')).toBe(true);

      setField('pages', 'custom');
      document.getElementById('pdf-batch-field-pages').dispatchEvent(new Event('change'));
      expect(fieldWrapperHidden('customPages')).toBe(false);

      setField('customPages', '1-2');
      clickProcess();

      expect(lastSentPayload().data).toMatchObject({ pages: 'custom', customPages: '1-2' });
    });

    it('requires custom pages when Pages is set to custom', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('watermark');
      setFolders();
      setField('text', 'DRAFT');
      setField('pages', 'custom');
      document.getElementById('pdf-batch-field-pages').dispatchEvent(new Event('change'));

      clickProcess();

      expect(statusText()).toBe('Enter the custom pages to watermark.');
      expect(lastSentPayload()).toBeNull();
    });
  });

  describe('split operation', () => {
    it('shows page-range or interval fields per split mode and validates them', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('split');
      setFolders();

      // Default mode "pages": ranges required, interval hidden.
      expect(fieldWrapperHidden('interval')).toBe(true);
      clickProcess();
      expect(statusText()).toBe('Enter page ranges (e.g. 1-5, 6-10).');
      expect(lastSentPayload()).toBeNull();

      // Interval mode: interval required, ranges hidden.
      setField('splitMode', 'interval');
      document.getElementById('pdf-batch-field-splitMode').dispatchEvent(new Event('change'));
      expect(fieldWrapperHidden('pageRanges')).toBe(true);
      setField('interval', '');
      clickProcess();
      expect(statusText()).toBe('Enter the number of pages per split file.');
      expect(lastSentPayload()).toBeNull();

      // Valid interval payload.
      setField('interval', '2');
      clickProcess();
      expect(lastSentPayload().data).toEqual({ splitMode: 'interval', interval: 2 });
    });

    it('sends pageRanges in pages mode', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('split');
      setFolders();
      setField('pageRanges', '1-2, 3');

      clickProcess();

      expect(lastSentPayload().data).toEqual({ splitMode: 'pages', pageRanges: '1-2, 3' });
    });

    it('sends only the mode for size splits', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('split');
      setFolders();
      setField('splitMode', 'size');
      document.getElementById('pdf-batch-field-splitMode').dispatchEvent(new Event('change'));

      clickProcess();

      expect(lastSentPayload().data).toEqual({ splitMode: 'size' });
    });
  });

  describe('other operations', () => {
    it('sends delete pages', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('delete');
      setFolders();
      setField('pages', '2');

      clickProcess();

      expect(lastSentPayload().data).toEqual({ pages: '2' });
    });

    it('warns when delete pages is empty', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('delete');
      setFolders();

      clickProcess();

      expect(statusText()).toBe('Enter the pages to delete (e.g. 1-3, 5).');
      expect(lastSentPayload()).toBeNull();
    });

    it('sends rotate with angle and optional pages', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('rotate');
      setFolders();
      setField('pages', '1');

      clickProcess();

      expect(lastSentPayload().data).toEqual({ angle: 90, pages: '1' });
    });

    it('sends page numbers options', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('pageNumbers');
      setFolders();

      clickProcess();

      expect(lastSentPayload().data).toEqual({ position: 'bottom-center', startNumber: 1 });
    });

    it('sends crop margins', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('crop');
      setFolders();
      setField('margins.top', '10');
      setField('margins.left', '5');

      clickProcess();

      expect(lastSentPayload().data).toEqual({
        margins: { top: 10, bottom: 0, left: 5, right: 0 },
      });
    });

    it('sends an empty data object for parameterless operations', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');
      setFolders();

      clickProcess();

      expect(lastSentPayload()).toEqual({
        operation: 'compress',
        inputFolder: '/batch/in',
        outputFolder: '/batch/out',
        includeSubfolders: true,
        data: {},
      });
    });
  });

  describe('progress and completion events', () => {
    it('sends only one operation while a run is in flight', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');
      setFolders();

      clickProcess();
      clickProcess(); // second click while the first run is still active

      const calls = ipcRenderer.send.mock.calls.filter((c) => c[0] === 'batch-pdf-operation');
      expect(calls).toHaveLength(1);

      // After completion, a new run can be started.
      listeners['pdf-batch-complete'](
        {},
        { success: true, completed: 1, failed: 0, total: 1, outputFolder: '/batch/out' }
      );
      clickProcess();
      expect(
        ipcRenderer.send.mock.calls.filter((c) => c[0] === 'batch-pdf-operation')
      ).toHaveLength(2);
    });

    it('updates the progress bar from batch-progress events', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');
      setFolders();
      clickProcess();

      listeners['batch-progress']({}, { completed: 1, failed: 0, total: 3, currentFile: 'a.pdf' });

      const fill = document.getElementById('pdf-batch-progress-fill');
      expect(fill.style.width).toBe('33%');
      expect(document.getElementById('pdf-batch-progress-text').textContent).toContain('a.pdf');
      expect(document.getElementById('pdf-batch-process').disabled).toBe(true);
    });

    it('re-enables Process and reports success on batch completion', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');
      setFolders();
      clickProcess();

      listeners['pdf-batch-complete'](
        {},
        { success: true, completed: 3, failed: 0, total: 3, outputFolder: '/batch/out' }
      );

      expect(statusText()).toContain('Batch complete: 3/3 file(s) processed');
      expect(document.getElementById('pdf-batch-process').disabled).toBe(false);
      expect(document.getElementById('pdf-batch-progress').classList.contains('hidden')).toBe(true);
    });

    it('reports failures in the completion status', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');
      setFolders();
      clickProcess();

      listeners['pdf-batch-complete'](
        {},
        { success: true, completed: 2, failed: 1, total: 3, outputFolder: '/batch/out' }
      );

      expect(statusText()).toContain('2/3 file(s) processed');
      expect(statusText()).toContain('1 failed');
    });

    it('surfaces early errors (e.g. no matching files) as a warning', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');
      setFolders();
      clickProcess();

      listeners['pdf-batch-complete'](
        {},
        { success: false, error: 'No matching files found in the selected folder.' }
      );

      expect(statusText()).toBe('Error: No matching files found in the selected folder.');
      expect(document.getElementById('pdf-batch-process').disabled).toBe(false);
    });

    it('ignores progress events while the dialog has no run in flight', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('compress');

      listeners['batch-progress']({}, { completed: 1, failed: 0, total: 3, currentFile: 'a.pdf' });

      // Still the reset value — the event was ignored because no run is active.
      expect(document.getElementById('pdf-batch-progress-fill').style.width).toBe('0%');
    });
  });

  describe('folder picker replies', () => {
    it('routes folder-selected events for its own pick types only', () => {
      openDialog();
      selectBatchType('operation');
      selectOperation('watermark');

      listeners['folder-selected']({}, { type: 'pdf-batch-input-dir', path: '/picked/in' });
      listeners['folder-selected']({}, { type: 'pdf-batch-output-dir', path: '/picked/out' });
      listeners['folder-selected']({}, { type: 'unrelated-type', path: '/elsewhere' });

      expect(document.getElementById('pdf-batch-field-inputFolder').value).toBe('/picked/in');
      expect(document.getElementById('pdf-batch-field-outputFolder').value).toBe('/picked/out');
    });
  });
});
