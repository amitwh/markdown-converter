/**
 * Visio-style flowchart editor bootstrap.
 *
 * The window is sandboxed (no Node integration); all filesystem and export
 * IO goes through the preload `window.electronAPI.flowchart` bridge.
 */
import { Clipboard, InternalEvent } from '@maxgraph/core';
import { registerFlowShapes, SHAPES, getShape } from './shapes.js';
import {
  addEdge,
  addShapeNode,
  alignSelection,
  createEditorGraph,
  deleteSelection,
  deserializeState,
  distributeSelection,
  duplicateSelection,
  edgeKindForStyle,
  flowModelFromGraph,
  loadFlowModel,
  serializeState,
} from './model.js';
import { graphToSvg, svgToDataUrl } from './exports.js';
import { flowModelToMermaid, mermaidToFlowModel } from './mermaid.js';

const api = (window.electronAPI && window.electronAPI.flowchart) || {};
const canvasEl = document.getElementById('fc-canvas');
const statusEl = document.getElementById('fc-status');
const paletteEl = document.getElementById('fc-palette');
const zoomLabel = document.getElementById('fc-zoom-label');
const inspectorEmpty = document.getElementById('fc-inspector-empty');
const inspectorBody = document.getElementById('fc-inspector-body');
const edgeSection = document.getElementById('insp-edge-section');
const multiSection = document.getElementById('insp-multi-section');
const multiText = document.getElementById('insp-multi-text');
const shortcutsOverlay = document.getElementById('fc-shortcuts-overlay');
const shortcutsModal = document.getElementById('fc-shortcuts-modal');

const fields = {
  label: document.getElementById('insp-label'),
  shape: document.getElementById('insp-shape'),
  shapeField: document.getElementById('insp-shape-field'),
  fill: document.getElementById('insp-fill'),
  stroke: document.getElementById('insp-stroke'),
  strokeWidth: document.getElementById('insp-stroke-width'),
  fontSize: document.getElementById('insp-font-size'),
  fontColor: document.getElementById('insp-font-color'),
  edgeLabel: document.getElementById('insp-edge-label'),
  edgeStyle: document.getElementById('insp-edge-style'),
  edgeKind: document.getElementById('insp-edge-kind'),
  edgeArrow: document.getElementById('insp-edge-arrow'),
};

let graph = null;
let undoManager = null;
let sessionPath = null;
let saveTimer = null;
let inspectorTimer = null;
let labelTimer = null;
let suppressInspector = false;

const SESSION_FILE = 'flowchart-session.json';

function setStatus(message) {
  if (!statusEl) return;
  statusEl.textContent = message;
}

