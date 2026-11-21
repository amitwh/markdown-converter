/**
 * ASCII Art Studio — renderer controller for the standalone window.
 *
 * Drives the DOM in src/ascii-generator.html:
 *   - Text mode: live FIGlet / built-in font rendering with wrap width,
 *     letter spacing, alignment and smushing controls, plus a clickable
 *     font gallery that previews the current text in every font.
 *   - Box mode: bordered blocks with alignment and minimum width.
 *   - Templates mode: 18 ready-made diagram fragments, previewed in place.
 *
 * The controller is pure DOM + the `window.electronAPI.generators.ascii`
 * bridge. Every optional bridge call (options persistence, font metadata)
 * is guarded so the window still works when a bridge method is missing.
 *
 * No bundler, no framework.
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
    previewTitle: document.getElementById('preview-title'),
    previewMeta: document.getElementById('preview-meta'),
    previewSize: document.getElementById('preview-size'),
    btnInsert: document.getElementById('btn-insert'),
    btnCopy: document.getElementById('btn-copy'),
    btnSave: document.getElementById('btn-save'),
    btnGenerate: document.getElementById('btn-generate'),
    btnTheme: document.getElementById('btn-theme'),
    btnMoreFonts: document.getElementById('btn-more-fonts'),
    warning: document.getElementById('ascii-warning'),
    status: document.getElementById('footer-status'),
    modeTabs: document.querySelectorAll('.mode-tab[data-mode]'),
    modeSections: document.querySelectorAll('.mode-section'),
    templateButtons: document.querySelectorAll('.template-btn[data-template]'),
    boxText: document.getElementById('box-text'),
    boxStyle: document.getElementById('box-style'),
    boxPadding: document.getElementById('box-padding'),
    boxAlign: document.getElementById('box-align'),
    boxWidth: document.getElementById('box-width'),
    optWidth: document.getElementById('opt-width'),
    optSpacing: document.getElementById('opt-spacing'),
    optJustify: document.getElementById('opt-justify'),
    optLayout: document.getElementById('opt-layout'),
    optCodeblock: document.getElementById('opt-codeblock'),
    galleryBlock: document.getElementById('gallery-block'),
    gallery: document.getElementById('font-gallery'),
    galleryCount: document.getElementById('gallery-count'),
  };

  const MODE_SECTION_ID = {
    text: 'text-mode',
    box: 'box-mode',
    templates: 'templates-mode',
  };

  const DEFAULT_STATUS = els.status ? els.status.innerHTML : '';
  const GALLERY_PAGE = 24;

  const state = {
    fonts: [],
    font: 'standard',
    mode: 'text',
    previewText: '',
    previewLabel: 'Preview',
    galleryLimit: GALLERY_PAGE,
    galleryToken: 0,
    booted: false,
    prefs: {
      width: 0,
      spacing: 0,
      justify: 'left',
      layout: '',
      codeblock: true,
      size: 12,
      theme: 'dark',
      mode: 'text',
    },
  };

  // ---------------------------------------------------------------- utils

  function showWarning(msg) {
    if (!els.warning) return;
    els.warning.textContent = msg || '';
    els.warning.classList.toggle('visible', !!msg);
  }

  function setStatus(msg) {
    if (!els.status) return;
    if (!msg) {
      els.status.innerHTML = DEFAULT_STATUS;
      return;
    }
    els.status.textContent = msg;
  }

  function flashStatus(msg) {
    setStatus(msg);
    setTimeout(() => setStatus(''), 1800);
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function currentText() {
    if (state.mode === 'box') return els.boxText ? els.boxText.value : '';
    return els.textInput ? els.textInput.value : '';
  }

  function fontLabel(id) {
    const f = state.fonts.find((x) => x.id === id);
    return f ? f.label : id;
  }

  function numberValue(el, fallback) {
    if (!el) return fallback;
    const n = Number(el.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function textValue(el, fallback) {
    return el && typeof el.value === 'string' ? el.value : fallback;
  }

  // ------------------------------------------------------------- box mode

  /**
   * Build a bordered box around the user's text.
   * @param {string} text
   * @param {'single'|'double'|'rounded'|'bold'|'heavy'|'ascii'|'shadow'} style
   * @param {number} padding 0..10 spaces on each side
   * @param {'left'|'center'|'right'} [align]
   * @param {number} [minWidth] minimum inner width (0 = fit content)
   * @returns {string}
   */
  function renderBox(text, style, padding, align = 'left', minWidth = 0) {
    const lines = String(text ?? '').split('\n');
    const pad = Math.max(0, Math.min(10, Number(padding) || 0));
    const padded = lines.map((l) => ' '.repeat(pad) + l + ' '.repeat(pad));
    const contentWidth = padded.reduce((w, l) => Math.max(w, visibleLength(l)), 0);
    const forced = Math.max(0, Number(minWidth) || 0);
    const width = Math.max(contentWidth, forced);

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
      case 'heavy':
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
      case 'shadow':
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

    const shadow = style === 'shadow';
    const top = tl + h.repeat(width + 2) + tr + (shadow ? '░' : '');
    const bot = bl + h.repeat(width + 2) + br + (shadow ? '░' : '');
    const body = padded
      .map((l) => {
        const slack = width - visibleLength(l);
        let left = 0;
        if (align === 'right') left = slack;
        else if (align === 'center') left = Math.floor(slack / 2);
        const line = ' '.repeat(left) + l + ' '.repeat(slack - left);
        return v + ' ' + line + ' ' + v + (shadow ? '░' : '');
      })
      .join('\n');
    const base = [top, body, bot].join('\n');
    return shadow ? base + '\n ' + '░'.repeat(width + 4) : base;
  }

  /**
   * Count printable character width. Box-drawing characters and spaces all
   * occupy one monospace column; wide CJK/emoji would need a width table.
   */
  function visibleLength(s) {
    return Array.from(s).length;
  }

  // -------------------------------------------------------------- preview

  function figletOptions() {
    const opts = {};
    if (state.prefs.width > 0) opts.width = state.prefs.width;
    if (state.prefs.justify !== 'left') opts.justify = state.prefs.justify;
    if (state.prefs.layout) {
      opts.horizontalLayout = state.prefs.layout;
      opts.verticalLayout = state.prefs.layout === 'fitted' ? 'fitted' : 'default';
    }
    if (state.prefs.spacing) opts.spacing = state.prefs.spacing;
    return opts;
  }

  function updateMeta(text) {
    if (!els.previewMeta) return;
    const lines = text ? text.split('\n') : [];
    const cols = lines.reduce((w, l) => Math.max(w, l.length), 0);
    const chars = text ? text.length : 0;
    els.previewMeta.textContent = text
      ? `${lines.length.toLocaleString('en-IN')} lines · ${cols.toLocaleString('en-IN')} cols · ${chars.toLocaleString('en-IN')} chars`
      : '—';
  }

  function setPreview(text, label) {
    state.previewText = text;
    if (els.preview) els.preview.textContent = text;
    if (els.previewTitle && label) {
      state.previewLabel = label;
      els.previewTitle.textContent = `Preview — ${label}`;
    }
    updateMeta(text);
  }

  async function refreshPreview() {
    if (!api) return;
    if (state.mode === 'templates') {
      // Template mode is button-driven; keep the last rendered template.
      return;
    }
    if (state.mode === 'box') {
      const text = currentText();
      const out = renderBox(
        text,
        textValue(els.boxStyle, 'single'),
        numberValue(els.boxPadding, 2),
        textValue(els.boxAlign, 'left'),
        numberValue(els.boxWidth, 0)
      );
      setPreview(out, 'Box');
      showWarning('');
      return;
    }

    const text = currentText() || 'HELLO';
    try {
      const out = await api.generate({
        text,
        font: state.font,
        options: figletOptions(),
      });
      setPreview(out, fontLabel(state.font));
      showWarning('');
    } catch (err) {
      setPreview('', null);
      showWarning(`Failed to render: ${err && err.message ? err.message : err}`);
    }
  }

  // ----------------------------------------------------------- font lists

  function matchesFilter(font, filter) {
    if (!filter) return true;
    return font.label.toLowerCase().includes(filter) || font.id.toLowerCase().includes(filter);
  }

  function filteredFonts() {
    const filter = (els.fontSearch ? els.fontSearch.value : '').toLowerCase().trim();
    return state.fonts.filter((f) => f.kind !== 'template' && matchesFilter(f, filter));
  }

  function renderFontList() {
    if (!els.fontPicker) return;
    const filtered = filteredFonts();
    els.fontPicker.innerHTML = '';
    for (const font of filtered) {
      const opt = document.createElement('option');
      opt.value = font.id;
      opt.textContent = `${font.label} · ${font.kind}`;
      if (font.id === state.font) opt.selected = true;
      els.fontPicker.appendChild(opt);
    }
    if (els.galleryCount) {
      els.galleryCount.textContent = `${filtered.length.toLocaleString('en-IN')} fonts`;
    }
  }

  /**
   * Render the gallery cards for the visible slice, previewing the current
   * text in each font. Rendering is sequential and token-guarded so that a
   * new search supersedes in-flight work.
   */
  async function renderGallery() {
    if (!api || !els.gallery) return;
    els.gallery.innerHTML = '';
    const token = ++state.galleryToken;
    const filtered = filteredFonts();
    const slice = filtered.slice(0, state.galleryLimit);
    const sample = (currentText() || 'Aa').split('\n')[0].slice(0, 8) || 'Aa';

    for (const font of slice) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'font-card font-card--pending';
      if (font.id === state.font) card.classList.add('active');
      card.dataset.font = font.id;

      const name = document.createElement('span');
      name.className = 'font-card-name';
      name.textContent = font.label;
      const pre = document.createElement('pre');
      pre.textContent = '…';
      card.appendChild(name);
      card.appendChild(pre);
      els.gallery.appendChild(card);

      try {
        const out = await api.generate({ text: sample, font: font.id });
        if (token !== state.galleryToken) return;
        pre.textContent = out;
        card.classList.remove('font-card--pending');
      } catch {
        card.remove();
      }
    }

    if (els.btnMoreFonts) {
      els.btnMoreFonts.style.display =
        filtered.length > state.galleryLimit ? 'inline-flex' : 'none';
    }
  }

  async function loadFonts() {
    if (!api) return;
    try {
      state.fonts = await api.listFonts();
    } catch {
      state.fonts = [];
      showWarning('Could not load the font list. Built-in fonts only.');
    }
    try {
      const last = await api.lastFont(null);
      if (last && state.fonts.some((f) => f.id === last)) state.font = last;
    } catch {
      /* ignore */
    }
    renderFontList();
    renderGallery();
  }

  async function loadPrefs() {
    let saved = null;
    try {
      if (api && typeof api.options === 'function') saved = await api.options();
      else if (window.localStorage) {
        saved = JSON.parse(window.localStorage.getItem('ascii-studio-prefs') || 'null');
      }
    } catch {
      saved = null;
    }
    if (!saved || typeof saved !== 'object') return;
    for (const key of Object.keys(state.prefs)) {
      if (saved[key] !== undefined && saved[key] !== null) state.prefs[key] = saved[key];
    }
    applyPrefsToInputs();
  }

  function savePrefs() {
    if (api && typeof api.options === 'function') {
      api.options({ ...state.prefs }).catch(() => {});
      return;
    }
    try {
      window.localStorage.setItem('ascii-studio-prefs', JSON.stringify(state.prefs));
    } catch {
      /* ignore quota / sandbox errors */
    }
  }

  function applyPrefsToInputs() {
    if (els.optWidth) els.optWidth.value = String(state.prefs.width || 0);
    if (els.optSpacing) els.optSpacing.value = String(state.prefs.spacing || 0);
    if (els.optJustify) els.optJustify.value = state.prefs.justify || 'left';
    if (els.optLayout) els.optLayout.value = state.prefs.layout || '';
    if (els.optCodeblock) els.optCodeblock.checked = state.prefs.codeblock !== false;
    if (els.previewSize) els.previewSize.value = String(state.prefs.size || 12);
    document.body.dataset.previewTheme = state.prefs.theme === 'light' ? 'light' : 'dark';
    document.body.style.setProperty('--preview-size', `${state.prefs.size || 12}px`);
  }

  function readPrefsFromInputs() {
    state.prefs.width = Math.max(0, Math.min(400, numberValue(els.optWidth, 0)));
    state.prefs.spacing = Math.max(0, Math.min(10, numberValue(els.optSpacing, 0)));
    state.prefs.justify = textValue(els.optJustify, 'left');
    state.prefs.layout = textValue(els.optLayout, '');
    state.prefs.codeblock = els.optCodeblock ? !!els.optCodeblock.checked : true;
  }

  // ------------------------------------------------------------ rendering

  async function selectFont(id, { refreshGalleryActive = true } = {}) {
    if (!id) return;
    state.font = id;
    if (els.fontPicker) els.fontPicker.value = id;
    if (api) api.lastFont(id).catch(() => {});
    if (refreshGalleryActive && els.gallery) {
      els.gallery.querySelectorAll('.font-card').forEach((card) => {
        card.classList.toggle('active', card.dataset.font === id);
      });
    }
    if (state.mode === 'text') await refreshPreview();
  }

  async function renderTemplate(templateId, button) {
    if (!api) return;
    try {
      const out = await api.generate({ text: '', font: `template:${templateId}` });
      setPreview(out, `Template · ${templateId.replace(/-/g, ' ')}`);
      showWarning('');
      els.templateButtons.forEach((btn) => {
        btn.classList.toggle('active', btn === button || btn.dataset.template === templateId);
      });
    } catch (err) {
      showWarning(`Template render failed: ${err && err.message ? err.message : err}`);
    }
  }

  /** Fill every template button with a miniature of its content. */
  async function renderTemplateThumbs() {
    if (!api) return;
    for (const btn of els.templateButtons) {
      const pre = btn.querySelector('pre');
      if (!pre) continue;
      try {
        const out = await api.generate({ text: '', font: `template:${btn.dataset.template}` });
        pre.textContent = out;
      } catch {
        pre.textContent = '';
      }
    }
  }

  function setMode(mode) {
    if (!MODE_SECTION_ID[mode]) return;
    state.mode = mode;
    state.prefs.mode = mode;

    els.modeTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    els.modeSections.forEach((sec) => {
      sec.classList.toggle('active', sec.id === MODE_SECTION_ID[mode]);
    });

    if (els.galleryBlock) {
      els.galleryBlock.style.display = mode === 'text' ? 'flex' : 'none';
    }
    if (mode === 'templates' && els.previewTitle) {
      els.previewTitle.textContent = 'Preview — Templates';
    }
    savePrefs();
    refreshPreview();
  }

  // -------------------------------------------------------------- actions

  function insertPreview() {
    const text = state.previewText;
    if (!text) return;
    readPrefsFromInputs();
    const wrapped = state.prefs.codeblock ? '```\n' + text + '\n```\n' : text + '\n';
    if (window.electronAPI && typeof window.electronAPI.send === 'function') {
      window.electronAPI.send('insert-generated-content', wrapped);
      window.close();
    }
  }

  async function copyPreview() {
    if (!state.previewText || !api) return;
    try {
      await api.copy(state.previewText);
      flashStatus('Copied to clipboard');
    } catch (err) {
      showWarning('Copy failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function savePreview() {
    if (!state.previewText || !api) return;
    try {
      const result = await api.save({
        text: state.previewText,
        defaultName: 'ascii-art.txt',
      });
      if (!result.canceled) flashStatus(`Saved to ${result.path}`);
    } catch (err) {
      showWarning('Save failed: ' + (err && err.message ? err.message : err));
    }
  }

  function refreshAll() {
    readPrefsFromInputs();
    savePrefs();
    refreshPreview();
    renderGallery();
  }

  // ---------------------------------------------------------------- wiring

  function wireEvents() {
    const debouncedRefresh = debounce(refreshPreview, 180);
    const debouncedGallery = debounce(renderGallery, 250);

    if (els.textInput) {
      els.textInput.addEventListener('input', () => {
        debouncedRefresh();
        debouncedGallery();
      });
    }
    if (els.fontPicker) {
      els.fontPicker.addEventListener('change', () => {
        selectFont(els.fontPicker.value);
      });
    }
    if (els.fontSearch) {
      els.fontSearch.addEventListener('input', () => {
        state.galleryLimit = GALLERY_PAGE;
        debouncedGallery();
        renderFontList();
      });
    }
    if (els.btnGenerate) els.btnGenerate.addEventListener('click', refreshAll);
    if (els.btnInsert) els.btnInsert.addEventListener('click', insertPreview);
    if (els.btnCopy) els.btnCopy.addEventListener('click', copyPreview);
    if (els.btnSave) els.btnSave.addEventListener('click', savePreview);

    if (els.btnTheme) {
      els.btnTheme.addEventListener('click', () => {
        state.prefs.theme = state.prefs.theme === 'light' ? 'dark' : 'light';
        applyPrefsToInputs();
        savePrefs();
      });
    }
    if (els.btnMoreFonts) {
      els.btnMoreFonts.addEventListener('click', () => {
        state.galleryLimit += GALLERY_PAGE;
        renderGallery();
      });
    }

    for (const [el, eventName] of [
      [els.optWidth, 'input'],
      [els.optSpacing, 'input'],
      [els.optJustify, 'change'],
      [els.optLayout, 'change'],
    ]) {
      if (!el) continue;
      el.addEventListener(eventName, () => {
        readPrefsFromInputs();
        savePrefs();
        if (state.mode === 'text') refreshPreview();
      });
    }
    if (els.optCodeblock) {
      els.optCodeblock.addEventListener('change', () => {
        readPrefsFromInputs();
        savePrefs();
      });
    }
    if (els.previewSize) {
      els.previewSize.addEventListener('change', () => {
        state.prefs.size = numberValue(els.previewSize, 12);
        applyPrefsToInputs();
        savePrefs();
      });
    }

    els.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    for (const el of [els.boxText, els.boxStyle, els.boxPadding, els.boxAlign, els.boxWidth]) {
      if (!el) continue;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (state.mode === 'box') refreshPreview();
      });
    }

    els.templateButtons.forEach((btn) => {
      btn.addEventListener('click', () => renderTemplate(btn.dataset.template, btn));
    });

    if (els.gallery) {
      els.gallery.addEventListener('click', (event) => {
        const card = event.target.closest('.font-card');
        if (card && card.dataset.font) selectFont(card.dataset.font);
      });
    }

    document.addEventListener('keydown', (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        insertPreview();
      } else if (event.shiftKey && (event.key === 'C' || event.key === 'c')) {
        event.preventDefault();
        copyPreview();
      } else if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        savePreview();
      }
    });
  }

  let bootPromise = null;

  /**
   * Wire the window once and resolve when the font list is ready. Repeat
   * calls return the same promise so tests and late DOMContentLoaded
   * handlers never race the initial load.
   */
  function bootstrap() {
    if (!bootPromise) {
      bootPromise = (async () => {
        wireEvents();
        applyPrefsToInputs();
        if (window.Lucide && typeof window.Lucide.createIcons === 'function') {
          try {
            window.Lucide.createIcons();
          } catch {
            /* icons are decorative */
          }
        }
        await loadPrefs();
        await loadFonts();
        if (state.prefs.mode && MODE_SECTION_ID[state.prefs.mode]) {
          setMode(state.prefs.mode);
        }
        renderTemplateThumbs();
        await refreshPreview();
      })();
    }
    return bootPromise;
  }

  // Expose helpers for tests; the window only needs `bootstrap`.
  window.ASCIIController = { bootstrap };
  window.ASCIIBoxRenderer = { renderBox };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
