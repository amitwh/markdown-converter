/**
 * PDF Batch Dialog
 *
 * Batch wrapper for the single-file PDF operations (Tasks 15-16 backend via
 * PDFOperations.executeOperation): pick one operation (watermark, compress,
 * rotate, split, ...) plus that operation's shared option fields — the same
 * fields and option shapes the single-file PDF editor dialog in
 * renderer.js/index.html already sends — and apply it to every .pdf in an
 * input folder. Mirrors the batch-folder construction pattern of the Image/
 * Audio/Video Tools dialog (src/renderer/media-operations-dialog.js, Task 12):
 * a `.modal`-based dialog driven by ModalManager, folder pickers via the
 * existing generic `select-folder` / `folder-selected` IPC channels filtered by
 * a unique `type` per picker, and Process firing a fire-and-forget
 * `batch-pdf-operation` whose progress/completion arrive via `batch-progress`
 * / `pdf-batch-complete` events sent by the `batch-pdf-operation` handler in
 * main.js (which delegates to src/main/PDFBatchOperations.js).
 *
 * The dialog is reached from the Tools > Batch PDF Conversion... menu item
 * (`show-batch-converter` with type 'pdf'). Its top selector keeps that menu
 * item's existing behavior as the default: "Convert Format" delegates to the
 * pre-existing universal-converter batch flow via the `onConvertFormat`
 * callback renderer.js passes in; "Bulk PDF Operation" reveals this dialog's
 * per-file operation controls.
 *
 * Only per-file, non-interactive operations are offered (see
 * PDF_BATCH_OUTPUT_SPEC in src/main/PDFBatchOperations.js for the exclusions —
 * the renderer list and that spec intentionally agree).
 *
 * @module pdf-batch-dialog
 */

const { ipcRenderer } = require('electron');

// Field names are chosen to exactly match the `data` shape each backend
// operation destructures — see src/main/PDFOperations.js — mirroring the
// single-file PDF editor dialog's collection code in renderer.js. Defaults and
// option lists mirror the corresponding index.html sections.
const BATCH_OPERATIONS = {
  watermark: {
    label: 'Add Watermark',
    fields: [
      { name: 'text', label: 'Watermark Text', type: 'text' },
      {
        name: 'pages',
        label: 'Apply to',
        type: 'select',
        options: [
          { value: 'all', label: 'All Pages' },
          { value: 'custom', label: 'Custom Pages' },
        ],
        default: 'all',
      },
      {
        name: 'customPages',
        label: 'Custom Pages (e.g. 1-5, 7)',
        type: 'text',
        showIf: { field: 'pages', equals: 'custom' },
      },
      {
        name: 'position',
        label: 'Position',
        type: 'select',
        options: [
          'center',
          'diagonal',
          'top-left',
          'top-center',
          'top-right',
          'bottom-left',
          'bottom-center',
          'bottom-right',
        ],
        default: 'center',
      },
      { name: 'fontSize', label: 'Font Size', type: 'number', min: 8, max: 144, default: 48 },
      // 0-100 in the UI; divided by 100 before sending, like the single-file dialog.
      { name: 'opacity', label: 'Opacity (0-100)', type: 'number', min: 0, max: 100, default: 30 },
      { name: 'color', label: 'Color', type: 'color', default: '#000000' },
    ],
  },
  split: {
    label: 'Split',
    fields: [
      {
        name: 'splitMode',
        label: 'Split Mode',
        type: 'select',
        options: [
          { value: 'pages', label: 'By Page Range' },
          { value: 'interval', label: 'Every N Pages' },
          { value: 'size', label: 'By File Size' },
        ],
        default: 'pages',
      },
      {
        name: 'pageRanges',
        label: 'Page Ranges (e.g. 1-5, 6-10)',
        type: 'text',
        showIf: { field: 'splitMode', equals: 'pages' },
      },
      {
        name: 'interval',
        label: 'Pages per Split File',
        type: 'number',
        min: 1,
        default: 5,
        showIf: { field: 'splitMode', equals: 'interval' },
      },
    ],
  },
  compress: { label: 'Compress', fields: [] },
  rotate: {
    label: 'Rotate',
    fields: [
      {
        name: 'angle',
        label: 'Rotation Angle',
        type: 'select',
        options: [
          { value: '90', label: '90° Clockwise' },
          { value: '180', label: '180°' },
          { value: '270', label: '270° Clockwise (90° Counter-clockwise)' },
        ],
        default: '90',
      },
      { name: 'pages', label: 'Pages (e.g. 1-3, 5; empty = all)', type: 'text', optional: true },
    ],
  },
  delete: {
    label: 'Delete Pages',
    fields: [{ name: 'pages', label: 'Pages to Delete (e.g. 1-3, 5)', type: 'text' }],
  },
  extractText: { label: 'Extract Text', fields: [] },
  pageNumbers: {
    label: 'Add Page Numbers',
    fields: [
      {
        name: 'position',
        label: 'Position',
        type: 'select',
        options: [
          'bottom-center',
          'bottom-left',
          'bottom-right',
          'top-center',
          'top-left',
          'top-right',
        ],
        default: 'bottom-center',
      },
      { name: 'startNumber', label: 'Start Number', type: 'number', min: 1, default: 1 },
    ],
  },
  crop: {
    label: 'Crop Margins',
    fields: [
      { name: 'margins.top', label: 'Top Margin', type: 'number', min: 0, default: 0, float: true },
      {
        name: 'margins.bottom',
        label: 'Bottom Margin',
        type: 'number',
        min: 0,
        default: 0,
        float: true,
      },
      {
        name: 'margins.left',
        label: 'Left Margin',
        type: 'number',
        min: 0,
        default: 0,
        float: true,
      },
      {
        name: 'margins.right',
        label: 'Right Margin',
        type: 'number',
        min: 0,
        default: 0,
        float: true,
      },
    ],
  },
  extractImages: { label: 'Extract Images', fields: [] },
};