function nowLabel() {
  return new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function isEditingField(target) {
  return (
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}

function cellLabel(cell) {
  return cell && cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
}

function safeColor(value, fallback) {
  return typeof value === 'string' && value !== 'none' ? value : fallback;
}

function updateZoomLabel() {
  if (!graph || !zoomLabel) return;
  zoomLabel.textContent = `${Math.round(graph.getView().scale * 100)}%`;
}

function updateUndoButtons() {
  if (!undoManager) return;
  const undo = document.querySelector('[data-action="undo"]');
  const redo = document.querySelector('[data-action="redo"]');
  if (undo) undo.disabled = !undoManager.canUndo();
  if (redo) redo.disabled = !undoManager.canRedo();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

function createSwatch(shapeId) {
  const svg = svgEl('svg', {
    class: 'fc-palette-swatch',
    viewBox: '0 0 34 24',
    'aria-hidden': 'true',
  });
  const common = { fill: '#ffffff', stroke: '#475569', 'stroke-width': '1.3' };
  const add = (tag, attrs) => svg.appendChild(svgEl(tag, attrs));

  switch (shapeId) {
    case 'startEnd':
      add('ellipse', { cx: 17, cy: 12, rx: 15, ry: 9, ...common });
      break;
    case 'decision':
      add('path', { d: 'M17 2 L32 12 L17 22 L2 12 Z', ...common });
      break;
    case 'document':
      add('path', { d: 'M4 4 H30 V17 Q24 21 17 17 Q10 21 4 17 Z', ...common });
      break;
    case 'data':
      add('path', { d: 'M8 4 H32 L26 20 H2 Z', ...common });
      break;
    case 'subprocess':
      add('rect', { x: 2, y: 4, width: 30, height: 16, ...common });
      add('path', {
        d: 'M7 4 V20 M27 4 V20',
        stroke: '#475569',
        fill: 'none',
        'stroke-width': '1.1',
      });
      break;
    case 'database':
      add('path', { d: 'M6 7 C6 4 28 4 28 7 V17 C28 20 6 20 6 17 Z', ...common });
      add('path', {
        d: 'M6 7 C6 10 28 10 28 7',
        fill: 'none',
        stroke: '#475569',
        'stroke-width': '1.1',
      });
      break;
    case 'manualInput':
      add('path', { d: 'M3 8 L31 4 V20 H3 Z', ...common });
      break;
    case 'delay':
      add('path', { d: 'M3 4 H23 Q31 4 31 12 Q31 20 23 20 H3 Z', ...common });
      break;
    case 'connector':
      add('ellipse', { cx: 17, cy: 12, rx: 8, ry: 8, ...common });
      break;
    case 'text': {
      const text = svgEl('text', {
        x: 17,
        y: 16,
        'text-anchor': 'middle',
        'font-size': '12',
        fill: '#475569',
      });
      text.textContent = 'T';
      svg.appendChild(text);
      break;
    }
    default:
      add('rect', { x: 2, y: 4, width: 30, height: 16, rx: 2, ...common });
  }
  return svg;
}

function buildPalette() {
  if (!paletteEl) return;
  paletteEl.replaceChildren();
  for (const shape of SHAPES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fc-palette-item';
    button.dataset.shape = shape.id;
    button.draggable = true;
    button.title = `Add ${shape.label}`;
    const text = document.createElement('span');
    text.textContent = shape.label;
    button.append(createSwatch(shape.id), text);
    button.addEventListener('click', () => {
      const center = viewportCenter();
      addShapeNode(graph, shape.id, {
        x: center.x - shape.width / 2,
        y: center.y - shape.height / 2,
      });
      refreshInspector();
      setStatus(`Added ${shape.label}`);
    });
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('application/x-flow-shape', shape.id);
      event.dataTransfer.effectAllowed = 'copy';
    });
    paletteEl.appendChild(button);
  }
}

function viewportCenter() {
  const rect = canvasEl.getBoundingClientRect();
  const scale = graph.getView().scale;
  const translate = graph.getView().translate;
  return {
    x: rect.width / 2 / scale - translate.x,
    y: rect.height / 2 / scale - translate.y,
  };
}

function pointFromClient(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  const scale = graph.getView().scale;
  const translate = graph.getView().translate;
  return {
    x: (clientX - rect.left) / scale - translate.x,
    y: (clientY - rect.top) / scale - translate.y,
  };
}

function wireCanvasDrop() {
  canvasEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  canvasEl.addEventListener('drop', (event) => {
    event.preventDefault();
    const shapeId = event.dataTransfer.getData('application/x-flow-shape');
    if (!shapeId) return;
    const shape = getShape(shapeId);
    const point = pointFromClient(event.clientX, event.clientY);
    addShapeNode(graph, shapeId, {
      x: point.x - shape.width / 2,
      y: point.y - shape.height / 2,
    });
    refreshInspector();
    setStatus(`Added ${shape.label}`);
  });
}

function buildShapeSelect() {
  if (!fields.shape) return;
  fields.shape.replaceChildren();
  for (const shape of SHAPES) {
    const option = document.createElement('option');
    option.value = shape.id;
    option.textContent = shape.label;
    fields.shape.appendChild(option);
  }
}

function selectedByType() {
  const cells = graph ? graph.getSelectionCells() : [];
  return {
    all: cells,
    vertices: cells.filter((cell) => cell.isVertex()),
    edges: cells.filter((cell) => cell.isEdge()),
  };
}

function refreshInspector() {
  if (!graph || suppressInspector) return;
  const { all, vertices, edges } = selectedByType();
  const hasSelection = all.length > 0;
  inspectorEmpty.hidden = hasSelection;
  inspectorBody.hidden = !hasSelection;
  if (!hasSelection) return;

  suppressInspector = true;
  try {
    const style = all[0] ? graph.getCellStyle(all[0]) || {} : {};
    fields.label.value = cellLabel(all[0]);
    fields.fill.value = safeColor(style.fillColor, '#ffffff');
    fields.stroke.value = safeColor(style.strokeColor, '#475569');
    fields.strokeWidth.value = String(Number(style.strokeWidth) || 1.5);
    fields.fontSize.value = String(Number(style.fontSize) || 12);
    fields.fontColor.value = safeColor(style.fontColor, '#111827');

    fields.shapeField.hidden = vertices.length === 0;
    if (vertices.length) {
      const kind = style.flowKind || 'process';
      fields.shape.value = kind;
    }

    edgeSection.hidden = edges.length === 0;
    if (edges.length) {
      const edgeStyle = style.edgeStyle || 'orthogonalEdgeStyle';
      fields.edgeStyle.value =
        edgeStyle === 'entityRelationEdgeStyle' ? 'entityRelationEdgeStyle' : edgeStyle;
      fields.edgeKind.value = edgeKindForStyle(style);
      fields.edgeArrow.value =
        style.endArrow === 'open' ? 'open' : style.endArrow === 'none' ? 'none' : 'block';
      fields.edgeLabel.value = cellLabel(edges[0]);
    }

    multiSection.hidden = all.length < 2;
    if (all.length > 1) {
      multiText.textContent = `${vertices.length} shape(s), ${edges.length} connector(s) selected. Style changes apply to the whole selection.`;
    }
  } finally {
    suppressInspector = false;
  }
}

function scheduleInspectorRefresh() {
  if (inspectorTimer) clearTimeout(inspectorTimer);
  const active = document.activeElement;
  if (inspectorBody.contains(active)) return;
  inspectorTimer = setTimeout(refreshInspector, 150);
}

function withModelUpdate(fn) {
  graph.getDataModel().beginUpdate();
  try {
    fn();
  } finally {
    graph.getDataModel().endUpdate();
  }
}

function applyToSelection(key, value) {
  const cells = graph.getSelectionCells();
  if (!cells.length) return;
  withModelUpdate(() => graph.setCellStyles(key, value, cells));
}

function wireInspector() {
  if (!inspectorBody) return;

  fields.label.addEventListener('input', () => {
    if (suppressInspector) return;
    if (labelTimer) clearTimeout(labelTimer);
    labelTimer = setTimeout(() => {
      const cells = graph.getSelectionCells();
      if (!cells.length) return;
      withModelUpdate(() => {
        for (const cell of cells) graph.getDataModel().setValue(cell, fields.label.value);
      });
    }, 250);
  });

  fields.shape.addEventListener('change', () => {
    if (suppressInspector) return;
    const shape = getShape(fields.shape.value);
    const cells = graph.getSelectionCells().filter((cell) => cell.isVertex());
    if (!cells.length) return;
    withModelUpdate(() => {
      graph.setCellStyles('shape', shape.shape, cells);
      graph.setCellStyles('flowKind', shape.id, cells);
    });
  });

  const colorBindings = [
    [fields.fill, 'fillColor'],
    [fields.stroke, 'strokeColor'],
    [fields.fontColor, 'fontColor'],
    [fields.strokeWidth, 'strokeWidth', Number],
    [fields.fontSize, 'fontSize', Number],
  ];
  for (const [input, key, cast] of colorBindings) {
    if (!input) continue;
    input.addEventListener('input', () => {
      if (suppressInspector) return;
      const value = cast ? cast(input.value) : input.value;
      if (cast && Number.isNaN(value)) return;
      applyToSelection(key, value);
    });
  }

  fields.edgeLabel.addEventListener('input', () => {
    if (suppressInspector) return;
    const edges = graph.getSelectionCells().filter((cell) => cell.isEdge());
    if (!edges.length) return;
    withModelUpdate(() => {
      for (const edge of edges) graph.getDataModel().setValue(edge, fields.edgeLabel.value);
    });
  });

  fields.edgeStyle.addEventListener('change', () => {
    if (suppressInspector) return;
    applyToSelection('edgeStyle', fields.edgeStyle.value);
  });

  fields.edgeKind.addEventListener('change', () => {
    if (suppressInspector) return;
    const edges = graph.getSelectionCells().filter((cell) => cell.isEdge());
    if (!edges.length) return;
    const kind = fields.edgeKind.value;
    withModelUpdate(() => {
      graph.setCellStyles('flowEdgeKind', kind, edges);
      graph.setCellStyles('dashed', kind === 'dotted', edges);
      graph.setCellStyles('strokeWidth', kind === 'thick' ? 3 : 1.5, edges);
    });
  });

  fields.edgeArrow.addEventListener('change', () => {
    if (suppressInspector) return;
    applyToSelection('endArrow', fields.edgeArrow.value);
  });
}

function fitGraph() {
  const fit = graph.getPlugin('fit');
  if (fit) fit.fitCenter({ margin: 40 });
  else graph.zoomTo(1);
  updateZoomLabel();
}

function toggleGrid() {
  const enabled = !graph.isGridEnabled();
  graph.setGridEnabled(enabled);
  const button = document.querySelector('[data-action="grid"]');
  if (button) button.setAttribute('aria-pressed', String(enabled));
  setStatus(enabled ? 'Snap to grid on' : 'Snap to grid off');
}

function toggleGuides() {
  const handler = graph.getPlugin('SelectionHandler');
  if (!handler) return;
  handler.guidesEnabled = !handler.guidesEnabled;
  const button = document.querySelector('[data-action="guides"]');
  if (button) button.setAttribute('aria-pressed', String(handler.guidesEnabled));
  setStatus(handler.guidesEnabled ? 'Alignment guides on' : 'Alignment guides off');
}

async function saveSession() {
  if (!graph || !sessionPath || !api.writeFile) return;
  try {
    const state = serializeState(graph);
    await api.writeFile(sessionPath, JSON.stringify(state));
    setStatus(`Saved ${nowLabel()}`);
  } catch (err) {
    setStatus(`Autosave failed: ${err && err.message ? err.message : err}`);
  }
}

function scheduleSessionSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 600);
}

