/**
 * Quick-switcher overlay UI.
 *
 * Modal centered over the viewport. Lists recent files, open tabs, and
 * (when toggled) workspace files ranked by the shared fuzzy matcher.
 *
 * Pure logic — ranking, scoring — lives in fuzzy-matcher.js. This module
 * owns DOM and keyboard only.
 *
 * @module quick-switcher-overlay
 */

const { rankResults: defaultRankResults } = require('./fuzzy-matcher');

/**
 * @param {HTMLElement} container Mount point (typically document.body or a
 *   dedicated overlay host appended by the caller)
 * @param {object} deps
 * @param {() => string[]} [deps.getOpenTabPaths]
 * @param {(dir:string, options?:object) => Promise<Array<{path:string, name:string}>>} [deps.listWorkspaceFiles]
 * @param {(filePath:string) => void} [deps.onOpenFile]
 * @param {() => string|null} [deps.getWorkspaceDir]
 * @param {(query:string, items:Array, boosts:object) => Array} [deps.rankResults]
 * @param {number} [deps.debounceMs=80]
 * @returns {{
 *   show(opts?:{recent?:string[]}): void,
 *   hide(): void,
 *   destroy(): void,
 *   isOpen(): boolean,
 *   setRecent(recent:string[]): void,
 *   getSelectedPath(): string|null,
 * }}
 */
