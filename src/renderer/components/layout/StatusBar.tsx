export function StatusBar() {
  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-card/20 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>0 words</span>
        <span>UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Ln 1, Col 1</span>
        <span>Markdown</span>
      </div>
    </footer>
  );
}