/**
 * Export Presets UI
 *
 * Preset dropdown + "Save as preset" for the export-options dialog
 * (#export-dialog in src/index.html). Replaces the earlier localStorage-only
 * "export profiles": presets are now owned by the main process and persisted
 * in settings.json (`exportPresets` key) through three invoke channels —
 * get-export-presets / save-export-preset / delete-export-preset — so they
 * behave like every other app setting instead of living and dying with the
 * renderer's localStorage.
 *
 * Construction mirrors src/renderer/document-compare-dialog.js: a dialog
 * module in src/renderer/ using the raw `ipcRenderer` invoke surface
 * (nodeIntegration is enabled for this renderer). DOM is hand-rolled — a
 * button + row list instead of a native <select> so each preset row can carry
 * its own delete icon.
 *
 * The dialog markup lives in src/index.html; renderer.js calls
 * initExportPresets() once at startup and refreshExportPresets() whenever the
 * export dialog opens.
 */

const { ipcRenderer } = require('electron');

// localStorage key of the pre-4.x renderer-only "export profiles" that the
// preset system replaced; consumed once by importLegacyProfiles().
const LEGACY_PROFILES_KEY = 'exportProfiles';

let currentPresets = [];
let selectedPresetId = null;
let notify = (message, type) => console.warn(`Export presets (${type}): ${message}`);

// ============================================
// DOM helpers (all element access is guarded —
// this module may outlive a dialog re-render)
// ============================================

function elementById(id) {
  return document.getElementById(id);
}

function valueOf(id) {
  const el = elementById(id);
  return el ? el.value : '';
}

function setValue(id, value) {
  const el = elementById(id);
  if (el) el.value = value;
}

function isChecked(id) {
  const el = elementById(id);
  return !!(el && el.checked);
}

function setChecked(id, checked) {
  const el = elementById(id);
  if (el) el.checked = checked;
}

function setVisible(id, visible) {
  const el = elementById(id);
  if (el) el.style.display = visible ? 'block' : 'none';
}

function getDialogFormat() {
  const dialogEl = elementById('export-dialog');
  return dialogEl ? dialogEl.getAttribute('data-format') : null;
}

// ============================================
// Capture / restore of the dialog's option values
// ============================================

/**
 * Snapshot every option field of the export dialog into a plain object.
 * Side-effect free (unlike collectExportOptions in renderer.js, which also
 * pushes page settings to the main process) — the snapshot is stored as the
 * preset's `options` and replayed by applyPresetToDialog().
 * @returns {Object} options snapshot
 */
function captureDialogOptions() {
  const format = getDialogFormat();
  const advancedMode = isChecked('advanced-export-toggle');
  const options = {
    advancedMode,
    pageSize: valueOf('page-size'),
    pageOrientation: valueOf('page-orientation'),
    customWidth: valueOf('custom-width').trim() || null,
    customHeight: valueOf('custom-height').trim() || null,
  };

  if (!advancedMode) {
    options.toc = isChecked('basic-toc');
    options.numberSections = isChecked('basic-number-sections');
    return options;
  }

  const template = valueOf('export-template');
  options.template = template === 'custom' ? valueOf('custom-template-path').trim() : template;

  options.metadata = {};
  document.querySelectorAll('.metadata-field').forEach((field) => {
    const key = field.querySelector('.metadata-key').value.trim();
    const value = field.querySelector('.metadata-value').value.trim();
    if (key && value) options.metadata[key] = value;
  });
  options.toc = isChecked('export-toc');
  options.tocDepth = valueOf('export-toc-depth') || '3';
  options.numberSections = isChecked('export-number-sections');
  options.citeproc = isChecked('export-citeproc');

  if (format === 'pdf') {
    options.pdfEngine = valueOf('pdf-engine');
    const geometrySelect = valueOf('pdf-geometry');
    options.geometry =
      geometrySelect === 'custom'
        ? valueOf('custom-geometry').trim() || 'margin=1in'
        : geometrySelect;
  }

  // Export theme (PDF + DOCX) — stored with presets like engine/geometry
  if (format === 'pdf' || format === 'docx') {
    const theme = valueOf('export-theme');
    if (theme) options.theme = theme;
  }

  if (format === 'revealjs') {
    options.revealTheme = valueOf('reveal-theme');
    options.revealTransition = valueOf('reveal-transition');
    options.revealTransitionSpeed = valueOf('reveal-speed');
    options.revealSlideNumber = isChecked('reveal-slide-number');
    options.revealControls = isChecked('reveal-controls');
    options.revealProgress = isChecked('reveal-progress');
    options.revealHistory = isChecked('reveal-history');
    options.revealCenter = isChecked('reveal-center');
  }

  const bibliography = valueOf('bibliography-file').trim();
  const csl = valueOf('csl-file').trim();
  if (bibliography) options.bibliography = bibliography;
  if (csl) options.csl = csl;
  return options;
}