const INPUT_FOLDER_FIELD = { name: 'inputFolder', label: 'Input Folder' };
const OUTPUT_FOLDER_FIELD = { name: 'outputFolder', label: 'Output Folder' };
const SUBFOLDERS_FIELD = { name: 'includeSubfolders', label: 'Include subfolders' };

const INPUT_FOLDER_PICK_TYPE = 'pdf-batch-input-dir';
const OUTPUT_FOLDER_PICK_TYPE = 'pdf-batch-output-dir';

let modalEl = null;
let modalManager = null;
let els = null;
let onConvertFormatCallback = null;
// True between sending a batch-pdf-operation and its pdf-batch-complete; guards
// against firing a second overlapping run (the Process button is also disabled,
// but the batch-type switch re-labels it, so the flag is the real guard).
let runInFlight = false;

function fieldElId(name) {
  return `pdf-batch-field-${name}`;
}

function buildDialogDom() {
  modalEl = document.createElement('div');
  modalEl.id = 'pdf-batch-dialog';
  modalEl.className = 'modal hidden';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'pdf-batch-title');
  modalEl.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-content large">
      <div class="modal-header">
        <h3 id="pdf-batch-title">Batch PDF Tools</h3>
        <button class="modal-close" id="pdf-batch-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="export-section">
          <label for="pdf-batch-type">Batch Type:</label>
          <select id="pdf-batch-type">
            <option value="convert">Convert Format (existing batch converter)</option>
            <option value="operation">Bulk PDF Operation</option>
          </select>
        </div>
        <small id="pdf-batch-convert-hint">
          Format conversion (PDF to DOCX/HTML/...) uses the existing batch converter.
          Choose "Bulk PDF Operation" to watermark, compress, or otherwise process many PDFs at once.
        </small>
        <div id="pdf-batch-operation-panel" class="hidden">
          <div class="export-section">
            <label for="pdf-batch-operation">Operation:</label>
            <select id="pdf-batch-operation"></select>
          </div>
          <div id="pdf-batch-operation-fields"></div>
        </div>
        <div id="pdf-batch-status" class="info-message hidden" aria-live="polite"></div>
        <div id="pdf-batch-progress" class="batch-progress hidden">
          <div class="progress-bar">
            <div class="progress-fill" id="pdf-batch-progress-fill"></div>
          </div>
          <div class="progress-text">
            <span id="pdf-batch-progress-text">Processing...</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="pdf-batch-cancel" class="btn btn-secondary" data-close>Cancel</button>
        <button id="pdf-batch-process" class="btn btn-primary">Open Batch Converter...</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  els = {
    typeSelect: modalEl.querySelector('#pdf-batch-type'),
    convertHint: modalEl.querySelector('#pdf-batch-convert-hint'),
    operationPanel: modalEl.querySelector('#pdf-batch-operation-panel'),
    operationSelect: modalEl.querySelector('#pdf-batch-operation'),
    fieldsContainer: modalEl.querySelector('#pdf-batch-operation-fields'),
    status: modalEl.querySelector('#pdf-batch-status'),
    progress: modalEl.querySelector('#pdf-batch-progress'),
    progressFill: modalEl.querySelector('#pdf-batch-progress-fill'),
    progressText: modalEl.querySelector('#pdf-batch-progress-text'),
    processBtn: modalEl.querySelector('#pdf-batch-process'),
  };

  els.typeSelect.addEventListener('change', updateBatchTypeUI);
  els.operationSelect.addEventListener('change', renderOperationFields);
  els.processBtn.addEventListener('click', handleProcess);
  modalEl.querySelector('#pdf-batch-cancel').addEventListener('click', hideDialog);

  modalManager = new window.ModalManager(modalEl);

  // Generic output-folder picker reply (shared with the batch converter's
  // input/output folder pickers) — filter by our own `type` so we only react
  // to requests this dialog made.
  ipcRenderer.on('folder-selected', (event, { type, path: folderPath }) => {
    if (!folderPath) return;
    const fieldName =
      type === INPUT_FOLDER_PICK_TYPE
        ? INPUT_FOLDER_FIELD.name
        : type === OUTPUT_FOLDER_PICK_TYPE
          ? OUTPUT_FOLDER_FIELD.name
          : null;
    if (!fieldName) return;
    const input = document.getElementById(fieldElId(fieldName));
    if (input) input.value = folderPath;
  });

  // Batch operation progress/completion (main.js: batch-pdf-operation handler,
  // delegating to runPDFBatchOperation() in src/main/PDFBatchOperations.js).
  ipcRenderer.on('batch-progress', (event, { completed, failed, total, currentFile }) => {
    if (!els.progress || els.progress.classList.contains('hidden')) return;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = currentFile
      ? `Processing ${completed + 1}/${total}: ${currentFile}${failed ? ` (${failed} failed so far)` : ''}`
      : `Processed ${completed}/${total}${failed ? ` (${failed} failed)` : ''}`;
  });
  ipcRenderer.on('pdf-batch-complete', (event, { success, completed, failed, total, error }) => {
    runInFlight = false;
    hideProgress();
    if (success) {
      showStatus(
        `Batch complete: ${completed}/${total} file(s) processed${failed ? ` (${failed} failed)` : ''}.`,
        failed > 0 ? 'warning' : 'success'
      );
    } else {
      showStatus(`Error: ${error || 'Batch operation failed.'}`, 'warning');
    }
  });
}

