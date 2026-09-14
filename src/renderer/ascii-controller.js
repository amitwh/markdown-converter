/**
 * ASCII Art Generator — renderer controller for the standalone window.
 *
 * Drives the DOM in src/ascii-generator.html. Fetches the font list from
 * the main process once on mount, renders previews on input, and exposes
 * Insert / Copy / Save actions. Last-used font is restored from
 * electron-store (via main) and saved on every change.
 *
 * No bundler, no framework — pure DOM + window.electronAPI bridge.
 */
(function () {
  'use strict';

  const api =
    window.electronAPI && window.electronAPI.generators && window.electronAPI.generators.ascii;
  const els = {
    textInput: document.getElementById('text-input'),
    fontPicker: document.getElementById('font-picker'),
    fontSearch: document.getElementById('font-search'),
    preview: document.getElementById('preview'),
    btnInsert: document.getElementById('btn-insert'),
    btnCopy: document.getElementById('btn-copy'),
    btnSave: document.getElementById('btn-save'),
    btnGenerate: document.getElementById('btn-generate'),
    warning: document.getElementById('ascii-warning'),
  };

  let _fonts = [];
  let _currentFont = 'standard';
  let _previewText = '';
  let _searchDebounce = null;

  function showWarning(msg) {
    if (!els.warning) return;
    els.warning.textContent = msg || '';
    els.warning.style.display = msg ? 'block' : 'none';
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  async function refreshPreview() {
    if (!api) return;
    const text = els.textInput ? els.textInput.value : 'HELLO';
    _previewText = text;
    try {
      const out = await api.generate({ text, font: _currentFont });
      els.preview.textContent = out;
      showWarning('');
    } catch (err) {
      els.preview.textContent = '';
      showWarning(`Failed to render: ${err.message || err}`);
    }
  }

  function renderFontList(filter) {
    if (!els.fontPicker) return;
    const f = (filter || '').toLowerCase();
    const filtered = _fonts.filter((font) => {
      if (!f) return true;
      return font.label.toLowerCase().includes(f) || font.id.toLowerCase().includes(f);
    });
    els.fontPicker.innerHTML = '';
    for (const font of filtered.slice(0, 500)) {
      const opt = document.createElement('option');
      opt.value = font.id;
      opt.textContent = `${font.label} (${font.kind})`;
      if (font.id === _currentFont) opt.selected = true;
      els.fontPicker.appendChild(opt);
    }
  }

  async function loadFonts() {
    if (!api) return;
    try {
      _fonts = await api.listFonts();
    } catch {
      _fonts = [];
      showWarning('Could not load font list. Hand-coded fonts only.');
    }
    try {
      const last = await api.lastFont(null);
      if (last && _fonts.some((f) => f.id === last)) _currentFont = last;
    } catch {
      /* ignore */
    }
    renderFontList('');
  }

  function wireEvents() {
    if (els.textInput) {
      els.textInput.addEventListener('input', debounce(refreshPreview, 200));
    }
    if (els.fontPicker) {
      els.fontPicker.addEventListener('change', () => {
        _currentFont = els.fontPicker.value;
        if (api) api.lastFont(_currentFont).catch(() => {});
        refreshPreview();
      });
    }
    if (els.fontSearch) {
      els.fontSearch.addEventListener('input', () => {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => renderFontList(els.fontSearch.value), 100);
      });
    }
    if (els.btnGenerate) {
      els.btnGenerate.addEventListener('click', refreshPreview);
    }
    if (els.btnInsert) {
      els.btnInsert.addEventListener('click', () => {
        const wrapped =
          '```\n' + (_previewText ? document.getElementById('preview').textContent : '') + '\n```';
        if (window.electronAPI && window.electronAPI.send) {
          window.electronAPI.send('insert-generated-content', wrapped);
          window.close();
        }
      });
    }
    if (els.btnCopy) {
      els.btnCopy.addEventListener('click', async () => {
        const text = els.preview.textContent;
        if (!text) return;
        try {
          await api.copy(text);
          showWarning('Copied to clipboard.');
          setTimeout(() => showWarning(''), 1500);
        } catch (err) {
          showWarning('Copy failed: ' + (err.message || err));
        }
      });
    }
    if (els.btnSave) {
      els.btnSave.addEventListener('click', async () => {
        const text = els.preview.textContent;
        if (!text) return;
        try {
          const result = await api.save({ text, defaultName: 'ascii-art.txt' });
          if (!result.canceled) {
            showWarning(`Saved to ${result.path}`);
            setTimeout(() => showWarning(''), 2000);
          }
        } catch (err) {
          showWarning('Save failed: ' + (err.message || err));
        }
      });
    }
  }

  async function bootstrap() {
    wireEvents();
    await loadFonts();
    await refreshPreview();
  }

  window.ASCIIController = { bootstrap };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
