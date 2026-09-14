/**
 * Flowchart Generator — renderer controller for the standalone window.
 *
 * Drives the DOM in src/flowchart-generator.html. Boots the graph store,
 * hydrates from <userData>/flowchart-session.json (reusing the existing
 * thin text-file IPC handlers), persists on every mutation with a
 * 500 ms debounce, and wires "Insert at Cursor" to the existing
 * `insert-content` IPC so the Mermaid source lands in the main editor
 * wrapped in a fenced code block.
 *
 * Pure browser script — no require(), no node. Pure modules
 * (flowchart-store / flowchart-canvas / flowchart-mermaid / flowchart-shapes)
 * are loaded via <script> tags in src/flowchart-generator.html and exposed
 * as window globals (window.FlowchartStore, window.FlowchartCanvas,
 * window.FlowchartMermaid, window.FlowchartShapes).
 *
 * @module flowchart-controller
 */
(function () {
  'use strict';

  const api =
    window.electronAPI && window.electronAPI.flowchart ? window.electronAPI.flowchart : null;

  const els = {
    canvasHost: document.getElementById('canvas-host'),
    previewSource: document.getElementById('preview-source'),
    previewRender: document.getElementById('preview-render'),
    btnInsert: document.getElementById('fc-btn-insert'),
    btnReset: document.getElementById('fc-btn-reset'),
    status: document.getElementById('fc-status'),
  };

  // Guard rails — these should never be null in a correctly-launched window.
  // Fail loudly with a visible status message rather than silently no-op'ing
  // if the HTML or the preload bridge are misconfigured.
  function fatal(msg) {
    if (els.status) els.status.textContent = msg;
    console.error('[flowchart-controller]', msg);
  }
  if (!els.canvasHost || !els.previewSource || !els.previewRender) {
    fatal('Required DOM elements missing — check src/flowchart-generator.html');
    return;
  }
  if (
    !window.FlowchartStore ||
    !window.FlowchartCanvas ||
    !window.FlowchartMermaid ||
    !window.FlowchartShapes
  ) {
    fatal('Flowchart pure modules not loaded — verify script tags in src/flowchart-generator.html');
    return;
  }
  if (!api) {
    fatal('window.electronAPI.flowchart missing — check src/preload.js');
    return;
  }

  const { create: createStore } = window.FlowchartStore;
  const { createCanvas } = window.FlowchartCanvas;
  const { toMermaid } = window.FlowchartMermaid;
  // FlowchartShapes is intentionally unused here but its presence is
  // required for createCanvas() to function; the guard above guarantees it.

  const PREVIEW_DEBOUNCE_MS = 250;
  const PERSIST_DEBOUNCE_MS = 500;
  const PERSISTENCE_FILENAME = 'flowchart-session.json';

  let _userDataPath = null;
  let _persistenceFile = null;
  let _previewTimer = null;
  let _persistTimer = null;
  let _store = null;
  let _canvas = null;

  function setStatus(msg) {
    if (els.status) els.status.textContent = msg || '';
    if (msg) setTimeout(() => setStatus(''), 2500);
  }

  function runPreview() {
    if (!_store || !els.previewSource || !els.previewRender) return;
    const graph = _store.getGraph();
    const source = toMermaid(graph);
    els.previewSource.textContent = source;
    // v4.9.6 — text preview only. The SVG canvas on the left is the
    // visual preview (hand-rolled, no Mermaid runtime needed in this
    // window's renderer). Mirrors the v4.9.5 fix that forced a light
    // surface to guarantee visibility.
    els.previewRender.textContent = '';
  }

  function debouncedPreview() {
    if (_previewTimer) clearTimeout(_previewTimer);
    _previewTimer = setTimeout(() => {
      _previewTimer = null;
      runPreview();
    }, PREVIEW_DEBOUNCE_MS);
  }

  function debouncedPersist() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      if (!_store || !_persistenceFile) return;
      api
        .writeFile(_persistenceFile, _store.serialize())
        .then(() => setStatus('Saved'))
        .catch((err) => setStatus(`Save failed: ${err && err.message ? err.message : err}`));
    }, PERSIST_DEBOUNCE_MS);
  }

  async function bootstrap() {
    // Resolve the userData path ONCE on mount. The persistence path is
    // interpolated into a string on every read/write; calling the async
    // api.getUserDataPath() directly would coerce the Promise to
    // "[object Promise]" and break the userData sandbox check in
    // main.js:write-text-file.
    try {
      _userDataPath = await api.getUserDataPath();
    } catch (err) {
      fatal(`Could not resolve userData path: ${err && err.message ? err.message : err}`);
      return;
    }
    _persistenceFile = `${_userDataPath}/${PERSISTENCE_FILENAME}`;

    _store = createStore({
      persistencePath: _persistenceFile,
      readFile: api.readFile,
      writeFile: api.writeFile,
      now: () => Date.now(),
    });

    _canvas = createCanvas(els.canvasHost, _store, {
      onEdgeClick: (edgeId) => {
        const edge = _store.getGraph().edges.find((e) => e.id === edgeId);
        if (!edge) return;
        const nextKind = window.prompt('Edge kind (solid, dotted, thick):', edge.kind);
        if (nextKind && ['solid', 'dotted', 'thick'].includes(nextKind)) {
          _store.setEdgeKind(edgeId, nextKind);
        }
        const nextLabel = window.prompt('Edge label (empty to clear):', edge.label || '');
        if (nextLabel !== null) {
          _store.setEdgeLabel(edgeId, nextLabel);
        }
      },
      onNodeClick: () => {
        // Canvas already paints the .selected highlight; nothing else
        // needed here for selection state.
      },
      onShapeMenu: (nodeId) => {
        const next = window.prompt(
          'New shape (process, decision, terminator, subroutine, document):'
        );
        if (next) _store.setNodeKind(nodeId, next);
      },
    });

    _store.subscribe(() => {
      debouncedPreview();
      debouncedPersist();
    });

    // Hydrate from disk (defensively — corrupt JSON is caught by the store).
    try {
      const json = await api.readFile(_persistenceFile);
      if (json) _store.deserialize(json);
    } catch (err) {
      console.warn('[flowchart-controller] failed to read session:', err);
    }

    if (els.btnInsert) {
      els.btnInsert.addEventListener('click', () => {
        if (!_store) return;
        const source = toMermaid(_store.getGraph());
        const fenced = '```mermaid\n' + source + '\n```';
        if (api.insertAtCursor) api.insertAtCursor(fenced);
        setStatus('Inserted');
      });
    }

    if (els.btnReset) {
      els.btnReset.addEventListener('click', () => {
        if (!_store) return;
        if (!window.confirm('Clear all nodes and edges?')) return;
        _store.deserialize({ nodes: [], edges: [] });
        setStatus('Reset');
      });
    }

    // Keyboard shortcuts — Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z / Delete / Backspace.
    document.addEventListener('keydown', (ev) => {
      if (!_store) return;
      const meta = ev.ctrlKey || ev.metaKey;
      if (meta && !ev.shiftKey && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        _store.undo();
        return;
      }
      if (meta && ev.shiftKey && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        _store.redo();
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        // Delete applies to the canvas's currently-selected node/edge.
        // The canvas doesn't expose selection state directly; we read
        // it from the DOM .selected class.
        const selectedNode = els.canvasHost.querySelector('.flowchart-node.selected');
        if (selectedNode) {
          const id = selectedNode.getAttribute('data-node-id');
          if (id) {
            ev.preventDefault();
            _store.removeNode(id);
          }
          return;
        }
        const selectedEdge = els.canvasHost.querySelector('.flowchart-edge.selected');
        if (selectedEdge) {
          const id = selectedEdge.getAttribute('data-edge-id');
          if (id) {
            ev.preventDefault();
            _store.disconnect(id);
          }
        }
      }
    });

    runPreview();
    setStatus('Ready');
  }

  // Expose a minimal handle for tests (mirrors ascii-controller.js pattern).
  window.FlowchartController = {
    bootstrap,
    get store() {
      return _store;
    },
    get canvas() {
      return _canvas;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