/**
 * Restore a preset's option snapshot onto the dialog. Every field is written
 * explicitly (preset value or the dialog default), so switching from a rich
 * preset to a plain one clears whatever the rich one had set.
 * @param {{options?: Object}} preset preset to apply
 */
function applyPresetToDialog(preset) {
  const options = (preset && preset.options) || {};
  const advancedMode = options.advancedMode === true;

  setChecked('advanced-export-toggle', advancedMode);
  const advancedSection = elementById('advanced-export-options');
  if (advancedSection) advancedSection.classList.toggle('hidden', !advancedMode);

  // Page setup (applies to both modes)
  setValue('page-size', options.pageSize || 'a4');
  setValue('page-orientation', options.pageOrientation || 'portrait');
  setValue('custom-width', options.customWidth || '');
  setValue('custom-height', options.customHeight || '');
  setVisible('custom-page-size', valueOf('page-size') === 'custom');

  setChecked('basic-toc', !advancedMode && options.toc === true);
  setChecked('basic-number-sections', !advancedMode && options.numberSections === true);

  // In basic mode the advanced-only fields are reset to their defaults so no
  // stale values from a previously applied rich preset survive the switch.
  const advancedOptions = advancedMode ? options : {};

  // Template: anything other than the literal default is a custom path
  const template =
    advancedOptions.template && advancedOptions.template !== 'default'
      ? advancedOptions.template
      : null;
  if (template) {
    setValue('export-template', 'custom');
    setValue('custom-template-path', template);
    setVisible('custom-template-path', true);
    setVisible('template-file-input', true);
  } else {
    setValue('export-template', 'default');
    setValue('custom-template-path', '');
    setVisible('custom-template-path', false);
    setVisible('template-file-input', false);
  }

  rebuildMetadataRows(advancedOptions.metadata || {});

  setChecked('export-toc', advancedOptions.toc === true);
  setValue('export-toc-depth', advancedOptions.tocDepth || '3');
  setChecked('export-number-sections', advancedOptions.numberSections === true);
  setChecked('export-citeproc', advancedOptions.citeproc === true);

  // PDF options
  setValue('pdf-engine', advancedOptions.pdfEngine || 'xelatex');
  const geometry = advancedOptions.geometry || 'margin=1in';
  const geometrySelect = elementById('pdf-geometry');
  const hasGeometryOption =
    geometrySelect && Array.from(geometrySelect.options).some((opt) => opt.value === geometry);
  if (hasGeometryOption) {
    setValue('pdf-geometry', geometry);
    setValue('custom-geometry', '');
    setVisible('custom-geometry', false);
  } else {
    setValue('pdf-geometry', 'custom');
    setValue('custom-geometry', geometry);
    setVisible('custom-geometry', true);
  }

  // Export theme (guard: a preset saved with a newer/older theme list still
  // applies, falling back to default for unknown ids)
  const themeSelect = elementById('export-theme');
  if (themeSelect) {
    const theme = advancedOptions.theme || 'default';
    const hasTheme = Array.from(themeSelect.options).some((opt) => opt.value === theme);
    setValue('export-theme', hasTheme ? theme : 'default');
  }

  // Reveal.js options
  setValue('reveal-theme', advancedOptions.revealTheme || 'black');
  setValue('reveal-transition', advancedOptions.revealTransition || 'slide');
  setValue('reveal-speed', advancedOptions.revealTransitionSpeed || 'default');
  setChecked('reveal-slide-number', advancedOptions.revealSlideNumber === true);
  setChecked('reveal-controls', advancedOptions.revealControls !== false);
  setChecked('reveal-progress', advancedOptions.revealProgress !== false);
  setChecked('reveal-history', advancedOptions.revealHistory !== false);
  setChecked('reveal-center', advancedOptions.revealCenter !== false);

  setValue('bibliography-file', advancedOptions.bibliography || '');
  setValue('csl-file', advancedOptions.csl || '');
}

function rebuildMetadataRows(metadata) {
  const container = document.querySelector('.metadata-container');
  if (!container) return;
  const entries = Object.keys(metadata).map((key) => [key, metadata[key]]);
  if (entries.length === 0) {
    ['title', 'author', 'date', 'subject'].forEach((key) => entries.push([key, '']));
  }
  container.innerHTML = '';
  entries.forEach(([key, value]) => {
    const field = document.createElement('div');
    field.className = 'metadata-field';
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'metadata-key';
    keyInput.value = key;
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'metadata-value';
    valueInput.value = value;
    field.append(keyInput, valueInput);
    container.appendChild(field);
  });
}

