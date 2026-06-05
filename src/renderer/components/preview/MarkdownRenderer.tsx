import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { MermaidLazy } from './MermaidLazy';

interface Props {
  source: string;
}

const MERMAID_RE = /```mermaid\n([\s\S]*?)```/g;

function extractMermaidCodes(source: string): string[] {
  const codes: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = MERMAID_RE.exec(source)) !== null) {
    codes.push(match[1].trim());
  }
  return codes;
}

export function MarkdownRenderer({ source }: Props) {
  const html = renderMarkdown(source);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mermaidCodes, setMermaidCodes] = useState<string[]>([]);

  // Re-derive mermaid codes from the original source. The renderMarkdown function
  // replaces mermaid blocks with placeholders (data-mermaid-source="${idx}"), but
  // it does not return the actual codes. Rather than thread them through the API,
  // we re-extract from the source. Source is small (single buffer content) so this
  // cost is negligible.
  useEffect(() => {
    setMermaidCodes(extractMermaidCodes(source));
  }, [source]);

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none p-6" ref={containerRef}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {mermaidCodes.map((code, i) => (
        <div key={i} className="my-4">
          <MermaidLazy code={code} />
        </div>
      ))}
    </div>
  );
}
