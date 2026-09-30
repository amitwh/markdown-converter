/**
 * Pure translator: graph → Visio (.vsdx) page1.xml.
 *
 * Generates the page-level XML that the main process wraps with the rest
 * of the OOXML boilerplate and zips into a valid .vsdx file. Edits stay
 * fully editable when opened in Microsoft Visio or vsdx-compatible tools
 * (draw.io, Lucidchart, …).
 *
 * Coordinate system: the editor stores x, y, width, height in SVG pixels
 * with origin top-left and Y growing downward. Visio uses inches with
 * origin bottom-left and Y growing upward. We translate by:
 *
 *   inchesPerPixel = 1 / 72    (72 SVG units per inch)
 *   pinX = (x + width/2) * inchesPerPixel
 *   pinY = pageHeightInches − (y + height/2) * inchesPerPixel
 *
 * `pageHeightInches` is computed from the graph bounds so the page is
 * just tall enough to hold every shape with a half-inch margin.
 *
 * Pure module — no DOM, no globals.
 *
 * @module flowchart-vsdx-export
 */

'use strict';

// v4.13.0 — same default geometry the canvas uses.
const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 60;
const MARGIN_INCHES = 0.5;
const INCHES_PER_PIXEL = 1 / 72;

// XML special characters that must be escaped in attribute / text values.
const XML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function xmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

function nodeWidth(node) {
  return Number(node.width) > 0 ? Number(node.width) : DEFAULT_WIDTH;
}

function nodeHeight(_node) {
  return DEFAULT_HEIGHT;
}

function shapeKindToVisioGeometry(kind) {
  // Visio master shape names. We use generic Shape elements with the
  // matching geometry; downstream tools that ship with these masters
  // (Visio standard, draw.io) recognise the names and render the right
  // shape. Falls back to a plain rectangle for unknown kinds.
  switch (kind) {
    case 'decision':
      return { masterName: 'Decision / Diamond', geometry: 'diamond' };
    case 'terminator':
      return { masterName: 'Terminator / Oval', geometry: 'ellipse' };
    case 'subroutine':
      return { masterName: 'Subroutine', geometry: 'rect' };
    case 'document':
      return { masterName: 'Document', geometry: 'document' };
    case 'process':
    default:
      return { masterName: 'Process', geometry: 'rect' };
  }
}

/**
 * Compute the page bounding box in pixels.
 * Returns { width, height } in pixels; main process scales to inches.
 */
function graphBounds(graph) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  if (nodes.length === 0) {
    return { width: 200, height: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const w = nodeWidth(node);
    const h = nodeHeight(node);
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
    maxY = Math.max(maxY, node.y + h);
  }
  return {
    width: Math.max(maxX - minX, 100),
    height: Math.max(maxY - minY, 100),
  };
}

function shapeForNode(node, pageHeightInches) {
  const w = nodeWidth(node);
  const h = nodeHeight(node);
  const centerXPx = node.x + w / 2;
  const centerYPx = node.y + h / 2;
  const pinX = centerXPx * INCHES_PER_PIXEL;
  const pinY = pageHeightInches - centerYPx * INCHES_PER_PIXEL;
  const widthIn = (w * INCHES_PER_PIXEL).toFixed(3);
  const heightIn = (h * INCHES_PER_PIXEL).toFixed(3);
  const { masterName } = shapeKindToVisioGeometry(node.kind);
  const color = xmlEscape((node.color || '#ffffff').replace(/^#/, '').toUpperCase());
  return (
    `    <Shape ID="${xmlEscape(node.id)}" NameU="${xmlEscape(masterName)}" ` +
    `Name="${xmlEscape(node.label || node.id)}" Type="Shape" ` +
    `LineStyle="0" FillStyle="0" TextStyle="0">\n` +
    `      <XForm>\n` +
    `        <PinX Unit="IN">${pinX.toFixed(3)}</PinX>\n` +
    `        <PinY Unit="IN">${pinY.toFixed(3)}</PinY>\n` +
    `        <Width Unit="IN">${widthIn}</Width>\n` +
    `        <Height Unit="IN">${heightIn}</Height>\n` +
    `      </XForm>\n` +
    `      <Fill Foreground="${color}">\n` +
    `        <FillBkgnd Type="Solid" Value="#FFFFFF"/>\n` +
    `      </Fill>\n` +
    `      <Char IX="0"/>\n` +
    `      <Para IX="0"/>\n` +
    `      <Text>${xmlEscape(node.label || '')}</Text>\n` +
    `    </Shape>`
  );
}

function connectForEdge(edge) {
  // Visio Connects pair shapes via their IDs using BeginX/EndX glue.
  // We connect from shape(fromNodeId).BottomX to shape(toNodeId).TopX.
  return (
    `    <Connect FromSheet="${xmlEscape(edge.fromNodeId)}" ` +
    `FromCell="PinX" FromPart="9" ToSheet="${xmlEscape(edge.toNodeId)}" ` +
    `ToCell="PinX" ToPart="12"/>`
  );
}

/**
 * Build the full page1.xml string for the given graph.
 *
 * @param {object} graph - { nodes: [...], edges: [...] } in editor coords.
 * @returns {string} XML text suitable to drop into the visio/pages/ entry
 *   of the .vsdx zip.
 */
function toVisioPageXml(graph) {
  const bounds = graphBounds(graph);
  const heightIn = (bounds.height * INCHES_PER_PIXEL + MARGIN_INCHES * 2).toFixed(3);
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph && graph.edges) ? graph.edges : [];
  const shapes = nodes.map((n) => shapeForNode(n, Number(heightIn))).join('\n');
  const connects = edges.map(connectForEdge).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
    `  <Shapes>\n${shapes}\n  </Shapes>\n` +
    `  <Connects>\n${connects}\n  </Connects>\n` +
    `</PageContents>\n`
  );
}

