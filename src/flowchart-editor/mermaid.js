/**
 * Mermaid interop for the maxGraph editor.
 *
 * Mermaid is not the editor's model: positions, widths, colours and most
 * shapes have no Mermaid representation. It remains an import/export format
 * for interoperability with the rest of the Markdown workflow.
 */
import mermaidLib from '../flowchart/flowchart-mermaid.js';
import parseLib from '../flowchart/flowchart-mermaid-parse.js';

export const toMermaid = mermaidLib.toMermaid;
export const fromMermaid = parseLib.fromMermaid;

export function flowModelToMermaid(flowModel) {
  return toMermaid(flowModel);
}

export function mermaidToFlowModel(source) {
  return fromMermaid(source);
}
