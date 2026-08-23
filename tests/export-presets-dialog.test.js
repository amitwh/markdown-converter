/**
 * Tests for the Export Presets dialog UI (Task 21).
 * Exercises the preset dropdown / save / delete flows of the export-options
 * dialog against a jsdom replica of the dialog's markup, with the electron
 * IPC surface mocked — following the jest.mock('electron') pattern in
 * document-compare-dialog.test.js.
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

const { ipcRenderer } = require('electron');
const {
  initExportPresets,
  refreshExportPresets,
  captureDialogOptions,
  applyPresetToDialog,
} = require('../src/renderer/export-presets');

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

function metadataRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'metadata-field';
  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'metadata-key';
  keyInput.value = key;
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'metadata-value';
  valueInput.value = value;
  row.append(keyInput, valueInput);
  return row;
}

/**
 * Minimal replica of the #export-dialog markup in src/index.html — only the
 * elements the presets module reads or writes.
 */
function buildDialogFixture(format = 'pdf') {
  document.body.innerHTML = `
    <div id="export-dialog" data-format="${format}">
      <div class="export-section export-presets">
        <div class="preset-controls">
          <div class="preset-dropdown">
            <button type="button" id="preset-dropdown-toggle">Custom Settings</button>
            <div id="preset-dropdown-list" class="preset-dropdown-list hidden"></div>
          </div>
          <button id="save-preset-btn" type="button">Save as preset</button>
        </div>
      </div>
      <input type="checkbox" id="advanced-export-toggle" />
      <div id="advanced-export-options" class="advanced-options hidden"></div>
      <div class="export-section pdf-only">
        <select id="pdf-engine">
          <option value="xelatex">XeLaTeX</option>
          <option value="pdflatex">PDFLaTeX</option>
          <option value="lualatex">LuaLaTeX</option>
        </select>
        <select id="pdf-geometry">
          <option value="margin=1in">1in</option>
          <option value="margin=2in">2in</option>
          <option value="custom">Custom</option>
        </select>
        <input type="text" id="custom-geometry" style="display: none" />
      </div>
      <div class="export-section revealjs-only">
        <select id="reveal-theme"><option value="black">black</option><option value="white">white</option></select>
        <select id="reveal-transition"><option value="slide">slide</option><option value="fade">fade</option></select>
        <select id="reveal-speed"><option value="default">default</option><option value="fast">fast</option></select>
        <input type="checkbox" id="reveal-slide-number" />
        <input type="checkbox" id="reveal-controls" />
        <input type="checkbox" id="reveal-progress" />
        <input type="checkbox" id="reveal-history" />
        <input type="checkbox" id="reveal-center" />
      </div>
      <div class="export-section">
        <select id="export-template">
          <option value="default">Default</option>
          <option value="custom">Custom</option>
        </select>
        <input type="file" id="template-file-input" style="display: none" />
        <input type="text" id="custom-template-path" style="display: none" />
        <div class="metadata-container"></div>
        <input type="checkbox" id="export-toc" />
        <input type="number" id="export-toc-depth" value="3" min="1" max="6" />
        <input type="checkbox" id="export-number-sections" />
        <input type="checkbox" id="export-citeproc" />
        <input type="text" id="bibliography-file" />
        <input type="text" id="csl-file" />
      </div>
      <div class="export-section">
        <input type="checkbox" id="basic-toc" />
        <input type="checkbox" id="basic-number-sections" />
        <select id="page-size">
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
          <option value="custom">Custom</option>
        </select>
        <select id="page-orientation">
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
        <div id="custom-page-size" style="display: none">
          <input type="text" id="custom-width" />
          <input type="text" id="custom-height" />
        </div>
      </div>
    </div>`;
  // Seed the four default metadata rows the dialog ships with.
  const container = document.querySelector('.metadata-container');
  ['title', 'author', 'date', 'subject'].forEach((key) => {
    container.appendChild(metadataRow(key, ''));
  });
}

const advancedPdfPreset = {
  id: 'preset-pdf1',
  name: 'Book PDF',
  format: 'pdf',
  options: {
    advancedMode: true,
    template: '/home/user/templates/book.tex',
    metadata: { title: 'My Book', author: 'Jane' },
    toc: true,
    tocDepth: 4,
    numberSections: true,
    citeproc: false,
    pdfEngine: 'lualatex',
    geometry: 'margin=2.5cm',
    bibliography: '/refs.bib',
    pageSize: 'custom',
    pageOrientation: 'landscape',
    customWidth: '210mm',
    customHeight: '297mm',
  },
};

