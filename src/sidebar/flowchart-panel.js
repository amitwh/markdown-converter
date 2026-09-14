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
 *
 * @param {HTMLElement} container Mount point inside the sidebar panel
 * @param {object} deps
 * @param {() => string} deps.getUserDataPath   Absolute userData directory
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

  let selectedNodeId = null;
  let selectedEdgeId = null;

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
      canvas.destroy();
    },
  };
}

module.exports = { renderFlowChartPanel };
