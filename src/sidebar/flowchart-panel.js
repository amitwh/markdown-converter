/**
 * Sidebar panel: visual flow chart editor.
 *
 * Owns:
 *   - flowchart-store (graph + undo/redo + subscribe)
 *   - flowchart-canvas (SVG)
 *   - flowchart-mermaid preview (text + injected renderer)
 *   - debounced persistence to <userData>/flowchart-session.json
 *   - panel-scoped keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z / Delete)
 *   - "Insert at Cursor" button (reuses the existing `insert-content` IPC)
 *   - "Maximize / Restore" toggle that promotes the panel to fill the
 *     main-content area (hides the editor-container) so the canvas +
 *     preview split get the full window width instead of the 280px sidebar.
 *
 * @param {HTMLElement} container Mount point inside the sidebar panel
 * @param {object} deps
 * @param {() => string} deps.getUserDataPath   Absolute userData directory (renderer pre-resolves and caches this on first mount — must be synchronous and return a real string, not a Promise)
 * @param {(path:string) => Promise<string|null>} deps.readFile
 * @param {(path:string, content:string) => Promise<void>} deps.writeFile
 * @param {(text:string) => void} deps.insertAtCursor
 * @param {(source:string, target:HTMLElement) => void} [deps.renderMermaid]
 */

'use strict';

const { create: createStore } = require('../flowchart/flowchart-store');
const { createCanvas } = require('../flowchart/flowchart-canvas');
const { toMermaid } = require('../flowchart/flowchart-mermaid');

const PREVIEW_DEBOUNCE_MS = 250;
const PERSIST_DEBOUNCE_MS = 500;
const PERSISTENCE_FILENAME = 'flowchart-session.json';
// CSS class toggled on `.main-content` while the panel is in takeover mode.
// Kept colocated with the panel so any reader can grep for it. See
// src/styles-sidebar.css `.main-content.flowchart-takeover` rules.
const TAKEOVER_CLASS = 'flowchart-takeover';