function createQuickSwitcherOverlay(container, deps = {}) {
  const {
    getOpenTabPaths = () => [],
    listWorkspaceFiles = async () => [],
    onOpenFile = () => {},
    getWorkspaceDir = () => null,
    rankResults = defaultRankResults,
    debounceMs = 80,
  } = deps;

  let modalEl = null;
  let inputEl = null;
  let listEl = null;
  let emptyEl = null;
  let workspaceToggleEl = null;
  let open = false;
  let currentQuery = '';
  let recentFiles = [];
  let workspaceFiles = [];
  let workspaceMode = false;
  let rankedItems = [];
  let selectedIndex = 0;
  let debounceTimer = null;
  let keyListener = null;
  let backdropListener = null;

  function buildDom() {
    const wrap = document.createElement('div');
    wrap.className = 'quick-switcher-wrap';
    wrap.innerHTML = `
      <div class="quick-switcher-backdrop"></div>
      <div class="quick-switcher-modal" role="dialog" aria-label="Quick switcher">
        <input class="quick-switcher-input" type="text" autocomplete="off" spellcheck="false"
          aria-label="Search files">
        <div class="quick-switcher-toolbar">
          <span class="quick-switcher-count" aria-live="polite"></span>
          <button type="button" class="quick-switcher-workspace-toggle" aria-pressed="false">
            Search workspace
          </button>
        </div>
        <ul class="quick-switcher-list" role="listbox"></ul>
        <div class="quick-switcher-empty" hidden>No matches</div>
      </div>
    `;
    return wrap;
  }

  function attachListeners() {
    if (!modalEl) return;

    inputEl.addEventListener('input', onInput);

    keyListener = (e) => {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        hide();
        return;
      }
      // Only arrow/enter handled at document level (Esc, too); input handles
      // text natively.
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        updateSelection(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        openSelected();
      }
    };
    // Capture so Esc works even if focus drifts (it usually shouldn't).
    document.addEventListener('keydown', keyListener, true);

    backdropListener = () => hide();
    modalEl.querySelector('.quick-switcher-backdrop').addEventListener('click', backdropListener);

    workspaceToggleEl.addEventListener('click', onToggleWorkspace);
  }

  function detachListeners() {
    if (inputEl) inputEl.removeEventListener('input', onInput);
    if (keyListener) document.removeEventListener('keydown', keyListener, true);
    if (backdropListener && modalEl) {
      const bd = modalEl.querySelector('.quick-switcher-backdrop');
      if (bd) bd.removeEventListener('click', backdropListener);
    }
    if (workspaceToggleEl) workspaceToggleEl.removeEventListener('click', onToggleWorkspace);
    keyListener = null;
    backdropListener = null;
  }

  function onInput() {
    currentQuery = inputEl.value;
    scheduleRefresh();
  }

  function onToggleWorkspace() {
    workspaceMode = !workspaceMode;
    workspaceToggleEl.setAttribute('aria-pressed', String(workspaceMode));
    workspaceToggleEl.classList.toggle('active', workspaceMode);
    scheduleRefresh(true);
  }

  function scheduleRefresh(immediate = false) {
    if (debounceTimer) clearTimeout(debounceTimer);
    const run = () => {
      debounceTimer = null;
      refresh();
    };
    if (immediate || debounceMs <= 0) run();
    else debounceTimer = setTimeout(run, debounceMs);
  }

  async function refresh() {
    const dir = getWorkspaceDir();
    if (workspaceMode && workspaceFiles.length === 0 && dir) {
      try {
        workspaceFiles = await listWorkspaceFiles(dir);
      } catch {
        workspaceFiles = [];
      }
    }

    const openTabs = getOpenTabPaths();
    const recentSet = new Set(recentFiles);
    const openSet = new Set(openTabs);

    const candidates = [];
    if (workspaceMode) {
      for (const f of workspaceFiles) candidates.push(f);
    }
    for (const path of recentFiles) {
      if (!candidates.some((c) => c.path === path)) {
        const name = path.split(/[\\/]/).pop() || path;
        candidates.push({ path, name });
      }
    }
    for (const path of openTabs) {
      if (!candidates.some((c) => c.path === path)) {
        const name = path.split(/[\\/]/).pop() || path;
        candidates.push({ path, name });
      }
    }

    rankedItems = rankResults(currentQuery, candidates, { recent: recentSet, openTabs: openSet });

    // Keep selection in bounds
    if (selectedIndex >= rankedItems.length) {
      selectedIndex = Math.max(0, rankedItems.length - 1);
    }
    renderList();
  }

  function renderList() {
    if (!modalEl) return;

    listEl.innerHTML = '';
    emptyEl.hidden = rankedItems.length > 0;

    for (let i = 0; i < rankedItems.length; i++) {
      const { item } = rankedItems[i];
      const li = document.createElement('li');
      li.className = 'quick-switcher-item' + (i === selectedIndex ? ' selected' : '');
      li.setAttribute('role', 'option');
      li.dataset.index = String(i);
      li.dataset.path = item.path;

      const baseName = item.name || item.path.split(/[\\/]/).pop() || item.path;
      const parent = item.path.slice(0, item.path.length - baseName.length);
      li.innerHTML = `
        <span class="quick-switcher-name"></span>
        <span class="quick-switcher-path"></span>
      `;
      li.querySelector('.quick-switcher-name').textContent = baseName;
      li.querySelector('.quick-switcher-path').textContent = parent;

      li.addEventListener('click', () => {
        selectedIndex = i;
        openSelected();
      });
      li.addEventListener('mouseenter', () => {
        selectedIndex = i;
        updateHighlight();
      });

      listEl.appendChild(li);
    }

    const count = modalEl.querySelector('.quick-switcher-count');
    if (count) {
      count.textContent = rankedItems.length
        ? `${rankedItems.length} ${rankedItems.length === 1 ? 'result' : 'results'}`
        : '';
    }
  }

  function updateHighlight() {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.quick-switcher-item');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
    });
  }

  function updateSelection(delta) {
    if (rankedItems.length === 0) return;
    selectedIndex = Math.max(0, Math.min(rankedItems.length - 1, selectedIndex + delta));
    updateHighlight();
  }

  function openSelected() {
    const sel = rankedItems[selectedIndex];
    if (!sel) return;
    onOpenFile(sel.item.path);
    hide();
  }

  function show({ recent = [] } = {}) {
    recentFiles = recent;
    currentQuery = '';
    selectedIndex = 0;
    workspaceMode = false;
    workspaceFiles = [];

    if (!modalEl) {
      modalEl = buildDom();
      container.appendChild(modalEl);
      inputEl = modalEl.querySelector('.quick-switcher-input');
      listEl = modalEl.querySelector('.quick-switcher-list');
      emptyEl = modalEl.querySelector('.quick-switcher-empty');
      workspaceToggleEl = modalEl.querySelector('.quick-switcher-workspace-toggle');
      attachListeners();
    }

    inputEl.value = '';
    workspaceToggleEl.setAttribute('aria-pressed', 'false');
    workspaceToggleEl.classList.remove('active');

    modalEl.classList.add('open');
    open = true;
    inputEl.focus();
    scheduleRefresh(true);
  }

  function hide() {
    open = false;
    if (modalEl) modalEl.classList.remove('open');
  }

  function destroy() {
    detachListeners();
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    inputEl = null;
    listEl = null;
    emptyEl = null;
    workspaceToggleEl = null;
  }

  function isOpenFn() {
    return open;
  }

  function setRecentFn(recent) {
    recentFiles = Array.isArray(recent) ? recent : [];
    if (open) scheduleRefresh(true);
  }

  function getSelectedPathFn() {
    const sel = rankedItems[selectedIndex];
    return sel ? sel.item.path : null;
  }

  return {
    show,
    hide,
    destroy,
    isOpen: isOpenFn,
    setRecent: setRecentFn,
    getSelectedPath: getSelectedPathFn,
  };
}

module.exports = { createQuickSwitcherOverlay };
