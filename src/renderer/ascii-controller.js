/**
 * ASCII Art Generator — renderer controller for the standalone window.
 *
 * Drives the DOM in src/ascii-generator.html. Fetches the font list from
 * the main process once on mount, renders previews on input, and exposes
 * Insert / Copy / Save actions. Last-used font is restored from
 * electron-store (via main) and saved on every change.
 *
 * Wires three mode tabs (Text Banner / Box-Frame / Templates) plus the
 * 18 template buttons and the Box form fields (#box-text, #box-style,
 * #box-padding). Templates route through `api.generate({ font: 'template:<id>' })`
 * so the orchestrator owns template content.
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
    modeTabs: document.querySelectorAll('.mode-tab[data-mode]'),
    modeSections: document.querySelectorAll('.mode-section'),
    templateButtons: document.querySelectorAll('.template-btn[data-template]'),
    boxText: document.getElementById('box-text'),
    boxStyle: document.getElementById('box-style'),
    boxPadding: document.getElementById('box-padding'),
  };

  // Section ID for each mode. Keep in sync with ascii-generator.html IDs.
  const MODE_SECTION_ID = {
    text: 'text-mode',
    box: 'box-mode',
    templates: 'templates-mode',
  };

  let _fonts = [];
  let _currentFont = 'standard';
  let _previewText = '';
  let _searchDebounce = null;
  let _currentMode = 'text';

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

  /**
   * Switch the active mode tab and the visible mode section.
   * Toggles the `.active` class on tabs and on the matching `.mode-section`.
   * @param {'text'|'box'|'templates'} mode
   */
  function setMode(mode) {
    if (!MODE_SECTION_ID[mode]) return;
    _currentMode = mode;

    // Toggle tab buttons.
    els.modeTabs.forEach((tab) => {
      if (tab.dataset.mode === mode) tab.classList.add('active');
      else tab.classList.remove('active');
    });

    // Toggle mode sections.
    els.modeSections.forEach((sec) => {
      if (sec.id === MODE_SECTION_ID[mode]) sec.classList.add('active');
      else sec.classList.remove('active');
    });

    // Each mode has its own preview pipeline; trigger a refresh.
    refreshPreview();
  }

  /**
   * Build a simple box border around the user's text using the chosen style.
   * Pure function — exported on window for tests via ASCIIBoxRenderer.
   * @param {string} text
   * @param {'single'|'double'|'rounded'|'bold'|'ascii'} style
   * @param {number} padding  0..10 spaces on each side
   * @returns {string}
   */
  function renderBox(text, style, padding) {
    const lines = String(text ?? '').split('\n');
    const pad = Math.max(0, Math.min(10, Number(padding) || 0));
    const padded = lines.map((l) => ' '.repeat(pad) + l + ' '.repeat(pad));
    const width = padded.reduce((w, l) => Math.max(w, visibleLength(l)), 0);

    let tl, tr, bl, br, h, v;
    switch (style) {
      case 'double':
        tl = '╔';
        tr = '╗';
        bl = '╚';
        br = '╝';
        h = '═';
        v = '║';
        break;
      case 'rounded':
        tl = '╭';
        tr = '╮';
        bl = '╰';
        br = '╯';
        h = '─';
        v = '│';
        break;
      case 'bold':
        tl = '┏';
        tr = '┓';
        bl = '┗';
        br = '┛';
        h = '━';
        v = '┃';
        break;
      case 'ascii':
        tl = '+';
        tr = '+';
        bl = '+';
        br = '+';
        h = '-';
        v = '|';
        break;
      case 'single':
      default:
        tl = '┌';
        tr = '┐';
        bl = '└';
        br = '┘';
        h = '─';
        v = '│';
        break;
    }

    const top = tl + h.repeat(width + 2) + tr;
    const bot = bl + h.repeat(width + 2) + br;
    const body = padded.map((l) => v + ' ' + l.padEnd(width, ' ') + ' ' + v).join('\n');
    return [top, body, bot].join('\n');
  }

  /**
   * Count printable character width, ignoring box-drawing characters and
   * spaces (which all occupy a single monospace column).
   */
  function visibleLength(s) {
    // Box-drawing chars and most printable ASCII occupy one column in our
    // monospace font. This is a deliberate simplification — emoji or wide
    // CJK would need a more sophisticated width table.
    return Array.from(s).length;
  }

  async function refreshPreview() {
    if (!api) return;
    if (_currentMode === 'templates') {
      // Template mode is button-driven; no live preview here.
      return;
    }
    if (_currentMode === 'box') {
      const text = els.boxText ? els.boxText.value : '';
      const style = els.boxStyle ? els.boxStyle.value : 'single';
      const padding = els.boxPadding ? els.boxPadding.value : 2;
      _previewText = text;
      const out = renderBox(text, style, padding);
      els.preview.textContent = out;
      showWarning('');
      return;
    }
    // text mode (default)
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

  /**
   * Render a template by id: fetch its content via the orchestrator's
   * template:<id> font namespace and update the preview.
   */
  async function renderTemplate(templateId) {
    if (!api) return;
    try {
      const out = await api.generate({ text: '', font: `template:${templateId}` });
      els.preview.textContent = out;
      showWarning('');
      // Mark the clicked button as active.
      els.templateButtons.forEach((btn) => {
        if (btn.dataset.template === templateId) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    } catch (err) {
      showWarning(`Template render failed: ${err.message || err}`);
    }
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

    // ---- mode-tab switching (Text Banner / Box-Frame / Templates) ----
    els.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        if (mode) setMode(mode);
      });
    });

    // ---- Box form: any change re-renders the box preview ----
    if (els.boxText) {
      els.boxText.addEventListener('input', () => {
        if (_currentMode === 'box') refreshPreview();
      });
    }
    if (els.boxStyle) {
      els.boxStyle.addEventListener('change', () => {
        if (_currentMode === 'box') refreshPreview();
      });
    }
    if (els.boxPadding) {
      els.boxPadding.addEventListener('input', () => {
        if (_currentMode === 'box') refreshPreview();
      });
    }

    // ---- Template buttons: render the chosen template into the preview ----
    els.templateButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.template;
        if (id) renderTemplate(id);
      });
    });
  }

  async function bootstrap() {
    wireEvents();
    await loadFonts();
    await refreshPreview();
  }

  // Expose pure helpers for tests; do not pollute window in production beyond
  // what the bootstrap entry-point needs.
  window.ASCIIController = { bootstrap };
  window.ASCIIBoxRenderer = { renderBox };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