// ============================================
// Preset dropdown rendering + interaction
// ============================================

function createPresetRow(preset) {
  const selected = preset.id === selectedPresetId;
  const row = document.createElement('div');
  row.className = selected ? 'preset-row selected' : 'preset-row';
  row.dataset.id = preset.id;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', selected ? 'true' : 'false');

  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'preset-row-select';
  selectButton.textContent = preset.name;
  row.appendChild(selectButton);

  if (preset.format) {
    const badge = document.createElement('span');
    badge.className = 'preset-format';
    badge.textContent = preset.format;
    row.appendChild(badge);
  }

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'preset-delete';
  deleteButton.textContent = '×';
  deleteButton.title = `Delete preset ${preset.name}`;
  deleteButton.setAttribute('aria-label', `Delete preset ${preset.name}`);
  row.appendChild(deleteButton);
  return row;
}

function renderPresets() {
  const list = elementById('preset-dropdown-list');
  const toggle = elementById('preset-dropdown-toggle');
  if (!list || !toggle) return;

  list.innerHTML = '';
  if (currentPresets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'preset-empty';
    empty.textContent = 'No saved presets';
    list.appendChild(empty);
  } else {
    currentPresets.forEach((preset) => list.appendChild(createPresetRow(preset)));
  }

  const selected = currentPresets.find((preset) => preset.id === selectedPresetId);
  toggle.textContent = selected ? selected.name : 'Custom Settings';
  closeDropdown();
}

