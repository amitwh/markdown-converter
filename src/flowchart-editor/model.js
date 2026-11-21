/**
 * maxGraph model configuration, graph <-> flow-model conversion, and
 * persistence helpers for the flowchart editor.
 */
import { Graph, InternalEvent, UndoManager } from '@maxgraph/core';
import { getShape, shapeForMermaidKind, shapeIdForStyle } from './shapes.js';

function isNil(value) {
  return value === null || value === undefined;
}

const VERTEX_STYLE = {
  fontFamily: "'Segoe UI', Inter, system-ui, sans-serif",
  fontSize: 12,
  fontColor: '#111827',
  fillColor: '#ffffff',
  strokeColor: '#475569',
  strokeWidth: 1.5,
  rounded: true,
  arcSize: 10,
  whiteSpace: 'wrap',
  align: 'center',
  verticalAlign: 'middle',
  rotatable: true,
  resizable: true,
  movable: true,
  deletable: true,
  editable: true,
  html: 0,
};

const EDGE_STYLE = {
  edgeStyle: 'orthogonalEdgeStyle',
  rounded: true,
  orthogonalLoop: true,
  jettySize: 'auto',
  endArrow: 'block',
  endSize: 7,
  strokeColor: '#475569',
  strokeWidth: 1.5,
  fontColor: '#111827',
  fontSize: 11,
  labelBackgroundColor: '#ffffff',
  html: 0,
};

export function createEditorGraph(container) {
  InternalEvent.disableContextMenu(container);
  const graph = new Graph(container);

  graph.setEnabled(true);
  graph.setPanning(true);
  graph.setConnectable(true);
  graph.setCellsResizable(true);
  graph.setCellsBendable(true);
  graph.setCellsEditable(true);
  graph.setCellsMovable(true);
  graph.setCellsCloneable(true);
  graph.setCellsDeletable(true);
  graph.setCellsDisconnectable(true);
  graph.setAllowDanglingEdges(false);
  graph.setConnectableEdges(false);
  graph.setDropEnabled(true);
  graph.setMultigraph(false);
  graph.setAutoSizeCells(false);
  graph.setExtendParents(false);
  graph.setExtendParentsOnAdd(false);
  graph.setGridEnabled(true);
  graph.setGridSize(10);
  graph.setTooltips(false);
  if (typeof graph.setResetEdgesOnConnect === 'function') graph.setResetEdgesOnConnect(true);

  const stylesheet = graph.getStylesheet();
  stylesheet.putDefaultVertexStyle({ ...stylesheet.getDefaultVertexStyle(), ...VERTEX_STYLE });
  stylesheet.putDefaultEdgeStyle({ ...stylesheet.getDefaultEdgeStyle(), ...EDGE_STYLE });

  const selectionHandler = graph.getPlugin('SelectionHandler');
  if (selectionHandler) selectionHandler.guidesEnabled = true;

  const fitPlugin = graph.getPlugin('fit');
  if (fitPlugin) {
    fitPlugin.maxFitScale = 1.5;
    fitPlugin.minFitScale = 0.2;
  }

  const undoManager = new UndoManager(200);
  const onUndoableEdit = (_sender, evt) => {
    const edit = evt.getProperty('edit');
    if (edit) undoManager.undoableEditHappened(edit);
  };
  graph.getDataModel().addListener(InternalEvent.UNDO, onUndoableEdit);
  graph.getView().addListener(InternalEvent.UNDO, onUndoableEdit);

  return { graph, undoManager };
}

function styleForShape(shape, overrides = {}) {
  return {
    shape: shape.shape,
    flowKind: shape.id,
    ...(shape.style || {}),
    ...overrides,
  };
}

export function addShapeNode(graph, shapeId, { x = 40, y = 40, label, width, height } = {}) {
  const shape = getShape(shapeId);
  const cell = graph.insertVertex({
    value: isNil(label) ? shape.label : String(label),
    position: [x, y],
    size: [width || shape.width, height || shape.height],
    style: styleForShape(shape),
  });
  graph.setSelectionCell(cell);
  return cell;
}