async function saveToFile() {
  if (!api.saveFile) return;
  const state = serializeState(graph);
  const result = await api.saveFile(JSON.stringify(state, null, 2), 'flowchart.flowjson');
  if (!result || result.canceled) setStatus('Save cancelled');
  else setStatus(`Saved ${result.path || 'flowchart.flowjson'}`);
}

function parseOpenedContent(content) {
  const text = String(content || '');
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (data && Array.isArray(data.nodes)) return { state: data };
      if (data && data.graph && Array.isArray(data.graph.nodes)) return { state: data.graph };
    } catch {
      // fall through to Mermaid
    }
  }
  const fenced = trimmed.match(/```(?:mermaid)?\s*([\s\S]*?)```/i);
  const source = fenced ? fenced[1] : trimmed;
  if (/^\s*(flowchart|graph)\s+/i.test(source)) {
    return { model: mermaidToFlowModel(source) };
  }
  return null;
}

async function openFromFile() {
  if (!api.openFile) return;
  const result = await api.openFile();
  if (!result || !result.content) {
    setStatus('Open cancelled');
    return;
  }
  const parsed = parseOpenedContent(result.content);
  if (!parsed) {
    setStatus('Unrecognised file — expected .flowjson or Mermaid');
    return;
  }
  if (parsed.state) {
    deserializeState(graph, parsed.state);
  } else {
    loadFlowModel(graph, parsed.model);
  }
  fitGraph();
  refreshInspector();
  setStatus(`Opened ${result.path || 'file'}`);
}