function toggleDropdown() {
  const list = elementById('preset-dropdown-list');
  if (!list) return;
  const opened = !list.classList.contains('hidden');
  list.classList.toggle('hidden');
  const toggle = elementById('preset-dropdown-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(!opened));
}

function closeDropdown() {
  const list = elementById('preset-dropdown-list');
  if (list) list.classList.add('hidden');
  const toggle = elementById('preset-dropdown-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function handleListClick(event) {
  const deleteButton = event.target.closest('.preset-delete');
  const row = event.target.closest('.preset-row');
  if (deleteButton && row) {
    deleteExportPreset(row.dataset.id);
    return;
  }
  if (row) selectPreset(row.dataset.id);
}

function selectPreset(presetId) {
  const preset = currentPresets.find((candidate) => candidate.id === presetId);
  if (!preset) return;
  selectedPresetId = presetId;
  applyPresetToDialog(preset);
  renderPresets();
}

// ============================================
// IPC-backed preset operations
// ============================================

/**
 * Fetch presets from the main process and re-render the dropdown.
 * Called whenever the export dialog opens.
 */
async function refreshExportPresets() {
  try {
    const presets = await ipcRenderer.invoke('get-export-presets');
    currentPresets = Array.isArray(presets) ? presets : [];
  } catch (error) {
    console.error('Failed to load export presets:', error);
    currentPresets = [];
  }
  if (!currentPresets.some((preset) => preset.id === selectedPresetId)) {
    selectedPresetId = null;
  }
  renderPresets();
}

async function saveCurrentAsPreset() {
  const selected = currentPresets.find((preset) => preset.id === selectedPresetId);
  const defaultName = selected ? selected.name : 'My Preset';
  const answer = window.prompt('Enter a name for this export preset:', defaultName);
  if (answer === null) return; // user cancelled the prompt
  const name = answer.trim();
  if (!name) {
    notify('Preset name cannot be empty.', 'warning');
    return;
  }
  // A selected preset is overwritten (same id); otherwise a new id is minted.
  // The main process re-validates and remains the source of truth.
  const preset = {
    id: selected ? selected.id : createPresetId(),
    name,
    format: getDialogFormat(),
    options: captureDialogOptions(),
  };
  try {
    const presets = await ipcRenderer.invoke('save-export-preset', preset);
    currentPresets = Array.isArray(presets) ? presets : currentPresets;
    // Normally the saved preset keeps the id we sent; fall back to the last
    // entry with the same name should the main process have normalized it.
    selectedPresetId = preset.id;
    if (!currentPresets.some((candidate) => candidate.id === selectedPresetId)) {
      const byName = currentPresets.filter((candidate) => candidate.name === name).pop();
      selectedPresetId = byName ? byName.id : null;
    }
    renderPresets();
    notify(`Preset "${name}" saved.`, 'success');
  } catch (error) {
    console.error('Failed to save export preset:', error);
    notify('Failed to save preset. Please try again.', 'warning');
  }
}

async function deleteExportPreset(presetId) {
  const preset = currentPresets.find((candidate) => candidate.id === presetId);
  const label = preset ? preset.name : 'this preset';
  if (!window.confirm(`Are you sure you want to delete the preset "${label}"?`)) return;
  try {
    const presets = await ipcRenderer.invoke('delete-export-preset', presetId);
    currentPresets = Array.isArray(presets) ? presets : currentPresets;
    if (selectedPresetId === presetId) selectedPresetId = null;
    renderPresets();
    notify(`Preset "${label}" deleted.`, 'success');
  } catch (error) {
    console.error('Failed to delete export preset:', error);
    notify('Failed to delete preset. Please try again.', 'warning');
  }
}

function createPresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================
// One-time import of legacy localStorage profiles
// ============================================

/**
 * Map one legacy export profile onto the preset options shape captured by
 * captureDialogOptions(). Legacy shape (saveCurrentProfile at git 52ef5b4):
 * { format, advancedMode, pageSize, pageOrientation, basicToc,
 * basicNumberSections } plus, in advanced mode, { template, toc, tocDepth,
 * numberSections, citeproc, pdfEngine, pdfGeometry } — all raw select/input
 * values. Two fidelity limits of the legacy format itself: the custom
 * template PATH and the custom geometry TEXT were never persisted (only the
 * literal select value 'custom'), so those map back to the dialog defaults.
 * @param {Object} profile legacy profile value
 * @returns {Object} preset options snapshot
 */
function mapLegacyProfileOptions(profile) {
  const advancedMode = profile.advancedMode === true;
  const options = {
    advancedMode,
    pageSize: typeof profile.pageSize === 'string' ? profile.pageSize : 'a4',
    pageOrientation:
      typeof profile.pageOrientation === 'string' ? profile.pageOrientation : 'portrait',
  };

  if (!advancedMode) {
    // Basic mode maps like collectExportOptions: basicToc -> toc,
    // basicNumberSections -> numberSections.
    options.toc = profile.basicToc === true;
    options.numberSections = profile.basicNumberSections === true;
    return options;
  }

  options.template = 'default';
  options.metadata = {};
  options.toc = profile.toc === true;
  options.tocDepth =
    typeof profile.tocDepth === 'string' && profile.tocDepth ? profile.tocDepth : '3';
  options.numberSections = profile.numberSections === true;
  options.citeproc = profile.citeproc === true;
  options.pdfEngine = typeof profile.pdfEngine === 'string' ? profile.pdfEngine : 'xelatex';
  options.geometry =
    typeof profile.pdfGeometry === 'string' && profile.pdfGeometry !== 'custom'
      ? profile.pdfGeometry
      : 'margin=1in';
  return options;
}

/**
 * Import the legacy localStorage export profiles into the main-process preset
 * store via save-export-preset, then remove the legacy key so the import runs
 * only once. Ids are deterministic (`preset-legacy-<name>`), so an import
 * interrupted midway retries as an upsert on the next launch instead of
 * duplicating presets. Malformed or unexpected data degrades to "skip import"
 * — it must never break dialog init.
 * @returns {Promise<boolean>} true when at least one preset was imported
 */
async function importLegacyProfiles() {
  try {
    const raw = localStorage.getItem(LEGACY_PROFILES_KEY);
    if (!raw) return false;
    const legacy = JSON.parse(raw);
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return false;

    let imported = false;
    for (const name of Object.keys(legacy)) {
      const profile = legacy[name];
      if (!name.trim() || !profile || typeof profile !== 'object') continue;
      await ipcRenderer.invoke('save-export-preset', {
        id: `preset-legacy-${name}`,
        name,
        format: typeof profile.format === 'string' ? profile.format : null,
        options: mapLegacyProfileOptions(profile),
      });
      imported = true;
    }
    localStorage.removeItem(LEGACY_PROFILES_KEY);
    return imported;
  } catch (error) {
    console.error('Skipping legacy export profile import:', error);
    return false;
  }
}

/**
 * Wire the preset section of the export dialog. Call once after DOM ready.
 * @param {{notify?: Function}} options hooks from renderer.js
 */
function initExportPresets(options = {}) {
  if (typeof options.notify === 'function') notify = options.notify;
  selectedPresetId = null;
  const saveButton = elementById('save-preset-btn');
  if (saveButton) saveButton.addEventListener('click', saveCurrentAsPreset);
  const toggle = elementById('preset-dropdown-toggle');
  if (toggle) toggle.addEventListener('click', toggleDropdown);
  const list = elementById('preset-dropdown-list');
  if (list) list.addEventListener('click', handleListClick);

  // One-time legacy import; refresh afterwards so imported presets are
  // visible even if the dialog is already open.
  importLegacyProfiles().then((imported) => {
    if (imported) refreshExportPresets();
  });
}

module.exports = {
  initExportPresets,
  refreshExportPresets,
  captureDialogOptions,
  applyPresetToDialog,
};