export function addEdge(graph, source, target, kind = 'solid') {
  if (!source || !target || source === target) return null;
  const edge = graph.insertEdge({
    source,
    target,
    value: '',
    style: edgeStyle(kind),
  });
  graph.setSelectionCell(edge);
  return edge;
}

export function edgeStyle(kind) {
  if (kind === 'dotted') return { dashed: true, flowEdgeKind: 'dotted' };
  if (kind === 'thick') return { strokeWidth: 3, flowEdgeKind: 'thick' };
  return { dashed: false, strokeWidth: 1.5, flowEdgeKind: 'solid' };
}

export function edgeKindForStyle(style = {}) {
  if (style.flowEdgeKind) return style.flowEdgeKind;
  if (style.dashed) return 'dotted';
  if (Number(style.strokeWidth) >= 2.5) return 'thick';
  return 'solid';
}

export function flowModelFromGraph(graph) {
  const parent = graph.getDefaultParent();
  const cells = graph.getChildCells(parent, true, true);
  const nodes = [];
  const edges = [];

  for (const cell of cells) {
    const style = graph.getCellStyle(cell) || {};
    const geometry = cell.geometry || { x: 0, y: 0, width: 0, height: 0 };
    if (cell.isVertex()) {
      const shapeId = shapeIdForStyle(style);
      const shape = getShape(shapeId);
      nodes.push({
        id: cell.id,
        shapeId,
        kind: shape.mermaidKind,
        label: isNil(cell.value) ? '' : String(cell.value),
        x: Math.round(geometry.x || 0),
        y: Math.round(geometry.y || 0),
        width: Math.round(geometry.width || shape.width),
        height: Math.round(geometry.height || shape.height),
        color: style.fillColor && style.fillColor !== 'none' ? style.fillColor : '#ffffff',
        fillColor: style.fillColor && style.fillColor !== 'none' ? style.fillColor : '#ffffff',
        strokeColor: typeof style.strokeColor === 'string' ? style.strokeColor : '#475569',
        strokeWidth: Number(style.strokeWidth) || 1.5,
        fontColor: typeof style.fontColor === 'string' ? style.fontColor : '#111827',
        fontSize: Number(style.fontSize) || 12,
        rotation: Number(style.rotation) || 0,
      });
    } else if (cell.isEdge() && cell.source && cell.target) {
      edges.push({
        id: cell.id,
        fromNodeId: cell.source.id,
        toNodeId: cell.target.id,
        kind: edgeKindForStyle(style),
        label: isNil(cell.value) ? '' : String(cell.value),
        edgeStyle:
          typeof style.edgeStyle === 'string' ? style.edgeStyle : 'orthogonalEdgeStyle',
        endArrow: typeof style.endArrow === 'string' ? style.endArrow : 'block',
        strokeColor: typeof style.strokeColor === 'string' ? style.strokeColor : '#475569',
        strokeWidth: Number(style.strokeWidth) || 1.5,
        dashed: !!style.dashed,
      });
    }
  }

  return { nodes, edges };
}

export function clearGraph(graph) {
  const parent = graph.getDefaultParent();
  const cells = graph.getChildCells(parent, true, true);
  if (cells.length) graph.removeCells(cells, true);
}