function ensureDialog() {
  if (!modalEl) {
    buildDialogDom();
  }
}

function clearStatus() {
  els.status.textContent = '';
  els.status.classList.remove('info-message', 'warning-message', 'success-message');
  els.status.classList.add('hidden');
}

function showStatus(message, type = 'info') {
  els.status.textContent = message;
  els.status.classList.remove('hidden', 'info-message', 'warning-message', 'success-message');
  els.status.classList.add(`${type}-message`);
}

function showProgress() {
  els.progress.classList.remove('hidden');
  els.progressText.textContent = 'Scanning folder...';
  els.progressFill.style.width = '0%';
  els.processBtn.disabled = true;
}

function hideProgress() {
  els.progress.classList.add('hidden');
  els.progressFill.style.width = '0%';
  els.processBtn.disabled = false;
}

function optionValue(option) {
  return typeof option === 'string' ? option : option.value;
}

function optionLabel(option) {
  return typeof option === 'string' ? option : option.label;
}

function createLabeledWrapper(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';
  wrapper.id = `${fieldElId(field.name)}-wrapper`;
  const label = document.createElement('label');
  label.setAttribute('for', fieldElId(field.name));
  label.textContent = `${field.label}:`;
  wrapper.appendChild(label);
  return wrapper;
}

function renderTextField(field) {
  const wrapper = createLabeledWrapper(field);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = fieldElId(field.name);
  input.placeholder = field.placeholder || '';
  wrapper.appendChild(input);
  return wrapper;
}

function renderNumberField(field) {
  const wrapper = createLabeledWrapper(field);
  const input = document.createElement('input');
  input.type = 'number';
  input.id = fieldElId(field.name);
  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  if (field.default !== undefined) input.value = field.default;
  wrapper.appendChild(input);
  return wrapper;
}

function renderSelectField(field) {
  const wrapper = createLabeledWrapper(field);
  const select = document.createElement('select');
  select.id = fieldElId(field.name);
  field.options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = optionValue(opt);
    option.textContent = optionLabel(opt);
    if (optionValue(opt) === field.default) option.selected = true;
    select.appendChild(option);
  });
  // Attached to the select itself (not via a bubbling container listener) so
  // conditional fields update regardless of how the change event was fired.
  select.addEventListener('change', updateConditionalFields);
  wrapper.appendChild(select);
  return wrapper;
}

