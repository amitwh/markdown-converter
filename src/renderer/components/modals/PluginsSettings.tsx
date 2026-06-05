import { Sparkles } from 'lucide-react';

export function PluginsSettings() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
      <Sparkles className="h-8 w-8 opacity-50" />
      <h3 className="text-base font-semibold text-foreground">Coming soon</h3>
      <p className="max-w-sm text-sm">
        The plugin system is on the roadmap. You'll be able to extend MarkdownConverter with custom
        commands, themes, and export formats.
      </p>
    </div>
  );
}
