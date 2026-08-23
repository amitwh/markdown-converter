/**
 * Media Operations Dialog
 *
 * Single dialog for image/audio/video operation-specific tasks (resize, compress,
 * rotate, trim, extract, merge, frames, gif, ...). Mirrors the construction pattern
 * used by the PDF Editor dialog in renderer.js (a modal built from `.modal` /
 * `.modal-content` / `.modal-header` / `.modal-body` / `.modal-footer` markup, driven
 * by ModalManager, with a readonly text input + "Browse" button for file/folder
 * selection, and a status line reusing the `info-message` / `success-message` /
 * `warning-message` classes) — except the operation-specific fields are generated
 * dynamically instead of being hand-authored per-operation in index.html, since the
 * three media kinds together cover 13 distinct operations.
 *
 * File selection reuses the app's existing convention: a plain `<input type="file">`
 * whose `.path` is read directly (nodeIntegration is enabled for this renderer), the
 * same approach already used throughout the PDF Editor and Universal Converter
 * dialogs. No new IPC channel is needed for single-file or save-file pickers. Output
 * *folder* selection (used by the video "Extract Frames" operation, and by batch
 * mode below) reuses the existing generic `select-folder` / `folder-selected` IPC
 * channels already wired up in main.js for the batch converter — filtered here by a
 * unique `type` string per picker so this dialog only reacts to requests it made.
 *
 * A "Mode: Single File / Batch Folder" dropdown (disabled for audio "Merge", which
 * doesn't fit a per-file batch model) swaps the input/output file fields for an
 * Input Folder + "Include subfolders" + Output Folder trio while keeping every other
 * parameter field as-is; Process then fires `batch-image-operation` /
 * `batch-audio-operation` / `batch-video-operation` (fire-and-forget, like
 * `universal-convert-batch`) and progress/completion arrive via the
 * `media-batch-progress` / `media-batch-complete` events sent by
 * `runMediaBatchOperation()` in main.js.
 *
 * @module media-operations-dialog
 */

const { ipcRenderer } = require('electron');

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.avif,.tiff,.tif,.gif';
const AUDIO_ACCEPT = '.mp3,.wav,.ogg,.flac,.aac,.m4a,.wma';
const VIDEO_ACCEPT = '.mp4,.mov,.avi,.mkv,.webm,.flv,.wmv';

