/**
 * SVG / PNG / JPEG export for the maxGraph editor.
 *
 * maxGraph renders an SVG DOM; `ImageExport` draws the model into a fresh
 * SVG canvas (selection handles and guides are editor chrome, not model
 * cells, so they never appear in the export).
 */
import { ImageExport, SvgCanvas2D } from '@maxgraph/core';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export function graphToSvg(graph, { margin = 24, background = '#ffffff' } = {}) {
  const bounds = graph.getGraphBounds();
  const width = Math.max(1, Math.ceil(bounds.width + margin * 2));
  const height = Math.max(1, Math.ceil(bounds.height + margin * 2));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', XLINK_NS);
  svg.setAttribute('version', '1.1');
  svg.setAttribute('width', `${width}px`);
  svg.setAttribute('height', `${height}px`);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (background && background !== 'none') {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', background);
    svg.appendChild(rect);
  }

  const canvas = new SvgCanvas2D(svg, false);
  canvas.translate(margin - bounds.x, margin - bounds.y);
  const imageExport = new ImageExport();
  imageExport.drawState(graph.getView().getState(graph.getDataModel().getRoot()), canvas);

  return {
    svg: new XMLSerializer().serializeToString(svg),
    width,
    height,
  };
}

export function svgToDataUrl(svg, width, height, mime = 'image/png', scale = 2) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        if (mime === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.92 : undefined));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('failed to rasterise SVG'));
    };
    img.src = url;
  });
}
