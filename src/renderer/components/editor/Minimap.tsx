interface Props {
  content: string;
  scrollRatio?: number;       // 0-1, where the viewport is
  visibleRatio?: number;      // 0-1, what fraction of content is visible
}

export function Minimap({ content, scrollRatio = 0, visibleRatio = 1 }: Props) {
  const lines = content.split('\n');
  // Compute viewport position in the minimap
  const viewportTop = Math.round(scrollRatio * 100);
  const viewportHeight = Math.round(visibleRatio * 100);

  return (
    <div
      data-testid="minimap"
      className="pointer-events-none absolute right-0 top-0 h-full w-[100px] overflow-hidden border-l border-border bg-card/30 p-1 font-mono text-[6px] leading-[8px] text-muted-foreground"
      aria-hidden="true"
    >
      <pre className="w-full truncate whitespace-pre">
        {lines.map((line, i) => (
          <div key={i} data-testid="minimap-line">
            {line || ' '}
          </div>
        ))}
      </pre>
      <div
        data-testid="minimap-viewport"
        className="pointer-events-none absolute left-0 right-0 bg-brand/15"
        style={{ top: `${viewportTop}%`, height: `${Math.max(viewportHeight, 5)}%` }}
      />
    </div>
  );
}