/**
 * Flowchart shape library for the maxGraph editor.
 *
 * Each entry maps a toolbar palette item to a maxGraph cell style and to the
 * closest Mermaid node kind, so Mermaid import/export degrades gracefully.
 */
import { AbstractPathShape, Shape, ShapeRegistry } from '@maxgraph/core';

const DEFAULT_W = 140;
const DEFAULT_H = 64;

class DocumentShape extends AbstractPathShape {
  redrawPath(c, _x, _y, w, h) {
    const fold = Math.min(h * 0.18, 16);
    c.moveTo(0, 0);
    c.lineTo(w, 0);
    c.lineTo(w, h - fold);
    c.quadTo(w * 0.75, h, w * 0.5, h - fold);
    c.quadTo(w * 0.25, h - 2 * fold, 0, h - fold);
    c.close();
  }
}

class DataShape extends AbstractPathShape {
  redrawPath(c, _x, _y, w, h) {
    const skew = Math.min(w * 0.2, 26);
    c.moveTo(skew, 0);
    c.lineTo(w, 0);
    c.lineTo(w - skew, h);
    c.lineTo(0, h);
    c.close();
  }
}

class ManualInputShape extends AbstractPathShape {
  redrawPath(c, _x, _y, w, h) {
    const slant = Math.min(h * 0.3, 18);
    c.moveTo(0, slant);
    c.lineTo(w, 0);
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.close();
  }
}

class DelayShape extends AbstractPathShape {
  redrawPath(c, _x, _y, w, h) {
    const r = h / 2;
    c.moveTo(0, 0);
    c.lineTo(w - r, 0);
    c.quadTo(w, 0, w, h / 2);
    c.quadTo(w, h, w - r, h);
    c.lineTo(0, h);
    c.close();
  }
}

class SubprocessShape extends Shape {
  paintBackground(c, x, y, w, h) {
    c.rect(x, y, w, h);
    c.fillAndStroke();
  }

  paintForeground(c, x, y, w, h) {
    const inset = Math.min(14, w * 0.12);
    c.begin();
    c.moveTo(x + inset, y);
    c.lineTo(x + inset, y + h);
    c.moveTo(x + w - inset, y);
    c.lineTo(x + w - inset, y + h);
    c.stroke();
  }
}

let registered = false;

export function registerFlowShapes() {
  if (registered) return;
  ShapeRegistry.add('flowDocument', DocumentShape);
  ShapeRegistry.add('flowData', DataShape);
  ShapeRegistry.add('flowManualInput', ManualInputShape);
  ShapeRegistry.add('flowDelay', DelayShape);
  ShapeRegistry.add('flowSubprocess', SubprocessShape);
  registered = true;
}

/**
 * Palette definitions. `style` is merged into the default vertex style.
 */
export const SHAPES = [
  {
    id: 'startEnd',
    label: 'Start / End',
    shape: 'ellipse',
    mermaidKind: 'terminator',
    width: 120,
    height: 56,
  },
  {
    id: 'process',
    label: 'Process',
    shape: 'rectangle',
    mermaidKind: 'process',
    width: DEFAULT_W,
    height: DEFAULT_H,
  },
  {
    id: 'decision',
    label: 'Decision',
    shape: 'rhombus',
    mermaidKind: 'decision',
    width: 150,
    height: 90,
  },
  {
    id: 'document',
    label: 'Document',
    shape: 'flowDocument',
    mermaidKind: 'document',
    width: DEFAULT_W,
    height: 72,
  },
  {
    id: 'data',
    label: 'Data',
    shape: 'flowData',
    mermaidKind: 'process',
    width: DEFAULT_W,
    height: DEFAULT_H,
  },
  {
    id: 'subprocess',
    label: 'Subprocess',
    shape: 'flowSubprocess',
    mermaidKind: 'subroutine',
    width: 154,
    height: DEFAULT_H,
  },
  {
    id: 'database',
    label: 'Database',
    shape: 'cylinder',
    mermaidKind: 'process',
    width: 120,
    height: 72,
  },
  {
    id: 'manualInput',
    label: 'Manual Input',
    shape: 'flowManualInput',
    mermaidKind: 'process',
    width: DEFAULT_W,
    height: DEFAULT_H,
  },
  {
    id: 'delay',
    label: 'Delay',
    shape: 'flowDelay',
    mermaidKind: 'process',
    width: 132,
    height: DEFAULT_H,
  },
  {
    id: 'connector',
    label: 'Connector',
    shape: 'ellipse',
    mermaidKind: 'terminator',
    width: 44,
    height: 44,
  },
  {
    id: 'text',
    label: 'Text',
    shape: 'label',
    mermaidKind: 'process',
    width: 140,
    height: 40,
    style: { fillColor: 'none', strokeColor: 'none', fontSize: 13 },
  },
];

const BY_ID = new Map(SHAPES.map((shape) => [shape.id, shape]));
const BY_MERMAID = new Map();
for (const shape of SHAPES) {
  if (!BY_MERMAID.has(shape.mermaidKind)) BY_MERMAID.set(shape.mermaidKind, shape);
}

export function getShape(id) {
  return BY_ID.get(id) || BY_ID.get('process');
}

export function shapeForMermaidKind(kind) {
  return BY_MERMAID.get(kind) || BY_ID.get('process');
}

export function shapeIdForStyle(style = {}) {
  if (style.flowKind && BY_ID.has(style.flowKind)) return style.flowKind;
  const byShape = SHAPES.find((shape) => shape.shape === style.shape);
  return byShape ? byShape.id : 'process';
}