export function loadFlowModel(graph, model = {}) {
  const nodes = Array.isArray(model.nodes) ? model.nodes : [];
  const edges = Array.isArray(model.edges) ? model.edges : [];
  const idMap = new Map();

  graph.getDataModel().beginUpdate();
  try {
    clearGraph(graph);
    for (const node of nodes) {
      const shape = node.shapeId ? getShape(node.shapeId) : shapeForMermaidKind(node.kind);
      const cell = graph.insertVertex({
        value: isNil(node.label) ? '' : String(node.label),
        position: [Number(node.x) || 0, Number(node.y) || 0],
        size: [Number(node.width) || shape.width, Number(node.height) || shape.height],
        style: styleForShape(shape, {
          fillColor: node.fillColor || node.color || '#ffffff',
          ...(node.strokeColor ? { strokeColor: node.strokeColor } : {}),
          ...(node.strokeWidth ? { strokeWidth: Number(node.strokeWidth) } : {}),
          ...(node.fontColor ? { fontColor: node.fontColor } : {}),
          ...(node.fontSize ? { fontSize: Number(node.fontSize) } : {}),
          ...(node.rotation ? { rotation: Number(node.rotation) } : {}),
        }),
      });
      idMap.set(String(node.id), cell);
    }
    for (const edge of edges) {
      const source = idMap.get(String(edge.fromNodeId));
      const target = idMap.get(String(edge.toNodeId));
      if (!source || !target) continue;
      const base = edgeStyle(edge.kind);
      graph.insertEdge({
        source,
        target,
        value: isNil(edge.label) ? '' : String(edge.label),
        style: {
          ...base,
          ...(edge.edgeStyle ? { edgeStyle: edge.edgeStyle } : {}),
          ...(edge.endArrow ? { endArrow: edge.endArrow } : {}),
          ...(edge.strokeColor ? { strokeColor: edge.strokeColor } : {}),
          ...(edge.strokeWidth && edge.kind !== 'thick'
            ? { strokeWidth: Number(edge.strokeWidth) }
            : {}),
        },
      });
    }
  } finally {
    graph.getDataModel().endUpdate();
  }
}

export function serializeState(graph) {
  const model = flowModelFromGraph(graph);
  const view = graph.getView();
  return {
    version: 3,
    nodes: model.nodes,
    edges: model.edges,
    view: {
      scale: view.scale,
      translate: { x: view.translate.x, y: view.translate.y },
    },
    savedAt: new Date().toISOString(),
  };
}

export function deserializeState(graph, state) {
  if (!state) return false;
  const model =
    state.nodes || state.edges
      ? state
      : state.graph && (state.graph.nodes || state.graph.edges)
        ? state.graph
        : null;
  if (!model) return false;
  loadFlowModel(graph, model);
  // The view transform is intentionally not restored: maxGraph can reject a
  // saved transform while validating a freshly loaded model, and fitting the
  // diagram is the safer, more predictable behaviour.
  return true;
}

export function selectedCells(graph) {
  return graph.getSelectionCells() || [];
}

export function deleteSelection(graph) {
  const cells = selectedCells(graph);
  if (cells.length) graph.removeCells(cells, true);
}

export function duplicateSelection(graph) {
  const cells = graph.getSelectionCells();
  if (!cells.length) return;
  // Group clone + add + offset into one undoable edit.
  graph.batchUpdate(() => {
    const clones = graph.cloneCells(cells);
    graph.addCells(clones, graph.getDefaultParent());
    graph.moveCells(clones, 20, 20);
    graph.setSelectionCells(clones);
  });
}

export function alignSelection(graph, align) {
  const cells = graph.getSelectionCells().filter((cell) => cell.isVertex());
  if (cells.length < 2) return;
  graph.alignCells(align, cells);
}

export function distributeSelection(graph, horizontal) {
  const cells = graph.getSelectionCells().filter((cell) => cell.isVertex());
  if (cells.length < 3) return;
  const entries = cells
    .map((cell) => ({ cell, geometry: cell.geometry }))
    .filter((entry) => entry.geometry)
    .sort((a, b) =>
      horizontal ? a.geometry.x - b.geometry.x : a.geometry.y - b.geometry.y
    );
  const first = entries[0].geometry;
  const last = entries[entries.length - 1].geometry;
  const span = horizontal
    ? last.x + last.width - first.x
    : last.y + last.height - first.y;
  const totalSize = entries.reduce(
    (sum, entry) => sum + (horizontal ? entry.geometry.width : entry.geometry.height),
    0
  );
  const gap = (span - totalSize) / (entries.length - 1);
  let cursor = horizontal ? first.x : first.y;
  graph.getDataModel().beginUpdate();
  try {
    for (const entry of entries) {
      const next = entry.geometry.clone();
      if (horizontal) next.x = Math.round(cursor);
      else next.y = Math.round(cursor);
      graph.getDataModel().setGeometry(entry.cell, next);
      cursor += (horizontal ? next.width : next.height) + gap;
    }
  } finally {
    graph.getDataModel().endUpdate();
  }
}
