import { useEffect, useRef, useState } from 'react';

interface Props {
  code: string;
}

let mermaidModule: typeof import('mermaid').default | null = null;
let initialized = false;

async function getMermaid() {
  if (!mermaidModule) {
    const mod = await import('mermaid');
    mermaidModule = mod.default;
  }
  if (!initialized) {
    mermaidModule.initialize({ startOnLoad: false, theme: 'default' });
    initialized = true;
  }
  return mermaidModule;
}

export function MermaidLazy({ code }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    getMermaid()
      .then((m) => m.render(idRef.current, code))
      .then((rendered) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) return <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>;
  if (!svg) return <div className="text-xs text-muted-foreground">Loading diagram…</div>;
  return <div data-testid="mermaid-output" dangerouslySetInnerHTML={{ __html: svg }} />;
}
