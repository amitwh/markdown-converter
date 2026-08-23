'use strict';

/**
 * Export preset persistence (Task 21 — export presets/profiles).
 *
 * Pure list operations over the `exportPresets` array kept in the app's
 * settings.json store (the `store.get`/`store.set` helpers defined in
 * src/main.js — the same store that holds headerFooterSettings and
 * pageSettings). The store is injected so the logic is unit-testable with a
 * fake store (see tests/main/ExportPresets.test.js); src/main.js wires these
 * functions to the get-export-presets / save-export-preset /
 * delete-export-preset invoke channels.
 *
 * Preset shape: { id: string, name: string, format: string|null, options: object }
 * — `options` is the export-options snapshot captured from the renderer's
 * export dialog, so selecting a preset can pre-fill that dialog exactly.
 */

const PRESET_KEY = 'exportPresets';
const MAX_PRESETS = 50;
const MAX_NAME_LENGTH = 100;

/**
 * Read the stored presets, defensively skipping corrupt data.
 * @param {{get: Function, set: Function}} store settings store
 * @returns {Array<{id: string, name: string, format: string|null, options: Object}>}
 */
function loadPresets(store) {
  const stored = store.get(PRESET_KEY, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (preset) =>
      preset &&
      typeof preset === 'object' &&
      typeof preset.id === 'string' &&
      typeof preset.name === 'string'
  );
}

/**
 * Validate, normalize, and upsert a preset by id. A missing id gets a newly
 * generated one (insert); an id that already exists is replaced (update).
 * @param {{get: Function, set: Function}} store settings store
 * @param {{id?: string, name?: string, format?: string, options?: Object}} preset
 * @returns {Array} the updated preset list (also persisted)
 * @throws when the preset is not an object, the name is empty, or the cap is hit
 */
function savePreset(store, preset) {
  if (!preset || typeof preset !== 'object') {
    throw new Error('Preset must be an object');
  }
  const name = typeof preset.name === 'string' ? preset.name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!name) {
    throw new Error('Preset name is required');
  }
  const options = preset.options && typeof preset.options === 'object' ? preset.options : {};
  const format = typeof preset.format === 'string' ? preset.format : null;

  const presets = loadPresets(store);
  const id = typeof preset.id === 'string' && preset.id ? preset.id : createPresetId();
  const entry = { id, name, format, options };

  const index = presets.findIndex((existing) => existing.id === id);
  if (index >= 0) {
    presets[index] = entry;
  } else {
    if (presets.length >= MAX_PRESETS) {
      throw new Error(`Cannot store more than ${MAX_PRESETS} export presets`);
    }
    presets.push(entry);
  }
  store.set(PRESET_KEY, presets);
  return presets;
}

/**
 * Remove the preset with the given id (idempotent).
 * @param {{get: Function, set: Function}} store settings store
 * @param {string} presetId
 * @returns {Array} the updated preset list (also persisted)
 */
function deletePreset(store, presetId) {
  const presets = loadPresets(store).filter((preset) => preset.id !== presetId);
  store.set(PRESET_KEY, presets);
  return presets;
}

function createPresetId() {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { loadPresets, savePreset, deletePreset, PRESET_KEY, MAX_PRESETS };
