/**
 * Tests for the export-preset persistence module (Task 21).
 * The module is pure list logic over the settings store's `exportPresets`
 * array; the store is injected, mirroring the SettingsStore test pattern.
 */

const ExportPresets = require('../../src/main/ExportPresets');

function createStore(initial = {}) {
  const data = { ...initial };
  return {
    get: (key, defaultValue) => (data[key] === undefined ? defaultValue : data[key]),
    set: (key, value) => {
      data[key] = value;
    },
    data,
  };
}

describe('ExportPresets', () => {
  describe('loadPresets', () => {
    test('returns an empty array when nothing is stored', () => {
      expect(ExportPresets.loadPresets(createStore())).toEqual([]);
    });

    test('returns the stored presets', () => {
      const store = createStore({
        exportPresets: [{ id: 'p1', name: 'Book PDF', format: 'pdf', options: { toc: true } }],
      });
      const presets = ExportPresets.loadPresets(store);
      expect(presets).toHaveLength(1);
      expect(presets[0].name).toBe('Book PDF');
    });

    test('returns an empty array when the stored value is corrupt (not an array)', () => {
      expect(ExportPresets.loadPresets(createStore({ exportPresets: 'garbage' }))).toEqual([]);
      expect(ExportPresets.loadPresets(createStore({ exportPresets: { p1: 1 } }))).toEqual([]);
    });

    test('drops malformed entries (missing id or name) from the stored array', () => {
      const store = createStore({
        exportPresets: [
          { id: 'p1', name: 'Good', format: 'pdf', options: {} },
          { name: 'No id', options: {} },
          { id: 'p3', options: {} },
          null,
        ],
      });
      const presets = ExportPresets.loadPresets(store);
      expect(presets).toHaveLength(1);
      expect(presets[0].id).toBe('p1');
    });
  });

  describe('savePreset', () => {
    test('adds a new preset with a generated id and persists it', () => {
      const store = createStore();
      const presets = ExportPresets.savePreset(store, {
        name: 'Book PDF',
        format: 'pdf',
        options: { toc: true, tocDepth: 3 },
      });

      expect(presets).toHaveLength(1);
      expect(presets[0].id).toMatch(/^preset-/);
      expect(presets[0].name).toBe('Book PDF');
      expect(presets[0].format).toBe('pdf');
      expect(presets[0].options).toEqual({ toc: true, tocDepth: 3 });
      expect(store.data.exportPresets).toEqual(presets);
    });

    test('upserts by id — saving with an existing id replaces the entry', () => {
      const store = createStore({
        exportPresets: [{ id: 'p1', name: 'Old name', format: 'pdf', options: { toc: false } }],
      });
      const presets = ExportPresets.savePreset(store, {
        id: 'p1',
        name: 'New name',
        format: 'docx',
        options: { toc: true },
      });

      expect(presets).toHaveLength(1);
      expect(presets[0]).toEqual({
        id: 'p1',
        name: 'New name',
        format: 'docx',
        options: { toc: true },
      });
      expect(store.data.exportPresets).toEqual(presets);
    });

    test('appends when the id is new, preserving existing presets', () => {
      const store = createStore({
        exportPresets: [{ id: 'p1', name: 'First', format: 'pdf', options: {} }],
      });
      const presets = ExportPresets.savePreset(store, {
        name: 'Second',
        format: 'html',
        options: {},
      });

      expect(presets).toHaveLength(2);
      expect(presets.map((p) => p.name)).toEqual(['First', 'Second']);
    });

    test('throws when the preset is not an object', () => {
      const store = createStore();
      expect(() => ExportPresets.savePreset(store, null)).toThrow('Preset must be an object');
      expect(() => ExportPresets.savePreset(store, 'nope')).toThrow('Preset must be an object');
    });

    test('throws when the name is missing or empty after trimming', () => {
      const store = createStore();
      expect(() => ExportPresets.savePreset(store, { name: '   ', options: {} })).toThrow(
        'Preset name is required'
      );
      expect(() => ExportPresets.savePreset(store, { options: {} })).toThrow(
        'Preset name is required'
      );
    });

    test('trims the name and caps it at 100 characters', () => {
      const store = createStore();
      const presets = ExportPresets.savePreset(store, { name: '  Spaced  ', options: {} });
      expect(presets[0].name).toBe('Spaced');

      const long = ExportPresets.savePreset(store, { name: 'x'.repeat(150), options: {} });
      expect(long[1].name).toHaveLength(100);
    });

    test('defaults a missing options object to {} and a missing format to null', () => {
      const store = createStore();
      const presets = ExportPresets.savePreset(store, { name: 'Bare' });
      expect(presets[0].options).toEqual({});
      expect(presets[0].format).toBeNull();
    });

    test('refuses to add beyond the preset cap', () => {
      const full = Array.from({ length: ExportPresets.MAX_PRESETS }, (_, i) => ({
        id: `p${i}`,
        name: `Preset ${i}`,
        format: 'pdf',
        options: {},
      }));
      const store = createStore({ exportPresets: full });
      expect(() => ExportPresets.savePreset(store, { name: 'One too many' })).toThrow(
        /more than \d+ export presets/
      );
    });

    test('still allows updating an existing preset when the list is full', () => {
      const full = Array.from({ length: ExportPresets.MAX_PRESETS }, (_, i) => ({
        id: `p${i}`,
        name: `Preset ${i}`,
        format: 'pdf',
        options: {},
      }));
      const store = createStore({ exportPresets: full });
      const presets = ExportPresets.savePreset(store, { id: 'p7', name: 'Updated' });
      expect(presets).toHaveLength(ExportPresets.MAX_PRESETS);
      expect(presets.find((p) => p.id === 'p7').name).toBe('Updated');
    });

    test('generates distinct ids for successive new presets', () => {
      const store = createStore();
      const a = ExportPresets.savePreset(store, { name: 'A' });
      const b = ExportPresets.savePreset(store, { name: 'B' });
      expect(a[0].id).not.toBe(b[1].id);
    });
  });

  describe('deletePreset', () => {
    test('removes the preset with the given id and returns the updated list', () => {
      const store = createStore({
        exportPresets: [
          { id: 'p1', name: 'Keep', format: 'pdf', options: {} },
          { id: 'p2', name: 'Drop', format: 'html', options: {} },
        ],
      });
      const presets = ExportPresets.deletePreset(store, 'p2');
      expect(presets).toHaveLength(1);
      expect(presets[0].id).toBe('p1');
      expect(store.data.exportPresets).toEqual(presets);
    });

    test('is idempotent when the id does not exist', () => {
      const store = createStore({
        exportPresets: [{ id: 'p1', name: 'Keep', format: 'pdf', options: {} }],
      });
      const presets = ExportPresets.deletePreset(store, 'missing');
      expect(presets).toHaveLength(1);
      expect(store.data.exportPresets).toHaveLength(1);
    });
  });
});