async function exportSvg() {
  if (!api.saveFile) return;
  const { svg } = graphToSvg(graph);
  const result = await api.saveFile(svg, 'flowchart.svg');
  if (!result || result.canceled) setStatus('Export cancelled');
  else setStatus(`Saved ${result.path || 'flowchart.svg'}`);
}

async function exportRaster(mime, ext, label) {
  if (!api.saveBinary) return;
  const { svg, width, height } = graphToSvg(graph);
  const dataUrl = await svgToDataUrl(svg, width, height, mime);
  const result = await api.saveBinary(dataUrl, `flowchart.${ext}`, [
    { name: label, extensions: [ext] },
    { name: 'All Files', extensions: ['*'] },
  ]);
  if (!result || result.canceled) setStatus('Export cancelled');
  else if (result.error) setStatus(`Export failed: ${result.error}`);
  else setStatus(`Saved ${result.path || `flowchart.${ext}`}`);
}

async function exportVsdx() {
  if (!api.exportVsdx) return;
  const result = await api.exportVsdx(flowModelFromGraph(graph));
  if (!result || result.canceled) setStatus('Export cancelled');
  else if (result.error) setStatus(`Visio export failed: ${result.error}`);
  else setStatus(`Saved ${result.path || 'flowchart.vsdx'}`);
}