const basicPreset = {
  id: 'preset-basic1',
  name: 'Quick HTML',
  format: 'html',
  options: {
    advancedMode: false,
    toc: true,
    numberSections: false,
    pageSize: 'letter',
    pageOrientation: 'portrait',
  },
};

function mockInvoke(presets) {
  ipcRenderer.invoke.mockImplementation((channel) => {
    if (channel === 'get-export-presets') return Promise.resolve(presets);
    return Promise.resolve(presets);
  });
}

function rows() {
  return Array.from(document.querySelectorAll('#preset-dropdown-list .preset-row'));
}

describe('Export presets dialog', () => {
  let notify;

  beforeEach(() => {
    buildDialogFixture('pdf');
    ipcRenderer.invoke.mockReset();
    notify = jest.fn();
    initExportPresets({ notify });
  });

  describe('refreshExportPresets', () => {
    it('loads presets via get-export-presets and renders one row per preset with a delete icon', async () => {
      mockInvoke([advancedPdfPreset, basicPreset]);
      await refreshExportPresets();
      await flush();

      expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-export-presets');
      expect(rows()).toHaveLength(2);
      expect(rows()[0].textContent).toContain('Book PDF');
      expect(rows()[0].querySelector('.preset-delete')).not.toBeNull();
      expect(rows()[1].textContent).toContain('Quick HTML');
    });

    it('shows the format badge next to each preset name', async () => {
      mockInvoke([advancedPdfPreset]);
      await refreshExportPresets();
      await flush();

      expect(rows()[0].querySelector('.preset-format').textContent).toBe('pdf');
    });

    it('renders an empty notice when there are no presets', async () => {
      mockInvoke([]);
      await refreshExportPresets();
      await flush();

      expect(rows()).toHaveLength(0);
      expect(document.getElementById('preset-dropdown-list').textContent).toContain(
        'No saved presets'
      );
    });

    it('survives a rejected get-export-presets call without crashing', async () => {
      ipcRenderer.invoke.mockRejectedValue(new Error('boom'));
      await refreshExportPresets();
      await flush();

      expect(rows()).toHaveLength(0);
    });
  });

  describe('selecting a preset', () => {
    it('pre-fills every dialog field from an advanced PDF preset', async () => {
      mockInvoke([advancedPdfPreset]);
      await refreshExportPresets();
      await flush();

      rows()[0].querySelector('.preset-row-select').click();

      // Advanced mode
      expect(document.getElementById('advanced-export-toggle').checked).toBe(true);
      expect(document.getElementById('advanced-export-options').classList.contains('hidden')).toBe(
        false
      );
      // Template: custom path
      expect(document.getElementById('export-template').value).toBe('custom');
      expect(document.getElementById('custom-template-path').value).toBe(
        '/home/user/templates/book.tex'
      );
      expect(document.getElementById('custom-template-path').style.display).toBe('block');
      // Metadata rows rebuilt from the preset
      const keys = Array.from(document.querySelectorAll('.metadata-key')).map((i) => i.value);
      const values = Array.from(document.querySelectorAll('.metadata-value')).map((i) => i.value);
      expect(keys).toEqual(['title', 'author']);
      expect(values).toEqual(['My Book', 'Jane']);
      // Document options
      expect(document.getElementById('export-toc').checked).toBe(true);
      expect(document.getElementById('export-toc-depth').value).toBe('4');
      expect(document.getElementById('export-number-sections').checked).toBe(true);
      expect(document.getElementById('export-citeproc').checked).toBe(false);
      // PDF options with a non-preset geometry -> custom
      expect(document.getElementById('pdf-engine').value).toBe('lualatex');
      expect(document.getElementById('pdf-geometry').value).toBe('custom');
      expect(document.getElementById('custom-geometry').value).toBe('margin=2.5cm');
      expect(document.getElementById('custom-geometry').style.display).toBe('block');
      // Bibliography
      expect(document.getElementById('bibliography-file').value).toBe('/refs.bib');
      // Page setup
      expect(document.getElementById('page-size').value).toBe('custom');
      expect(document.getElementById('custom-page-size').style.display).toBe('block');
      expect(document.getElementById('custom-width').value).toBe('210mm');
      expect(document.getElementById('custom-height').value).toBe('297mm');
      expect(document.getElementById('page-orientation').value).toBe('landscape');
    });

    it('pre-fills basic-mode checkboxes and leaves advanced options hidden', async () => {
      mockInvoke([basicPreset]);
      await refreshExportPresets();
      await flush();

      rows()[0].querySelector('.preset-row-select').click();

      expect(document.getElementById('advanced-export-toggle').checked).toBe(false);
      expect(document.getElementById('advanced-export-options').classList.contains('hidden')).toBe(
        true
      );
      expect(document.getElementById('basic-toc').checked).toBe(true);
      expect(document.getElementById('basic-number-sections').checked).toBe(false);
      expect(document.getElementById('page-size').value).toBe('letter');
    });

    it('marks the selected row, updates the toggle label and closes the dropdown', async () => {
      mockInvoke([advancedPdfPreset, basicPreset]);
      await refreshExportPresets();
      await flush();

      document.getElementById('preset-dropdown-toggle').click();
      expect(document.getElementById('preset-dropdown-list').classList.contains('hidden')).toBe(
        false
      );

      rows()[1].querySelector('.preset-row-select').click();

      expect(rows()[1].classList.contains('selected')).toBe(true);
      expect(rows()[0].classList.contains('selected')).toBe(false);
      expect(document.getElementById('preset-dropdown-toggle').textContent).toBe('Quick HTML');
      expect(document.getElementById('preset-dropdown-list').classList.contains('hidden')).toBe(
        true
      );
    });

    it('resets stale field values when switching from a rich preset to a plain one', async () => {
      mockInvoke([advancedPdfPreset, basicPreset]);
      await refreshExportPresets();
      await flush();

      rows()[0].querySelector('.preset-row-select').click();
      rows()[1].querySelector('.preset-row-select').click();

      // The basic preset has no bibliography — the field must be cleared, not left over.
      expect(document.getElementById('bibliography-file').value).toBe('');
      expect(document.getElementById('advanced-export-toggle').checked).toBe(false);
    });
  });

  describe('saving the current dialog state as a preset', () => {
    it('prompts for a name and invokes save-export-preset with the captured options', async () => {
      mockInvoke([]);
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'prompt').mockReturnValue('My Preset');

      // Configure the dialog the way a user would before saving.
      document.getElementById('advanced-export-toggle').checked = true;
      document.getElementById('export-toc').checked = true;
      document.getElementById('pdf-engine').value = 'pdflatex';
      document.getElementById('page-size').value = 'letter';

      document.getElementById('save-preset-btn').click();
      await flush();

      expect(ipcRenderer.invoke).toHaveBeenCalledWith(
        'save-export-preset',
        expect.objectContaining({
          name: 'My Preset',
          format: 'pdf',
        })
      );
      const saved = ipcRenderer.invoke.mock.calls.find((c) => c[0] === 'save-export-preset')[1];
      expect(saved.id).toMatch(/^preset-/);
      expect(saved.options.advancedMode).toBe(true);
      expect(saved.options.toc).toBe(true);
      expect(saved.options.pdfEngine).toBe('pdflatex');
      expect(saved.options.pageSize).toBe('letter');
      expect(notify).toHaveBeenCalledWith('Preset "My Preset" saved.', 'success');
    });

    it('re-renders the dropdown from the list returned by save-export-preset', async () => {
      // Mirror the main process: the saved preset echoes back with the id that was sent.
      ipcRenderer.invoke.mockImplementation((channel, payload) => {
        if (channel === 'get-export-presets') return Promise.resolve([]);
        return Promise.resolve([
          { id: payload.id, name: payload.name, format: payload.format, options: payload.options },
        ]);
      });
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'prompt').mockReturnValue('My Preset');

      document.getElementById('save-preset-btn').click();
      await flush();

      expect(rows()).toHaveLength(1);
      expect(document.getElementById('preset-dropdown-toggle').textContent).toBe('My Preset');
    });

    it('reuses the selected preset id so saving overwrites instead of duplicating', async () => {
      mockInvoke([advancedPdfPreset]);
      await refreshExportPresets();
      await flush();
      rows()[0].querySelector('.preset-row-select').click();
      jest.spyOn(window, 'prompt').mockReturnValue('Book PDF v2');

      document.getElementById('save-preset-btn').click();
      await flush();

      const saved = ipcRenderer.invoke.mock.calls.find((c) => c[0] === 'save-export-preset')[1];
      expect(saved.id).toBe('preset-pdf1');
      expect(saved.name).toBe('Book PDF v2');
    });

    it('does nothing when the user cancels the name prompt', async () => {
      mockInvoke([]);
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'prompt').mockReturnValue(null);

      document.getElementById('save-preset-btn').click();
      await flush();

      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1); // only the initial get
      expect(notify).not.toHaveBeenCalled();
    });

    it('warns and skips the save when the name is empty', async () => {
      mockInvoke([]);
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'prompt').mockReturnValue('   ');

      document.getElementById('save-preset-btn').click();
      await flush();

      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith('Preset name cannot be empty.', 'warning');
    });

    it('warns without throwing when the save IPC call rejects', async () => {
      ipcRenderer.invoke.mockImplementation((channel) =>
        channel === 'get-export-presets' ? Promise.resolve([]) : Promise.reject(new Error('disk'))
      );
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'prompt').mockReturnValue('My Preset');

      document.getElementById('save-preset-btn').click();
      await flush();

      expect(notify).toHaveBeenCalledWith('Failed to save preset. Please try again.', 'warning');
    });
  });

  describe('deleting a preset', () => {
    it('asks for confirmation and invokes delete-export-preset with the row id', async () => {
      mockInvoke([advancedPdfPreset, basicPreset]);
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      ipcRenderer.invoke.mockImplementation((channel) =>
        channel === 'delete-export-preset'
          ? Promise.resolve([basicPreset])
          : Promise.resolve([advancedPdfPreset, basicPreset])
      );

      rows()[0].querySelector('.preset-delete').click();
      await flush();

      expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-export-preset', 'preset-pdf1');
      expect(rows()).toHaveLength(1);
      expect(rows()[0].textContent).toContain('Quick HTML');
    });

    it('clears the selection when the deleted preset was selected', async () => {
      mockInvoke([advancedPdfPreset]);
      await refreshExportPresets();
      await flush();
      rows()[0].querySelector('.preset-row-select').click();
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      ipcRenderer.invoke.mockImplementation((channel) =>
        channel === 'delete-export-preset'
          ? Promise.resolve([])
          : Promise.resolve([advancedPdfPreset])
      );

      rows()[0].querySelector('.preset-delete').click();
      await flush();

      expect(document.getElementById('preset-dropdown-toggle').textContent).toBe('Custom Settings');
    });

    it('does not invoke delete when the user cancels the confirmation', async () => {
      mockInvoke([advancedPdfPreset]);
      await refreshExportPresets();
      await flush();
      jest.spyOn(window, 'confirm').mockReturnValue(false);

      rows()[0].querySelector('.preset-delete').click();
      await flush();

      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1); // only the initial get
      expect(rows()).toHaveLength(1);
    });
  });

  describe('captureDialogOptions / applyPresetToDialog round-trip', () => {
    it('restores exactly what was captured, including reveal.js fields', () => {
      buildDialogFixture('revealjs');
      initExportPresets({ notify });

      document.getElementById('advanced-export-toggle').checked = true;
      document.getElementById('reveal-theme').value = 'white';
      document.getElementById('reveal-transition').value = 'fade';
      document.getElementById('reveal-speed').value = 'fast';
      document.getElementById('reveal-slide-number').checked = true;
      document.getElementById('reveal-controls').checked = false;
      document.getElementById('reveal-progress').checked = false;
      document.getElementById('reveal-history').checked = false;
      document.getElementById('reveal-center').checked = false;
      document.getElementById('csl-file').value = '/styles.csl';

      const captured = captureDialogOptions();

      buildDialogFixture('revealjs');
      initExportPresets({ notify });
      applyPresetToDialog({ options: captured });

      expect(document.getElementById('reveal-theme').value).toBe('white');
      expect(document.getElementById('reveal-transition').value).toBe('fade');
      expect(document.getElementById('reveal-speed').value).toBe('fast');
      expect(document.getElementById('reveal-slide-number').checked).toBe(true);
      expect(document.getElementById('reveal-controls').checked).toBe(false);
      expect(document.getElementById('reveal-progress').checked).toBe(false);
      expect(document.getElementById('reveal-history').checked).toBe(false);
      expect(document.getElementById('reveal-center').checked).toBe(false);
      expect(document.getElementById('csl-file').value).toBe('/styles.csl');
    });

    it('captures a preset geometry as-is and restores it back onto the select', () => {
      document.getElementById('advanced-export-toggle').checked = true;
      document.getElementById('pdf-geometry').value = 'margin=2in';

      const captured = captureDialogOptions();
      expect(captured.geometry).toBe('margin=2in');

      buildDialogFixture('pdf');
      initExportPresets({ notify });
      applyPresetToDialog({ options: captured });
      expect(document.getElementById('pdf-geometry').value).toBe('margin=2in');
      expect(document.getElementById('custom-geometry').style.display).toBe('none');
    });

    it('captures basic mode without any advanced keys leaking in', () => {
      const captured = captureDialogOptions();
      expect(captured.advancedMode).toBe(false);
      expect(captured.toc).toBe(false);
      expect(captured.template).toBeUndefined();
      expect(captured.pdfEngine).toBeUndefined();
    });
  });
});
