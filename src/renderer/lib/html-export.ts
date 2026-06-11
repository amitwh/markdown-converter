/**
 * Renderer-side Markdown → HTML export pipeline.
 *
 * Replaces the broken `ipc.export.html` channel (which is not actually
 * implemented in the main process). Produces a single self-contained HTML
 * file with inline CSS so the result opens correctly in any browser.
 */
import { renderMarkdown } from './markdown';
import { applyAsciiTransform } from './ascii-table';

export interface HtmlExportOptions {
  source: string;
  title: string;
  standalone: boolean;
  highlightStyle: 'github' | 'monokai' | 'nord' | 'none';
  renderTablesAsAscii: boolean;
}

const STYLES: Record<HtmlExportOptions['highlightStyle'], string> = {
  github: `
    pre code .hljs-keyword, code .hljs-keyword { color: #d73a49; }
    pre code .hljs-string, code .hljs-string { color: #032f62; }
    pre code .hljs-comment, code .hljs-comment { color: #6a737d; font-style: italic; }
    pre code .hljs-function, code .hljs-function { color: #6f42c1; }
    pre code .hljs-number, code .hljs-number { color: #005cc5; }
  `,
  monokai: `
    pre code .hljs-keyword, code .hljs-keyword { color: #f92672; }
    pre code .hljs-string, code .hljs-string { color: #e6db74; }
    pre code .hljs-comment, code .hljs-comment { color: #75715e; font-style: italic; }
    pre code .hljs-function, code .hljs-function { color: #a6e22e; }
    pre code .hljs-number, code .hljs-number { color: #ae81ff; }
  `,
  nord: `
    pre code .hljs-keyword, code .hljs-keyword { color: #81a1c1; }
    pre code .hljs-string, code .hljs-string { color: #a3be8c; }
    pre code .hljs-comment, code .hljs-comment { color: #616e88; font-style: italic; }
    pre code .hljs-function, code .hljs-function { color: #88c0d0; }
    pre code .hljs-number, code .hljs-number { color: #b48ead; }
  `,
  none: '',
};

const BASE_CSS = `
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #1a1a1a;
    background: #ffffff;
    max-width: 860px;
    margin: 0 auto;
    padding: 40px;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e6e6; background: #1a1a1a; }
    a { color: #6ab7ff; }
    code { background: #2a2a2a; }
    pre { background: #2a2a2a; }
    blockquote { border-left-color: #3a3a3a; color: #b3b3b3; }
    table { border-color: #3a3a3a; }
    th { background: #2a2a2a; }
    th, td { border-color: #3a3a3a; }
  }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.25; }
  h1 { font-size: 2em; border-bottom: 1px solid currentColor; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; }
  code {
    background: #f4f4f4;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: Consolas, Monaco, 'Courier New', monospace;
    font-size: 0.9em;
  }
  pre {
    background: #f5f5f5;
    padding: 1em;
    border-radius: 5px;
    overflow-x: auto;
    line-height: 1.4;
    border: 1px solid #e0e0e0;
    margin: 1em 0;
  }
  pre code { background: transparent; padding: 0; }
  blockquote {
    border-left: 4px solid #ddd;
    margin: 1em 0;
    padding: 0 1em;
    color: #666;
  }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f4f4f4; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; height: auto; }
  hr { border: none; border-top: 1px solid currentColor; opacity: 0.2; margin: 2em 0; }
`;

export function generateHtml(options: HtmlExportOptions): string {
  const { source, title, standalone, highlightStyle, renderTablesAsAscii } = options;
  const transformed = renderTablesAsAscii ? applyAsciiTransform(source) : source;
  const body = renderMarkdown(transformed);

  if (!standalone) {
    return body;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${BASE_CSS}</style>
  <style>${STYLES[highlightStyle]}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );
}