// Field names below are chosen to exactly match the `data` shape each backend
// operation destructures — see src/main/ImageOperations.js, AudioOperations.js,
// VideoOperations.js.
const MEDIA_KIND_CONFIG = {
  image: {
    title: 'Image Tools',
    channel: 'process-image-operation',
    batchChannel: 'batch-image-operation',
    operations: {
      convert: {
        label: 'Convert Format',
        fields: [
          { name: 'inputPath', label: 'Input Image', type: 'file', accept: IMAGE_ACCEPT },
          {
            name: 'format',
            label: 'Output Format',
            type: 'select',
            options: ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'],
            default: 'png',
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      resize: {
        label: 'Resize',
        help: 'Provide at least one of Width or Height; the other scales proportionally.',
        fields: [
          { name: 'inputPath', label: 'Input Image', type: 'file', accept: IMAGE_ACCEPT },
          { name: 'width', label: 'Width (px)', type: 'number', min: 1, optional: true },
          { name: 'height', label: 'Height (px)', type: 'number', min: 1, optional: true },
          {
            name: 'fit',
            label: 'Fit Mode',
            type: 'select',
            options: ['cover', 'contain', 'fill', 'inside', 'outside'],
            default: 'inside',
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      compress: {
        label: 'Compress',
        fields: [
          { name: 'inputPath', label: 'Input Image', type: 'file', accept: IMAGE_ACCEPT },
          {
            name: 'quality',
            label: 'Quality (1-100)',
            type: 'number',
            min: 1,
            max: 100,
            default: 80,
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      rotate: {
        label: 'Rotate',
        fields: [
          { name: 'inputPath', label: 'Input Image', type: 'file', accept: IMAGE_ACCEPT },
          { name: 'angle', label: 'Angle (degrees)', type: 'number', default: 90, step: 1 },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
    },
  },
  audio: {
    title: 'Audio Tools',
    channel: 'process-audio-operation',
    batchChannel: 'batch-audio-operation',
    operations: {
      convert: {
        label: 'Convert Format',
        fields: [
          { name: 'inputPath', label: 'Input Audio', type: 'file', accept: AUDIO_ACCEPT },
          {
            name: 'format',
            label: 'Output Format',
            type: 'select',
            options: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
            default: 'mp3',
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      trim: {
        label: 'Trim',
        fields: [
          { name: 'inputPath', label: 'Input Audio', type: 'file', accept: AUDIO_ACCEPT },
          {
            name: 'startTime',
            label: 'Start Time (seconds)',
            type: 'number',
            min: 0,
            default: 0,
          },
          { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 0, default: 10 },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      extract: {
        label: 'Extract Audio Track',
        help: 'Extracts the audio track from a video or audio file.',
        fields: [
          {
            name: 'inputPath',
            label: 'Input File (video or audio)',
            type: 'file',
            accept: `${VIDEO_ACCEPT},${AUDIO_ACCEPT}`,
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      merge: {
        label: 'Merge',
        help: 'Select at least 2 audio files to merge, in order.',
        // Merge combines several input files into a single output — it does not
        // fit the "apply the same operation to every file in a folder" batch model
        // (there is no single "one operation per file" mapping), so batch mode is
        // unavailable for it. Enforced both here (hides the Batch option in the UI)
        // and defensively in main.js's BATCH_OUTPUT_SPEC (no 'merge' entry).
        batchable: false,
        fields: [
          {
            name: 'inputPaths',
            label: 'Input Audio Files',
            type: 'files',
            accept: AUDIO_ACCEPT,
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
    },
  },
  video: {
    title: 'Video Tools',
    channel: 'process-video-operation',
    batchChannel: 'batch-video-operation',
    operations: {
      convert: {
        label: 'Convert Format',
        help: 'Output format is inferred from the output file extension (e.g. .mp4, .webm).',
        fields: [
          { name: 'inputPath', label: 'Input Video', type: 'file', accept: VIDEO_ACCEPT },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      compress: {
        label: 'Compress',
        fields: [
          { name: 'inputPath', label: 'Input Video', type: 'file', accept: VIDEO_ACCEPT },
          {
            name: 'crf',
            label: 'CRF (0-51, lower = higher quality)',
            type: 'number',
            min: 0,
            max: 51,
            default: 28,
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      trim: {
        label: 'Trim',
        fields: [
          { name: 'inputPath', label: 'Input Video', type: 'file', accept: VIDEO_ACCEPT },
          {
            name: 'startTime',
            label: 'Start Time (seconds)',
            type: 'number',
            min: 0,
            default: 0,
          },
          { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 0, default: 10 },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
      frames: {
        label: 'Extract Frames',
        fields: [
          { name: 'inputPath', label: 'Input Video', type: 'file', accept: VIDEO_ACCEPT },
          {
            name: 'fps',
            label: 'Frames per Second',
            type: 'number',
            min: 0.1,
            step: 0.1,
            default: 1,
          },
          { name: 'outputDir', label: 'Output Folder', type: 'folder' },
        ],
      },
      gif: {
        label: 'Convert to GIF',
        fields: [
          { name: 'inputPath', label: 'Input Video', type: 'file', accept: VIDEO_ACCEPT },
          { name: 'fps', label: 'Frames per Second', type: 'number', min: 1, default: 10 },
          {
            name: 'width',
            label: 'Width (px, height auto-scales)',
            type: 'number',
            min: 1,
            default: 480,
          },
          { name: 'outputPath', label: 'Output File', type: 'save' },
        ],
      },
    },
  },
};

const FOLDER_PICK_TYPE = 'media-operations-output-dir';
const BATCH_INPUT_FOLDER_PICK_TYPE = 'media-operations-batch-input-dir';
const BATCH_OUTPUT_FOLDER_PICK_TYPE = 'media-operations-batch-output-dir';

const BATCH_INPUT_FIELD_NAME = 'batchInputFolder';
const BATCH_OUTPUT_FIELD_NAME = 'batchOutputFolder';
const BATCH_SUBFOLDERS_FIELD_NAME = 'batchIncludeSubfolders';

let modalEl = null;
let modalManager = null;
let els = null;
let currentKind = null;
let currentMode = 'single';
let mergeFilePaths = [];

function fieldElId(name) {
  return `media-field-${name}`;
}

function buildDialogDom() {
  modalEl = document.createElement('div');
  modalEl.id = 'media-operations-dialog';
  modalEl.className = 'modal hidden';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-labelledby', 'media-operations-title');
  modalEl.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal-content large">
      <div class="modal-header">
        <h3 id="media-operations-title">Media Tools</h3>
        <button class="modal-close" id="media-operations-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="export-section">
          <label for="media-operation-select">Operation:</label>
          <select id="media-operation-select"></select>
        </div>
        <div class="export-section">
          <label for="media-mode-select">Mode:</label>
          <select id="media-mode-select">
            <option value="single">Single File</option>
            <option value="batch">Batch Folder (apply to every matching file)</option>
          </select>
        </div>
        <small id="media-operation-help" class="hidden"></small>
        <div id="media-operation-fields"></div>
        <div id="media-status-message" class="info-message hidden" aria-live="polite"></div>
        <div id="media-progress" class="batch-progress hidden">
          <div class="progress-bar">
            <div class="progress-fill" id="media-progress-fill"></div>
          </div>
          <div class="progress-text">
            <span id="media-progress-text">Processing...</span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button id="media-operations-cancel" class="btn btn-secondary" data-close>Cancel</button>
        <button id="media-operations-process" class="btn btn-primary">Process</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  els = {
    title: modalEl.querySelector('#media-operations-title'),
    operationSelect: modalEl.querySelector('#media-operation-select'),
    modeSelect: modalEl.querySelector('#media-mode-select'),
    help: modalEl.querySelector('#media-operation-help'),
    fieldsContainer: modalEl.querySelector('#media-operation-fields'),
    status: modalEl.querySelector('#media-status-message'),
    progress: modalEl.querySelector('#media-progress'),
    progressFill: modalEl.querySelector('#media-progress-fill'),
    progressText: modalEl.querySelector('#media-progress-text'),
    processBtn: modalEl.querySelector('#media-operations-process'),
    cancelBtn: modalEl.querySelector('#media-operations-cancel'),
  };

  els.operationSelect.addEventListener('change', () => {
    currentMode = 'single';
    updateModeOptions();
    renderFields();
  });
  els.modeSelect.addEventListener('change', () => {
    currentMode = els.modeSelect.value;
    renderFields();
  });
  els.processBtn.addEventListener('click', handleProcess);
  els.cancelBtn.addEventListener('click', hideDialog);

  modalManager = new window.ModalManager(modalEl);

  // Generic output-folder picker reply (shared with the batch converter's
  // input/output folder pickers) — filter by our own `type` so we only react
  // to requests this dialog made.
  ipcRenderer.on('folder-selected', (event, { type, path: folderPath }) => {
    if (!folderPath) return;
    let targetFieldName = null;
    if (type === FOLDER_PICK_TYPE) targetFieldName = 'outputDir';
    else if (type === BATCH_INPUT_FOLDER_PICK_TYPE) targetFieldName = BATCH_INPUT_FIELD_NAME;
    else if (type === BATCH_OUTPUT_FOLDER_PICK_TYPE) targetFieldName = BATCH_OUTPUT_FIELD_NAME;
    if (!targetFieldName) return;
    const input = document.getElementById(fieldElId(targetFieldName));
    if (input) input.value = folderPath;
  });

  // Batch operation progress/completion (main.js: runMediaBatchOperation()).
  ipcRenderer.on('media-batch-progress', (event, { completed, failed, total, currentFile }) => {
    if (!els.progress || els.progress.classList.contains('hidden')) return;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = currentFile
      ? `Processing ${completed + 1}/${total}: ${currentFile}${failed ? ` (${failed} failed so far)` : ''}`
      : `Processed ${completed}/${total}${failed ? ` (${failed} failed)` : ''}`;
  });
  ipcRenderer.on('media-batch-complete', (event, { success, completed, failed, total, error }) => {
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
  if (!els.status) return;
  els.status.textContent = '';
  els.status.classList.remove('info-message', 'warning-message', 'success-message');
  els.status.classList.add('hidden');
}

function showStatus(message, type = 'info') {
  if (!els.status) return;
  els.status.textContent = message;
  els.status.classList.remove('hidden', 'info-message', 'warning-message', 'success-message');
  els.status.classList.add(`${type}-message`);
}

function showProgress() {
  els.progress.classList.remove('hidden');
  els.progressText.textContent = 'Processing...';
  els.progressFill.style.width = '50%';
  els.processBtn.disabled = true;
}

function hideProgress() {
  els.progress.classList.add('hidden');
  els.progressFill.style.width = '0%';
  els.processBtn.disabled = false;
}

function createFolderInputGroup(field, { onBrowse }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';

  const label = document.createElement('label');
  label.setAttribute('for', fieldElId(field.name));
  label.textContent = `${field.label}:`;
  wrapper.appendChild(label);

  const group = document.createElement('div');
  group.className = 'folder-input-group';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = fieldElId(field.name);
  input.placeholder = field.placeholder || 'Choose...';
  input.readOnly = true;
  group.appendChild(input);

  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.textContent = field.type === 'folder' ? 'Browse Folder' : 'Browse';
  browseBtn.addEventListener('click', () => onBrowse(input));
  group.appendChild(browseBtn);

  wrapper.appendChild(group);
  return wrapper;
}

function renderFileField(field) {
  return createFolderInputGroup(field, {
    onBrowse: (input) => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = field.accept || '*';
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) input.value = file.path;
      };
      fileInput.click();
    },
  });
}

function renderSaveField(field) {
  return createFolderInputGroup(field, {
    onBrowse: (input) => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.nwsaveas = true;
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) input.value = file.path;
      };
      fileInput.click();
    },
  });
}

function renderFolderField(field, pickType = FOLDER_PICK_TYPE) {
  return createFolderInputGroup(field, {
    onBrowse: () => {
      ipcRenderer.send('select-folder', pickType);
    },
  });
}

function renderCheckboxField(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';

  const label = document.createElement('label');
  label.setAttribute('for', fieldElId(field.name));

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = fieldElId(field.name);
  input.checked = field.default !== false;
  input.style.marginRight = '0.5em';

  label.appendChild(input);
  label.appendChild(document.createTextNode(field.label));
  wrapper.appendChild(label);

  return wrapper;
}

function renderNumberField(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';

  const label = document.createElement('label');
  label.setAttribute('for', fieldElId(field.name));
  label.textContent = `${field.label}:`;
  wrapper.appendChild(label);

  const input = document.createElement('input');
  input.type = 'number';
  input.id = fieldElId(field.name);
  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  if (field.step !== undefined) input.step = field.step;
  if (field.default !== undefined) input.value = field.default;
  wrapper.appendChild(input);

  return wrapper;
}

function renderSelectField(field) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';

  const label = document.createElement('label');
  label.setAttribute('for', fieldElId(field.name));
  label.textContent = `${field.label}:`;
  wrapper.appendChild(label);

  const select = document.createElement('select');
  select.id = fieldElId(field.name);
  field.options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    if (opt === field.default) option.selected = true;
    select.appendChild(option);
  });
  wrapper.appendChild(select);

  return wrapper;
}

function updateMergeFilesList(listContainer) {
  listContainer.innerHTML = '';
  mergeFilePaths.forEach((filePath, index) => {
    const fileEntry = document.createElement('div');
    fileEntry.className = 'file-entry';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = filePath.split(/[\\/]/).pop();
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      mergeFilePaths.splice(index, 1);
      updateMergeFilesList(listContainer);
    });
    fileEntry.appendChild(name);
    fileEntry.appendChild(removeBtn);
    listContainer.appendChild(fileEntry);
  });
}

function renderFilesField(field) {
  mergeFilePaths = [];

  const wrapper = document.createElement('div');
  wrapper.className = 'export-section';

  const label = document.createElement('label');
  label.textContent = `${field.label}:`;
  wrapper.appendChild(label);

  const listContainer = document.createElement('div');
  listContainer.className = 'file-list';
  listContainer.id = fieldElId(field.name);
  wrapper.appendChild(listContainer);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = '+ Add File';
  addBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = field.accept || '*';
    fileInput.multiple = true;
    fileInput.onchange = (e) => {
      Array.from(e.target.files).forEach((file) => {
        if (!mergeFilePaths.includes(file.path)) {
          mergeFilePaths.push(file.path);
        }
      });
      updateMergeFilesList(listContainer);
    };
    fileInput.click();
  });
  wrapper.appendChild(addBtn);

  return wrapper;
}

// The field carrying the input-file picker for a batchable operation is always a
// 'file' field (single input) — 'files' (merge) operations are excluded from batch
// mode via `batchable: false` before this is ever consulted.
function getInputFileField(opConfig) {
  return opConfig.fields.find((field) => field.type === 'file');
}

function isBatchable(opConfig) {
  return opConfig.batchable !== false;
}

// Keep the Mode dropdown in sync with whether the currently selected operation
// supports batch mode (everything except audio "Merge").
function updateModeOptions() {
  const kindConfig = MEDIA_KIND_CONFIG[currentKind];
  const opConfig = kindConfig.operations[els.operationSelect.value];
  const batchOption = els.modeSelect.querySelector('option[value="batch"]');
  if (batchOption) {
    batchOption.disabled = !isBatchable(opConfig);
  }
  if (!isBatchable(opConfig)) {
    currentMode = 'single';
  }
  els.modeSelect.value = currentMode;
}

function renderSingleFields(opConfig) {
  opConfig.fields.forEach((field) => {
    let fieldEl;
    switch (field.type) {
      case 'file':
        fieldEl = renderFileField(field);
        break;
      case 'save':
        fieldEl = renderSaveField(field);
        break;
      case 'folder':
        fieldEl = renderFolderField(field);
        break;
      case 'number':
        fieldEl = renderNumberField(field);
        break;
      case 'select':
        fieldEl = renderSelectField(field);
        break;
      case 'files':
        fieldEl = renderFilesField(field);
        break;
      default:
        return;
    }
    els.fieldsContainer.appendChild(fieldEl);
  });
}

// Batch mode swaps the single input/output file (or folder) fields for one
// "Input Folder" + "Include Subfolders" + "Output Folder" trio, while keeping every
// other parameter field (width/height/quality/angle/startTime/duration/crf/fps/
// format/fit/...) exactly as in single mode — those values apply to every matching
// file. The actual per-file output path/dir is computed by main.js's
// runMediaBatchOperation()/BATCH_OUTPUT_SPEC.
function renderBatchFields(opConfig) {
  els.fieldsContainer.appendChild(
    renderFolderField(
      { name: BATCH_INPUT_FIELD_NAME, label: 'Input Folder', type: 'folder' },
      BATCH_INPUT_FOLDER_PICK_TYPE
    )
  );
  els.fieldsContainer.appendChild(
    renderCheckboxField({
      name: BATCH_SUBFOLDERS_FIELD_NAME,
      label: 'Include subfolders',
      default: true,
    })
  );

  opConfig.fields.forEach((field) => {
    if (field.type === 'number') {
      els.fieldsContainer.appendChild(renderNumberField(field));
    } else if (field.type === 'select') {
      els.fieldsContainer.appendChild(renderSelectField(field));
    }
    // 'file' / 'save' / 'folder' single-file fields are intentionally skipped —
    // replaced by the Input/Output Folder fields below/above.
  });

  els.fieldsContainer.appendChild(
    renderFolderField(
      { name: BATCH_OUTPUT_FIELD_NAME, label: 'Output Folder', type: 'folder' },
      BATCH_OUTPUT_FOLDER_PICK_TYPE
    )
  );
}

function renderFields() {
  const kindConfig = MEDIA_KIND_CONFIG[currentKind];
  const opKey = els.operationSelect.value;
  const opConfig = kindConfig.operations[opKey];

  updateModeOptions();
  els.fieldsContainer.innerHTML = '';

  if (opConfig.help) {
    els.help.textContent = opConfig.help;
    els.help.classList.remove('hidden');
  } else {
    els.help.textContent = '';
    els.help.classList.add('hidden');
  }

  if (currentMode === 'batch') {
    renderBatchFields(opConfig);
  } else {
    renderSingleFields(opConfig);
  }
}

function collectOperationData(opConfig) {
  const data = {};

  for (const field of opConfig.fields) {
    if (field.type === 'files') {
      data[field.name] = [...mergeFilePaths];
      continue;
    }

    const input = document.getElementById(fieldElId(field.name));
    if (!input) continue;

    if (field.type === 'number') {
      const raw = String(input.value).trim();
      if (raw === '') {
        if (field.optional) {
          data[field.name] = null;
          continue;
        }
        return { error: `${field.label} is required.` };
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        return { error: `${field.label} must be a valid number.` };
      }
      data[field.name] = num;
    } else {
      data[field.name] = input.value;
    }
  }

  if ('inputPath' in data && !data.inputPath) {
    return { error: 'Select an input file.' };
  }
  if ('inputPaths' in data && (!data.inputPaths || data.inputPaths.length < 2)) {
    return { error: 'Select at least 2 input files.' };
  }
  if ('outputPath' in data && !data.outputPath) {
    return { error: 'Select an output file.' };
  }
  if ('outputDir' in data && !data.outputDir) {
    return { error: 'Select an output folder.' };
  }
  if ('width' in data && 'height' in data && data.width === null && data.height === null) {
    return { error: 'Provide at least one of Width or Height.' };
  }

  return { data };
}

async function handleSingleProcess(kindConfig, opKey, opConfig) {
  const { data, error } = collectOperationData(opConfig);
  if (error) {
    showStatus(error, 'warning');
    return;
  }

  clearStatus();
  showProgress();

  try {
    const result = await ipcRenderer.invoke(kindConfig.channel, { operation: opKey, data });
    hideProgress();
    if (result && result.success) {
      showStatus(
        `Success: ${result.outputPath || result.outputDir || 'Operation completed.'}`,
        'success'
      );
    } else {
      showStatus(`Error: ${(result && result.error) || 'Operation failed.'}`, 'warning');
    }
  } catch (err) {
    hideProgress();
    showStatus(`Error: ${err.message}`, 'warning');
  }
}

// Collects the shared parameter fields (number/select only — no file/folder/files
// fields) that apply identically to every file in a batch run.
function collectBatchParamData(opConfig) {
  const data = {};
  for (const field of opConfig.fields) {
    if (field.type !== 'number' && field.type !== 'select') continue;
    const input = document.getElementById(fieldElId(field.name));
    if (!input) continue;

    if (field.type === 'number') {
      const raw = String(input.value).trim();
      if (raw === '') {
        if (field.optional) {
          data[field.name] = null;
          continue;
        }
        return { error: `${field.label} is required.` };
      }
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        return { error: `${field.label} must be a valid number.` };
      }
      data[field.name] = num;
    } else {
      data[field.name] = input.value;
    }
  }

  if ('width' in data && 'height' in data && data.width === null && data.height === null) {
    return { error: 'Provide at least one of Width or Height.' };
  }

  return { data };
}

function handleBatchProcess(kindConfig, opKey, opConfig) {
  const inputFolder = document.getElementById(fieldElId(BATCH_INPUT_FIELD_NAME))?.value;
  const outputFolder = document.getElementById(fieldElId(BATCH_OUTPUT_FIELD_NAME))?.value;
  const includeSubfolders =
    document.getElementById(fieldElId(BATCH_SUBFOLDERS_FIELD_NAME))?.checked !== false;

  if (!inputFolder) {
    showStatus('Select an input folder.', 'warning');
    return;
  }
  if (!outputFolder) {
    showStatus('Select an output folder.', 'warning');
    return;
  }

  const { data, error } = collectBatchParamData(opConfig);
  if (error) {
    showStatus(error, 'warning');
    return;
  }

  const inputField = getInputFileField(opConfig);
  const extensions = (inputField?.accept || '').split(',').filter(Boolean);
  if (extensions.length === 0) {
    showStatus('This operation does not support batch mode.', 'warning');
    return;
  }

  clearStatus();
  showProgress();
  els.progressText.textContent = 'Scanning folder...';

  ipcRenderer.send(kindConfig.batchChannel, {
    operation: opKey,
    inputFolder,
    outputFolder,
    includeSubfolders,
    extensions,
    data,
  });
}

async function handleProcess() {
  const kindConfig = MEDIA_KIND_CONFIG[currentKind];
  const opKey = els.operationSelect.value;
  const opConfig = kindConfig.operations[opKey];

  if (currentMode === 'batch' && isBatchable(opConfig)) {
    handleBatchProcess(kindConfig, opKey, opConfig);
  } else {
    await handleSingleProcess(kindConfig, opKey, opConfig);
  }
}

function hideDialog() {
  if (modalManager) modalManager.close();
  clearStatus();
  hideProgress();
}

function showMediaOperationsDialog(kind) {
  if (!MEDIA_KIND_CONFIG[kind]) {
    throw new Error(`Unknown media kind: ${kind}`);
  }

  ensureDialog();
  currentKind = kind;
  currentMode = 'single';

  const kindConfig = MEDIA_KIND_CONFIG[kind];
  els.title.textContent = kindConfig.title;

  els.operationSelect.innerHTML = '';
  Object.entries(kindConfig.operations).forEach(([key, op]) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = op.label;
    els.operationSelect.appendChild(option);
  });

  clearStatus();
  hideProgress();
  renderFields();
  modalManager.open();
}

module.exports = { showMediaOperationsDialog };