function renderColorField(field) {
  const wrapper = createLabeledWrapper(field);
  const input = document.createElement('input');
  input.type = 'color';
  input.id = fieldElId(field.name);
  input.value = field.default || '#000000';
  wrapper.appendChild(input);
  return wrapper;
}

function createFolderPickerField(field, pickType) {
  const wrapper = createLabeledWrapper(field);
  const group = document.createElement('div');
  group.className = 'folder-input-group';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = fieldElId(field.name);
  input.placeholder = 'Choose...';
  input.readOnly = true;
  group.appendChild(input);

  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.textContent = 'Browse Folder';
  browseBtn.addEventListener('click', () => {
    ipcRenderer.send('select-folder', pickType);
  });
  group.appendChild(browseBtn);

  wrapper.appendChild(group);
  return wrapper;
}

function renderCheckboxField(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';
  wrapper.id = `${fieldElId(field.name)}-wrapper`;

  const label = document.createElement('label');
  label.setAttribute('for', fieldElId(field.name));

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = fieldElId(field.name);
  input.checked = true;
  input.style.marginRight = '0.5em';

  label.appendChild(input);
  label.appendChild(document.createTextNode(field.label));
  wrapper.appendChild(label);
  return wrapper;
}

function fieldIsVisible(field, values) {
  if (!field.showIf) return true;
  return values[field.showIf.field] === field.showIf.equals;
}

// Toggles the hidden class of conditionally-shown fields (watermark custom
// pages, split ranges/interval) based on the current select values.
function updateConditionalFields() {
  const opConfig = BATCH_OPERATIONS[els.operationSelect.value];
  if (!opConfig) return;
  const values = {};
  opConfig.fields.forEach((field) => {
    const input = document.getElementById(fieldElId(field.name));
    if (input) values[field.name] = input.value;
  });
  opConfig.fields.forEach((field) => {
    if (!field.showIf) return;
    const wrapper = document.getElementById(`${fieldElId(field.name)}-wrapper`);
    if (wrapper) wrapper.classList.toggle('hidden', !fieldIsVisible(field, values));
  });
}

function renderOperationFields() {
  const opConfig = BATCH_OPERATIONS[els.operationSelect.value];
  els.fieldsContainer.innerHTML = '';

  els.fieldsContainer.appendChild(
    createFolderPickerField(INPUT_FOLDER_FIELD, INPUT_FOLDER_PICK_TYPE)
  );
  els.fieldsContainer.appendChild(renderCheckboxField(SUBFOLDERS_FIELD));

  opConfig.fields.forEach((field) => {
    let fieldEl;
    switch (field.type) {
      case 'text':
        fieldEl = renderTextField(field);
        break;
      case 'number':
        fieldEl = renderNumberField(field);
        break;
      case 'select':
        fieldEl = renderSelectField(field);
        break;
      case 'color':
        fieldEl = renderColorField(field);
        break;
      default:
        return;
    }
    els.fieldsContainer.appendChild(fieldEl);
  });

  els.fieldsContainer.appendChild(
    createFolderPickerField(OUTPUT_FOLDER_FIELD, OUTPUT_FOLDER_PICK_TYPE)
  );
  updateConditionalFields();
}

function updateBatchTypeUI() {
  const isConvert = els.typeSelect.value === 'convert';
  els.convertHint.classList.toggle('hidden', !isConvert);
  els.operationPanel.classList.toggle('hidden', isConvert);
  els.processBtn.textContent = isConvert ? 'Open Batch Converter...' : 'Process';
  // Progress state is left alone here: clearing it mid-run would re-enable the
  // Process button while a batch is still in flight (runInFlight guards that).
  clearStatus();
}