function renderFlowChartPanel(container, deps) {
  const { getUserDataPath, readFile, writeFile, insertAtCursor, renderMermaid = () => {} } = deps;
  if (typeof getUserDataPath !== 'function') {
    throw new Error('flowchart-panel: getUserDataPath is required');
  }
  if (typeof readFile !== 'function' || typeof writeFile !== 'function') {
    throw new Error('flowchart-panel: readFile and writeFile are required');
  }
  if (typeof insertAtCursor !== 'function') {
    throw new Error('flowchart-panel: insertAtCursor is required');
  }

  // Compute the persistence path ONCE on mount. Re-resolving per call would
  // hit the filesystem / IPC bridge unnecessarily on every debounced write.
  const persistenceFile = `${getUserDataPath()}/${PERSISTENCE_FILENAME}`;

  container.innerHTML = `
    <div class="flowchart-panel" tabindex="0">
      <div class="flowchart-toolbar">
        <button class="flowchart-insert-btn" title="Insert Mermaid block at cursor">
          Insert at Cursor
        </button>
        <span class="flowchart-status" aria-live="polite"></span>
        <button
          class="flowchart-maximize-btn"
          title="Maximize: hide the editor and let the canvas + preview fill the main area"
          aria-label="Maximize Flow Chart panel"
        >
          <span class="flowchart-maximize-icon" aria-hidden="true">⤢</span>
          <span class="flowchart-maximize-label">Maximize</span>
        </button>
      </div>
      <div class="flowchart-split">
        <div class="flowchart-canvas-host"></div>
        <div class="flowchart-preview-host">
          <pre class="flowchart-preview-source"></pre>
          <div class="flowchart-preview-render"></div>
        </div>
      </div>
    </div>
  `;

  const canvasHost = container.querySelector('.flowchart-canvas-host');
  const previewSourceEl = container.querySelector('.flowchart-preview-source');
  const previewRenderEl = container.querySelector('.flowchart-preview-render');
  const insertBtn = container.querySelector('.flowchart-insert-btn');
  const statusEl = container.querySelector('.flowchart-status');
  const maximizeBtn = container.querySelector('.flowchart-maximize-btn');
  const maximizeLabel = container.querySelector('.flowchart-maximize-label');

  let selectedNodeId = null;
  let selectedEdgeId = null;
  // Takeover state: when true, `.main-content` carries `flowchart-takeover`
  // and the editor-container is hidden so the panel + canvas + preview split
  // the full window width. Toggled by the maximize button (and cleaned up
  // by destroy() so leaving it doesn't leave the editor hidden).
  let takeoverActive = false;

  // The sidebar lives inside `.main-content` (see src/styles-sidebar.css).
  // Look it up by walking up from the panel container — that way the panel
  // doesn't need to know whether the renderer mounted it via #sidebar or
  // any future container.
  function findMainContent() {
    let el = container;
    while (el && el.parentElement) {
      el = el.parentElement;
      if (el.classList && el.classList.contains('main-content')) return el;
    }
    return document.querySelector('.main-content');
  }

  const store = createStore({
    persistencePath: persistenceFile,
    readFile,
    writeFile,
    now: () => Date.now(),
  });

  // Hydrate from disk (defensively).
  readFile(persistenceFile)
    .then((json) => {
      if (json) store.deserialize(json);
    })
    .catch((err) => {
      console.warn('flowchart-panel: failed to read session', err);
    });

  const canvas = createCanvas(canvasHost, store, {
    onEdgeClick: (edgeId) => {
      // Click an edge → prompt for kind and (optional) label. v2 can replace
      // this with a real popover menu; the prompts are intentionally simple.
      // Mirror the selection into panel state so Delete/Backspace on the
      // panel-scoped keydown handler routes to the right entity even after a
      // pure click (no drag, no store mutation to trigger render-based sync).
      selectedEdgeId = edgeId;
      selectedNodeId = null;
      const edge = store.getGraph().edges.find((e) => e.id === edgeId);
      if (!edge) return;
      const nextKind = window.prompt('Edge kind (solid, dotted, thick):', edge.kind);
      if (nextKind && ['solid', 'dotted', 'thick'].includes(nextKind)) {
        store.setEdgeKind(edgeId, nextKind);
      }
      const nextLabel = window.prompt('Edge label (empty to clear):', edge.label || '');
      if (nextLabel !== null) {
        store.setEdgeLabel(edgeId, nextLabel);
      }
    },
    onNodeClick: (nodeId) => {
      // Canvas → panel selection sync. The canvas already paints the
      // .flowchart-node.selected highlight (see flowchart-canvas.js render()
      // and the .flowchart-node.selected CSS rule). Mirror the id into the
      // panel's selection state so Delete/Backspace routes here.
      selectedNodeId = nodeId;
      selectedEdgeId = null;
    },
    onShapeMenu: (nodeId) => {
      // Prompt for a new shape kind. v2: replace with a real context menu.
      const next = window.prompt(
        'New shape (process, decision, terminator, subroutine, document):'
      );
      if (next) store.setNodeKind(nodeId, next);
    },
  });

  // Debounced live preview. Track the timer handle so destroy() can cancel
  // any in-flight update that would otherwise write to a detached <pre>.
  let previewTimer = null;
  function runPreview() {
    const source = toMermaid(store.getGraph());
    previewSourceEl.textContent = source;
    try {
      renderMermaid(source, previewRenderEl);
    } catch (err) {
      previewRenderEl.textContent = `Preview error: ${err && err.message ? err.message : 'unknown'}`;
    }
  }
  function debouncedPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      runPreview();
    }, PREVIEW_DEBOUNCE_MS);
  }

  // Debounced persistence. Track the timer handle so destroy() can cancel a
  // queued writeFile that would otherwise fire after unmount.
  let persistTimer = null;
  function debouncedPersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeFile(persistenceFile, store.serialize()).catch((err) => {
        if (statusEl) statusEl.textContent = `Save failed: ${err.message || err}`;
      });
    }, PERSIST_DEBOUNCE_MS);
  }

  const unsubscribeStore = store.subscribe(() => {
    debouncedPreview();
    debouncedPersist();
  });

  function onInsertClick() {
    const source = toMermaid(store.getGraph());
    insertAtCursor('```mermaid\n' + source + '\n```');
  }
  insertBtn.addEventListener('click', onInsertClick);

  // Maximize / restore toggle. When active, .main-content.flowchart-takeover
  // hides the editor-container and lets the sidebar + canvas fill the row.
  // Click again to restore. Kept inside the panel so its lifecycle matches
  // the panel's destroy() cleanup.
  function setTakeover(active) {
    const mainContent = findMainContent();
    if (!mainContent) return;
    takeoverActive = active;
    mainContent.classList.toggle(TAKEOVER_CLASS, active);
    maximizeBtn.classList.toggle('active', active);
    maximizeBtn.setAttribute(
      'aria-label',
      active ? 'Restore Flow Chart panel' : 'Maximize Flow Chart panel'
    );
    maximizeBtn.setAttribute(
      'title',
      active
        ? 'Restore: show the editor again'
        : 'Maximize: hide the editor and let the canvas + preview fill the main area'
    );
    if (maximizeLabel) {
      maximizeLabel.textContent = active ? 'Restore' : 'Maximize';
    }
  }
  function onMaximizeClick() {
    setTakeover(!takeoverActive);
  }
  maximizeBtn.addEventListener('click', onMaximizeClick);

  // Keyboard shortcuts — panel-scoped.
  function onContainerKeyDown(ev) {
    if (ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (selectedNodeId) {
        ev.preventDefault();
        store.removeNode(selectedNodeId);
        selectedNodeId = null;
      } else if (selectedEdgeId) {
        ev.preventDefault();
        store.disconnect(selectedEdgeId);
        selectedEdgeId = null;
      }
    }
  }
  container.addEventListener('keydown', onContainerKeyDown);

  return {
    getStore: () => store,
    getSvg: () => canvas.getSvg(),
    selectNode: (id) => {
      selectedNodeId = id;
    },
    selectEdge: (id) => {
      selectedEdgeId = id;
    },
    destroy: () => {
      // Clear timers BEFORE canvas.destroy(): canvas teardown may trigger a
      // last pointer-move that schedules another preview/persist; we want
      // those timers cancelled before canvas.destroy() runs.
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      unsubscribeStore();
      container.removeEventListener('keydown', onContainerKeyDown);
      insertBtn.removeEventListener('click', onInsertClick);
      maximizeBtn.removeEventListener('click', onMaximizeClick);
      // Restore the editor if we were in takeover mode — leaving the class
      // on .main-content would hide the editor for the rest of the session.
      if (takeoverActive) setTakeover(false);
      canvas.destroy();
    },
  };
}

module.exports = { renderFlowChartPanel };
