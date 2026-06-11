import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: false,
});

const MERMAID_RE = /```mermaid\n([\s\S]*?)```/g;

export function renderMarkdown(source: string): string {
  // Mark mermaid blocks with a placeholder we can replace client-side.
  const placeholders: string[] = [];
  const withPlaceholders = source.replace(MERMAID_RE, (_m, code) => {
    const idx = placeholders.length;
    placeholders.push(code.trim());
    return `<div class="mermaid-block" data-mermaid-source="${idx}"></div>`;
  });

  const rawHtml = marked.parse(withPlaceholders, { async: false }) as string;
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'class',
      'data-mermaid-source',
      'data-language',
      'id',
    ],
  });

  // The sanitized HTML still has placeholders; we leave the actual mermaid
  // rendering to the React layer (MermaidLazy component) so the heavy
  // mermaid library only loads when needed.
  return clean;
}