function insertAtCursor() {
  if (!api.insertAtCursor || !graph || flowModelFromGraph(graph).nodes.length === 0) return;
  const source = flowModelToMermaid(flowModelFromGraph(graph));
  api.insertAtCursor('```mermaid\n' + source + '\n```');
  setStatus('Inserted at cursor');
}

function wireToolbar() {
  document.querySelector('.fc-toolbar').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    switch (action) {
      case 'undo':
        if (undoManager.canUndo()) undoManager.undo();
        break;
      case 'redo':
        if (undoManager.canRedo()) undoManager.redo();
        break;
      case 'delete':
        deleteSelection(graph);
        break;
      case 'duplicate':
        duplicateSelection(graph);
        break;
      case 'zoom-out':
        graph.zoomOut();
        break;
      case 'zoom-in':
        graph.zoomIn();
        break;
      case 'zoom-fit':
        fitGraph();
        break;
      case 'zoom-reset':
        graph.zoomTo(1);
        break;
      case 'grid':
        toggleGrid();
        break;
      case 'guides':
        toggleGuides();
        break;
      case 'align-left':
        alignSelection(graph, 'left');
        break;
      case 'align-center':
        alignSelection(graph, 'center');
        break;
      case 'align-right':
        alignSelection(graph, 'right');
        break;
      case 'align-top':
        alignSelection(graph, 'top');
        break;
      case 'align-middle':
        alignSelection(graph, 'middle');
        break;
      case 'align-bottom':
        alignSelection(graph, 'bottom');
        break;
      case 'distribute-h':
        distributeSelection(graph, true);
        break;
      case 'distribute-v':
        distributeSelection(graph, false);
        break;
      case 'open':
        openFromFile();
        break;
      case 'save':
        saveToFile();
        break;
      case 'insert':
        insertAtCursor();
        break;
      case 'export-svg':
        exportSvg();
        break;
      case 'export-png':
        exportRaster('image/png', 'png', 'PNG');
        break;
      case 'export-jpg':
        exportRaster('image/jpeg', 'jpg', 'JPEG');
        break;
      case 'export-vsdx':
        exportVsdx();
        break;
      default:
        break;
    }
    updateZoomLabel();
    updateUndoButtons();
    refreshInspector();
  });
}

function showShortcuts() {
  if (!shortcutsModal) return;
  shortcutsModal.hidden = false;
  shortcutsOverlay.hidden = false;
}

function hideShortcuts() {
  if (!shortcutsModal) return;
  shortcutsModal.hidden = true;
  shortcutsOverlay.hidden = true;
}

function wireKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (shortcutsModal && !shortcutsModal.hidden) hideShortcuts();
      else graph.clearSelection();
      return;
    }
    if (event.key === '?' && !isEditingField(event.target)) {
      showShortcuts();
      event.preventDefault();
      return;
    }
    if (!graph || isEditingField(event.target)) return;

    const meta = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (meta && !event.shiftKey && key === 'z') {
      if (undoManager.canUndo()) undoManager.undo();
      event.preventDefault();
    } else if ((meta && event.shiftKey && key === 'z') || (meta && key === 'y')) {
      if (undoManager.canRedo()) undoManager.redo();
      event.preventDefault();
    } else if (meta && key === 'c') {
      Clipboard.copy(graph);
      setStatus('Copied');
      event.preventDefault();
    } else if (meta && key === 'x') {
      Clipboard.cut(graph);
      setStatus('Cut');
      event.preventDefault();
    } else if (meta && key === 'v') {
      Clipboard.paste(graph);
      setStatus('Pasted');
      event.preventDefault();
    } else if (meta && key === 'd') {
      duplicateSelection(graph);
      event.preventDefault();
    } else if (meta && key === 'a') {
      graph.selectAll();
      event.preventDefault();
    } else if (meta && key === '0') {
      fitGraph();
      event.preventDefault();
    } else if (meta && key === '1') {
      graph.zoomTo(1);
      event.preventDefault();
    } else if (!meta && (key === '+' || key === '=')) {
      graph.zoomIn();
      event.preventDefault();
    } else if (!meta && key === '-') {
      graph.zoomOut();
      event.preventDefault();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      deleteSelection(graph);
      event.preventDefault();
    }
    updateZoomLabel();
    updateUndoButtons();
  });
}

function seedStarterGraph() {
  const start = addShapeNode(graph, 'startEnd', { x: 80, y: 120, label: 'Start' });
  const process = addShapeNode(graph, 'process', {
    x: 280,
    y: 120,
    label: 'Describe the step',
  });
  addEdge(graph, start, process, 'solid');
  graph.clearSelection();
  fitGraph();
}

async function restoreSession() {
  try {
    if (api.getUserDataPath) {
      const userData = await api.getUserDataPath();
      sessionPath = `${userData}/${SESSION_FILE}`;
      const raw = await api.readFile(sessionPath);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.nodes)) {
          deserializeState(graph, data);
          fitGraph();
          updateZoomLabel();
          return;
        }
        if (data && data.graph && Array.isArray(data.graph.nodes)) {
          deserializeState(graph, data.graph);
          fitGraph();
          return;
        }
      }
    }
  } catch (err) {
    console.warn('[flowchart-editor] could not restore session:', err);
  }
  seedStarterGraph();
}

function wireModelEvents() {
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => {
    refreshInspector();
    updateUndoButtons();
  });
  graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
    scheduleSessionSave();
    scheduleInspectorRefresh();
    updateUndoButtons();
  });
  graph.getView().addListener(InternalEvent.SCALE, updateZoomLabel);
  graph.getView().addListener(InternalEvent.TRANSLATE, updateZoomLabel);
  graph.getView().addListener(InternalEvent.SCALE_AND_TRANSLATE, updateZoomLabel);
}

async function bootstrap() {
  registerFlowShapes();
  buildShapeSelect();
  const editor = createEditorGraph(canvasEl);
  graph = editor.graph;
  undoManager = editor.undoManager;
  // Exposed for the DOM smoke tests and DevTools; the window is sandboxed.
  window.__fcEditor = {
    graph,
    undoManager,
    flowModelFromGraph,
    graphToSvg,
    serializeState,
    deserializeState,
    loadFlowModel,
    flowModelToMermaid,
    mermaidToFlowModel,
  };
  buildPalette();
  wireCanvasDrop();
  wireInspector();
  wireToolbar();
  wireKeyboard();
  wireModelEvents();
  if (shortcutsOverlay) shortcutsOverlay.addEventListener('click', hideShortcuts);
  const closeButton = document.getElementById('fc-shortcuts-close');
  if (closeButton) closeButton.addEventListener('click', hideShortcuts);
  await restoreSession();
  refreshInspector();
  updateUndoButtons();
  updateZoomLabel();
  setStatus(sessionPath ? 'Ready' : 'Ready (session storage unavailable)');
}

bootstrap().catch((err) => {
  console.error('[flowchart-editor] bootstrap failed:', err);
  setStatus(`Editor failed to start: ${err && err.message ? err.message : err}`);
});