// Reads the shared option fields into the exact `data` shape the backend
// operation destructures, dropping conditionally-hidden fields and applying
// per-op conversions (opacity /100, margins grouping) exactly like the
// single-file PDF editor dialog does.
function collectOperationData(opKey) {
  const opConfig = BATCH_OPERATIONS[opKey];
  const raw = {};
  for (const field of opConfig.fields) {
    const input = document.getElementById(fieldElId(field.name));
    if (!input) continue;
    if (field.type === 'number') {
      const num = field.float ? parseFloat(input.value) : parseInt(input.value, 10);
      raw[field.name] = Number.isFinite(num) ? num : null;
    } else {
      raw[field.name] = input.value.trim();
    }
  }

  const visible = (name) =>
    fieldIsVisible(
      opConfig.fields.find((f) => f.name === name),
      raw
    );

  let data;
  switch (opKey) {
    case 'watermark':
      data = {
        text: raw.text,
        fontSize: raw.fontSize,
        opacity: raw.opacity !== null ? raw.opacity / 100 : null,
        position: raw.position,
        color: raw.color,
        pages: raw.pages,
      };
      if (raw.pages === 'custom' && visible('customPages')) {
        data.customPages = raw.customPages;
      }
      break;
    case 'split':
      data = { splitMode: raw.splitMode };
      if (raw.splitMode === 'pages' && visible('pageRanges')) data.pageRanges = raw.pageRanges;
      if (raw.splitMode === 'interval' && visible('interval')) data.interval = raw.interval;
      break;
    case 'rotate':
      data = { angle: parseInt(raw.angle, 10), pages: raw.pages };
      break;
    case 'delete':
      data = { pages: raw.pages };
      break;
    case 'pageNumbers':
      data = { position: raw.position, startNumber: raw.startNumber };
      break;
    case 'crop':
      data = {
        margins: {
          top: raw['margins.top'],
          bottom: raw['margins.bottom'],
          left: raw['margins.left'],
          right: raw['margins.right'],
        },
      };
      break;
    default:
      data = {};
  }
  return { data };
}

// Per-operation required-field checks, mirroring the single-file dialog's
// validation messages.
function validateOperationData(opKey, data) {
  switch (opKey) {
    case 'watermark':
      if (!data.text) return 'Enter watermark text.';
      if (!data.fontSize) return 'Enter a font size.';
      if (data.pages === 'custom' && !data.customPages) {
        return 'Enter the custom pages to watermark.';
      }
      return null;
    case 'split':
      if (data.splitMode === 'pages' && !data.pageRanges) {
        return 'Enter page ranges (e.g. 1-5, 6-10).';
      }
      if (data.splitMode === 'interval' && !data.interval) {
        return 'Enter the number of pages per split file.';
      }
      return null;
    case 'delete':
      if (!data.pages) return 'Enter the pages to delete (e.g. 1-3, 5).';
      return null;
    default:
      return null;
  }
}

function handleConvertProcess() {
  hideDialog();
  if (typeof onConvertFormatCallback === 'function') {
    onConvertFormatCallback();
  }
}

function handleBulkProcess() {
  if (runInFlight) return;

  const inputFolder = document.getElementById(fieldElId(INPUT_FOLDER_FIELD.name))?.value;
  const outputFolder = document.getElementById(fieldElId(OUTPUT_FOLDER_FIELD.name))?.value;
  const includeSubfolders =
    document.getElementById(fieldElId(SUBFOLDERS_FIELD.name))?.checked !== false;

  if (!inputFolder) {
    showStatus('Select an input folder.', 'warning');
    return;
  }
  if (!outputFolder) {
    showStatus('Select an output folder.', 'warning');
    return;
  }

  const opKey = els.operationSelect.value;
  const { data } = collectOperationData(opKey);
  const error = validateOperationData(opKey, data);
  if (error) {
    showStatus(error, 'warning');
    return;
  }

  clearStatus();
  showProgress();
  runInFlight = true;

  ipcRenderer.send('batch-pdf-operation', {
    operation: opKey,
    inputFolder,
    outputFolder,
    includeSubfolders,
    data,
  });
}

function handleProcess() {
  if (els.typeSelect.value === 'convert') {
    handleConvertProcess();
  } else {
    handleBulkProcess();
  }
}

function hideDialog() {
  if (modalManager) modalManager.close();
  clearStatus();
  hideProgress();
}

/**
 * Opens the Batch PDF Tools dialog.
 *
 * @param {object} [options]
 * @param {Function} [options.onConvertFormat] - Invoked when the user keeps the
 *   default "Convert Format" batch type; renderer.js passes the pre-existing
 *   universal-converter batch flow that the Tools > Batch PDF Conversion...
 *   menu item used to open directly.
 */
function showPdfBatchDialog(options = {}) {
  ensureDialog();
  onConvertFormatCallback = options.onConvertFormat || null;

  els.operationSelect.innerHTML = '';
  Object.entries(BATCH_OPERATIONS).forEach(([key, op]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = op.label;
    els.operationSelect.appendChild(option);
  });

  els.typeSelect.value = 'convert';
  runInFlight = false;
  clearStatus();
  hideProgress();
  updateBatchTypeUI();
  renderOperationFields();
  modalManager.open();
}

module.exports = { showPdfBatchDialog, BATCH_OPERATIONS };