/**
 * Build the static boilerplate XML files for the .vsdx container.
 * Returned as a map of zip-path -> string. Caller zips and writes.
 */
function visioBoilerplate() {
  return {
    '[Content_Types].xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
      `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
      `  <Default Extension="xml" ContentType="application/xml"/>\n` +
      `  <Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing+xml"/>\n` +
      `  <Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>\n` +
      `  <Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>\n` +
      `  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>\n` +
      `  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>\n` +
      `</Types>\n`,
    '_rels/.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>\n` +
      `  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>\n` +
      `  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>\n` +
      `</Relationships>\n`,
    'docProps/core.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
      `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:dcterms="http://purl.org/dc/terms/" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n` +
      `  <dc:title>Flowchart</dc:title>\n` +
      `  <dc:creator>MarkdownConverter</dc:creator>\n` +
      `  <cp:lastModifiedBy>MarkdownConverter</cp:lastModifiedBy>\n` +
      `</cp:coreProperties>\n`,
    'docProps/app.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
      `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">\n` +
      `  <Application>MarkdownConverter</Application>\n` +
      `  <Template>Flowchart</Template>\n` +
      `</Properties>\n`,
    'visio/_rels/document.xml.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>\n` +
      `</Relationships>\n`,
    'visio/document.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<VisioDocument xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
      `  <DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0" DefaultGuideStyle="0"/>\n` +
      `  <Colors>\n` +
      `    <ColorEntry IX="0" RGB="#000000"/>\n` +
      `    <ColorEntry IX="1" RGB="#FFFFFF"/>\n` +
      `  </Colors>\n` +
      `  <FaceNames>\n` +
      `    <FaceName ID="1" Name="Arial" UnicodeRanges="0 0 0 0" CharSets="1073742335 -65536" Panos="2 11 6 4 2 2 2 2 2 4" Flags="325"/>\n` +
      `  </FaceNames>\n` +
      `  <StyleSheets>\n` +
      `    <StyleSheet ID="0" NameU="No Style" Name="No Style">\n` +
      `      <Cell N="LineColor" V="0"/>\n` +
      `      <Cell N="LineWeight" V="1.0"/>\n` +
      `      <Cell N="FillForegnd" V="1"/>\n` +
      `      <Cell N="FillBkgnd" V="0"/>\n` +
      `    </StyleSheet>\n` +
      `  </StyleSheets>\n` +
      `  <Pages>\n` +
      `    <Page ID="0" NameU="Flowchart" Name="Flowchart">\n` +
      `      <PageSheet LineStyle="0" FillStyle="0" TextStyle="0">\n` +
      `        <Cell N="PageWidth" V="8.5"/>\n` +
      `        <Cell N="PageHeight" V="11"/>\n` +
      `      </PageSheet>\n` +
      `      <Rel r:id="rId1"/>\n` +
      `    </Page>\n` +
      `  </Pages>\n` +
      `</VisioDocument>\n`,
    'visio/pages/_rels/pages.xml.rels':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
      `  <Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>\n` +
      `</Relationships>\n`,
    'visio/pages/pages.xml':
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Pages xmlns="http://schemas.microsoft.com/office/visio/2012/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n` +
      `  <Page ID="0" NameU="Flowchart" Name="Flowchart" ViewScale="-1" ViewCenterX="4.25" ViewCenterY="5.5">\n` +
      `    <Rel r:id="rId1"/>\n` +
      `  </Page>\n` +
      `</Pages>\n`,
  };
}

if (typeof module === 'object' && module.exports) {
  module.exports = { toVisioPageXml, visioBoilerplate, graphBounds };
}
if (typeof window !== 'undefined') {
  window.FlowchartVsdxExport = { toVisioPageXml, visioBoilerplate, graphBounds };
}
